-- R-MKT-01 / R-CMP-01: Marketing offers + campaigns, and the Complaints module.
-- Run once in Supabase → SQL editor. Safe to run again.

-- ── Offers: a discount or deal the team can quote and send ──
create table if not exists public.marketing_offers (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  code           text,                                         -- promo code, e.g. WELCOME20
  discount_type  text not null default 'percent' check (discount_type in ('percent', 'amount', 'free_hours', 'none')),
  discount_value numeric not null default 0,
  services       text,                                         -- e.g. "Deep cleaning, Sofa" (free text)
  audience       text not null default 'all',                  -- all · first_time · inactive · active · repeat
  valid_from     date,
  valid_to       date,
  terms          text,
  active         boolean not null default true,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Campaigns: who is reached with which offer, on which channel ──
create table if not exists public.marketing_campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  audience       text not null default 'inactive',             -- all · first_time · inactive · active · repeat
  offer_id       uuid references public.marketing_offers(id) on delete set null,
  channel        text not null default 'whatsapp',             -- whatsapp · facebook · instagram · email · sms · other
  message        text,
  status         text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'done', 'cancelled')),
  start_date     date,
  end_date       date,
  budget         numeric not null default 0,
  audience_count integer not null default 0,                   -- clients in the audience when it was saved
  bookings       integer not null default 0,                   -- bookings won (entered by hand)
  revenue        numeric not null default 0,                   -- revenue won (entered by hand)
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Complaints: from Fluent Forms, Facebook / Instagram, WhatsApp, phone or typed in ──
create table if not exists public.complaints (
  id             uuid primary key default gen_random_uuid(),
  ref            text,                                         -- CMP-0001
  client_id      text,
  client_name    text not null,
  phone          text,
  source         text not null default 'manual',               -- fluent_forms · facebook · instagram · whatsapp · phone · email · manual
  source_ref     text,                                         -- lead id / chat id the complaint came from
  category       text not null default 'Service quality',      -- Service quality · Late / no-show · Damage · Staff behaviour · Billing · Other
  priority       text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status         text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  description    text not null default '',
  job_date       date,
  cleaner        text,
  assigned_to    text,
  resolution     text,
  resolved_at    timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists complaints_status_idx on public.complaints (status, created_at desc);
create unique index if not exists complaints_source_ref_idx on public.complaints (source, source_ref) where source_ref is not null;

-- ── Access: admin / manager, or a role allowed the screen in Settings → Roles & Access ──
alter table public.marketing_offers enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.complaints enable row level security;

drop policy if exists marketing_offers_all on public.marketing_offers;
create policy marketing_offers_all on public.marketing_offers for all to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Marketing']))
  with check (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Marketing']));
drop policy if exists marketing_campaigns_all on public.marketing_campaigns;
create policy marketing_campaigns_all on public.marketing_campaigns for all to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Marketing']))
  with check (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Marketing']));
drop policy if exists complaints_all on public.complaints;
create policy complaints_all on public.complaints for all to authenticated
  using (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Complaints']))
  with check (public.current_app_role() in ('admin', 'manager') or public.role_can(array['Complaints']));

grant select, insert, update, delete on public.marketing_offers, public.marketing_campaigns, public.complaints to authenticated;

notify pgrst, 'reload schema';
