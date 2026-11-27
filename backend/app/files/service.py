import hashlib
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.config import get_settings
from app.errors import AppError
from app.files.models import Attachment
from app.settings.service import get_setting

_SAFE_FILENAME_RE = re.compile(r'["\\\r\n]')


def sniff_content_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    return None


def _clean_filename(filename: str) -> str:
    base = Path(filename).name.strip() or "attachment"
    return _SAFE_FILENAME_RE.sub("_", base)[:255]


def save_upload(
    db: Session,
    user: User,
    *,
    filename: str,
    data: bytes,
) -> Attachment:
    max_mb = int(get_setting(db, "max_upload_mb"))
    max_bytes = max_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise AppError(
            413,
            "FILE_TOO_LARGE",
            f"Plik przekracza maksymalny rozmiar {max_mb} MB",
        )

    content_type = sniff_content_type(data)
    if content_type is None:
        raise AppError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Dozwolone formaty plików to JPEG, PNG oraz PDF",
        )

    digest = hashlib.sha256(data).hexdigest()
    storage_key = f"{digest[:2]}/{uuid.uuid4().hex}"
    dest = get_settings().files_dir / storage_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)

    attachment = Attachment(
        owner_type=None,
        owner_id=None,
        lab_id=None,
        filename=_clean_filename(filename),
        content_type=content_type,
        size_bytes=len(data),
        sha256=digest,
        storage_key=storage_key,
        uploaded_by=user.id,
    )
    db.add(attachment)
    db.flush()
    return attachment


def attach(
    db: Session,
    user: User,
    attachment_ids: list[int],
    *,
    owner_type: str,
    owner_id: int,
    lab_id: int | None,
) -> None:
    for att_id in dict.fromkeys(attachment_ids):
        att = db.get(Attachment, att_id)
        if att is None:
            raise AppError(404, "NOT_FOUND", "Nie znaleziono załącznika")
        if att.uploaded_by != user.id or att.owner_type is not None:
            raise AppError(
                403,
                "FORBIDDEN",
                "Nie można przypiąć cudzego lub już przypiętego pliku",
            )
        att.owner_type = owner_type
        att.owner_id = owner_id
        att.lab_id = lab_id
    db.flush()


def list_attachment_ids(db: Session, *, owner_type: str, owner_id: int) -> list[int]:
    stmt = (
        select(Attachment.id)
        .where(Attachment.owner_type == owner_type, Attachment.owner_id == owner_id)
        .order_by(Attachment.id)
    )
    return list(db.scalars(stmt).all())


def load_attachment_for_user(
    db: Session, user: User, attachment_id: int
) -> tuple[Attachment, bytes]:
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono załącznika")

    if att.owner_type is None:
        if att.uploaded_by != user.id:
            raise AppError(403, "FORBIDDEN", "Brak dostępu do tego pliku")
    elif att.lab_id is not None:
        allowed_labs = visible_lab_ids(user)
        if allowed_labs is not None and att.lab_id not in allowed_labs:
            raise AppError(
                403,
                "LAB_OUT_OF_SCOPE",
                "Pracownia spoza zakresu uprawnień użytkownika",
            )
    elif att.owner_type == "report":
        require(user, Permission.REPORT_READ)

    path = get_settings().files_dir / att.storage_key
    if not path.is_file():
        raise AppError(404, "NOT_FOUND", "Plik nie istnieje na dysku")
    return att, path.read_bytes()


def page_images(db: Session, attachment: Attachment, limit: int = 5) -> list[bytes]:
    _ = db
    path = get_settings().files_dir / attachment.storage_key
    if not path.is_file():
        raise AppError(404, "NOT_FOUND", "Plik nie istnieje na dysku")
    if attachment.content_type in ("image/jpeg", "image/png"):
        return [path.read_bytes()]
    if attachment.content_type != "application/pdf":
        raise AppError(415, "UNSUPPORTED_FILE_TYPE", "Nieobsługiwany format załącznika")

    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm is None:
        raise AppError(502, "OCR_FAILED", "Brak narzędzia pdftoppm do konwersji stron PDF")

    with tempfile.TemporaryDirectory() as tmp_dir:
        prefix = Path(tmp_dir) / "page"
        try:
            proc = subprocess.run(  # noqa: S603  # fixed argv, no shell; paths inside server storage
                [pdftoppm, "-png", "-r", "200", "-l", str(limit), str(path), str(prefix)],
                capture_output=True,
                timeout=15,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise AppError(504, "OCR_TIMEOUT", "Przekroczono czas konwersji stron PDF") from exc
        if proc.returncode != 0:
            raise AppError(502, "OCR_FAILED", "Nie udało się odczytać stron dokumentu PDF")
        rendered = sorted(Path(tmp_dir).glob("page-*.png"))[:limit]
        if not rendered:
            raise AppError(502, "OCR_FAILED", "Dokument PDF nie zawiera stron do odczytu")
        return [img_path.read_bytes() for img_path in rendered]
