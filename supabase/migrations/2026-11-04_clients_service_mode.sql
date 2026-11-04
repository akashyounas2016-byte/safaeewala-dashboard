-- ═══════════════════════════════════════════════════════════════════════════
-- Clients: service mode + Bi-Weekly plan (R-CLI-02)   2026-11-04
-- service_mode:   'general' | 'biweekly' | 'monthly', chosen in Add New Client → Mode.
-- biweekly_plan:  {"days":["Monday",…],"day_schedules":{"Monday":{"startTime":"09:00","endTime":"13:00",
--                  "cleaner":"Adnan","duration":4}},"start_date":"2026-11-10","months":3}
-- Until this runs, the app leaves these two fields out when it saves a client (nothing else is lost).
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clients add column if not exists service_mode text;
alter table public.clients add column if not exists biweekly_plan jsonb;

notify pgrst, 'reload schema';
