-- ═══════════════════════════════════════════════════════════════════════════
-- My Duties: job progress from the field (R-DUTY-01)   2026-11-04
-- One row per job and cleaner: On my way → Started → Done, or an Issue, with the time and the phone's
-- position. Cleaners write only their own rows; office users read everything (live).
-- Also adds driver_locations + job_checkins to Supabase Realtime, so the office map and the
-- Daily Job Sheet update without a reload.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.job_checkins (
  id           text primary key,             -- "<job id>|<cleaner name lowercase>"
  job_id       text not null,
  date         text not null,                -- YYYY-MM-DD (Dubai)
  cleaner      text not null,
  employee_id  text,
  status       text not null check (status in ('on_way', 'started', 'done', 'issue')),
  on_way_at    timestamptz,
  started_at   timestamptz,
  done_at      timestamptz,
  note         text,
  lat          double precision,
  lng          double precision,
  updated_at   timestamptz not null default now()
);
create index if not exists job_checkins_date_idx on public.job_checkins (date);

alter table public.job_checkins enable row level security;
drop policy if exists job_checkins_read on public.job_checkins;
drop policy if exists job_checkins_write on public.job_checkins;
drop policy if exists job_checkins_update on public.job_checkins;

create policy job_checkins_read on public.job_checkins for select to authenticated
  using (public.is_active_user());
-- Office roles may write any row; a field login only rows of the employee linked to it
create policy job_checkins_write on public.job_checkins for insert to authenticated
  with check (
    public.current_app_role() in ('admin', 'manager')
    or employee_id = (select employee_id from public.profiles where id = auth.uid() and status = 'active')
  );
create policy job_checkins_update on public.job_checkins for update to authenticated
  using (
    public.current_app_role() in ('admin', 'manager')
    or employee_id = (select employee_id from public.profiles where id = auth.uid() and status = 'active')
  );

-- Live updates for the office
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.job_checkins'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.driver_locations'; exception when others then null; end;
end $$;

notify pgrst, 'reload schema';
