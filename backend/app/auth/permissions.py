from enum import StrEnum


class Permission(StrEnum):
    EQUIPMENT_READ = "equipment:read"
    EQUIPMENT_WRITE = "equipment:write"
    CALIBRATION_WRITE = "calibration:write"
    CHECK_WRITE = "check:write"
    SCHEDULE_READ = "schedule:read"
    REAGENT_READ = "reagent:read"
    REAGENT_WRITE = "reagent:write"
    STOCK_WRITE = "stock:write"
    RESULT_READ = "result:read"
    RESULT_WRITE = "result:write"
    REPORT_READ = "report:read"
    REPORT_WRITE = "report:write"
    AUDIT_READ = "audit:read"
    SETTINGS_WRITE = "settings:write"
    USERS_WRITE = "users:write"


DEFAULT_ROLES: dict[str, frozenset[Permission]] = {
    "admin": frozenset(Permission),
    "manager": frozenset(
        {
            Permission.EQUIPMENT_READ,
            Permission.SCHEDULE_READ,
            Permission.REAGENT_READ,
            Permission.RESULT_READ,
            Permission.REPORT_READ,
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
