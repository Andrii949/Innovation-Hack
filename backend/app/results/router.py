from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.auth.permissions import Permission, require
from app.db import get_db
from app.errors import AppError
from app.results.reviews import review_result
from app.results.schemas import (
    ImportResult,
    ResultReviewCreate,
    Series,
    TestParameterCreate,
    TestParameterOut,
    TestParameterUpdate,
    TestResultCreate,
    TestResultOut,
)
from app.results.service import (
    create_parameter,
    import_parameters_csv,
    list_parameters,
    list_results,
    record_result,
    result_series,
    serialize_parameter,
    serialize_result,
    update_parameter,
)

parameters_router = APIRouter(prefix="/test-parameters", tags=["results"])
results_router = APIRouter(prefix="/test-results", tags=["results"])


@parameters_router.get("")
def get_parameters(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TestParameterOut]:
    return [serialize_parameter(p) for p in list_parameters(db, user)]


@parameters_router.post("", status_code=status.HTTP_201_CREATED)
def post_parameter(
    payload: TestParameterCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TestParameterOut:
    param = create_parameter(db, user, payload)
    out = serialize_parameter(param)
    db.commit()
    return out


@parameters_router.patch("/{parameter_id}")
def patch_parameter(
    parameter_id: int,
    payload: TestParameterUpdate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TestParameterOut:
    param = update_parameter(db, user, parameter_id, payload)
    out = serialize_parameter(param)
    db.commit()
    return out


@parameters_router.post("/import")
def post_parameters_import(
    file: Annotated[UploadFile, File()],
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ImportResult:
    require(user, Permission.SETTINGS_WRITE)
    try:
        text = file.file.read().decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError(422, "VALIDATION_ERROR", "Plik CSV musi być zapisany w UTF-8") from exc
    imported = import_parameters_csv(db, text)
    db.commit()
    return ImportResult(imported=imported)


@results_router.get("")
def get_results(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    parameter_id: int | None = None,
    equipment_id: int | None = None,
) -> list[TestResultOut]:
    return [
        serialize_result(r)
        for r in list_results(db, user, parameter_id=parameter_id, equipment_id=equipment_id)
    ]


@results_router.get("/series")
def get_result_series(
    parameter_id: int,
    date_from: Annotated[date, Query(alias="from")],
    date_to: Annotated[date, Query(alias="to")],
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Series:
    require(user, Permission.RESULT_READ)
    return result_series(
        db, parameter_id=parameter_id, date_from=date_from, date_to=date_to, user=user
    )


@results_router.post("", status_code=status.HTTP_201_CREATED)
def post_result(
    payload: TestResultCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TestResultOut:
    result = record_result(db, user, payload)
    out = serialize_result(result)
    db.commit()
    return out


@results_router.post("/{result_id}/review")
def post_result_review(
    result_id: int,
    data: ResultReviewCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TestResultOut:
    result = serialize_result(review_result(db, user, result_id, data))
    db.commit()
    return result
