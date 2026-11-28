"""Push channel through Firebase Cloud Messaging (T17, docs/02-architektura.md §9).

Targets are Firebase Installation IDs (FIDs); FCM deprecated registration tokens in 2026.
The push carries no details: the app fetches them from the API after the user taps it.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime

import firebase_admin
from firebase_admin import credentials, messaging
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.notifications.models import Channel, DeviceToken, Notification
from app.notifications.service import effective_rules

logger = logging.getLogger(__name__)

PUSH_TITLE = "Inteligentne Laboratorium"
PUSH_BODY = "Masz nowe powiadomienia w aplikacji"
FCM_MULTICAST_LIMIT = 500

Sender = Callable[[list[str]], list[str]]


def build_message(fids: list[str]) -> messaging.MulticastMessage:
    return messaging.MulticastMessage(
        fids=fids,
        notification=messaging.Notification(title=PUSH_TITLE, body=PUSH_BODY),
    )


def push_configured() -> bool:
    path = get_settings().fcm_credentials_file
    return path is not None and path.is_file()


def _firebase_app() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        path = get_settings().fcm_credentials_file
        return firebase_admin.initialize_app(credentials.Certificate(str(path)))


def send_push(fids: list[str]) -> list[str]:
    """Send PUSH_BODY to the FIDs; returns the FIDs FCM reports as unregistered."""
    app = _firebase_app()
    unregistered: list[str] = []
    for start in range(0, len(fids), FCM_MULTICAST_LIMIT):
        chunk = fids[start : start + FCM_MULTICAST_LIMIT]
        batch = messaging.send_each_for_multicast(build_message(chunk), app=app)
        unregistered.extend(
            fid
            for fid, response in zip(chunk, batch.responses, strict=True)
            if isinstance(response.exception, messaging.UnregisteredError)
        )
    return unregistered


def push_pending(db: Session, *, sender: Sender = send_push) -> int:
    """One push per device of every user with unpushed notifications of a PUSH-enabled kind.

    Returns how many devices were addressed.
    """
    kinds = [
        kind.value
        for kind, rule in effective_rules(db).items()
        if rule.enabled and Channel.PUSH in rule.channels
    ]
    if not kinds:
        return 0
    pending = db.scalars(
        select(Notification).where(
            Notification.pushed_at.is_(None),
            Notification.read_at.is_(None),
            Notification.resolved_at.is_(None),
            Notification.kind.in_(kinds),
        )
    ).all()
    if not pending:
        return 0

    user_ids = {n.user_id for n in pending}
    fids = list(db.scalars(select(DeviceToken.fid).where(DeviceToken.user_id.in_(user_ids))))
    if fids:
        dead = sender(fids)
        if dead:
            db.execute(delete(DeviceToken).where(DeviceToken.fid.in_(dead)))
    now = datetime.now(UTC)
    for notification in pending:
        notification.pushed_at = now
    db.flush()
    return len(fids)
