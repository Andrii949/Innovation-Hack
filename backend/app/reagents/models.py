from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.auth.models import Lab
from app.db import Base


class Reagent(Base):
    __tablename__ = "reagent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lab_id: Mapped[int] = mapped_column(Integer, ForeignKey("lab.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="REAGENT")
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    min_stock: Mapped[Decimal | None] = mapped_column(Numeric(), nullable=True)
    stock_count_interval_days: Mapped[int] = mapped_column(Integer, nullable=False)
    expiry_lead_months: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    lab: Mapped[Lab] = relationship(lazy="selectin")


class ReagentLot(Base):
    __tablename__ = "reagent_lot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reagent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reagent.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lot_no: Mapped[str] = mapped_column(String(100), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    received_on: Mapped[date] = mapped_column(Date, nullable=False)
    disposed_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    reagent: Mapped[Reagent] = relationship(lazy="selectin")


class StockCount(Base):
    __tablename__ = "stock_count"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reagent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reagent.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(), nullable=False)
    counted_on: Mapped[date] = mapped_column(Date, nullable=False)
    counted_by: Mapped[int] = mapped_column(Integer, ForeignKey("app_user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
