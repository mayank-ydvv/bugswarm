-- Evidence files (screenshots, videos, logs) uploaded by the worker under <project_id>/<run_id>/<file>.
-- Private: the web app serves them through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 10485760)
on conflict (id) do nothing;

-- Members can read their projects' evidence. Only the worker (service role) writes.
create policy evidence_select on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] in (select private.my_project_ids()::text)
  );
