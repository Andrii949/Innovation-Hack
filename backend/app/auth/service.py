from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.models import AuditLog
from app.audit.service import log_event
from app.auth.models import Lab, Role, User, UserSession
from app.auth.permissions import DEFAULT_ROLES, visible_lab_ids
from app.auth.security import hash_password, hash_token, new_token, verify_password
from app.errors import AppError
from app.settings.service import get_setting

_DUMMY_PASSWORD_HASH = hash_password("dummy-timing-guard")


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
    password_ok = verify_password(
        password, user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    )
    if user is None or not user.active or not password_ok:
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


def list_labs(db: Session, user: User) -> list[Lab]:
    allowed = visible_lab_ids(user)
    stmt = select(Lab).order_by(Lab.code)
    if allowed is not None:
        stmt = stmt.where(Lab.id.in_(allowed))
    return list(db.scalars(stmt).all())


def create_lab(db: Session, *, code: str, name: str, active: bool = True) -> Lab:
    clean_code = code.strip().upper()
    clean_name = name.strip()
    if not clean_code or not clean_name:
        raise AppError(422, "VALIDATION_ERROR", "Kod i nazwa pracowni są wymagane")
    existing = db.scalars(select(Lab).where(Lab.code == clean_code)).first()
    if existing is not None:
        raise AppError(409, "DUPLICATE_LAB_CODE", f"Kod pracowni '{clean_code}' jest już zajęty")
    lab = Lab(code=clean_code, name=clean_name, active=active)
    db.add(lab)
    db.flush()
    return lab


def update_lab(
    db: Session,
    lab_id: int,
    *,
    code: str | None = None,
    name: str | None = None,
    active: bool | None = None,
) -> Lab:
    lab = db.get(Lab, lab_id)
    if lab is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono pracowni")
    if code is not None:
        clean_code = code.strip().upper()
        if not clean_code:
            raise AppError(422, "VALIDATION_ERROR", "Kod pracowni nie może być pusty")
        conflict = db.scalars(select(Lab).where(Lab.code == clean_code, Lab.id != lab_id)).first()
        if conflict is not None:
            raise AppError(
                409,
                "DUPLICATE_LAB_CODE",
                f"Kod pracowni '{clean_code}' jest już zajęty",
            )
        lab.code = clean_code
    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise AppError(422, "VALIDATION_ERROR", "Nazwa pracowni nie może być pusta")
        lab.name = clean_name
    if active is not None:
        lab.active = active
    db.flush()
    return lab


def _resolve_role(db: Session, *, role_name: str | None, role_id: int | None) -> Role:
    roles = ensure_default_roles(db)
    if role_id is not None:
        role = db.get(Role, role_id)
        if role is None:
            raise AppError(422, "VALIDATION_ERROR", "Nieznana rola użytkownika")
        return role
    if role_name is not None:
        if role_name in roles:
            return roles[role_name]
        role = db.scalars(select(Role).where(Role.name == role_name)).first()
        if role is None:
            raise AppError(422, "VALIDATION_ERROR", f"Nieznana rola: {role_name}")
        return role
    raise AppError(422, "VALIDATION_ERROR", "Wymagane podanie roli użytkownika")


def _resolve_labs(db: Session, lab_ids: list[int]) -> list[Lab]:
    if not lab_ids:
        return []
    unique_ids = list(dict.fromkeys(lab_ids))
    labs = list(db.scalars(select(Lab).where(Lab.id.in_(unique_ids))).all())
    if len(labs) != len(unique_ids):
        raise AppError(422, "VALIDATION_ERROR", "Nieprawidłowy identyfikator pracowni")
    return labs


def create_user_account(
    db: Session,
    *,
    login_name: str,
    full_name: str,
    password: str,
    role_name: str | None = None,
    role_id: int | None = None,
    all_labs: bool = False,
    lab_ids: list[int] | None = None,
    active: bool = True,
) -> User:
    clean_login = login_name.strip()
    clean_name = full_name.strip()
    if not clean_login or not clean_name or not password:
        raise AppError(422, "VALIDATION_ERROR", "Login, imię i nazwisko oraz hasło są wymagane")
    existing = db.scalars(select(User).where(User.login == clean_login)).first()
    if existing is not None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Login '{clean_login}' jest już zajęty",
            details=[{"field": "login", "message": "Login jest już zajęty"}],
        )
    role = _resolve_role(db, role_name=role_name, role_id=role_id)
    labs = _resolve_labs(db, lab_ids or [])
    user = User(
        login=clean_login,
        full_name=clean_name,
        password_hash=hash_password(password),
        role_id=role.id,
        all_labs=all_labs,
        active=active,
    )
    user.labs = labs
    db.add(user)
    db.flush()
    db.refresh(user)
    return user


def update_user_account(
    db: Session,
    user_id: int,
    *,
    full_name: str | None = None,
    password: str | None = None,
    role_name: str | None = None,
    role_id: int | None = None,
    all_labs: bool | None = None,
    lab_ids: list[int] | None = None,
    active: bool | None = None,
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono użytkownika")
    if full_name is not None:
        clean_name = full_name.strip()
        if not clean_name:
            raise AppError(422, "VALIDATION_ERROR", "Imię i nazwisko nie może być puste")
        user.full_name = clean_name
    if password is not None:
        if not password:
            raise AppError(422, "VALIDATION_ERROR", "Hasło nie może być puste")
        user.password_hash = hash_password(password)
    if role_name is not None or role_id is not None:
        role = _resolve_role(db, role_name=role_name, role_id=role_id)
        user.role_id = role.id
    if all_labs is not None:
        user.all_labs = all_labs
    if lab_ids is not None:
        user.labs = _resolve_labs(db, lab_ids)
    if active is not None:
        user.active = active
        if not active:
            now = datetime.now(UTC)
            open_sessions = db.scalars(
                select(UserSession).where(
                    UserSession.user_id == user.id,
                    UserSession.revoked_at.is_(None),
                )
            ).all()
            for sess in open_sessions:
                sess.revoked_at = now
    db.flush()
    db.refresh(user)
    return user
