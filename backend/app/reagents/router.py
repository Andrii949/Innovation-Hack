from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.core.clock import get_today
from app.db import get_db
from app.reagents.schemas import (
    LotCreate,
    LotDispose,
    LotOut,
    ReagentCreate,
    ReagentOut,
    ReagentUpdate,
    StockCountCreate,
    StockCountOut,
)
from app.reagents.service import (
    create_reagent,
    dispose_lot,
    get_reagent_or_404,
    list_reagents,
    receive_lot,
    record_stock_count,
    serialize_lot,
    serialize_reagent,
    serialize_stock_count,
    update_reagent,
)

router = APIRouter(prefix="/reagents", tags=["reagents"])
lots_router = APIRouter(prefix="/lots", tags=["reagents"])


@router.get("")
def get_reagents(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
    lab_id: int | None = None,
) -> list[ReagentOut]:
    return [serialize_reagent(db, r, today=today) for r in list_reagents(db, user, lab_id=lab_id)]


@router.post("", status_code=status.HTTP_201_CREATED)
def post_reagent(
    payload: ReagentCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> ReagentOut:
    reagent = create_reagent(db, user, payload)
    out = serialize_reagent(db, reagent, today=today)
    db.commit()
    return out


@router.patch("/{reagent_id}")
def patch_reagent(
    reagent_id: int,
    payload: ReagentUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> ReagentOut:
    reagent = update_reagent(db, user, reagent_id, payload)
    out = serialize_reagent(db, reagent, today=today)
    db.commit()
    return out


@router.post("/{reagent_id}/lots", status_code=status.HTTP_201_CREATED)
def post_lot(
    reagent_id: int,
    payload: LotCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> LotOut:
    lot = receive_lot(db, user, reagent_id, payload)
    out = serialize_lot(get_reagent_or_404(db, reagent_id), lot, today=today)
    db.commit()
    return out


@router.post("/{reagent_id}/stock-counts", status_code=status.HTTP_201_CREATED)
def post_stock_count(
    reagent_id: int,
    payload: StockCountCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> StockCountOut:
    count = record_stock_count(db, user, reagent_id, payload)
    out = serialize_stock_count(count)
    db.commit()
    return out


@lots_router.patch("/{lot_id}")
def patch_lot(
    lot_id: int,
    payload: LotDispose,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> LotOut:
    lot = dispose_lot(db, user, lot_id, payload.disposed_on)
    out = serialize_lot(lot.reagent, lot, today=today)
    db.commit()
    return out
