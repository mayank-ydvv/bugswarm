import OpenAI, { APIError } from 'openai';
import type { Config } from './config.ts';
import { sleep } from './exec.ts';

export type AiKind = 'explain' | 'review' | 'testgen';
export type Provider = 'gemini' | 'openrouter';

/** runs.ai_usage: { "<provider>:<model>": { calls, prompt_tokens, completion_tokens } } */
export type AiUsage = Record<string, { calls: number; prompt_tokens: number; completion_tokens: number }>;

/** Thrown when every provider failed; the caller leaves the work for the next run. */
export class AiUnavailable extends Error {
  readonly retryLater = true;
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailable';
  }
}

const MAX_GEMINI_ATTEMPTS = 5;

export interface AiClient {
  readonly enabled: boolean;
  chatJSON<T = unknown>(kind: AiKind, system: string, user: string, usage: AiUsage): Promise<T>;
}

/** Free models may wrap JSON in prose or code fences: take the outermost object. */
export function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new SyntaxError('no JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
}

function record(usage: AiUsage, provider: Provider, model: string, res: OpenAI.Chat.ChatCompletion) {
  const key = `${provider}:${res.model || model}`;
  const entry = (usage[key] ??= { calls: 0, prompt_tokens: 0, completion_tokens: 0 });
  entry.calls += 1;
  entry.prompt_tokens += res.usage?.prompt_tokens ?? 0;
  entry.completion_tokens += res.usage?.completion_tokens ?? 0;
}

/** Rate limits and transient server errors are worth waiting for; bad keys and bad requests are not. */
function retryable(err: unknown): boolean {
  return err instanceof APIError && (err.status === 429 || (err.status !== undefined && err.status >= 500));
}

function describe(err: unknown): string {
  if (err instanceof APIError) return `HTTP ${err.status ?? '?'} ${err.message.split('\n')[0]}`;
  return err instanceof Error ? err.message : String(err);
}

export function createAi(config: Config, log: (m: string) => void = () => {}): AiClient {
  const gemini =
    config.GEMINI_KEY && config.GEMINI_LITE && config.GEMINI_FLASH
      ? new OpenAI({ apiKey: config.GEMINI_KEY, baseURL: config.GEMINI_BASE_URL, maxRetries: 0, timeout: 120_000 })
      : null;
  const openrouter =
    config.OPENROUTER_KEY && config.OPENROUTER_MODELS.length > 0
      ? new OpenAI({ apiKey: config.OPENROUTER_KEY, baseURL: config.OPENROUTER_BASE_URL, maxRetries: 0, timeout: 120_000 })
      : null;

  const pickModel = (kind: AiKind) => (kind === 'explain' ? config.GEMINI_LITE! : config.GEMINI_FLASH!);

  async function callGemini(model: string, system: string, user: string, usage: AiUsage): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS; attempt++) {
      try {
        const res = await gemini!.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        });
        record(usage, 'gemini', model, res);
        log(`ai: gemini ${model} served (attempt ${attempt + 1})`);
        return res.choices[0]?.message.content ?? '';
      } catch (err) {
        lastErr = err;
        if (!retryable(err) || attempt === MAX_GEMINI_ATTEMPTS - 1) break;
        const wait = config.AI_BACKOFF_MS * 2 ** attempt;
        log(`ai: gemini ${model} ${describe(err)}; retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
    throw lastErr;
  }

  async function viaGemini<T>(kind: AiKind, system: string, user: string, usage: AiUsage): Promise<T> {
    const model = pickModel(kind);
    const text = await callGemini(model, system, user, usage);
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      // Flash-Lite occasionally returns malformed JSON; Flash is more reliable. One retry only.
      if (kind !== 'explain' || !(err instanceof SyntaxError)) throw err;
      log('ai: Flash-Lite returned invalid JSON, retrying once with Flash');
      return JSON.parse(await callGemini(config.GEMINI_FLASH!, system, user, usage)) as T;
    }
  }

  async function viaOpenRouter<T>(system: string, user: string, usage: AiUsage): Promise<T> {
    const [model, ...rest] = config.OPENROUTER_MODELS;
    // `models` makes OpenRouter fall through the list on rate limits or downtime.
    const body = {
      model: model!,
      models: [model!, ...rest],
      messages: [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user },
      ],
      temperature: 0.2,
    };
    const res = await openrouter!.chat.completions.create(
      body as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );
    record(usage, 'openrouter', model!, res);
    log(`ai: openrouter ${res.model || model} served`);
    return parseJsonObject(res.choices[0]?.message.content ?? '') as T;
  }

  return {
    enabled: Boolean(gemini || openrouter),
    async chatJSON<T>(kind: AiKind, system: string, user: string, usage: AiUsage): Promise<T> {
      let geminiError: unknown = 'not configured';
      if (gemini) {
        try {
          return await viaGemini<T>(kind, system, user, usage);
        } catch (err) {
          geminiError = err;
          log(`ai: gemini failed: ${describe(err)}`);
        }
      }
      if (openrouter) {
        try {
          return await viaOpenRouter<T>(system, user, usage);
        } catch (err) {
          throw new AiUnavailable(`gemini: ${describe(geminiError)}; openrouter: ${describe(err)}`);
        }
      }
      throw new AiUnavailable(`gemini: ${describe(geminiError)}; openrouter: not configured`);
    },
  };
}
