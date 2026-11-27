from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.status import Status


class EquipmentCreate(BaseModel):
    lab_id: int
    number: str
    catalog_id: int | None = None
    name: str | None = None
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


class EquipmentCatalogOut(BaseModel):
    id: int
    slug: str
    name: str
    category: str
    manufacturer: str
    model: str
    display_label: str
    software_version: str | None
    suggested_lab_code: str | None
    calibration_required: bool
    calibration_interval_months: int | None
    calibration_mode: str
    lead_months: int
    acceptance_criteria: str | None
    notes: str | None
    active: bool


class EquipmentCatalogCreate(BaseModel):
    name: str
    category: str
    manufacturer: str
    model: str
    software_version: str | None = None
    suggested_lab_code: str | None = None
    calibration_required: bool = True
    calibration_interval_months: int | None = 12
    calibration_mode: Literal["EXTERNAL", "ON_SITE"] = "EXTERNAL"
    lead_months: int = 1
    acceptance_criteria: str | None = None
    notes: str | None = None
    search_aliases: str | None = None
    active: bool = True


class EquipmentCatalogUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    software_version: str | None = None
    suggested_lab_code: str | None = None
    calibration_required: bool | None = None
    calibration_interval_months: int | None = None
    calibration_mode: Literal["EXTERNAL", "ON_SITE"] | None = None
    lead_months: int | None = None
    acceptance_criteria: str | None = None
    notes: str | None = None
    search_aliases: str | None = None
    active: bool | None = None


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


class AuthorizedUsersUpdate(BaseModel):
    user_ids: list[int]


class AuthorizedUserOut(BaseModel):
    id: int
    login: str
    full_name: str
    role: str


class CheckPlanSummaryOut(BaseModel):
    id: int
    equipment_id: int
    name: str
    interval_months: int
    lead_months: int
    form_template_id: int
    fields: list[dict[str, Any]]
    active: bool
    status: Status
    last_performed_on: str | None
    next_due_month: str | None


class CheckPlanCreate(BaseModel):
    name: str
    interval_months: int
    lead_months: int | None = None
    form_template_id: int
    active: bool = True


class CheckPlanUpdate(BaseModel):
    name: str | None = None
    interval_months: int | None = None
    lead_months: int | None = None
    form_template_id: int | None = None
    active: bool | None = None


class CheckRecordCreate(BaseModel):
    performed_on: date
    values: dict[str, Any]
    note: str | None = None
    attachment_ids: list[int] = []


class CheckRecordOut(BaseModel):
    id: int
    check_plan_id: int
    performed_on: str
    values: dict[str, Any]
    out_of_range: bool
    note: str | None
    performed_by: int
    created_at: str
    attachment_ids: list[int]


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


class CalibrationPointInput(BaseModel):
    point: str
    error: str
    uncertainty: str
    unit: str


class CalibrationPointOut(BaseModel):
    id: int
    point: str
    error: str
    uncertainty: str
    unit: str


class CalibrationCreate(BaseModel):
    calibrated_month: str
    vendor: str
    certificate_no: str | None = None
    adjustments: str | None = None
    result: Literal["OK", "NOK"]
    points: list[CalibrationPointInput] = Field(min_length=1)
    note: str | None = None
    attachment_ids: list[int] = []


class CalibrationExtractRequest(BaseModel):
    attachment_id: int


class CalibrationOut(BaseModel):
    id: int
    equipment_id: int
    calibrated_month: str
    vendor: str | None
    certificate_no: str | None
    adjustments: str | None
    result: str
    next_due_month: str | None
    note: str | None
    source: str
    ocr_meta: dict[str, Any] | None
    created_by: int | None
    created_at: str
    points: list[CalibrationPointOut]
    attachment_ids: list[int]
