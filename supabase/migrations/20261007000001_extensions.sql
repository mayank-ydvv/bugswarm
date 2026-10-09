-- Supabase Queues. The worker reads this queue directly over Postgres; it is never exposed via the API.
create extension if not exists pgmq;

select pgmq.create('runs');
