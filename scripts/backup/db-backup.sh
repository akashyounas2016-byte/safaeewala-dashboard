#!/bin/sh
# R-OPS-04: nightly full backup of the Supabase database, kept on the VPS for KEEP_DAYS days,
# with an optional off-site copy (rclone → Google Drive). Runs from root's crontab on the VPS.
#
# Needs in ENV_FILE:  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres
# Optional:           BACKUP_RCLONE_REMOTE=gdrive:Safaeewala-Backups   BACKUP_ALERT_URL=https://…
set -eu

ENV_FILE=${ENV_FILE:-/var/www/safaeewala/.env}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/safaeewala}
KEEP_DAYS=${KEEP_DAYS:-30}
PG_IMAGE=${PG_IMAGE:-postgres:17-alpine}

# Read one value from the .env without sourcing it (passwords may hold shell characters)
env_get() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

STAMP=$(TZ=Asia/Dubai date +%Y-%m-%d_%H%M)
STATUS_FILE="$BACKUP_DIR/last-status.txt"
ALERT_URL=$(env_get BACKUP_ALERT_URL || true)
TMP_ENV=""

fail() {
  echo "$STAMP FAILED: $1" | tee "$STATUS_FILE" >&2
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

find "$BACKUP_DIR" -name 'safaeewala-*.dump' -mtime +"$KEEP_DAYS" -delete

REMOTE=$(env_get BACKUP_RCLONE_REMOTE || true)
OFFSITE="off-site copy not set up"
if [ -n "$REMOTE" ]; then
  command -v rclone >/dev/null 2>&1 || fail "BACKUP_RCLONE_REMOTE is set but rclone is not installed"
  rclone copy "$BACKUP_DIR" "$REMOTE" --include "safaeewala-$STAMP-*.dump" || fail "off-site copy to $REMOTE"
  rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d" --include 'safaeewala-*.dump' || true
  OFFSITE="copied to $REMOTE"
fi

SIZE=$(du -ch "$BACKUP_DIR"/safaeewala-"$STAMP"-*.dump | tail -1 | cut -f1)
echo "$STAMP OK: $TABLES tables, $SIZE, $OFFSITE" | tee "$STATUS_FILE"
