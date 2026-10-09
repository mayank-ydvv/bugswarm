-- Workspace invite checks. Rolls back. Usage: pnpm db:check
\set ON_ERROR_STOP on
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'invitee@bugswarm.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'someone-else@bugswarm.test', '', now(), now(), now());

create temp table results (check_name text, ok boolean);
create temp table tok (t text);
grant all on results, tok to authenticated, anon;

-- Owner (demo user) invites a viewer.
set local role authenticated;
set local request.jwt.claims = '{"sub":"93a5ab95-b212-4f39-8674-7cd5494023d0","role":"authenticated"}';
insert into tok select public.create_workspace_invite('c6afafd5-7ae6-43a4-b942-159785c83728', ' Invitee@BugSwarm.test ', 'viewer');
insert into results values ('owner sees the pending invite (normalized email, no token stored)',
  (select count(*) = 1 from public.workspace_invites where email = 'invitee@bugswarm.test')
  and not exists (select 1 from public.workspace_invites where token_hash = (select t from tok)));

-- Wrong account cannot accept.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
insert into results select 'peek shows a mismatch for another account', not email_matches from public.peek_workspace_invite((select t from tok));
do $$
begin
  perform public.accept_workspace_invite((select t from tok));
  insert into results values ('another account cannot accept', false);
exception when insufficient_privilege then
  insert into results values ('another account cannot accept', true);
end $$;
do $$
begin
  perform public.create_workspace_invite('c6afafd5-7ae6-43a4-b942-159785c83728', 'x@bugswarm.test');
  insert into results values ('non-members cannot invite', false);
exception when insufficient_privilege then
  insert into results values ('non-members cannot invite', true);
end $$;
insert into results values ('non-members see no invites', (select count(*) = 0 from public.workspace_invites));
do $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values ('c6afafd5-7ae6-43a4-b942-159785c83728', '44444444-4444-4444-4444-444444444444', 'owner');
  insert into results values ('users cannot add themselves to a workspace', false);
exception when insufficient_privilege then
  insert into results values ('users cannot add themselves to a workspace', true);
end $$;

-- Right account accepts once.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
insert into results select 'accept returns the workspace',
  public.accept_workspace_invite((select t from tok)) = 'c6afafd5-7ae6-43a4-b942-159785c83728';
-- Separate statement: the membership created above is visible only to later statements.
insert into results values ('invitee joins with the invited role',
  (select role = 'viewer' from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333'));
do $$
begin
  perform public.accept_workspace_invite((select t from tok));
  insert into results values ('invites are single-use', false);
exception when no_data_found then
  insert into results values ('invites are single-use', true);
end $$;
insert into results values ('viewer sees members with emails',
  (select count(*) >= 2 and bool_and(email is not null) from public.list_workspace_members('c6afafd5-7ae6-43a4-b942-159785c83728')));
do $$
begin
  perform public.start_run('b7480b4b-bcdf-499f-9f7f-00a9ff543866');
  insert into results values ('viewers cannot start runs', false);
exception when insufficient_privilege then
  insert into results values ('viewers cannot start runs', true);
end $$;
update public.workspace_members set role = 'member' where user_id = '33333333-3333-3333-3333-333333333333';
insert into results values ('viewers cannot promote themselves',
  (select role = 'viewer' from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333'));
delete from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333';
insert into results values ('members can leave',
  not exists (select 1 from public.workspace_members where user_id = '33333333-3333-3333-3333-333333333333'));

-- Owner cannot be removed or demoted through the API.
set local request.jwt.claims = '{"sub":"93a5ab95-b212-4f39-8674-7cd5494023d0","role":"authenticated"}';
update public.workspace_members set role = 'viewer' where user_id = '93a5ab95-b212-4f39-8674-7cd5494023d0';
delete from public.workspace_members where user_id = '93a5ab95-b212-4f39-8674-7cd5494023d0';
insert into results values ('owner cannot demote or remove themselves',
  (select role = 'owner' from public.workspace_members where user_id = '93a5ab95-b212-4f39-8674-7cd5494023d0'
     and workspace_id = 'c6afafd5-7ae6-43a4-b942-159785c83728'));

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
