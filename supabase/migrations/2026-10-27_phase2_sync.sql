-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 data-sync migration (audit AUD-02, AUD-03, AUD-04)          2026-10-27
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- SAFE TO RE-RUN: every statement uses "if not exists"; no data is changed or deleted.
-- Needs the owner's approval — this changes the LIVE database.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Cloud copy of business data that used to live only in the browser (AUD-02):
--    monthly client payments, pending / received items, advances, client adjustments,
--    attendance overrides, recurring contracts. One JSON value per key (src/lib/cloudState.ts).
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- The dashboard talks to Supabase with the public anon key (same as the other tables),
-- so the anon role needs read/write here. Tighten this when real Supabase Auth is added.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_state' and policyname = 'app_state_rw') then
    create policy app_state_rw on public.app_state for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- 2. Columns for every field the app saves (AUD-03 / AUD-04). If a column is missing,
--    Supabase rejects the WHOLE insert/update and the record only survives in one browser.
--    Existing columns are left untouched.

-- employees (Employee)
alter table public.employees add column if not exists full_name text;
alter table public.employees add column if not exists phone text;
alter table public.employees add column if not exists email text;
alter table public.employees add column if not exists role text;
alter table public.employees add column if not exists designation text;
alter table public.employees add column if not exists photo_url text;
alter table public.employees add column if not exists gender text;
alter table public.employees add column if not exists nationality text;
alter table public.employees add column if not exists emirates_id text;
alter table public.employees add column if not exists eid_start_date text;
alter table public.employees add column if not exists eid_end_date text;
alter table public.employees add column if not exists eid_file text;
alter table public.employees add column if not exists passport_number text;
alter table public.employees add column if not exists passport_start_date text;
alter table public.employees add column if not exists passport_expiry text;
alter table public.employees add column if not exists passport_end_date text;
alter table public.employees add column if not exists passport_file text;
alter table public.employees add column if not exists visa_number text;
alter table public.employees add column if not exists visa_start_date text;
alter table public.employees add column if not exists visa_expiry text;
alter table public.employees add column if not exists visa_end_date text;
alter table public.employees add column if not exists visa_file text;
alter table public.employees add column if not exists work_permit_number text;
alter table public.employees add column if not exists work_permit_start_date text;
alter table public.employees add column if not exists work_permit_expiry text;
alter table public.employees add column if not exists work_permit_end_date text;
alter table public.employees add column if not exists work_permit_file text;
alter table public.employees add column if not exists driving_license_no text;
alter table public.employees add column if not exists driving_license_place_of_issue text;
alter table public.employees add column if not exists driving_license_issue_date text;
alter table public.employees add column if not exists driving_license_expiry_date text;
alter table public.employees add column if not exists driving_license_type text;
alter table public.employees add column if not exists driving_license_file text;
alter table public.employees add column if not exists assigned_vehicle text;
alter table public.employees add column if not exists pay_rate_hourly numeric;
alter table public.employees add column if not exists monthly_salary numeric;
alter table public.employees add column if not exists medical_insurance text;
alter table public.employees add column if not exists medical_insurance_expiry text;
alter table public.employees add column if not exists medical_insurance_file text;
alter table public.employees add column if not exists joined_date text;
alter table public.employees add column if not exists end_date text;
alter table public.employees add column if not exists noc text;
alter table public.employees add column if not exists noc_file text;
alter table public.employees add column if not exists status text;
alter table public.employees add column if not exists skills jsonb;
alter table public.employees add column if not exists assigned_client_ids jsonb;
alter table public.employees add column if not exists agency_id text;
alter table public.employees add column if not exists agency_name text;
alter table public.employees add column if not exists documents jsonb;
alter table public.employees add column if not exists created_at text;

-- agencies (Agency)
alter table public.agencies add column if not exists name text;
alter table public.agencies add column if not exists company_type text;
alter table public.agencies add column if not exists contact_person text;
alter table public.agencies add column if not exists contact_persons jsonb;
alter table public.agencies add column if not exists phone text;
alter table public.agencies add column if not exists email text;
alter table public.agencies add column if not exists address text;
alter table public.agencies add column if not exists commission_rate numeric;
alter table public.agencies add column if not exists commission_type text;
alter table public.agencies add column if not exists fixed_commission_amount numeric;
alter table public.agencies add column if not exists payment_terms text;
alter table public.agencies add column if not exists termination_notice text;
alter table public.agencies add column if not exists notes text;
alter table public.agencies add column if not exists status text;
alter table public.agencies add column if not exists created_at text;
alter table public.agencies add column if not exists contract_ref text;
alter table public.agencies add column if not exists contract_start_date text;
alter table public.agencies add column if not exists contract_end_date text;
alter table public.agencies add column if not exists trade_license_no text;
alter table public.agencies add column if not exists license_issue_date text;
alter table public.agencies add column if not exists license_expiry_date text;
alter table public.agencies add column if not exists price numeric;
alter table public.agencies add column if not exists contracted_amount numeric;
alter table public.agencies add column if not exists trn_no text;
alter table public.agencies add column if not exists noc_no text;
alter table public.agencies add column if not exists sla_terms text;
alter table public.agencies add column if not exists replacement_guarantee text;
alter table public.agencies add column if not exists replacement_guarantee_enabled boolean;
alter table public.agencies add column if not exists quota_cleaners numeric;
alter table public.agencies add column if not exists documents jsonb;
alter table public.agencies add column if not exists emirates_id_no text;
alter table public.agencies add column if not exists emirates_id_issue_date text;
alter table public.agencies add column if not exists emirates_id_expiry_date text;
alter table public.agencies add column if not exists passport_no text;
alter table public.agencies add column if not exists passport_issue_date text;
alter table public.agencies add column if not exists passport_expiry_date text;
alter table public.agencies add column if not exists emergency_contact text;
alter table public.agencies add column if not exists workmen_comp_policy_no text;
alter table public.agencies add column if not exists bank_details jsonb;
alter table public.agencies add column if not exists payouts jsonb;

-- clients (Client)
alter table public.clients add column if not exists full_name text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists whatsapp text;
alter table public.clients add column if not exists nationality text;
alter table public.clients add column if not exists building_name text;
alter table public.clients add column if not exists apartment text;
alter table public.clients add column if not exists area text;
alter table public.clients add column if not exists city text;
alter table public.clients add column if not exists access_notes text;
alter table public.clients add column if not exists remarks text;
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists source text;
alter table public.clients add column if not exists pet_info text;
alter table public.clients add column if not exists preferred_cleaner text;
alter table public.clients add column if not exists advance_amount numeric;
alter table public.clients add column if not exists adjustment_amount numeric;
alter table public.clients add column if not exists pending_amount numeric;
alter table public.clients add column if not exists service_days jsonb;
alter table public.clients add column if not exists scheduled_time text;
alter table public.clients add column if not exists end_time text;
alter table public.clients add column if not exists duration_hours numeric;
alter table public.clients add column if not exists day_cleaner_assignments jsonb;
alter table public.clients add column if not exists day_schedules jsonb;
alter table public.clients add column if not exists total_bookings numeric;
alter table public.clients add column if not exists total_spent numeric;
alter table public.clients add column if not exists last_service text;
alter table public.clients add column if not exists created_at text;

-- bookings (Booking)
alter table public.bookings add column if not exists client_id text;
alter table public.bookings add column if not exists client_name text;
alter table public.bookings add column if not exists client_phone text;
alter table public.bookings add column if not exists service_address text;
alter table public.bookings add column if not exists service_type text;
alter table public.bookings add column if not exists status text;
alter table public.bookings add column if not exists frequency text;
alter table public.bookings add column if not exists scheduled_date text;
alter table public.bookings add column if not exists scheduled_time text;
alter table public.bookings add column if not exists end_time text;
alter table public.bookings add column if not exists duration_hours numeric;
alter table public.bookings add column if not exists assigned_crew jsonb;
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists total_amount numeric;
alter table public.bookings add column if not exists created_at text;
alter table public.bookings add column if not exists source text;

-- daily_jobs (DailyJob)
alter table public.daily_jobs add column if not exists created_at text;
alter table public.daily_jobs add column if not exists date text;
alter table public.daily_jobs add column if not exists staff_name text;
alter table public.daily_jobs add column if not exists start_time text;
alter table public.daily_jobs add column if not exists end_time text;
alter table public.daily_jobs add column if not exists duty_hours numeric;
alter table public.daily_jobs add column if not exists ot_hours numeric;
alter table public.daily_jobs add column if not exists address text;
alter table public.daily_jobs add column if not exists area text;
alter table public.daily_jobs add column if not exists material text;
alter table public.daily_jobs add column if not exists charges numeric;
alter table public.daily_jobs add column if not exists received numeric;
alter table public.daily_jobs add column if not exists payment_mode text;
alter table public.daily_jobs add column if not exists is_overtime boolean;
alter table public.daily_jobs add column if not exists remarks text;
alter table public.daily_jobs add column if not exists service text;
alter table public.daily_jobs add column if not exists booking_id text;
alter table public.daily_jobs add column if not exists status text;

-- Receivables / expenses additions (UX-13, UX-17, UX-18)
alter table public.invoices add column if not exists job_ids jsonb;
alter table public.invoices add column if not exists amount_paid numeric;
alter table public.daily_expenses add column if not exists receipt_url text;

-- 3. Make the API see the new table / columns immediately
notify pgrst, 'reload schema';
