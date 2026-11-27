from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import current_user, extract_bearer_token, get_now
from app.auth.models import User
from app.auth.service import login as login_service
from app.auth.service import logout as logout_service
from app.db import get_db

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    login: str
    password: str
    device_info: str | None = None


class UserOut(BaseModel):
    id: int
    login: str
    full_name: str
    role: str
    permissions: list[str]
    all_labs: bool
    lab_ids: list[int]
    active: bool


class LoginResponse(BaseModel):
    token: str
    user: UserOut


def serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        login=user.login,
        full_name=user.full_name,
        role=user.role.name,
        permissions=list(user.role.permissions),
        all_labs=user.all_labs,
        lab_ids=sorted(lab.id for lab in user.labs),
        active=user.active,
    )


@router.post("/auth/login")
def post_login(
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
    now: Annotated[datetime, Depends(get_now)],
) -> LoginResponse:
    token, user = login_service(
        db,
        login=payload.login,
        password=payload.password,
        device_info=payload.device_info,
        now=now,
    )
    return LoginResponse(token=token, user=serialize_user(user))


@router.post("/auth/logout")
def post_logout(
    _user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    now: Annotated[datetime, Depends(get_now)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    raw_token = extract_bearer_token(authorization)
    logout_service(db, raw_token, now=now)
    return {"status": "ok"}


@router.get("/me")
def get_me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return serialize_user(user)
