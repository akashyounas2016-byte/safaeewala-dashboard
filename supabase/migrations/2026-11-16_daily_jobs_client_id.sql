-- R-DATA-12: each job row keeps the id of the client it belongs to, so a renamed client or an edited
-- address no longer splits a client in two or makes duplicate monthly visits.
-- Without this column the app still works (the field is left out on save, matched by address as before).
-- Run once in Supabase → SQL editor. Safe to run again.

alter table public.daily_jobs add column if not exists client_id text;
create index if not exists daily_jobs_client_id_idx on public.daily_jobs (client_id);

notify pgrst, 'reload schema';
