from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.auth.models import Lab, User
from app.equipment.models import Calibration, Equipment
from app.results.models import TestParameter, TestResult
from app.settings.service import update_settings
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_specialist_prepares_plan_and_only_manager_approves(
    client: TestClient,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_user: Callable[..., User],
    auth: Callable[[User], dict[str, str]],
) -> None:
    lab = make_lab()
    equipment = make_equipment(lab)
    admin = auth(make_user("admin", all_labs=True))
    manager = auth(make_user("manager", labs=[lab]))
    worker = auth(make_user("worker", labs=[lab]))
    response = client.post(
        "/api/calibration-plans",
        headers=admin,
        json={"equipment_id": equipment.id, "dispatch_on": "2026-12-01", "return_on": "2026-12-03"},
    )
    assert response.status_code == 201, response.text
    path = f"/api/calibration-plans/{response.json()['id']}/approve"
    assert client.post(path, headers=admin).status_code == 403
    assert client.post(path, headers=worker).status_code == 403
    approved = client.post(path, headers=manager)
    assert approved.status_code == 200, approved.text
    assert approved.json()["approved_at"]
    assert client.post(path, headers=manager).json() == approved.json()


def test_result_can_use_device_and_nok_calibration_flags_it_for_review(
    client: TestClient,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_user: Callable[..., User],
    make_parameter: Callable[..., TestParameter],
    auth: Callable[[User], dict[str, str]],
) -> None:
    lab = make_lab()
    equipment = make_equipment(lab, last_calibrated_month="2025-11")
    outsider = make_lab("OUT")
    admin = auth(make_user("admin", all_labs=True))
    worker = auth(make_user("worker", labs=[lab]))
    out_of_scope = auth(make_user("worker", labs=[outsider]))
    parameter = make_parameter()
    path = "/api/test-results"
    payload = {
        "parameter_id": parameter.id,
        "equipment_id": equipment.id,
        "sample_label": "ABC",
        "value": "1,2",
    }
    assert client.post(path, headers=worker, json=payload).status_code == 403
    result = client.post(path, headers=admin, json=payload)
    assert result.status_code == 201, result.text
    assert result.json()["equipment_id"] == equipment.id
    assert not client.get(path, headers=out_of_scope).json()
    calibration = client.post(
        f"/api/equipment/{equipment.id}/calibrations",
        headers=admin,
        json={
            "calibrated_month": "2026-11",
            "vendor": "Firma wzorcująca",
            "result": "NOK",
            "points": [{"point": "1", "error": "0,2", "uncertainty": "0,1", "unit": "g"}],
        },
    )
    assert calibration.status_code == 201, calibration.text
    result_id = result.json()["id"]
    results = client.get(path, params={"equipment_id": equipment.id}, headers=admin).json()
    assert results[0]["review_decision"] == "PENDING"
    assert results[0]["review_calibration_id"] == calibration.json()["id"]
    review = client.post(
        f"{path}/{result_id}/review",
        headers=admin,
        json={"decision": "REPEAT", "note": "Powtórz pomiar"},
    )
    assert review.status_code == 200, review.text
    assert review.json()["review_decision"] == "REPEAT"


def test_overlapping_dispatch_of_all_alternatives_blocks_approval(
    client: TestClient,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_user: Callable[..., User],
    auth: Callable[[User], dict[str, str]],
) -> None:
    lab = make_lab()
    first = make_equipment(lab, number="10")
    second = make_equipment(lab, number="11")
    admin = auth(make_user("admin", all_labs=True))
    manager = auth(make_user("manager", labs=[lab]))
    for device in (first, second):
        response = client.patch(
            f"/api/equipment/{device.id}", headers=admin, json={"category": "Termohigrometry"}
        )
        assert response.status_code == 200, response.text
    path = "/api/calibration-plans"
    dates = {"dispatch_on": "2026-12-01", "return_on": "2026-12-05"}
    created_plan = client.post(path, headers=admin, json={"equipment_id": first.id, **dates})
    assert created_plan.status_code == 201
    other_plan = client.post(path, headers=admin, json={"equipment_id": second.id, **dates})
    assert other_plan.status_code == 201
    approval = f"{path}/{created_plan.json()['id']}/approve"
    assert client.post(approval, headers=manager).status_code == 409
    moved = client.patch(
        f"{path}/{other_plan.json()['id']}",
        headers=admin,
        json={"dispatch_on": "2026-12-06", "return_on": "2026-12-09"},
    )
    assert moved.status_code == 200, moved.text
    assert client.post(approval, headers=manager).status_code == 200


def test_nok_does_not_overwrite_review_and_respects_later_ok(
    client: TestClient,
    db: Session,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_calibration: Callable[..., Calibration],
    make_user: Callable[..., User],
    make_parameter: Callable[..., TestParameter],
    auth: Callable[[User], dict[str, str]],
) -> None:
    lab = make_lab()
    equipment = make_equipment(lab, last_calibrated_month="2026-01")
    update_settings(db, {"withdraw_on_calibration_nok": False})
    db.flush()

    admin_user = make_user("admin", all_labs=True)
    admin = auth(admin_user)
    parameter = make_parameter()
    warsaw = ZoneInfo("Europe/Warsaw")

    early = TestResult(
        parameter_id=parameter.id,
        equipment_id=equipment.id,
        sample_label="EARLY",
        value=Decimal("1.2"),
        min_snapshot=parameter.min_value,
        max_snapshot=parameter.max_value,
        in_range=True,
        created_by=admin_user.id,
        created_at=datetime(2026, 2, 10, 10, tzinfo=warsaw),
    )
    db.add(early)
    db.flush()

    first_nok = client.post(
        f"/api/equipment/{equipment.id}/calibrations",
        headers=admin,
        json={
            "calibrated_month": "2026-03",
            "vendor": "Firma X",
            "result": "NOK",
            "points": [{"point": "1", "error": "0.2", "uncertainty": "0.1", "unit": "g"}],
        },
    )
    assert first_nok.status_code == 201

    reviewed = client.post(
        f"/api/test-results/{early.id}/review",
        headers=admin,
        json={"decision": "ACCEPTED", "note": "Zatwierdzono w trybie nadzoru"},
    )
    assert reviewed.status_code == 200

    make_calibration(equipment, "2026-04", "OK")
    later = TestResult(
        parameter_id=parameter.id,
        equipment_id=equipment.id,
        sample_label="AFTER-OK",
        value=Decimal("1.3"),
        min_snapshot=parameter.min_value,
        max_snapshot=parameter.max_value,
        in_range=True,
        created_by=admin_user.id,
        created_at=datetime(2026, 5, 10, 10, tzinfo=warsaw),
    )
    db.add(later)
    db.flush()

    backdated_nok = client.post(
        f"/api/equipment/{equipment.id}/calibrations",
        headers=admin,
        json={
            "calibrated_month": "2026-02",
            "vendor": "Firma X",
            "result": "NOK",
            "points": [{"point": "1", "error": "0.3", "uncertainty": "0.1", "unit": "g"}],
        },
    )
    assert backdated_nok.status_code == 201

    db.refresh(early)
    db.refresh(later)
    assert early.review_decision == "ACCEPTED"
    assert early.review_note == "Zatwierdzono w trybie nadzoru"
    assert later.review_decision is None


def test_duplicate_plan_rejected_and_sole_device_allowed(
    client: TestClient,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_user: Callable[..., User],
    auth: Callable[[User], dict[str, str]],
) -> None:
    lab = make_lab()
    sole = make_equipment(lab, number="99")
    admin = auth(make_user("admin", all_labs=True))
    manager = auth(make_user("manager", labs=[lab]))

    client.patch(f"/api/equipment/{sole.id}", headers=admin, json={"category": "Unikalne"})
    dates = {"equipment_id": sole.id, "dispatch_on": "2026-12-10", "return_on": "2026-12-12"}
    created = client.post("/api/calibration-plans", headers=admin, json=dates)
    assert created.status_code == 201
    assert created.json()["available_devices"] == 0
    assert created.json()["warning"] is None

    dup = client.post("/api/calibration-plans", headers=admin, json=dates)
    assert dup.status_code == 409
    assert dup.json()["error"] == "CALIBRATION_PLAN_CONFLICT"

    approved = client.post(
        f"/api/calibration-plans/{created.json()['id']}/approve",
        headers=manager,
    )
    assert approved.status_code == 200


def test_result_on_withdrawn_device_uses_equipment_withdrawn_code(
    client: TestClient,
    make_lab: Callable[..., Lab],
    make_equipment: Callable[..., Equipment],
    make_user: Callable[..., User],
    make_parameter: Callable[..., TestParameter],
    auth: Callable[[User], dict[str, str]],
) -> None:
    lab = make_lab()
    equipment = make_equipment(lab, number="77")
    admin = auth(make_user("admin", all_labs=True))
    parameter = make_parameter()

    assert (
        client.post(
            f"/api/equipment/{equipment.id}/withdraw",
            headers=admin,
            json={"reason": "Awaria"},
        ).status_code
        == 200
    )

    resp = client.post(
        "/api/test-results",
        headers=admin,
        json={
            "parameter_id": parameter.id,
            "equipment_id": equipment.id,
            "sample_label": "S-1",
            "value": "2.0",
        },
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "EQUIPMENT_WITHDRAWN"
