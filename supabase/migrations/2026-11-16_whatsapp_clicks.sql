-- R-MKT-03: clicks on the WhatsApp buttons of the website (WordPress plugin "WhatsApp Clicks" webhook).
-- Written only by the CRM server (service key) after the X-WACT-Signature check; read on the WhatsApp Clicks screen.
-- Run once in Supabase → SQL editor. Safe to run again.

create table if not exists public.whatsapp_clicks (
  id               text primary key,                 -- "<site url>#<plugin click id>" — a resent click is not counted twice
  click_id         text,
  clicked_at       timestamptz,
  local_time       text,
  site_name        text,
  site_url         text,
  page_url         text,
  page_title       text,
  button_text      text,
  button_location  text,
  wa_number        text,                             -- the business number the visitor was sent to
  wa_message       text,                             -- the pre-filled message
  device           text,
  referrer         text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  visitor_ip       text,                             -- only when "Store IP address" is on in the plugin
  raw              jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists whatsapp_clicks_clicked_at_idx on public.whatsapp_clicks (clicked_at desc);

alter table public.whatsapp_clicks enable row level security;
drop policy if exists whatsapp_clicks_read on public.whatsapp_clicks;
create policy whatsapp_clicks_read on public.whatsapp_clicks for select to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Marketing']));
drop policy if exists whatsapp_clicks_delete on public.whatsapp_clicks;
create policy whatsapp_clicks_delete on public.whatsapp_clicks for delete to authenticated
  using (public.current_app_role() = 'admin');
-- no insert / update policy: only the server (service key) writes

notify pgrst, 'reload schema';
