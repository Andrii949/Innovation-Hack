import shutil
import subprocess
from collections.abc import Callable
from datetime import UTC, date, datetime

import pytest
from app.auth.models import Lab, User
from app.equipment.models import CheckPlan, CheckRecord, Equipment
from app.print import service as print_service
from app.print.render import RenderError
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

MakeLab = Callable[..., Lab]
MakeUser = Callable[..., User]
MakeEquipment = Callable[..., Equipment]
Auth = Callable[[User], dict[str, str]]


def pdf_text(pdf: bytes) -> str:
    pdftotext = shutil.which("pdftotext")
    assert pdftotext is not None, "pdftotext (poppler-utils) is required for PDF tests"
    result = subprocess.run(  # noqa: S603  # fixed argv, PDF bytes on stdin, no shell
        [pdftotext, "-layout", "-", "-"], input=pdf, capture_output=True, check=True
    )
    return result.stdout.decode()


@pytest.fixture
def lab_a(make_lab: MakeLab) -> Lab:
    return make_lab("A")


def test_history_pdf_contains_code_calibrations_and_checks(
    client: TestClient,
    db: Session,
    make_equipment: MakeEquipment,
    make_calibration: Callable[..., object],
    make_check_plan: Callable[..., CheckPlan],
    make_user: MakeUser,
    lab_a: Lab,
    auth: Auth,
) -> None:
    eq = make_equipment(lab_a, number="121", name="Waga analityczna", interval=12)
    make_calibration(eq, "2025-12", certificate_no="W/123/2025")
    plan = make_check_plan(eq, [{"key": "temp", "label": "Temperatura", "type": "number"}])
    admin = make_user("admin", labs=[lab_a])
    db.add(
        CheckRecord(
            check_plan_id=plan.id,
            performed_on=date(2026, 11, 5),
            values={"temp": "20.5"},
            out_of_range=False,
            performed_by=admin.id,
        )
    )
    db.flush()

    response = client.get(f"/api/equipment/{eq.id}/history.pdf", headers=auth(admin))

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'inline; filename="121-A.pdf"'
    assert response.content.startswith(b"%PDF")
    text = pdf_text(response.content)
    assert "121/A" in text
    assert "Waga analityczna" in text
    assert "W/123/2025" in text
    assert "12/2026" in text  # next due month
    assert "Zbliża się termin" in text  # status on 27.11.2026
    assert "Temperatura: 20.5" in text


def test_withdrawn_equipment_prints_annotation(
    client: TestClient,
    db: Session,
    make_equipment: MakeEquipment,
    make_user: MakeUser,
    lab_a: Lab,
    auth: Auth,
) -> None:
    eq = make_equipment(lab_a, number="5", name="Termometr szklany")
    eq.withdrawn_at = datetime(2026, 11, 20, tzinfo=UTC)
    eq.withdrawn_reason = "Pęknięta kapilara"
    db.flush()

    response = client.get(
        f"/api/equipment/{eq.id}/history.pdf", headers=auth(make_user("admin", labs=[lab_a]))
    )

    text = pdf_text(response.content)
    assert "WYCOFANE Z UŻYTKU" in text
    assert "Pęknięta kapilara" in text


def test_other_lab_is_403(
    client: TestClient,
    make_equipment: MakeEquipment,
    make_lab: MakeLab,
    make_user: MakeUser,
    lab_a: Lab,
    auth: Auth,
) -> None:
    eq = make_equipment(lab_a)
    worker_w = make_user("worker", labs=[make_lab("W", name="Wytrzymałościowa")])

    response = client.get(f"/api/equipment/{eq.id}/history.pdf", headers=auth(worker_w))

    assert response.status_code == 403
    assert response.json()["error"] == "LAB_OUT_OF_SCOPE"


def test_unknown_equipment_is_404(client: TestClient, make_user: MakeUser, auth: Auth) -> None:
    response = client.get(
        "/api/equipment/999999/history.pdf", headers=auth(make_user("admin", all_labs=True))
    )

    assert response.status_code == 404
    assert response.json()["error"] == "NOT_FOUND"


def test_render_failure_is_500_render_failed(
    client: TestClient,
    make_equipment: MakeEquipment,
    make_user: MakeUser,
    lab_a: Lab,
    auth: Auth,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken_render(_template: str, _data: str) -> bytes:
        msg = "typst exit code 1"
        raise RenderError(msg)

    monkeypatch.setattr(print_service, "render", broken_render)
    eq = make_equipment(lab_a)

    response = client.get(
        f"/api/equipment/{eq.id}/history.pdf", headers=auth(make_user("admin", labs=[lab_a]))
    )

    assert response.status_code == 500
    assert response.json() == {
        "error": "RENDER_FAILED",
        "message": "Nie udało się złożyć dokumentu",
    }
