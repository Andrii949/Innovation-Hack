from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.db import get_db
from app.notifications.service import (
    NotificationToast,
    RuleSpec,
    list_notifications,
    list_rules,
    mark_all_read,
    mark_read,
    poll_notifications,
    register_device,
    update_rules,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])
rules_router = APIRouter(prefix="/notification-rules", tags=["notifications"])
devices_router = APIRouter(prefix="/devices", tags=["notifications"])


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    ref_type: str
    ref_id: int
    title: str
    due: date | None
    created_at: datetime
    read_at: datetime | None
    resolved_at: datetime | None


class NotificationPollOut(BaseModel):
    unread_count: int
    latest_id: int
    new_items: list[NotificationOut]
    toast: NotificationToast | None


class MarkAllReadOut(BaseModel):
    updated: int


class DeviceIn(BaseModel):
    platform: Literal["android", "ios", "web"]
    fid: str = Field(min_length=1, max_length=512)


@router.get("")
def get_notifications(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    unread: bool = False,
    since_id: Annotated[int | None, Query(ge=0)] = None,
) -> list[NotificationOut]:
    return [
        NotificationOut.model_validate(n)
        for n in list_notifications(db, user, unread=unread, since_id=since_id)
    ]


@router.get("/poll")
def get_notifications_poll(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    since_id: Annotated[int | None, Query(ge=0)] = None,
) -> NotificationPollOut:
    snap = poll_notifications(db, user, since_id=since_id)
    return NotificationPollOut(
        unread_count=snap.unread_count,
        latest_id=snap.latest_id,
        new_items=[NotificationOut.model_validate(n) for n in snap.new_items],
        toast=snap.toast,
    )


@router.post("/read-all")
def post_read_all(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MarkAllReadOut:
    updated = mark_all_read(db, user)
    db.commit()
    return MarkAllReadOut(updated=updated)


@router.post("/{notification_id}/read")
def post_read(
    notification_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NotificationOut:
    row = mark_read(db, user, notification_id)
    out = NotificationOut.model_validate(row)
    db.commit()
    return out


@rules_router.get("")
def get_rules(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RuleSpec]:
    return list_rules(db, user)


@rules_router.put("")
def put_rules(
    payload: list[RuleSpec],
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RuleSpec]:
    rules = update_rules(db, user, payload)
    db.commit()
    return rules


@devices_router.post("", status_code=status.HTTP_204_NO_CONTENT)
def post_device(
    payload: DeviceIn,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    register_device(db, user, platform=payload.platform, fid=payload.fid)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
