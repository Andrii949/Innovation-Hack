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
TARGET="${1:---latest}"

if [ "$TARGET" = "--latest" ]; then
  LATEST_MANIFEST="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.sha256' | sort | tail -n 1 || true)"
  if [ -n "$LATEST_MANIFEST" ]; then
    TARGET="$LATEST_MANIFEST"
  else
    LATEST_DB="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz' | sort | tail -n 1 || true)"
    if [ -z "$LATEST_DB" ]; then
      echo "No backups found in $BACKUP_DIR" >&2
      exit 1
    fi
    TARGET="$LATEST_DB"
  fi
fi

if [[ "$TARGET" == */* ]] || [[ -f "$TARGET" ]]; then
  BACKUP_DIR="$(cd "$(dirname "$TARGET")" && pwd)"
  BASE="$(basename "$TARGET")"
else
  BASE="$TARGET"
fi

STAMP="$BASE"
STAMP="${STAMP#backup-}"
STAMP="${STAMP#db-}"
STAMP="${STAMP#files-}"
STAMP="${STAMP%.sha256}"
STAMP="${STAMP%.sql.gz}"
STAMP="${STAMP%.tar.gz}"

DB_BACKUP="$BACKUP_DIR/db-${STAMP}.sql.gz"
FILES_BACKUP="$BACKUP_DIR/files-${STAMP}.tar.gz"
MANIFEST="$BACKUP_DIR/backup-${STAMP}.sha256"

if [ -f "$MANIFEST" ]; then
  (
    cd "$BACKUP_DIR"
    sha256sum -c "$(basename "$MANIFEST")"
  )
fi

if [ ! -s "$DB_BACKUP" ] || ! gzip -t "$DB_BACKUP"; then
  echo "Missing or invalid database backup: $DB_BACKUP" >&2
  exit 1
fi

if [ ! -s "$FILES_BACKUP" ] || ! gzip -t "$FILES_BACKUP"; then
  echo "Missing or invalid files backup: $FILES_BACKUP" >&2
  exit 1
fi

gzip -dc "$DB_BACKUP" | docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-lab}" -d "${POSTGRES_DB:-lab}" >/dev/null

if docker compose -f "$COMPOSE_FILE" ps --services --status running | grep -qx "api"; then
  docker compose -f "$COMPOSE_FILE" exec -T api python -m app.core.db_security
  docker compose -f "$COMPOSE_FILE" exec -T api \
    sh -c 'find /workspace/files -mindepth 1 -delete && tar -C /workspace/files -xzf -' < "$FILES_BACKUP"
else
  echo "API container is not running; skipped role resync and files restore." >&2
fi

echo "Restore completed from stamp $STAMP"
