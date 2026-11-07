-- R-INBOX-03 / R-WA-04: tags on Facebook / Instagram chats, and the log of automatic client notifications.
-- Needs the three WhatsApp migrations of 2026-11-06 / 2026-11-07 first. Run once in Supabase → SQL editor. Safe to run again.

-- tags on Facebook / Instagram chats (WhatsApp chats keep theirs in wa_conversations.tags)
create table if not exists public.inbox_chat_tags (
  ref         text primary key,                    -- "ghl:<conversation id>"
  tags        text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

-- one row per notification sent (booking confirmation, reminder, on the way, feedback, payment) — stops double sending
create table if not exists public.wa_notification_log (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                       -- confirm · reminder · on_way · feedback · payment
  ref         text not null,                       -- booking / job id (payment: "<job id>:<date>")
  wa_id       text,
  status      text not null default 'sent',        -- sent · failed
  error       text,
  sent_by     text,
  created_at  timestamptz not null default now(),
  unique (kind, ref)
);
create index if not exists wa_notification_log_created_idx on public.wa_notification_log (created_at desc);

alter table public.inbox_chat_tags enable row level security;
alter table public.wa_notification_log enable row level security;

drop policy if exists inbox_chat_tags_read on public.inbox_chat_tags;
create policy inbox_chat_tags_read on public.inbox_chat_tags for select to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
drop policy if exists inbox_chat_tags_write on public.inbox_chat_tags;
create policy inbox_chat_tags_write on public.inbox_chat_tags for all to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']))
  with check (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
grant select, insert, update, delete on public.inbox_chat_tags to authenticated;

-- the log is written only by the server; staff can read it
drop policy if exists wa_notification_log_read on public.wa_notification_log;
create policy wa_notification_log_read on public.wa_notification_log for select to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
grant select on public.wa_notification_log to authenticated;

notify pgrst, 'reload schema';
