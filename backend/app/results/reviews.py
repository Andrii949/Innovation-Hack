from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import Permission, require
from app.config import get_settings
from app.equipment.models import Calibration
from app.errors import AppError
from app.results.models import TestResult
from app.results.schemas import ResultReviewCreate


def flag_results_for_review(db: Session, calibration: Calibration) -> None:
    last_ok = db.scalar(
        select(Calibration.calibrated_month)
        .where(
            Calibration.equipment_id == calibration.equipment_id,
            Calibration.result == "OK",
            Calibration.calibrated_month <= calibration.calibrated_month,
        )
        .order_by(Calibration.calibrated_month.desc(), Calibration.id.desc())
        .limit(1)
    )
    candidates = select(TestResult).where(
        TestResult.equipment_id == calibration.equipment_id,
        TestResult.created_at <= calibration.created_at,
        TestResult.review_decision.is_distinct_from("PENDING"),
    )
    if last_ok is not None:
        start = datetime.combine(last_ok, time.min, ZoneInfo(get_settings().timezone))
        candidates = candidates.where(TestResult.created_at >= start)
    for result in db.scalars(candidates.order_by(TestResult.id).with_for_update()):
        result.review_calibration_id = calibration.id
        result.review_decision = "PENDING"
        result.review_note = None
        result.reviewed_by = None
        result.reviewed_at = None


def review_result(db: Session, user: User, result_id: int, data: ResultReviewCreate) -> TestResult:
    require(user, Permission.RESULT_REVIEW)
    result = db.get(TestResult, result_id, with_for_update=True)
    if result is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono wyniku badania")
    if result.equipment is not None:
        require(user, Permission.RESULT_REVIEW, lab_id=result.equipment.lab_id)
    if result.review_decision is None and result.in_range:
        raise AppError(409, "VALIDATION_ERROR", "Wynik nie oczekuje weryfikacji")
    if result.review_decision in ("ACCEPTED", "REPEAT"):
        raise AppError(409, "VALIDATION_ERROR", "Decyzja została już zapisana")
    note = data.note.strip()
    if not note:
        raise AppError(422, "VALIDATION_ERROR", "Podaj uzasadnienie decyzji")
    result.review_decision = data.decision
    result.review_note = note
    result.reviewed_by = user.id
    result.reviewed_at = datetime.now(UTC)
    db.flush()
    return result
