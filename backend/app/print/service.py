"""Data for printed documents; the typst templates only lay it out (docs/02-architektura.md D12)."""

from datetime import date
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.equipment.models import Calibration, CheckPlan, CheckRecord, Equipment
from app.equipment.service import (
    equipment_due_month,
    equipment_status,
    format_code,
    last_calibration,
)
from app.errors import AppError
from app.print.render import RenderError, render

STATUS_LABELS = {
    "OK": "Ważne",
    "DUE_SOON": "Zbliża się termin",
    "OVERDUE": "Po terminie",
    "NO_DATA": "Brak danych",
    "WITHDRAWN": "Wycofane",
    "NOT_REQUIRED": "Bez wzorcowania",
}
RESULT_LABELS = {"OK": "OK", "NOK": "NIE OK"}


def month_label(d: date | None) -> str:
    return f"{d.month:02d}/{d.year}" if d is not None else "-"


def date_label(d: date) -> str:
    return f"{d:%d.%m.%Y}"


def render_pdf(template: str, data: BaseModel) -> bytes:
    try:
        return render(template, data.model_dump_json())
    except RenderError as exc:
        raise AppError(500, "RENDER_FAILED", "Nie udało się złożyć dokumentu") from exc


class HistoryCalibration(BaseModel):
    month: str
    vendor: str
    certificate_no: str
    result: str
    next_due: str
    points: str


class HistoryCheck(BaseModel):
    plan: str
    performed_on: str
    values: str
    out_of_range: bool


class EquipmentHistory(BaseModel):
    code: str
    name: str
    manufacturer: str
    model: str
    serial_no: str
    lab: str
    location: str
    status: str
    next_due: str
    withdrawn: str | None
    calibrations: list[HistoryCalibration]
    checks: list[HistoryCheck]
    generated_on: str


def _points_text(cal: Calibration) -> str:
    return "; ".join(
        f"{pt.point}: błąd {format(pt.error, 'f')} {pt.unit}, "
        f"niepewność {format(pt.uncertainty, 'f')} {pt.unit}"
        for pt in cal.points
    )


def _values_text(plan: CheckPlan, values: dict[str, Any]) -> str:
    fields = {f["key"]: f for f in plan.form_template.fields}
    parts = []
    for key, value in values.items():
        field = fields.get(key, {})
        unit = field.get("unit") or ""
        parts.append(f"{field.get('label') or key}: {value}{' ' + unit if unit else ''}")
    return "; ".join(parts)


def equipment_history(db: Session, eq: Equipment, *, today: date) -> EquipmentHistory:
    last = last_calibration(db, eq.id)
    calibrations = db.scalars(
        select(Calibration)
        .where(Calibration.equipment_id == eq.id)
        .order_by(Calibration.calibrated_month.desc(), Calibration.id.desc())
    ).all()
    checks = db.execute(
        select(CheckRecord, CheckPlan)
        .join(CheckPlan, CheckRecord.check_plan_id == CheckPlan.id)
        .where(CheckPlan.equipment_id == eq.id)
        .order_by(CheckRecord.performed_on.desc(), CheckRecord.id.desc())
    ).all()
    status = str(equipment_status(eq, last, today))
    return EquipmentHistory(
        code=format_code(eq.number, eq.lab.code),
        name=eq.name,
        manufacturer=eq.manufacturer or "-",
        model=eq.model or "-",
        serial_no=eq.serial_no or "-",
        lab=eq.lab.name,
        location=eq.location or "-",
        status=STATUS_LABELS.get(status, status),
        next_due=month_label(equipment_due_month(eq, last)),
        withdrawn=(eq.withdrawn_reason or "bez podanego powodu")
        if eq.withdrawn_at is not None
        else None,
        calibrations=[
            HistoryCalibration(
                month=month_label(cal.calibrated_month),
                vendor=cal.vendor or "-",
                certificate_no=cal.certificate_no or "-",
                result=RESULT_LABELS.get(cal.result, cal.result),
                next_due=month_label(cal.next_due_month),
                points=_points_text(cal) or "-",
            )
            for cal in calibrations
        ],
        checks=[
            HistoryCheck(
                plan=plan.name,
                performed_on=date_label(rec.performed_on),
                values=_values_text(plan, rec.values) or "-",
                out_of_range=rec.out_of_range,
            )
            for rec, plan in checks
        ],
        generated_on=date_label(today),
    )
