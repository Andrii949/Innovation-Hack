from datetime import datetime

from pydantic import BaseModel

from app.core.ranges import RangeResult


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
