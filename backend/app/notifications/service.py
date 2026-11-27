"""Notification rules, deduplicated generation from the schedule, immediate alerts (F3, 02 §8.3).

In-app notifications are always written; `channels` on a rule only decide about push (T17).
"""

from datetime import UTC, date, datetime

from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.models import Role, User
from app.auth.permissions import Permission, require
from app.core.status import Status
from app.errors import AppError
from app.notifications.models import (
    Channel,
    DeviceToken,
    Notification,
    NotificationKind,
    NotificationRule,
)
from app.schedule.service import DueItem, DueKind, list_due_items


class RuleSpec(BaseModel):
    kind: NotificationKind
    recipient_roles: list[str]
    lab_scoped: bool
    channels: list[Channel]
    enabled: bool


DEFAULT_RULES: dict[NotificationKind, RuleSpec] = {
    rule.kind: rule
    for rule in (
        RuleSpec(
            kind=NotificationKind.CALIBRATION_DUE,
            recipient_roles=["admin"],
            lab_scoped=True,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.CHECK_DUE,
            recipient_roles=["worker", "admin"],
            lab_scoped=True,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.LOT_EXPIRY,
            recipient_roles=["admin"],
            lab_scoped=True,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.LOW_STOCK,
            recipient_roles=["admin"],
            lab_scoped=True,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.STOCK_COUNT_DUE,
            recipient_roles=["worker"],
            lab_scoped=True,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.CHECK_OUT_OF_RANGE,
            recipient_roles=["admin"],
            lab_scoped=True,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.RESULT_OUT_OF_RANGE,
            recipient_roles=["admin"],
            lab_scoped=False,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
        RuleSpec(
            kind=NotificationKind.REPORT_READY,
            recipient_roles=["manager"],
            lab_scoped=False,
            channels=[Channel.IN_APP],
            enabled=True,
        ),
    )
}

# Which schedule statuses raise which notification (02 §6).
SCHEDULED: dict[DueKind, tuple[NotificationKind, frozenset[Status]]] = {
    DueKind.CALIBRATION: (
        NotificationKind.CALIBRATION_DUE,
        frozenset({Status.DUE_SOON, Status.OVERDUE, Status.NO_DATA}),
    ),
    DueKind.CHECK: (NotificationKind.CHECK_DUE, frozenset({Status.DUE_SOON, Status.OVERDUE})),
    DueKind.LOT_EXPIRY: (
        NotificationKind.LOT_EXPIRY,
        frozenset({Status.DUE_SOON, Status.OVERDUE}),
    ),
    DueKind.LOW_STOCK: (NotificationKind.LOW_STOCK, frozenset({Status.LOW})),
    DueKind.STOCK_COUNT: (NotificationKind.STOCK_COUNT_DUE, frozenset({Status.COUNT_DUE})),
}
SCHEDULED_KINDS = frozenset(kind for kind, _ in SCHEDULED.values())

TITLES: dict[tuple[NotificationKind, Status], str] = {
    (NotificationKind.CALIBRATION_DUE, Status.DUE_SOON): "Zbliża się termin wzorcowania",
    (NotificationKind.CALIBRATION_DUE, Status.OVERDUE): "Po terminie wzorcowania",
    (NotificationKind.CALIBRATION_DUE, Status.NO_DATA): "Brak danych o wzorcowaniu",
    (NotificationKind.CHECK_DUE, Status.DUE_SOON): "Zbliża się sprawdzenie",
    (NotificationKind.CHECK_DUE, Status.OVERDUE): "Po terminie sprawdzenia",
    (NotificationKind.LOT_EXPIRY, Status.DUE_SOON): "Kończy się ważność",
    (NotificationKind.LOT_EXPIRY, Status.OVERDUE): "Po terminie ważności",
    (NotificationKind.LOW_STOCK, Status.LOW): "Mało odczynnika",
    (NotificationKind.STOCK_COUNT_DUE, Status.COUNT_DUE): "Zrób spis stanu",
}


def effective_rules(db: Session) -> dict[NotificationKind, RuleSpec]:
    rules = dict(DEFAULT_RULES)
    for row in db.scalars(select(NotificationRule)).all():
        kind = NotificationKind(row.kind)
        rules[kind] = RuleSpec(
            kind=kind,
            recipient_roles=list(row.recipient_roles),
            lab_scoped=row.lab_scoped,
            channels=[Channel(c) for c in row.channels],
            enabled=row.enabled,
        )
    return rules


def list_rules(db: Session, user: User) -> list[RuleSpec]:
    require(user, Permission.SETTINGS_WRITE)
    return list(effective_rules(db).values())


def update_rules(db: Session, user: User, rules: list[RuleSpec]) -> list[RuleSpec]:
    require(user, Permission.SETTINGS_WRITE)
    known_roles = set(db.scalars(select(Role.name)).all())
    for rule in rules:
        unknown = sorted(set(rule.recipient_roles) - known_roles)
        if unknown:
            raise AppError(
                422,
                "VALIDATION_ERROR",
                f"Nieznane role w regule {rule.kind}: {', '.join(unknown)}",
                details=[{"field": "recipient_roles", "message": "unknown role"}],
            )
    for rule in rules:
        row = db.get(NotificationRule, rule.kind.value)
        if row is None:
            row = NotificationRule(kind=rule.kind.value)
            db.add(row)
        row.recipient_roles = list(rule.recipient_roles)
        row.lab_scoped = rule.lab_scoped
        row.channels = [c.value for c in rule.channels]
        row.enabled = rule.enabled
    db.flush()
    return list(effective_rules(db).values())


def _recipients(db: Session, rule: RuleSpec, lab_id: int | None) -> list[User]:
    if not rule.enabled or not rule.recipient_roles:
        return []
    users = db.scalars(
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(Role.name.in_(rule.recipient_roles), User.active.is_(True))
        .order_by(User.id)
    ).all()
    if not rule.lab_scoped or lab_id is None:
        return list(users)
    return [u for u in users if u.all_labs or any(lab.id == lab_id for lab in u.labs)]


def recipients_for(db: Session, kind: NotificationKind, lab_id: int | None) -> list[User]:
    return _recipients(db, effective_rules(db)[kind], lab_id)


def dedupe_key(item: DueItem) -> str:
    return f"{item.kind}:{item.ref_type}:{item.ref_id}:{item.due}:{item.status}"


def _title(kind: NotificationKind, item: DueItem) -> str:
    title = f"{TITLES.get((kind, item.status), kind.value)}: {item.label}"
    if item.valid_until is not None:
        title += f" (ważne do {item.valid_until:%d.%m.%Y})"
    return title


def _insert(
    db: Session,
    *,
    user_id: int,
    kind: NotificationKind,
    ref_type: str,
    ref_id: int,
    title: str,
    due: date | None,
    key: str,
) -> bool:
    """Insert unless (user_id, key) exists — safe when two workers run at once."""
    stmt = (
        insert(Notification)
        .values(
            user_id=user_id,
            kind=kind.value,
            ref_type=ref_type,
            ref_id=ref_id,
            title=title,
            due=due,
            dedupe_key=key,
            created_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"])
        .returning(Notification.id)
    )
    return db.execute(stmt).scalar_one_or_none() is not None


def generate_notifications(db: Session, *, today: date) -> int:
    """Create notifications for due items; resolve the ones whose item is no longer due."""
    rules = effective_rules(db)
    recipients_cache: dict[tuple[NotificationKind, int], list[User]] = {}
    active_keys: set[str] = set()
    created = 0

    for item in list_due_items(db, today=today):
        kind, statuses = SCHEDULED[item.kind]
        if item.status not in statuses:
            continue
        key = dedupe_key(item)
        active_keys.add(key)
        cache_key = (kind, item.lab_id)
        if cache_key not in recipients_cache:
            recipients_cache[cache_key] = _recipients(db, rules[kind], item.lab_id)
        for user in recipients_cache[cache_key]:
            created += _insert(
                db,
                user_id=user.id,
                kind=kind,
                ref_type=item.ref_type,
                ref_id=item.ref_id,
                title=_title(kind, item),
                due=item.due,
                key=key,
            )

    stale = update(Notification).where(
        Notification.kind.in_([k.value for k in SCHEDULED_KINDS]),
        Notification.resolved_at.is_(None),
    )
    if active_keys:
        stale = stale.where(Notification.dedupe_key.not_in(active_keys))
    db.execute(stale.values(resolved_at=datetime.now(UTC)))
    db.flush()
    return created


def notify_now(
    db: Session,
    *,
    kind: NotificationKind,
    lab_id: int | None,
    ref_type: str,
    ref_id: int,
    title: str,
) -> int:
    """Immediate notification for an event (out-of-range entry, ready report)."""
    created = 0
    for user in recipients_for(db, kind, lab_id):
        created += _insert(
            db,
            user_id=user.id,
            kind=kind,
            ref_type=ref_type,
            ref_id=ref_id,
            title=title,
            due=None,
            key=f"{kind}:{ref_type}:{ref_id}",
        )
    db.flush()
    return created


def list_notifications(db: Session, user: User, *, unread: bool) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread:
        stmt = stmt.where(Notification.read_at.is_(None), Notification.resolved_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
    return list(db.scalars(stmt).all())


def mark_read(db: Session, user: User, notification_id: int) -> Notification:
    row = db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono powiadomienia")
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        db.flush()
    return row


def mark_all_read(db: Session, user: User) -> int:
    updated = db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
        .returning(Notification.id)
    ).all()
    db.flush()
    return len(updated)


def register_device(db: Session, user: User, *, platform: str, fid: str) -> DeviceToken:
    """Upsert by FID: a phone that changes hands follows its last logged-in user."""
    row = db.scalars(select(DeviceToken).where(DeviceToken.fid == fid)).first()
    if row is None:
        row = DeviceToken(user_id=user.id, platform=platform, fid=fid)
        db.add(row)
    else:
        row.user_id = user.id
        row.platform = platform
        row.last_seen_at = datetime.now(UTC)
    db.flush()
    return row
