from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.auth.models import Lab
from app.db import Base


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (UniqueConstraint("lab_id", "number", name="uq_equipment_lab_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    lab_id: Mapped[int] = mapped_column(Integer, ForeignKey("lab.id"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    software_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calibration_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    calibration_interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calibration_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="EXTERNAL")
    lead_months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    acceptance_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lab: Mapped[Lab] = relationship(lazy="selectin")
    calibrations: Mapped[list["Calibration"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )
    authorizations: Mapped[list["EquipmentAuthorization"]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def authorized_user_ids(self) -> set[int]:
        return {auth_row.user_id for auth_row in self.authorizations}


class EquipmentAuthorization(Base):
    __tablename__ = "equipment_authorization"

    equipment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("equipment.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        primary_key=True,
    )

    equipment: Mapped[Equipment] = relationship(back_populates="authorizations")


class Calibration(Base):
    __tablename__ = "calibration"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    equipment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    calibrated_month: Mapped[date] = mapped_column(Date, nullable=False)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    certificate_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    adjustments: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[str] = mapped_column(String(8), nullable=False)
    next_due_month: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="MANUAL")
    ocr_meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("app_user.id"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    equipment: Mapped[Equipment] = relationship(back_populates="calibrations")
    points: Mapped[list["CalibrationPoint"]] = relationship(
        back_populates="calibration",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class CalibrationPoint(Base):
    __tablename__ = "calibration_point"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    calibration_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("calibration.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    point: Mapped[str] = mapped_column(String(100), nullable=False)
    error: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    uncertainty: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)

    calibration: Mapped[Calibration] = relationship(back_populates="points")
