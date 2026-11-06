-- R-WA-01: WhatsApp inbox inside the CRM (Meta WhatsApp Cloud API, no GHL in between).
-- Conversations and messages are written only by the VPS server (service key) — from Meta's webhook
-- and from the CRM's "send" endpoint. Signed-in admins / managers (or a role given the WhatsApp screen)
-- can read them. Media files go to the private Storage bucket "whatsapp-media".
-- Run once in Supabase → SQL editor. Safe to run again.

create table if not exists public.wa_conversations (
  id                   uuid primary key default gen_random_uuid(),
  wa_id                text not null unique,             -- customer's WhatsApp number, digits only (9715…)
  name                 text,                             -- WhatsApp profile name
  client_id            text,                             -- CRM client, when the number matches one
  last_message_at      timestamptz,
  last_message_preview text,
  last_direction       text check (last_direction in ('in', 'out')),
  last_inbound_at      timestamptz,                      -- the 24-hour reply window runs from here
  unread_count         integer not null default 0,
  created_at           timestamptz not null default now()
);

create table if not exists public.wa_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.wa_conversations (id) on delete cascade,
  wa_message_id    text unique,                          -- Meta's wamid (status updates find the row by it)
  direction        text not null check (direction in ('in', 'out')),
  type             text not null default 'text',         -- text, image, audio, video, document, sticker, location, template, …
  body             text,
  media_id         text,                                 -- Meta media id (inbound)
  media_path       text,                                 -- path in the whatsapp-media bucket
  media_mime       text,
  media_name       text,
  template_name    text,
  status           text,                                 -- received · sent · delivered · read · failed
  error            text,
  sent_by          text,                                 -- CRM user who sent it
  created_at       timestamptz not null default now()
);
create index if not exists wa_messages_conversation_idx on public.wa_messages (conversation_id, created_at);
create index if not exists wa_conversations_last_idx on public.wa_conversations (last_message_at desc);

alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;

drop policy if exists wa_conversations_read on public.wa_conversations;
create policy wa_conversations_read on public.wa_conversations for select to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
drop policy if exists wa_messages_read on public.wa_messages;
create policy wa_messages_read on public.wa_messages for select to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
-- no insert / update / delete policies: only the server (service key) writes

grant select on public.wa_conversations, public.wa_messages to authenticated;

-- live updates in the inbox
do $$ begin
  begin alter publication supabase_realtime add table public.wa_conversations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.wa_messages; exception when duplicate_object then null; end;
end $$;

-- private bucket for photos, voice notes and documents (read through short-lived signed links from the server)
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
