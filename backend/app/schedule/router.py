from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.core.clock import get_today
from app.db import get_db
from app.schedule.service import DueItem, DueKind, list_due_items

router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.get("")
def get_schedule(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
    lab_id: int | None = None,
    kind: Annotated[list[DueKind] | None, Query()] = None,
    horizon_months: Annotated[int | None, Query(ge=1)] = None,
    include_ok: bool = False,
) -> list[DueItem]:
    require(user, Permission.SCHEDULE_READ, lab_id=lab_id)
    effective_labs = {lab_id} if lab_id is not None else visible_lab_ids(user)
    effective_kinds = set(kind) if kind else None
    return list_due_items(
        db,
        today=today,
        lab_ids=effective_labs,
        kinds=effective_kinds,
        horizon_months=horizon_months,
        include_ok=include_ok,
    )
