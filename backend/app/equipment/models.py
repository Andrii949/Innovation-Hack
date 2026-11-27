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
from app.forms.models import FormTemplate


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
    check_plans: Mapped[list["CheckPlan"]] = relationship(
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


class CheckPlan(Base):
    __tablename__ = "check_plan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    equipment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    interval_months: Mapped[int] = mapped_column(Integer, nullable=False)
    lead_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    form_template_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("form_template.id"),
        nullable=False,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    equipment: Mapped[Equipment] = relationship(back_populates="check_plans")
    form_template: Mapped[FormTemplate] = relationship(lazy="selectin")
    records: Mapped[list["CheckRecord"]] = relationship(
        back_populates="check_plan",
        cascade="all, delete-orphan",
    )


class CheckRecord(Base):
    __tablename__ = "check_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    check_plan_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("check_plan.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    performed_on: Mapped[date] = mapped_column(Date, nullable=False)
    values: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    out_of_range: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("app_user.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    check_plan: Mapped[CheckPlan] = relationship(back_populates="records")


class EquipmentCatalogItem(Base):
    __tablename__ = "equipment_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    manufacturer: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    software_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    suggested_lab_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    calibration_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    calibration_interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calibration_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="EXTERNAL")
    lead_months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    acceptance_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_aliases: Mapped[str | None] = mapped_column(String(255), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CalibrationPlan(Base):
    """A dispatch window approved separately from the agency's certificate."""

    __tablename__ = "calibration_plan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True)
    dispatch_on: Mapped[date] = mapped_column(Date)
    return_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    equipment: Mapped[Equipment] = relationship(lazy="selectin")
