-- ═══════════════════════════════════════════════════════════════════════════
-- Field logins (drivers, cleaners) read only their own data (SEC-A03, R-SEC-07)   2026-11-05
-- Before: a cleaner / driver login was limited to My Duties in the app only. With its token it could
-- still read every client's phone, every invoice and every salary straight from the API.
--
-- Now an Employee login linked to a staff record uses that person's staff role, like the app's
-- Settings → Roles & Access columns: Supervisor, Driver, Cleaner (other field roles = Cleaner).
--  - Supervisor: works like Employee (the screens the admin ticks).
--  - Driver / Cleaner: for each table, full access only when the admin ticked a screen that uses it.
--    Otherwise they read only their own data and write nothing (job progress and location have
--    their own tables and rules):
--      daily_jobs  cleaner: jobs with their name · driver: all jobs from yesterday to 7 days ahead
--      clients     clients of those jobs (name or building in the job address), for Call / WhatsApp
--      employees   their own record and the drivers (names on My Duties)
--      app_state   the driver plan only
--      bookings, invoices, inventory, daily_expenses, agencies, fluent_form_leads: nothing
-- Run AFTER 2026-11-02_role_based_writes.sql. HOW TO RUN: Supabase → SQL Editor → paste → Run.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Column of Roles & Access that applies to the signed-in user (null when signed out / disabled)
create or replace function public.current_perm_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when p.role in ('admin', 'manager') then p.role
    when e.id is null then 'employee'
    when e.role = 'supervisor' then 'supervisor'
    when e.role = 'driver' then 'driver'
    else 'cleaner'
  end
  from public.profiles p
  left join public.employees e on e.id = p.employee_id
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function public.is_field_login() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_perm_role() in ('driver', 'cleaner'), false)
$$;

-- Same as before, but reads the column of the user's staff role (defaults = src/lib/permissions.ts)
create or replace function public.role_can(modules text[]) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (
    select public.current_app_role() as role, public.current_perm_role() as col
  ), stored as (
    select s.data -> 'rolePermissions' -> me.col as list
    from me left join public.company_settings s on s.id = 1
  ), perms as (
    select case
      when jsonb_typeof(stored.list) = 'array' then stored.list
      when me.col = 'manager' then '["Overview","Bookings","Daily Job Sheet","Fluent Forms","Clients","Monthly Clients","Employees","Attendance","Drivers","My Duties","Agencies","Invoices","Inventory","Expenses","Payments","Pending","Reports","Analytics"]'::jsonb
      when me.col = 'supervisor' then '["Overview","Bookings","Daily Job Sheet","Attendance","Drivers","My Duties"]'::jsonb
      when me.col in ('driver', 'cleaner') then '["My Duties"]'::jsonb
      else '["Overview","Bookings","Attendance","My Duties"]'::jsonb
    end as list
    from me, stored
  )
  select case
    when (select role from me) is null then false
    when (select role from me) = 'admin' then true
    else exists (select 1 from perms, jsonb_array_elements_text(perms.list) as m(module) where m.module = any(modules))
  end
$$;

-- The signed-in user's staff record
create or replace function public.my_employee_id() returns text
language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid() and status = 'active'
$$;

-- Is this job one of mine? Cleaner: my name is in the job's cleaner list ("A, B & C").
-- Driver: any job from yesterday to 7 days ahead (the route needs the sites of the day).
create or replace function public.is_my_job(job_staff text, job_date text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.current_perm_role()
    when 'driver' then coalesce(job_date between to_char((now() at time zone 'Asia/Dubai')::date - 1, 'YYYY-MM-DD')
                                         and to_char((now() at time zone 'Asia/Dubai')::date + 7, 'YYYY-MM-DD'), false)
    when 'cleaner' then exists (
      select 1 from public.employees e
      where e.id = public.my_employee_id()
        and lower(trim(e.full_name)) in (
          select trim(x) from regexp_split_to_table(lower(coalesce(job_staff, '')), '\s*(,|\+|/|&|\sand\s)\s*') as x
        )
    )
    else false
  end
$$;

-- Is this client one of my jobs' clients (yesterday to 7 days ahead)?
create or replace function public.is_my_client(c_name text, c_building text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.daily_jobs j
    where j.date between to_char((now() at time zone 'Asia/Dubai')::date - 1, 'YYYY-MM-DD')
                     and to_char((now() at time zone 'Asia/Dubai')::date + 7, 'YYYY-MM-DD')
      and public.is_my_job(j.staff_name, j.date)
      and (
        (length(trim(coalesce(c_name, ''))) > 2 and position(lower(trim(c_name)) in lower(coalesce(j.address, ''))) > 0)
        or (length(trim(coalesce(c_building, ''))) > 2 and position(lower(trim(c_building)) in lower(coalesce(j.address, ''))) > 0)
      )
  )
$$;

revoke execute on function public.current_perm_role(), public.is_field_login(), public.my_employee_id(),
  public.is_my_job(text, text), public.is_my_client(text, text) from public, anon;
grant execute on function public.current_perm_role(), public.is_field_login(), public.my_employee_id(),
  public.is_my_job(text, text), public.is_my_client(text, text) to authenticated;

-- Restrictive policies: they are added ON TOP of the existing ones (both must allow).
do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      -- table,             screens that give full access,                                                         own rows a field login may read
      ('daily_jobs',        array['Daily Job Sheet','Bookings','Attendance','Drivers','Payments','Pending','Expenses','Reports','Analytics','Overview','Clients','Monthly Clients','Employees','Invoices'], 'public.is_my_job(staff_name, date)'),
      ('clients',           array['Clients','Monthly Clients','Bookings','Daily Job Sheet','Fluent Forms','Invoices','Payments','Pending'], 'public.is_my_client(full_name, building_name)'),
      ('employees',         array['Employees','Agencies','Attendance','Daily Job Sheet','Drivers','Bookings','Expenses'], 'id = public.my_employee_id() or role = ''driver'''),
      ('app_state',         array['Daily Job Sheet','Drivers','Monthly Clients','Payments','Pending','Expenses','Bookings','Clients','Invoices','Inventory','Attendance'], 'key = ''safaeewala_driver_plans'''),
      ('bookings',          array['Bookings','Daily Job Sheet','Clients','Overview','Reports','Analytics'], 'false'),
      ('invoices',          array['Invoices','Payments','Pending','Monthly Clients','Bookings','Clients','Reports','Analytics','Overview'], 'false'),
      ('inventory',         array['Inventory','Daily Job Sheet'], 'false'),
      ('daily_expenses',    array['Expenses','Reports','Analytics','Overview'], 'false'),
      ('agencies',          array['Agencies','Employees'], 'false'),
      ('fluent_form_leads', array['Fluent Forms'], 'false')
    ) as r(tbl, modules, own)
  loop
    execute format('drop policy if exists %I on public.%I', rule.tbl || '_field_read', rule.tbl);
    execute format('drop policy if exists %I on public.%I', rule.tbl || '_field_add', rule.tbl);
    execute format('drop policy if exists %I on public.%I', rule.tbl || '_field_edit', rule.tbl);
    execute format('drop policy if exists %I on public.%I', rule.tbl || '_field_delete', rule.tbl);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (not public.is_field_login() or public.role_can(%L::text[]) or (%s))',
      rule.tbl || '_field_read', rule.tbl, rule.modules, rule.own);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not public.is_field_login() or public.role_can(%L::text[]))',
      rule.tbl || '_field_add', rule.tbl, rule.modules);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not public.is_field_login() or public.role_can(%L::text[]))',
      rule.tbl || '_field_edit', rule.tbl, rule.modules);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not public.is_field_login() or public.role_can(%L::text[]))',
      rule.tbl || '_field_delete', rule.tbl, rule.modules);
  end loop;
end $$;

-- Check after running (as admin this shows every row; sign in as a cleaner to see the limit):
-- select public.current_perm_role(), public.is_field_login();

notify pgrst, 'reload schema';
