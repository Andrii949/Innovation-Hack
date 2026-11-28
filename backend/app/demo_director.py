"""Live stage director CLI and helpers for interactive pitch demonstrations."""

from __future__ import annotations

import argparse
import secrets
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.audit.context import audit_context
from app.audit.listener import register_audit_listener
from app.auth.models import Lab, User
from app.core.clock import get_today
from app.db import SessionLocal
from app.equipment.models import CheckPlan, Equipment
from app.equipment.schemas import CheckRecordCreate
from app.equipment.service import record_check
from app.notifications.models import Notification
from app.notifications.push import push_configured, push_pending
from app.notifications.service import generate_notifications
from app.reports.service import ReportCreate, create_report
from app.results.models import TestParameter
from app.results.schemas import TestResultCreate
from app.results.service import record_result
from app.seed import seed

if TYPE_CHECKING:
    from collections.abc import Sequence


@dataclass(frozen=True)
class DemoActionResult:
    action: str
    summary: str
    created_notifications: int
    ref_id: int | None = None


def _notification_total(db: Session) -> int:
    return int(db.scalar(select(func.count(Notification.id))) or 0)


def _ensure_stage_seeded(db: Session, *, today: date) -> None:
    register_audit_listener(Session)
    has_admin = db.scalar(select(User.id).where(User.login == "admin")) is not None
    has_thermo = db.scalar(select(Equipment.id).where(Equipment.number == "122")) is not None
    has_so3 = (
        db.scalar(select(TestParameter.id).where(TestParameter.name == "zawartość SO₃")) is not None
    )
    if not (has_admin and has_thermo and has_so3):
        seed(db, today=today)


def _require_user(db: Session, login_name: str) -> User:
    user = db.scalars(select(User).where(User.login == login_name)).first()
    if user is None:
        msg = f"Demo user {login_name!r} is missing even after seeding"
        raise RuntimeError(msg)
    return user


def stage_status(db: Session) -> dict[str, int]:
    """Return unread active notification counts keyed by user login."""
    counts: dict[str, int] = {"admin": 0, "kierownik": 0, "laborant": 0}
    rows = db.execute(
        select(User.login, func.count(Notification.id))
        .outerjoin(
            Notification,
            (Notification.user_id == User.id)
            & Notification.read_at.is_(None)
            & Notification.resolved_at.is_(None),
        )
        .where(User.active.is_(True))
        .group_by(User.login)
        .order_by(User.login)
    ).all()
    for login_name, unread in rows:
        counts[str(login_name)] = int(unread)
    return counts


def prepare_clean_stage(db: Session, *, today: date | None = None) -> DemoActionResult:
    """Ensure demo data is present and clear in-app notifications for a clean rehearsal."""
    ref_today = today if today is not None else get_today()
    seed(db, today=ref_today)
    db.execute(delete(Notification))
    db.flush()
    return DemoActionResult(
        action="reset",
        summary=f"Stage reset for {ref_today.isoformat()}: notifications cleared to 0",
        created_notifications=0,
    )


def trigger_time_jump(db: Session, *, target_date: date) -> DemoActionResult:
    """Simulate background deadline sweep on a future date."""
    _ensure_stage_seeded(db, today=get_today())
    created = generate_notifications(db, today=target_date)
    if push_configured():
        push_pending(db)
    db.flush()
    return DemoActionResult(
        action="jump",
        summary=(
            f"Simulated worker sweep on {target_date.isoformat()}: "
            f"created {created} notification(s)"
        ),
        created_notifications=created,
    )


def trigger_out_of_range_check(
    db: Session,
    *,
    temperature: str = "23,5",
    humidity: str = "54",
    performed_on: date | None = None,
) -> DemoActionResult:
    """Record an out-of-range environmental check on 122/A as laborant."""
    ref_day = performed_on if performed_on is not None else get_today()
    _ensure_stage_seeded(db, today=ref_day)
    laborant = _require_user(db, "laborant")

    plan = db.scalars(
        select(CheckPlan)
        .join(Equipment, CheckPlan.equipment_id == Equipment.id)
        .join(Lab, Equipment.lab_id == Lab.id)
        .where(
            Lab.code == "A",
            Equipment.number == "122",
            CheckPlan.active.is_(True),
        )
        .order_by(CheckPlan.id)
    ).first()
    if plan is None:
        msg = "Active check plan for equipment 122/A not found"
        raise RuntimeError(msg)

    before = _notification_total(db)
    with audit_context(user_id=laborant.id, reason="Sprawdzenie warunków środowiskowych"):
        rec = record_check(
            db,
            laborant,
            plan.id,
            CheckRecordCreate(
                performed_on=ref_day,
                values={"temperature_c": temperature, "humidity_pct": humidity},
                note="Pomiar kontrolny na zmianie",
            ),
        )
    created = _notification_total(db) - before
    return DemoActionResult(
        action="check",
        summary=(
            f"Recorded check #{rec.id} on 122/A ({temperature} °C): "
            f"created {created} notification(s)"
        ),
        created_notifications=created,
        ref_id=rec.id,
    )


def trigger_out_of_range_result(
    db: Session,
    *,
    value: str = "3,35",
    sample_label: str | None = None,
    today: date | None = None,
) -> DemoActionResult:
    """Record an out-of-range cement SO3 test result as laborant."""
    ref_day = today if today is not None else get_today()
    _ensure_stage_seeded(db, today=ref_day)
    laborant = _require_user(db, "laborant")

    param = db.scalars(
        select(TestParameter)
        .where(TestParameter.name == "zawartość SO₃", TestParameter.active.is_(True))
        .order_by(TestParameter.id)
    ).first()
    if param is None:
        param = db.scalars(
            select(TestParameter)
            .where(TestParameter.active.is_(True), TestParameter.max_value.is_not(None))
            .order_by(TestParameter.id)
        ).first()
    if param is None:
        msg = "No active test parameter with upper bound found"
        raise RuntimeError(msg)

    label = sample_label or f"C-DEMO/{secrets.token_hex(2).upper()}"
    before = _notification_total(db)
    with audit_context(user_id=laborant.id, reason="Wpis wyniku badania próbki"):
        res = record_result(
            db,
            laborant,
            TestResultCreate(
                parameter_id=param.id,
                sample_label=label,
                value=value,
            ),
        )
    created = _notification_total(db) - before
    return DemoActionResult(
        action="result",
        summary=(
            f"Recorded result #{res.id} ({param.name} = {value} {param.unit}, {label}): "
            f"created {created} notification(s)"
        ),
        created_notifications=created,
        ref_id=res.id,
    )


def trigger_manager_report(
    db: Session,
    *,
    today: date | None = None,
    days_back: int = 90,
) -> DemoActionResult:
    """Generate a signed PDF report with SVG trend chart and notify kierownik."""
    ref_day = today if today is not None else get_today()
    _ensure_stage_seeded(db, today=ref_day)
    admin = _require_user(db, "admin")

    so3 = db.scalars(select(TestParameter).where(TestParameter.name == "zawartość SO₃")).first()
    param_ids = [so3.id] if so3 is not None else []

    before = _notification_total(db)
    with audit_context(user_id=admin.id, reason="Raport okresowy dla kierownika laboratorium"):
        rep = create_report(
            db,
            admin,
            ReportCreate(
                period_from=ref_day - timedelta(days=days_back),
                period_to=ref_day,
                parameter_ids=param_ids,
            ),
            today=ref_day,
        )
    created = _notification_total(db) - before
    return DemoActionResult(
        action="report",
        summary=(
            f"Generated PDF report #{rep.id} (/api/reports/{rep.id}.pdf): "
            f"created {created} notification(s)"
        ),
        created_notifications=created,
        ref_id=rep.id,
    )


def _format_status_line(counts: dict[str, int]) -> str:
    parts = [f"{login}={count}" for login, count in counts.items()]
    return "Unread bells: " + " | ".join(parts)


def _run_action(
    db: Session,
    action: str,
    *,
    target_date: date | None,
    temperature: str,
    value: str,
    sample_label: str | None,
) -> str:
    base_today = get_today()
    if action == "status":
        return _format_status_line(stage_status(db))
    if action == "reset":
        res = prepare_clean_stage(db, today=target_date or base_today)
    elif action == "jump":
        jump_to = target_date if target_date is not None else base_today + timedelta(days=90)
        res = trigger_time_jump(db, target_date=jump_to)
    elif action == "check":
        res = trigger_out_of_range_check(
            db,
            temperature=temperature,
            performed_on=target_date or base_today,
        )
    elif action == "result":
        res = trigger_out_of_range_result(
            db,
            value=value,
            sample_label=sample_label,
            today=target_date or base_today,
        )
    elif action == "report":
        res = trigger_manager_report(db, today=target_date or base_today)
    else:
        msg = f"Unsupported action: {action}"
        raise ValueError(msg)
    return f"{res.summary}\n{_format_status_line(stage_status(db))}"


def _interactive_loop(db: Session, *, commit_each: bool) -> int:
    menu_actions = {
        "0": "reset",
        "1": "jump",
        "2": "check",
        "3": "result",
        "4": "report",
        "5": "status",
    }
    while True:
        sys.stdout.write("\n=== Intelligent Laboratory — Stage Director ===\n")
        sys.stdout.write(f"{_format_status_line(stage_status(db))}\n")
        sys.stdout.write("  [1] Time jump (+90 days -> deadline alerts for admin & laborant)\n")
        sys.stdout.write("  [2] Out-of-range check (122/A Termohigrometr: 23,5 °C -> admin)\n")
        sys.stdout.write("  [3] Out-of-range cement result (SO3 = 3,35 % -> admin)\n")
        sys.stdout.write("  [4] Generate PDF report with SVG chart (-> kierownik)\n")
        sys.stdout.write("  [5] Refresh bell status\n")
        sys.stdout.write("  [0] Clean stage reset (seed demo data + clear notifications)\n")
        sys.stdout.write("  [q] Quit\n")
        sys.stdout.write("Select action: ")
        sys.stdout.flush()

        try:
            choice = input().strip().lower()
        except EOFError:
            sys.stdout.write("\n")
            return 0

        if choice in {"q", "quit", "exit"}:
            return 0
        mapped = menu_actions.get(choice)
        if mapped is None:
            sys.stdout.write("Unknown option. Choose 1, 2, 3, 4, 5, 0, or q.\n")
            continue

        output = _run_action(
            db,
            mapped,
            target_date=None,
            temperature="23,5",
            value="3,35",
            sample_label=None,
        )
        if commit_each and mapped != "status":
            db.commit()
        sys.stdout.write(f"\n>> {output}\n")


def main(argv: Sequence[str] | None = None, *, db: Session | None = None) -> int:
    """CLI entrypoint for `python -m app.demo_director`."""
    parser = argparse.ArgumentParser(description="Live demo stage director.")
    parser.add_argument(
        "--action",
        choices=("reset", "jump", "check", "result", "report", "status"),
        default=None,
        help="Run a single non-interactive stage action and exit.",
    )
    parser.add_argument(
        "--date",
        type=date.fromisoformat,
        default=None,
        help="Target date (YYYY-MM-DD) for jump or reference date for reset/check/report.",
    )
    parser.add_argument(
        "--temp",
        default="23,5",
        help="Temperature reading for out-of-range check (default: 23,5).",
    )
    parser.add_argument(
        "--value",
        default="3,35",
        help="SO3 result value for out-of-range test result (default: 3,35).",
    )
    parser.add_argument(
        "--sample",
        default=None,
        help="Optional sample label for out-of-range test result.",
    )
    args = parser.parse_args(argv)

    if db is not None:
        if args.action is None:
            return _interactive_loop(db, commit_each=False)
        out = _run_action(
            db,
            args.action,
            target_date=args.date,
            temperature=args.temp,
            value=args.value,
            sample_label=args.sample,
        )
        sys.stdout.write(f"{out}\n")
        return 0

    with SessionLocal() as session:
        if args.action is None:
            return _interactive_loop(session, commit_each=True)
        out = _run_action(
            session,
            args.action,
            target_date=args.date,
            temperature=args.temp,
            value=args.value,
            sample_label=args.sample,
        )
        if args.action != "status":
            session.commit()
        sys.stdout.write(f"{out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
