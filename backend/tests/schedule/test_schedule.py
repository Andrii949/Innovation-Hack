from typing import Any

from fastapi.testclient import TestClient


def test_overdue_first_and_ok_hidden(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    for number, month in (("1", "2026-03"), ("2", "2025-12"), ("3", "2025-10")):
        make_equipment(lab_a, number=number, interval=12, lead=1, last_calibrated_month=month)

    items = client.get("/api/schedule", headers=auth(admin)).json()
    assert [(i["label"].split()[0], i["status"]) for i in items] == [
        ("3/A", "OVERDUE"),
        ("2/A", "DUE_SOON"),
    ]


def test_include_ok_returns_all_three(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    for number, month in (("1", "2026-03"), ("2", "2025-12"), ("3", "2025-10")):
        make_equipment(lab_a, number=number, interval=12, lead=1, last_calibrated_month=month)

    items = client.get("/api/schedule?include_ok=true", headers=auth(admin)).json()
    assert [(i["label"].split()[0], i["status"]) for i in items] == [
        ("3/A", "OVERDUE"),
        ("2/A", "DUE_SOON"),
        ("1/A", "OK"),
    ]


def test_lab_scope_hides_other_labs(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    worker_a = make_user("worker", labs=(lab_a,))
    make_equipment(lab_a, number="10", interval=12, lead=1, last_calibrated_month="2025-10")
    make_equipment(lab_w, number="10", interval=12, lead=1, last_calibrated_month="2025-10")

    items = client.get("/api/schedule", headers=auth(worker_a)).json()
    assert [i["label"].split()[0] for i in items] == ["10/A"]


def test_withdrawn_equipment_not_listed(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    eq = make_equipment(lab_a, number="99", interval=12, lead=1, last_calibrated_month="2025-10")
    client.post(
        f"/api/equipment/{eq.id}/withdraw",
        headers=auth(admin),
        json={"reason": "Zezłomowane"},
    )

    items = client.get("/api/schedule", headers=auth(admin)).json()
    assert items == []


def test_check_item_counts_from_last_record(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    make_check_plan: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    eq = make_equipment(
        lab_a,
        number="77",
        name="Termohigrometr",
        calibration_required=False,
    )
    plan = make_check_plan(
        eq,
        [{"key": "temp", "label": "Temp", "type": "number", "required": True}],
        interval=1,
        lead=0,
        name="Kontrola temperatury",
    )
    rec = client.post(
        f"/api/check-plans/{plan.id}/records",
        headers=auth(admin),
        json={"performed_on": "2026-10-05", "values": {"temp": "20"}},
    )
    assert rec.status_code == 201

    items = client.get("/api/schedule?kind=CHECK", headers=auth(admin)).json()
    assert len(items) == 1
    item = items[0]
    assert item["kind"] == "CHECK"
    assert item["due"] == "2026-11-01"
    assert item["valid_until"] == "2026-11-30"
    assert item["status"] == "DUE_SOON"
