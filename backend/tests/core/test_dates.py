from datetime import date

from app.core.dates import add_months, date_window, due_status, month_window, next_due_month
from app.core.status import Status

TODAY = date(2026, 11, 27)


def test_add_months_clamps_to_month_end() -> None:
    assert add_months(date(2027, 5, 31), -6) == date(2026, 11, 30)
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_next_due_month_counts_from_certificate_month() -> None:
    assert next_due_month(date(2025, 12, 1), 12) == date(2026, 12, 1)
    assert next_due_month(date(2026, 11, 5), 1) == date(2026, 12, 1)


def test_month_window_rolls_over_year() -> None:
    assert month_window(date(2027, 1, 1), 1) == (date(2026, 12, 1), date(2027, 1, 31))
    assert month_window(date(2027, 1, 1), 12) == (date(2026, 1, 1), date(2027, 1, 31))


def test_examples_from_architecture() -> None:
    # docs/02-architektura.md §4.3
    assert due_status(*month_window(date(2027, 3, 1), 1), TODAY) is Status.OK
    assert due_status(*month_window(date(2026, 12, 1), 1), TODAY) is Status.DUE_SOON
    assert due_status(*month_window(date(2026, 10, 1), 1), TODAY) is Status.OVERDUE
    assert due_status(*date_window(date(2027, 5, 31), 6), TODAY) is Status.OK
    assert due_status(*date_window(date(2027, 5, 31), 6), date(2026, 11, 30)) is Status.DUE_SOON
    assert due_status(*month_window(date(2026, 12, 1), 0), TODAY) is Status.OK


def test_last_day_of_due_month_is_still_valid() -> None:
    window = month_window(date(2026, 11, 1), 1)
    assert due_status(*window, date(2026, 11, 30)) is Status.DUE_SOON
    assert due_status(*window, date(2026, 12, 1)) is Status.OVERDUE
