#!/usr/bin/env bash
set -euo pipefail

mode="${1:-api}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$mode" in
  api)
    DATABASE_URL="${MIGRATION_DATABASE_URL:-$DATABASE_URL}" alembic upgrade head
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" "$@"
    ;;
  worker)
    if python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('app.worker') else 1)"; then
      exec python -m app.worker "$@"
    fi
    echo "[worker] app.worker is not implemented yet; idling until notification worker lands." >&2
    exec sleep infinity
    ;;
  *)
    exec "$mode" "$@"
    ;;
esac
