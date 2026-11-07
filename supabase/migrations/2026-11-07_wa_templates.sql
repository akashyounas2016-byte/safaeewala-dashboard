-- R-WA-05: message templates made in the CRM (template builder) — saved as drafts without Meta, submitted for
-- Meta's review when WhatsApp is connected. Run once in Supabase → SQL editor. Safe to run again.
create table if not exists public.wa_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                               -- small letters, numbers and _ (Meta's rule)
  language         text not null default 'en',
  category         text not null default 'UTILITY' check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  type             text not null default 'custom_message',      -- custom_message · flows · appointment_reminder · limited_time_offer · carousel · catalog · multi_product · call_permission
  form             jsonb not null default '{}',                 -- the builder's fields (header, body, footer, buttons, cards, …)
  status           text not null default 'DRAFT',               -- DRAFT · PENDING · APPROVED · REJECTED · PAUSED · DISABLED · PENDING_DELETION
  meta_id          text,
  rejected_reason  text,
  favorite         boolean not null default false,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (name, language)
);

alter table public.wa_templates enable row level security;
drop policy if exists wa_templates_read on public.wa_templates;
create policy wa_templates_read on public.wa_templates for select to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
drop policy if exists wa_templates_write on public.wa_templates;
create policy wa_templates_write on public.wa_templates for all to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']))
  with check (public.current_app_role() in ('admin', 'manager') or public.role_can(array['WhatsApp']));
grant select, insert, update, delete on public.wa_templates to authenticated;

notify pgrst, 'reload schema';
