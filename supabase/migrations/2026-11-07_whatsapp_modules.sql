-- R-WA-02: WhatsApp CRM modules — Deals, Broadcast, Automation, Keyword Trigger, Settings.
-- Needs 2026-11-06_whatsapp_inbox.sql first. Run once in Supabase → SQL editor. Safe to run again.
-- Deals, rules and settings: admins / managers (or a role given the WhatsApp screen) read and write.
-- Broadcasts: read by the same people, written only by the server (it sends the messages).

-- ── Deals: a sales pipeline for WhatsApp leads ──
create table if not exists public.wa_deals (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.wa_conversations (id) on delete set null,
  client_id        text,
  title            text not null,
  contact_name     text,
  wa_id            text,
  value            numeric not null default 0,           -- AED
  stage            text not null default 'new' check (stage in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists wa_deals_stage_idx on public.wa_deals (stage, updated_at desc);

-- ── Automation + keyword triggers: replies the server sends by itself ──
-- kind: welcome (first message of a new chat) · away (outside business hours) · keyword (message contains / equals a word)
create table if not exists public.wa_rules (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('welcome', 'away', 'keyword')),
  name           text not null default '',
  enabled        boolean not null default true,
  keywords       text[] not null default '{}',
  match          text not null default 'contains' check (match in ('contains', 'exact')),
  reply          text not null,
  fire_count     integer not null default 0,
  last_fired_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Settings (business hours for the away message, …) ──
create table if not exists public.wa_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ── Broadcast: one approved template to many numbers ──
create table if not exists public.wa_broadcasts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  template_name  text not null,
  language       text not null,
  params         jsonb not null default '[]',
  status         text not null default 'sending' check (status in ('sending', 'done', 'failed')),
  total          integer not null default 0,
  sent           integer not null default 0,
  failed         integer not null default 0,
  created_by     text,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create table if not exists public.wa_broadcast_recipients (
  id             uuid primary key default gen_random_uuid(),
  broadcast_id   uuid not null references public.wa_broadcasts (id) on delete cascade,
  wa_id          text not null,
  name           text,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error          text,
  wa_message_id  text,
  created_at     timestamptz not null default now()
);
create index if not exists wa_broadcast_recipients_idx on public.wa_broadcast_recipients (broadcast_id);

-- automation replies remember which rule sent them
alter table public.wa_messages add column if not exists rule_id uuid;

do $$
declare t text;
begin
  foreach t in array array['wa_deals', 'wa_rules', 'wa_settings', 'wa_broadcasts', 'wa_broadcast_recipients'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.current_app_role() in (''admin'', ''manager'') or public.role_can(array[''WhatsApp'']))', t || '_read', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  foreach t in array array['wa_deals', 'wa_rules', 'wa_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.current_app_role() in (''admin'', ''manager'') or public.role_can(array[''WhatsApp''])) with check (public.current_app_role() in (''admin'', ''manager'') or public.role_can(array[''WhatsApp'']))', t || '_write', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

do $$ begin
  begin alter publication supabase_realtime add table public.wa_deals; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.wa_broadcasts; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
