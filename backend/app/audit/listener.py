from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import Table, event, insert, inspect
from sqlalchemy.orm import Mapper, Session

from app.audit.context import get_audit_reason, get_audit_user
from app.audit.models import AuditLog

EXCLUDED_TABLES: frozenset[str] = frozenset({"audit_log", "user_session", "notification"})
REDACTED_COLUMNS: frozenset[str] = frozenset({"password_hash"})


def _serialize_value(key: str, val: Any) -> Any:
    if key in REDACTED_COLUMNS and val is not None:
        return "***"
    if isinstance(val, Decimal):
        return format(val, "f")
    if isinstance(val, datetime | date):
        return val.isoformat()
    if isinstance(val, Enum):
        return _serialize_value(key, val.value)
    if isinstance(val, dict):
        return {str(k): _serialize_value(str(k), v) for k, v in val.items()}
    if isinstance(val, list | tuple):
        return [_serialize_value(key, item) for item in val]
    return val


def _entity_id_for(obj: Any) -> str | None:
    state = inspect(obj)
    if state is None:
        return None
    if state.identity is not None:
        return ":".join(str(part) for part in state.identity)
    pk_vals: list[str] = []
    for col in state.mapper.primary_key:
        attr_key = state.mapper.get_property_by_column(col).key
        val = getattr(obj, attr_key, None)
        if val is None:
            return None
        pk_vals.append(str(val))
    return ":".join(pk_vals) if pk_vals else None


def _table_name_for(mapper: Mapper[Any]) -> str:
    table = mapper.local_table
    if isinstance(table, Table):
        return table.name
    return str(table.description or "")


def _after_flush(session: Session, _flush_context: Any) -> None:
    user_id = get_audit_user()
    reason = get_audit_reason()
    now = datetime.now(UTC)
    pending_rows: list[dict[str, Any]] = []

    for obj in session.new:
        state = inspect(obj)
        if state is None:
            continue
        table_name = _table_name_for(state.mapper)
        if table_name in EXCLUDED_TABLES:
            continue
        after = {
            attr.key: _serialize_value(attr.key, getattr(obj, attr.key))
            for attr in state.mapper.column_attrs
        }
        pending_rows.append(
            {
                "at": now,
                "user_id": user_id,
                "action": "create",
                "entity": table_name,
                "entity_id": _entity_id_for(obj),
                "before": None,
                "after": after,
                "reason": reason,
            }
        )

    for obj in session.dirty:
        if not session.is_modified(obj, include_collections=False):
            continue
        state = inspect(obj)
        if state is None:
            continue
        table_name = _table_name_for(state.mapper)
        if table_name in EXCLUDED_TABLES:
            continue
        before: dict[str, Any] = {}
        after = {}
        for attr in state.mapper.column_attrs:
            hist = state.attrs[attr.key].history
            if not hist.has_changes():
                continue
            old_raw = hist.deleted[0] if hist.deleted else None
            new_raw = hist.added[0] if hist.added else getattr(obj, attr.key)
            old_val = _serialize_value(attr.key, old_raw)
            new_val = _serialize_value(attr.key, new_raw)
            if old_val != new_val:
                before[attr.key] = old_val
                after[attr.key] = new_val
        if after:
            pending_rows.append(
                {
                    "at": now,
                    "user_id": user_id,
                    "action": "update",
                    "entity": table_name,
                    "entity_id": _entity_id_for(obj),
                    "before": before,
                    "after": after,
                    "reason": reason,
                }
            )

    for obj in session.deleted:
        state = inspect(obj)
        if state is None:
            continue
        table_name = _table_name_for(state.mapper)
        if table_name in EXCLUDED_TABLES:
            continue
        before = {}
        for attr in state.mapper.column_attrs:
            hist = state.attrs[attr.key].history
            old_raw = hist.deleted[0] if hist.deleted else getattr(obj, attr.key)
            before[attr.key] = _serialize_value(attr.key, old_raw)
        pending_rows.append(
            {
                "at": now,
                "user_id": user_id,
                "action": "delete",
                "entity": table_name,
                "entity_id": _entity_id_for(obj),
                "before": before,
                "after": None,
                "reason": reason,
            }
        )

    if pending_rows:
        session.connection().execute(insert(AuditLog), pending_rows)


def register_audit_listener(session_factory: Any = Session) -> None:
    target = session_factory if isinstance(session_factory, type) else Session
    if not event.contains(target, "after_flush", _after_flush):
        event.listen(target, "after_flush", _after_flush)
