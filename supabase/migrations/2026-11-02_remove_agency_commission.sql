-- ═══════════════════════════════════════════════════════════════════════════
-- Agencies work on a fixed-price contract — no commission (DEC-016)        2026-11-02
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.agencies drop column if exists commission_rate;
alter table public.agencies drop column if exists commission_type;
alter table public.agencies drop column if exists fixed_commission_amount;

notify pgrst, 'reload schema';
