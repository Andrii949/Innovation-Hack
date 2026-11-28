"""Manager report: series, charts and verification summary as a PDF (F11, 02 §8.5)."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.config import get_settings
from app.core.ranges import RangeResult
from app.errors import AppError
from app.files.service import attach, load_attachment_for_user, save_upload
from app.notifications.models import NotificationKind
from app.notifications.service import notify_now
from app.print.chart import chart_svg
from app.print.service import date_label, render_pdf
from app.reports.models import Report
from app.results.models import TestParameter, TestResult
from app.results.service import get_parameter_or_404, range_text, result_scope, result_series

VERDICTS = {
    RangeResult.IN_RANGE: "w progu",
    RangeResult.ABOVE: "powyżej progu",
    RangeResult.BELOW: "poniżej progu",
}


class ReportCreate(BaseModel):
    period_from: date
    period_to: date
    parameter_ids: list[int] = Field(default_factory=list)


class ReportOut(BaseModel):
    id: int
    period_from: date
    period_to: date
    parameter_ids: list[int]
    attachment_id: int
    created_by: int
    created_at: datetime
    pdf_url: str


class ReportPoint(BaseModel):
    at: str
    sample_label: str
    value: str
    verdict: str


class ReportParameter(BaseModel):
    name: str
    unit: str
    threshold: str
    count: int
    out_of_threshold: int
    chart_svg: str
    points: list[ReportPoint]


class ReportData(BaseModel):
    period_from: str
    period_to: str
    author: str
    generated_on: str
    total_out: int
    parameters: list[ReportParameter]


def _optional_decimal(text: str | None) -> Decimal | None:
    return Decimal(text) if text is not None else None


def _parameters_for(db: Session, user: User, data: ReportCreate) -> list[TestParameter]:
    if data.parameter_ids:
        return [get_parameter_or_404(db, pid) for pid in dict.fromkeys(data.parameter_ids)]
    tz = ZoneInfo(get_settings().timezone)
    start = datetime.combine(data.period_from, time.min, tzinfo=tz)
    end = datetime.combine(data.period_to + timedelta(days=1), time.min, tzinfo=tz)
    with_results = (
        select(TestResult.parameter_id)
        .where(
            TestResult.created_at >= start,
            TestResult.created_at < end,
            result_scope(user),
        )
        .distinct()
    )
    stmt = (
        select(TestParameter)
        .where(TestParameter.id.in_(with_results))
        .order_by(TestParameter.material, TestParameter.name, TestParameter.unit)
    )
    return list(db.scalars(stmt).all())


def _report_parameter(
    db: Session, user: User, param: TestParameter, data: ReportCreate
) -> ReportParameter:
    series = result_series(
        db, parameter_id=param.id, date_from=data.period_from, date_to=data.period_to, user=user
    )
    tz = ZoneInfo(get_settings().timezone)
    return ReportParameter(
        name=param.name,
        unit=param.unit,
        threshold=range_text(
            _optional_decimal(series.threshold_min),
            _optional_decimal(series.threshold_max),
            param.unit,
        ),
        count=series.count,
        out_of_threshold=series.out_of_threshold,
        chart_svg=chart_svg(series),
        points=[
            ReportPoint(
                at=f"{point.at.astimezone(tz):%d.%m.%Y %H:%M}",
                sample_label=point.sample_label,
                value=point.value.replace(".", ","),
                verdict=VERDICTS[point.status],
            )
            for point in series.points
        ],
    )


def create_report(db: Session, user: User, data: ReportCreate, *, today: date) -> Report:
    require(user, Permission.REPORT_WRITE)
    if data.period_from > data.period_to:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Data początkowa jest późniejsza niż końcowa",
            details=[{"field": "period_from", "message": "period_from > period_to"}],
        )
    params = _parameters_for(db, user, data)
    sections = [_report_parameter(db, user, p, data) for p in params]
    pdf = render_pdf(
        "report.typ",
        ReportData(
            period_from=date_label(data.period_from),
            period_to=date_label(data.period_to),
            author=user.full_name,
            generated_on=date_label(today),
            total_out=sum(s.out_of_threshold for s in sections),
            parameters=sections,
        ),
    )

    attachment = save_upload(
        db, user, filename=f"raport-{data.period_from}-{data.period_to}.pdf", data=pdf
    )
    report = Report(
        period_from=data.period_from,
        period_to=data.period_to,
        parameter_ids=[p.id for p in params],
        attachment_id=attachment.id,
        created_by=user.id,
    )
    db.add(report)
    db.flush()
    attach(db, user, [attachment.id], owner_type="report", owner_id=report.id, lab_id=None)
    notify_now(
        db,
        kind=NotificationKind.REPORT_READY,
        lab_id=None,
        ref_type="report",
        ref_id=report.id,
        title=(
            f"Raport z wyników badań za {date_label(data.period_from)} - "
            f"{date_label(data.period_to)} jest gotowy"
        ),
    )
    db.refresh(report)
    return report


def serialize_report(report: Report) -> ReportOut:
    return ReportOut(
        id=report.id,
        period_from=report.period_from,
        period_to=report.period_to,
        parameter_ids=list(report.parameter_ids),
        attachment_id=report.attachment_id,
        created_by=report.created_by,
        created_at=report.created_at,
        pdf_url=f"/api/reports/{report.id}.pdf",
    )


def list_reports(db: Session, user: User) -> list[Report]:
    require(user, Permission.REPORT_READ)
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc())
    if visible_lab_ids(user) is not None:
        stmt = stmt.where(Report.created_by == user.id)
    return list(db.scalars(stmt))


def report_pdf(db: Session, user: User, report_id: int) -> bytes:
    require(user, Permission.REPORT_READ)
    report = db.get(Report, report_id)
    if report is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono raportu")
    if visible_lab_ids(user) is not None and report.created_by != user.id:
        raise AppError(403, "LAB_OUT_OF_SCOPE", "Raport spoza zakresu uprawnień użytkownika")
    _attachment, raw = load_attachment_for_user(db, user, report.attachment_id)
    return raw
