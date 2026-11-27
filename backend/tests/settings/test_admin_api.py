from typing import Any

from app.audit.models import AuditLog
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session


def test_put_settings_is_audited(
    client: TestClient,
    db: Session,
    make_user: Any,
    auth: Any,
) -> None:
    admin = make_user("admin", all_labs=True)
    response = client.put(
        "/api/settings",
        headers=auth(admin),
        json={"default_equipment_lead_months": 3, "equipment_lead_months_range": [1, 12]},
    )
    assert response.status_code == 200
    assert response.json()["default_equipment_lead_months"] == 3

    logs = db.scalars(
        select(AuditLog).where(
            AuditLog.entity == "setting",
            AuditLog.entity_id == "default_equipment_lead_months",
        )
    ).all()
    assert len(logs) == 1
    assert logs[0].user_id == admin.id
    assert logs[0].after == {"key": "default_equipment_lead_months", "value": 3}


def test_unknown_setting_key_is_422(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    admin = make_user("admin", all_labs=True)
    response = client.put(
        "/api/settings",
        headers=auth(admin),
        json={"unknown_key": 123},
    )
    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"

    bad_range = client.put(
        "/api/settings",
        headers=auth(admin),
        json={"equipment_lead_months_range": [12, 1]},
    )
    assert bad_range.status_code == 422
    assert bad_range.json()["error"] == "VALIDATION_ERROR"


def test_lab_code_must_be_unique(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    admin = make_user("admin", all_labs=True)
    r1 = client.post(
        "/api/labs",
        headers=auth(admin),
        json={"code": "A", "name": "Analityczna"},
    )
    assert r1.status_code == 201

    r2 = client.post(
        "/api/labs",
        headers=auth(admin),
        json={"code": "A", "name": "Duplikat"},
    )
    assert r2.status_code == 409
    assert r2.json()["error"] == "DUPLICATE_LAB_CODE"


def test_worker_cannot_change_settings(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    worker = make_user("worker")
    response = client.put(
        "/api/settings",
        headers=auth(worker),
        json={"default_equipment_lead_months": 2},
    )
    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


def test_deactivated_user_token_stops_working(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    worker = make_user("worker", labs=(lab_a,))
    worker_headers = auth(worker)

    assert client.get("/api/me", headers=worker_headers).status_code == 200

    patch_res = client.patch(
        f"/api/users/{worker.id}",
        headers=auth(admin),
        json={"active": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["active"] is False

    me_res = client.get("/api/me", headers=worker_headers)
    assert me_res.status_code == 401
    assert me_res.json()["error"] == "NOT_AUTHENTICATED"


def test_users_and_roles_crud(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    admin = make_user("admin", all_labs=True)

    roles_res = client.get("/api/roles", headers=auth(admin))
    assert roles_res.status_code == 200
    role_names = {r["name"] for r in roles_res.json()}
    assert {"admin", "manager", "worker"} <= role_names

    new_secret = "-".join(("nowe", "haslo", "123"))
    create_res = client.post(
        "/api/users",
        headers=auth(admin),
        json={
            "login": "nowy_laborant",
            "full_name": "Nowy Laborant",
            "password": new_secret,
            "role": "worker",
            "all_labs": False,
            "lab_ids": [lab_a.id],
        },
    )
    assert create_res.status_code == 201
    uid = create_res.json()["id"]
    assert create_res.json()["lab_ids"] == [lab_a.id]

    upd_res = client.patch(
        f"/api/users/{uid}",
        headers=auth(admin),
        json={"role": "manager", "all_labs": False, "lab_ids": [lab_a.id, lab_w.id]},
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["role"] == "manager"
    assert upd_res.json()["lab_ids"] == sorted([lab_a.id, lab_w.id])
