"""Month arithmetic and deadline windows (docs/02-architektura.md §4)."""

import calendar
from datetime import date

from app.core.status import Status


def month_start(d: date) -> date:
    return d.replace(day=1)


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def add_months(d: date, months: int) -> date:
    """Shift by whole months; the day is clamped to the end of the target month."""
    years, month0 = divmod(d.month - 1 + months, 12)
    year, month = d.year + years, month0 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def next_due_month(done: date, interval_months: int) -> date:
    """First day of the month in which the next calibration or check is due."""
    return add_months(month_start(done), interval_months)


def month_window(due_month: date, lead_months: int) -> tuple[date, date]:
    """(alert_from, valid_until) for a month-based deadline: valid to the end of the due month."""
    return add_months(month_start(due_month), -lead_months), month_end(due_month)


def date_window(expiry: date, lead_months: int) -> tuple[date, date]:
    """(alert_from, valid_until) for an exact expiry date."""
    return add_months(expiry, -lead_months), expiry


def due_status(alert_from: date, valid_until: date, today: date) -> Status:
    if today > valid_until:
        return Status.OVERDUE
    if today >= alert_from:
        return Status.DUE_SOON
    return Status.OK
