import importlib
import importlib.util
import re
import secrets
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.context import audit_context
from app.auth.models import Lab, User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.config import get_settings
from app.equipment._core import Status, due_status, month_window, next_due_month, parse_decimal
from app.equipment.models import (
    Calibration,
    CalibrationPoint,
    CheckPlan,
    CheckRecord,
    Equipment,
    EquipmentAuthorization,
)
from app.equipment.schemas import (
    AuthorizedUserOut,
    CalibrationCreate,
    CalibrationOut,
    CalibrationPointOut,
    CheckPlanCreate,
    CheckPlanSummaryOut,
    CheckPlanUpdate,
    CheckRecordCreate,
    CheckRecordOut,
    EquipmentCard,
    EquipmentCreate,
    EquipmentOut,
    EquipmentUpdate,
)
from app.errors import AppError
from app.files.service import attach, list_attachment_ids
from app.forms.models import FormTemplate
from app.forms.validation import FieldSpec, validate_form_values
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
    plans = [
        serialize_check_plan(db, plan, eq=eq, today=today)
        for plan in sorted(eq.check_plans, key=lambda p: p.id)
        if plan.active
    ]
    return EquipmentCard(
        **base.model_dump(),
        check_plans=plans,
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


def serialize_authorized_user(u: User) -> AuthorizedUserOut:
    return AuthorizedUserOut(
        id=u.id,
        login=u.login,
        full_name=u.full_name,
        role=u.role.name,
    )


def list_authorized_users(db: Session, user: User, equipment_id: int) -> list[User]:
    eq = get_equipment_for_user(db, user, equipment_id)
    ids = eq.authorized_user_ids
    if not ids:
        return []
    stmt = select(User).where(User.id.in_(ids)).order_by(User.full_name, User.id)
    return list(db.scalars(stmt).all())


def set_authorized_users(
    db: Session,
    user: User,
    equipment_id: int,
    user_ids: list[int],
) -> list[User]:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.EQUIPMENT_WRITE, lab_id=eq.lab_id)

    unique_ids = list(dict.fromkeys(user_ids))
    users_by_id: dict[int, User] = {}
    if unique_ids:
        fetched = db.scalars(select(User).where(User.id.in_(unique_ids))).all()
        users_by_id = {u.id: u for u in fetched}
        if len(users_by_id) != len(unique_ids):
            raise AppError(404, "NOT_FOUND", "Nie znaleziono wskazanego użytkownika")
        for uid in unique_ids:
            target_user = users_by_id[uid]
            user_labs = visible_lab_ids(target_user)
            if user_labs is not None and eq.lab_id not in user_labs:
                raise AppError(
                    422,
                    "USER_NOT_IN_LAB",
                    "Użytkownik nie jest przypisany do pracowni tego urządzenia",
                )

    wanted = set(unique_ids)
    current = {auth_row.user_id: auth_row for auth_row in list(eq.authorizations)}
    for uid, auth_row in current.items():
        if uid not in wanted:
            eq.authorizations.remove(auth_row)
    for uid in unique_ids:
        if uid not in current:
            eq.authorizations.append(EquipmentAuthorization(equipment_id=eq.id, user_id=uid))

    db.flush()
    db.refresh(eq)
    return [users_by_id[uid] for uid in unique_ids]


def serialize_calibration(db: Session, cal: Calibration) -> CalibrationOut:
    att_ids = list_attachment_ids(db, owner_type="calibration", owner_id=cal.id)
    return CalibrationOut(
        id=cal.id,
        equipment_id=cal.equipment_id,
        calibrated_month=format_month_date(cal.calibrated_month) or "",
        vendor=cal.vendor,
        certificate_no=cal.certificate_no,
        adjustments=cal.adjustments,
        result=cal.result,
        next_due_month=format_month_date(cal.next_due_month),
        note=cal.note,
        source=cal.source,
        ocr_meta=cal.ocr_meta,
        created_by=cal.created_by,
        created_at=cal.created_at.isoformat(),
        points=[
            CalibrationPointOut(
                id=pt.id,
                point=pt.point,
                error=format(pt.error, "f"),
                uncertainty=format(pt.uncertainty, "f"),
                unit=pt.unit,
            )
            for pt in cal.points
        ],
        attachment_ids=att_ids,
    )


def list_calibrations(db: Session, user: User, equipment_id: int) -> list[CalibrationOut]:
    eq = get_equipment_for_user(db, user, equipment_id)
    rows = db.scalars(
        select(Calibration)
        .where(Calibration.equipment_id == eq.id)
        .order_by(Calibration.calibrated_month.desc(), Calibration.id.desc())
    ).all()
    return [serialize_calibration(db, row) for row in rows]


def record_calibration(
    db: Session,
    user: User,
    equipment_id: int,
    data: CalibrationCreate,
) -> Calibration:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.CALIBRATION_WRITE, lab_id=eq.lab_id)

    clean_vendor = data.vendor.strip()
    if not clean_vendor:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Wymagane podanie firmy wzorcującej",
            details=[{"field": "vendor", "message": "Pole vendor jest wymagane"}],
        )

    cal_date = parse_month_str(data.calibrated_month, field_name="calibrated_month")
    parsed_points: list[CalibrationPoint] = []
    for item in data.points:
        clean_point = item.point.strip()
        clean_unit = item.unit.strip()
        if not clean_point or not clean_unit:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "Punkt wzorcowania oraz jednostka są wymagane",
            )
        try:
            err_dec = parse_decimal(item.error)
            unc_dec = parse_decimal(item.uncertainty)
        except ValueError as exc:
            raise AppError(
                422,
                "INVALID_NUMBER",
                "Nieprawidłowy format liczby pomiarowej w punktach wzorcowania",
            ) from exc
        parsed_points.append(
            CalibrationPoint(
                point=clean_point,
                error=err_dec,
                uncertainty=unc_dec,
                unit=clean_unit,
            )
        )

    due_date = (
        next_due_month(cal_date, eq.calibration_interval_months)
        if eq.calibration_required and eq.calibration_interval_months is not None
        else None
    )

    cal = Calibration(
        equipment_id=eq.id,
        calibrated_month=cal_date,
        vendor=clean_vendor,
        certificate_no=data.certificate_no.strip() if data.certificate_no else None,
        adjustments=data.adjustments,
        result=data.result,
        next_due_month=due_date,
        note=data.note,
        source="MANUAL",
        ocr_meta=None,
        created_by=user.id,
        points=parsed_points,
    )
    db.add(cal)
    db.flush()

    if data.attachment_ids:
        attach(
            db,
            user,
            data.attachment_ids,
            owner_type="calibration",
            owner_id=cal.id,
            lab_id=eq.lab_id,
        )

    if (
        data.result == "NOK"
        and bool(get_setting(db, "withdraw_on_calibration_nok"))
        and eq.withdrawn_at is None
    ):
        cert_suffix = f" ({cal.certificate_no})" if cal.certificate_no else ""
        eq.withdrawn_at = datetime.now(UTC)
        eq.withdrawn_reason = f"Negatywny wynik wzorcowania{cert_suffix}"
        db.flush()

    db.refresh(cal)
    return cal


def _validate_check_lead(db: Session, lead_months: int) -> None:
    bounds = get_setting(db, "check_lead_months_range")
    lo, hi = int(bounds[0]), int(bounds[1])
    if lead_months < lo or lead_months > hi:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Wyprzedzenie planu sprawdzeń musi mieścić się w zakresie {lo}-{hi} miesięcy",
            details=[{"field": "lead_months", "message": f"Dozwolony zakres: {lo}..{hi}"}],
        )


def last_check_record(db: Session, check_plan_id: int) -> CheckRecord | None:
    stmt = (
        select(CheckRecord)
        .where(CheckRecord.check_plan_id == check_plan_id)
        .order_by(CheckRecord.performed_on.desc(), CheckRecord.id.desc())
        .limit(1)
    )
    return db.scalars(stmt).first()


def check_plan_status_and_due(
    db: Session,
    plan: CheckPlan,
    *,
    eq: Equipment,
    today: date,
) -> tuple[Status, date | None, CheckRecord | None]:
    last_rec = last_check_record(db, plan.id)
    if eq.withdrawn_at is not None:
        return Status.WITHDRAWN, None, last_rec
    if not plan.active:
        return Status.NOT_REQUIRED, None, last_rec
    if last_rec is None:
        return Status.NO_DATA, None, None
    due = next_due_month(last_rec.performed_on, plan.interval_months)
    alert_from, valid_until = month_window(due, plan.lead_months)
    return due_status(alert_from, valid_until, today), due, last_rec


def serialize_check_plan(
    db: Session,
    plan: CheckPlan,
    *,
    eq: Equipment | None = None,
    today: date,
) -> CheckPlanSummaryOut:
    owner_eq = eq if eq is not None else plan.equipment
    st, due, last_rec = check_plan_status_and_due(db, plan, eq=owner_eq, today=today)
    return CheckPlanSummaryOut(
        id=plan.id,
        equipment_id=plan.equipment_id,
        name=plan.name,
        interval_months=plan.interval_months,
        lead_months=plan.lead_months,
        form_template_id=plan.form_template_id,
        fields=list(plan.form_template.fields),
        active=plan.active,
        status=st,
        last_performed_on=last_rec.performed_on.isoformat() if last_rec is not None else None,
        next_due_month=format_month_date(due),
    )


def list_check_plans(
    db: Session,
    user: User,
    equipment_id: int,
    *,
    today: date,
) -> list[CheckPlanSummaryOut]:
    eq = get_equipment_for_user(db, user, equipment_id)
    rows = db.scalars(
        select(CheckPlan).where(CheckPlan.equipment_id == eq.id).order_by(CheckPlan.id)
    ).all()
    return [serialize_check_plan(db, row, eq=eq, today=today) for row in rows]


def create_check_plan(
    db: Session,
    user: User,
    equipment_id: int,
    data: CheckPlanCreate,
) -> CheckPlan:
    eq = get_equipment_or_404(db, equipment_id)
    require(user, Permission.EQUIPMENT_WRITE, lab_id=eq.lab_id)

    clean_name = data.name.strip()
    if not clean_name:
        raise AppError(422, "VALIDATION_ERROR", "Nazwa planu sprawdzeń jest wymagana")
    if data.interval_months < 1:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Interwał planu sprawdzeń musi być dodatni",
            details=[{"field": "interval_months", "message": "Wymagana liczba >= 1"}],
        )
    lead = (
        data.lead_months
        if data.lead_months is not None
        else int(get_setting(db, "default_check_lead_months"))
    )
    _validate_check_lead(db, lead)

    tpl = db.get(FormTemplate, data.form_template_id)
    if tpl is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono szablonu formularza")

    plan = CheckPlan(
        equipment_id=eq.id,
        name=clean_name,
        interval_months=data.interval_months,
        lead_months=lead,
        form_template_id=tpl.id,
        active=data.active,
    )
    db.add(plan)
    db.flush()
    db.refresh(plan)
    return plan


def update_check_plan(
    db: Session,
    user: User,
    check_plan_id: int,
    data: CheckPlanUpdate,
) -> CheckPlan:
    plan = db.get(CheckPlan, check_plan_id)
    if plan is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono planu sprawdzeń")
    require(user, Permission.EQUIPMENT_WRITE, lab_id=plan.equipment.lab_id)

    fields_set = data.model_fields_set
    if "name" in fields_set and data.name is not None:
        clean_name = data.name.strip()
        if not clean_name:
            raise AppError(422, "VALIDATION_ERROR", "Nazwa planu sprawdzeń nie może być pusta")
        plan.name = clean_name
    if "interval_months" in fields_set and data.interval_months is not None:
        if data.interval_months < 1:
            raise AppError(422, "VALIDATION_ERROR", "Interwał planu sprawdzeń musi być dodatni")
        plan.interval_months = data.interval_months
    if "lead_months" in fields_set and data.lead_months is not None:
        _validate_check_lead(db, data.lead_months)
        plan.lead_months = data.lead_months
    if "form_template_id" in fields_set and data.form_template_id is not None:
        if db.get(FormTemplate, data.form_template_id) is None:
            raise AppError(404, "NOT_FOUND", "Nie znaleziono szablonu formularza")
        plan.form_template_id = data.form_template_id
    if "active" in fields_set and data.active is not None:
        plan.active = data.active

    db.flush()
    db.refresh(plan)
    return plan


def serialize_check_record(db: Session, rec: CheckRecord) -> CheckRecordOut:
    att_ids = list_attachment_ids(db, owner_type="check_record", owner_id=rec.id)
    return CheckRecordOut(
        id=rec.id,
        check_plan_id=rec.check_plan_id,
        performed_on=rec.performed_on.isoformat(),
        values=rec.values,
        out_of_range=rec.out_of_range,
        note=rec.note,
        performed_by=rec.performed_by,
        created_at=rec.created_at.isoformat(),
        attachment_ids=att_ids,
    )


def list_check_records(db: Session, user: User, check_plan_id: int) -> list[CheckRecordOut]:
    plan = db.get(CheckPlan, check_plan_id)
    if plan is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono planu sprawdzeń")
    require(user, Permission.EQUIPMENT_READ, lab_id=plan.equipment.lab_id)
    rows = db.scalars(
        select(CheckRecord)
        .where(CheckRecord.check_plan_id == plan.id)
        .order_by(CheckRecord.performed_on.desc(), CheckRecord.id.desc())
    ).all()
    return [serialize_check_record(db, row) for row in rows]


def _maybe_notify_check_out_of_range(
    db: Session,
    *,
    eq: Equipment,
    plan: CheckPlan,
    record_id: int,
) -> None:
    if (
        importlib.util.find_spec("app.notifications") is None
        or importlib.util.find_spec("app.notifications.service") is None
    ):
        return
    notif_mod = importlib.import_module("app.notifications.service")
    models_mod = importlib.import_module("app.notifications.models")
    kind = models_mod.NotificationKind("CHECK_OUT_OF_RANGE")
    code = format_code(eq.number, eq.lab.code)
    notif_mod.notify_now(
        db,
        kind=kind,
        lab_id=eq.lab_id,
        ref_type="check_record",
        ref_id=record_id,
        title=f"Sprawdzenie poza zakresem: {code} {eq.name} ({plan.name})",
    )


def record_check(
    db: Session,
    user: User,
    check_plan_id: int,
    data: CheckRecordCreate,
) -> CheckRecord:
    plan = db.get(CheckPlan, check_plan_id)
    if plan is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono planu sprawdzeń")
    eq = plan.equipment

    require(user, Permission.CHECK_WRITE, equipment=eq)
    if eq.withdrawn_at is not None:
        raise AppError(409, "EQUIPMENT_WITHDRAWN", "Urządzenie wycofane - wpisy zablokowane")

    specs = [FieldSpec.model_validate(f) for f in plan.form_template.fields]
    validation = validate_form_values(specs, data.values)
    if any(msg == "INVALID_NUMBER" for msg in validation.errors.values()):
        raise AppError(
            422,
            "INVALID_NUMBER",
            "Nieprawidłowy format liczby pomiarowej w formularzu sprawdzenia",
        )
    if validation.errors:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Błędy walidacji formularza sprawdzenia",
            details=[{"field": k, "message": v} for k, v in validation.errors.items()],
        )

    is_out = bool(validation.out_of_range)
    rec = CheckRecord(
        check_plan_id=plan.id,
        performed_on=data.performed_on,
        values=validation.values,
        out_of_range=is_out,
        note=data.note,
        performed_by=user.id,
    )
    db.add(rec)
    db.flush()

    if data.attachment_ids:
        attach(
            db,
            user,
            data.attachment_ids,
            owner_type="check_record",
            owner_id=rec.id,
            lab_id=eq.lab_id,
        )

    if is_out:
        _maybe_notify_check_out_of_range(db, eq=eq, plan=plan, record_id=rec.id)

    db.refresh(rec)
    return rec
