-- ═══════════════════════════════════════════════════════════════════════════
-- Live updates between users (E2E-17, R-SYNC-09)                          2026-11-02
-- Several people use the CRM at once: Supabase Realtime sends every change to the other
-- signed-in browsers. Row-level security still decides who receives which row.
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['bookings','clients','employees','agencies','invoices','inventory','daily_jobs','daily_expenses','app_state'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
