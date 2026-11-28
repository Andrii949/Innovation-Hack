"""Presenter signals: create a notification/push look-alike and route the app on stage.

Not part of the ISO 17025 domain: events are ephemeral and admin-only.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import Lab, User
from app.auth.permissions import Permission, has_permission
from app.db import get_db
from app.demo.bus import DemoAction, DemoEvent, publish, since
from app.equipment.models import Equipment
from app.errors import AppError
from app.notifications.models import Notification, NotificationKind

router = APIRouter(prefix="/demo", tags=["demo"])


class DemoTriggerIn(BaseModel):
    action: Literal["push", "scan", "card", "toast"]
    public_id: str | None = None
    source: Literal["nfc", "qr"] = "nfc"
    title: str = Field(default="Nowe powiadomienie", max_length=200)
    message: str = Field(default="Masz nowe powiadomienia w aplikacji", max_length=500)


class DemoEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: DemoAction
    public_id: str | None
    code: str | None
    name: str | None
    title: str
    message: str
    source: Literal["nfc", "qr"] | None
    created_at: datetime


def _equipment_for_demo(db: Session, public_id: str | None) -> tuple[Equipment, str]:
    raw = (public_id or "").strip()
    if raw == "":
        raise AppError(422, "VALIDATION_ERROR", "Wybierz urządzenie do pokazania.")
    equipment = db.scalars(select(Equipment).where(Equipment.public_id == raw)).first()
    if equipment is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono urządzenia o tym identyfikatorze.")
    lab = db.get(Lab, equipment.lab_id)
    code = equipment.number if lab is None else f"{equipment.number}/{lab.code}"
    return equipment, code


@router.post("/trigger")
def trigger(
    payload: DemoTriggerIn,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DemoEventOut:
    if not has_permission(user, Permission.SETTINGS_WRITE):
        raise AppError(403, "FORBIDDEN", "Brak uprawnień do uruchamiania prezentacji")

    event: DemoEvent
    if payload.action in {"scan", "card"}:
        equipment, code = _equipment_for_demo(db, payload.public_id)
        event = publish(
            action=payload.action,
            public_id=equipment.public_id,
            code=code,
            name=equipment.name,
            title=equipment.name,
            message=code,
            source=payload.source if payload.action == "scan" else None,
        )
    elif payload.action == "push":
        event = publish(action="push", title=payload.title, message=payload.message)
        # A real row per active account: the bell badge and the notifications list move
        # exactly like they do after the worker creates a notification.
        recipients = db.scalars(select(User).where(User.active.is_(True))).all()
        now = datetime.now(UTC)
        for recipient in recipients:
            db.add(
                Notification(
                    user_id=recipient.id,
                    kind=NotificationKind.REPORT_READY.value,
                    ref_type="demo",
                    ref_id=event.id,
                    title=payload.title,
                    due=None,
                    dedupe_key=f"demo:{uuid4().hex}",
                    created_at=now,
                )
            )
        db.commit()
    else:
        event = publish(action="toast", title=payload.title, message=payload.message)

    return DemoEventOut.model_validate(event)


@router.get("/events")
def list_events(
    _user: Annotated[User, Depends(current_user)],
    after: Annotated[int, Query(ge=0)] = 0,
) -> list[DemoEventOut]:
    return [DemoEventOut.model_validate(event) for event in since(after)]
