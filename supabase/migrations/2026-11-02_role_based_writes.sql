-- ═══════════════════════════════════════════════════════════════════════════
-- Screen permissions are enforced by the database too (E2E-07, R-SEC-03)   2026-11-02
-- Before: any active login could add / change salaries, agencies, invoices … through the API,
-- whatever screens its role had. Now a role may add or change rows of a table only when the admin
-- gave it a screen that works with that table (Settings → Users → Role permissions).
-- Reading stays open to active users (pickers need names); deleting stays admin + manager.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- true when the signed-in user's role has at least one of these screens.
-- Same source and defaults as the app: company_settings.data.rolePermissions (src/lib/permissions.ts)
create or replace function public.role_can(modules text[]) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (
    select public.current_app_role() as role
  ), stored as (
    select s.data -> 'rolePermissions' -> me.role as list
    from me left join public.company_settings s on s.id = 1
  ), perms as (
    select case
      when jsonb_typeof(stored.list) = 'array' then stored.list
      when me.role = 'manager' then '["Overview","Bookings","Daily Job Sheet","Fluent Forms","Clients","Monthly Clients","Employees","Attendance","Drivers","My Duties","Agencies","Invoices","Inventory","Expenses","Payments","Pending","Reports","Analytics"]'::jsonb
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
revoke execute on function public.role_can(text[]) from public, anon;
grant execute on function public.role_can(text[]) to authenticated;

do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('employees', array['Employees','Agencies']),
      ('agencies',  array['Agencies','Employees']),
      ('invoices',  array['Invoices','Payments','Pending','Monthly Clients','Bookings','Daily Job Sheet']),
      ('inventory', array['Inventory','Daily Job Sheet']),
      ('clients',   array['Clients','Monthly Clients','Bookings','Daily Job Sheet','Fluent Forms'])
    ) as r(tbl, modules)
  loop
    execute format('drop policy if exists %I on public.%I', rule.tbl || '_add', rule.tbl);
    execute format('drop policy if exists %I on public.%I', rule.tbl || '_edit', rule.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.role_can(%L::text[]))',
      rule.tbl || '_add', rule.tbl, rule.modules);
    execute format('create policy %I on public.%I for update to authenticated using (public.role_can(%L::text[])) with check (public.role_can(%L::text[]))',
      rule.tbl || '_edit', rule.tbl, rule.modules, rule.modules);
  end loop;
end $$;

notify pgrst, 'reload schema';
