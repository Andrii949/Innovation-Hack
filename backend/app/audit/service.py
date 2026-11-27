from datetime import UTC, date, datetime, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.listener import _serialize_value
from app.audit.models import AuditLog


def log_event(
    db: Session,
    *,
    action: str,
    entity: str,
    entity_id: str | None,
    after: dict[str, Any] | None,
    user_id: int | None,
    reason: str | None = None,
    at: datetime | None = None,
) -> AuditLog:
    serialized_after = (
        {str(k): _serialize_value(str(k), v) for k, v in after.items()}
        if after is not None
        else None
    )
    entry = AuditLog(
        at=at or datetime.now(UTC),
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=None,
        after=serialized_after,
        reason=reason,
    )
    db.add(entry)
    db.flush()
    return entry


def list_audit_logs(
    db: Session,
    *,
    entity: str | None = None,
    entity_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[AuditLog]:
    stmt = select(AuditLog)
    if entity is not None:
        stmt = stmt.where(AuditLog.entity == entity)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if date_from is not None:
        stmt = stmt.where(AuditLog.at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to is not None:
        stmt = stmt.where(AuditLog.at <= datetime.combine(date_to, time.max, tzinfo=UTC))
    stmt = stmt.order_by(AuditLog.at.desc(), AuditLog.id.desc())
    return list(db.scalars(stmt).all())
