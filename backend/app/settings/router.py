from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.auth.permissions import Permission, require
from app.db import get_db
from app.settings.service import get_all_settings, update_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings_endpoint(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    require(user, Permission.SETTINGS_WRITE)
    return get_all_settings(db)


@router.put("")
def put_settings_endpoint(
    values: Annotated[dict[str, Any], Body()],
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    require(user, Permission.SETTINGS_WRITE)
    updated = update_settings(db, values)
    db.commit()
    return updated
