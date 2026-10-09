-- Phase 4 database checks (scheduling, Vault key handling). Rolls back. Usage: pnpm db:check
\set ON_ERROR_STOP on
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
        'authenticated', 'authenticated', 'member@bugswarm.test', '', now(), now(), now());
-- A plain member (not owner) of the Demo workspace.
insert into public.workspace_members (workspace_id, user_id, role)
values ('c6afafd5-7ae6-43a4-b942-159785c83728', '22222222-2222-2222-2222-222222222222', 'member');

create temp table results (check_name text, ok boolean);
grant all on results to authenticated, anon;

-- Scheduling: start from no active runs so counts are deterministic.
update public.runs set status = 'done' where status in ('queued', 'running');
create temp table q as select (select queue_length from pgmq.metrics('runs')) as before;
insert into results
select 'enqueue_scheduled(nightly) queues one full run per nightly project',
  public.enqueue_scheduled('nightly') = (select count(*) from public.projects where schedule = 'nightly')
  and not exists (select 1 from public.runs where status = 'queued' and trigger = 'schedule' and not full_scan);
insert into results values ('second call queues nothing while runs are active', public.enqueue_scheduled('nightly') = 0);
insert into results
select 'queue got exactly one message per run',
  (select queue_length from pgmq.metrics('runs')) - (select before from q)
  = (select count(*) from public.runs where status = 'queued');

-- Owner sets a key.
set local role authenticated;
set local request.jwt.claims = '{"sub":"93a5ab95-b212-4f39-8674-7cd5494023d0","role":"authenticated"}';
select public.set_workspace_gemini_key('c6afafd5-7ae6-43a4-b942-159785c83728', 'test-key-0123456789abcdefghij');
insert into results values ('owner can set the workspace key',
  (select gemini_secret_id is not null from public.workspaces where id = 'c6afafd5-7ae6-43a4-b942-159785c83728'));

do $$
begin
  perform 1 from vault.decrypted_secrets;
  insert into results values ('users cannot read Vault', false);
exception when insufficient_privilege then
  insert into results values ('users cannot read Vault', true);
end $$;

do $$
begin
  update public.workspaces set gemini_secret_id = gen_random_uuid() where id = 'c6afafd5-7ae6-43a4-b942-159785c83728';
  insert into results values ('owners cannot repoint gemini_secret_id directly', false);
exception when insufficient_privilege then
  insert into results values ('owners cannot repoint gemini_secret_id directly', true);
end $$;

do $$
begin
  insert into public.worker_heartbeats (id, concurrency) values ('fake-worker', 1);
  insert into results values ('users cannot fake a worker heartbeat', false);
exception when insufficient_privilege then
  insert into results values ('users cannot fake a worker heartbeat', true);
end $$;
insert into results values ('users can read worker status', (select count(*) = 1 from public.worker_status));

-- Member (not owner).
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  perform public.set_workspace_gemini_key('c6afafd5-7ae6-43a4-b942-159785c83728', 'attacker-key-0123456789abcdef');
  insert into results values ('members cannot change the key', false);
exception when insufficient_privilege then
  insert into results values ('members cannot change the key', true);
end $$;
do $$
begin
  perform public.enqueue_scheduled('hourly');
  insert into results values ('users cannot call enqueue_scheduled', false);
exception when insufficient_privilege then
  insert into results values ('users cannot call enqueue_scheduled', true);
end $$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  perform 1 from public.worker_status;
  insert into results values ('anon cannot read worker status', false);
exception when insufficient_privilege then
  insert into results values ('anon cannot read worker status', true);
end $$;

reset role;
insert into results values ('worker role decrypts the stored key',
  (select decrypted_secret = 'test-key-0123456789abcdefghij' from vault.decrypted_secrets
   where id = (select gemini_secret_id from public.workspaces where id = 'c6afafd5-7ae6-43a4-b942-159785c83728')));

select case when ok then 'PASS' else 'FAIL' end as result, check_name from results;
select bool_or(not ok) as failed from results \gset
rollback;
\if :failed
  \echo 'Some checks FAILED'
  \q 3
\endif
\echo 'All checks passed'
