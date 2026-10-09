-- Local development seed (runs on `pnpm supabase db reset`). Never run against a hosted project.
-- Demo login: demo@bugswarm.test / demo-650ddeefaef9

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '93a5ab95-b212-4f39-8674-7cd5494023d0',
  'authenticated', 'authenticated', 'demo@bugswarm.test',
  crypt('demo-650ddeefaef9', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Demo"}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '93a5ab95-b212-4f39-8674-7cd5494023d0',
  '93a5ab95-b212-4f39-8674-7cd5494023d0',
  'email',
  '{"sub":"93a5ab95-b212-4f39-8674-7cd5494023d0","email":"demo@bugswarm.test","email_verified":true}',
  now(), now(), now()
);

-- The owner-membership trigger adds the demo user as owner.
insert into public.workspaces (id, name, owner_id)
values ('c6afafd5-7ae6-43a4-b942-159785c83728', 'Demo', '93a5ab95-b212-4f39-8674-7cd5494023d0');

-- Point repo_url at your own copy of samples/buggy-app (see README) before running the worker.
insert into public.projects (id, workspace_id, name, repo_url, branch, start_cmd, port, schedule)
values (
  'b7480b4b-bcdf-499f-9f7f-00a9ff543866',
  'c6afafd5-7ae6-43a4-b942-159785c83728',
  'Buggy sample app',
  'https://github.com/your-github-user/bugswarm-buggy-app',
  'main',
  'npm run dev',
  3000,
  'nightly'
);
