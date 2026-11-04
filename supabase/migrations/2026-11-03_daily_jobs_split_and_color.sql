-- ═══════════════════════════════════════════════════════════════════════════
-- Daily jobs: per-cleaner money of a team job + row colour reach the cloud (R-PAY-05, R-SYNC-11)   2026-11-03
-- charge_split:   Split Mode of a team job — one entry per cleaner, e.g.
--                 [{"cleaner":"Adnan","charges":150,"received":100,"payment_mode":"Cash"}, …].
--                 The job's charges / received are the totals of the entries.
-- row_color:      the row colour chosen in Add Job / Excel Job Sheet. The column was missing, so the
--                 colour stayed in one browser and was gone on every other device.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.daily_jobs add column if not exists charge_split jsonb;
alter table public.daily_jobs add column if not exists row_color text;

notify pgrst, 'reload schema';
