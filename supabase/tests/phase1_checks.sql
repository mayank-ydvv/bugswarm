-- Phase 1 database checks. Runs in a transaction and rolls back, so it leaves no data behind.
-- Usage: pnpm db:check
\set ON_ERROR_STOP on
begin;

-- A second user who belongs to no workspace.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
        'authenticated', 'authenticated', 'stranger@bugswarm.test', '', now(), now(), now());

create temp table results (check_name text, ok boolean);
-- Checks compare against the state before they ran, so they pass on a used dev database too.
create temp table before as
select (select queue_length from pgmq.metrics('runs')) as queue_length;
-- Start from a project with no active run.
update public.runs set status = 'done'
where project_id = 'b7480b4b-bcdf-499f-9f7f-00a9ff543866' and status in ('queued', 'running');
grant all on results, before to authenticated, anon;

-- Demo user (owner of the seeded project).
set local role authenticated;
set local request.jwt.claims = '{"sub":"93a5ab95-b212-4f39-8674-7cd5494023d0","role":"authenticated"}';

do $$
declare a bigint; b bigint; c bigint;
begin
  a := public.start_run('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  b := public.start_run('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  c := public.start_run('b7480b4b-bcdf-499f-9f7f-00a9ff543866', 'manual', true);
  insert into results values ('start_run is idempotent while a run is active', a = b and b = c);
  insert into results values ('exactly one active run',
    (select count(*) = 1 from public.runs
     where project_id = 'b7480b4b-bcdf-499f-9f7f-00a9ff543866' and status in ('queued', 'running')));
  insert into results values ('member sees own workspace',
    exists (select 1 from public.workspaces where id = 'c6afafd5-7ae6-43a4-b942-159785c83728'));
end $$;

do $$
begin
  insert into public.runs (project_id) values ('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  insert into results values ('users cannot insert runs directly', false);
exception when insufficient_privilege then
  insert into results values ('users cannot insert runs directly', true);
end $$;

do $$
begin
  update public.projects set last_scanned_sha = 'x';
  insert into results values ('users cannot write last_scanned_sha', false);
exception when insufficient_privilege then
  insert into results values ('users cannot write last_scanned_sha', true);
end $$;

-- Stranger.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into results values ('non-member sees no workspaces/projects/runs',
  (select count(*) = 0 from public.workspaces) and (select count(*) = 0 from public.projects)
  and (select count(*) = 0 from public.runs));
do $$
begin
  perform public.start_run('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  insert into results values ('non-member start_run is forbidden', false);
exception when insufficient_privilege then
  insert into results values ('non-member start_run is forbidden', sqlerrm = 'forbidden');
end $$;

-- Anonymous.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  perform public.start_run('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  insert into results values ('anon cannot execute start_run', false);
exception when insufficient_privilege then
  insert into results values ('anon cannot execute start_run', true);
end $$;

reset role;
insert into results values ('exactly one message queued',
  (select m.queue_length = b.queue_length + 1 from pgmq.metrics('runs') m, before b));

select case when ok then 'PASS' else 'FAIL' end as result, check_name from results;
select bool_or(not ok) as failed from results \gset
rollback;
\if :failed
  \echo 'Some checks FAILED'
  \q 3
\endif
\echo 'All checks passed'
