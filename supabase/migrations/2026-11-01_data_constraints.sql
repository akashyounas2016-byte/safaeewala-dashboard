-- ═══════════════════════════════════════════════════════════════════════════
-- Database-level data rules (TA-20, VAL-07, VAL-08)                       2026-11-01
-- Run AFTER 2026-10-30_initial_schema_and_auth.sql, and after cleaning what
-- Settings → Data health lists (duplicates).
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
--
-- CHECK rules are added NOT VALID: they apply to every new or changed row, old rows are
-- not checked. Run section 3 to see old rows that break them; fix those, then VALIDATE.
-- Unique indexes are only created when no duplicates exist — otherwise a NOTICE says so.
-- The same limits are in src/lib/schemas.ts (TA-19).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Money and hours ──
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_jobs_money_ok') then
    alter table public.daily_jobs add constraint daily_jobs_money_ok
      check (coalesce(charges, 0) >= 0 and coalesce(received, 0) >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_jobs_hours_ok') then
    alter table public.daily_jobs add constraint daily_jobs_hours_ok
      check (coalesce(duty_hours, 0) between 0 and 24 and coalesce(ot_hours, 0) between 0 and 24) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_jobs_date_ok') then
    alter table public.daily_jobs add constraint daily_jobs_date_ok
      check (date is null or date ~ '^\d{4}-\d{2}-\d{2}') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_expenses_amount_ok') then
    alter table public.daily_expenses add constraint daily_expenses_amount_ok
      check (coalesce(amount, 0) >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_amounts_ok') then
    alter table public.invoices add constraint invoices_amounts_ok
      check (coalesce(total, 0) >= 0 and coalesce(amount_paid, 0) >= 0) not valid;
  end if;
end $$;

-- ── 2. One invoice number, one Emirates ID ──
do $$
begin
  if exists (select invoice_number from public.invoices where coalesce(invoice_number, '') <> ''
             group by invoice_number having count(*) > 1) then
    raise notice 'invoices: duplicate invoice numbers exist — unique index NOT created. Fix them, then run this file again.';
  else
    create unique index if not exists invoices_number_unique
      on public.invoices (invoice_number) where coalesce(invoice_number, '') <> '';
  end if;

  if exists (select regexp_replace(emirates_id, '\D', '', 'g') from public.employees
             where length(regexp_replace(coalesce(emirates_id, ''), '\D', '', 'g')) = 15
             group by 1 having count(*) > 1) then
    raise notice 'employees: two records share an Emirates ID (see Settings → Data health) — unique index NOT created.';
  else
    create unique index if not exists employees_emirates_id_unique
      on public.employees ((regexp_replace(emirates_id, '\D', '', 'g')))
      where length(regexp_replace(coalesce(emirates_id, ''), '\D', '', 'g')) = 15;
  end if;
end $$;

-- ── 3. Old rows that break the rules (read-only report — fix these, then validate) ──
-- select 'daily_jobs' as tbl, id, charges, received, duty_hours, ot_hours, date from public.daily_jobs
--   where coalesce(charges,0) < 0 or coalesce(received,0) < 0
--      or coalesce(duty_hours,0) not between 0 and 24 or coalesce(ot_hours,0) not between 0 and 24
--      or (date is not null and date !~ '^\d{4}-\d{2}-\d{2}');
-- When that returns nothing:
-- alter table public.daily_jobs validate constraint daily_jobs_money_ok;
-- alter table public.daily_jobs validate constraint daily_jobs_hours_ok;
-- alter table public.daily_jobs validate constraint daily_jobs_date_ok;
-- alter table public.daily_expenses validate constraint daily_expenses_amount_ok;
-- alter table public.invoices validate constraint invoices_amounts_ok;
