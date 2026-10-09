import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GEMINI_KEY: z.string().optional(),
  GEMINI_LITE: z.string().optional(),
  GEMINI_FLASH: z.string().optional(),
  OPENROUTER_KEY: z.string().optional(),
  OPENROUTER_MODELS: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((m) => m.trim()).filter(Boolean) : [])),
  CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  // Docker Desktop (macOS/Windows) cannot route to container IPs; relay the app port to 127.0.0.1.
  DOCKER_PUBLISH_PORTS: bool('false'),
  // Local development only: lets projects use file:// repo URLs (e.g. the sample repo).
  ALLOW_FILE_REPOS: bool('false'),
  WORK_ROOT: z.string().default(join(homedir(), '.bugswarm', 'work')),
  // `--config auto` requires sending metrics to Semgrep; a registry ruleset does not.
  SEMGREP_CONFIG: z.string().default('p/default'),
  SANDBOX_IMAGE: z.string().default('node:20-slim'),
  // Extra kernel isolation for untrusted code, e.g. "runsc" (gVisor). Empty = Docker's default runtime.
  SANDBOX_RUNTIME: z
    .string()
    .regex(/^[a-z0-9_-]*$/)
    .default(''),
  // Housekeeping: evidence files and AI cache entries older than this are deleted.
  EVIDENCE_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  LLM_CACHE_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  // Overridable so tests can point the AI clients at a local mock server.
  GEMINI_BASE_URL: z.url().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  AI_BACKOFF_MS: z.coerce.number().int().min(0).default(2_000),
  // Caps explainer work per run (25 bugs per batch) so a huge first scan cannot eat the run budget.
  EXPLAIN_MAX_BATCHES: z.coerce.number().int().min(0).default(20),
  // Uncached AI review calls per run (cached files are free); generated-test files per run.
  REVIEW_MAX_CALLS: z.coerce.number().int().min(0).default(20),
  TESTGEN_MAX_FILES: z.coerce.number().int().min(0).default(5),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

/** Hard limits from the spec. */
export const LIMITS = {
  installMs: 5 * 60_000,
  appStartMs: 2 * 60_000,
  testerMs: 10 * 60_000,
  runMs: 30 * 60_000,
  gitMs: 5 * 60_000,
  queueVisibilitySec: 1800,
  idleSleepMs: 2_000,
} as const;
