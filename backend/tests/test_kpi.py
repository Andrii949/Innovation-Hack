from collections.abc import Callable
from datetime import date

import pytest
from app.audit.models import AuditLog
from app.auth.models import Lab, User
from app.equipment.models import Calibration, CheckPlan, CheckRecord, Equipment
from app.kpi import render_kpi_markdown, simulate
from app.seed import seed
from app.settings.models import Setting
from sqlalchemy import func, select
from sqlalchemy.orm import Session

TODAY = date(2026, 11, 27)


@pytest.mark.req("F2", "F3", "17025-7.11.2")
def test_alert_advance_is_lead_plus_due_month(
    db: Session,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_user: Callable[..., User],
) -> None:
    lab_a = make_lab("A", "Analityczna")
    make_user("admin", labs=[lab_a], all_labs=False)
    make_equipment(
        lab_a,
        number="1",
        name="Waga wzorcowa",
        interval=12,
        lead=1,
        last_calibrated_month="2025-12",
    )

    report = simulate(db, date_from=date(2026, 1, 1), date_to=date(2026, 12, 31))

    assert report.due_items_in_period == 1
    assert report.min_alert_lead_days == 60
    assert report.median_alert_lead_days == 60.0
    assert report.overdue_without_prior_alert == 0
    assert report.notifications_per_person_per_month > 0


@pytest.mark.req("F2", "F3", "17025-7.11.2")
def test_no_overdue_item_without_prior_alert_on_seeded_data(db: Session) -> None:
    seed(db, today=TODAY)
    db.flush()

    report = simulate(db, date_from=TODAY, date_to=date(2027, 12, 31))

    assert report.due_items_in_period >= 8
    assert report.overdue_without_prior_alert == 0
    assert report.min_alert_lead_days is not None
    assert report.min_alert_lead_days >= 28


@pytest.mark.req("17025-7.5.2", "17025-7.11.2")
def test_simulation_leaves_database_unchanged(
    db: Session,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_check_plan: Callable[..., CheckPlan],
    make_user: Callable[..., User],
) -> None:
    lab_a = make_lab("A", "Analityczna")
    worker = make_user("worker", labs=[lab_a])
    eq = make_equipment(lab_a, number="10", interval=12, lead=1, last_calibrated_month="2025-12")
    plan = make_check_plan(
        eq,
        [{"key": "temp", "label": "Temp", "type": "number", "min": "18", "max": "22"}],
    )
    db.add(
        CheckRecord(
            check_plan_id=plan.id,
            performed_on=date(2026, 11, 20),
            values={"temp": "24.0"},
            out_of_range=True,
            performed_by=worker.id,
        )
    )
    db.flush()

    before = (
        db.scalar(select(func.count(Equipment.id))),
        db.scalar(select(func.count(Calibration.id))),
        db.scalar(select(func.count(CheckRecord.id))),
        db.scalar(select(func.count(AuditLog.id))),
        db.scalar(select(func.count(Setting.key))),
    )

    report = simulate(db, date_from=date(2026, 11, 1), date_to=date(2026, 12, 31))

    after = (
        db.scalar(select(func.count(Equipment.id))),
        db.scalar(select(func.count(Calibration.id))),
        db.scalar(select(func.count(CheckRecord.id))),
        db.scalar(select(func.count(AuditLog.id))),
        db.scalar(select(func.count(Setting.key))),
    )
    assert after == before
    assert report.out_of_range_detected_at_entry == 1


@pytest.mark.req("17025-7.11.2")
def test_kpi_markdown_rendering_and_invalid_range(db: Session) -> None:
    with pytest.raises(ValueError, match="must be <="):
        simulate(db, date_from=date(2026, 12, 31), date_to=date(2026, 1, 1))

    report = simulate(db, date_from=date(2026, 11, 1), date_to=date(2026, 11, 30))
    md = render_kpi_markdown(report)
    assert "# Symulacja KPI (2026-11-01 — 2026-11-30)" in md
    assert "| Pozycje z terminem w okresie | 0 |" in md
    assert "| Minimalne wyprzedzenie pierwszego alertu | — |" in md
