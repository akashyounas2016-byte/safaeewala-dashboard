-- ═══════════════════════════════════════════════════════════════════════════
-- Monthly bookings keep their contract day (R-BK-03, E2E-22)                2026-11-02
-- Without it a booking on the 31st moved to the 28th in February and stayed there.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.bookings add column if not exists recurrence_day smallint check (recurrence_day between 1 and 31);

notify pgrst, 'reload schema';
