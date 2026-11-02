-- ═══════════════════════════════════════════════════════════════════════════
-- Identity documents in private Storage (E2E-08, R-SEC-04)                 2026-11-02
-- Emirates ID / passport / visa files were stored as text inside the employees and agencies rows,
-- so everyone who could read those tables could read them. They now go to the private bucket
-- "staff-documents"; only admin and manager can upload, view or delete them.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('staff-documents', 'staff-documents', false)
on conflict (id) do update set public = false;

drop policy if exists staff_documents_read   on storage.objects;
drop policy if exists staff_documents_add    on storage.objects;
drop policy if exists staff_documents_change on storage.objects;
drop policy if exists staff_documents_remove on storage.objects;

create policy staff_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'staff-documents' and public.current_app_role() in ('admin', 'manager'));
create policy staff_documents_add on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-documents' and public.current_app_role() in ('admin', 'manager'));
create policy staff_documents_change on storage.objects for update to authenticated
  using (bucket_id = 'staff-documents' and public.current_app_role() in ('admin', 'manager'))
  with check (bucket_id = 'staff-documents' and public.current_app_role() in ('admin', 'manager'));
create policy staff_documents_remove on storage.objects for delete to authenticated
  using (bucket_id = 'staff-documents' and public.current_app_role() in ('admin', 'manager'));
