-- Each running worker process checks in every minute so the dashboard can tell when no worker is
-- picking up runs. No host names or other details: just liveness and load.
create table public.worker_heartbeats (
  id text primary key,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  concurrency int not null,
  active_runs int not null default 0
);

alter table public.worker_heartbeats enable row level security;
-- Liveness is the same for every user; written only by the worker (service connection).
create policy heartbeats_select on public.worker_heartbeats for select to authenticated using (true);
revoke insert, update, delete on public.worker_heartbeats from anon, authenticated;

-- Online = any worker seen in the last 3 minutes (one missed beat is tolerated).
create view public.worker_status
with (security_invoker = true)
as
select
  coalesce(bool_or(last_seen_at > now() - interval '3 minutes'), false) as online,
  max(last_seen_at) as last_seen_at,
  coalesce(sum(active_runs) filter (where last_seen_at > now() - interval '3 minutes'), 0)::int as active_runs
from public.worker_heartbeats;

grant select on public.worker_status to authenticated;
revoke all on public.worker_status from anon;
