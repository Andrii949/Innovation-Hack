#!/usr/bin/env bash
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"

if [ -f "$INFRA_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$INFRA_DIR/.env"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$INFRA_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

DB_BACKUP="$BACKUP_DIR/db-${STAMP}.sql.gz"
FILES_BACKUP="$BACKUP_DIR/files-${STAMP}.tar.gz"
MANIFEST="$BACKUP_DIR/backup-${STAMP}.sha256"
DB_TMP="${DB_BACKUP}.tmp"
FILES_TMP="${FILES_BACKUP}.tmp"

cleanup() {
  rm -f "$DB_TMP" "$FILES_TMP"
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "${POSTGRES_USER:-lab}" -d "${POSTGRES_DB:-lab}" --clean --if-exists \
  | gzip -9 > "$DB_TMP"

if [ ! -s "$DB_TMP" ] || ! gzip -t "$DB_TMP"; then
  echo "Invalid database backup: $DB_TMP" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T api \
  tar -C /workspace/files -czf - . > "$FILES_TMP"

if [ ! -s "$FILES_TMP" ] || ! gzip -t "$FILES_TMP"; then
  echo "Invalid files archive: $FILES_TMP" >&2
  exit 1
fi

mv "$DB_TMP" "$DB_BACKUP"
mv "$FILES_TMP" "$FILES_BACKUP"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$DB_BACKUP")" "$(basename "$FILES_BACKUP")" > "$MANIFEST"
)

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.sql.gz' -o -name 'files-*.tar.gz' -o -name 'backup-*.sha256' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed: $DB_BACKUP, $FILES_BACKUP, $MANIFEST"
