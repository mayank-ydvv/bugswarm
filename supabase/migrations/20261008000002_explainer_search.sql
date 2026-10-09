-- Explainer output that feeds the fix prompt ("Expected: ...").
alter table public.bugs add column expected text;

-- The explainer pulls the oldest unexplained bugs of one project at a time.
drop index if exists public.bugs_unexplained_idx;
create index bugs_unexplained_idx on public.bugs (project_id, id) where not explained;

-- Bug list search is `title ILIKE '%q%' OR file ILIKE '%q%'`; trigram indexes keep it fast.
create extension if not exists pg_trgm with schema extensions;
create index bugs_title_trgm_idx on public.bugs using gin (title extensions.gin_trgm_ops);
create index bugs_file_trgm_idx on public.bugs using gin (file extensions.gin_trgm_ops);
