from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import Lab, User
from app.auth.permissions import Permission, has_permission, require, visible_lab_ids
from app.db import get_db
from app.equipment.models import CalibrationPlan, Equipment
from app.equipment.service import format_code, get_equipment_or_404
from app.errors import AppError

router = APIRouter(prefix="/calibration-plans", tags=["calibration-plans"])
CurrentUser = Annotated[User, Depends(current_user)]
Database = Annotated[Session, Depends(get_db)]


class PlanDates(BaseModel):
    dispatch_on: date
    return_on: date
    note: str | None = Field(default=None, max_length=4000)


class PlanCreate(PlanDates):
    equipment_id: int


class PlanOut(PlanCreate):
    id: int
    equipment: str
    created_by: int
    approved_at: datetime | None
    approved_by_name: str | None
    conflict_count: int
    available_devices: int | None
    warning: str | None


def _get(db: Session, plan_id: int) -> CalibrationPlan:
    plan = db.get(CalibrationPlan, plan_id)
    if plan is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono planu wzorcowania")
    return plan


def _lock_lab(db: Session, lab_id: int) -> None:
    db.execute(select(Lab.id).where(Lab.id == lab_id).with_for_update())


def _set_dates(plan: CalibrationPlan, dates: PlanDates) -> None:
    if dates.dispatch_on > dates.return_on:
        raise AppError(422, "VALIDATION_ERROR", "Planowany powrót nie może poprzedzać wysyłki")
    plan.dispatch_on = dates.dispatch_on
    plan.return_on = dates.return_on
    plan.note = dates.note.strip() if dates.note else None


def _active_equipment(equipment: Equipment) -> None:
    if not equipment.calibration_required or equipment.withdrawn_at is not None:
        raise AppError(409, "VALIDATION_ERROR", "Urządzenie nie jest dostępne do zaplanowania")


def _availability(db: Session, plan: CalibrationPlan) -> tuple[int, int | None, str | None]:
    device = plan.equipment
    same_device = select(CalibrationPlan).where(CalibrationPlan.equipment_id == device.id)
    overlap = (
        CalibrationPlan.id != plan.id,
        CalibrationPlan.dispatch_on <= plan.return_on,
        CalibrationPlan.return_on >= plan.dispatch_on,
    )
    duplicates = db.scalars(same_device.where(*overlap)).all()
    if duplicates:
        return len(duplicates), None, "Urządzenie ma już nakładający się plan wysyłki."
    if not device.category:
        return 0, None, None

    peers = db.execute(
        select(Equipment.id, Equipment.withdrawn_at).where(
            Equipment.lab_id == device.lab_id,
            Equipment.category == device.category,
            Equipment.id != device.id,
        )
    ).all()
    if not peers:
        return 0, None, None
    active = {equipment_id for equipment_id, withdrawn_at in peers if withdrawn_at is None}
    conflicts = db.scalars(
        select(CalibrationPlan).where(CalibrationPlan.equipment_id.in_(active), *overlap)
    ).all()
    dates = {plan.dispatch_on, *(max(plan.dispatch_on, other.dispatch_on) for other in conflicts)}
    available = len(active) - max(
        len(
            {
                other.equipment_id
                for other in conflicts
                if other.dispatch_on <= day <= other.return_on
            }
        )
        for day in dates
    )
    warning = (
        "W tym okresie nie ma dostępnego urządzenia z tej kategorii w pracowni."
        if available == 0
        else None
    )
    return len(conflicts), available, warning


def _out(db: Session, plan: CalibrationPlan) -> PlanOut:
    conflicts, available, warning = _availability(db, plan)
    device = plan.equipment
    approver = db.get(User, plan.approved_by) if plan.approved_by is not None else None
    return PlanOut(
        id=plan.id,
        equipment_id=device.id,
        equipment=f"{format_code(device.number, device.lab.code)} · {device.name}",
        dispatch_on=plan.dispatch_on,
        return_on=plan.return_on,
        note=plan.note,
        created_by=plan.created_by,
        approved_at=plan.approved_at.astimezone(UTC) if plan.approved_at is not None else None,
        approved_by_name=approver.full_name if approver is not None else None,
        conflict_count=conflicts,
        available_devices=available,
        warning=warning,
    )


@router.get("")
def list_plans(user: CurrentUser, db: Database) -> list[PlanOut]:
    if not has_permission(user, Permission.CALIBRATION_APPROVE):
        require(user, Permission.CALIBRATION_WRITE)
    query = (
        select(CalibrationPlan)
        .join(Equipment)
        .order_by(CalibrationPlan.dispatch_on, CalibrationPlan.id)
    )
    labs = visible_lab_ids(user)
    if labs is not None:
        query = query.where(Equipment.lab_id.in_(labs))
    return [_out(db, plan) for plan in db.scalars(query)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_plan(data: PlanCreate, user: CurrentUser, db: Database) -> PlanOut:
    require(user, Permission.CALIBRATION_WRITE)
    equipment = get_equipment_or_404(db, data.equipment_id)
    require(user, Permission.CALIBRATION_WRITE, lab_id=equipment.lab_id)
    _lock_lab(db, equipment.lab_id)
    db.refresh(equipment)
    _active_equipment(equipment)
    plan = CalibrationPlan(equipment=equipment, created_by=user.id)
    _set_dates(plan, data)
    db.add(plan)
    db.flush()
    out = _out(db, plan)
    db.commit()
    return out


@router.patch("/{plan_id}")
def edit_plan(plan_id: int, data: PlanDates, user: CurrentUser, db: Database) -> PlanOut:
    require(user, Permission.CALIBRATION_WRITE)
    plan = _get(db, plan_id)
    require(user, Permission.CALIBRATION_WRITE, lab_id=plan.equipment.lab_id)
    _lock_lab(db, plan.equipment.lab_id)
    db.refresh(plan)
    if plan.approved_at is not None:
        raise AppError(409, "VALIDATION_ERROR", "Zatwierdzonego planu nie można edytować")
    _active_equipment(plan.equipment)
    _set_dates(plan, data)
    db.flush()
    out = _out(db, plan)
    db.commit()
    return out


@router.post("/{plan_id}/approve")
def approve_plan(plan_id: int, user: CurrentUser, db: Database) -> PlanOut:
    require(user, Permission.CALIBRATION_APPROVE)
    plan = _get(db, plan_id)
    require(user, Permission.CALIBRATION_APPROVE, lab_id=plan.equipment.lab_id)
    _lock_lab(db, plan.equipment.lab_id)
    db.refresh(plan)
    if plan.approved_at is not None:
        return _out(db, plan)
    _active_equipment(plan.equipment)
    _, _, warning = _availability(db, plan)
    if warning is not None:
        raise AppError(409, "VALIDATION_ERROR", warning)
    plan.approved_by = user.id
    plan.approved_at = datetime.now(UTC)
    db.flush()
    out = _out(db, plan)
    db.commit()
    return out
