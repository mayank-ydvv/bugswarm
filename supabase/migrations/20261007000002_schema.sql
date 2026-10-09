-- Declaration order matters: `order by severity` sorts critical -> low without a CASE.
create type public.severity as enum ('critical', 'high', 'medium', 'low');
create type public.bug_status as enum ('open', 'in_progress', 'fixed', 'verified', 'ignored');
create type public.run_status as enum ('queued', 'running', 'done', 'failed');
create type public.run_schedule as enum ('off', 'hourly', 'nightly');
create type public.run_trigger as enum ('manual', 'push', 'schedule');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'viewer')),
  primary key (workspace_id, user_id)
);
-- RLS checks look members up by user, so this must be indexed.
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  repo_url text,
  branch text not null default 'main',
  live_url text,
  start_cmd text not null default 'npm run dev',
  port int not null default 3000 check (port between 1 and 65535),
  schedule public.run_schedule not null default 'nightly',
  last_scanned_sha text,
  created_at timestamptz not null default now(),
  constraint projects_target_present check (repo_url is not null or live_url is not null)
);
create index projects_workspace_idx on public.projects (workspace_id, created_at desc);
create index projects_schedule_idx on public.projects (schedule) where schedule <> 'off';
-- The GitHub webhook looks projects up by clone URL + branch.
create index projects_repo_idx on public.projects (repo_url, branch) where repo_url is not null;

create table public.runs (
  id bigserial primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  trigger public.run_trigger not null default 'manual',
  full_scan boolean not null default false,
  commit_sha text,
  status public.run_status not null default 'queued',
  testers jsonb not null default '{}',
  ai_usage jsonb not null default '{}',
  bugs_new int,
  bugs_fixed int,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- Unique (not just indexed): at most one active run per project, even when two
-- "Run now" clicks race. Also makes the "already active?" check O(1).
create unique index runs_active_idx on public.runs (project_id) where status in ('queued', 'running');
-- Run history is keyset-paginated newest first.
create index runs_project_idx on public.runs (project_id, id desc);

create table public.bugs (
  id bigserial primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  fingerprint text not null,
  title text not null,
  summary text,
  technical text,
  severity public.severity not null default 'medium',
  category text not null,
  tester text not null,
  file text,
  line int,
  url text,
  evidence jsonb not null default '{}',
  repro_steps text[],
  fix_prompt text,
  status public.bug_status not null default 'open',
  explained boolean not null default false,
  first_seen_run bigint references public.runs (id) on delete set null,
  last_seen_run bigint references public.runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);
create index bugs_list_idx on public.bugs (project_id, status, severity);
-- Keyset pagination on (severity rank, id) within a status filter.
create index bugs_page_idx on public.bugs (project_id, status, severity, id desc);
create index bugs_unexplained_idx on public.bugs (id) where not explained;

create table public.llm_cache (
  content_hash text primary key,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- The creator becomes the owner member, so RLS (membership based) lets them in.
create function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
  return new;
end;
$$;
revoke execute on function public.add_workspace_owner() from public, anon, authenticated;

create trigger workspaces_add_owner
after insert on public.workspaces
for each row execute function public.add_workspace_owner();
