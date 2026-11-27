from typing import Any

import pytest
from fastapi.testclient import TestClient


def test_same_number_in_two_labs_is_allowed(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    admin = make_user("admin", all_labs=True)
    for lab in (lab_a, lab_w):
        r = client.post(
            "/api/equipment",
            headers=auth(admin),
            json={
                "lab_id": lab.id,
                "number": "121",
                "name": "Waga analityczna",
                "calibration_interval_months": 12,
            },
        )
        assert r.status_code == 201
    codes = {e["code"] for e in client.get("/api/equipment", headers=auth(admin)).json()}
    assert codes == {"121/A", "121/W"}


def test_duplicate_number_in_same_lab_is_409(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    body = {
        "lab_id": lab_a.id,
        "number": "121",
        "name": "Waga",
        "calibration_interval_months": 12,
    }
    first = client.post("/api/equipment", headers=auth(admin), json=body)
    assert first.status_code == 201
    second = client.post("/api/equipment", headers=auth(admin), json=body)
    assert second.status_code == 409
    assert second.json()["error"] == "DUPLICATE_EQUIPMENT_NUMBER"


def test_sticker_month_creates_first_calibration(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    r = client.post(
        "/api/equipment",
        headers=auth(admin),
        json={
            "lab_id": lab_a.id,
            "number": "7",
            "name": "Termohigrometr",
            "calibration_interval_months": 12,
            "lead_months": 1,
            "last_calibrated_month": "2025-12",
        },
    )
    assert r.status_code == 201
    body = client.get(f"/api/equipment/{r.json()['id']}", headers=auth(admin)).json()
    assert body["next_due_month"] == "2026-12"
    assert body["status"] == "DUE_SOON"


@pytest.mark.parametrize("bad_lead", [0, 13])
def test_lead_months_outside_1_12_is_422(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
    bad_lead: int,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    r = client.post(
        "/api/equipment",
        headers=auth(admin),
        json={
            "lab_id": lab_a.id,
            "number": f"L{bad_lead}",
            "name": "Waga",
            "calibration_interval_months": 12,
            "lead_months": bad_lead,
        },
    )
    assert r.status_code == 422
    assert r.json()["error"] == "VALIDATION_ERROR"


def test_without_calibration_status_is_no_data(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    r_req = client.post(
        "/api/equipment",
        headers=auth(admin),
        json={
            "lab_id": lab_a.id,
            "number": "10",
            "name": "Piec",
            "calibration_interval_months": 24,
        },
    )
    assert r_req.status_code == 201
    assert r_req.json()["status"] == "NO_DATA"
    assert r_req.json()["next_due_month"] is None

    r_noreq = client.post(
        "/api/equipment",
        headers=auth(admin),
        json={
            "lab_id": lab_a.id,
            "number": "11",
            "name": "Mieszadło",
            "calibration_required": False,
        },
    )
    assert r_noreq.status_code == 201
    assert r_noreq.json()["status"] == "NOT_REQUIRED"


def test_withdraw_and_restore_need_reason(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    eq = make_equipment(lab_a, number="50", last_calibrated_month="2026-06")

    bad_withdraw = client.post(
        f"/api/equipment/{eq.id}/withdraw",
        headers=auth(admin),
        json={"reason": "   "},
    )
    assert bad_withdraw.status_code == 422

    w_res = client.post(
        f"/api/equipment/{eq.id}/withdraw",
        headers=auth(admin),
        json={"reason": "Uszkodzony wyświetlacz"},
    )
    assert w_res.status_code == 200
    assert w_res.json()["status"] == "WITHDRAWN"
    assert w_res.json()["withdrawn_reason"] == "Uszkodzony wyświetlacz"

    bad_restore = client.post(
        f"/api/equipment/{eq.id}/restore",
        headers=auth(admin),
        json={},
    )
    assert bad_restore.status_code == 422

    r_res = client.post(
        f"/api/equipment/{eq.id}/restore",
        headers=auth(admin),
        json={"reason": "Po naprawie i sprawdzeniu"},
    )
    assert r_res.status_code == 200
    assert r_res.json()["status"] == "OK"
    assert r_res.json()["withdrawn_at"] is None


def test_worker_sees_own_lab_only_and_cannot_create(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    worker_a = make_user("worker", labs=(lab_a,))
    make_equipment(lab_a, number="1")
    make_equipment(lab_w, number="1")

    listed = client.get("/api/equipment", headers=auth(worker_a)).json()
    assert [item["code"] for item in listed] == ["1/A"]

    create_attempt = client.post(
        "/api/equipment",
        headers=auth(worker_a),
        json={
            "lab_id": lab_a.id,
            "number": "2",
            "name": "Suwmiarka",
            "calibration_interval_months": 12,
        },
    )
    assert create_attempt.status_code == 403
    assert create_attempt.json()["error"] == "FORBIDDEN"


def test_by_qr_returns_card(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    worker_a = make_user("worker", labs=(lab_a,))
    eq = make_equipment(lab_a, number="121")

    res = client.get(f"/api/equipment/by-qr/{eq.public_id}", headers=auth(worker_a))
    assert res.status_code == 200
    card = res.json()
    assert card["code"] == "121/A"
    assert card["qr_url"].endswith(f"/e/{eq.public_id}")
    assert card["check_plans"] == []
    assert card["can_write"] is False
