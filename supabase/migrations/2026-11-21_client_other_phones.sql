-- R-CLI-14: more phone numbers of one client ("Add another number" in Add New Client / Edit Client).
-- Without this column the extra numbers are left out on save (the rest of the client still saves).
-- Run once in Supabase -> SQL editor. Safe to run again.

alter table public.clients add column if not exists other_phones jsonb;  -- ["+971 50 123 4567", ...]

notify pgrst, 'reload schema';
