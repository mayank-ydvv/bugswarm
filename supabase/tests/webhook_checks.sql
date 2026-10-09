-- Per-project webhook secret checks. Rolls back. Usage: pnpm db:check
\set ON_ERROR_STOP on
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'viewer@bugswarm.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'outsider@bugswarm.test', '', now(), now(), now());
insert into public.workspace_members (workspace_id, user_id, role)
values ('c6afafd5-7ae6-43a4-b942-159785c83728', '55555555-5555-5555-5555-555555555555', 'viewer');

create temp table results (check_name text, ok boolean);
create temp table secrets (s text);
grant all on results, secrets to authenticated, anon;
insert into results select 'every project gets a distinct 64-hex secret',
  bool_and(webhook_secret ~ '^[0-9a-f]{64}$') and count(distinct webhook_secret) = count(*) from public.projects;

-- Owner (demo user).
set local role authenticated;
set local request.jwt.claims = '{"sub":"93a5ab95-b212-4f39-8674-7cd5494023d0","role":"authenticated"}';
do $$
begin
  perform webhook_secret from public.projects limit 1;
  insert into results values ('clients cannot select the secret column', false);
exception when insufficient_privilege then
  insert into results values ('clients cannot select the secret column', true);
end $$;
insert into results select 'other columns stay readable', count(*) >= 1 from public.projects where id = 'b7480b4b-bcdf-499f-9f7f-00a9ff543866';
insert into secrets select public.project_webhook_secret('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
insert into results select 'owner reads the secret', s ~ '^[0-9a-f]{64}$' from secrets;
insert into results select 'rotate returns a new secret',
  public.rotate_project_webhook_secret('b7480b4b-bcdf-499f-9f7f-00a9ff543866') <> (select s from secrets);

-- Viewer and outsider.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
insert into results select 'viewers cannot read the secret', public.project_webhook_secret('b7480b4b-bcdf-499f-9f7f-00a9ff543866') is null;
insert into results select 'viewers cannot rotate the secret', public.rotate_project_webhook_secret('b7480b4b-bcdf-499f-9f7f-00a9ff543866') is null;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
insert into results select 'outsiders cannot read the secret', public.project_webhook_secret('b7480b4b-bcdf-499f-9f7f-00a9ff543866') is null;

set local role anon;
do $$
begin
  perform public.project_webhook_secret('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  insert into results values ('anon cannot call the secret function', false);
exception when insufficient_privilege then
  insert into results values ('anon cannot call the secret function', true);
end $$;

reset role;
select case when ok then 'PASS' when ok is null then 'FAIL (null)' else 'FAIL' end as result, check_name from results;
-- "is not true": a NULL (unevaluable) check must fail, not pass.
select coalesce(bool_or(ok is not true), true) as failed from results \gset
rollback;
\if :failed
  \echo 'Some checks FAILED'
  \q 3
\endif
\echo 'All checks passed'
