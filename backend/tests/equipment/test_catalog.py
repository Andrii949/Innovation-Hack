from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.mark.req("F1", "17025-6.4.13")
def test_catalog_auto_seeds_leco_and_lab_presets(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_p = make_lab("P", name="Paliw")
    worker_p = make_user("worker", labs=(lab_p,))
    headers = auth(worker_p)

    all_res = client.get("/api/equipment-catalog", headers=headers)
    assert all_res.status_code == 200
    all_items = all_res.json()
    assert len(all_items) >= 18

    leco_res = client.get("/api/equipment-catalog?manufacturer=LECO", headers=headers)
    assert leco_res.status_code == 200
    leco_models = {item["model"] for item in leco_res.json()}
    assert {
        "AC600",
        "SC628",
        "SC832",
        "SC632",
        "CHN628",
        "CHN828",
        "TGA801",
        "TGA701",
        "AMA254",
    }.issubset(leco_models)

    # Phonetic / alias search ("ACO600", "CHN", "TGA") also finds matching LECO presets
    aco_search = client.get("/api/equipment-catalog?q=ACO600", headers=headers)
    assert aco_search.status_code == 200
    assert any(item["model"] == "AC600" for item in aco_search.json())

    tga_search = client.get("/api/equipment-catalog?q=TGA", headers=headers)
    assert tga_search.status_code == 200
    assert {item["model"] for item in tga_search.json()} >= {"TGA701", "TGA801"}


@pytest.mark.req("F1", "17025-6.4.13")
def test_create_equipment_from_catalog_preset_with_and_without_overrides(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_p = make_lab("P", name="Paliw")
    admin = make_user("admin", all_labs=True)
    headers = auth(admin)

    ac600 = client.get("/api/equipment-catalog?q=AC600", headers=headers).json()[0]
    detail = client.get(f"/api/equipment-catalog/{ac600['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["manufacturer"] == "LECO"

    # 1) Create straight from catalog preset without typing technical specs manually
    r1 = client.post(
        "/api/equipment",
        headers=headers,
        json={
            "lab_id": lab_p.id,
            "number": "305",
            "catalog_id": ac600["id"],
        },
    )
    assert r1.status_code == 201
    b1 = r1.json()
    assert b1["code"] == "305/P"
    assert b1["manufacturer"] == "LECO"
    assert b1["model"] == "AC600"
    assert b1["software_version"] == "Cornerstone"
    assert b1["calibration_mode"] == "ON_SITE"
    assert b1["calibration_interval_months"] == 12
    assert b1["lead_months"] == 2
    assert b1["acceptance_criteria"] is not None

    # 2) Select from catalog AND customize fields before saving
    r2 = client.post(
        "/api/equipment",
        headers=headers,
        json={
            "lab_id": lab_p.id,
            "number": "306",
            "catalog_id": ac600["id"],
            "name": "Nowy analizator AC600",
            "serial_no": "LECO-AC600-2026",
            "location": "Pracownia P - stanowisko kalorymetryczne 2",
            "lead_months": 3,
            "last_calibrated_month": "2026-10",
        },
    )
    assert r2.status_code == 201
    b2 = r2.json()
    assert b2["code"] == "306/P"
    assert b2["name"] == "Nowy analizator AC600"
    assert b2["manufacturer"] == "LECO"
    assert b2["model"] == "AC600"
    assert b2["serial_no"] == "LECO-AC600-2026"
    assert b2["location"] == "Pracownia P - stanowisko kalorymetryczne 2"
    assert b2["lead_months"] == 3
    assert b2["next_due_month"] == "2027-10"
    assert b2["status"] == "OK"


@pytest.mark.req("F1")
def test_manual_entry_without_catalog_requires_name(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    headers = auth(admin)

    missing_name = client.post(
        "/api/equipment",
        headers=headers,
        json={"lab_id": lab_a.id, "number": "901", "calibration_interval_months": 12},
    )
    assert missing_name.status_code == 422
    assert missing_name.json()["error"] == "VALIDATION_ERROR"

    manual_ok = client.post(
        "/api/equipment",
        headers=headers,
        json={
            "lab_id": lab_a.id,
            "number": "901",
            "name": "Urządzenie niestandardowe wpisane ręcznie",
            "manufacturer": "Własne",
            "calibration_interval_months": 12,
        },
    )
    assert manual_ok.status_code == 201
    assert manual_ok.json()["name"] == "Urządzenie niestandardowe wpisane ręcznie"


@pytest.mark.req("F1")
def test_admin_manages_catalog_and_worker_cannot(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    worker = make_user("worker", labs=(lab_a,))
    admin = make_user("admin", all_labs=True)

    denied = client.post(
        "/api/equipment-catalog",
        headers=auth(worker),
        json={
            "name": "Analizator testowy",
            "category": "Analizatory",
            "manufacturer": "LECO",
            "model": "CS844",
            "calibration_interval_months": 12,
        },
    )
    assert denied.status_code == 403
    assert denied.json()["error"] == "FORBIDDEN"

    created = client.post(
        "/api/equipment-catalog",
        headers=auth(admin),
        json={
            "name": "Analizator niestandardowy do pilotażu",
            "category": "Analizatory elementarne",
            "manufacturer": "LECO",
            "model": "ONH836-Custom",
            "software_version": "Cornerstone",
            "suggested_lab_code": "P",
            "calibration_mode": "ON_SITE",
            "calibration_interval_months": 12,
            "lead_months": 2,
        },
    )
    assert created.status_code == 201
    cat_id = created.json()["id"]

    patched = client.patch(
        f"/api/equipment-catalog/{cat_id}",
        headers=auth(admin),
        json={"lead_months": 3, "active": False},
    )
    assert patched.status_code == 200
    assert patched.json()["lead_months"] == 3
    assert patched.json()["active"] is False

    active_list = client.get("/api/equipment-catalog?q=ONH836-Custom", headers=auth(admin)).json()
    assert active_list == []

    all_list = client.get(
        "/api/equipment-catalog?q=ONH836-Custom&include_inactive=true",
        headers=auth(admin),
    ).json()
    assert len(all_list) == 1
    assert all_list[0]["id"] == cat_id
