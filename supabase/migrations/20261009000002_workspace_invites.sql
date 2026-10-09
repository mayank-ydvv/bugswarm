-- ============================================================================================
-- Workspace invites. The owner gets a one-time link; only sha256(token) is stored, so a database
-- leak exposes no usable links. Accepting requires signing in with the invited email address.
-- ============================================================================================
alter table public.workspace_members add column created_at timestamptz not null default now();

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'member' check (role in ('member', 'viewer')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
-- One pending invite per address per workspace (re-inviting replaces it).
create unique index workspace_invites_pending_idx on public.workspace_invites (workspace_id, email)
  where accepted_at is null;

alter table public.workspace_invites enable row level security;
-- Owners see their workspaces' invites (never the token: only its hash is stored).
create policy invites_select on public.workspace_invites for select to authenticated
  using (private.is_owner(workspace_id));
create policy invites_delete on public.workspace_invites for delete to authenticated
  using (private.is_owner(workspace_id) and accepted_at is null);
revoke insert, update on public.workspace_invites from anon, authenticated;

-- Members may leave a workspace themselves (owners cannot orphan it).
create policy members_leave on public.workspace_members for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

-- Only owners change roles, and nobody can make or demote an owner through this path.
drop policy members_update on public.workspace_members;
create policy members_update on public.workspace_members for update to authenticated
  using (private.is_owner(workspace_id) and role <> 'owner')
  with check (private.is_owner(workspace_id) and role in ('member', 'viewer'));
revoke update on public.workspace_members from authenticated;
grant update (role) on public.workspace_members to authenticated;
-- Members are added only by accepting an invite (or the owner trigger).
drop policy members_insert on public.workspace_members;
revoke insert on public.workspace_members from authenticated;

create function private.hash_token(token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(token, 'sha256'), 'hex');
$$;
revoke execute on function private.hash_token(text) from public, anon, authenticated;

-- Owner creates (or re-creates) an invite. Returns the plaintext token exactly once.
create function public.create_workspace_invite(ws uuid, invite_email text, invite_role text default 'member')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  normalized text := lower(trim(invite_email));
begin
  if not private.is_owner(ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if invite_role not in ('member', 'viewer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = ws and lower(u.email) = normalized
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;

  delete from public.workspace_invites where workspace_id = ws and email = normalized and accepted_at is null;
  insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by)
  values (ws, normalized, invite_role, private.hash_token(token), (select auth.uid()));
  return token;
end;
$$;

-- What the invite page shows before accepting. Reveals nothing for invalid tokens.
create function public.peek_workspace_invite(token text)
returns table (workspace_name text, role text, email_matches boolean, expired boolean, accepted boolean)
language sql
stable
security definer
set search_path = public
as $$
  select w.name, i.role,
    i.email = lower((select email from auth.users where id = (select auth.uid()))),
    i.expires_at < now(),
    i.accepted_at is not null
  from public.workspace_invites i join public.workspaces w on w.id = i.workspace_id
  where i.token_hash = private.hash_token(token);
$$;

-- Accept: the caller's email must match the invite. Returns the workspace id.
create function public.accept_workspace_invite(token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites;
  me uuid := (select auth.uid());
  my_email text;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into inv from public.workspace_invites where token_hash = private.hash_token(token) for update;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invite is invalid or expired' using errcode = 'P0002';
  end if;
  select lower(email) into my_email from auth.users where id = me;
  if my_email is distinct from inv.email then
    raise exception 'this invite is for a different email address' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, me, inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now(), accepted_by = me where id = inv.id;
  return inv.workspace_id;
end;
$$;

-- Members list with emails (auth.users is not readable directly). Members of the workspace only.
create function public.list_workspace_members(ws uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = ws and private.is_member(ws)
  order by case m.role when 'owner' then 0 when 'member' then 1 else 2 end, m.created_at;
$$;

revoke execute on function public.create_workspace_invite(uuid, text, text) from public, anon;
revoke execute on function public.peek_workspace_invite(text) from public, anon;
revoke execute on function public.accept_workspace_invite(text) from public, anon;
revoke execute on function public.list_workspace_members(uuid) from public, anon;
grant execute on function public.create_workspace_invite(uuid, text, text) to authenticated;
grant execute on function public.peek_workspace_invite(text) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
