from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class NotificationKind(StrEnum):
    CALIBRATION_DUE = "CALIBRATION_DUE"
    CHECK_DUE = "CHECK_DUE"
    LOT_EXPIRY = "LOT_EXPIRY"
    LOW_STOCK = "LOW_STOCK"
    STOCK_COUNT_DUE = "STOCK_COUNT_DUE"
    CHECK_OUT_OF_RANGE = "CHECK_OUT_OF_RANGE"
    RESULT_OUT_OF_RANGE = "RESULT_OUT_OF_RANGE"
    REPORT_READY = "REPORT_READY"


class Channel(StrEnum):
    IN_APP = "IN_APP"
    PUSH = "PUSH"


class Notification(Base):
    __tablename__ = "notification"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_notification_user_dedupe"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    ref_type: Mapped[str] = mapped_column(String(64), nullable=False)
    ref_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    due: Mapped[date | None] = mapped_column(Date, nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pushed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationRule(Base):
    """Overrides one default rule; missing rows mean the default from service.DEFAULT_RULES."""

    __tablename__ = "notification_rule"

    kind: Mapped[str] = mapped_column(String(32), primary_key=True)
    recipient_roles: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    lab_scoped: Mapped[bool] = mapped_column(Boolean, nullable=False)
    channels: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)


class DeviceToken(Base):
    """Firebase Installation ID (FID) of one app install, the FCM push target since 2026."""

    __tablename__ = "device_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    fid: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
