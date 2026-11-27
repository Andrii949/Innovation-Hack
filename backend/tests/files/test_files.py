import hashlib
from typing import Any

import pytest
from app.errors import AppError
from app.files.service import attach
from app.settings.service import update_settings
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

SAMPLE_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
SAMPLE_PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


def test_upload_jpeg_returns_id_and_sha256(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    worker = make_user("worker")
    response = client.post(
        "/api/attachments",
        headers=auth(worker),
        files={"file": ("karta.jpg", SAMPLE_JPEG, "application/octet-stream")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] > 0
    assert body["content_type"] == "image/jpeg"
    assert body["sha256"] == hashlib.sha256(SAMPLE_JPEG).hexdigest()
    assert body["size_bytes"] == len(SAMPLE_JPEG)


def test_too_large_is_413(
    client: TestClient,
    db: Session,
    make_user: Any,
    auth: Any,
) -> None:
    update_settings(db, {"max_upload_mb": 1})
    db.flush()
    worker = make_user("worker")
    oversized_pdf = SAMPLE_PDF + (b"0" * (1024 * 1024 + 10))
    response = client.post(
        "/api/attachments",
        headers=auth(worker),
        files={"file": ("big.pdf", oversized_pdf, "application/pdf")},
    )
    assert response.status_code == 413
    assert response.json()["error"] == "FILE_TOO_LARGE"


def test_exe_renamed_to_jpg_is_415(
    client: TestClient,
    make_user: Any,
    auth: Any,
) -> None:
    worker = make_user("worker")
    fake_jpg = b"MZ\x90\x00\x03\x00\x00\x00not-a-jpeg"
    response = client.post(
        "/api/attachments",
        headers=auth(worker),
        files={"file": ("evil.jpg", fake_jpg, "image/jpeg")},
    )
    assert response.status_code == 415
    assert response.json()["error"] == "UNSUPPORTED_FILE_TYPE"


def test_cannot_attach_someone_elses_upload(
    client: TestClient,
    db: Session,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    u1 = make_user("worker", labs=(lab_a,))
    u2 = make_user("admin", all_labs=True)

    up = client.post(
        "/api/attachments",
        headers=auth(u1),
        files={"file": ("scan.pdf", SAMPLE_PDF, "application/pdf")},
    )
    att_id = up.json()["id"]

    with pytest.raises(AppError) as exc_info:
        attach(db, u2, [att_id], owner_type="calibration", owner_id=1, lab_id=lab_a.id)
    assert exc_info.value.status_code == 403
    assert exc_info.value.error == "FORBIDDEN"


def test_download_respects_lab_scope(
    client: TestClient,
    db: Session,
    make_lab: Any,
    make_user: Any,
    auth: Any,
) -> None:
    lab_a = make_lab("A")
    lab_w = make_lab("W", name="Wytrzymałościowa")
    uploader = make_user("admin", all_labs=True)
    worker_a = make_user("worker", labs=(lab_a,))
    worker_w = make_user("worker", labs=(lab_w,))

    up = client.post(
        "/api/attachments",
        headers=auth(uploader),
        files={"file": ("cert.pdf", SAMPLE_PDF, "application/pdf")},
    )
    att_id = up.json()["id"]

    # Unattached: only author can download
    unattached_other = client.get(f"/api/attachments/{att_id}", headers=auth(worker_a))
    assert unattached_other.status_code == 403
    assert unattached_other.json()["error"] == "FORBIDDEN"

    attach(db, uploader, [att_id], owner_type="calibration", owner_id=10, lab_id=lab_a.id)
    db.flush()

    denied = client.get(f"/api/attachments/{att_id}", headers=auth(worker_w))
    assert denied.status_code == 403
    assert denied.json()["error"] == "LAB_OUT_OF_SCOPE"

    allowed = client.get(f"/api/attachments/{att_id}", headers=auth(worker_a))
    assert allowed.status_code == 200
    assert allowed.content == SAMPLE_PDF
    assert allowed.headers["content-type"] == "application/pdf"
