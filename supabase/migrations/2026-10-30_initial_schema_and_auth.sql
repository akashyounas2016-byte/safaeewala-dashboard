-- ═══════════════════════════════════════════════════════════════════════════
-- Initial schema + secure login (SEC-01, SEC-03, AUD-02/03/04)        2026-10-30
--
-- WHY: the live Supabase project had NO tables, so every record lived only in the
-- browser that created it. This file creates every table the app uses, the user
-- profiles for login, and row-level security so only signed-in, active users can
-- read or write data. Replaces 2026-10-27_phase2_sync.sql (do not run that one).
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- SAFE TO RE-RUN: tables/columns use "if not exists"; policies are dropped and re-created.
-- Nothing here deletes data.
--
-- AFTER RUNNING: create the first admin (docs/setup-auth.md, step 3).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Business tables (columns generated from src/types/index.ts) ──

-- bookings (Booking)
create table if not exists public.bookings (
  id text primary key,
  created_at text default (now()::text)
);
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
alter table public.bookings add column if not exists material text;
alter table public.bookings add column if not exists assigned_crew jsonb;
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists total_amount numeric;
alter table public.bookings add column if not exists source text;
alter table public.bookings add column if not exists is_sheet_synced boolean;
alter table public.bookings add column if not exists received_amount numeric;
alter table public.bookings add column if not exists pending_due numeric;
alter table public.bookings add column if not exists is_partially_paid boolean;
alter table public.bookings add column if not exists job_sheet_id text;

-- clients (Client)
create table if not exists public.clients (
  id text primary key,
  created_at text default (now()::text)
);
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

-- agencies (Agency)
create table if not exists public.agencies (
  id text primary key,
  created_at text default (now()::text)
);
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

-- employees (Employee)
create table if not exists public.employees (
  id text primary key,
  created_at text default (now()::text)
);
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

-- invoices (Invoice)
create table if not exists public.invoices (
  id text primary key,
  created_at text default (now()::text)
);
alter table public.invoices add column if not exists invoice_number text;
alter table public.invoices add column if not exists booking_id text;
alter table public.invoices add column if not exists client_id text;
alter table public.invoices add column if not exists client_name text;
alter table public.invoices add column if not exists client_address text;
alter table public.invoices add column if not exists trn text;
alter table public.invoices add column if not exists company_trn text;
alter table public.invoices add column if not exists line_items jsonb;
alter table public.invoices add column if not exists subtotal numeric;
alter table public.invoices add column if not exists vat_amount numeric;
alter table public.invoices add column if not exists vat_rate numeric;
alter table public.invoices add column if not exists total numeric;
alter table public.invoices add column if not exists status text;
alter table public.invoices add column if not exists due_date text;
alter table public.invoices add column if not exists paid_date text;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists apply_vat boolean;
alter table public.invoices add column if not exists discount_type text;
alter table public.invoices add column if not exists discount_value numeric;
alter table public.invoices add column if not exists discount_amount numeric;
alter table public.invoices add column if not exists job_ids jsonb;
alter table public.invoices add column if not exists amount_paid numeric;

-- inventory (InventoryItem)
create table if not exists public.inventory (
  id text primary key,
  created_at text default (now()::text)
);
alter table public.inventory add column if not exists name text;
alter table public.inventory add column if not exists category text;
alter table public.inventory add column if not exists unit text;
alter table public.inventory add column if not exists current_stock numeric;
alter table public.inventory add column if not exists min_stock numeric;
alter table public.inventory add column if not exists reorder_quantity numeric;
alter table public.inventory add column if not exists unit_cost numeric;
alter table public.inventory add column if not exists supplier text;
alter table public.inventory add column if not exists location text;
alter table public.inventory add column if not exists last_restocked text;

-- daily_jobs (DailyJob)
create table if not exists public.daily_jobs (
  id text primary key,
  created_at text default (now()::text)
);
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

-- daily_expenses (DailyExpense)
create table if not exists public.daily_expenses (
  id text primary key,
  created_at text default (now()::text)
);
alter table public.daily_expenses add column if not exists date text;
alter table public.daily_expenses add column if not exists name text;
alter table public.daily_expenses add column if not exists category text;
alter table public.daily_expenses add column if not exists amount numeric;
alter table public.daily_expenses add column if not exists source text;
alter table public.daily_expenses add column if not exists payment_method text;
alter table public.daily_expenses add column if not exists reference_number text;
alter table public.daily_expenses add column if not exists vendor text;
alter table public.daily_expenses add column if not exists notes text;
alter table public.daily_expenses add column if not exists receipt_url text;

-- fluent_form_leads (FluentFormLead)
create table if not exists public.fluent_form_leads (
  id text primary key,
  created_at text default (now()::text)
);
alter table public.fluent_form_leads add column if not exists form_id text;
alter table public.fluent_form_leads add column if not exists form_title text;
alter table public.fluent_form_leads add column if not exists entry_id text;
alter table public.fluent_form_leads add column if not exists source_url text;
alter table public.fluent_form_leads add column if not exists page_source text;
alter table public.fluent_form_leads add column if not exists category text;
alter table public.fluent_form_leads add column if not exists client_name text;
alter table public.fluent_form_leads add column if not exists email text;
alter table public.fluent_form_leads add column if not exists phone text;
alter table public.fluent_form_leads add column if not exists whatsapp text;
alter table public.fluent_form_leads add column if not exists address text;
alter table public.fluent_form_leads add column if not exists area text;
alter table public.fluent_form_leads add column if not exists property_type text;
alter table public.fluent_form_leads add column if not exists preferred_date text;
alter table public.fluent_form_leads add column if not exists preferred_time text;
alter table public.fluent_form_leads add column if not exists service text;
alter table public.fluent_form_leads add column if not exists message text;
alter table public.fluent_form_leads add column if not exists estimated_value numeric;
alter table public.fluent_form_leads add column if not exists status text;
alter table public.fluent_form_leads add column if not exists booking_id text;
alter table public.fluent_form_leads add column if not exists raw_data jsonb;
alter table public.fluent_form_leads add column if not exists responded_at text;

create index if not exists daily_jobs_date_idx on public.daily_jobs (date);
create index if not exists daily_expenses_date_idx on public.daily_expenses (date);

-- ── 2. Shared app data, settings, audit log ──
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id   int primary key,
  data jsonb not null default '{}'::jsonb
);
insert into public.company_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  user_name   text,
  action      text,
  entity      text,
  entity_id   text,
  entity_name text,
  details     text
);
create index if not exists audit_log_entity_idx on public.audit_log (entity_id);

-- ── 3. User profiles: one per login. Only an admin creates users (no sign-up). ──
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  login_id      text not null unique,
  email         text,
  full_name     text not null default '',
  role          text not null default 'employee' check (role in ('admin', 'manager', 'employee')),
  employee_id   text,
  status        text not null default 'active' check (status in ('active', 'disabled')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Role of the signed-in user (null when signed out, disabled or without a profile).
-- security definer so the policies below can read profiles without recursion.
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

-- ── 4. Row-level security: signed-in active users only; the public key alone gets nothing ──
do $$
declare
  t text;
  p record;
begin
  -- business tables: read / add / edit for active users, delete for admin + manager
  foreach t in array array['bookings','clients','agencies','employees','invoices','inventory','daily_jobs','daily_expenses','fluent_form_leads','app_state'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_active_user())', t || '_add', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_active_user()) with check (public.is_active_user())', t || '_edit', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.current_app_role() in (%L, %L))', t || '_delete', t, 'admin', 'manager');
  end loop;

  -- settings: everyone signed in reads, only admin writes
  alter table public.company_settings enable row level security;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'company_settings' loop
    execute format('drop policy if exists %I on public.company_settings', p.policyname);
  end loop;
  create policy company_settings_read on public.company_settings for select to authenticated using (public.is_active_user());
  create policy company_settings_write on public.company_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

  -- audit log: everyone signed in can add and read (row history); nobody edits or deletes
  alter table public.audit_log enable row level security;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log' loop
    execute format('drop policy if exists %I on public.audit_log', p.policyname);
  end loop;
  create policy audit_log_add on public.audit_log for insert to authenticated with check (public.is_active_user());
  create policy audit_log_read on public.audit_log for select to authenticated using (public.is_active_user());

  -- profiles: a user reads their own profile, admin reads all. Creating users and changing
  -- roles goes through the server (service key), so nobody can make themselves admin.
  alter table public.profiles enable row level security;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy if exists %I on public.profiles', p.policyname);
  end loop;
  create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
end $$;

-- A signed-in user may record their own last login time (nothing else)
create or replace function public.touch_last_login() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_login_at = now() where id = auth.uid()
$$;
revoke execute on function public.touch_last_login() from public, anon;
grant execute on function public.touch_last_login() to authenticated;

-- ── 5. Make the API see the new tables immediately ──
notify pgrst, 'reload schema';
