-- The Phase 2 worker stored evidence as a JSON string containing JSON. Unwrap those rows into objects.
update public.bugs
set evidence = (evidence #>> '{}')::jsonb
where jsonb_typeof(evidence) = 'string';

-- Evidence is always an object; enforce it so a regression fails loudly instead of silently.
alter table public.bugs add constraint bugs_evidence_object check (jsonb_typeof(evidence) = 'object');
