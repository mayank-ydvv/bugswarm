# BugSwarm

**Live site: [bugswarm.vercel.app](https://bugswarm.vercel.app)**

Add a project (GitHub repo and/or live URL) and a swarm of automated testers keeps testing it. It finds
bugs, lists them in plain English, and gives each one a ready-to-paste Claude Code fix prompt.

**Status: all 4 phases done.** A user adds a project (a GitHub repo and/or a live URL). Ten testers
run in parallel on every run, triggered by **Run now**, a **GitHub push**, or a **schedule** (hourly or
nightly, via pg_cron):

- **Static:** ESLint, tsc, Semgrep, Gitleaks, OSV-Scanner.
- **Live app:** a Playwright crawler, Lighthouse, axe.
- **AI:** code review and test generation.

Bugs are deduped, auto-fixed when they disappear, and auto-verified on the next full scan. An AI
explainer writes plain-English titles and fix prompts, using Gemini first with OpenRouter as fallback,
or the workspace's own Gemini key. Everything updates live.

```
web/        Next.js 15 App Router + Tailwind v4 + shadcn/ui   (http://localhost:3400)
worker/     Node 20 + TypeScript: queue loop, sandbox, testers
supabase/   config.toml, migrations/ (source of truth), seed.sql, tests/phase1_checks.sql
samples/buggy-app/   deliberately buggy app to point BugSwarm at
```

## Prerequisites

- Node 20+ (Node 22.6+ runs the TypeScript unit tests natively) and pnpm.
- Docker Desktop, running. Local Supabase runs in Docker, and later phases use it as the sandbox.

## Setup

```bash
pnpm install
pnpm db:start          # first run pulls the Supabase images (a few minutes)
cp .env.example .env   # then paste ANON_KEY and SERVICE_ROLE_KEY from `pnpm supabase status`
pnpm db:reset          # applies supabase/migrations + seed.sql
pnpm dev               # http://localhost:3400
pnpm sample:init       # local git repo of samples/buggy-app, wired to the seeded project
pnpm dev:worker        # in a second terminal
```

The Playwright tester needs Chromium on the worker host. Install it once with
`pnpm --filter worker exec playwright install chromium`.

The first worker run pulls these images (about 2 GB): `node:20-slim`, `semgrep/semgrep`,
`zricethezav/gitleaks` and `ghcr.io/google/osv-scanner`. To pull them ahead of time:

```bash
for i in node:20-slim semgrep/semgrep zricethezav/gitleaks ghcr.io/google/osv-scanner; do docker pull $i; done
```

Demo login (seeded, local only): `demo@bugswarm.test` / `demo-650ddeefaef9`. Or create an account on the
landing page. Email confirmation is off locally; sent mail shows up in Mailpit at http://127.0.0.1:54324.
Supabase Studio is at http://127.0.0.1:54323.

### GitHub sign-in (optional)

1. Create a GitHub OAuth app at github.com → Settings → Developer settings → OAuth Apps.
   - Homepage URL: `http://localhost:3400`
   - Authorization callback URL: `http://127.0.0.1:54321/auth/v1/callback`
2. Put its id and secret in `.env` as `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` / `_SECRET`.
3. Set `enabled = true` under `[auth.external.github]` in `supabase/config.toml`.
4. Restart: `pnpm supabase stop && pnpm db:start`.

## Commands

| Command          | What it does                                                                  |
|------------------|-------------------------------------------------------------------------------|
| `pnpm dev`       | Web app on :3400                                                              |
| `pnpm db:reset`  | Recreate the local DB from migrations + seed                                  |
| `pnpm db:types`  | Regenerate `web/lib/database.types.ts` after a migration                      |
| `pnpm db:check`  | SQL checks: RLS, `start_run` dedupe/forbidden/anon, queue (rolls back)        |
| `pnpm test`      | Unit tests (`node --test`)                                                    |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | All workspaces                                   |

## How a run is queued (Phase 1)

`POST /api/runs {projectId, full?}` (zod-validated) calls `start_run(p, 'manual', full)` with the user's
session. `start_run` is a `security definer` function:

- **Access:** callers must be the service role, or an owner or member of the project's workspace. Anyone else gets `forbidden`, and `anon` can't execute it at all.
- **Dedupe:** if the project already has a queued or running run, that run's id is returned and nothing new is queued. A unique partial index `runs_active_idx` makes this race-free.
- **Queueing:** otherwise it inserts the run and calls `pgmq.send('runs', {run_id})`.

The dashboard subscribes to `runs` over Realtime. Run now stays disabled while a run is active, and status
and per-tester progress update live.

## How a run executes (Phase 2)

1. **Claim.** The worker reads one message with `pgmq.read('runs', 1800, 1)` and moves the run to `running`.
   - If a message is delivered again after the 30-minute visibility timeout, the previous worker died. The new worker takes the run over instead of leaving it stuck.
   - The message is always deleted in `finally`.
2. **Checkout.** The repo is cloned, or fetched and hard-reset, into `WORK_ROOT/<projectId>`.
   - The changed files are `git diff --name-only --no-renames <last_scanned_sha> HEAD`.
   - It falls back to a full scan when there's no previous commit, the diff fails, or the user asked for a full scan.
   - The run records the scope it actually used.
3. **Install.** Dependencies install in `node:20-slim` with `--ignore-scripts`, with a 5-minute limit.
   - Install is skipped when `node_modules` exists and no lockfile or `package.json` changed.
   - A failed install doesn't fail the run. ESLint and tsc skip; the other testers still run.
4. **Testers run in parallel** (`Promise.allSettled`, 10 minutes each, 30 minutes for the whole run).
   - Each tester's findings are normalized, fingerprinted, and deduped with a Map, then written in one bulk `INSERT … ON CONFLICT` statement.
   - `runs.testers` gets `done`, `skipped` or `failed` per tester.
5. **Auto-fix.** Open bugs not seen in this run are marked fixed, but only for testers that completed. On incremental runs, only bugs in changed files are touched.
   - A fixed bug that shows up again is reopened as a regression. Ignored bugs stay ignored.
6. **Advance.** `last_scanned_sha` advances only if no tester failed.

| Tester | Where it runs | Scope |
|---|---|---|
| lighthouse | Playwright's Chromium over CDP | full scans only. Up to 5 crawled pages; reports a performance score under 50 and poor LCP, CLS or render-blocking audits |
| axe | axe-core injected with Playwright | crawled pages (up to 15); serious and critical violations, one finding per rule per page |
| review | AI (Gemini Flash), `llm_cache` | changed files plus their direct imports; every tracked source file on full scans. Cached by sha256(prompt version + content), so repeats are free. Skips files with more than 10 tool findings. At most `REVIEW_MAX_CALLS` uncached calls per run |
| testgen | AI writes tests; they run in the sandbox (no network) with the project's runner (vitest, jest, or node:test) | changed files (up to `TESTGEN_MAX_FILES` on full scans). Failing assertions become bugs, with the output and the generated test as evidence |
| playwright | host Chromium against the sandboxed app (or the live URL) | BFS crawl of the same origin: 50 pages on full scans, 15 on incremental. Reports console errors, uncaught exceptions, HTTP ≥ 400, buttons that throw when clicked (up to 10 per page; destructive labels and links are skipped), and iPhone 13 horizontal overflow. Screenshots go to Storage. |
| eslint | sandbox container, no network, repo read-only (repo config is untrusted code) | changed JS/TS files; everything on full scans |
| tsc | sandbox container, no network | whole project (types cross files) |
| semgrep | `semgrep/semgrep`, repo read-only, `SEMGREP_CONFIG` (default `p/default`) | changed files; everything on full scans |
| gitleaks | `zricethezav/gitleaks`, no network, `--redact` | working tree minus node_modules/.git; stores rule/file/line only |
| osv | `ghcr.io/google/osv-scanner`, repo read-only | full scans, or when a lockfile changed |

**Live app** (used from Phase 3): the app runs detached on the `--internal` Docker network `bsnet`, so it
has no internet access. With `DOCKER_PUBLISH_PORTS=true` (macOS/Windows), a small relay container
publishes it on `127.0.0.1:<random port>`.

To check that the app starts, is reachable, has no internet, and gets cleaned up, run:

```bash
cd worker && node --env-file=../.env src/scripts/sandbox-smoke.ts <projectId>
```

## Continuous testing (Phase 4)

- **Schedules.** `enqueue_scheduled(freq)` is one set-based INSERT … SELECT plus one `pgmq.send_batch`. It skips projects with an active run.
  - pg_cron calls it at `7 * * * *` (hourly) and `13 2 * * *` (nightly, 02:13 UTC = 07:43 IST).
  - Nightly runs are full scans; hourly and push runs are incremental.
  - **An hourly run with no new commits and no live URL finishes after the git fetch, without Docker** (measured: 88 ms, zero containers created).
- **GitHub webhook** (`POST /api/github/webhook`):
  - Each project has its own secret (Project settings → Scan on every push, with copy buttons and Rotate). The column is hidden from clients; owners and members read it through `project_webhook_secret()`.
  - Verifies `x-hub-signature-256` with HMAC-SHA256 and `timingSafeEqual`, checking lengths first, against each matching project's secret. A push starts runs only for the projects whose secret signed it. Optional `GH_WEBHOOK_SECRET` is an operator-wide secret that matches every project.
  - Accepts `push` events only, and matches projects by clone or HTML URL plus branch.
  - Starts an incremental `push` run with the service-role client.
- **Scoped auto-fix.**
  - A tester that covers only part of the repo (AI review, testgen) declares its files with `setScope`, so missing coverage never "fixes" bugs it didn't look at.
  - Crashed or skipped testers fix nothing.
- **Auto-verify.** On a full scan, a bug that was fixed earlier and is still absent becomes "Fixed ✓ verified by run #N". If it comes back, it reopens as a regression.
- **Bulk actions.** Select bugs, then change their status in one UPDATE, or copy a combined prompt ("Fix these N bugs one by one", most severe first, separated by `---`).
- **Workspace Gemini key.**
  - Owners save it in workspace settings.
  - `set_workspace_gemini_key` stores it with Supabase Vault and keeps only the secret's id.
  - The worker decrypts it and uses it instead of the server key for that workspace's runs.
  - Users can't read Vault or repoint `gemini_secret_id` (column grants).

## AI explainer (Phase 3)

After auto-fix, the explainer sends unexplained open bugs to the model, 25 per call. It asks for JSON:
a title of at most 80 characters, a 2–3 sentence summary, a severity, and the expected behaviour. It
validates every item, writes them in one `UPDATE … FROM (VALUES …)`, and builds the fix prompt
(`worker/src/prompt.ts`). Every bug gets a raw-data fix prompt at insert time, so Copy prompt works
even without AI.

`worker/src/ai.ts` handles provider fallback:
1. Gemini (OpenAI-compatible endpoint) with `response_format: json_object`.
   - Explanations use Flash-Lite; Flash is for review and test generation.
   - Rate limits (429) and 5xx errors are retried 5 times with backoff (2s × 2^n).
   - Invalid JSON from Flash-Lite gets one retry with Flash.
2. If Gemini still fails, OpenRouter is tried once.
   - This covers exhausted rate limits, an invalid key, or an outage.
   - The request sets `model` to the first entry and `models` to the whole `OPENROUTER_MODELS` list, so OpenRouter falls through on its own.
   - The answer is parsed defensively, from the first `{` to the last `}`.
3. If both fail, the bugs stay unexplained for the next run (`testers.explainer = "deferred"`).

`runs.ai_usage` records `{ "provider:model": { calls, prompt_tokens, completion_tokens } }`, and the
run history shows calls per provider. Secret values are redacted before anything is sent. Gitleaks
findings and secret-rule matches never include source lines.

**Testing without real keys:** the mock also answers review and testgen prompts for the sample app, and
accepts Gemini keys starting with `ws-valid-`. That lets you check that a workspace key replaces the
server key.

`worker/src/scripts/mock-llm.ts`: `worker/src/scripts/mock-llm.ts` is an OpenAI-compatible mock. Its
fake Gemini can return an invalid key, 429, or bad JSON, and its fake OpenRouter wraps the JSON in
prose.

```bash
cd worker
node src/scripts/mock-llm.ts 4010 invalid-key &
GEMINI_KEY=x GEMINI_LITE=lite GEMINI_FLASH=flash GEMINI_BASE_URL=http://127.0.0.1:4010/gemini/ \
OPENROUTER_KEY=x OPENROUTER_MODELS=mock/a:free OPENROUTER_BASE_URL=http://127.0.0.1:4010/openrouter/ \
  node --env-file=../.env src/index.ts
```

## Security notes

- RLS is on for every table. Users only see rows from workspaces they belong to.
  - Writes to `runs` are worker-only.
  - Users can only change `bugs.status`.
  - `projects.last_scanned_sha` is worker-only.
  - `llm_cache` is service-role only.
- The service-role and AI keys are read only in server code (`lib/supabase/admin.ts`, the worker). They
  are never `NEXT_PUBLIC_`.
- Every container is started with the same limits: `--cpus=1 --memory=1g --pids-limit=256 --cap-drop=ALL --security-opt=no-new-privileges`. It runs as your user, and the Docker socket is never mounted.
- `redactSecrets` scrubs token patterns and `secret = "…"` style assignments from all stored evidence.
- Gitleaks and Semgrep secret findings never keep the source line.
- `file://` repo URLs only work when `ALLOW_FILE_REPOS=true` (local development only). The web form accepts http(s) only.

## Sample buggy app

`samples/buggy-app` plants one bug per tester (see its README). `pnpm sample:init` copies it into a local git
repo (`~/.bugswarm/repos/buggy-app`) and points the seeded project at it. To see auto-fix or a regression,
commit changes in that repo and click Run now.

To test against GitHub instead, push the sample to your own repo and set the project's repo URL. It
contains a **fake** token for Gitleaks to find. If GitHub push protection flags it, allow it for that
test repo.
