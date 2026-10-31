-- ═══════════════════════════════════════════════════════════════════════════
-- Columns the app saves but the database did not have (cloud audit)       2026-11-01
-- Without them the outbox dropped these fields, so they never reached the cloud.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Daily Job Sheet: team / project name of a shift (added by the spreadsheet redesign)
alter table public.daily_jobs add column if not exists team_name text;

notify pgrst, 'reload schema';
