-- R-OPS-10: Activity Log -> Restore. Each entry keeps what Restore puts back: the whole record of a deleted
-- job / client / employee / expense, or the values a change replaced ({ "before": { field: value } }).
-- Without this column the log still works; Restore is then only offered for entries written after it has run.
-- Run once in Supabase -> SQL editor. Safe to run again.

alter table public.audit_log add column if not exists snapshot jsonb;

notify pgrst, 'reload schema';
