from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.ranges import RangeResult

OutOfRangeAction = Literal["FLAG", "BLOCK"]


class TestParameterCreate(BaseModel):
    material: str = Field(default="Cement", min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    unit: str = Field(min_length=1, max_length=32)
    min_value: str | None = None
    max_value: str | None = None
    method: str | None = Field(default=None, max_length=255)
    accredited: bool = False
    out_of_range_action: OutOfRangeAction | None = None
    verify_min: str | None = None
    verify_max: str | None = None
    active: bool = True


class TestParameterUpdate(BaseModel):
    """Only the fields that are sent are changed; `null` clears an optional field."""

    material: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    min_value: str | None = None
    max_value: str | None = None
    method: str | None = Field(default=None, max_length=255)
    accredited: bool | None = None
    out_of_range_action: OutOfRangeAction | None = None
    verify_min: str | None = None
    verify_max: str | None = None
    active: bool | None = None


class TestParameterOut(BaseModel):
    id: int
    material: str
    name: str
    unit: str
    min_value: str | None
    max_value: str | None
    method: str | None
    accredited: bool
    out_of_range_action: OutOfRangeAction | None
    verify_min: str | None
    verify_max: str | None
    active: bool


class ImportResult(BaseModel):
    imported: int


class TestResultCreate(BaseModel):
    parameter_id: int
    sample_label: str = Field(min_length=1, max_length=255)
    value: str
    repeat_of_id: int | None = None


class TestResultOut(BaseModel):
    id: int
    parameter_id: int
    parameter_name: str
    unit: str
    sample_label: str
    value: str
    min_snapshot: str | None
    max_snapshot: str | None
    in_range: bool
    repeat_of_id: int | None
    created_by: int
    created_at: str


class SeriesParameter(BaseModel):
    name: str
    unit: str


class SeriesPoint(BaseModel):
    at: datetime
    sample_label: str
    value: str
    status: RangeResult


class Series(BaseModel):
    """Measurements of one parameter over a period, checked against the verification threshold."""

    parameter: SeriesParameter
    threshold_min: str | None
    threshold_max: str | None
    points: list[SeriesPoint]
    count: int
    out_of_threshold: int
