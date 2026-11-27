"""Background worker: recompute deadlines and create notifications (docs/02-architektura.md §8.3).

uv run python -m app.worker            # loop every `worker_interval_minutes`
uv run python -m app.worker --once     # one pass, prints the number of new notifications
uv run python -m app.worker --once --today 2026-12-15   # simulate a date (demo)
"""

import argparse
import logging
import sys
import time
from datetime import date

from sqlalchemy.orm import Session

from app.core.clock import get_today
from app.db import SessionLocal
from app.notifications.push import push_configured, push_pending
from app.notifications.service import generate_notifications
from app.settings.service import get_setting

logger = logging.getLogger(__name__)


def _pass(db: Session, today: date | None) -> int:
    created = generate_notifications(db, today=today or get_today())
    if push_configured():
        push_pending(db)
    db.commit()
    return created


def run_once(today: date | None = None, *, db: Session | None = None) -> int:
    """One pass; returns how many notifications were created."""
    if db is not None:
        return _pass(db, today)
    with SessionLocal() as session:
        return _pass(session, today)


def _interval_seconds() -> int:
    with SessionLocal() as session:
        return int(get_setting(session, "worker_interval_minutes")) * 60


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Deadline and notification worker")
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    parser.add_argument("--today", type=date.fromisoformat, help="simulate this date (YYYY-MM-DD)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not push_configured():
        logger.info("push channel off: FCM_CREDENTIALS_FILE is not set")

    if args.once:
        sys.stdout.write(f"{run_once(args.today)}\n")
        return

    while True:
        try:
            logger.info("created %d notifications", run_once(args.today))
        except Exception:
            logger.exception("worker pass failed; retrying after the interval")
        time.sleep(_interval_seconds())


if __name__ == "__main__":
    main()
