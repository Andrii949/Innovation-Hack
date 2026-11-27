from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.audit.service import list_audit_logs
from app.db import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: str
    user_id: int | None
    action: str
    entity: str
    entity_id: str | None
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    reason: str | None


@router.get("")
def get_audit(
    db: Annotated[Session, Depends(get_db)],
    entity: str | None = None,
    entity_id: str | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> list[AuditLogOut]:
    rows = list_audit_logs(
        db,
        entity=entity,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
    )
    return [
        AuditLogOut(
            id=row.id,
            at=row.at.isoformat(),
            user_id=row.user_id,
            action=row.action,
            entity=row.entity,
            entity_id=row.entity_id,
            before=row.before,
            after=row.after,
            reason=row.reason,
        )
        for row in rows
    ]
