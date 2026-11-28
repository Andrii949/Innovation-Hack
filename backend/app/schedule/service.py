import importlib
import importlib.util
from datetime import date
from enum import StrEnum

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dates import add_months, due_status, month_window, next_due_month
from app.core.status import Status
from app.equipment.models import CheckPlan, Equipment
from app.equipment.service import format_code, last_calibration, last_check_record


class DueKind(StrEnum):
    CALIBRATION = "CALIBRATION"
    CHECK = "CHECK"
    LOT_EXPIRY = "LOT_EXPIRY"
    LOW_STOCK = "LOW_STOCK"
    STOCK_COUNT = "STOCK_COUNT"


class DueItem(BaseModel):
    kind: DueKind
    ref_type: str
    ref_id: int
    lab_id: int
    label: str
    due: date | None
    alert_from: date | None
    valid_until: date | None
    status: Status


STATUS_PRIORITY: dict[Status, int] = {
    Status.OVERDUE: 0,
    Status.NO_DATA: 1,
    Status.LOW: 2,
    Status.DUE_SOON: 3,
    Status.COUNT_DUE: 4,
    Status.OK: 5,
}


def calibration_items(
    db: Session,
    *,
    today: date,
    lab_ids: set[int] | None = None,
) -> list[DueItem]:
    stmt = select(Equipment).where(
        Equipment.withdrawn_at.is_(None),
        Equipment.calibration_required.is_(True),
    )
    if lab_ids is not None:
        if not lab_ids:
            return []
        stmt = stmt.where(Equipment.lab_id.in_(lab_ids))

    items: list[DueItem] = []
    for eq in db.scalars(stmt).all():
        code = format_code(eq.number, eq.lab.code)
        label = f"{code} {eq.name}"
        last = last_calibration(db, eq.id)
        if last is None or eq.calibration_interval_months is None:
            items.append(
                DueItem(
                    kind=DueKind.CALIBRATION,
                    ref_type="equipment",
                    ref_id=eq.id,
                    lab_id=eq.lab_id,
                    label=label,
                    due=None,
                    alert_from=None,
                    valid_until=None,
                    status=Status.NO_DATA,
                )
            )
            continue

        if last.result == "NOK":
            items.append(
                DueItem(
                    kind=DueKind.CALIBRATION,
                    ref_type="equipment",
                    ref_id=eq.id,
                    lab_id=eq.lab_id,
                    label=label,
                    due=None,
                    alert_from=None,
                    valid_until=None,
                    status=Status.OVERDUE,
                )
            )
            continue

        due = next_due_month(last.calibrated_month, eq.calibration_interval_months)
        alert_from, valid_until = month_window(due, eq.lead_months)
        st = due_status(alert_from, valid_until, today)
        items.append(
            DueItem(
                kind=DueKind.CALIBRATION,
                ref_type="equipment",
                ref_id=eq.id,
                lab_id=eq.lab_id,
                label=label,
                due=due,
                alert_from=alert_from,
                valid_until=valid_until,
                status=st,
            )
        )
    return items


def check_items(
    db: Session,
    *,
    today: date,
    lab_ids: set[int] | None = None,
) -> list[DueItem]:
    stmt = (
        select(CheckPlan)
        .join(Equipment, CheckPlan.equipment_id == Equipment.id)
        .where(
            Equipment.withdrawn_at.is_(None),
            CheckPlan.active.is_(True),
        )
    )
    if lab_ids is not None:
        if not lab_ids:
            return []
        stmt = stmt.where(Equipment.lab_id.in_(lab_ids))

    items: list[DueItem] = []
    for plan in db.scalars(stmt).all():
        eq = plan.equipment
        code = format_code(eq.number, eq.lab.code)
        label = f"{code} {eq.name} - {plan.name}"
        last_rec = last_check_record(db, plan.id)
        if last_rec is None:
            items.append(
                DueItem(
                    kind=DueKind.CHECK,
                    ref_type="check_plan",
                    ref_id=plan.id,
                    lab_id=eq.lab_id,
                    label=label,
                    due=None,
                    alert_from=None,
                    valid_until=None,
                    status=Status.NO_DATA,
                )
            )
            continue

        due = next_due_month(last_rec.performed_on, plan.interval_months)
        alert_from, valid_until = month_window(due, plan.lead_months)
        st = due_status(alert_from, valid_until, today)
        items.append(
            DueItem(
                kind=DueKind.CHECK,
                ref_type="check_plan",
                ref_id=plan.id,
                lab_id=eq.lab_id,
                label=label,
                due=due,
                alert_from=alert_from,
                valid_until=valid_until,
                status=st,
            )
        )
    return items


def _reagent_items(
    db: Session,
    *,
    today: date,
    lab_ids: set[int] | None = None,
) -> list[DueItem]:
    if (
        importlib.util.find_spec("app.reagents") is None
        or importlib.util.find_spec("app.reagents.service") is None
    ):
        return []
    mod = importlib.import_module("app.reagents.service")
    collected: list[DueItem] = []
    for fn_name in ("lot_items", "stock_items"):
        fn = getattr(mod, fn_name, None)
        if callable(fn):
            raw_items = fn(db, today=today, lab_ids=lab_ids)
            for item in raw_items:
                collected.append(DueItem.model_validate(item))
    return collected


def list_due_items(
    db: Session,
    *,
    today: date,
    lab_ids: set[int] | None = None,
    kinds: set[DueKind] | None = None,
    horizon_months: int | None = None,
    include_ok: bool = False,
) -> list[DueItem]:
    items: list[DueItem] = []
    if kinds is None or DueKind.CALIBRATION in kinds:
        items.extend(calibration_items(db, today=today, lab_ids=lab_ids))
    if kinds is None or DueKind.CHECK in kinds:
        items.extend(check_items(db, today=today, lab_ids=lab_ids))
    if kinds is None or bool(kinds & {DueKind.LOT_EXPIRY, DueKind.LOW_STOCK, DueKind.STOCK_COUNT}):
        for r_item in _reagent_items(db, today=today, lab_ids=lab_ids):
            if kinds is None or r_item.kind in kinds:
                items.append(r_item)

    if not include_ok:
        items = [item for item in items if item.status is not Status.OK]

    if horizon_months is not None:
        cutoff = add_months(today, horizon_months)
        items = [item for item in items if item.due is None or item.due <= cutoff]

    items.sort(
        key=lambda item: (
            STATUS_PRIORITY.get(item.status, 99),
            item.due or date.min,
            item.label,
        )
    )
    return items
