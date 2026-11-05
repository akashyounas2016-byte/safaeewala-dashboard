# Database backup (R-OPS-04)

`db-backup.sh` makes a full copy of the Supabase database every night on the VPS. Supabase Pro is not needed for this.

## What it saves

| File | Holds |
|---|---|
| `safaeewala-<date>-public.dump` | Every app table with its data, views, functions, triggers and RLS policies |
| `safaeewala-<date>-auth.dump` | The sign-in rows (users, identities), so logins can come back too |

- The date is Dubai time, e.g. `safaeewala-2026-11-06_0200-public.dump`.
- Copies are kept for 30 days in `/var/backups/safaeewala` on the VPS, plus an off-site copy (Google Drive) when `BACKUP_RCLONE_REMOTE` is set.
- `last-status.txt` in that folder gives the result of the last run. If `BACKUP_ALERT_URL` is set (for example an n8n webhook), a failed run is posted there.
- The app has no Supabase Storage buckets, so there are no files to back up beyond the database.

## Setup on the VPS (once)

1. Script: `/opt/safaeewala-backup/db-backup.sh` (`chmod 700`, LF line endings).
2. In `/var/www/safaeewala/.env` (chmod 600, never in git), set `SUPABASE_DB_URL` to the Supabase *Session pooler* connection string (Project Settings → Database → Connect, port 5432). The service role key is not enough for this.
3. Optional settings: `BACKUP_RCLONE_REMOTE=gdrive:Safaeewala-Backups` (after `rclone config`) and `BACKUP_ALERT_URL=…`.
4. Cron (the VPS runs on UTC; 22:00 UTC = 02:00 Dubai):
   ```
   0 22 * * * /opt/safaeewala-backup/db-backup.sh >> /var/log/safaeewala-backup.log 2>&1
   ```
5. Run it once by hand and check `last-status.txt`.

## Restore

Use a TEST project first. Never restore over live data without the owner's OK.

1. Create a new Supabase project, or use the existing one after a `Delete All`.
2. Restore the app schema and data:
   ```
   docker run --rm -v /var/backups/safaeewala:/in postgres:17-alpine \
     pg_restore --no-owner --no-privileges --clean --if-exists -d "$TARGET_DB_URL" /in/<file>-public.dump
   ```
3. If logins must come back too, restore the sign-ins with `pg_restore --data-only -d "$TARGET_DB_URL" /in/<file>-auth.dump`. On a new project, do this before users sign up.
4. Point the app at the target (`VITE_SUPABASE_*`, VPS `.env`) only after the data has been checked.
