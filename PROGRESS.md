# BugSwarm — Progress Log

BugSwarm is a web app. A user adds a project (a GitHub repo and/or a live URL), and a swarm of automated testers finds bugs in it. Each bug is explained in plain English and comes with a ready-to-paste Claude Code fix prompt.

The build runs in 4 gated phases.

## Decisions (made at the start)
- **Supabase:** a **local Supabase CLI** stack in Docker. The CLI is a root devDependency; run it with `pnpm supabase …`.
- **Extra dependencies (approved):** @supabase/ssr, @supabase/supabase-js, zod, server-only, next-themes, sonner, lucide-react, plus shadcn's own dependencies.
- **Auth:** email + password, plus GitHub OAuth. GitHub sign-in is disabled until you create an OAuth app.
- **Location:** `trials/bugswarm/`. Web runs on port **3400** (3000 is used by `findr`).
- **Package manager:** pnpm monorepo with two packages, `web` and `worker`.

## Phase 1 — Foundation ✅ DONE

### Supabase
- **Migrations** (`supabase/migrations/`):
  - `pgmq` extension and the `runs` queue.
  - Enums and the tables from the spec, plus `runs.created_at`.
  - A **UNIQUE** partial `runs_active_idx`, so a project can't have two active runs even under racing requests.
  - Row-level security (RLS) on every table. It uses helper functions in a private schema: `is_member`, `can_write`, `is_owner`, `my_project_ids`, `my_writable_project_ids`.
  - `start_run` is security definer. It dedupes active runs with `ON CONFLICT DO NOTHING`, returns `forbidden` to non-members, and anon can't call it.
  - Realtime is enabled on `runs` and `bugs`.
  - Views: `workspace_summaries`, `project_summaries`, `project_bug_counts`.
- **Column-level grants:** users can only update `bugs.status` and the editable project fields. Runs are written by the worker only.
- **`seed.sql`:** demo user `demo@bugswarm.test` / `demo-650ddeefaef9`, a "Demo" workspace and a sample project.
- **`supabase/tests/phase1_checks.sql`** (`pnpm db:check`): 9 checks, all passing. It rolls back afterwards and works on a database that's already been used.

### Web (Next.js 15, Tailwind v4, shadcn)
- **Pages:**
  - Landing page with sign-in (email/password and GitHub).
  - `/w`: workspace cards plus a create dialog.
  - `/w/[ws]`: projects plus an Add project dialog.
  - `/w/[ws]/p/[id]`: health score, severity counts, empty bug list, and a live run panel. The panel has a Run now / Full scan split button, the latest run with trigger and scan badges, and history.
  - Project settings, with a schedule dropdown and the next run time in your local timezone.
  - Workspace settings (members; the Gemini key slot is a Phase 4 placeholder).
- **`POST /api/runs`:** validated with zod, then calls `start_run`. Responses are 200, 400, 401, 403 or 404.
- **Live updates:** Realtime via `subscribeAsUser`, with a unique channel per subscription, which fixed a remount bug.
- **Unit tests** with `node --test`, 11 passing: schedule, schemas, health score.

### Worker
- Skeleton only: `config.ts` (zod env), `types.ts` (Tester/RawFinding), and an `index.ts` stub.

### Sample app
- `samples/buggy-app` plants one deliberate bug per tester: eslint, tsc, semgrep, gitleaks (fake token), osv (`lodash@4.17.15`), and Playwright/axe.

### Verified
- Sign in, create a workspace, add a project, edit settings: all work.
- Run now queues a run. Repeat clicks and API calls return the same run id, leaving 1 row and 1 queue message.
- 8 concurrent `start_run` calls produced exactly 1 active run.
- Live status updates work, light and dark mode work, and the page doesn't scroll sideways at 375px.
- Typecheck, lint and build pass, and the client bundle contains no secrets.

## Phase 2 — Worker + static testers ✅ DONE
### Worker (`worker/src`)
- **`index.ts`:**
  - Runs CONCURRENCY loops that read `pgmq.read('runs',1800,1)`, sleeping 2s when the queue is empty.
  - On a crash, the run is marked failed. The queue message is always deleted in `finally`.
  - On Ctrl-C it shuts down cleanly and marks active runs failed.
- **`run.ts`:**
  - Claims the run. A message delivered again (`read_ct>1`) takes over a run whose worker died.
  - Runs all testers with `Promise.allSettled`.
  - Upserts each tester's bugs and writes its status, then auto-fixes and finishes the run.
  - Records the scope the run actually used (full or incremental).
  - Advances `last_scanned_sha` only if no tester failed.
- **`sandbox.ts`:**
  - Git clone or fetch + hard reset; the diff uses `--no-renames`.
  - Install runs only when dependencies changed.
  - The live app runs on the internal `bsnet` network. A 127.0.0.1 relay handles macOS (`DOCKER_PUBLISH_PORTS`).
  - The readiness poll waits up to 2 minutes.
  - `upload()` goes through the Storage REST API.
- **`docker.ts`:** hardening flags on every container, kill-on-timeout, and helpers for the network, IP and port.
- **`normalize.ts`:** `normalize`, sha1 fingerprints, `toBugs` (Map-based dedupe, default severities), and `redactSecrets`.
- **`store.ts`:**
  - One-statement bulk upsert in chunks of 1000, with regressions reopened.
  - Placeholder titles follow the latest message until a bug is explained.
  - Auto-fix only touches testers that completed, and only changed files on incremental runs.
- **Testers:** `eslint`, `tsc` (in the sandbox, no network), `semgrep` (`p/default`, no metrics), `gitleaks` (redacted; secrets never stored), `osv` (one finding per package; full scans or when a lockfile changed).
- **Migration:** a private `evidence` storage bucket, plus a member-read policy.
- **Scripts:**
  - `pnpm sample:init` makes a local git repo of the sample (needs `ALLOW_FILE_REPOS=true`).
  - `src/scripts/sandbox-smoke.ts` checks the live sandbox.

### Web
- The bug list updates live from Realtime. It keeps a `Map<id,Bug>`, and a `useMemo` sorts it by severity rank, then newest.
- The page refreshes its counts and health score when a run finishes.
- Fixed a layout overflow from long titles (`minmax(0,1fr)` and `min-w-0`).
- Production builds go to `.next-prod`, so `pnpm build` no longer breaks a running `pnpm dev`.

### Verified (sample repo)
- **Run 1 (full):** 9 bugs from all 5 testers in 5.7s. No tokens stored.
- **Run 2:** 0 new, so no duplicates. The 2 false positives from the sample's own ESLint config were auto-fixed.
- **No-change incremental run:** 2.1s, 0 new, 0 fixed, OSV skipped.
- **After committing a fix:**
  - The cart.js bugs were marked fixed.
  - Bugs in files that weren't re-scanned stayed open.
  - Reintroducing the bug reopened the same row.
- **Through the UI:** Run now showed bugs live; after a commit fixed the tsc error, it disappeared live with "1 fixed".
- **Live sandbox:**
  - Ready in 1.4s and reachable through the relay.
  - The app container can't reach the internet (`EAI_AGAIN`).
  - No containers are left behind.
  - Evidence upload to Storage works.
- **Checks:** typecheck, lint, 21 unit tests, `db:check` and build all pass. The client bundle contains no secrets.

### Known trade-offs (for review)
- **Fingerprint collapse:** the spec's `normalize` turns quoted names into `S`. So two different variables flagged by the same rule in the same file count as one bug, and that bug stays open until both are gone.
- **ESLint warnings:** only errors and fatal parse errors are reported. Warnings are left out.
- **Semgrep config:** it uses `p/default` instead of `--config auto`, because `auto` requires sending metrics.
- **`bugs_new`:** counts newly inserted rows. Reopened regressions don't count.

## Phase 3 — Live testers + explainer + bug detail ✅ DONE
### Worker
- **`testers/playwright.ts`:**
  - BFS crawl: the queue is read by index, `seen` is a Set, 50 pages on full scans and 15 on incremental.
  - Captures console errors, uncaught exceptions, same-origin HTTP ≥ 400, page-load timeouts, and buttons that throw when clicked (10 per page).
  - Skips destructive links and buttons.
  - The iPhone 13 pass checks overflow against the device width; mobile emulation inflates innerWidth.
  - Screenshots go to Storage.
  - An app that won't start becomes a bug, with its container logs as evidence.
- **`ai.ts`:**
  - Gemini first: retries 429/5xx with backoff, and retries Flash-Lite's bad JSON once on Flash.
  - OpenRouter fallback with the `models` list; output is parsed defensively.
  - Throws `AiUnavailable` (retryLater) when both fail.
  - Records usage per `provider:model`.
- **`explainer.ts`:** 25 bugs per call; validates each item and keeps the default severity when the model's is invalid. One `UPDATE … FROM (VALUES …)` per batch; every batch is marked explained. Capped at `EXPLAIN_MAX_BATCHES`.
- **`prompt.ts`:** the fix-prompt template. Raw-data prompts are written at insert time, so Copy prompt always works.
- **Migrations:**
  - The `expected` column, and a per-project index of unexplained bugs.
  - `pg_trgm` GIN indexes for search.
  - **Repair:** Phase 2 had stored `evidence` double-encoded as a JSON string. Snippets never reached the AI or prompts, and screenshots were invisible. Existing rows are unwrapped, and a CHECK constraint now requires an object.
- **Mock LLM server and tests:** 30 worker and web unit tests at that point, covering every fallback path.

### Web
- **Bug list:**
  - Filter chips for status, severity, category and tester; status defaults to open.
  - Search over title and file (ILIKE, debounced 250ms).
  - Keyset "Load more" in pages of 50 on (severity rank, id).
  - Realtime updates go into a Map and are filtered on the client with the same predicate as the query.
  - NEW badge per browser (localStorage).
- **Bug detail page `/w/[ws]/p/[id]/b/[bug]`:**
  - Severity, category, tester, and a status dropdown.
  - Summary and expected behaviour.
  - Location: a GitHub blob link at the commit, or the page link, plus a code snippet with the line highlighted.
  - Evidence: a screenshot via signed URL, the log, and the raw tool message (collapsed).
  - Repro steps.
  - Copy prompt with a preview; the button is sticky on phones.
  - History, and the actions In progress, Fixed, and Not a bug.
- Shared helpers in `lib/bugs.ts` keep the query, the Realtime filter and the sorting consistent.

### Verified
- **Sample app:** all 6 testers ran. Playwright found the console error, the uncaught exception, the 'Apply coupon' click error, the 404 link, and iPhone overflow on 2 pages, all with screenshots.
- **Fallback (mock providers):** an invalid Gemini key led to OpenRouter serving the call. `runs.ai_usage` = `{"openrouter:mock/free-a:free": {calls: 1, …}}`, and 13/13 bugs were explained.
- **Fallback unit tests:** 429 gets 5 attempts then OpenRouter; Flash-Lite's bad JSON gets one Flash retry; with no providers left, the bugs are deferred.
- **Pagination:** with 137 synthetic bugs, the UI's own query returned 3 pages and 124 rows, no duplicates, in the same order as SQL. In the UI, Load more went 50 → 100 → 124.
- **List, detail and prompt:**
  - Search, the tester filter, and status actions all work.
  - "Not a bug" hides the bug from the default list.
  - The Copy prompt toast appears and the fix prompt is complete.
  - Mobile layout has no overflow and the Copy prompt bar is sticky.
- Typecheck, lint, 34 tests, `db:check` and build all pass; no secrets in the bundle; no leftover containers.

### Still to verify with real keys
- Put real `GEMINI_KEY`, `GEMINI_LITE`, `GEMINI_FLASH`, `OPENROUTER_KEY` and `OPENROUTER_MODELS` values in `.env`.
- Then set `GEMINI_KEY` to a wrong value, run, and check that `runs.ai_usage` shows only `openrouter:*`.

## Phase 4 — Continuous testing + extras ✅ DONE
### Database (`20261008000004_phase4.sql`, `…05_workspace_column_grants.sql`)
- **Scheduling:**
  - `pg_cron`.
  - `enqueue_scheduled(freq)`: set-based INSERT … SELECT with NOT EXISTS plus ON CONFLICT, one `pgmq.send_batch`, security definer, service role only.
  - Cron jobs `bugswarm-hourly` (7 * * * *) and `bugswarm-nightly` (13 2 * * *).
- **Auto-verify:** `bugs.fixed_run` and `bugs.verified_run`.
- **Workspace key:**
  - `workspaces.gemini_secret_id`.
  - Owner-only `set_workspace_gemini_key` / `clear_workspace_gemini_key`, stored with Supabase Vault.
  - Workspace updates restricted to `name`, so owners can't repoint the secret id.
- **`supabase/tests/phase4_checks.sql`:** 9 checks for scheduling, Vault access, and owner/member/anon permissions.

### Worker
- **Zero-change short-circuit:** a scheduled incremental run with no new commits and no live URL stops after git fetch, with no install, app or Docker.
- **Scoped auto-fix** (`setScope`) and **auto-verify** on full scans. Reopening a bug clears `fixed_run` and `verified_run`.
- **New testers:**
  - `lighthouse`: full scans only, 5 pages, driving Playwright's Chromium over CDP (no extra launcher package).
  - `axe`: axe-core injected with Playwright; serious and critical violations, one per rule per page.
  - `review`: AI review of changed files plus their imports (all files on full scans), batch cache lookup, capped calls, skips files with more than 10 tool findings.
  - `testgen`: AI writes tests that run in the no-network sandbox with vitest, jest or node:test. Parses TAP and JSON reports, and ignores failures caused by broken generated tests.
- **Shared pieces:** the crawled page list (Playwright → Lighthouse and axe), one `ai_usage` per run, and the `llm_cache` module.
- **Workspace key:** the per-run AI client uses the workspace's Vault key when it's set.
- **Generated test files** are excluded from eslint, semgrep and gitleaks.

### Web
- **`POST /api/github/webhook`:** HMAC verification, push events only, matches repo URL variants plus branch, service-role `start_run(p,'push',false)`.
- **Bug list:** a select-all checkbox (shows a dash for partial selections), bulk status change in one UPDATE, Copy combined prompt, and "Fixed ✓ verified by run #N".
- **Bug detail:** history now includes "Fixed in" and "Verified by".
- **Workspace settings:** a Gemini key form (save, replace, remove; never shown again; owner only).

### Verified
- **Phase 4 "done" check:** `enqueue_scheduled('nightly')` queued exactly one full-scan run per nightly project (2), and a second call queued 0.
- **Hourly zero-change run:** finished in 88 ms with **0 containers created** (watched with `docker events`).
- **Real repo:** vercel/commerce was scanned by the nightly run in 32s; a signed webhook push queued and ran an incremental run.
- **Webhook rejections:** a tampered or unsigned request gets 401; another branch matches nothing.
- **Sample app full scan:**
  - axe found image-alt and color-contrast.
  - Lighthouse found render-blocking resources.
  - AI review found `totl` (line 5).
  - testgen: the generated test failed with `ReferenceError: totl is not defined`.
- **Fix, then full scan:** after committing a fix, an incremental run fixed 4 bugs. The next full scan **verified** all 4, using **0 AI calls** because all 7 files came from the cache.
- **AI unavailable:** review and testgen covered 0 files, so nothing was wrongly auto-fixed.
- **Bulk and combined prompt:** bulk status change (2 bugs), combined prompt copied, verified labels shown.
- **Workspace key:** saved through the UI. Vault stores it encrypted, and the run used `gemini:*` (the server key would have fallen back to OpenRouter). Removing the key deleted the Vault row.
- **Checks:** typecheck, lint, 46 unit tests, 18 database checks and the build pass; no secrets in the bundle; no leftover containers.

### Verified with real credentials (2026-10-08)
- **Models in `.env`:** `GEMINI_LITE=gemini-3.5-flash-lite` and `GEMINI_FLASH=gemini-3.8-flash`, picked from the models the key can actually use (the 2.5 models are no longer available to new users). `OPENROUTER_MODELS` = Gemma 4 31B, then Nemotron 3 Super, then Gemma 4 26B (free).
- **Full scan (run 65):** the explainer used Gemini Flash-Lite and wrote real plain-English titles for all bugs. AI review found 6 real issues, such as null dereferences in public/app.js and eval without error handling. `gemini-3.8-flash` hit free-tier 429s; after 5 retries it fell back to OpenRouter (Nemotron).
- **Phase 3 "done" check (run 67):** with a wrong server GEMINI_KEY, Gemini returned HTTP 400, OpenRouter served the call, and 11/11 bugs were explained. `ai_usage` = `{"openrouter:nvidia/nemotron-3-super-120b-a12b:free": …}`.
- **Workspace key (run 66):** the Demo workspace's own key, saved in settings, replaced the server key.

### Still to do
- A real GitHub webhook pointing at a public URL for the web app (for example a tunnel or a deployed instance).
- **Free-tier note:** `gemini-3.8-flash` rate-limits quickly, so a first full scan with AI review spends minutes in backoff (run 65 took 231s). Lower `REVIEW_MAX_CALLS` if that matters; the cache makes later runs fast.

## How to run
```bash
cd bugswarm
pnpm install
pnpm db:start     # Docker Desktop must be running
pnpm db:reset
pnpm dev          # http://localhost:3400
pnpm sample:init  # local sample repo for the seeded project
pnpm dev:worker   # second terminal
pnpm --filter worker exec playwright install chromium   # once, for the live testers
```
