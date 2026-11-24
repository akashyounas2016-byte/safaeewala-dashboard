-- ═══════════════════════════════════════════════════════════════════════════
-- Field logins (cleaners, drivers) — the last tables they could still read in full (R-SEC-10)   2026-11-24
-- Owner: "Cleaner ki profile ko restrict karein taake unhein sirf apni assigned bookings aur duties nazar
-- ayen, aur deegar employees ya general data hidden rahay."
--
-- 2026-11-05_field_login_rows.sql (already run) limits jobs, clients, employees, bookings, invoices,
-- expenses, inventory, agencies, leads and the app state. Still open to any signed-in login were:
--   audit_log         every change in the CRM with before / after copies (client data, payments, salaries)
--   job_checkins      every cleaner's job steps with the place they were pressed
--   driver_locations  every person's live position
--   attendance_marks  everyone's attendance, leave and reasons
--   employees         the drivers' full records (salary, passport, Emirates ID…) — My Duties only needs
--                     the driver's name and phone: those now come from field_staff_directory()
-- Now a Driver / Cleaner login reads only its own rows there (unless the admin ticked a screen that
-- uses the table for its column in Settings → Roles & Access). Office logins are not affected.
-- Writes are not changed (job steps, location, leave requests keep working).
--
-- Run AFTER 2026-11-05_field_login_rows.sql. HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- The signed-in field login's own name, lower case (for tables keyed by name)
create or replace function public.my_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select lower(trim(e.full_name)) from public.employees e where e.id = public.my_employee_id()
$$;
revoke execute on function public.my_staff_name() from public, anon;
grant execute on function public.my_staff_name() to authenticated;

-- Drivers' name and phone for My Duties ("your driver"), without the rest of their record
create or replace function public.field_staff_directory()
returns table (id text, full_name text, short_name text, role text, phone text)
language sql stable security definer set search_path = public as $$
  select e.id::text, e.full_name, e.short_name, e.role, e.phone
  from public.employees e
  where public.is_active_user() and e.role = 'driver' and coalesce(e.status, 'active') <> 'inactive'
$$;
revoke execute on function public.field_staff_directory() from public, anon;
grant execute on function public.field_staff_directory() to authenticated;

-- employees: a field login reads only its own record now (was: own record + every driver's full record)
drop policy if exists employees_field_read on public.employees;
create policy employees_field_read on public.employees as restrictive for select to authenticated
  using (not public.is_field_login()
         or public.role_can(array['Employees','Agencies','Attendance','Daily Job Sheet','Drivers','Bookings','Expenses'])
         or id = public.my_employee_id());

-- Restrictive policies: added ON TOP of the existing read policies (both must allow)
drop policy if exists audit_log_field_read on public.audit_log;
create policy audit_log_field_read on public.audit_log as restrictive for select to authenticated
  using (not public.is_field_login() or public.role_can(array['Settings']));

drop policy if exists job_checkins_field_read on public.job_checkins;
create policy job_checkins_field_read on public.job_checkins as restrictive for select to authenticated
  using (
    not public.is_field_login()
    or public.role_can(array['Daily Job Sheet', 'Drivers', 'Attendance', 'Overview'])
    or employee_id = public.my_employee_id()
    or lower(trim(cleaner)) = public.my_staff_name()
    -- a driver sees the steps of the jobs on the route (yesterday to 7 days ahead, like the jobs)
    or (public.current_perm_role() = 'driver'
        and date between to_char((now() at time zone 'Asia/Dubai')::date - 1, 'YYYY-MM-DD')
                     and to_char((now() at time zone 'Asia/Dubai')::date + 7, 'YYYY-MM-DD'))
  );

drop policy if exists driver_locations_field_read on public.driver_locations;
create policy driver_locations_field_read on public.driver_locations as restrictive for select to authenticated
  using (not public.is_field_login() or public.role_can(array['Overview', 'Drivers']) or employee_id = public.my_employee_id());

drop policy if exists attendance_marks_field_read on public.attendance_marks;
create policy attendance_marks_field_read on public.attendance_marks as restrictive for select to authenticated
  using (
    not public.is_field_login()
    or public.role_can(array['Attendance', 'Daily Job Sheet', 'Employees'])
    or cleaner_key = 'id:' || public.my_employee_id()
    or lower(trim(coalesce(cleaner_name, ''))) = public.my_staff_name()
    or lower(trim(cleaner_key)) = public.my_staff_name()
  );

-- Check after running (as admin every row shows; signed in as a cleaner only their own):
-- select public.current_perm_role(), public.is_field_login(), public.my_staff_name();
-- select * from public.field_staff_directory();

notify pgrst, 'reload schema';
