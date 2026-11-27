from collections.abc import Callable

from app.auth.models import Lab, User
from app.equipment.models import Equipment
from app.results.models import TestParameter
from fastapi.testclient import TestClient


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
