alter publication supabase_realtime add table public.runs, public.bugs;

-- One query for the /w cards. security_invoker keeps the caller's RLS in force.
create view public.workspace_summaries
with (security_invoker = true)
as
select
  w.id,
  w.name,
  w.created_at,
  coalesce(b.open_bugs, 0)::int as open_bugs,
  r.last_run_at
from public.workspaces w
left join lateral (
  select count(*) as open_bugs
  from public.projects p
  join public.bugs bg on bg.project_id = p.id and bg.status = 'open'
  where p.workspace_id = w.id
) b on true
left join lateral (
  select max(coalesce(rn.finished_at, rn.started_at, rn.created_at)) as last_run_at
  from public.projects p
  join public.runs rn on rn.project_id = p.id
  where p.workspace_id = w.id
) r on true;

grant select on public.workspace_summaries to authenticated;
revoke all on public.workspace_summaries from anon;

-- Project cards in a workspace: open bugs + latest run in one query.
create view public.project_summaries
with (security_invoker = true)
as
select
  p.id,
  p.workspace_id,
  p.name,
  p.repo_url,
  p.branch,
  p.live_url,
  p.schedule,
  p.created_at,
  coalesce(b.open_bugs, 0)::int as open_bugs,
  r.id as last_run_id,
  r.status as last_run_status,
  r.trigger as last_run_trigger,
  coalesce(r.finished_at, r.started_at, r.created_at) as last_run_at
from public.projects p
left join lateral (
  select count(*) as open_bugs from public.bugs bg where bg.project_id = p.id and bg.status = 'open'
) b on true
left join lateral (
  select rn.id, rn.status, rn.trigger, rn.finished_at, rn.started_at, rn.created_at
  from public.runs rn
  where rn.project_id = p.id
  order by rn.id desc
  limit 1
) r on true;

grant select on public.project_summaries to authenticated;
revoke all on public.project_summaries from anon;

-- Open bugs by severity for the dashboard header and health score (served by bugs_list_idx).
create view public.project_bug_counts
with (security_invoker = true)
as
select project_id, severity, count(*)::int as open_count
from public.bugs
where status = 'open'
group by project_id, severity;

grant select on public.project_bug_counts to authenticated;
revoke all on public.project_bug_counts from anon;
