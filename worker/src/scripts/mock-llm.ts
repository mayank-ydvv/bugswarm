/**
 * Local OpenAI-compatible mock for testing the AI fallback without real keys.
 *   /gemini/...      behaves per `geminiMode`: 'invalid-key' (HTTP 400), 'rate-limit' (HTTP 429),
 *                    'bad-json' (malformed JSON), or 'ok'
 *   /openrouter/...  always answers, wrapping the JSON in prose + a code fence like free models do
 * CLI: node src/scripts/mock-llm.ts <port> <geminiMode>
 */
import { createServer, type Server } from 'node:http';

export type GeminiMode = 'invalid-key' | 'rate-limit' | 'bad-json' | 'ok';

interface InputBug {
  id: number;
  category: string;
  location?: string;
  tool_output?: string;
}

export interface MockStats {
  gemini: number;
  openrouter: number;
  models: string[];
}

function explain(bugs: InputBug[]) {
  return {
    bugs: bugs.map((b) => ({
      id: b.id,
      title: `Plain-English: ${(b.tool_output ?? b.category).slice(0, 50)}`,
      summary: `This ${b.category} problem at ${b.location ?? 'an unknown place'} breaks expected behaviour. It matters because users or developers will hit it.`,
      severity: b.category === 'security' ? 'critical' : 'bogus-severity',
      expected: 'The code should work without this error.',
    })),
  };
}

/** Review: flags the line that returns the undefined `totl` in the sample cart. */
function reviewAnswer(user: string) {
  const lines = user.split('\n');
  const hit = lines.findIndex((l) => /return totl\b/.test(l));
  if (hit === -1) return { findings: [] };
  const line = Number(lines[hit]!.split(':')[0]);
  return {
    findings: [
      { line, title: 'cartTotal returns an undefined variable', explanation: 'It returns `totl` instead of `total`, so every call throws a ReferenceError.' },
    ],
  };
}

/** Testgen: a node:test file for the sample cart's cartTotal export. */
function testgenAnswer(input: { import_path?: string; code?: string }) {
  if (!input.code?.includes('export function cartTotal')) return { tests: '' };
  return {
    tests: [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      `import { cartTotal } from '${input.import_path}';`,
      '',
      "test('cartTotal multiplies price by quantity', () => {",
      '  assert.equal(cartTotal([{ price: 2, qty: 3 }, { price: 1, qty: 4 }]), 10);',
      '});',
      '',
    ].join('\n'),
  };
}

function answer(system: string, user: string): unknown {
  if (system.includes('reviewing ONE source file')) return reviewAnswer(user);
  if (system.includes('unit tests')) return testgenAnswer(JSON.parse(user) as { import_path?: string; code?: string });
  const bugs = (JSON.parse(user) as { bugs?: InputBug[] }).bugs ?? [];
  return explain(bugs);
}

function completion(model: string, content: string) {
  return {
    id: 'mock',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

export function startMockLlm(port: number, geminiMode: GeminiMode): Promise<{ server: Server; stats: MockStats }> {
  const stats: MockStats = { gemini: 0, openrouter: 0, models: [] };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        handle();
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    const handle = () => {
      const body = JSON.parse(raw || '{}') as { model: string; models?: string[]; messages: { role: string; content: string }[] };
      const user = body.messages?.find((m) => m.role === 'user')?.content ?? '{}';
      const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.url?.startsWith('/gemini/')) {
        stats.gemini++;
        // Keys starting with ws-valid- always work, so tests can tell a workspace key from the server key.
        const workspaceKey = /^Bearer ws-valid-/.test(req.headers.authorization ?? '');
        if (geminiMode === 'invalid-key' && !workspaceKey) {
          return send(400, [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }]);
        }
        if (geminiMode === 'rate-limit') {
          return send(429, [{ error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }]);
        }
        if (geminiMode === 'bad-json' && body.model.includes('lite')) {
          return send(200, completion(body.model, '{"bugs": [ oops'));
        }
        return send(200, completion(body.model, JSON.stringify(answer(system, user))));
      }
      if (req.url?.startsWith('/openrouter/')) {
        stats.openrouter++;
        stats.models.push(...(body.models ?? []));
        const content = `Sure! Here is the JSON:\n\`\`\`json\n${JSON.stringify(answer(system, user))}\n\`\`\``;
        return send(200, completion(body.model, content));
      }
      send(404, { error: 'not found' });
    };
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, stats })));
}

if (import.meta.filename === process.argv[1]) {
  const port = Number(process.argv[2] ?? 4010);
  const mode = (process.argv[3] ?? 'invalid-key') as GeminiMode;
  const { stats } = await startMockLlm(port, mode);
  console.log(`mock LLM on :${port}, gemini mode=${mode}`);
  setInterval(() => console.log(`calls: gemini=${stats.gemini} openrouter=${stats.openrouter}`), 15_000).unref?.();
}
