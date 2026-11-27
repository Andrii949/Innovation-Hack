from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.auth.permissions import Permission, require
from app.db import get_db
from app.errors import AppError
from app.forms.models import FormTemplate
from app.forms.validation import FieldSpec, validate_field_specs

router = APIRouter(prefix="/form-templates", tags=["forms"])


class FormTemplateCreate(BaseModel):
    name: str
    fields: list[FieldSpec] = Field(min_length=1)


class FormTemplateUpdate(BaseModel):
    name: str | None = None
    fields: list[FieldSpec] | None = None


class FormTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    fields: list[dict[str, Any]]


@router.get("")
def get_form_templates(
    _user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[FormTemplateOut]:
    rows = db.scalars(select(FormTemplate).order_by(FormTemplate.name, FormTemplate.id)).all()
    return [FormTemplateOut.model_validate(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def post_form_template(
    payload: FormTemplateCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FormTemplateOut:
    require(user, Permission.SETTINGS_WRITE)
    clean_name = payload.name.strip()
    if not clean_name:
        raise AppError(422, "VALIDATION_ERROR", "Nazwa formularza jest wymagana")
    try:
        normalized_fields = validate_field_specs(payload.fields)
    except ValueError as exc:
        raise AppError(422, "VALIDATION_ERROR", str(exc)) from exc
    tpl = FormTemplate(name=clean_name, fields=normalized_fields)
    db.add(tpl)
    db.flush()
    out = FormTemplateOut.model_validate(tpl)
    db.commit()
    return out


@router.patch("/{template_id}")
def patch_form_template(
    template_id: int,
    payload: FormTemplateUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FormTemplateOut:
    require(user, Permission.SETTINGS_WRITE)
    tpl = db.get(FormTemplate, template_id)
    if tpl is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono szablonu formularza")
    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise AppError(422, "VALIDATION_ERROR", "Nazwa formularza nie może być pusta")
        tpl.name = clean_name
    if payload.fields is not None:
        if not payload.fields:
            raise AppError(
                422, "VALIDATION_ERROR", "Formularz musi zawierać co najmniej jedno pole"
            )
        try:
            tpl.fields = validate_field_specs(payload.fields)
        except ValueError as exc:
            raise AppError(422, "VALIDATION_ERROR", str(exc)) from exc
    db.flush()
    out = FormTemplateOut.model_validate(tpl)
    db.commit()
    return out
