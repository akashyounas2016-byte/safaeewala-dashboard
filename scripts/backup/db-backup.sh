#!/bin/sh
# R-OPS-04: nightly full backup of the Supabase database and of the VPS data folder (agencies, leads).
# Daily copies are kept KEEP_DAYS days; the copy made on the 1st of each month is kept for good (monthly/).
# Optional off-site copy (rclone → Google Drive). Runs from root's crontab on the VPS.
#
# Needs in ENV_FILE:  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres
# Optional:           BACKUP_RCLONE_REMOTE=gdrive:Safaeewala-Backups   BACKUP_ALERT_URL=https://…
set -eu

ENV_FILE=${ENV_FILE:-/var/www/safaeewala/.env}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/safaeewala}
KEEP_DAYS=${KEEP_DAYS:-30}
APP_DATA_DIR=${APP_DATA_DIR:-/var/www/safaeewala/data}
PG_IMAGE=${PG_IMAGE:-postgres:17-alpine}

# Read one value from the .env without sourcing it (passwords may hold shell characters)
env_get() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

STAMP=$(TZ=Asia/Dubai date +%Y-%m-%d_%H%M)
DAY=$(TZ=Asia/Dubai date +%d)
STATUS_FILE="$BACKUP_DIR/last-status.txt"
ALERT_URL=$(env_get BACKUP_ALERT_URL || true)
TMP_ENV=""
TABLES=0
OFFSITE_ON=false

# UX-93: the result for Settings → Backup, in the data folder the app server can read (/data in the container)
write_status() { # $1 = true|false, $2 = message
  [ -d "$APP_DATA_DIR" ] || return 0
  daily=$(ls "$BACKUP_DIR"/safaeewala-*-public.dump 2>/dev/null | wc -l)
  monthly=$(ls "$BACKUP_DIR"/monthly/safaeewala-*-public.dump 2>/dev/null | wc -l)
  total=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
  msg=$(printf '%s' "$2" | tr -d '"\\')
  printf '{"ok":%s,"at":"%s","stamp":"%s","message":"%s","tables":%s,"daily_count":%s,"monthly_count":%s,"total_size":"%s","keep_days":%s,"offsite":%s}\n' \
    "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STAMP" "$msg" "${TABLES:-0}" "$daily" "$monthly" "$total" "$KEEP_DAYS" "${OFFSITE_ON:-false}" \
    > "$APP_DATA_DIR/backup-status.json.tmp" && mv "$APP_DATA_DIR/backup-status.json.tmp" "$APP_DATA_DIR/backup-status.json"
}

fail() {
  echo "$STAMP FAILED: $1" | tee "$STATUS_FILE" >&2
  write_status false "$1" || true
  if [ -n "$ALERT_URL" ]; then
    curl -fsS -m 20 -H 'Content-Type: application/json' \
      -d "{\"source\":\"safaeewala-backup\",\"ok\":false,\"at\":\"$STAMP\",\"error\":\"$1\"}" "$ALERT_URL" >/dev/null || true
  fi
  exit 1
}
cleanup() { [ -n "$TMP_ENV" ] && rm -f "$TMP_ENV"; rm -f "$BACKUP_DIR"/*.tmp; }
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DB_URL=$(env_get SUPABASE_DB_URL || true)
[ -n "$DB_URL" ] || fail "SUPABASE_DB_URL is not set in $ENV_FILE"

# The URL goes to the container through a private env file, never on the command line (R-SEC-02)
TMP_ENV=$(mktemp)
chmod 600 "$TMP_ENV"
printf 'DB_URL=%s\n' "$DB_URL" > "$TMP_ENV"

dump() { # $1 = file name, rest = pg_dump options
  name=$1; shift
  docker run --rm --env-file "$TMP_ENV" -v "$BACKUP_DIR:/out" "$PG_IMAGE" \
    sh -c 'pg_dump "$DB_URL" --format=custom --no-owner --no-privileges "$@" -f "/out/$0.tmp"' "$name" "$@" \
    || fail "pg_dump $name"
  mv "$BACKUP_DIR/$name.tmp" "$BACKUP_DIR/$name"
}

# 1. App data: every table, view, function, trigger and RLS policy of the public schema
dump "safaeewala-$STAMP-public.dump" --schema=public
# 2. Sign-ins: the rows of auth (users, identities), so logins can be brought back too
dump "safaeewala-$STAMP-auth.dump" --schema=auth --data-only

# A backup that cannot be read is no backup: list it and count the tables
TABLES=$(docker run --rm -v "$BACKUP_DIR:/out" "$PG_IMAGE" pg_restore --list "/out/safaeewala-$STAMP-public.dump" | grep -c ' TABLE DATA public ' || true)
[ "${TABLES:-0}" -gt 0 ] || fail "the public dump holds no tables"

# 3. VPS data folder: agencies.json and leads.json live here, not in Supabase (logs left out)
if [ -d "$APP_DATA_DIR" ]; then
  tar -czf "$BACKUP_DIR/safaeewala-$STAMP-files.tar.gz.tmp" -C "$(dirname "$APP_DATA_DIR")" --exclude="$(basename "$APP_DATA_DIR")/logs" "$(basename "$APP_DATA_DIR")" \
    || fail "tar of $APP_DATA_DIR"
  mv "$BACKUP_DIR/safaeewala-$STAMP-files.tar.gz.tmp" "$BACKUP_DIR/safaeewala-$STAMP-files.tar.gz"
fi

# 4. R-DOC-01: document images and chat media from Supabase Storage. A growing copy: only new files are
#    downloaded and nothing is deleted, so every version of every passport / EID / permit image stays.
STORAGE_NOTE=""
SB_URL=$(env_get SUPABASE_URL || true)
SB_KEY=$(env_get SUPABASE_SERVICE_ROLE_KEY || true)
if [ -n "$SB_URL" ] && [ -n "$SB_KEY" ] && [ -f "$(dirname "$0")/storage-mirror.cjs" ]; then
  printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nBUCKETS=staff-documents,whatsapp-media\n' "$SB_URL" "$SB_KEY" > "$TMP_ENV"
  mkdir -p "$BACKUP_DIR/storage"
  STORAGE_OUT=$(docker run --rm --env-file "$TMP_ENV" -v "$BACKUP_DIR/storage:/out" -v "$(dirname "$0")/storage-mirror.cjs:/m.cjs:ro" node:22-alpine node /m.cjs 2>&1) \
    || fail "storage copy: $(printf '%s' "$STORAGE_OUT" | tail -1)"
  STORAGE_NOTE=$(printf '%s' "$STORAGE_OUT" | tail -1)
fi

# The 1st of the month is kept for good, so the full history stays without keeping every day
if [ "$DAY" = "01" ]; then
  mkdir -p "$BACKUP_DIR/monthly"
  cp "$BACKUP_DIR"/safaeewala-"$STAMP"-* "$BACKUP_DIR/monthly/"
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'safaeewala-*' -mtime +"$KEEP_DAYS" -delete

REMOTE=$(env_get BACKUP_RCLONE_REMOTE || true)
OFFSITE="off-site copy not set up"
if [ -n "$REMOTE" ]; then
  command -v rclone >/dev/null 2>&1 || fail "BACKUP_RCLONE_REMOTE is set but rclone is not installed"
  rclone copy "$BACKUP_DIR" "$REMOTE" --max-depth 1 --include "safaeewala-$STAMP-*" || fail "off-site copy to $REMOTE"
  if [ "$DAY" = "01" ]; then rclone copy "$BACKUP_DIR/monthly" "$REMOTE/monthly" --include "safaeewala-$STAMP-*" || fail "monthly off-site copy"; fi
  rclone delete "$REMOTE" --max-depth 1 --min-age "${KEEP_DAYS}d" --include 'safaeewala-*' || true
  OFFSITE="copied to $REMOTE"
  OFFSITE_ON=true
fi

SIZE=$(du -ch "$BACKUP_DIR"/safaeewala-"$STAMP"-* | tail -1 | cut -f1)
echo "$STAMP OK: $TABLES tables, $SIZE, $OFFSITE${STORAGE_NOTE:+, $STORAGE_NOTE}" | tee "$STATUS_FILE"
write_status true "$TABLES tables, $SIZE${STORAGE_NOTE:+ · $STORAGE_NOTE}"
