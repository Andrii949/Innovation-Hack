from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.settings.models import Setting

DEFAULT_SETTINGS: dict[str, Any] = {
    "equipment_lead_months_range": [1, 12],
    "check_lead_months_range": [0, 12],
    "default_equipment_lead_months": 1,
    "default_check_lead_months": 0,
    "default_expiry_lead_months": 1,
    "default_stock_count_interval_days": 30,
    "out_of_range_action": "FLAG",
    "withdraw_on_calibration_nok": True,
    "session_ttl_hours": 12,
    "max_upload_mb": 10,
    "worker_interval_minutes": 60,
    "login_max_attempts": 5,
    "login_window_minutes": 15,
}

_POSITIVE_INT_KEYS = {
    "default_equipment_lead_months",
    "default_expiry_lead_months",
    "default_stock_count_interval_days",
    "session_ttl_hours",
    "max_upload_mb",
    "worker_interval_minutes",
    "login_max_attempts",
    "login_window_minutes",
}
_NON_NEGATIVE_INT_KEYS = {"default_check_lead_months"}
_RANGE_KEYS = {"equipment_lead_months_range", "check_lead_months_range"}


def _is_strict_int(val: Any) -> bool:
    return isinstance(val, int) and not isinstance(val, bool)


def _validate_setting(key: str, value: Any) -> list[str]:
    if key not in DEFAULT_SETTINGS:
        return [f"Nieznany klucz ustawienia: {key}"]
    if key in _RANGE_KEYS:
        if (
            not isinstance(value, list)
            or len(value) != 2
            or not _is_strict_int(value[0])
            or not _is_strict_int(value[1])
            or value[0] < 0
            or value[0] > value[1]
        ):
            return [f"Pole {key} musi być parą [min, max] liczb całkowitych (0 <= min <= max)"]
        return []
    if key in _POSITIVE_INT_KEYS:
        if not _is_strict_int(value) or value < 1:
            return [f"Pole {key} musi być dodatnią liczbą całkowitą"]
        return []
    if key in _NON_NEGATIVE_INT_KEYS:
        if not _is_strict_int(value) or value < 0:
            return [f"Pole {key} musi być nieujemną liczbą całkowitą"]
        return []
    if key == "out_of_range_action":
        if value not in ("FLAG", "BLOCK"):
            return ["Pole out_of_range_action musi mieć wartość FLAG lub BLOCK"]
        return []
    if key == "withdraw_on_calibration_nok" and not isinstance(value, bool):
        return ["Pole withdraw_on_calibration_nok musi być wartością logiczną"]
    return []


def get_setting(db: Session, key: str) -> Any:
    if key not in DEFAULT_SETTINGS:
        raise KeyError(key)
    row = db.get(Setting, key)
    if row is not None:
        return deepcopy(row.value)
    return deepcopy(DEFAULT_SETTINGS[key])


def get_all_settings(db: Session) -> dict[str, Any]:
    merged = deepcopy(DEFAULT_SETTINGS)
    for row in db.scalars(select(Setting)).all():
        if row.key in merged:
            merged[row.key] = deepcopy(row.value)
    return merged


def update_settings(db: Session, values: dict[str, Any]) -> dict[str, Any]:
    details: list[dict[str, Any]] = []
    for key, val in values.items():
        for msg in _validate_setting(key, val):
            details.append({"field": key, "message": msg})
    if details:
        raise AppError(422, "VALIDATION_ERROR", "Nieprawidłowe wartości ustawień", details=details)

    for key, val in values.items():
        existing = db.get(Setting, key)
        if existing is None:
            db.add(Setting(key=key, value=deepcopy(val)))
        else:
            existing.value = deepcopy(val)
    db.flush()
    return get_all_settings(db)
