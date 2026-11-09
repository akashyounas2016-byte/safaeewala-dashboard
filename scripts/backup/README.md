# Database backup (R-OPS-04)

`db-backup.sh` makes a full copy of the Supabase database every night on the VPS. Supabase Pro is not needed for this.

## What it saves

| File | Holds |
|---|---|
| `safaeewala-<date>-public.dump` | Every app table with its data, views, functions, triggers and RLS policies |
| `safaeewala-<date>-auth.dump` | The sign-in rows (users, identities), so logins can come back too |
| `safaeewala-<date>-files.tar.gz` | The VPS data folder: `agencies.json`, `leads.json` and Drive-webhook exports (they are not in Supabase) |

- The date is Dubai time, e.g. `safaeewala-2026-11-06_0200-public.dump`.
- Daily copies are kept for 30 days in `/var/backups/safaeewala` on the VPS. The copy of the 1st of each month also goes to `monthly/` and is kept for good: every backup holds all data up to that day, so this keeps the full history at under 1 GB for years.
- Off-site copy (Google Drive) when `BACKUP_RCLONE_REMOTE` is set.
- `last-status.txt` in that folder gives the result of the last run; `backup-status.json` in the app data folder feeds Settings → Backup (UX-93). If `BACKUP_ALERT_URL` is set (for example an n8n webhook), a failed run is posted there.
- **Storage files (R-DOC-01):** `storage/staff-documents/…` (passport, EID, visa, work permit, agency documents, every version) and `storage/whatsapp-media/…` (chat photos / voice notes).
  - `storage-mirror.cjs` runs next to `db-backup.sh`. It downloads only files not copied before and never deletes one, so the folder keeps every version of every document. It is not part of the 30-day clean-up.
  - It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the VPS `.env`.
  - Test without downloading: `DRY=1 node storage-mirror.cjs`.

## Setup on the VPS (once)

1. Scripts: `/opt/safaeewala-backup/db-backup.sh` (`chmod 700`, LF line endings) and `/opt/safaeewala-backup/storage-mirror.cjs` next to it.
2. In `/var/www/safaeewala/.env` (chmod 600, never in git), set `SUPABASE_DB_URL` to the Supabase *Session pooler* connection string (the **Connect** button in the project's top bar → Connection String → Session pooler, port 5432). The service role key is not enough for this.
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
4. VPS data folder: `tar -xzf <file>-files.tar.gz -C /var/www/safaeewala` (stop the container first).
5. Point the app at the target (`VITE_SUPABASE_*`, VPS `.env`) only after the data has been checked.
