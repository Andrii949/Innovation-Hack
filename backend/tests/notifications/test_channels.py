from collections.abc import Callable
from pathlib import Path

import pytest
from app.auth.models import User
from app.notifications.models import DeviceToken, Notification, NotificationKind
from app.notifications.push import (
    PUSH_BODY,
    PUSH_TITLE,
    build_message,
    push_configured,
    push_pending,
)
from app.notifications.service import notify_now
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

MakeUser = Callable[..., User]
Auth = Callable[[User], dict[str, str]]


class FakeSender:
    def __init__(self, unregistered: list[str] | None = None) -> None:
        self.calls: list[list[str]] = []
        self.unregistered = unregistered or []

    def __call__(self, fids: list[str]) -> list[str]:
        self.calls.append(sorted(fids))
        return self.unregistered


@pytest.fixture
def manager(make_user: MakeUser) -> User:
    return make_user("manager", all_labs=True)


def add_device(db: Session, user: User, fid: str) -> None:
    db.add(DeviceToken(user_id=user.id, platform="android", fid=fid))
    db.flush()


def report_ready(db: Session, ref_id: int = 1) -> None:
    notify_now(
        db,
        kind=NotificationKind.REPORT_READY,
        lab_id=None,
        ref_type="report",
        ref_id=ref_id,
        title="Raport 121/A Waga analityczna gotowy",
    )


def enable_push(client: TestClient, headers: dict[str, str], kind: str) -> None:
    rules = client.get("/api/notification-rules", headers=headers).json()
    rule = next(r for r in rules if r["kind"] == kind)
    response = client.put(
        "/api/notification-rules", headers=headers, json=[{**rule, "channels": ["IN_APP", "PUSH"]}]
    )
    assert response.status_code == 200


def test_register_device_upserts_fid(
    client: TestClient, db: Session, make_user: MakeUser, auth: Auth
) -> None:
    first, second = make_user("worker", all_labs=True), make_user("worker", all_labs=True)

    a = client.post(
        "/api/devices", headers=auth(first), json={"platform": "android", "fid": "fid-1"}
    )
    b = client.post("/api/devices", headers=auth(second), json={"platform": "ios", "fid": "fid-1"})

    rows = db.scalars(select(DeviceToken).where(DeviceToken.fid == "fid-1")).all()
    assert a.status_code == 204
    assert b.status_code == 204
    assert [(r.user_id, r.platform) for r in rows] == [(second.id, "ios")]


def test_push_body_has_no_details() -> None:
    message = build_message(["fid-1", "fid-2"])

    assert message.fids == ["fid-1", "fid-2"]
    assert message.notification is not None
    assert message.notification.title == PUSH_TITLE
    assert message.notification.body == PUSH_BODY


def test_channels_follow_rule(
    client: TestClient, db: Session, manager: User, make_user: MakeUser, auth: Auth
) -> None:
    add_device(db, manager, "fid-manager")
    report_ready(db)
    sender = FakeSender()

    assert push_pending(db, sender=sender) == 0
    assert sender.calls == []

    enable_push(client, auth(make_user("admin", all_labs=True)), "REPORT_READY")
    assert push_pending(db, sender=sender) == 1
    assert push_pending(db, sender=sender) == 0
    assert sender.calls == [["fid-manager"]]


def test_one_push_per_device_even_with_many_notifications(
    client: TestClient, db: Session, manager: User, make_user: MakeUser, auth: Auth
) -> None:
    enable_push(client, auth(make_user("admin", all_labs=True)), "REPORT_READY")
    add_device(db, manager, "fid-manager")
    report_ready(db, ref_id=1)
    report_ready(db, ref_id=2)
    sender = FakeSender()

    assert push_pending(db, sender=sender) == 1
    assert sender.calls == [["fid-manager"]]
    pushed = db.scalars(select(Notification).where(Notification.user_id == manager.id)).all()
    assert all(n.pushed_at is not None for n in pushed)


def test_unregistered_fid_is_deleted(
    client: TestClient, db: Session, manager: User, make_user: MakeUser, auth: Auth
) -> None:
    enable_push(client, auth(make_user("admin", all_labs=True)), "REPORT_READY")
    add_device(db, manager, "fid-dead")
    add_device(db, manager, "fid-alive")
    report_ready(db)

    push_pending(db, sender=FakeSender(unregistered=["fid-dead"]))

    assert set(db.scalars(select(DeviceToken.fid)).all()) == {"fid-alive"}


def test_push_configured_ignores_blank_or_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "fcm_credentials_file", None)
    assert push_configured() is False

    monkeypatch.setattr(settings, "fcm_credentials_file", tmp_path)
    assert push_configured() is False

    creds = tmp_path / "fcm.json"
    creds.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(settings, "fcm_credentials_file", creds)
    assert push_configured() is True
