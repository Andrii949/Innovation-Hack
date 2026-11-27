"""Test parameters and results with range control (F9, docs/02-architektura.md §8.4)."""

import csv
import io
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.audit.service import log_event
from app.auth.models import User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.config import get_settings
from app.core.ranges import RangeResult, check_range, parse_decimal
from app.equipment.models import Equipment
from app.equipment.service import can_user_write_results, format_code, get_equipment_or_404
from app.errors import AppError
from app.notifications.models import NotificationKind
from app.notifications.service import notify_now
from app.results.models import TestParameter, TestResult
from app.results.schemas import (
    Series,
    SeriesParameter,
    SeriesPoint,
    TestParameterCreate,
    TestParameterOut,
    TestParameterUpdate,
    TestResultCreate,
    TestResultOut,
)
from app.settings.service import get_setting

CSV_COLUMNS = ("material", "name", "unit", "min_value", "max_value", "method", "accredited")
_TRUE = {"true", "1", "tak", "a"}
_FALSE = {"false", "0", "nie", "na", ""}


def format_decimal(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")


def _polish_number(value: Decimal) -> str:
    return format(value, "f").replace(".", ",")


def _optional_decimal(text: str | None, field: str) -> Decimal | None:
    if text is None or not text.strip():
        return None
    try:
        return parse_decimal(text)
    except ValueError as exc:
        raise AppError(
            422, "INVALID_NUMBER", f"Nie można odczytać liczby w polu {field}: {text!r}"
        ) from exc


def _check_bounds(min_value: Decimal | None, max_value: Decimal | None) -> None:
    if min_value is not None and max_value is not None and min_value > max_value:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Dolna granica zakresu jest większa od górnej",
            details=[{"field": "min_value", "message": "min_value > max_value"}],
        )


def range_text(min_value: Decimal | None, max_value: Decimal | None, unit: str) -> str:
    if min_value is not None and max_value is not None:
        return f"od {_polish_number(min_value)} do {_polish_number(max_value)} {unit}"
    if min_value is not None:
        return f"od {_polish_number(min_value)} {unit}"
    if max_value is not None:
        return f"do {_polish_number(max_value)} {unit}"
    return "bez zakresu"


def serialize_parameter(param: TestParameter) -> TestParameterOut:
    action = param.out_of_range_action
    return TestParameterOut(
        id=param.id,
        material=param.material,
        name=param.name,
        unit=param.unit,
        min_value=format_decimal(param.min_value),
        max_value=format_decimal(param.max_value),
        method=param.method,
        accredited=param.accredited,
        out_of_range_action="BLOCK" if action == "BLOCK" else "FLAG" if action == "FLAG" else None,
        verify_min=format_decimal(param.verify_min),
        verify_max=format_decimal(param.verify_max),
        active=param.active,
    )


def serialize_result(result: TestResult) -> TestResultOut:
    return TestResultOut(
        id=result.id,
        parameter_id=result.parameter_id,
        parameter_name=result.parameter.name,
        unit=result.parameter.unit,
        sample_label=result.sample_label,
        value=format(result.value, "f"),
        min_snapshot=format_decimal(result.min_snapshot),
        max_snapshot=format_decimal(result.max_snapshot),
        in_range=result.in_range,
        repeat_of_id=result.repeat_of_id,
        equipment_id=result.equipment_id,
        equipment_code=(
            format_code(result.equipment.number, result.equipment.lab.code)
            if result.equipment is not None
            else None
        ),
        review_decision=result.review_decision,
        review_calibration_id=result.review_calibration_id,
        review_note=result.review_note,
        reviewed_by=result.reviewed_by,
        reviewed_at=result.reviewed_at,
        created_by=result.created_by,
        created_at=result.created_at.isoformat(),
    )


def get_parameter_or_404(db: Session, parameter_id: int) -> TestParameter:
    param = db.get(TestParameter, parameter_id)
    if param is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono parametru badania")
    return param


def _find_parameter(db: Session, material: str, name: str, unit: str) -> TestParameter | None:
    return db.scalars(
        select(TestParameter).where(
            TestParameter.material == material,
            TestParameter.name == name,
            TestParameter.unit == unit,
        )
    ).first()


def list_parameters(db: Session, user: User) -> list[TestParameter]:
    require(user, Permission.RESULT_READ)
    stmt = select(TestParameter).order_by(
        TestParameter.material, TestParameter.name, TestParameter.unit
    )
    return list(db.scalars(stmt).all())


def create_parameter(db: Session, user: User, data: TestParameterCreate) -> TestParameter:
    require(user, Permission.SETTINGS_WRITE)
    min_value = _optional_decimal(data.min_value, "min_value")
    max_value = _optional_decimal(data.max_value, "max_value")
    _check_bounds(min_value, max_value)
    verify_min = _optional_decimal(data.verify_min, "verify_min")
    verify_max = _optional_decimal(data.verify_max, "verify_max")
    _check_bounds(verify_min, verify_max)
    if _find_parameter(db, data.material, data.name, data.unit) is not None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Parametr o tej nazwie i jednostce już istnieje",
            details=[{"field": "name", "message": "duplicate"}],
        )
    param = TestParameter(
        material=data.material,
        name=data.name,
        unit=data.unit,
        min_value=min_value,
        max_value=max_value,
        method=data.method,
        accredited=data.accredited,
        out_of_range_action=data.out_of_range_action,
        verify_min=verify_min,
        verify_max=verify_max,
        active=data.active,
    )
    db.add(param)
    db.flush()
    return param


def update_parameter(
    db: Session, user: User, parameter_id: int, data: TestParameterUpdate
) -> TestParameter:
    require(user, Permission.SETTINGS_WRITE)
    param = get_parameter_or_404(db, parameter_id)
    sent = data.model_fields_set
    for field in ("material", "name", "unit", "accredited", "active"):
        value = getattr(data, field)
        if field in sent and value is not None:
            setattr(param, field, value)
    for field in ("method", "out_of_range_action"):
        if field in sent:
            setattr(param, field, getattr(data, field))
    for field in ("min_value", "max_value", "verify_min", "verify_max"):
        if field in sent:
            setattr(param, field, _optional_decimal(getattr(data, field), field))
    _check_bounds(param.min_value, param.max_value)
    _check_bounds(param.verify_min, param.verify_max)
    db.flush()
    return param


def _parse_bool(text: str, row: int) -> bool:
    normalized = text.strip().lower()
    if normalized in _TRUE:
        return True
    if normalized in _FALSE:
        return False
    raise AppError(
        422, "VALIDATION_ERROR", f"Wiersz {row}: pole accredited musi być true albo false"
    )


def import_parameters_csv(db: Session, text: str) -> int:
    """Insert or update parameters from CSV with the columns in CSV_COLUMNS; returns row count."""
    reader = csv.DictReader(io.StringIO(text))
    missing = [col for col in CSV_COLUMNS if col not in (reader.fieldnames or [])]
    if missing:
        raise AppError(422, "VALIDATION_ERROR", f"Brak kolumn w pliku CSV: {', '.join(missing)}")

    count = 0
    for row_no, row in enumerate(reader, start=2):
        material = (row["material"] or "").strip() or "Cement"
        name = (row["name"] or "").strip()
        unit = (row["unit"] or "").strip()
        if not name or not unit:
            raise AppError(422, "VALIDATION_ERROR", f"Wiersz {row_no}: brak nazwy lub jednostki")
        try:
            min_value = _optional_decimal(row["min_value"], "min_value")
            max_value = _optional_decimal(row["max_value"], "max_value")
        except AppError as exc:
            raise AppError(422, "INVALID_NUMBER", f"Wiersz {row_no}: {exc.message}") from exc
        _check_bounds(min_value, max_value)

        param = _find_parameter(db, material, name, unit)
        if param is None:
            param = TestParameter(material=material, name=name, unit=unit, active=True)
            db.add(param)
        param.min_value = min_value
        param.max_value = max_value
        param.method = (row["method"] or "").strip() or None
        param.accredited = _parse_bool(row["accredited"] or "", row_no)
        count += 1
    db.flush()
    return count


def record_result(db: Session, user: User, data: TestResultCreate) -> TestResult:
    require(user, Permission.RESULT_WRITE)
    param = get_parameter_or_404(db, data.parameter_id)
    if not param.active:
        raise AppError(422, "VALIDATION_ERROR", "Parametr jest nieaktywny")
    value = _optional_decimal(data.value, "value")
    if value is None:
        raise AppError(422, "INVALID_NUMBER", "Podaj wartość wyniku")

    equipment_id = data.equipment_id
    if data.repeat_of_id is not None:
        previous = db.get(TestResult, data.repeat_of_id)
        if previous is None or previous.parameter_id != param.id:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                "Powtórzenie musi wskazywać wynik tego samego parametru",
                details=[{"field": "repeat_of_id", "message": "invalid"}],
            )

        if previous.equipment is not None:
            require(user, Permission.RESULT_WRITE, lab_id=previous.equipment.lab_id)
            if equipment_id is None:
                equipment_id = previous.equipment_id
    if equipment_id is not None:
        equipment = get_equipment_or_404(db, equipment_id)
        require(user, Permission.RESULT_WRITE, lab_id=equipment.lab_id)
        if equipment.withdrawn_at is not None:
            raise AppError(409, "VALIDATION_ERROR", "Urządzenie jest wycofane")
        if not can_user_write_results(user, equipment):
            raise AppError(
                403, "NOT_AUTHORIZED_FOR_EQUIPMENT", "Brak uprawnień do wpisu dla tego urządzenia"
            )

    in_range = check_range(value, param.min_value, param.max_value) is RangeResult.IN_RANGE
    action = param.out_of_range_action or get_setting(db, "out_of_range_action")
    if not in_range and action == "BLOCK":
        log_event(
            db,
            action="reject",
            entity="test_result",
            entity_id=None,
            after={
                "parameter_id": param.id,
                "sample_label": data.sample_label,
                "value": data.value,
                "min_value": param.min_value,
                "max_value": param.max_value,
            },
            user_id=user.id,
            reason="Wynik poza zakresem (BLOCK)",
        )
        db.commit()
        raise AppError(
            422,
            "OUT_OF_RANGE",
            f"Wynik {_polish_number(value)} {param.unit} poza zakresem "
            f"{range_text(param.min_value, param.max_value, param.unit)}",
        )

    result = TestResult(
        parameter_id=param.id,
        sample_label=data.sample_label,
        value=value,
        min_snapshot=param.min_value,
        max_snapshot=param.max_value,
        in_range=in_range,
        repeat_of_id=data.repeat_of_id,
        equipment_id=equipment_id,
        created_by=user.id,
    )
    db.add(result)
    db.flush()
    db.refresh(result)
    if not in_range:
        notify_now(
            db,
            kind=NotificationKind.RESULT_OUT_OF_RANGE,
            lab_id=result.equipment.lab_id if result.equipment is not None else None,
            ref_type="test_result",
            ref_id=result.id,
            title=(
                f"Wynik poza zakresem: {param.name} = {_polish_number(value)} {param.unit} "
                f"({data.sample_label})"
            ),
        )
    return result


def _result_scope(user: User):
    allowed = visible_lab_ids(user)
    if allowed is None:
        return TestResult.id.is_not(None)
    return or_(
        TestResult.equipment_id.is_(None),
        TestResult.equipment_id.in_(select(Equipment.id).where(Equipment.lab_id.in_(allowed))),
    )


def list_results(
    db: Session, user: User, *, parameter_id: int | None = None, equipment_id: int | None = None
) -> list[TestResult]:
    require(user, Permission.RESULT_READ)
    stmt = (
        select(TestResult)
        .where(_result_scope(user))
        .order_by(TestResult.created_at.desc(), TestResult.id.desc())
    )
    if parameter_id is not None:
        stmt = stmt.where(TestResult.parameter_id == parameter_id)
    if equipment_id is not None:
        stmt = stmt.where(TestResult.equipment_id == equipment_id)
    return list(db.scalars(stmt).all())


def _local_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=ZoneInfo(get_settings().timezone))


def result_series(
    db: Session, *, parameter_id: int, date_from: date, date_to: date, user: User | None = None
) -> Series:
    """Results of one parameter entered between the two days (inclusive, lab time zone)."""
    if date_from > date_to:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Data początkowa jest późniejsza niż końcowa",
            details=[{"field": "from", "message": "from > to"}],
        )
    param = get_parameter_or_404(db, parameter_id)
    threshold_min = param.verify_min if param.verify_min is not None else param.min_value
    threshold_max = param.verify_max if param.verify_max is not None else param.max_value

    stmt = (
        select(TestResult)
        .where(
            TestResult.parameter_id == param.id,
            TestResult.created_at >= _local_midnight(date_from),
            TestResult.created_at < _local_midnight(date_to + timedelta(days=1)),
        )
        .order_by(TestResult.created_at, TestResult.id)
    )
    if user is not None:
        stmt = stmt.where(_result_scope(user))
    rows = db.scalars(stmt).all()
    points = [
        SeriesPoint(
            at=row.created_at,
            sample_label=row.sample_label,
            value=format(row.value, "f"),
            status=check_range(row.value, threshold_min, threshold_max),
        )
        for row in rows
    ]
    return Series(
        parameter=SeriesParameter(name=param.name, unit=param.unit),
        threshold_min=format_decimal(threshold_min),
        threshold_max=format_decimal(threshold_max),
        points=points,
        count=len(points),
        out_of_threshold=sum(p.status is not RangeResult.IN_RANGE for p in points),
    )
