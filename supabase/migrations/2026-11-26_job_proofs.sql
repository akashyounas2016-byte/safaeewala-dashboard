-- ═══════════════════════════════════════════════════════════════════════════
-- Job proof photos and client signatures (R-APP-04)                         2026-11-26
-- Owner: "jo recomendation diye hen apk k liye wo b add krdo" — photo at Start job, photo + client signature at
-- End job. Files: private bucket "job-proofs", path <date>/<job id>/<cleaner>-<start|end|signature>.<jpg|png>.
--   • any signed-in staff may ADD a file (cleaners upload from My Duties)
--   • office logins see every file; a cleaner / driver login sees only the files it uploaded itself
--   • only office logins may delete
-- Run AFTER 2026-11-05_field_login_rows.sql (uses public.is_field_login()).
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-proofs', 'job-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists job_proofs_read   on storage.objects;
drop policy if exists job_proofs_add    on storage.objects;
drop policy if exists job_proofs_change on storage.objects;
drop policy if exists job_proofs_remove on storage.objects;

create policy job_proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'job-proofs' and (not public.is_field_login() or owner = auth.uid()));
create policy job_proofs_add on storage.objects for insert to authenticated
  with check (bucket_id = 'job-proofs');
-- upload with "upsert" replaces the same step's photo: only the one who uploaded it (or the office)
create policy job_proofs_change on storage.objects for update to authenticated
  using (bucket_id = 'job-proofs' and (not public.is_field_login() or owner = auth.uid()))
  with check (bucket_id = 'job-proofs');
create policy job_proofs_remove on storage.objects for delete to authenticated
  using (bucket_id = 'job-proofs' and not public.is_field_login());

-- Check: select id, public, file_size_limit from storage.buckets where id = 'job-proofs';
