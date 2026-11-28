import shutil
import subprocess
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from app.auth.models import User
from app.notifications.models import Notification
from app.results.models import TestParameter, TestResult
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

WARSAW = ZoneInfo("Europe/Warsaw")
MakeUser = Callable[..., User]
MakeParameter = Callable[..., TestParameter]
Auth = Callable[[User], dict[str, str]]
PERIOD = {"period_from": "2026-11-01", "period_to": "2026-11-27"}


def pdf_text(pdf: bytes) -> str:
    pdftotext = shutil.which("pdftotext")
    assert pdftotext is not None, "pdftotext (poppler-utils) is required for PDF tests"
    result = subprocess.run(  # noqa: S603  # fixed argv, PDF bytes on stdin, no shell
        [pdftotext, "-layout", "-", "-"], input=pdf, capture_output=True, check=True
    )
    return result.stdout.decode()


@pytest.fixture
def admin(make_user: MakeUser) -> User:
    return make_user("admin", all_labs=True)


@pytest.fixture
def manager(make_user: MakeUser) -> User:
    return make_user("manager", all_labs=True)


@pytest.fixture
def so3_with_results(db: Session, make_parameter: MakeParameter, admin: User) -> TestParameter:
    so3 = make_parameter()
    for day, value in ((3, "1.50"), (10, "3.35"), (20, "2.10")):
        db.add(
            TestResult(
                parameter_id=so3.id,
                sample_label=f"Próbka {day}",
                value=Decimal(value),
                min_snapshot=so3.min_value,
                max_snapshot=so3.max_value,
                in_range=value != "3.35",
                created_by=admin.id,
                created_at=datetime(2026, 11, day, 9, tzinfo=WARSAW),
            )
        )
    db.flush()
    return so3


def create_report(client: TestClient, headers: dict[str, str], **body: Any) -> dict[str, Any]:
    response = client.post("/api/reports", headers=headers, json={**PERIOD, **body})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.req("F11")
@pytest.mark.usefixtures("so3_with_results")
def test_create_report_returns_pdf(
    client: TestClient, admin: User, manager: User, auth: Auth
) -> None:
    report = create_report(client, auth(admin))

    response = client.get(f"/api/reports/{report['id']}.pdf", headers=auth(manager))

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    text = pdf_text(response.content)
    assert "SO₃" in text
    assert "01.11.2026" in text
    assert "27.11.2026" in text
    assert "poza progiem: 1" in text


@pytest.mark.req("F11")
@pytest.mark.usefixtures("so3_with_results")
def test_manager_gets_report_ready_notification(
    client: TestClient, db: Session, admin: User, manager: User, auth: Auth
) -> None:
    report = create_report(client, auth(admin))

    notes = db.scalars(select(Notification).where(Notification.user_id == manager.id)).all()
    assert [(n.kind, n.ref_type, n.ref_id) for n in notes] == [
        ("REPORT_READY", "report", report["id"])
    ]


def test_empty_parameter_list_takes_parameters_with_results(
    client: TestClient,
    so3_with_results: TestParameter,
    make_parameter: MakeParameter,
    admin: User,
    auth: Auth,
) -> None:
    make_parameter(name="CaO", min_value="43.50", max_value="66.00")

    report = create_report(client, auth(admin), parameter_ids=[])

    assert report["parameter_ids"] == [so3_with_results.id]


def test_listed_reports_link_their_pdf(
    client: TestClient, so3_with_results: TestParameter, admin: User, manager: User, auth: Auth
) -> None:
    report = create_report(client, auth(admin), parameter_ids=[so3_with_results.id])

    listed = client.get("/api/reports", headers=auth(manager)).json()

    assert [(r["id"], r["pdf_url"]) for r in listed] == [
        (report["id"], f"/api/reports/{report['id']}.pdf")
    ]


@pytest.mark.usefixtures("so3_with_results")
def test_worker_cannot_create_or_download_report(
    client: TestClient, admin: User, make_user: MakeUser, auth: Auth
) -> None:
    worker = make_user("worker", all_labs=True)
    report = create_report(client, auth(admin))

    created = client.post("/api/reports", headers=auth(worker), json=PERIOD)
    downloaded = client.get(f"/api/reports/{report['id']}.pdf", headers=auth(worker))

    assert created.status_code == 403
    assert created.json()["error"] == "FORBIDDEN"
    assert downloaded.status_code == 403


def test_period_from_after_to_is_422(client: TestClient, admin: User, auth: Auth) -> None:
    response = client.post(
        "/api/reports",
        headers=auth(admin),
        json={"period_from": "2026-11-27", "period_to": "2026-11-01"},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "VALIDATION_ERROR"


def test_unknown_parameter_is_404(client: TestClient, admin: User, auth: Auth) -> None:
    response = client.post(
        "/api/reports", headers=auth(admin), json={**PERIOD, "parameter_ids": [999999]}
    )

    assert response.status_code == 404
    assert response.json()["error"] == "NOT_FOUND"


def test_report_scopes_parameters_and_pdf_by_lab(
    client: TestClient,
    db: Session,
    make_lab: Callable[..., Any],
    make_equipment: Callable[..., Any],
    make_parameter: MakeParameter,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    eq_w = make_equipment(lab_w, number="201")
    param_w = make_parameter(
        name="Wytrzymałość 28d",
        unit="MPa",
        min_value="42.5",
        max_value="62.5",
    )
    admin_a = make_user("admin", labs=[lab_a])
    admin_w = make_user("admin", labs=[lab_w])

    db.add(
        TestResult(
            parameter_id=param_w.id,
            equipment_id=eq_w.id,
            sample_label="W-01",
            value=Decimal("50.0"),
            min_snapshot=param_w.min_value,
            max_snapshot=param_w.max_value,
            in_range=True,
            created_by=admin_w.id,
            created_at=datetime(2026, 11, 10, 9, tzinfo=WARSAW),
        )
    )
    db.flush()

    report_a = create_report(client, auth(admin_a), parameter_ids=[])
    assert report_a["parameter_ids"] == []

    report_w = create_report(client, auth(admin_w), parameter_ids=[])
    assert report_w["parameter_ids"] == [param_w.id]

    pdf_res = client.get(f"/api/reports/{report_w['id']}.pdf", headers=auth(admin_a))
    assert pdf_res.status_code == 403
    assert [r["id"] for r in client.get("/api/reports", headers=auth(admin_a)).json()] == [
        report_a["id"]
    ]
