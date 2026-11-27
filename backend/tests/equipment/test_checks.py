from typing import Any

import pytest
from app.equipment.models import Equipment
from app.equipment.service import set_authorized_users
from fastapi.testclient import TestClient

TEMP_FIELDS: list[dict[str, Any]] = [
    {
        "key": "temp",
        "label": "Temperatura",
        "type": "number",
        "unit": "°C",
        "min": "18",
        "max": "22",
        "required": True,
    }
]


@pytest.fixture
def eq_a(make_lab: Any, make_equipment: Any) -> Equipment:
    return make_equipment(make_lab("A"), number="121")


@pytest.fixture
def worker_a(db: Any, make_lab: Any, make_user: Any, eq_a: Equipment) -> Any:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    w = make_user("worker", labs=(lab_a,))
    set_authorized_users(db, admin, eq_a.id, [w.id])
    return w


@pytest.fixture
def worker_b(make_lab: Any, make_user: Any) -> Any:
    return make_user("worker", labs=(make_lab("A"),))


@pytest.fixture
def worker_w(make_lab: Any, make_user: Any) -> Any:
    return make_user("worker", labs=(make_lab("W", name="Wytrzymałościowa"),))


def post_check(client: TestClient, user: Any, plan: Any, temp: Any, auth: Any) -> Any:
    return client.post(
        f"/api/check-plans/{plan.id}/records",
        headers=auth(user),
        json={"performed_on": "2026-11-27", "values": {"temp": temp}},
    )


def test_authorized_worker_records_check(
    client: TestClient,
    worker_a: Any,
    eq_a: Equipment,
    make_check_plan: Any,
    auth: Any,
) -> None:
    r = post_check(client, worker_a, make_check_plan(eq_a, TEMP_FIELDS), "20,5", auth)
    assert r.status_code == 201
    assert r.json()["out_of_range"] is False


def test_value_outside_template_range_is_flagged(
    client: TestClient,
    worker_a: Any,
    eq_a: Equipment,
    make_check_plan: Any,
    auth: Any,
) -> None:
    r = post_check(client, worker_a, make_check_plan(eq_a, TEMP_FIELDS), "23,5", auth)
    assert r.status_code == 201
    assert r.json()["out_of_range"] is True
    assert r.json()["values"]["temp"] == "23.5"


@pytest.mark.parametrize(
    ("who", "expected_status", "expected_error"),
    [
        ("worker_b", 403, "NOT_AUTHORIZED_FOR_EQUIPMENT"),
        ("worker_w", 403, "LAB_OUT_OF_SCOPE"),
    ],
)
def test_scan_without_rights_is_rejected(
    client: TestClient,
    request: pytest.FixtureRequest,
    eq_a: Equipment,
    make_check_plan: Any,
    auth: Any,
    who: str,
    expected_status: int,
    expected_error: str,
) -> None:
    user = request.getfixturevalue(who)
    r = post_check(client, user, make_check_plan(eq_a, TEMP_FIELDS), "20", auth)
    assert r.status_code == expected_status
    assert r.json()["error"] == expected_error


def test_withdrawn_equipment_rejects_check(
    client: TestClient,
    make_user: Any,
    worker_a: Any,
    eq_a: Equipment,
    make_check_plan: Any,
    auth: Any,
) -> None:
    admin = make_user("admin", all_labs=True)
    plan = make_check_plan(eq_a, TEMP_FIELDS)
    client.post(
        f"/api/equipment/{eq_a.id}/withdraw",
        headers=auth(admin),
        json={"reason": "Awaria"},
    )
    r = post_check(client, worker_a, plan, "20", auth)
    assert r.status_code == 409
    assert r.json()["error"] == "EQUIPMENT_WITHDRAWN"


def test_missing_required_field_is_422(
    client: TestClient,
    worker_a: Any,
    eq_a: Equipment,
    make_check_plan: Any,
    auth: Any,
) -> None:
    plan = make_check_plan(eq_a, TEMP_FIELDS)
    r = client.post(
        f"/api/check-plans/{plan.id}/records",
        headers=auth(worker_a),
        json={"performed_on": "2026-11-27", "values": {}},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert any(item["field"] == "temp" for item in body["details"])


def test_invalid_number_is_422(
    client: TestClient,
    worker_a: Any,
    eq_a: Equipment,
    make_check_plan: Any,
    auth: Any,
) -> None:
    r = post_check(client, worker_a, make_check_plan(eq_a, TEMP_FIELDS), "abc", auth)
    assert r.status_code == 422
    assert r.json()["error"] == "INVALID_NUMBER"


def test_check_plan_lead_range_is_0_12(
    client: TestClient,
    make_user: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    admin = make_user("admin", all_labs=True)
    headers = auth(admin)
    tpl = client.post(
        "/api/form-templates",
        headers=headers,
        json={"name": "Kontrola temperatury", "fields": TEMP_FIELDS},
    )
    assert tpl.status_code == 201
    tpl_id = tpl.json()["id"]

    for ok_lead in (0, 12):
        res_ok = client.post(
            f"/api/equipment/{eq_a.id}/check-plans",
            headers=headers,
            json={
                "name": f"Plan {ok_lead}",
                "interval_months": 1,
                "lead_months": ok_lead,
                "form_template_id": tpl_id,
            },
        )
        assert res_ok.status_code == 201

    res_bad = client.post(
        f"/api/equipment/{eq_a.id}/check-plans",
        headers=headers,
        json={
            "name": "Plan 13",
            "interval_months": 1,
            "lead_months": 13,
            "form_template_id": tpl_id,
        },
    )
    assert res_bad.status_code == 422
    assert res_bad.json()["error"] == "VALIDATION_ERROR"
