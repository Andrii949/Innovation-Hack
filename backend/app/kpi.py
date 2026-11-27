"""Rollback-safe KPI simulation for alert lead times and coverage (T35 / 05 §a5)."""

from __future__ import annotations

import argparse
import importlib
import importlib.util
import statistics
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.models import AuditLog
from app.auth.models import User
from app.auth.permissions import visible_lab_ids
from app.core.status import Status
from app.db import SessionLocal
from app.equipment.models import CheckRecord
from app.schedule.service import DueItem, DueKind, list_due_items

if TYPE_CHECKING:
    from collections.abc import Sequence

_ItemKey = tuple[str, str, int, date | None]
_ALERT_STATUSES: frozenset[Status] = frozenset(
    {Status.DUE_SOON, Status.OVERDUE, Status.NO_DATA, Status.LOW, Status.COUNT_DUE}
)
_PRE_OVERDUE_STATUSES: frozenset[Status] = frozenset(
    {Status.DUE_SOON, Status.LOW, Status.COUNT_DUE}
)


@dataclass(frozen=True)
class KpiReport:
    """Simulated alert coverage and lead-time KPIs over a date window."""

    date_from: date
    date_to: date
    due_items_in_period: int
    min_alert_lead_days: int | None
    median_alert_lead_days: float | None
    overdue_without_prior_alert: int
    notifications_per_person_per_month: float
    out_of_range_detected_at_entry: int


def _recipient_ids_for_item(item: DueItem, users: Sequence[User]) -> list[int]:
    if item.kind in {DueKind.CALIBRATION, DueKind.LOT_EXPIRY, DueKind.LOW_STOCK}:
        target_roles = {"admin"}
    elif item.kind is DueKind.CHECK:
        target_roles = {"admin", "worker"}
    else:
        target_roles = {"worker"}

    recipients: list[int] = []
    for user in users:
        if user.role.name not in target_roles:
            continue
        allowed_labs = visible_lab_ids(user)
        if allowed_labs is None or item.lab_id in allowed_labs:
            recipients.append(user.id)
    return recipients


def _count_out_of_range_entries(db: Session, *, date_from: date, date_to: date) -> int:
    check_oor = len(
        db.scalars(
            select(CheckRecord.id).where(
                CheckRecord.out_of_range.is_(True),
                CheckRecord.performed_on >= date_from,
                CheckRecord.performed_on <= date_to,
            )
        ).all()
    )
    start_dt = datetime(date_from.year, date_from.month, date_from.day, tzinfo=UTC)
    end_dt = datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, 999999, tzinfo=UTC)
    rejected = len(
        db.scalars(
            select(AuditLog.id).where(
                AuditLog.action == "reject",
                AuditLog.at >= start_dt,
                AuditLog.at <= end_dt,
            )
        ).all()
    )

    result_oor = 0
    if (
        importlib.util.find_spec("app.results") is not None
        and importlib.util.find_spec("app.results.models") is not None
    ):
        results_mod = importlib.import_module("app.results.models")
        result_cls = getattr(results_mod, "TestResult", None)
        if result_cls is not None:
            result_oor = len(
                db.scalars(
                    select(result_cls.id).where(
                        result_cls.in_range.is_(False),
                        result_cls.created_at >= start_dt,
                        result_cls.created_at <= end_dt,
                    )
                ).all()
            )
    return check_oor + rejected + result_oor


def simulate(db: Session, *, date_from: date, date_to: date) -> KpiReport:
    """Simulate daily schedule alerts over `[date_from, date_to]` without mutating the DB."""
    if date_from > date_to:
        msg = f"date_from ({date_from.isoformat()}) must be <= date_to ({date_to.isoformat()})"
        raise ValueError(msg)

    savepoint = db.begin_nested()
    try:
        active_users = db.scalars(select(User).where(User.active.is_(True))).all()
        notif_fn = None
        if (
            importlib.util.find_spec("app.notifications") is not None
            and importlib.util.find_spec("app.notifications.service") is not None
        ):
            notif_mod = importlib.import_module("app.notifications.service")
            candidate = getattr(notif_mod, "generate_notifications", None)
            if callable(candidate):
                notif_fn = candidate

        items_in_period: dict[_ItemKey, date] = {}
        first_pre_overdue_alert: dict[_ItemKey, date] = {}
        became_overdue_in_period: set[_ItemKey] = set()
        seen_notifications: set[tuple[int, str]] = set()
        total_notifications = 0

        day = date_from
        while day <= date_to:
            all_items = list_due_items(db, today=day, include_ok=True)
            for item in all_items:
                key: _ItemKey = (item.kind.value, item.ref_type, item.ref_id, item.due)
                if item.valid_until is not None and date_from <= item.valid_until <= date_to:
                    items_in_period[key] = item.valid_until

                if (
                    item.status in _PRE_OVERDUE_STATUSES
                    and (item.valid_until is None or day <= item.valid_until)
                    and key not in first_pre_overdue_alert
                ):
                    first_pre_overdue_alert[key] = day

                if (
                    item.status is Status.OVERDUE
                    and item.valid_until is not None
                    and date_from <= item.valid_until < date_to
                ):
                    became_overdue_in_period.add(key)

                if notif_fn is None and item.status in _ALERT_STATUSES:
                    dedupe = (
                        f"{item.kind.value}:{item.ref_type}:{item.ref_id}:"
                        f"{item.due}:{item.status.value}"
                    )
                    for uid in _recipient_ids_for_item(item, active_users):
                        pair = (uid, dedupe)
                        if pair not in seen_notifications:
                            seen_notifications.add(pair)
                            total_notifications += 1

            if notif_fn is not None:
                raw_count = notif_fn(db, today=day)
                total_notifications += int(raw_count) if isinstance(raw_count, int) else 0

            day += timedelta(days=1)

        lead_days = [
            (valid_until - first_alert).days
            for key, valid_until in items_in_period.items()
            if (first_alert := first_pre_overdue_alert.get(key)) is not None
        ]
        min_lead = min(lead_days) if lead_days else None
        median_lead = float(statistics.median(lead_days)) if lead_days else None
        overdue_without_prior = sum(
            1 for key in became_overdue_in_period if key not in first_pre_overdue_alert
        )

        months = max(((date_to - date_from).days + 1) / 30.4375, 1.0)
        notif_rate = (
            round(total_notifications / (len(active_users) * months), 2) if active_users else 0.0
        )
        out_of_range_count = _count_out_of_range_entries(db, date_from=date_from, date_to=date_to)

        return KpiReport(
            date_from=date_from,
            date_to=date_to,
            due_items_in_period=len(items_in_period),
            min_alert_lead_days=min_lead,
            median_alert_lead_days=median_lead,
            overdue_without_prior_alert=overdue_without_prior,
            notifications_per_person_per_month=notif_rate,
            out_of_range_detected_at_entry=out_of_range_count,
        )
    finally:
        if savepoint.is_active:
            savepoint.rollback()


def render_kpi_markdown(report: KpiReport) -> str:
    """Format simulated KPIs as a Polish Markdown table for `docs/05-kryteria.md` §a5."""
    min_str = f"{report.min_alert_lead_days} dni" if report.min_alert_lead_days is not None else "—"
    med_str = (
        f"{report.median_alert_lead_days:.1f} dni"
        if report.median_alert_lead_days is not None
        else "—"
    )
    lines = [
        f"# Symulacja KPI ({report.date_from.isoformat()} — {report.date_to.isoformat()})",
        "",
        "| Wskaźnik | Wartość |",
        "|---|---|",
        f"| Pozycje z terminem w okresie | {report.due_items_in_period} |",
        f"| Minimalne wyprzedzenie pierwszego alertu | {min_str} |",
        f"| Mediana wyprzedzenia pierwszego alertu | {med_str} |",
        f"| Pozycje po terminie bez wcześniejszego alertu | {report.overdue_without_prior_alert} |",
        f"| Powiadomienia na osobę na miesiąc | {report.notifications_per_person_per_month:.2f} |",
        f"| Wpisy poza zakresem wykryte przy zapisie | {report.out_of_range_detected_at_entry} |",
        "",
    ]
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for `python -m app.kpi`."""
    parser = argparse.ArgumentParser(description="Simulate alert lead times and KPI coverage.")
    parser.add_argument(
        "--from",
        dest="date_from",
        type=date.fromisoformat,
        required=True,
        help="Start date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--to",
        dest="date_to",
        type=date.fromisoformat,
        required=True,
        help="End date (YYYY-MM-DD).",
    )
    args = parser.parse_args(argv)

    with SessionLocal() as db:
        report = simulate(db, date_from=args.date_from, date_to=args.date_to)
    sys.stdout.write(render_kpi_markdown(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
