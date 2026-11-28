from collections.abc import Callable

from app.auth.models import Lab, User
from app.equipment.models import Equipment
from fastapi.testclient import TestClient

Auth = Callable[[User], dict[str, str]]
MakeUser = Callable[..., User]
MakeLab = Callable[..., Lab]
MakeEquipment = Callable[..., Equipment]


def test_demo_trigger_requires_settings_permission(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    worker = make_user("worker")
    response = client.post(
        "/api/demo/trigger",
        json={"action": "toast", "message": "x"},
        headers=auth(worker),
    )
    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


def test_demo_push_creates_notifications_and_event(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    admin = make_user("admin", all_labs=True)
    worker = make_user("worker")
    admin_headers = auth(admin)
    worker_headers = auth(worker)

    response = client.post(
        "/api/demo/trigger",
        json={
            "action": "push",
            "title": "Nowy raport gotowy",
            "message": "Raport jest w aplikacji",
        },
        headers=admin_headers,
    )
    assert response.status_code == 200
    event = response.json()
    assert event["action"] == "push"

    events = client.get(f"/api/demo/events?after={event['id'] - 1}", headers=worker_headers).json()
    assert [item["id"] for item in events] == [event["id"]]

    notifications = client.get("/api/notifications", headers=worker_headers).json()
    assert any(row["title"] == "Nowy raport gotowy" for row in notifications)


def test_demo_scan_resolves_equipment_for_both_media(
    client: TestClient,
    make_user: MakeUser,
    auth: Auth,
    make_lab: MakeLab,
    make_equipment: MakeEquipment,
) -> None:
    admin = make_user("admin", all_labs=True)
    lab = make_lab("A")
    equipment = make_equipment(lab, number="991", name="Waga analityczna")

    response = client.post(
        "/api/demo/trigger",
        json={
            "action": "scan",
            "source": "nfc",
            "public_id": equipment.public_id,
        },
        headers=auth(admin),
    )
    assert response.status_code == 200
    event = response.json()
    assert event["action"] == "scan"
    assert event["source"] == "nfc"
    assert event["public_id"] == equipment.public_id
    assert event["code"] == "991/A"
    assert event["name"] == "Waga analityczna"


def test_demo_scan_rejects_unknown_public_id(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    admin = make_user("admin", all_labs=True)
    response = client.post(
        "/api/demo/trigger",
        json={"action": "scan", "public_id": "NOPE0000000"},
        headers=auth(admin),
    )
    assert response.status_code == 404
    assert response.json()["error"] == "NOT_FOUND"
