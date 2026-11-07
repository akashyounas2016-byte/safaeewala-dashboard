-- R-WA-03: the rest of the WhatsApp CRM prototype (zip) — assignment, chat status, team notes, opt-out,
-- contact lists, scheduled + retarget campaigns, deal owner / close date / activity, deal-stage automations,
-- fallback replies. Needs 2026-11-06_whatsapp_inbox.sql and 2026-11-07_whatsapp_modules.sql first.
-- Run once in Supabase → SQL editor. Safe to run again.

-- ── Chats: status, assignment, tags, opt-out ──
alter table public.wa_conversations add column if not exists status text not null default 'open';
alter table public.wa_conversations add column if not exists assigned_to text;          -- profiles.id of the agent
alter table public.wa_conversations add column if not exists snoozed_until timestamptz;
alter table public.wa_conversations add column if not exists tags text[] not null default '{}';
alter table public.wa_conversations add column if not exists unsubscribed boolean not null default false; -- wrote STOP
do $$ begin
  alter table public.wa_conversations add constraint wa_conversations_status_chk check (status in ('open', 'pending', 'resolved', 'snoozed'));
exception when duplicate_object then null; end $$;
-- staff may change only these columns of a chat (the rest stays server-only)
grant update (status, assigned_to, snoozed_until, tags, unsubscribed, unread_count) on public.wa_conversations to authenticated;
drop policy if exists wa_conversations_staff_update on public.wa_conversations;
create policy wa_conversations_staff_update on public.wa_conversations for update to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']))
  with check (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));

-- ── Team notes and assignment history on a chat ──
create table if not exists public.wa_notes (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.wa_conversations (id) on delete cascade,
  kind             text not null default 'note' check (kind in ('note', 'assign', 'status')),
  body             text not null,
  author           text,
  created_at       timestamptz not null default now()
);
create index if not exists wa_notes_conversation_idx on public.wa_notes (conversation_id, created_at);

-- ── Contact lists for campaigns ──
create table if not exists public.wa_contact_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tags        text[] not null default '{}',
  created_by  text,
  created_at  timestamptz not null default now()
);
create table if not exists public.wa_contact_list_members (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.wa_contact_lists (id) on delete cascade,
  wa_id       text not null,
  name        text,
  client_id   text,
  created_at  timestamptz not null default now(),
  unique (list_id, wa_id)
);

-- ── Deals: owner, expected close, activity ──
alter table public.wa_deals add column if not exists owner text;               -- profiles.id
alter table public.wa_deals add column if not exists expected_close date;
create table if not exists public.wa_deal_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.wa_deals (id) on delete cascade,
  kind        text not null default 'note' check (kind in ('note', 'stage', 'automation')),
  body        text not null,
  author      text,
  created_at  timestamptz not null default now()
);
create index if not exists wa_deal_events_deal_idx on public.wa_deal_events (deal_id, created_at);

-- ── Campaigns: scheduled, retarget, list audience ──
alter table public.wa_broadcasts add column if not exists scheduled_at timestamptz;
alter table public.wa_broadcasts add column if not exists retarget_of uuid references public.wa_broadcasts (id) on delete set null;
alter table public.wa_broadcasts add column if not exists retarget_rule text;      -- no_reply · not_read · failed
alter table public.wa_broadcasts add column if not exists preview text;
alter table public.wa_broadcasts drop constraint if exists wa_broadcasts_status_check;
alter table public.wa_broadcasts add constraint wa_broadcasts_status_check check (status in ('scheduled', 'sending', 'done', 'failed', 'cancelled'));
alter table public.wa_broadcast_recipients drop constraint if exists wa_broadcast_recipients_status_check;
alter table public.wa_broadcast_recipients add constraint wa_broadcast_recipients_status_check check (status in ('pending', 'sent', 'failed', 'skipped'));

-- ── Rules: fallback reply, deal-stage automation ──
alter table public.wa_rules drop constraint if exists wa_rules_kind_check;
alter table public.wa_rules add constraint wa_rules_kind_check check (kind in ('welcome', 'away', 'keyword', 'fallback', 'deal_stage'));
alter table public.wa_rules alter column reply set default '';
alter table public.wa_rules add column if not exists template_name text;
alter table public.wa_rules add column if not exists language text;
alter table public.wa_rules add column if not exists params jsonb not null default '[]';
alter table public.wa_rules add column if not exists from_stage text;               -- null = any stage
alter table public.wa_rules add column if not exists to_stage text;
alter table public.wa_rules add column if not exists note text;                     -- activity note on the deal

-- ── Read / write rules ──
do $$
declare t text;
begin
  foreach t in array array['wa_notes', 'wa_contact_lists', 'wa_contact_list_members', 'wa_deal_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_app_role() in (''admin'', ''manager'') or public.role_can(array[''WhatsApp'']))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.current_app_role() in (''admin'', ''manager'') or public.role_can(array[''WhatsApp''])) with check (public.current_app_role() in (''admin'', ''manager'') or public.role_can(array[''WhatsApp'']))', t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

do $$ begin
  begin alter publication supabase_realtime add table public.wa_notes; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
