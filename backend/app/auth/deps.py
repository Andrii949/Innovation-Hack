from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.audit.context import set_audit_reason, set_audit_user
from app.auth.models import User
from app.auth.service import resolve_token
from app.db import get_db
from app.errors import AppError


def get_now() -> datetime:
    return datetime.now(UTC)


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AppError(401, "NOT_AUTHENTICATED", "Wymagane zalogowanie")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AppError(401, "NOT_AUTHENTICATED", "Nieprawidłowy nagłówek autoryzacji")
    return token.strip()


def current_user(
    db: Annotated[Session, Depends(get_db)],
    now: Annotated[datetime, Depends(get_now)],
    authorization: Annotated[str | None, Header()] = None,
    x_audit_reason: Annotated[str | None, Header()] = None,
) -> User:
    raw_token = extract_bearer_token(authorization)
    user = resolve_token(db, raw_token, now)
    set_audit_user(user.id)
    if x_audit_reason:
        set_audit_reason(x_audit_reason)
    return user
