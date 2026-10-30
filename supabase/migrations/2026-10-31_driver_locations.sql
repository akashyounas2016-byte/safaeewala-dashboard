-- ═══════════════════════════════════════════════════════════════════════════
-- Driver live location (R-DRV-03)                                       2026-10-31
-- Run AFTER 2026-10-30_initial_schema_and_auth.sql (uses profiles + is_active_user()).
-- HOW TO RUN: Supabase → SQL Editor → paste this file → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.driver_locations (
  employee_id text primary key,            -- public.employees.id of the driver
  lat         double precision not null,
  lng         double precision not null,
  accuracy    double precision,
  speed       double precision,
  sharing     boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.driver_locations enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'driver_locations' loop
    execute format('drop policy if exists %I on public.driver_locations', p.policyname);
  end loop;
end $$;

-- Office users (and the driver) can see positions
create policy driver_locations_read on public.driver_locations
  for select to authenticated using (public.is_active_user());

-- A driver can only write the row of the employee linked to their own login
create policy driver_locations_own_insert on public.driver_locations
  for insert to authenticated
  with check (employee_id = (select employee_id from public.profiles where id = auth.uid() and status = 'active'));
create policy driver_locations_own_update on public.driver_locations
  for update to authenticated
  using (employee_id = (select employee_id from public.profiles where id = auth.uid() and status = 'active'))
  with check (employee_id = (select employee_id from public.profiles where id = auth.uid() and status = 'active'));

notify pgrst, 'reload schema';
