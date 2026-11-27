from collections.abc import Callable
from datetime import date
from decimal import Decimal

from app.auth.models import Lab, User
from app.core.status import Status
from app.reagents.models import Reagent, ReagentLot, StockCount
from app.reagents.service import current_stock
from app.schedule.service import DueKind, list_due_items
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

TODAY = date(2026, 11, 27)
MakeLab = Callable[..., Lab]
MakeUser = Callable[..., User]
MakeReagent = Callable[..., Reagent]
MakeLot = Callable[..., ReagentLot]
MakeCount = Callable[..., StockCount]
Auth = Callable[[User], dict[str, str]]


def test_current_stock_is_last_count_plus_later_receipts(
    db: Session,
    make_lab: MakeLab,
    make_reagent: MakeReagent,
    make_lot: MakeLot,
    make_count: MakeCount,
) -> None:
    r = make_reagent(make_lab("A"))
    make_lot(r, "1000", received_on=date(2026, 10, 20), expiry=date(2027, 10, 1))  # before count
    make_count(r, "500", counted_on=date(2026, 11, 1))
    make_lot(r, "1000", date(2026, 11, 1), date(2027, 11, 1), lot_no="L2")  # same day as count
    make_lot(r, "1000", date(2026, 11, 10), date(2027, 11, 1), lot_no="L3")

    assert current_stock(db, r.id) == Decimal(1500)


def test_stock_without_count_is_sum_of_lots_still_in_use(
    db: Session, make_lab: MakeLab, make_reagent: MakeReagent, make_lot: MakeLot
) -> None:
    r = make_reagent(make_lab("A"))
    make_lot(r, "1000", date(2026, 10, 1), date(2027, 10, 1))
    disposed = make_lot(r, "250", date(2026, 10, 2), date(2026, 11, 1), lot_no="L2")
    disposed.disposed_on = date(2026, 11, 2)
    db.flush()

    assert current_stock(db, r.id) == Decimal(1000)


def test_low_stock_in_schedule(
    db: Session, make_lab: MakeLab, make_reagent: MakeReagent, make_count: MakeCount
) -> None:
    r = make_reagent(make_lab("A"), min_stock="600")
    make_count(r, "500", counted_on=date(2026, 11, 20))

    items = list_due_items(db, today=TODAY, kinds={DueKind.LOW_STOCK})

    assert [(i.ref_id, i.status, i.due) for i in items] == [(r.id, Status.LOW, date(2026, 11, 20))]


def test_lot_expiry_uses_lead_months(
    db: Session, make_lab: MakeLab, make_reagent: MakeReagent, make_lot: MakeLot
) -> None:
    crm = make_reagent(make_lab("A"), name="CRM cementu", unit="szt.", kind="CRM", expiry_lead=6)
    make_lot(crm, "2", date(2026, 6, 1), date(2027, 5, 31))

    before = list_due_items(db, today=TODAY, kinds={DueKind.LOT_EXPIRY})
    after = list_due_items(db, today=date(2026, 11, 30), kinds={DueKind.LOT_EXPIRY})

    assert before == []
    assert [(i.status, i.valid_until) for i in after] == [(Status.DUE_SOON, date(2027, 5, 31))]


def test_disposed_lot_is_ignored(
    db: Session, make_lab: MakeLab, make_reagent: MakeReagent, make_lot: MakeLot
) -> None:
    r = make_reagent(make_lab("A"))
    lot = make_lot(r, "1000", date(2026, 1, 1), date(2026, 6, 30))
    lot.disposed_on = date(2026, 7, 1)
    db.flush()

    assert list_due_items(db, today=TODAY, kinds={DueKind.LOT_EXPIRY}) == []


def test_stock_count_due_after_interval(
    db: Session, make_lab: MakeLab, make_reagent: MakeReagent, make_count: MakeCount
) -> None:
    r = make_reagent(make_lab("A"), min_stock=None, interval_days=7)
    make_count(r, "800", counted_on=date(2026, 11, 15))

    items = list_due_items(db, today=TODAY, kinds={DueKind.STOCK_COUNT})

    assert [(i.status, i.due) for i in items] == [(Status.COUNT_DUE, date(2026, 11, 22))]


def test_worker_counts_own_lab_and_sees_low_stock(
    client: TestClient,
    make_lab: MakeLab,
    make_reagent: MakeReagent,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    lab_a = make_lab("A")
    r = make_reagent(lab_a, min_stock="600")
    headers = auth(make_user("worker", labs=[lab_a]))

    counted = client.post(
        f"/api/reagents/{r.id}/stock-counts",
        headers=headers,
        json={"quantity": "500,5", "counted_on": "2026-11-27"},
    )
    listed = {x["id"]: x for x in client.get("/api/reagents", headers=headers).json()}

    assert counted.status_code == 201
    assert listed[r.id]["current_stock"] == "500.5"
    assert listed[r.id]["low_stock"] is True


def test_worker_counts_only_own_lab(
    client: TestClient,
    make_lab: MakeLab,
    make_reagent: MakeReagent,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    r = make_reagent(make_lab("A"))
    worker_w = make_user("worker", labs=[make_lab("W", name="Wytrzymałościowa")])

    response = client.post(
        f"/api/reagents/{r.id}/stock-counts",
        headers=auth(worker_w),
        json={"quantity": "500", "counted_on": "2026-11-27"},
    )

    assert response.status_code == 403
    assert response.json()["error"] == "LAB_OUT_OF_SCOPE"


def test_invalid_quantity_is_422(
    client: TestClient,
    make_lab: MakeLab,
    make_reagent: MakeReagent,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    lab_a = make_lab("A")
    r = make_reagent(lab_a)

    response = client.post(
        f"/api/reagents/{r.id}/stock-counts",
        headers=auth(make_user("worker", labs=[lab_a])),
        json={"quantity": "pół butelki", "counted_on": "2026-11-27"},
    )

    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_NUMBER"


def test_worker_cannot_create_reagent(
    client: TestClient, make_lab: MakeLab, make_user: MakeUser, auth: Auth
) -> None:
    lab_a = make_lab("A")

    response = client.post(
        "/api/reagents",
        headers=auth(make_user("worker", labs=[lab_a])),
        json={"lab_id": lab_a.id, "name": "Kwas solny", "unit": "ml"},
    )

    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


def test_admin_creates_reagent_with_defaults_and_rejects_bad_lead(
    client: TestClient, make_lab: MakeLab, make_user: MakeUser, auth: Auth
) -> None:
    lab_a = make_lab("A")
    headers = auth(make_user("admin", all_labs=True))

    created = client.post(
        "/api/reagents",
        headers=headers,
        json={"lab_id": lab_a.id, "name": "Chlorek baru", "unit": "ml", "min_stock": "200"},
    )
    bad_lead = client.post(
        "/api/reagents",
        headers=headers,
        json={"lab_id": lab_a.id, "name": "CRM", "unit": "szt.", "expiry_lead_months": 13},
    )

    assert created.status_code == 201
    assert created.json()["stock_count_interval_days"] == 30
    assert created.json()["expiry_lead_months"] == 1
    assert bad_lead.status_code == 422
    assert bad_lead.json()["error"] == "VALIDATION_ERROR"


def test_admin_receives_and_disposes_lot(
    client: TestClient,
    make_lab: MakeLab,
    make_reagent: MakeReagent,
    make_user: MakeUser,
    auth: Auth,
) -> None:
    r = make_reagent(make_lab("A"), min_stock=None)
    headers = auth(make_user("admin", all_labs=True))

    received = client.post(
        f"/api/reagents/{r.id}/lots",
        headers=headers,
        json={
            "lot_no": "B-77",
            "expiry_date": "2026-12-15",
            "quantity": "1000",
            "received_on": "2026-11-20",
        },
    )
    lot_id = received.json()["id"]
    listed = {x["id"]: x for x in client.get("/api/reagents", headers=headers).json()}
    disposed = client.patch(
        f"/api/lots/{lot_id}", headers=headers, json={"disposed_on": "2026-11-27"}
    )
    after = {x["id"]: x for x in client.get("/api/reagents", headers=headers).json()}

    assert received.status_code == 201
    assert listed[r.id]["current_stock"] == "1000"
    assert listed[r.id]["nearest_expiry"] == "2026-12-15"
    assert [lot["status"] for lot in listed[r.id]["lots"]] == ["DUE_SOON"]
    assert disposed.status_code == 200
    assert after[r.id]["lots"] == []
    assert after[r.id]["current_stock"] == "0"
