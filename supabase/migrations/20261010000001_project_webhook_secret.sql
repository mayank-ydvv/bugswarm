-- Per-project GitHub webhook secrets. A single server-wide secret would have to be handed to every
-- user, and anyone holding it could forge pushes for every repo on the server. With one secret per
-- project, a push only starts runs for the projects whose own secret signed it.

alter table public.projects
  add column webhook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex');

-- Hide the column from direct reads: clients keep every other column, and owners/members read the
-- secret through project_webhook_secret() below. (The worker and the webhook use the service role.)
revoke select on public.projects from anon, authenticated;
grant select (id, workspace_id, name, repo_url, branch, live_url, start_cmd, port, schedule, last_scanned_sha, created_at)
  on public.projects to authenticated;

create function public.project_webhook_secret(p uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select webhook_secret from public.projects where id = p and private.can_write(workspace_id);
$$;

-- A new secret invalidates the old one at once: the repo's webhook must be updated to match.
create function public.rotate_project_webhook_secret(p uuid)
returns text
language sql
security definer
set search_path = public
as $$
  update public.projects
  set webhook_secret = encode(extensions.gen_random_bytes(32), 'hex')
  where id = p and private.can_write(workspace_id)
  returning webhook_secret;
$$;

revoke execute on function public.project_webhook_secret(uuid), public.rotate_project_webhook_secret(uuid) from public, anon;
grant execute on function public.project_webhook_secret(uuid), public.rotate_project_webhook_secret(uuid) to authenticated;
