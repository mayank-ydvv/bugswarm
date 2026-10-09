-- ============================================================================================
-- Scheduled runs (pg_cron)
-- ============================================================================================
create extension if not exists pg_cron;

-- Queue one run per project on this schedule, skipping projects that already have an active run.
-- Set-based: one INSERT ... SELECT and one pgmq.send_batch, no loops. Nightly runs are full scans.
create function public.enqueue_scheduled(freq public.run_schedule)
returns int
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  ids bigint[];
begin
  with ins as (
    insert into public.runs (project_id, trigger, full_scan)
    select p.id, 'schedule', (freq = 'nightly')
    from public.projects p
    where p.schedule = freq
      and not exists (
        select 1 from public.runs r where r.project_id = p.id and r.status in ('queued', 'running')
      )
    -- Belt and braces: a "Run now" committed between the NOT EXISTS check and this insert.
    on conflict (project_id) where status in ('queued', 'running') do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into ids from ins;

  if cardinality(ids) > 0 then
    perform pgmq.send_batch(
      'runs',
      (select array_agg(jsonb_build_object('run_id', i)) from unnest(ids) as i)
    );
  end if;
  return cardinality(ids);
end;
$$;

revoke execute on function public.enqueue_scheduled(public.run_schedule) from public, anon, authenticated;
grant execute on function public.enqueue_scheduled(public.run_schedule) to service_role;

-- 02:13 UTC = 07:43 IST. Must match web/lib/schedule.ts.
select cron.schedule('bugswarm-hourly', '7 * * * *', $$select public.enqueue_scheduled('hourly')$$);
select cron.schedule('bugswarm-nightly', '13 2 * * *', $$select public.enqueue_scheduled('nightly')$$);

-- ============================================================================================
-- Auto-verify: a fixed bug that stays absent in the next full scan becomes "verified by run #N".
-- ============================================================================================
alter table public.bugs
  add column fixed_run bigint references public.runs (id) on delete set null,
  add column verified_run bigint references public.runs (id) on delete set null;

-- ============================================================================================
-- Per-workspace Gemini key, encrypted with Supabase Vault. Only the secret's id is stored here;
-- the plaintext is readable only by the worker's database role.
-- ============================================================================================
alter table public.workspaces add column gemini_secret_id uuid;

-- Owners only. Creates or replaces the workspace's secret.
create function public.set_workspace_gemini_key(ws uuid, api_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
begin
  if not private.is_owner(ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if api_key is null or length(api_key) not between 20 and 200 or api_key ~ '\s' then
    raise exception 'invalid key' using errcode = '22023';
  end if;

  select gemini_secret_id into existing from public.workspaces where id = ws;
  if existing is null then
    update public.workspaces
    set gemini_secret_id = vault.create_secret(api_key, 'gemini:' || ws::text, 'BugSwarm workspace Gemini key')
    where id = ws;
  else
    perform vault.update_secret(existing, api_key);
  end if;
end;
$$;

create function public.clear_workspace_gemini_key(ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
begin
  if not private.is_owner(ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select gemini_secret_id into existing from public.workspaces where id = ws;
  update public.workspaces set gemini_secret_id = null where id = ws;
  if existing is not null then
    delete from vault.secrets where id = existing;
  end if;
end;
$$;

revoke execute on function public.set_workspace_gemini_key(uuid, text) from public, anon;
revoke execute on function public.clear_workspace_gemini_key(uuid) from public, anon;
grant execute on function public.set_workspace_gemini_key(uuid, text) to authenticated;
grant execute on function public.clear_workspace_gemini_key(uuid) to authenticated;
