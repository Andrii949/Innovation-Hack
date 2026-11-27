import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

from app.audit.models import AuditLog
from app.auth.models import UserSession
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session


def test_login_returns_token_and_user(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
) -> None:
    lab_a = make_lab("A", name="Analityczna")
    user = make_user("worker", labs=(lab_a,), login="jan", full_name="Jan Kowalski")

    response = client.post(
        "/api/auth/login",
        json={"login": "jan", "password": "test-pass-123", "device_info": "Android 15"},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["token"]) >= 40
    assert body["user"]["id"] == user.id
    assert body["user"]["login"] == "jan"
    assert body["user"]["role"] == "worker"
    assert body["user"]["lab_ids"] == [lab_a.id]


def test_token_is_stored_only_as_hash(
    client: TestClient,
    db: Session,
    make_user: Any,
) -> None:
    user = make_user("admin", all_labs=True, login="admin1")
    response = client.post(
        "/api/auth/login",
        json={"login": "admin1", "password": "test-pass-123"},
    )
    raw_token = response.json()["token"]
    expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    sessions = db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all()
    assert len(sessions) == 1
    assert sessions[0].token_hash == expected_hash
    assert sessions[0].token_hash != raw_token


def test_wrong_password_is_401(
    client: TestClient,
    db: Session,
    make_user: Any,
) -> None:
    make_user("worker", login="anna")
    response = client.post(
        "/api/auth/login",
        json={"login": "anna", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["error"] == "INVALID_CREDENTIALS"

    logs = db.scalars(select(AuditLog).where(AuditLog.action == "login")).all()
    assert len(logs) == 1
    assert logs[0].after == {"success": False, "login": "anna"}


def test_inactive_user_cannot_login(
    client: TestClient,
    make_user: Any,
) -> None:
    make_user("worker", login="inactive_u", active=False)
    response = client.post(
        "/api/auth/login",
        json={"login": "inactive_u", "password": "test-pass-123"},
    )
    assert response.status_code == 401
    assert response.json()["error"] == "INVALID_CREDENTIALS"


def test_logout_revokes_token(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    user = make_user("worker", login="logout_u")
    headers = auth(user)

    me_ok = client.get("/api/me", headers=headers)
    assert me_ok.status_code == 200

    out = client.post("/api/auth/logout", headers=headers)
    assert out.status_code == 200

    me_after = client.get("/api/me", headers=headers)
    assert me_after.status_code == 401
    assert me_after.json()["error"] == "NOT_AUTHENTICATED"


def test_expired_session_is_401(
    client: TestClient,
    db: Session,
    make_user: Any,
    auth: Any,
) -> None:
    user = make_user("worker", login="expired_u")
    headers = auth(user)

    session_row = db.scalars(select(UserSession).where(UserSession.user_id == user.id)).one()
    session_row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.flush()

    response = client.get("/api/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"] == "NOT_AUTHENTICATED"


def test_sixth_failed_login_in_window_is_429(
    client: TestClient,
    make_user: Any,
) -> None:
    make_user("worker", login="throttled_u")
    for _ in range(5):
        res = client.post(
            "/api/auth/login",
            json={"login": "throttled_u", "password": "bad"},
        )
        assert res.status_code == 401

    sixth = client.post(
        "/api/auth/login",
        json={"login": "throttled_u", "password": "bad"},
    )
    assert sixth.status_code == 429
    assert sixth.json()["error"] == "TOO_MANY_ATTEMPTS"
