from types import SimpleNamespace
from typing import Any

import pytest
from app.auth.permissions import Permission, require, visible_lab_ids
from app.errors import AppError
from fastapi.testclient import TestClient


def test_worker_lacks_admin_permission(make_user: Any) -> None:
    worker = make_user("worker")
    with pytest.raises(AppError) as exc_info:
        require(worker, Permission.SETTINGS_WRITE)
    assert exc_info.value.status_code == 403
    assert exc_info.value.error == "FORBIDDEN"


def test_lab_scope(make_lab: Any, make_user: Any) -> None:
    lab_a = make_lab("A", name="Analityczna")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    worker_a = make_user("worker", labs=(lab_a,))
    admin_all = make_user("admin", all_labs=True)

    assert visible_lab_ids(worker_a) == {lab_a.id}
    assert visible_lab_ids(admin_all) is None

    require(worker_a, Permission.EQUIPMENT_READ, lab_id=lab_a.id)
    with pytest.raises(AppError) as exc_info:
        require(worker_a, Permission.EQUIPMENT_READ, lab_id=lab_w.id)
    assert exc_info.value.status_code == 403
    assert exc_info.value.error == "LAB_OUT_OF_SCOPE"

    require(admin_all, Permission.EQUIPMENT_READ, lab_id=lab_w.id)


def test_check_write_requires_list_for_worker(make_lab: Any, make_user: Any) -> None:
    lab_a = make_lab("A")
    worker = make_user("worker", labs=(lab_a,))

    unauthorized_eq = SimpleNamespace(lab_id=lab_a.id, authorized_user_ids=set())
    with pytest.raises(AppError) as exc_info:
        require(worker, Permission.CHECK_WRITE, equipment=unauthorized_eq)
    assert exc_info.value.status_code == 403
    assert exc_info.value.error == "NOT_AUTHORIZED_FOR_EQUIPMENT"

    authorized_eq = SimpleNamespace(lab_id=lab_a.id, authorized_user_ids={worker.id})
    require(worker, Permission.CHECK_WRITE, equipment=authorized_eq)


def test_admin_writes_checks_without_list(make_lab: Any, make_user: Any) -> None:
    lab_a = make_lab("A")
    admin = make_user("admin", labs=(lab_a,))
    eq = SimpleNamespace(lab_id=lab_a.id, authorized_user_ids=set())
    require(admin, Permission.CHECK_WRITE, equipment=eq)


def test_audit_endpoint_admin_only(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    worker = make_user("worker")
    admin = make_user("admin", all_labs=True)
    manager = make_user("manager", all_labs=True)

    res_worker = client.get("/api/audit", headers=auth(worker))
    assert res_worker.status_code == 403
    assert res_worker.json()["error"] == "FORBIDDEN"

    res_admin = client.get("/api/audit", headers=auth(admin))
    assert res_admin.status_code == 200

    res_manager = client.get("/api/audit", headers=auth(manager))
    assert res_manager.status_code == 200
