from datetime import date
from typing import Any

import pytest
from app.notifications.models import NotificationKind
from app.notifications.service import notify_now
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


@pytest.mark.req("F3")
def test_poll_suppresses_toast_on_initial_load_and_shows_single_new_toast(
    client: TestClient,
    db: Session,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", labs=(lab_a,))
    headers = auth(admin)

    notify_now(
        db,
        kind=NotificationKind.CHECK_OUT_OF_RANGE,
        lab_id=lab_a.id,
        ref_type="check_record",
        ref_id=1,
        title="Sprawdzenie poza zakresem: 122/A Termohigrometr",
    )
    db.flush()

    # Initial poll without since_id sets cursor and unread_count, with toast=None.
    initial = client.get("/api/notifications/poll", headers=headers)
    assert initial.status_code == 200
    init_body = initial.json()
    assert init_body["unread_count"] == 1
    assert init_body["latest_id"] > 0
    assert init_body["toast"] is None

    cursor = init_body["latest_id"]

    # Subsequent poll with nothing new -> toast is None
    idle = client.get(f"/api/notifications/poll?since_id={cursor}", headers=headers)
    assert idle.status_code == 200
    assert idle.json()["toast"] is None
    assert idle.json()["new_items"] == []

    # 1 new alert arrives -> clean single toast
    notify_now(
        db,
        kind=NotificationKind.RESULT_OUT_OF_RANGE,
        lab_id=None,
        ref_type="test_result",
        ref_id=10,
        title="Wynik poza zakresem: SO3 = 3,35 %",
    )
    db.flush()

    polled = client.get(f"/api/notifications/poll?since_id={cursor}", headers=headers)
    assert polled.status_code == 200
    p_body = polled.json()
    assert p_body["unread_count"] == 2
    assert len(p_body["new_items"]) == 1
    assert p_body["toast"] == {
        "title": "Wynik poza zakresem: SO3 = 3,35 %",
        "count": 1,
        "kind": "RESULT_OUT_OF_RANGE",
        "ref_type": "test_result",
        "ref_id": 10,
    }


@pytest.mark.req("F3")
def test_poll_coalesces_burst_notifications_into_single_human_toast(
    client: TestClient,
    db: Session,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", labs=(lab_a,))
    headers = auth(admin)

    init_cursor = client.get("/api/notifications/poll", headers=headers).json()["latest_id"]

    for idx in range(1, 4):
        notify_now(
            db,
            kind=NotificationKind.CALIBRATION_DUE,
            lab_id=lab_a.id,
            ref_type="equipment",
            ref_id=100 + idx,
            title=f"Zbliża się termin wzorcowania: {120 + idx}/A",
        )
    db.flush()

    burst = client.get(f"/api/notifications/poll?since_id={init_cursor}", headers=headers)
    assert burst.status_code == 200
    body = burst.json()
    assert body["unread_count"] == 3
    assert len(body["new_items"]) == 3
    assert body["toast"] is not None
    assert body["toast"]["count"] == 3
    assert "(+2 więcej)" in body["toast"]["title"]

    # Optional since_id filter on GET /api/notifications also works
    filtered = client.get(
        f"/api/notifications?unread=true&since_id={init_cursor}",
        headers=headers,
    )
    assert filtered.status_code == 200
    assert len(filtered.json()) == 3
    assert date.fromisoformat(filtered.json()[0]["created_at"][:10]) is not None
