-- R-EMP-09 / R-EMP-10: the employee fields added on 2026-11-09 (Add Employee redesign, Under Training) had no
-- database columns, so Supabase dropped them on save: they showed until a reload and then were gone, and the
-- "training period ended" alert never fired. Run once in Supabase → SQL editor. Safe to run again.

alter table public.employees add column if not exists short_name             text;
alter table public.employees add column if not exists basic_salary           numeric;
alter table public.employees add column if not exists other_documents_file   text;     -- "storage:<path>" (R-DOC-02)
alter table public.employees add column if not exists training_start_date    text;     -- YYYY-MM-DD (Dubai)
alter table public.employees add column if not exists training_end_date      text;     -- YYYY-MM-DD (Dubai)
alter table public.employees add column if not exists training_duration_days integer;
alter table public.employees add column if not exists notes                  text;

notify pgrst, 'reload schema';
