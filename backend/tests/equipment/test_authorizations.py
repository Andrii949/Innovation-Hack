from typing import Any

from fastapi.testclient import TestClient


def test_put_replaces_list(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    u1 = make_user("worker", labs=(lab_a,))
    u2 = make_user("worker", labs=(lab_a,))
    eq = make_equipment(lab_a, number="121")

    r1 = client.put(
        f"/api/equipment/{eq.id}/authorized-users",
        headers=auth(admin),
        json={"user_ids": [u1.id, u2.id]},
    )
    assert r1.status_code == 200
    assert {u["id"] for u in r1.json()} == {u1.id, u2.id}

    r2 = client.put(
        f"/api/equipment/{eq.id}/authorized-users",
        headers=auth(admin),
        json={"user_ids": [u2.id]},
    )
    assert r2.status_code == 200
    assert [u["id"] for u in r2.json()] == [u2.id]

    got = client.get(f"/api/equipment/{eq.id}/authorized-users", headers=auth(admin))
    assert got.status_code == 200
    assert [u["id"] for u in got.json()] == [u2.id]


def test_user_without_lab_in_scope_is_422(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    admin = make_user("admin", all_labs=True)
    worker_w = make_user("worker", labs=(lab_w,))
    eq_a = make_equipment(lab_a, number="121")

    res = client.put(
        f"/api/equipment/{eq_a.id}/authorized-users",
        headers=auth(admin),
        json={"user_ids": [worker_w.id]},
    )
    assert res.status_code == 422
    assert res.json()["error"] == "USER_NOT_IN_LAB"


def test_worker_cannot_edit_list(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    worker = make_user("worker", labs=(lab_a,))
    eq = make_equipment(lab_a, number="121")

    res = client.put(
        f"/api/equipment/{eq.id}/authorized-users",
        headers=auth(worker),
        json={"user_ids": [worker.id]},
    )
    assert res.status_code == 403
    assert res.json()["error"] == "FORBIDDEN"


def test_card_can_write_follows_list(
    client: TestClient,
    make_lab: Any,
    make_user: Any,
    make_equipment: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", all_labs=True)
    worker = make_user("worker", labs=(lab_a,))
    eq = make_equipment(lab_a, number="121")

    before = client.get(f"/api/equipment/by-qr/{eq.public_id}", headers=auth(worker)).json()
    assert before["can_write"] is False

    client.put(
        f"/api/equipment/{eq.id}/authorized-users",
        headers=auth(admin),
        json={"user_ids": [worker.id]},
    )

    after = client.get(f"/api/equipment/by-qr/{eq.public_id}", headers=auth(worker)).json()
    assert after["can_write"] is True
