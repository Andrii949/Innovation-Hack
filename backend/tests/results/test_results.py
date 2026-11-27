from collections.abc import Callable
from typing import Any

import httpx2
from app.audit.models import AuditLog
from app.auth.models import User
from app.results.models import TestParameter, TestResult
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

MakeUser = Callable[..., User]
MakeParameter = Callable[..., TestParameter]
Auth = Callable[[User], dict[str, str]]


def post_result(
    client: TestClient, headers: dict[str, str], parameter: TestParameter, value: str, **extra: Any
) -> httpx2.Response:
    body = {"parameter_id": parameter.id, "sample_label": "Próbka 1", "value": value, **extra}
    return client.post("/api/test-results", headers=headers, json=body)


def test_in_range_result_is_saved(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    response = post_result(
        client, auth(make_user("worker", all_labs=True)), make_parameter(), "2,5"
    )

    assert response.status_code == 201
    assert response.json()["in_range"] is True
    assert response.json()["value"] == "2.5"


def test_flag_mode_saves_out_of_range_result(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    response = post_result(
        client, auth(make_user("worker", all_labs=True)), make_parameter(), "3,35"
    )

    assert response.status_code == 201
    body = response.json()
    assert body["in_range"] is False
    assert (body["min_snapshot"], body["max_snapshot"]) == ("0.10", "3.20")


def test_block_mode_rejects_and_logs(
    client: TestClient,
    db: Session,
    make_parameter: MakeParameter,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    worker = make_user("worker", all_labs=True)
    response = post_result(client, auth(worker), make_parameter(action="BLOCK"), "3,35")

    assert response.status_code == 422
    assert response.json()["error"] == "OUT_OF_RANGE"
    assert db.scalar(select(func.count()).select_from(TestResult)) == 0
    rejects = db.scalars(
        select(AuditLog).where(AuditLog.action == "reject", AuditLog.entity == "test_result")
    ).all()
    assert len(rejects) == 1
    assert rejects[0].user_id == worker.id
    assert rejects[0].after is not None
    assert rejects[0].after["value"] == "3,35"


def test_global_setting_block_applies_when_parameter_has_no_action(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    admin = make_user("admin", all_labs=True)
    client.put("/api/settings", headers=auth(admin), json={"out_of_range_action": "BLOCK"})

    response = post_result(client, auth(admin), make_parameter(), "0,01")

    assert response.status_code == 422
    assert response.json()["error"] == "OUT_OF_RANGE"


def test_parameter_without_range_accepts_any_value(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    consistency = make_parameter(
        name="konsystencja zaczynów normowych", unit="mm", min_value=None, max_value=None
    )
    response = post_result(client, auth(make_user("worker", all_labs=True)), consistency, "999")

    assert response.status_code == 201
    assert response.json()["in_range"] is True


def test_snapshot_survives_range_change(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    admin = make_user("admin", all_labs=True)
    param = make_parameter()
    first = post_result(client, auth(admin), param, "3,00").json()

    patched = client.patch(
        f"/api/test-parameters/{param.id}", headers=auth(admin), json={"max_value": "3.50"}
    )
    listed = client.get(
        "/api/test-results", headers=auth(admin), params={"parameter_id": param.id}
    ).json()

    assert patched.status_code == 200
    assert patched.json()["max_value"] == "3.50"
    assert [r["max_snapshot"] for r in listed if r["id"] == first["id"]] == ["3.20"]


def test_repeat_links_previous_result(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    headers = auth(make_user("worker", all_labs=True))
    param = make_parameter()
    first = post_result(client, headers, param, "3,35").json()

    repeat = post_result(client, headers, param, "3,10", repeat_of_id=first["id"])

    assert repeat.status_code == 201
    assert repeat.json()["repeat_of_id"] == first["id"]


def test_repeat_of_another_parameter_is_422(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    headers = auth(make_user("worker", all_labs=True))
    so3 = make_parameter()
    cao = make_parameter(name="CaO", min_value="43.50", max_value="66.00")
    first = post_result(client, headers, so3, "2,00").json()

    response = post_result(client, headers, cao, "50,00", repeat_of_id=first["id"])

    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_invalid_number_is_422(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    response = post_result(
        client, auth(make_user("worker", all_labs=True)), make_parameter(), "abc"
    )

    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_NUMBER"


def test_manager_cannot_record_result(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    response = post_result(client, auth(make_user("manager", all_labs=True)), make_parameter(), "2")

    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


def test_worker_cannot_create_parameter(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    response = client.post(
        "/api/test-parameters",
        headers=auth(make_user("worker", all_labs=True)),
        json={"name": "SO₃", "unit": "%", "min_value": "0.10", "max_value": "3.20"},
    )

    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


def test_parameter_min_above_max_is_422(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    response = client.post(
        "/api/test-parameters",
        headers=auth(make_user("admin", all_labs=True)),
        json={"name": "SO₃", "unit": "%", "min_value": "3.20", "max_value": "0.10"},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


CSV = (
    "material,name,unit,min_value,max_value,method,accredited\n"
    "Cement,zawartość SO₃,%,0.10,3.20,wagowa PN-EN 196-2:2026-04,false\n"
    "Cement,konsystencja zaczynów normowych,-,,,aparat Vicat'a PN-EN 196-3:2016-12,true\n"
)


def test_import_csv_counts_rows_and_keeps_ranges(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    headers = auth(make_user("admin", all_labs=True))

    response = client.post(
        "/api/test-parameters/import",
        headers=headers,
        files={"file": ("cement.csv", CSV.encode(), "text/csv")},
    )
    params = {p["name"]: p for p in client.get("/api/test-parameters", headers=headers).json()}

    assert response.status_code == 200
    assert response.json() == {"imported": 2}
    assert params["zawartość SO₃"]["min_value"] == "0.10"
    assert params["konsystencja zaczynów normowych"]["min_value"] is None
    assert params["konsystencja zaczynów normowych"]["accredited"] is True


def test_import_twice_updates_instead_of_duplicating(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    headers = auth(make_user("admin", all_labs=True))
    files = {"file": ("cement.csv", CSV.encode(), "text/csv")}

    client.post("/api/test-parameters/import", headers=headers, files=files)
    client.post("/api/test-parameters/import", headers=headers, files=files)

    assert len(client.get("/api/test-parameters", headers=headers).json()) == 2


def test_import_with_bad_number_reports_row(
    client: TestClient, make_user: MakeUser, auth: Auth
) -> None:
    bad = "material,name,unit,min_value,max_value,method,accredited\nCement,SO₃,%,abc,3.20,,false\n"

    response = client.post(
        "/api/test-parameters/import",
        headers=auth(make_user("admin", all_labs=True)),
        files={"file": ("bad.csv", bad.encode(), "text/csv")},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_NUMBER"
    assert "2" in response.json()["message"]
