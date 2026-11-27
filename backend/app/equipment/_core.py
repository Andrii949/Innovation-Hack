import calendar
import importlib
import importlib.util
import re
from datetime import date
from decimal import Decimal
from enum import StrEnum

_DECIMAL_RE = re.compile(r"^-?[0-9]+([.,][0-9]+)?$")


class Status(StrEnum):
    OK = "OK"
    DUE_SOON = "DUE_SOON"
    OVERDUE = "OVERDUE"
    NO_DATA = "NO_DATA"
    WITHDRAWN = "WITHDRAWN"
    NOT_REQUIRED = "NOT_REQUIRED"
    LOW = "LOW"
    COUNT_DUE = "COUNT_DUE"


class RangeResult(StrEnum):
    IN_RANGE = "IN_RANGE"
    BELOW = "BELOW"
    ABOVE = "ABOVE"


def add_months(d: date, months: int) -> date:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        res: date = mod.add_months(d, months)
        return res
    years, month0 = divmod(d.month - 1 + months, 12)
    year, month = d.year + years, month0 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def month_start(d: date) -> date:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        res: date = mod.month_start(d)
        return res
    return date(d.year, d.month, 1)


def month_end(d: date) -> date:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        res: date = mod.month_end(d)
        return res
    last_day = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last_day)


def next_due_month(done: date, interval_months: int) -> date:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        res: date = mod.next_due_month(done, interval_months)
        return res
    return add_months(month_start(done), interval_months)


def month_window(due_month: date, lead_months: int) -> tuple[date, date]:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        alert_from, valid_until = mod.month_window(due_month, lead_months)
        return alert_from, valid_until
    due_start = month_start(due_month)
    return add_months(due_start, -lead_months), month_end(due_start)


def date_window(expiry: date, lead_months: int) -> tuple[date, date]:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        alert_from, valid_until = mod.date_window(expiry, lead_months)
        return alert_from, valid_until
    return add_months(expiry, -lead_months), expiry


def due_status(alert_from: date, valid_until: date, today: date) -> Status:
    if importlib.util.find_spec("app.core.dates") is not None:
        mod = importlib.import_module("app.core.dates")
        raw = mod.due_status(alert_from, valid_until, today)
        return Status(str(raw))
    if today > valid_until:
        return Status.OVERDUE
    if today >= alert_from:
        return Status.DUE_SOON
    return Status.OK


def parse_decimal(text: str) -> Decimal:
    if importlib.util.find_spec("app.core.ranges") is not None:
        mod = importlib.import_module("app.core.ranges")
        res: Decimal = mod.parse_decimal(text)
        return res
    cleaned = text.strip()
    if not _DECIMAL_RE.match(cleaned):
        raise ValueError(f"Invalid decimal literal: {text!r}")
    return Decimal(cleaned.replace(",", "."))


def check_range(
    value: Decimal,
    min_value: Decimal | None,
    max_value: Decimal | None,
) -> RangeResult:
    if importlib.util.find_spec("app.core.ranges") is not None:
        mod = importlib.import_module("app.core.ranges")
        raw = mod.check_range(value, min_value, max_value)
        return RangeResult(str(raw))
    if min_value is not None and value < min_value:
        return RangeResult.BELOW
    if max_value is not None and value > max_value:
        return RangeResult.ABOVE
    return RangeResult.IN_RANGE
