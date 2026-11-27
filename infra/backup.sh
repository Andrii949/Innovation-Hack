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

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "${POSTGRES_USER:-lab}" -d "${POSTGRES_DB:-lab}" --clean --if-exists \
  | gzip -9 > "$DB_BACKUP"

if [ ! -s "$DB_BACKUP" ]; then
  echo "Database backup is empty: $DB_BACKUP" >&2
  rm -f "$DB_BACKUP"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T api \
  tar -C /workspace/files -czf - . > "$FILES_BACKUP"

if [ ! -s "$FILES_BACKUP" ]; then
  echo "Files archive is empty: $FILES_BACKUP" >&2
  rm -f "$FILES_BACKUP"
  exit 1
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'files-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed: $DB_BACKUP and $FILES_BACKUP"
