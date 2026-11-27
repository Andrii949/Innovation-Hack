from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Report(Base):
    """Manager report (F11); the PDF itself is an attachment, a technical record (7.5.2)."""

    __tablename__ = "report"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_to: Mapped[date] = mapped_column(Date, nullable=False)
    parameter_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    attachment_id: Mapped[int] = mapped_column(Integer, ForeignKey("attachment.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("app_user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
