import re
import secrets
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.context import audit_context
from app.auth.models import Lab, User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.config import get_settings
from app.equipment._core import Status, due_status, month_window, next_due_month
from app.equipment.models import Calibration, Equipment
from app.equipment.schemas import (
    EquipmentCard,
    EquipmentCreate,
    EquipmentOut,
    EquipmentUpdate,
)
from app.errors import AppError
from app.settings.service import get_setting

PUBLIC_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_MONTH_RE = re.compile(r"^([0-9]{4})-(0[1-9]|1[0-2])$")


def format_code(number: str, lab_code: str) -> str:
    return f"{number}/{lab_code}"


def new_public_id() -> str:
    return "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(10))


def _unique_public_id(db: Session) -> str:
    for _ in range(20):
        candidate = new_public_id()
        exists = db.scalars(select(Equipment.id).where(Equipment.public_id == candidate)).first()
        if exists is None:
            return candidate
    raise RuntimeError("Could not generate unique equipment public_id")


def parse_month_str(value: str, *, field_name: str = "month") -> date:
    match = _MONTH_RE.match(value.strip())
    if not match:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Nieprawidłowy format miesiąca (wymagany RRRR-MM) w polu {field_name}",
            details=[{"field": field_name, "message": "Wymagany format YYYY-MM"}],
        )
    return date(int(match.group(1)), int(match.group(2)), 1)


def format_month_date(d: date | None) -> str | None:
    if d is None:
        return None
    return f"{d.year:04d}-{d.month:02d}"


def last_calibration(db: Session, equipment_id: int) -> Calibration | None:
    stmt = (
        select(Calibration)
        .where(Calibration.equipment_id == equipment_id)
        .order_by(Calibration.calibrated_month.desc(), Calibration.id.desc())
        .limit(1)
    )
    return db.scalars(stmt).first()


def equipment_due_month(eq: Equipment, last: Calibration | None) -> date | None:
    if not eq.calibration_required or last is None or eq.calibration_interval_months is None:
        return None
    return next_due_month(last.calibrated_month, eq.calibration_interval_months)


def equipment_status(eq: Equipment, last: Calibration | None, today: date) -> Status:
    if eq.withdrawn_at is not None:
        return Status.WITHDRAWN
    if not eq.calibration_required:
        return Status.NOT_REQUIRED
    if last is None or eq.calibration_interval_months is None:
        return Status.NO_DATA
    due = next_due_month(last.calibrated_month, eq.calibration_interval_months)
    alert_from, valid_until = month_window(due, eq.lead_months)
    return due_status(alert_from, valid_until, today)


def _validate_equipment_lead(db: Session, lead_months: int) -> None:
    bounds = get_setting(db, "equipment_lead_months_range")
    lo, hi = int(bounds[0]), int(bounds[1])
    if lead_months < lo or lead_months > hi:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Wyprzedzenie urządzenia musi mieścić się w zakresie {lo}-{hi} miesięcy",
            details=[{"field": "lead_months", "message": f"Dozwolony zakres: {lo}..{hi}"}],
        )


def _validate_interval(calibration_required: bool, interval: int | None) -> None:
    if calibration_required and (interval is None or interval < 1):
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Dla urządzenia wymagającego wzorcowania należy podać dodatni interwał w miesiącach",
            details=[
                {
                    "field": "calibration_interval_months",
                    "message": "Wymagana dodatnia liczba miesięcy",
                }
            ],
        )
    if interval is not None and interval < 1:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Interwał wzorcowania musi być dodatni",
            details=[
                {
                    "field": "calibration_interval_months",
                    "message": "Interwał musi być >= 1",
                }
            ],
        )


def can_user_write_checks(user: User, eq: Equipment) -> bool:
    if eq.withdrawn_at is not None:
        return False
    try:
        require(user, Permission.CHECK_WRITE, equipment=eq)
    except AppError:
        return False
    return True


def serialize_equipment_out(db: Session, eq: Equipment, *, today: date) -> EquipmentOut:
    last = last_calibration(db, eq.id)
    due = equipment_due_month(eq, last)
    st = equipment_status(eq, last, today)
    return EquipmentOut(
        id=eq.id,
        public_id=eq.public_id,
        lab_id=eq.lab_id,
        number=eq.number,
        code=format_code(eq.number, eq.lab.code),
        name=eq.name,
        category=eq.category,
        manufacturer=eq.manufacturer,
        model=eq.model,
        serial_no=eq.serial_no,
        software_version=eq.software_version,
        location=eq.location,
        calibration_required=eq.calibration_required,
        calibration_interval_months=eq.calibration_interval_months,
        calibration_mode=eq.calibration_mode,
        lead_months=eq.lead_months,
        acceptance_criteria=eq.acceptance_criteria,
        withdrawn_at=eq.withdrawn_at.isoformat() if eq.withdrawn_at is not None else None,
        withdrawn_reason=eq.withdrawn_reason,
        notes=eq.notes,
        status=st,
        last_calibrated_month=format_month_date(last.calibrated_month)
        if last is not None
        else None,
        next_due_month=format_month_date(due),
    )


def serialize_equipment_card(
    db: Session,
    user: User,
    eq: Equipment,
    *,
    today: date,
) -> EquipmentCard:
    base = serialize_equipment_out(db, eq, today=today)
    base_url = get_settings().public_base_url.rstrip("/")
    return EquipmentCard(
        **base.model_dump(),
        check_plans=[],
        can_write=can_user_write_checks(user, eq),
        qr_url=f"{base_url}/e/{eq.public_id}",
    )


def create_equipment(db: Session, user: User, data: EquipmentCreate) -> Equipment:
    require(user, Permission.EQUIPMENT_WRITE, lab_id=data.lab_id)
    lab = db.get(Lab, data.lab_id)
    if lab is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono pracowni")

    clean_number = data.number.strip()
    clean_name = data.name.strip()
    if not clean_number or not clean_name:
        raise AppError(422, "VALIDATION_ERROR", "Numer i nazwa urządzenia są wymagane")

    lead = (
        data.lead_months
        if data.lead_months is not None
        else int(get_setting(db, "default_equipment_lead_months"))
    )
    _validate_equipment_lead(db, lead)
    _validate_interval(data.calibration_required, data.calibration_interval_months)

    duplicate = db.scalars(
        select(Equipment.id).where(
            Equipment.lab_id == data.lab_id,
            Equipment.number == clean_number,
        )
    ).first()
    if duplicate is not None:
        raise AppError(
            409,
            "DUPLICATE_EQUIPMENT_NUMBER",
            f"Urządzenie o numerze '{clean_number}' już istnieje w tej pracowni",
        )

    sticker_date = (
        parse_month_str(data.last_calibrated_month, field_name="last_calibrated_month")
        if data.last_calibrated_month is not None
        else None
    )

    eq = Equipment(
        public_id=_unique_public_id(db),
        lab_id=data.lab_id,
        number=clean_number,
        name=clean_name,
        category=data.category,
        manufacturer=data.manufacturer,
        model=data.model,
        serial_no=data.serial_no,
        software_version=data.software_version,
        location=data.location,
        calibration_required=data.calibration_required,
        calibration_interval_months=data.calibration_interval_months,
        calibration_mode=data.calibration_mode,
        lead_months=lead,
        acceptance_criteria=data.acceptance_criteria,
        notes=data.notes,
    )
    db.add(eq)
    db.flush()
    db.refresh(eq)

    if sticker_date is not None:
        due = (
            next_due_month(sticker_date, eq.calibration_interval_months)
            if eq.calibration_interval_months is not None
            else None
        )
        cal = Calibration(
            equipment_id=eq.id,
            calibrated_month=sticker_date,
            vendor=None,
            certificate_no=None,
            adjustments=None,
            result="OK",
            next_due_month=due,
            note="Przeniesione z ewidencji papierowej",
            source="MANUAL",
            ocr_meta=None,
            created_by=user.id,
        )
        db.add(cal)
        db.flush()

    return eq


def get_equipment_or_404(db: Session, equipment_id: int) -> Equipment:
    eq = db.get(Equipment, equipment_id)
    if eq is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono urządzenia")
    return eq


def get_equipment_for_user(db: Session, user: User, equipment_id: int) -> Equipment:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.EQUIPMENT_READ, lab_id=eq.lab_id)
    return eq


def get_equipment_by_qr(db: Session, user: User, public_id: str) -> Equipment:
    eq = db.scalars(select(Equipment).where(Equipment.public_id == public_id)).first()
    if eq is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono urządzenia dla podanego kodu")
    require(user, Permission.EQUIPMENT_READ, lab_id=eq.lab_id)
    return eq


def list_equipment_for_user(
    db: Session,
    user: User,
    *,
    today: date,
    lab_id: int | None = None,
    status_filter: Status | None = None,
    query: str | None = None,
) -> list[EquipmentOut]:
    require(user, Permission.EQUIPMENT_READ, lab_id=lab_id)
    allowed_labs = visible_lab_ids(user)
    stmt = select(Equipment).order_by(Equipment.lab_id, Equipment.number)
    if lab_id is not None:
        stmt = stmt.where(Equipment.lab_id == lab_id)
    elif allowed_labs is not None:
        stmt = stmt.where(Equipment.lab_id.in_(allowed_labs))

    rows = db.scalars(stmt).all()
    items = [serialize_equipment_out(db, eq, today=today) for eq in rows]
    if status_filter is not None:
        items = [item for item in items if item.status is status_filter]
    if query:
        needle = query.strip().lower()
        items = [
            item for item in items if needle in item.code.lower() or needle in item.name.lower()
        ]
    return items


def update_equipment(
    db: Session,
    user: User,
    equipment_id: int,
    data: EquipmentUpdate,
) -> Equipment:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.EQUIPMENT_WRITE, lab_id=eq.lab_id)

    fields_set = data.model_fields_set
    target_lab_id = data.lab_id if "lab_id" in fields_set and data.lab_id is not None else eq.lab_id
    if target_lab_id != eq.lab_id:
        require(user, Permission.EQUIPMENT_WRITE, lab_id=target_lab_id)
        if db.get(Lab, target_lab_id) is None:
            raise AppError(404, "NOT_FOUND", "Nie znaleziono docelowej pracowni")

    target_number = (
        data.number.strip() if "number" in fields_set and data.number is not None else eq.number
    )
    if not target_number:
        raise AppError(422, "VALIDATION_ERROR", "Numer urządzenia nie może być pusty")

    if target_lab_id != eq.lab_id or target_number != eq.number:
        conflict = db.scalars(
            select(Equipment.id).where(
                Equipment.lab_id == target_lab_id,
                Equipment.number == target_number,
                Equipment.id != eq.id,
            )
        ).first()
        if conflict is not None:
            raise AppError(
                409,
                "DUPLICATE_EQUIPMENT_NUMBER",
                f"Urządzenie o numerze '{target_number}' już istnieje w tej pracowni",
            )

    new_req = (
        data.calibration_required
        if "calibration_required" in fields_set and data.calibration_required is not None
        else eq.calibration_required
    )
    new_interval = (
        data.calibration_interval_months
        if "calibration_interval_months" in fields_set
        else eq.calibration_interval_months
    )
    _validate_interval(new_req, new_interval)

    if "lead_months" in fields_set and data.lead_months is not None:
        _validate_equipment_lead(db, data.lead_months)
        eq.lead_months = data.lead_months

    eq.lab_id = target_lab_id
    eq.number = target_number
    if "name" in fields_set and data.name is not None:
        clean_name = data.name.strip()
        if not clean_name:
            raise AppError(422, "VALIDATION_ERROR", "Nazwa urządzenia nie może być pusta")
        eq.name = clean_name
    for attr in (
        "category",
        "manufacturer",
        "model",
        "serial_no",
        "software_version",
        "location",
        "acceptance_criteria",
        "notes",
    ):
        if attr in fields_set:
            setattr(eq, attr, getattr(data, attr))
    if "calibration_mode" in fields_set and data.calibration_mode is not None:
        eq.calibration_mode = data.calibration_mode
    eq.calibration_required = new_req
    eq.calibration_interval_months = new_interval

    db.flush()
    db.refresh(eq)
    return eq


def withdraw(db: Session, user: User, equipment_id: int, reason: str) -> Equipment:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.EQUIPMENT_WRITE, lab_id=eq.lab_id)
    clean_reason = reason.strip()
    if not clean_reason:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Wymagane podanie powodu wycofania urządzenia",
            details=[{"field": "reason", "message": "Powód wycofania jest wymagany"}],
        )
    with audit_context(user.id, reason=clean_reason):
        eq.withdrawn_at = datetime.now(UTC)
        eq.withdrawn_reason = clean_reason
        db.flush()
    return eq


def restore(db: Session, user: User, equipment_id: int, reason: str) -> Equipment:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.EQUIPMENT_WRITE, lab_id=eq.lab_id)
    clean_reason = reason.strip()
    if not clean_reason:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Wymagane podanie powodu przywrócenia urządzenia",
            details=[{"field": "reason", "message": "Powód przywrócenia jest wymagany"}],
        )
    with audit_context(user.id, reason=clean_reason):
        eq.withdrawn_at = None
        eq.withdrawn_reason = None
        db.flush()
    return eq
