-- Membership helpers live in a schema the Data API does not expose. They are security definer
-- so policies on workspace_members can call them without recursing into their own RLS.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create function private.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

-- Owners and members can write; viewers are read-only.
create function private.can_write(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role in ('owner', 'member')
  );
$$;

create function private.is_owner(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Set-returning variants for per-row tables (runs, bugs): `project_id in (select ...)` is
-- evaluated once per statement as a hashed subplan instead of one function call per row.
create function private.my_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.projects p
  join public.workspace_members m on m.workspace_id = p.workspace_id
  where m.user_id = (select auth.uid());
$$;

create function private.my_writable_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.projects p
  join public.workspace_members m on m.workspace_id = p.workspace_id
  where m.user_id = (select auth.uid()) and m.role in ('owner', 'member');
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.runs enable row level security;
alter table public.bugs enable row level security;
alter table public.llm_cache enable row level security; -- no policies: service role only

-- workspaces. owner_id check lets `insert ... returning` see the row before the
-- owner-membership trigger's row is visible to the policy.
create policy workspaces_select on public.workspaces for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (private.is_owner(id));

-- workspace_members
create policy members_select on public.workspace_members for select to authenticated
  using (private.is_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated
  with check (private.is_owner(workspace_id));
create policy members_update on public.workspace_members for update to authenticated
  using (private.is_owner(workspace_id)) with check (private.is_owner(workspace_id));
create policy members_delete on public.workspace_members for delete to authenticated
  using (private.is_owner(workspace_id));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (private.is_member(workspace_id));
create policy projects_insert on public.projects for insert to authenticated
  with check (private.can_write(workspace_id));
create policy projects_update on public.projects for update to authenticated
  using (private.can_write(workspace_id)) with check (private.can_write(workspace_id));
create policy projects_delete on public.projects for delete to authenticated
  using (private.can_write(workspace_id));
-- The worker owns this column; users must not be able to rewind incremental scans.
revoke update on public.projects from authenticated;
grant update (name, repo_url, branch, live_url, start_cmd, port, schedule) on public.projects to authenticated;

-- runs: read-only for users; created only through start_run, updated only by the worker.
create policy runs_select on public.runs for select to authenticated
  using (project_id in (select private.my_project_ids()));
revoke insert, update, delete on public.runs from anon, authenticated;

-- bugs: read for members, status changes for writers. Everything else is the worker's.
create policy bugs_select on public.bugs for select to authenticated
  using (project_id in (select private.my_project_ids()));
create policy bugs_update on public.bugs for update to authenticated
  using (project_id in (select private.my_writable_project_ids()))
  with check (project_id in (select private.my_writable_project_ids()));
revoke insert, update, delete on public.bugs from anon, authenticated;
grant update (status) on public.bugs to authenticated;

revoke all on public.llm_cache from anon, authenticated;
