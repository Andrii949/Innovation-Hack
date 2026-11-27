from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from app.auth.models import Role, User
from app.results.models import TestParameter, TestResult
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

WARSAW = ZoneInfo("Europe/Warsaw")
MakeUser = Callable[..., User]
MakeParameter = Callable[..., TestParameter]
Auth = Callable[[User], dict[str, str]]
AddResult = Callable[[TestParameter, str, datetime], TestResult]


@pytest.fixture
def add_result(db: Session, make_user: MakeUser) -> AddResult:
    author = make_user("worker", all_labs=True)

    def _add(param: TestParameter, value: str, at: datetime) -> TestResult:
        result = TestResult(
            parameter_id=param.id,
            sample_label=f"Próbka {at:%d.%m %H:%M}",
            value=Decimal(value),
            min_snapshot=param.min_value,
            max_snapshot=param.max_value,
            in_range=True,
            created_by=author.id,
            created_at=at,
        )
        db.add(result)
        db.flush()
        return result

    return _add


def get_series(
    client: TestClient, headers: dict[str, str], param: TestParameter, date_from: str, date_to: str
) -> dict[str, Any]:
    response = client.get(
        "/api/test-results/series",
        headers=headers,
        params={"parameter_id": param.id, "from": date_from, "to": date_to},
    )
    assert response.status_code == 200
    return response.json()


def test_series_uses_range_when_no_verify_threshold(
    client: TestClient,
    make_parameter: MakeParameter,
    add_result: AddResult,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    so3 = make_parameter()
    add_result(so3, "1.5", datetime(2026, 11, 2, 9, tzinfo=WARSAW))
    add_result(so3, "3.35", datetime(2026, 11, 3, 9, tzinfo=WARSAW))

    body = get_series(
        client, auth(make_user("manager", all_labs=True)), so3, "2026-11-01", "2026-11-27"
    )

    assert (body["threshold_min"], body["threshold_max"]) == ("0.10", "3.20")
    assert body["count"] == 2
    assert body["out_of_threshold"] == 1


def test_verify_threshold_overrides_range(
    client: TestClient,
    make_parameter: MakeParameter,
    add_result: AddResult,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    admin = make_user("admin", all_labs=True)
    so3 = make_parameter()
    for day, value in ((2, "1.0"), (3, "2.6"), (4, "2.8"), (5, "3.0")):
        add_result(so3, value, datetime(2026, 11, day, 9, tzinfo=WARSAW))

    patched = client.patch(
        f"/api/test-parameters/{so3.id}", headers=auth(admin), json={"verify_max": "2.50"}
    )
    body = get_series(client, auth(admin), so3, "2026-11-01", "2026-11-27")

    assert patched.json()["verify_max"] == "2.50"
    assert (body["threshold_min"], body["threshold_max"]) == ("0.10", "2.50")
    assert body["out_of_threshold"] == 3
    assert [p["status"] for p in body["points"]] == ["IN_RANGE", "ABOVE", "ABOVE", "ABOVE"]


def test_points_sorted_and_period_inclusive(
    client: TestClient,
    make_parameter: MakeParameter,
    add_result: AddResult,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    so3 = make_parameter()
    add_result(so3, "2.0", datetime(2026, 11, 27, 23, 30, tzinfo=WARSAW))
    add_result(so3, "1.0", datetime(2026, 11, 1, 0, 30, tzinfo=WARSAW))
    add_result(so3, "9.9", datetime(2026, 10, 31, 23, 30, tzinfo=WARSAW))
    add_result(so3, "9.9", datetime(2026, 11, 28, 0, 10, tzinfo=WARSAW))

    body = get_series(
        client, auth(make_user("worker", all_labs=True)), so3, "2026-11-01", "2026-11-27"
    )

    assert [p["value"] for p in body["points"]] == ["1.0", "2.0"]


def test_from_after_to_is_422(
    client: TestClient, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    response = client.get(
        "/api/test-results/series",
        headers=auth(make_user("admin", all_labs=True)),
        params={"parameter_id": make_parameter().id, "from": "2026-11-27", "to": "2026-11-01"},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_role_without_result_read_is_403(
    client: TestClient, db: Session, make_parameter: MakeParameter, make_user: MakeUser, auth: Auth
) -> None:
    viewer = make_user("worker", all_labs=True)
    no_rights = Role(name="no-results", permissions=[])
    db.add(no_rights)
    db.flush()
    viewer.role_id = no_rights.id
    db.flush()
    db.refresh(viewer)

    response = client.get(
        "/api/test-results/series",
        headers=auth(viewer),
        params={"parameter_id": make_parameter().id, "from": "2026-11-01", "to": "2026-11-27"},
    )

    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"
