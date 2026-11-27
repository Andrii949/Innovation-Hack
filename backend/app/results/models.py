from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TestParameter(Base):
    """A measured parameter with its range from the scope form (docs/01-zadanie.md §4)."""

    __test__ = False  # not a pytest test class despite the name
    __tablename__ = "test_parameter"
    __table_args__ = (
        UniqueConstraint("material", "name", "unit", name="uq_test_parameter_material_name_unit"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    min_value: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    max_value: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    method: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accredited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    out_of_range_action: Mapped[str | None] = mapped_column(String(8), nullable=True)
    verify_min: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    verify_max: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TestResult(Base):
    """One measured value with a copy of the range valid when it was entered (17025 7.5.2)."""

    __test__ = False  # not a pytest test class despite the name
    __tablename__ = "test_result"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parameter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("test_parameter.id"), nullable=False, index=True
    )
    sample_label: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    min_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    max_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    in_range: Mapped[bool] = mapped_column(Boolean, nullable=False)
    repeat_of_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("test_result.id"), nullable=True
    )
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("app_user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )

    parameter: Mapped[TestParameter] = relationship(lazy="selectin")
