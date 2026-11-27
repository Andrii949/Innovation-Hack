from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.core.status import Status

ReagentKind = Literal["REAGENT", "CRM"]


class ReagentCreate(BaseModel):
    lab_id: int
    name: str = Field(min_length=1, max_length=255)
    kind: ReagentKind = "REAGENT"
    unit: str = Field(min_length=1, max_length=32)
    min_stock: str | None = None
    stock_count_interval_days: int | None = Field(default=None, ge=1)
    expiry_lead_months: int | None = None
    active: bool = True


class ReagentUpdate(BaseModel):
    """Only the fields that are sent are changed; `null` clears `min_stock`."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    kind: ReagentKind | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    min_stock: str | None = None
    stock_count_interval_days: int | None = Field(default=None, ge=1)
    expiry_lead_months: int | None = None
    active: bool | None = None


class LotCreate(BaseModel):
    lot_no: str = Field(min_length=1, max_length=100)
    expiry_date: date
    quantity: str
    received_on: date


class LotDispose(BaseModel):
    disposed_on: date


class StockCountCreate(BaseModel):
    quantity: str
    counted_on: date


class LotOut(BaseModel):
    id: int
    reagent_id: int
    lot_no: str
    expiry_date: date
    quantity: str
    received_on: date
    disposed_on: date | None
    status: Status


class StockCountOut(BaseModel):
    id: int
    reagent_id: int
    quantity: str
    counted_on: date
    counted_by: int


class ReagentOut(BaseModel):
    id: int
    lab_id: int
    lab_code: str
    name: str
    kind: ReagentKind
    unit: str
    min_stock: str | None
    stock_count_interval_days: int
    expiry_lead_months: int
    active: bool
    current_stock: str
    usable_stock_estimate: str | None
    recommended_lot_no: str | None
    low_stock: bool
    last_counted_on: date | None
    nearest_expiry: date | None
    lots: list[LotOut]
