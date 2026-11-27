from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import pytest
from app.notifications.service import generate_notifications
from app.seed import seed
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

TODAY = date(2026, 11, 27)


@dataclass(frozen=True)
class DemoAuthHeaders:
    admin: dict[str, str]
    manager: dict[str, str]
    worker: dict[str, str]


def _login_headers(client: TestClient, *, login: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"login": login, "password": password, "device_info": "E2E TestClient"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def demo_headers(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> DemoAuthHeaders:
    passwords = {
        "SEED_ADMIN_PASSWORD": "e2e-admin-password-2026",
        "SEED_MANAGER_PASSWORD": "e2e-manager-password-2026",
        "SEED_WORKER_PASSWORD": "e2e-worker-password-2026",
    }
    for env_key, value in passwords.items():
        monkeypatch.setenv(env_key, value)

    seed(db, today=TODAY)
    db.flush()

    return DemoAuthHeaders(
        admin=_login_headers(client, login="admin", password=passwords["SEED_ADMIN_PASSWORD"]),
        manager=_login_headers(
            client, login="kierownik", password=passwords["SEED_MANAGER_PASSWORD"]
        ),
        worker=_login_headers(client, login="laborant", password=passwords["SEED_WORKER_PASSWORD"]),
    )


@pytest.mark.req("F3", "F5", "F6", "F7", "17025-6.4.10")
def test_e2e_mobile_login_push_fid_qr_check_and_access_control(
    client: TestClient,
    demo_headers: DemoAuthHeaders,
) -> None:
    reg_res = client.post(
        "/api/devices",
        headers=demo_headers.worker,
        json={"platform": "android", "fid": "fid-warta-android-01"},
    )
    assert reg_res.status_code == 204

    card_res = client.get("/api/equipment/by-qr/CWA000122A", headers=demo_headers.worker)
    assert card_res.status_code == 200
    card = card_res.json()
    assert card["can_write"] is True
    assert len(card["check_plans"]) == 1
    plan_id = card["check_plans"][0]["id"]
    env_template_id = card["check_plans"][0]["form_template_id"]

    rec_res = client.post(
        f"/api/check-plans/{plan_id}/records",
        headers=demo_headers.worker,
        json={
            "performed_on": "2026-11-27",
            "values": {"temperature_c": "23,5", "humidity_pct": "52"},
        },
    )
    assert rec_res.status_code == 201, rec_res.text
    rec_body = rec_res.json()
    assert rec_body["out_of_range"] is True

    notif_res = client.get(
        "/api/notifications", params={"unread": "true"}, headers=demo_headers.admin
    )
    assert notif_res.status_code == 200
    assert any(
        n["kind"] == "CHECK_OUT_OF_RANGE" and n["ref_id"] == rec_body["id"] and n["read_at"] is None
        for n in notif_res.json()
    )

    unauth_card = client.get("/api/equipment/by-qr/CWA000124A", headers=demo_headers.worker)
    assert unauth_card.status_code == 200
    assert unauth_card.json()["can_write"] is False
    eq_124_id = unauth_card.json()["id"]

    plan_124_res = client.post(
        f"/api/equipment/{eq_124_id}/check-plans",
        headers=demo_headers.admin,
        json={
            "name": "Kontrola wzorca",
            "interval_months": 3,
            "form_template_id": env_template_id,
        },
    )
    assert plan_124_res.status_code == 201, plan_124_res.text
    plan_124_id = plan_124_res.json()["id"]

    unauth_rec = client.post(
        f"/api/check-plans/{plan_124_id}/records",
        headers=demo_headers.worker,
        json={
            "performed_on": "2026-11-27",
            "values": {"temperature_c": "20,0", "humidity_pct": "50"},
        },
    )
    assert unauth_rec.status_code == 403
    assert unauth_rec.json()["error"] == "NOT_AUTHORIZED_FOR_EQUIPMENT"

    withdraw_res = client.post(
        f"/api/equipment/{card['id']}/withdraw",
        headers=demo_headers.admin,
        json={"reason": "Serwis"},
    )
    assert withdraw_res.status_code == 200
    assert withdraw_res.json()["status"] == "WITHDRAWN"

    withdrawn_rec = client.post(
        f"/api/check-plans/{plan_id}/records",
        headers=demo_headers.worker,
        json={
            "performed_on": "2026-11-27",
            "values": {"temperature_c": "20,0", "humidity_pct": "50"},
        },
    )
    assert withdrawn_rec.status_code == 409
    assert withdrawn_rec.json()["error"] == "EQUIPMENT_WITHDRAWN"

    logout_res = client.post("/api/auth/logout", headers=demo_headers.worker)
    assert logout_res.status_code == 200
    assert client.get("/api/me", headers=demo_headers.worker).status_code == 401


@pytest.mark.req("F1", "F2", "F4", "17025-6.4.8", "17025-6.4.9", "17025-6.4.13")
def test_e2e_calibration_recovery_nok_withdrawal_and_history_pdf(
    client: TestClient,
    demo_headers: DemoAuthHeaders,
) -> None:
    eq_list = client.get("/api/equipment", headers=demo_headers.admin)
    assert eq_list.status_code == 200
    by_code = {item["code"]: item for item in eq_list.json()}

    overdue_eq = by_code["127/A"]
    assert overdue_eq["status"] == "OVERDUE"

    ok_cal = client.post(
        f"/api/equipment/{overdue_eq['id']}/calibrations",
        headers=demo_headers.admin,
        json={
            "calibrated_month": "2026-11",
            "vendor": "Shimadzu Polska",
            "certificate_no": "SW/2026/A127-NEW",
            "adjustments": "Brak",
            "result": "OK",
            "points": [{"point": "412 nm", "error": "0,15", "uncertainty": "0,40", "unit": "nm"}],
        },
    )
    assert ok_cal.status_code == 201, ok_cal.text

    refreshed_127 = client.get(f"/api/equipment/{overdue_eq['id']}", headers=demo_headers.admin)
    assert refreshed_127.status_code == 200
    assert refreshed_127.json()["status"] == "OK"
    assert refreshed_127.json()["next_due_month"] == "2027-11"

    pdf_res = client.get(
        f"/api/equipment/{overdue_eq['id']}/history.pdf",
        headers=demo_headers.admin,
    )
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")

    active_eq = by_code["126/A"]
    nok_cal = client.post(
        f"/api/equipment/{active_eq['id']}/calibrations",
        headers=demo_headers.admin,
        json={
            "calibrated_month": "2026-11",
            "vendor": "Micromeritics Service PL",
            "certificate_no": "MS/2026/NOK1",
            "result": "NOK",
            "points": [{"point": "10 cm³", "error": "0,25", "uncertainty": "0,05", "unit": "cm³"}],
        },
    )
    assert nok_cal.status_code == 201, nok_cal.text

    refreshed_126 = client.get(f"/api/equipment/{active_eq['id']}", headers=demo_headers.admin)
    assert refreshed_126.status_code == 200
    assert refreshed_126.json()["status"] == "WITHDRAWN"
    assert "Negatywny wynik wzorcowania" in (refreshed_126.json()["withdrawn_reason"] or "")


@pytest.mark.req("F2", "F3", "F8", "17025-7.11.2")
def test_e2e_reagent_low_stock_and_worker_idempotency(
    client: TestClient,
    db: Session,
    demo_headers: DemoAuthHeaders,
) -> None:
    reagents_res = client.get("/api/reagents", headers=demo_headers.worker)
    assert reagents_res.status_code == 200
    target = next(
        r
        for r in reagents_res.json()
        if r["min_stock"] is not None
        and not r["low_stock"]
        and Decimal(r["min_stock"]) > Decimal("10.5")
    )

    count_res = client.post(
        f"/api/reagents/{target['id']}/stock-counts",
        headers=demo_headers.worker,
        json={"quantity": "10,5", "counted_on": "2026-11-27"},
    )
    assert count_res.status_code == 201, count_res.text

    sched_res = client.get(
        "/api/schedule", params={"kind": "LOW_STOCK"}, headers=demo_headers.worker
    )
    assert sched_res.status_code == 200
    assert any(
        item["ref_id"] == target["id"] and item["status"] == "LOW" for item in sched_res.json()
    )

    first_run = generate_notifications(db, today=TODAY)
    second_run = generate_notifications(db, today=TODAY)
    assert first_run > 0
    assert second_run == 0


@pytest.mark.req("F9", "F10", "F11", "17025-7.5.2", "17025-7.11.3")
def test_e2e_cement_results_series_manager_report_and_audit_trail(
    client: TestClient,
    demo_headers: DemoAuthHeaders,
) -> None:
    params_res = client.get("/api/test-parameters", headers=demo_headers.worker)
    assert params_res.status_code == 200
    so3 = next(p for p in params_res.json() if "SO" in p["name"])

    out_res = client.post(
        "/api/test-results",
        headers=demo_headers.worker,
        json={"parameter_id": so3["id"], "sample_label": "CEM-DEMO-1", "value": "3,35"},
    )
    assert out_res.status_code == 201, out_res.text
    out_body = out_res.json()
    assert out_body["in_range"] is False
    assert (out_body["min_snapshot"], out_body["max_snapshot"]) == ("0.10", "3.20")

    bad_res = client.post(
        "/api/test-results",
        headers=demo_headers.worker,
        json={"parameter_id": so3["id"], "sample_label": "CEM-DEMO-BAD", "value": "1,2,3"},
    )
    assert bad_res.status_code == 422
    assert bad_res.json()["error"] == "INVALID_NUMBER"

    series_res = client.get(
        "/api/test-results/series",
        headers=demo_headers.admin,
        params={"parameter_id": so3["id"], "from": "2026-09-01", "to": "2026-11-27"},
    )
    assert series_res.status_code == 200
    assert series_res.json()["out_of_threshold"] >= 1

    report_res = client.post(
        "/api/reports",
        headers=demo_headers.admin,
        json={"period_from": "2026-09-01", "period_to": "2026-11-27", "parameter_ids": []},
    )
    assert report_res.status_code == 201, report_res.text
    report_id = report_res.json()["id"]

    mgr_notes = client.get(
        "/api/notifications", params={"unread": "true"}, headers=demo_headers.manager
    )
    assert mgr_notes.status_code == 200
    assert any(n["kind"] == "REPORT_READY" and n["ref_id"] == report_id for n in mgr_notes.json())

    mgr_pdf = client.get(f"/api/reports/{report_id}.pdf", headers=demo_headers.manager)
    assert mgr_pdf.status_code == 200
    assert mgr_pdf.headers["content-type"] == "application/pdf"
    assert mgr_pdf.content.startswith(b"%PDF")

    mgr_create = client.post(
        "/api/reports",
        headers=demo_headers.manager,
        json={"period_from": "2026-11-01", "period_to": "2026-11-27", "parameter_ids": []},
    )
    assert mgr_create.status_code == 403
    assert mgr_create.json()["error"] == "FORBIDDEN"

    settings_res = client.put(
        "/api/settings",
        headers=demo_headers.admin,
        json={"worker_interval_minutes": 15},
    )
    assert settings_res.status_code == 200
    assert settings_res.json()["worker_interval_minutes"] == 15

    audit_res = client.get(
        "/api/audit",
        headers=demo_headers.admin,
        params={"entity": "setting"},
    )
    assert audit_res.status_code == 200
    assert any(
        row["entity"] == "setting"
        and row["entity_id"] == "worker_interval_minutes"
        and row["user_id"] is not None
        for row in audit_res.json()
    )
