-- R-AGN-07: a Third Party (Group) agency holds several trade licenses (file, issue date, expiry date, name / remarks).
-- Without this column Supabase drops the list on save. Run once in Supabase → SQL editor. Safe to run again.

alter table public.agencies add column if not exists trade_licenses jsonb;  -- [{id, name, issue_date, expiry_date, file_data, file_type, file_name}]

notify pgrst, 'reload schema';
