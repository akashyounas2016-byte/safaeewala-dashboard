-- R-MKT-04: WhatsApp Clicks rows can be edited and deleted on the CRM screen (owner request 2026-11-17).
-- Admin and manager may edit and delete; Marketing can still only read. Run once in Supabase → SQL editor. Safe to run again.

drop policy if exists whatsapp_clicks_update on public.whatsapp_clicks;
create policy whatsapp_clicks_update on public.whatsapp_clicks for update to authenticated
  using (public.current_app_role() in ('admin', 'manager'))
  with check (public.current_app_role() in ('admin', 'manager'));

drop policy if exists whatsapp_clicks_delete on public.whatsapp_clicks;
create policy whatsapp_clicks_delete on public.whatsapp_clicks for delete to authenticated
  using (public.current_app_role() in ('admin', 'manager'));

notify pgrst, 'reload schema';
