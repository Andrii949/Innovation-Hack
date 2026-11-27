from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.models import AuditLog
from app.audit.service import log_event
from app.auth.models import Role, User, UserSession
from app.auth.permissions import DEFAULT_ROLES
from app.auth.security import hash_token, new_token, verify_password
from app.errors import AppError
from app.settings.service import get_setting


def ensure_default_roles(db: Session) -> dict[str, Role]:
    existing = {role.name: role for role in db.scalars(select(Role)).all()}
    created = False
    for role_name, perms in DEFAULT_ROLES.items():
        if role_name not in existing:
            role = Role(name=role_name, permissions=sorted(p.value for p in perms))
            db.add(role)
            existing[role_name] = role
            created = True
    if created:
        db.flush()
    return existing


def _count_recent_failed_logins(db: Session, login_name: str, since: datetime) -> int:
    rows = db.scalars(
        select(AuditLog).where(AuditLog.action == "login", AuditLog.at >= since)
    ).all()
    count = 0
    for row in rows:
        if (
            isinstance(row.after, dict)
            and row.after.get("success") is False
            and row.after.get("login") == login_name
        ):
            count += 1
    return count


def login(
    db: Session,
    *,
    login: str,
    password: str,
    device_info: str | None,
    now: datetime,
) -> tuple[str, User]:
    max_attempts = int(get_setting(db, "login_max_attempts"))
    window_minutes = int(get_setting(db, "login_window_minutes"))
    since = now - timedelta(minutes=window_minutes)
    if _count_recent_failed_logins(db, login, since) >= max_attempts:
        raise AppError(
            429,
            "TOO_MANY_ATTEMPTS",
            "Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później.",
        )

    user = db.scalars(select(User).where(User.login == login)).first()
    if user is None or not user.active or not verify_password(password, user.password_hash):
        log_event(
            db,
            action="login",
            entity="app_user",
            entity_id=str(user.id) if user is not None else None,
            after={"success": False, "login": login},
            user_id=user.id if user is not None else None,
            at=now,
        )
        db.commit()
        raise AppError(401, "INVALID_CREDENTIALS", "Nieprawidłowy login lub hasło")

    ttl_hours = int(get_setting(db, "session_ttl_hours"))
    raw_token, token_digest = new_token()
    session_row = UserSession(
        user_id=user.id,
        token_hash=token_digest,
        expires_at=now + timedelta(hours=ttl_hours),
        revoked_at=None,
        device_info=device_info,
    )
    db.add(session_row)
    log_event(
        db,
        action="login",
        entity="app_user",
        entity_id=str(user.id),
        after={"success": True, "login": login},
        user_id=user.id,
        at=now,
    )
    db.commit()
    return raw_token, user


def resolve_token(db: Session, raw_token: str, now: datetime) -> User:
    token_digest = hash_token(raw_token)
    session_row = db.scalars(
        select(UserSession).where(UserSession.token_hash == token_digest)
    ).first()
    if session_row is None:
        raise AppError(401, "NOT_AUTHENTICATED", "Wymagane zalogowanie")

    expires_at = session_row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    now_utc = now if now.tzinfo is not None else now.replace(tzinfo=UTC)

    if session_row.revoked_at is not None or expires_at <= now_utc:
        raise AppError(401, "NOT_AUTHENTICATED", "Sesja wygasła lub została unieważniona")

    user = session_row.user
    if not user.active:
        raise AppError(401, "NOT_AUTHENTICATED", "Konto użytkownika jest nieaktywne")
    return user


def logout(db: Session, raw_token: str, now: datetime | None = None) -> None:
    token_digest = hash_token(raw_token)
    session_row = db.scalars(
        select(UserSession).where(UserSession.token_hash == token_digest)
    ).first()
    if session_row is not None and session_row.revoked_at is None:
        session_row.revoked_at = now or datetime.now(UTC)
        db.commit()
