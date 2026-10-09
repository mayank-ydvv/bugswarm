-- Single entry point for creating runs (Run now button, GitHub webhook, and later pg_cron).
-- Returns the existing active run instead of queueing a duplicate.
create function public.start_run(
  p uuid,
  trig public.run_trigger default 'manual',
  "full" boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  ws uuid;
  run_id bigint;
begin
  select workspace_id into ws from public.projects where id = p;

  if auth.role() is distinct from 'service_role' and (ws is null or not private.can_write(ws)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if ws is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- The unique partial index runs_active_idx makes this race-free.
  insert into public.runs (project_id, trigger, full_scan)
  values (p, trig, "full")
  on conflict (project_id) where status in ('queued', 'running') do nothing
  returning id into run_id;

  if run_id is null then
    select id into run_id from public.runs
    where project_id = p and status in ('queued', 'running');
    return run_id;
  end if;

  perform pgmq.send('runs', jsonb_build_object('run_id', run_id));
  return run_id;
end;
$$;

revoke execute on function public.start_run(uuid, public.run_trigger, boolean) from public, anon;
grant execute on function public.start_run(uuid, public.run_trigger, boolean) to authenticated, service_role;
