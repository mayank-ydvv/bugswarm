# BugSwarm deployment plan

Goal: move BugSwarm off this Mac so scheduled scans, GitHub webhooks and sign-in work 24/7 at a real URL.
Today everything runs locally: Supabase in Docker, the worker and Next.js on the Mac, and a temporary
tunnel for the webhook.

## Target architecture

```
GitHub ──push webhook──▶ Web app (Next.js) ──rpc start_run──▶ Supabase (hosted)
Users ──browser──────────▶   Vercel                         Postgres + pgmq + pg_cron + Vault
                                                            Auth (GitHub, email) · Realtime · Storage
                                                                   ▲
                                         postgres:// (pgmq.read) │ │ Storage REST (evidence)
                                                                   │ ▼
                                     Worker VPS (Hetzner) ─── Docker sandboxes (bsnet, no internet)
                                     systemd · Chromium (Playwright/Lighthouse/axe) · git
```

| Piece | Where | Why |
|---|---|---|
| Database, auth, queue, cron, storage | **Supabase (hosted)** | Everything already lives in `supabase/migrations`; pgmq, pg_cron and Vault are all supported on hosted projects. |
| Web app | **Vercel** | Zero-ops Next.js 15 hosting, HTTPS, and a public URL for the webhook. It holds no state. |
| Worker | **Hetzner VPS**, Ubuntu 24.04, 4 vCPU / 8 GB | Needs Docker, which serverless platforms don't offer. Each run uses up to 2 sandbox containers (1 CPU / 1 GB each) plus Chromium; with `CONCURRENCY=2` that's about 4 vCPU and 8 GB. |

**Region:** you're in India (IST), so put the database and the worker close to each other and to you:
Supabase **ap-southeast-1 (Singapore)**, Hetzner **Singapore**, and Vercel functions in **sin1**. The worker
makes many small database round-trips, so worker↔DB latency matters most.

## Decisions you need to make

1. **Supabase project slot.** Your org already has 2 active free projects (agent-workspace, fitness-coach),
   and the free plan allows 2. Pick one:
   - **(a)** pause one of them and create `bugswarm` on the free plan, or
   - **(b)** upgrade the org to Pro (paid, monthly).

   Free projects also pause after a period of inactivity, which would stop the nightly scans; Pro doesn't.
   Check current limits and prices on supabase.com/pricing.
2. **Web hosting.** Vercel's Hobby plan is for **non-commercial use only**. If BugSwarm is or will be
   commercial, use Vercel Pro or run Next.js on the same VPS behind Caddy (plan B below).
3. **Domain.** Optional. `*.vercel.app` works for sign-in and webhooks. A custom domain only needs a DNS record.
4. **Hetzner account and server.** You create the account and the server, because that involves payment.
   I can do everything after that over SSH.
5. **Email sign-in in production.** Turn on email confirmation and add an SMTP provider (Resend, Postmark,
   etc.). Supabase's built-in mailer is limited to a few emails per hour. Or offer GitHub sign-in only at first.

## Code changes before deploying ✅ done (2026-10-09)

| Change | Where |
|---|---|
| Production build without tests and the mock server | `worker/tsconfig.build.json` (`pnpm --filter worker build`) |
| systemd service: auto-restart, starts on boot, clean SIGTERM shutdown | `deploy/bugswarm-worker.service` |
| One-shot server setup: Docker, Node 20, firewall, auto-updates, service user, images, optional gVisor | `deploy/setup-worker.sh [--gvisor]` (ShellCheck clean) |
| Build, upload, install Chromium, restart | `deploy/deploy-worker.sh root@<server>`. Ships a `pnpm deploy` bundle; dependencies are pure JS, and I checked it loads on Linux Node 20 |
| Optional gVisor runtime for sandbox containers | `SANDBOX_RUNTIME=runsc` (worker config, applied to every container) |
| Daily housekeeping: evidence older than `EVIDENCE_RETENTION_DAYS` (30), `llm_cache` older than 90 days, stale heartbeats, checkouts of deleted projects, exited containers, dangling images | `worker/src/housekeeping.ts` plus `deploy/bugswarm-housekeeping.{service,timer}` (03:30 UTC); locally `pnpm --filter worker housekeeping` |
| Production env templates | `deploy/worker.env.example`, `deploy/web.env.example` |
| Pooler-safe database connection | Prepared statements are turned off automatically on the transaction pooler (port 6543) |
| Worker heartbeat plus a "No worker is running" banner on the dashboard | migration `20261009000001_worker_heartbeats.sql`, worker check-ins every 60s, `worker_status` view |

## Rollout steps

Who does each step: **You** = needs your accounts, payments or secrets. **Me** = I can do it with tools.

### 1. Supabase (about 20 minutes)
1. **You:** free a project slot or upgrade (decision 1).
2. **Me:** create the `bugswarm` project in ap-southeast-1 with the Supabase connector. It shows the cost
   and asks you to confirm first.
3. **Me:** apply every migration in `supabase/migrations` in order. `seed.sql` is **not** applied: it's local-only demo data.
4. **Me:** check that the extensions (pgmq, pg_cron, vault, pg_trgm) and both cron jobs exist, run the
   security advisors, and run `supabase/tests/*_checks.sql` against the new database. They roll back, so
   they leave no data behind.
5. **You:** in the dashboard, under **Auth → URL configuration**, set Site URL to the production web URL and
   add `https://<web-url>/**` as a redirect URL. Under **Auth → Providers → GitHub**, paste the
   *production* OAuth app's ID and secret (step 4).

### 2. Web app on Vercel (about 15 minutes)
1. **Me:** create the Vercel project from this repo: root `bugswarm/web`, framework Next.js, region `sin1`.
   It isn't pushed to GitHub yet, so you either push the `bugswarm` branch first or I deploy with the Vercel CLI.
2. **You:** add the environment variables in Vercel → Settings → Environment Variables. They're secrets,
   so you paste them:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public, from the Supabase dashboard
   - `SUPABASE_SERVICE_ROLE_KEY`: server only
   - `GH_WEBHOOK_SECRET`: optional. Webhooks use per-project secrets (Project settings → Scan on every push)
3. **Me:** deploy, then smoke-test: landing page loads, `/w` redirects when signed out, and
   `POST /api/github/webhook` with no signature returns 401.

### 3. Worker on Hetzner (about 30 minutes)
1. **You:** create the server (Ubuntu 24.04, Singapore, 4 vCPU / 8 GB, your existing SSH key
   `~/.ssh/id_ed25519.pub`) and send me its IP.
2. **Me:** `scp deploy/setup-worker.sh` to the server and run it, then run `deploy/deploy-worker.sh root@<ip>`.
3. **You:** create `/etc/bugswarm/worker.env` on the server, mode 600:
   - `DATABASE_URL` (session pooler), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_KEY`, `OPENROUTER_KEY`
   - `GEMINI_LITE=gemini-3.5-flash-lite`, `GEMINI_FLASH=gemini-3.8-flash`, `OPENROUTER_MODELS=…` (the current values)
   - `CONCURRENCY=2`, **`DOCKER_PUBLISH_PORTS=false`** (Linux can reach container IPs directly), **`ALLOW_FILE_REPOS=false`**
4. **Me:** start the service and check the log shows `worker started … ai=gemini+openrouter`, then queue a
   test run and watch it complete.

### 4. GitHub (about 10 minutes, **you**)
1. Create a **new production OAuth app**. Callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`,
   homepage: the web URL. Put its ID and secret into Supabase (step 1.5). Keep the local one for development.
2. In each repo you want scanned on push, open the project's settings → **Scan on every push**, then add
   a GitHub webhook with the payload URL and secret shown there, `application/json`, "Just the push event". For `bugswarm-buggy-app`, **edit** the existing
   webhook instead of adding one (its tunnel URL is dead).

### 5. End-to-end verification (**me**)
- Sign up and sign in with email and with GitHub on the production URL. Create a workspace and add `bugswarm-buggy-app`.
- Click Run now: bugs appear live, explanations arrive, and Copy prompt works.
- Push a commit: a push-triggered run appears within seconds.
- `select enqueue_scheduled('hourly')` with no new commits: the run finishes in under 5 seconds without Docker.
- Wait for the first real nightly run at 02:13 UTC (07:43 IST) and confirm it ran.
- Security checks:
  - The service-role key isn't in the client bundle.
  - Anonymous calls to `start_run` and `enqueue_scheduled` are rejected.
  - Vault isn't readable from the API.
  - The sandbox has no internet access on the VPS.

## Rollback

- **Web:** Vercel keeps every deployment; promote the previous one.
- **Worker:** `systemctl stop bugswarm-worker`. Queued runs simply wait in pgmq, and nothing is lost.
- **Database:** migrations only add things. For a bad data change, use Supabase's daily backups (Pro) or
  point-in-time recovery (paid add-on).
- **Local dev keeps working unchanged:** local Supabase, `.env`, and `pnpm dev` / `pnpm dev:worker`.

## Running costs (rough; check current prices)

| Item | Cost |
|---|---|
| Supabase | Free (if you free a slot) or Pro plan |
| Vercel | Hobby free (non-commercial) or Pro |
| Hetzner VPS (4 vCPU / 8 GB) | A few euros to about €15/month, depending on type |
| AI | Free tiers. Gemini Flash rate-limits quickly; the OpenRouter fallback and `llm_cache` absorb that. |
| Domain | Optional |

## Plan B: everything on one VPS (no Vercel)

Run Next.js (`next build && next start`) on the same Hetzner server behind **Caddy**, which gives automatic
HTTPS for a domain you point at the server. Firewall: 22, 80, 443. It's cheaper and has no commercial-use
restriction, but you own uptime and deploys. Same Supabase setup.
