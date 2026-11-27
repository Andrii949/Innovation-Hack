from typing import Any

import pytest
from app.equipment.models import Equipment
from app.files.models import Attachment
from app.settings.service import update_settings
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

SAMPLE_PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


@pytest.fixture
def admin_a(make_lab: Any, make_user: Any) -> Any:
    lab_a = make_lab("A")
    return make_user("admin", labs=(lab_a,))


@pytest.fixture
def eq_a(make_lab: Any, make_equipment: Any) -> Equipment:
    lab_a = make_lab("A")
    return make_equipment(lab_a, number="121", interval=12, lead=1)


def test_next_due_from_certificate_month(
    client: TestClient,
    admin_a: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=auth(admin_a),
        json={
            "calibrated_month": "2026-03",
            "vendor": "Laboratorium wzorcujące X",
            "certificate_no": "W/123/2026",
            "result": "OK",
            "points": [
                {
                    "point": "500 g",
                    "error": "-0,001",
                    "uncertainty": "0,0005",
                    "unit": "g",
                }
            ],
        },
    )
    assert r.status_code == 201
    assert r.json()["next_due_month"] == "2027-03"
    assert r.json()["points"][0]["error"] == "-0.001"
    assert client.get(f"/api/equipment/{eq_a.id}", headers=auth(admin_a)).json()["status"] == "OK"


def test_nok_withdraws_equipment(
    client: TestClient,
    admin_a: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=auth(admin_a),
        json={
            "calibrated_month": "2026-11",
            "vendor": "Laboratorium wzorcujące X",
            "certificate_no": "W/124/2026",
            "result": "NOK",
            "points": [
                {
                    "point": "500 g",
                    "error": "0,9",
                    "uncertainty": "0,1",
                    "unit": "g",
                }
            ],
        },
    )
    assert r.status_code == 201
    body = client.get(f"/api/equipment/{eq_a.id}", headers=auth(admin_a)).json()
    assert body["status"] == "WITHDRAWN"
    assert "W/124/2026" in body["withdrawn_reason"]


def test_nok_keeps_dates_status_when_setting_off(
    client: TestClient,
    db: Session,
    admin_a: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    update_settings(db, {"withdraw_on_calibration_nok": False})
    db.flush()

    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=auth(admin_a),
        json={
            "calibrated_month": "2026-11",
            "vendor": "Laboratorium wzorcujące X",
            "certificate_no": "W/125/2026",
            "result": "NOK",
            "points": [
                {
                    "point": "500 g",
                    "error": "0,9",
                    "uncertainty": "0,1",
                    "unit": "g",
                }
            ],
        },
    )
    assert r.status_code == 201
    body = client.get(f"/api/equipment/{eq_a.id}", headers=auth(admin_a)).json()
    assert body["status"] == "OK"
    assert body["withdrawn_at"] is None


def test_worker_cannot_record_calibration(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    worker = make_user("worker", labs=(lab_a,))
    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=auth(worker),
        json={
            "calibrated_month": "2026-11",
            "vendor": "GUM",
            "result": "OK",
            "points": [{"point": "100 g", "error": "0", "uncertainty": "0,01", "unit": "g"}],
        },
    )
    assert r.status_code == 403
    assert r.json()["error"] == "FORBIDDEN"


def test_calibration_attaches_scan(
    client: TestClient,
    db: Session,
    admin_a: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    headers = auth(admin_a)
    up = client.post(
        "/api/attachments",
        headers=headers,
        files={"file": ("swiadectwo.pdf", SAMPLE_PDF, "application/pdf")},
    )
    att_id = up.json()["id"]

    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=headers,
        json={
            "calibrated_month": "2026-11",
            "vendor": "GUM",
            "result": "OK",
            "points": [{"point": "500 g", "error": "0,001", "uncertainty": "0,002", "unit": "g"}],
            "attachment_ids": [att_id],
        },
    )
    assert r.status_code == 201
    assert r.json()["attachment_ids"] == [att_id]

    att = db.get(Attachment, att_id)
    assert att is not None
    assert att.owner_type == "calibration"
    assert att.owner_id == r.json()["id"]
    assert att.lab_id == eq_a.lab_id


def test_calibration_on_withdrawn_equipment_keeps_it_withdrawn(
    client: TestClient,
    admin_a: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    headers = auth(admin_a)
    client.post(
        f"/api/equipment/{eq_a.id}/withdraw",
        headers=headers,
        json={"reason": "Wysłane do naprawy"},
    )
    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=headers,
        json={
            "calibrated_month": "2026-11",
            "vendor": "GUM",
            "result": "OK",
            "points": [{"point": "500 g", "error": "0", "uncertainty": "0,001", "unit": "g"}],
        },
    )
    assert r.status_code == 201
    body = client.get(f"/api/equipment/{eq_a.id}", headers=headers).json()
    assert body["status"] == "WITHDRAWN"


def test_invalid_calibration_point_number_is_422(
    client: TestClient,
    admin_a: Any,
    eq_a: Equipment,
    auth: Any,
) -> None:
    r = client.post(
        f"/api/equipment/{eq_a.id}/calibrations",
        headers=auth(admin_a),
        json={
            "calibrated_month": "2026-11",
            "vendor": "GUM",
            "result": "OK",
            "points": [{"point": "500 g", "error": "abc", "uncertainty": "0,001", "unit": "g"}],
        },
    )
    assert r.status_code == 422
    assert r.json()["error"] == "INVALID_NUMBER"
