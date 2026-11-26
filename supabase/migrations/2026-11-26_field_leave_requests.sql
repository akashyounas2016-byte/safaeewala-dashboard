-- ═══════════════════════════════════════════════════════════════════════════
-- Leave requests from the app (R-ATT-12)                                     2026-11-26
-- A cleaner / driver login asks for leave on My Duties (annual, sick, emergency, half day, short leave).
-- Each day is one row in attendance_marks with approval = 'pending'; admin / manager approve or reject it on
-- Attendance as before (R-ATT-05). These policies only ADD to the existing ones:
--   • a field login may add a row only for itself, only as a pending leave
--   • it may change or cancel only its own rows that are still pending (not after the office decided)
-- Run AFTER 2026-11-03_attendance_marks.sql and 2026-11-05_field_login_rows.sql.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists attendance_marks_field_request on public.attendance_marks;
drop policy if exists attendance_marks_field_change  on public.attendance_marks;
drop policy if exists attendance_marks_field_cancel  on public.attendance_marks;

create policy attendance_marks_field_request on public.attendance_marks for insert to authenticated
  with check (
    public.is_field_login()
    and cleaner_key = 'id:' || public.my_employee_id()
    and status = 'on_leave' and approval = 'pending'
  );

create policy attendance_marks_field_change on public.attendance_marks for update to authenticated
  using (public.is_field_login() and cleaner_key = 'id:' || public.my_employee_id() and coalesce(approval, 'pending') = 'pending')
  with check (public.is_field_login() and cleaner_key = 'id:' || public.my_employee_id() and status = 'on_leave' and approval = 'pending');

create policy attendance_marks_field_cancel on public.attendance_marks for delete to authenticated
  using (public.is_field_login() and cleaner_key = 'id:' || public.my_employee_id() and approval = 'pending');

-- Check (as a cleaner login): insert a pending leave for yourself works; for someone else it is refused.
