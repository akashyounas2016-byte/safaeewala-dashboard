-- R-EMP-11: Add Employee → Role & Sourcing has Total Duty Hours (per day) and Date of Birth.
-- Without these columns Supabase drops the two fields on save. Run once in Supabase → SQL editor. Safe to run again.

alter table public.employees add column if not exists date_of_birth     text;     -- YYYY-MM-DD
alter table public.employees add column if not exists total_duty_hours  numeric;  -- hours per day, e.g. 8

notify pgrst, 'reload schema';
