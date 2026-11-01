-- ═══════════════════════════════════════════════════════════════════════════
-- R-OT-01: is_overtime means "this whole shift is OT"                     2026-11-02
-- The app used to set it whenever a shift had ANY OT, so the whole duty then showed as OT
-- (e.g. a 09:00-12:00 shift showing 3h OT). No screen can set this flag by hand, so the
-- flags in this table came from that bug.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

update public.daily_jobs set is_overtime = false where is_overtime = true;
