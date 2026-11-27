#!/usr/bin/env bash
set -euo pipefail

mode="${1:-api}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$mode" in
  api)
    python -m app.core.db_security
    DATABASE_URL="${MIGRATION_DATABASE_URL:-$DATABASE_URL}" alembic upgrade head
    python -m app.core.db_security
    if [ "${AUTO_SEED:-false}" = "true" ]; then
      python -m app.seed
    fi
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" "$@"
    ;;
  worker)
    if python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('app.worker') else 1)"; then
      exec python -m app.worker "$@"
    fi
    echo "[worker] app.worker is not implemented yet; idling until notification worker lands." >&2
    trap 'exit 0' TERM INT
    while :; do
      sleep 3600 &
      wait $!
    done
    ;;
  *)
    exec "$mode" "$@"
    ;;
esac
