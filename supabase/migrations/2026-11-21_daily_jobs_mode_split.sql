-- R-PAY-07: one job paid in several modes (part Cash, part Online ...). Each mode's amount: [{ "mode": "Cash", "amount": 100 }, ...]
-- Without this column the Mode still shows "Cash + Online" but the amounts per mode are not kept (the rest of the job still saves).
-- Run once in Supabase -> SQL editor. Safe to run again.

alter table public.daily_jobs add column if not exists mode_split jsonb;

notify pgrst, 'reload schema';
