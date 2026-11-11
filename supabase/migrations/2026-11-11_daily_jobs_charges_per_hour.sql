-- UX-138: Excel Job Sheet → Charges (hrs) is typed by hand and saved on the job.
-- Without this column the value is dropped on save (the rest of the row still saves). Run once in Supabase → SQL editor. Safe to run again.

alter table public.daily_jobs add column if not exists charges_per_hour numeric;  -- AED per hour

notify pgrst, 'reload schema';
