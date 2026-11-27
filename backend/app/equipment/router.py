from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.core.clock import get_today
from app.db import get_db
from app.equipment._core import Status
from app.equipment.schemas import (
    AuthorizedUserOut,
    AuthorizedUsersUpdate,
    EquipmentCard,
    EquipmentCreate,
    EquipmentOut,
    EquipmentUpdate,
    ReasonRequest,
)
from app.equipment.service import (
    create_equipment,
    get_equipment_by_qr,
    get_equipment_for_user,
    list_authorized_users,
    list_equipment_for_user,
    restore,
    serialize_authorized_user,
    serialize_equipment_card,
    serialize_equipment_out,
    set_authorized_users,
    update_equipment,
    withdraw,
)

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("")
def get_equipment_list(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
    lab_id: int | None = None,
    status_filter: Annotated[Status | None, Query(alias="status")] = None,
    q: str | None = None,
) -> list[EquipmentOut]:
    return list_equipment_for_user(
        db,
        user,
        today=today,
        lab_id=lab_id,
        status_filter=status_filter,
        query=q,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def post_equipment(
    payload: EquipmentCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> EquipmentOut:
    eq = create_equipment(db, user, payload)
    out = serialize_equipment_out(db, eq, today=today)
    db.commit()
    return out


@router.get("/by-qr/{public_id}")
def get_equipment_card_by_qr(
    public_id: str,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> EquipmentCard:
    eq = get_equipment_by_qr(db, user, public_id)
    return serialize_equipment_card(db, user, eq, today=today)


@router.get("/{equipment_id}")
def get_equipment_detail(
    equipment_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> EquipmentCard:
    eq = get_equipment_for_user(db, user, equipment_id)
    return serialize_equipment_card(db, user, eq, today=today)


@router.patch("/{equipment_id}")
def patch_equipment(
    equipment_id: int,
    payload: EquipmentUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> EquipmentOut:
    eq = update_equipment(db, user, equipment_id, payload)
    out = serialize_equipment_out(db, eq, today=today)
    db.commit()
    return out


@router.post("/{equipment_id}/withdraw")
def post_withdraw_equipment(
    equipment_id: int,
    payload: ReasonRequest,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> EquipmentOut:
    eq = withdraw(db, user, equipment_id, payload.reason)
    out = serialize_equipment_out(db, eq, today=today)
    db.commit()
    return out


@router.post("/{equipment_id}/restore")
def post_restore_equipment(
    equipment_id: int,
    payload: ReasonRequest,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> EquipmentOut:
    eq = restore(db, user, equipment_id, payload.reason)
    out = serialize_equipment_out(db, eq, today=today)
    db.commit()
    return out


@router.get("/{equipment_id}/authorized-users")
def get_equipment_authorized_users(
    equipment_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AuthorizedUserOut]:
    users = list_authorized_users(db, user, equipment_id)
    return [serialize_authorized_user(u) for u in users]


@router.put("/{equipment_id}/authorized-users")
def put_equipment_authorized_users(
    equipment_id: int,
    payload: AuthorizedUsersUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AuthorizedUserOut]:
    users = set_authorized_users(db, user, equipment_id, payload.user_ids)
    out = [serialize_authorized_user(u) for u in users]
    db.commit()
    return out
