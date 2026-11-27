from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user, extract_bearer_token, get_now
from app.auth.models import Role, User
from app.auth.permissions import Permission, has_permission, require, visible_lab_ids
from app.auth.service import (
    create_lab,
    create_user_account,
    ensure_default_roles,
    list_labs,
    update_lab,
    update_user_account,
)
from app.auth.service import login as login_service
from app.auth.service import logout as logout_service
from app.db import get_db
from app.errors import AppError

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
    role_id: int
    permissions: list[str]
    all_labs: bool
    lab_ids: list[int]
    active: bool


class LoginResponse(BaseModel):
    token: str
    user: UserOut


class LabOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    active: bool


class LabCreate(BaseModel):
    code: str
    name: str
    active: bool = True


class LabUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    active: bool | None = None


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    permissions: list[str]


class UserCreate(BaseModel):
    login: str
    full_name: str
    password: str
    role: str | None = None
    role_id: int | None = None
    all_labs: bool = False
    lab_ids: list[int] = []
    active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    password: str | None = None
    role: str | None = None
    role_id: int | None = None
    all_labs: bool | None = None
    lab_ids: list[int] | None = None
    active: bool | None = None


def serialize_user(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        login=user.login,
        full_name=user.full_name,
        role=user.role.name,
        role_id=user.role_id,
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


@router.get("/labs")
def get_labs(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[LabOut]:
    return [LabOut.model_validate(lab) for lab in list_labs(db, user)]


@router.post("/labs", status_code=status.HTTP_201_CREATED)
def post_lab(
    payload: LabCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LabOut:
    require(user, Permission.SETTINGS_WRITE)
    lab = create_lab(db, code=payload.code, name=payload.name, active=payload.active)
    db.commit()
    return LabOut.model_validate(lab)


@router.patch("/labs/{lab_id}")
def patch_lab(
    lab_id: int,
    payload: LabUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LabOut:
    require(user, Permission.SETTINGS_WRITE)
    lab = update_lab(
        db,
        lab_id,
        code=payload.code,
        name=payload.name,
        active=payload.active,
    )
    db.commit()
    return LabOut.model_validate(lab)


@router.get("/roles")
def get_roles(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[RoleOut]:
    require(user, Permission.USERS_WRITE)
    ensure_default_roles(db)
    db.commit()
    roles = db.scalars(select(Role).order_by(Role.name)).all()
    return [RoleOut.model_validate(r) for r in roles]


@router.get("/users")
def get_users(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    lab_id: int | None = None,
) -> list[UserOut]:
    if not (
        has_permission(user, Permission.USERS_WRITE)
        or has_permission(user, Permission.EQUIPMENT_WRITE)
    ):
        raise AppError(403, "FORBIDDEN", "Brak uprawnień do wykonania tej operacji")
    if lab_id is not None:
        allowed = visible_lab_ids(user)
        if allowed is not None and lab_id not in allowed:
            raise AppError(403, "LAB_OUT_OF_SCOPE", "Pracownia spoza zakresu uprawnień użytkownika")
    rows = db.scalars(select(User).order_by(User.login)).all()
    if lab_id is not None:
        rows = [u for u in rows if u.all_labs or any(lab.id == lab_id for lab in u.labs)]
    return [serialize_user(u) for u in rows]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def post_user(
    payload: UserCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    require(user, Permission.USERS_WRITE)
    created = create_user_account(
        db,
        login_name=payload.login,
        full_name=payload.full_name,
        password=payload.password,
        role_name=payload.role,
        role_id=payload.role_id,
        all_labs=payload.all_labs,
        lab_ids=payload.lab_ids,
        active=payload.active,
    )
    db.commit()
    return serialize_user(created)


@router.patch("/users/{user_id}")
def patch_user(
    user_id: int,
    payload: UserUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    require(user, Permission.USERS_WRITE)
    updated = update_user_account(
        db,
        user_id,
        full_name=payload.full_name,
        password=payload.password,
        role_name=payload.role,
        role_id=payload.role_id,
        all_labs=payload.all_labs,
        lab_ids=payload.lab_ids,
        active=payload.active,
    )
    db.commit()
    return serialize_user(updated)
