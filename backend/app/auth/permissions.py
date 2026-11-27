from enum import StrEnum
from typing import Protocol

from app.auth.models import User
from app.errors import AppError


class Permission(StrEnum):
    EQUIPMENT_READ = "equipment:read"
    EQUIPMENT_WRITE = "equipment:write"
    CALIBRATION_WRITE = "calibration:write"
    CALIBRATION_APPROVE = "calibration:approve"
    CHECK_WRITE = "check:write"
    SCHEDULE_READ = "schedule:read"
    REAGENT_READ = "reagent:read"
    REAGENT_WRITE = "reagent:write"
    STOCK_WRITE = "stock:write"
    RESULT_READ = "result:read"
    RESULT_WRITE = "result:write"
    RESULT_REVIEW = "result:review"
    REPORT_READ = "report:read"
    REPORT_WRITE = "report:write"
    AUDIT_READ = "audit:read"
    SETTINGS_WRITE = "settings:write"
    USERS_WRITE = "users:write"


DEFAULT_ROLES: dict[str, frozenset[Permission]] = {
    "admin": frozenset(Permission) - {Permission.CALIBRATION_APPROVE},
    "manager": frozenset(
        {
            Permission.EQUIPMENT_READ,
            Permission.SCHEDULE_READ,
            Permission.REAGENT_READ,
            Permission.RESULT_READ,
            Permission.REPORT_READ,
            Permission.CALIBRATION_APPROVE,
            Permission.RESULT_REVIEW,
            Permission.AUDIT_READ,
        }
    ),
    "worker": frozenset(
        {
            Permission.EQUIPMENT_READ,
            Permission.SCHEDULE_READ,
            Permission.REAGENT_READ,
            Permission.RESULT_READ,
            Permission.CHECK_WRITE,
            Permission.STOCK_WRITE,
            Permission.RESULT_WRITE,
        }
    ),
}


class EquipmentScopeTarget(Protocol):
    @property
    def lab_id(self) -> int: ...

    @property
    def authorized_user_ids(self) -> set[int]: ...


def has_permission(user: User, permission: Permission) -> bool:
    return permission.value in user.role.permissions


def visible_lab_ids(user: User) -> set[int] | None:
    if user.all_labs:
        return None
    return {lab.id for lab in user.labs}


def require(
    user: User,
    permission: Permission,
    *,
    lab_id: int | None = None,
    equipment: EquipmentScopeTarget | None = None,
) -> None:
    if not has_permission(user, permission):
        raise AppError(403, "FORBIDDEN", "Brak uprawnień do wykonania tej operacji")

    target_lab_id = equipment.lab_id if equipment is not None else lab_id
    if target_lab_id is not None:
        allowed_labs = visible_lab_ids(user)
        if allowed_labs is not None and target_lab_id not in allowed_labs:
            raise AppError(
                403,
                "LAB_OUT_OF_SCOPE",
                "Pracownia spoza zakresu uprawnień użytkownika",
            )

    if (
        equipment is not None
        and permission is Permission.CHECK_WRITE
        and not has_permission(user, Permission.EQUIPMENT_WRITE)
        and user.id not in equipment.authorized_user_ids
    ):
        raise AppError(
            403,
            "NOT_AUTHORIZED_FOR_EQUIPMENT",
            "Brak uprawnień do wpisu dla tego urządzenia",
        )
