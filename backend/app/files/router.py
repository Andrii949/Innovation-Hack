from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.db import get_db
from app.files.service import load_attachment_for_user, save_upload

router = APIRouter(prefix="/attachments", tags=["files"])


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_type: str | None
    owner_id: int | None
    lab_id: int | None
    filename: str
    content_type: str
    size_bytes: int
    sha256: str


@router.post("", status_code=status.HTTP_201_CREATED)
def post_attachment(
    file: Annotated[UploadFile, File()],
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AttachmentOut:
    data = file.file.read()
    attachment = save_upload(db, user, filename=file.filename or "upload", data=data)
    db.commit()
    return AttachmentOut.model_validate(attachment)


@router.get("/{attachment_id}")
def get_attachment(
    attachment_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    att, raw = load_attachment_for_user(db, user, attachment_id)
    return Response(
        content=raw,
        media_type=att.content_type,
        headers={"Content-Disposition": f'inline; filename="{att.filename}"'},
    )
