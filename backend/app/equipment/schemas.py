from typing import Literal

from pydantic import BaseModel

from app.equipment._core import Status


class EquipmentCreate(BaseModel):
    lab_id: int
    number: str
    name: str
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_no: str | None = None
    software_version: str | None = None
    location: str | None = None
    calibration_required: bool = True
    calibration_interval_months: int | None = None
    calibration_mode: Literal["EXTERNAL", "ON_SITE"] = "EXTERNAL"
    lead_months: int | None = None
    acceptance_criteria: str | None = None
    notes: str | None = None
    last_calibrated_month: str | None = None


class EquipmentUpdate(BaseModel):
    lab_id: int | None = None
    number: str | None = None
    name: str | None = None
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_no: str | None = None
    software_version: str | None = None
    location: str | None = None
    calibration_required: bool | None = None
    calibration_interval_months: int | None = None
    calibration_mode: Literal["EXTERNAL", "ON_SITE"] | None = None
    lead_months: int | None = None
    acceptance_criteria: str | None = None
    notes: str | None = None


class ReasonRequest(BaseModel):
    reason: str


class CheckPlanSummaryOut(BaseModel):
    id: int
    name: str
    interval_months: int
    lead_months: int
    form_template_id: int
    active: bool
    status: Status
    next_due_month: str | None


class EquipmentOut(BaseModel):
    id: int
    public_id: str
    lab_id: int
    number: str
    code: str
    name: str
    category: str | None
    manufacturer: str | None
    model: str | None
    serial_no: str | None
    software_version: str | None
    location: str | None
    calibration_required: bool
    calibration_interval_months: int | None
    calibration_mode: str
    lead_months: int
    acceptance_criteria: str | None
    withdrawn_at: str | None
    withdrawn_reason: str | None
    notes: str | None
    status: Status
    last_calibrated_month: str | None
    next_due_month: str | None


class EquipmentCard(EquipmentOut):
    check_plans: list[CheckPlanSummaryOut]
    can_write: bool
    qr_url: str
