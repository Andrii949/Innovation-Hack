"""Reagents and CRM: lots, periodic stock counts, low stock and expiry (F8, 02 §4.1)."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import Permission, require, visible_lab_ids
from app.core.dates import date_window, due_status
from app.core.ranges import parse_decimal
from app.core.status import Status
from app.errors import AppError
from app.reagents.models import Reagent, ReagentLot, StockCount
from app.reagents.schemas import (
    LotCreate,
    LotOut,
    ReagentCreate,
    ReagentOut,
    ReagentUpdate,
    StockCountCreate,
    StockCountOut,
)
from app.schedule.service import DueItem, DueKind
from app.settings.service import get_setting


def _parse_quantity(text: str, field: str) -> Decimal:
    try:
        value = parse_decimal(text)
    except ValueError as exc:
        raise AppError(
            422, "INVALID_NUMBER", f"Nie można odczytać liczby w polu {field}: {text!r}"
        ) from exc
    if value < 0:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Pole {field} nie może być ujemne",
            details=[{"field": field, "message": "negative"}],
        )
    return value


def _optional_quantity(text: str | None, field: str) -> Decimal | None:
    if text is None or not text.strip():
        return None
    return _parse_quantity(text, field)


def _validate_expiry_lead(db: Session, lead_months: int) -> None:
    low, high = get_setting(db, "equipment_lead_months_range")
    if not low <= lead_months <= high:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Wyprzedzenie ważności musi mieścić się w zakresie {low}-{high} miesięcy",
            details=[{"field": "expiry_lead_months", "message": "out of range"}],
        )


def get_reagent_or_404(db: Session, reagent_id: int) -> Reagent:
    reagent = db.get(Reagent, reagent_id)
    if reagent is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono odczynnika")
    return reagent


def _last_count(db: Session, reagent_id: int) -> StockCount | None:
    return db.scalars(
        select(StockCount)
        .where(StockCount.reagent_id == reagent_id)
        .order_by(StockCount.counted_on.desc(), StockCount.id.desc())
    ).first()


def _lots_in_use(db: Session, reagent_id: int) -> list[ReagentLot]:
    return list(
        db.scalars(
            select(ReagentLot)
            .where(ReagentLot.reagent_id == reagent_id, ReagentLot.disposed_on.is_(None))
            .order_by(ReagentLot.expiry_date, ReagentLot.id)
        ).all()
    )


def current_stock(db: Session, reagent_id: int) -> Decimal:
    """Last count plus lots received after the count day; without a count, all lots in use."""
    last = _last_count(db, reagent_id)
    stmt = select(func.coalesce(func.sum(ReagentLot.quantity), 0)).where(
        ReagentLot.reagent_id == reagent_id, ReagentLot.disposed_on.is_(None)
    )
    if last is None:
        return Decimal(db.scalar(stmt) or 0)
    received_after = db.scalar(stmt.where(ReagentLot.received_on > last.counted_on)) or 0
    return last.quantity + Decimal(received_after)


def _valid_lots(lots: list[ReagentLot], today: date) -> list[ReagentLot]:
    return [lot for lot in lots if lot.received_on <= today <= lot.expiry_date and lot.quantity > 0]


def _effective_stock(reagent: Reagent, stock: Decimal, valid_lots: list[ReagentLot]) -> Decimal:
    if reagent.kind != "CRM":
        return stock
    valid_quantity = sum((lot.quantity for lot in valid_lots), start=Decimal(0))
    return min(stock, valid_quantity)


def last_stock_change(db: Session, reagent_id: int) -> date | None:
    """Day of the last count or of a later lot receipt."""
    last = _last_count(db, reagent_id)
    stmt = select(func.max(ReagentLot.received_on)).where(ReagentLot.reagent_id == reagent_id)
    if last is not None:
        stmt = stmt.where(ReagentLot.received_on > last.counted_on)
    latest_receipt: date | None = db.scalar(stmt)
    candidates = [d for d in (last.counted_on if last else None, latest_receipt) if d is not None]
    return max(candidates) if candidates else None


def _lot_status(reagent: Reagent, lot: ReagentLot, today: date) -> Status:
    return due_status(*date_window(lot.expiry_date, reagent.expiry_lead_months), today)


def _active_reagents(db: Session, lab_ids: set[int] | None) -> list[Reagent]:
    stmt = select(Reagent).where(Reagent.active.is_(True))
    if lab_ids is not None:
        stmt = stmt.where(Reagent.lab_id.in_(lab_ids))
    return list(db.scalars(stmt).all())


def lot_items(db: Session, *, today: date, lab_ids: set[int] | None = None) -> list[DueItem]:
    if lab_ids is not None and not lab_ids:
        return []
    items: list[DueItem] = []
    for reagent in _active_reagents(db, lab_ids):
        for lot in _lots_in_use(db, reagent.id):
            alert_from, valid_until = date_window(lot.expiry_date, reagent.expiry_lead_months)
            items.append(
                DueItem(
                    kind=DueKind.LOT_EXPIRY,
                    ref_type="reagent_lot",
                    ref_id=lot.id,
                    lab_id=reagent.lab_id,
                    label=f"{reagent.name}, partia {lot.lot_no}",
                    due=lot.expiry_date,
                    alert_from=alert_from,
                    valid_until=valid_until,
                    status=due_status(alert_from, valid_until, today),
                )
            )
    return items


def stock_items(db: Session, *, today: date, lab_ids: set[int] | None = None) -> list[DueItem]:
    if lab_ids is not None and not lab_ids:
        return []
    items: list[DueItem] = []
    for reagent in _active_reagents(db, lab_ids):
        stock = current_stock(db, reagent.id)
        lots = _valid_lots(_lots_in_use(db, reagent.id), today) if reagent.kind == "CRM" else []
        if (
            reagent.min_stock is not None
            and _effective_stock(reagent, stock, lots) < reagent.min_stock
        ):
            items.append(
                DueItem(
                    kind=DueKind.LOW_STOCK,
                    ref_type="reagent",
                    ref_id=reagent.id,
                    lab_id=reagent.lab_id,
                    label=reagent.name,
                    due=last_stock_change(db, reagent.id),
                    alert_from=None,
                    valid_until=None,
                    status=Status.LOW,
                )
            )
        last = _last_count(db, reagent.id)
        count_due = (
            last.counted_on + timedelta(days=reagent.stock_count_interval_days)
            if last is not None
            else None
        )
        if count_due is None or today >= count_due:
            items.append(
                DueItem(
                    kind=DueKind.STOCK_COUNT,
                    ref_type="reagent",
                    ref_id=reagent.id,
                    lab_id=reagent.lab_id,
                    label=reagent.name,
                    due=count_due,
                    alert_from=count_due,
                    valid_until=None,
                    status=Status.COUNT_DUE,
                )
            )
    return items


def serialize_lot(reagent: Reagent, lot: ReagentLot, *, today: date) -> LotOut:
    return LotOut(
        id=lot.id,
        reagent_id=lot.reagent_id,
        lot_no=lot.lot_no,
        expiry_date=lot.expiry_date,
        quantity=format(lot.quantity, "f"),
        received_on=lot.received_on,
        disposed_on=lot.disposed_on,
        status=_lot_status(reagent, lot, today),
    )


def serialize_reagent(db: Session, reagent: Reagent, *, today: date) -> ReagentOut:
    stock = current_stock(db, reagent.id)
    lots = _lots_in_use(db, reagent.id)
    valid = _valid_lots(lots, today)
    usable = _effective_stock(reagent, stock, valid)
    last = _last_count(db, reagent.id)
    return ReagentOut(
        id=reagent.id,
        lab_id=reagent.lab_id,
        lab_code=reagent.lab.code,
        name=reagent.name,
        kind="CRM" if reagent.kind == "CRM" else "REAGENT",
        unit=reagent.unit,
        min_stock=format(reagent.min_stock, "f") if reagent.min_stock is not None else None,
        stock_count_interval_days=reagent.stock_count_interval_days,
        expiry_lead_months=reagent.expiry_lead_months,
        active=reagent.active,
        current_stock=format(stock, "f"),
        usable_stock_estimate=format(usable, "f") if reagent.kind == "CRM" else None,
        recommended_lot_no=valid[0].lot_no if valid and usable > 0 else None,
        low_stock=reagent.min_stock is not None and usable < reagent.min_stock,
        last_counted_on=last.counted_on if last is not None else None,
        nearest_expiry=lots[0].expiry_date if lots else None,
        lots=[serialize_lot(reagent, lot, today=today) for lot in lots],
    )


def serialize_stock_count(count: StockCount) -> StockCountOut:
    return StockCountOut(
        id=count.id,
        reagent_id=count.reagent_id,
        quantity=format(count.quantity, "f"),
        counted_on=count.counted_on,
        counted_by=count.counted_by,
    )


def list_reagents(db: Session, user: User, *, lab_id: int | None = None) -> list[Reagent]:
    require(user, Permission.REAGENT_READ, lab_id=lab_id)
    labs = {lab_id} if lab_id is not None else visible_lab_ids(user)
    if labs is not None and not labs:
        return []
    stmt = select(Reagent).order_by(Reagent.name, Reagent.id)
    if labs is not None:
        stmt = stmt.where(Reagent.lab_id.in_(labs))
    return list(db.scalars(stmt).all())


def create_reagent(db: Session, user: User, data: ReagentCreate) -> Reagent:
    require(user, Permission.REAGENT_WRITE, lab_id=data.lab_id)
    lead = data.expiry_lead_months
    if lead is None:
        lead = int(get_setting(db, "default_expiry_lead_months"))
    _validate_expiry_lead(db, lead)
    interval = data.stock_count_interval_days
    if interval is None:
        interval = int(get_setting(db, "default_stock_count_interval_days"))
    reagent = Reagent(
        lab_id=data.lab_id,
        name=data.name,
        kind=data.kind,
        unit=data.unit,
        min_stock=_optional_quantity(data.min_stock, "min_stock"),
        stock_count_interval_days=interval,
        expiry_lead_months=lead,
        active=data.active,
    )
    db.add(reagent)
    db.flush()
    db.refresh(reagent)
    return reagent


def update_reagent(db: Session, user: User, reagent_id: int, data: ReagentUpdate) -> Reagent:
    reagent = get_reagent_or_404(db, reagent_id)
    require(user, Permission.REAGENT_WRITE, lab_id=reagent.lab_id)
    sent = data.model_fields_set
    for field in ("name", "kind", "unit", "stock_count_interval_days", "active"):
        value = getattr(data, field)
        if field in sent and value is not None:
            setattr(reagent, field, value)
    if "expiry_lead_months" in sent and data.expiry_lead_months is not None:
        _validate_expiry_lead(db, data.expiry_lead_months)
        reagent.expiry_lead_months = data.expiry_lead_months
    if "min_stock" in sent:
        reagent.min_stock = _optional_quantity(data.min_stock, "min_stock")
    db.flush()
    return reagent


def receive_lot(db: Session, user: User, reagent_id: int, data: LotCreate) -> ReagentLot:
    reagent = get_reagent_or_404(db, reagent_id)
    require(user, Permission.REAGENT_WRITE, lab_id=reagent.lab_id)
    if not reagent.active:
        raise AppError(409, "REAGENT_INACTIVE", "Odczynnik jest nieaktywny")
    lot = ReagentLot(
        reagent_id=reagent.id,
        lot_no=data.lot_no,
        expiry_date=data.expiry_date,
        quantity=_parse_quantity(data.quantity, "quantity"),
        received_on=data.received_on,
    )
    db.add(lot)
    db.flush()
    return lot


def dispose_lot(db: Session, user: User, lot_id: int, disposed_on: date) -> ReagentLot:
    lot = db.get(ReagentLot, lot_id)
    if lot is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono partii")
    require(user, Permission.REAGENT_WRITE, lab_id=lot.reagent.lab_id)
    if disposed_on < lot.received_on:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Data utylizacji jest wcześniejsza niż data przyjęcia",
            details=[{"field": "disposed_on", "message": "before received_on"}],
        )
    lot.disposed_on = disposed_on
    db.flush()
    return lot


def record_stock_count(
    db: Session, user: User, reagent_id: int, data: StockCountCreate
) -> StockCount:
    reagent = get_reagent_or_404(db, reagent_id)
    require(user, Permission.STOCK_WRITE, lab_id=reagent.lab_id)
    if not reagent.active:
        raise AppError(409, "REAGENT_INACTIVE", "Odczynnik jest nieaktywny")
    count = StockCount(
        reagent_id=reagent.id,
        quantity=_parse_quantity(data.quantity, "quantity"),
        counted_on=data.counted_on,
        counted_by=user.id,
    )
    db.add(count)
    db.flush()
    return count
