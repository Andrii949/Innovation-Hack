from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.core.clock import get_today
from app.db import get_db
from app.reports.service import (
    ReportCreate,
    ReportOut,
    create_report,
    list_reports,
    report_pdf,
    serialize_report,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", status_code=status.HTTP_201_CREATED)
def post_report(
    payload: ReportCreate,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> ReportOut:
    report = create_report(db, user, payload, today=today)
    out = serialize_report(report)
    db.commit()
    return out


@router.get("")
def get_reports(
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ReportOut]:
    return [serialize_report(r) for r in list_reports(db, user)]


@router.get("/{report_id}.pdf")
def get_report_pdf(
    report_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    pdf = report_pdf(db, user, report_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="raport-{report_id}.pdf"'},
    )
