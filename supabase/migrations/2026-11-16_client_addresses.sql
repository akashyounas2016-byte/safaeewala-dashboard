-- R-CLI-09: more addresses of one client (another villa, office …), chosen when booking.
-- Without this column the extra addresses are left out on save (the rest of the client still saves).
-- Run once in Supabase → SQL editor. Safe to run again.

alter table public.clients add column if not exists addresses jsonb;  -- [{ id, label, address, area }]

notify pgrst, 'reload schema';
