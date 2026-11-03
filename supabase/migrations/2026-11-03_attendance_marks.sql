-- ═══════════════════════════════════════════════════════════════════════════
-- Attendance marks in their own table + leave approval (R-ATT-05, R-ATT-06, R-SYNC-10)   2026-11-03
-- Before: every Present / Absent / Leave mark lived in one shared JSON value (app_state key
-- safaeewala_cleaner_attendance_overrides). Two users marking at the same time could undo each other,
-- and a mark that was reset could come back. Now each cleaner + date is one row, sent live to every user.
-- Leave is a request: admin / manager approve it (stays leave) or reject it (becomes absent).
-- Existing marks are copied in; existing leave counts as approved.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run (it copies only marks not yet in the table).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.attendance_marks (
  id            text primary key,            -- "<date>_id:<employeeId>" or "<date>_<name lowercase>"
  date          text not null,               -- YYYY-MM-DD (Dubai)
  cleaner_key   text not null,               -- "id:<employeeId>" or name lowercase
  cleaner_name  text,
  status        text not null check (status in ('present', 'available', 'absent', 'on_leave')),
  category      text,
  reason        text,
  duty_hours    numeric,
  approval      text check (approval in ('pending', 'approved', 'rejected')),
  requested_by  text,
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists attendance_marks_date_idx on public.attendance_marks (date);
create index if not exists attendance_marks_pending_idx on public.attendance_marks (approval) where approval = 'pending';

alter table public.attendance_marks enable row level security;

drop policy if exists attendance_marks_read   on public.attendance_marks;
drop policy if exists attendance_marks_add    on public.attendance_marks;
drop policy if exists attendance_marks_edit   on public.attendance_marks;
drop policy if exists attendance_marks_delete on public.attendance_marks;

-- Reading: every active user. Writing: roles with the Attendance screen (R-SEC-03).
create policy attendance_marks_read on public.attendance_marks for select to authenticated
  using (public.is_active_user());
create policy attendance_marks_add on public.attendance_marks for insert to authenticated
  with check (public.role_can(array['Attendance']));
create policy attendance_marks_edit on public.attendance_marks for update to authenticated
  using (public.role_can(array['Attendance'])) with check (public.role_can(array['Attendance']));
-- Reset (delete) a mark: admin / manager always; others only a mark that nobody has decided yet
create policy attendance_marks_delete on public.attendance_marks for delete to authenticated
  using (
    public.current_app_role() in ('admin', 'manager')
    or (public.role_can(array['Attendance']) and coalesce(approval, 'pending') = 'pending')
  );

-- Only admin / manager may approve or reject leave (R-ATT-05). Anyone else: a leave is saved as a
-- pending request and cannot carry a decision. The SQL Editor / service key (no signed-in user) is not limited.
create or replace function public.attendance_marks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_app_role() in ('admin', 'manager') then
    return new;
  end if;
  if new.status = 'on_leave' and new.approval is distinct from 'pending' then
    raise exception 'Only admin or manager can approve leave';
  end if;
  if new.approval in ('approved', 'rejected') or new.decided_by is not null or new.decided_at is not null then
    raise exception 'Only admin or manager can approve or reject leave';
  end if;
  if tg_op = 'UPDATE' and old.approval in ('approved', 'rejected') and old.status = 'absent' and new.status = 'on_leave' then
    raise exception 'A rejected leave can only be changed by admin or manager';
  end if;
  return new;
end $$;

drop trigger if exists attendance_marks_guard on public.attendance_marks;
create trigger attendance_marks_guard before insert or update on public.attendance_marks
  for each row execute function public.attendance_marks_guard();

-- Copy the marks saved so far (old JSON in app_state). Leave already given counts as approved.
insert into public.attendance_marks (id, date, cleaner_key, cleaner_name, status, reason, duty_hours, approval, updated_at)
select
  e.key,
  split_part(e.key, '_', 1),
  substring(e.key from position('_' in e.key) + 1),
  emp.full_name,
  e.value ->> 'status',
  e.value ->> 'reason',
  case when (e.value ->> 'dutyHours') ~ '^[0-9.]+$' then (e.value ->> 'dutyHours')::numeric end,
  case when e.value ->> 'status' = 'on_leave' then 'approved' end,
  coalesce(case when (e.value ->> 'updatedAt') ~ '^\d{4}-' then (e.value ->> 'updatedAt')::timestamptz end, now())
from public.app_state s
cross join lateral jsonb_each(case when jsonb_typeof(s.value) = 'object' then s.value else '{}'::jsonb end) as e(key, value)
left join public.employees emp on 'id:' || emp.id::text = substring(e.key from position('_' in e.key) + 1)
where s.key = 'safaeewala_cleaner_attendance_overrides'
  and e.key ~ '^\d{4}-\d{2}-\d{2}_.+'
  and e.value ->> 'status' in ('present', 'available', 'absent', 'on_leave')
on conflict (id) do nothing;

-- Live updates to every signed-in user (R-SYNC-09)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_marks') then
    alter publication supabase_realtime add table public.attendance_marks;
  end if;
end $$;

notify pgrst, 'reload schema';
