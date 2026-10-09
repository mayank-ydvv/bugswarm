import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createAi, parseJsonObject, type AiUsage } from './ai.ts';
import { loadConfig } from './config.ts';
import { validateExplanations } from './explainer.ts';
import { startMockLlm, type GeminiMode } from './scripts/mock-llm.ts';

let port = 4500;
const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function setup(mode: GeminiMode, withOpenRouter = true) {
  const p = port++;
  const { server, stats } = await startMockLlm(p, mode);
  servers.push(server);
  const config = loadConfig({
    DATABASE_URL: 'postgres://x',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(30),
    GEMINI_KEY: 'test',
    GEMINI_LITE: 'gemini-lite-test',
    GEMINI_FLASH: 'gemini-flash-test',
    GEMINI_BASE_URL: `http://127.0.0.1:${p}/gemini/`,
    OPENROUTER_BASE_URL: `http://127.0.0.1:${p}/openrouter/`,
    ...(withOpenRouter ? { OPENROUTER_KEY: 'test', OPENROUTER_MODELS: 'a/one:free, b/two:free' } : {}),
    AI_BACKOFF_MS: '1',
  });
  return { ai: createAi(config), stats };
}

const USER = JSON.stringify({ bugs: [{ id: 1, category: 'security', tool_output: 'eval used' }] });

test('gemini serves when healthy', async () => {
  const { ai, stats } = await setup('ok');
  const usage: AiUsage = {};
  const out = await ai.chatJSON<{ bugs: unknown[] }>('explain', 'sys', USER, usage);
  assert.equal(out.bugs.length, 1);
  assert.deepEqual(Object.keys(usage), ['gemini:gemini-lite-test']);
  assert.equal(stats.openrouter, 0);
});

test('invalid gemini key falls back to openrouter immediately', async () => {
  const { ai, stats } = await setup('invalid-key');
  const usage: AiUsage = {};
  const out = await ai.chatJSON<{ bugs: unknown[] }>('explain', 'sys', USER, usage);
  assert.equal(out.bugs.length, 1);
  assert.equal(stats.gemini, 1, 'a bad key is not retried');
  assert.deepEqual(usage['openrouter:a/one:free'], { calls: 1, prompt_tokens: 100, completion_tokens: 50 });
  assert.deepEqual(stats.models, ['a/one:free', 'b/two:free'], 'sends the models list for OpenRouter fallback');
});

test('gemini 429 is retried 5 times with backoff, then openrouter', async () => {
  const { ai, stats } = await setup('rate-limit');
  const usage: AiUsage = {};
  await ai.chatJSON('explain', 'sys', USER, usage);
  assert.equal(stats.gemini, 5);
  assert.equal(stats.openrouter, 1);
});

test('bad JSON from Flash-Lite is retried once with Flash', async () => {
  const { ai, stats } = await setup('bad-json');
  const usage: AiUsage = {};
  const out = await ai.chatJSON<{ bugs: unknown[] }>('explain', 'sys', USER, usage);
  assert.equal(out.bugs.length, 1);
  assert.equal(stats.gemini, 2);
  assert.ok(usage['gemini:gemini-flash-test']);
});

test('all providers failing throws retryLater', async () => {
  const { ai } = await setup('invalid-key', false);
  await assert.rejects(ai.chatJSON('explain', 'sys', USER, {}), (e: { retryLater?: boolean }) => e.retryLater === true);
});

test('parseJsonObject extracts JSON from prose and fences', () => {
  assert.deepEqual(parseJsonObject('Here:\n```json\n{"a":{"b":1}}\n```\nThanks'), { a: { b: 1 } });
  assert.throws(() => parseJsonObject('no json here'));
});

test('validateExplanations keeps batch ids only and defaults bad severities', () => {
  const batch = new Map([
    [1, { severity: 'high' as const }],
    [2, { severity: 'low' as const }],
  ]);
  const out = validateExplanations(
    {
      bugs: [
        { id: 1, title: 'A'.repeat(200), summary: 's', severity: 'CRITICAL', expected: 'e' },
        { id: 2, title: 't', summary: 's', severity: 'urgent' },
        { id: 99, title: 't', summary: 's', severity: 'low' },
        { id: 1, title: 'dup', summary: 's', severity: 'low' },
        { id: 3 },
      ],
    },
    batch,
  );
  assert.equal(out.length, 2);
  assert.equal(out[0]!.severity, 'critical');
  assert.equal(out[0]!.title.length, 80);
  assert.equal(out[1]!.severity, 'low', 'invalid severity keeps the default');
  assert.equal(out[1]!.expected, null);
  assert.deepEqual(validateExplanations({ nope: 1 }, batch), []);
});
