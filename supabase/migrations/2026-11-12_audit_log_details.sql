-- R-OPS-06 (2026-11-12): Activity Log with full detail.
-- Adds the screen a change was made on and every changed field (before → after) to audit_log,
-- plus indexes for the Activity Log filters. Safe to run more than once.
-- Until this runs, the app keeps the same detail inside the `details` text.

alter table public.audit_log add column if not exists screen text;
alter table public.audit_log add column if not exists changes jsonb;

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, created_at desc);
create index if not exists audit_log_entity_id_idx on public.audit_log (entity_id);
create index if not exists audit_log_user_idx on public.audit_log (user_name, created_at desc);
