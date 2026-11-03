-- ═══════════════════════════════════════════════════════════════════════════
-- Daily jobs: who collected the cash + row colour reach the cloud (R-PAY-05, R-SYNC-11)   2026-11-03
-- received_split: on a team job, the cash each cleaner collected, e.g. {"Adnan": 100, "Arjun Singh": 50}.
--                 Received stays the total; the split only says who holds which part.
-- row_color:      the row colour chosen in Add Job / Excel Job Sheet. The column was missing, so the
--                 colour stayed in one browser and was gone on every other device.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.daily_jobs add column if not exists received_split jsonb;
alter table public.daily_jobs add column if not exists row_color text;

notify pgrst, 'reload schema';
