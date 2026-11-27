from collections.abc import Callable
from datetime import date

import pytest
from app.auth.models import Lab, User
from app.equipment.models import Calibration, CheckPlan, CheckRecord, Equipment
from app.notifications.models import Notification, NotificationKind
from app.notifications.service import generate_notifications
from app.results.models import TestParameter
from app.worker import run_once
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

TODAY = date(2026, 11, 27)
MakeLab = Callable[..., Lab]
MakeUser = Callable[..., User]
MakeEquipment = Callable[..., Equipment]
Auth = Callable[[User], dict[str, str]]

TEMP_FIELDS = [
    {
        "key": "temp",
        "label": "Temperatura",
        "type": "number",
        "unit": "°C",
        "min": "18",
        "max": "22",
        "required": True,
    }
]


@pytest.fixture
def lab_a(make_lab: MakeLab) -> Lab:
    return make_lab("A")


@pytest.fixture
def lab_w(make_lab: MakeLab) -> Lab:
    return make_lab("W", name="Wytrzymałościowa")


@pytest.fixture
def admin_a(make_user: MakeUser, lab_a: Lab) -> User:
    return make_user("admin", labs=[lab_a])


@pytest.fixture
def admin_w(make_user: MakeUser, lab_w: Lab) -> User:
    return make_user("admin", labs=[lab_w])


@pytest.fixture
def overdue_in_a(make_equipment: MakeEquipment, lab_a: Lab) -> Equipment:
    # calibrated 10/2025, every 12 months -> due 10/2026, overdue on 27.11.2026
    return make_equipment(lab_a, number="7", interval=12, lead=1, last_calibrated_month="2025-10")


def notifications_for(db: Session, user: User) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification).where(Notification.user_id == user.id).order_by(Notification.id)
        ).all()
    )


@pytest.mark.usefixtures("overdue_in_a")
def test_generate_is_idempotent_and_respects_scope(
    db: Session, admin_a: User, admin_w: User
) -> None:
    assert generate_notifications(db, today=TODAY) == 1
    assert generate_notifications(db, today=TODAY) == 0
    assert len(notifications_for(db, admin_a)) == 1
    assert notifications_for(db, admin_w) == []
    assert notifications_for(db, admin_a)[0].kind == NotificationKind.CALIBRATION_DUE


@pytest.mark.usefixtures("overdue_in_a")
def test_read_notification_is_not_created_again(db: Session, admin_a: User) -> None:
    # a second run (or a second worker) hits the unique (user_id, dedupe_key) and skips it
    generate_notifications(db, today=TODAY)
    db.execute(update(Notification).values(read_at=Notification.created_at))

    assert generate_notifications(db, today=TODAY) == 0
    assert len(notifications_for(db, admin_a)) == 1


def test_stage_change_creates_second_notification(
    db: Session, make_equipment: MakeEquipment, lab_a: Lab, admin_a: User
) -> None:
    # due 12/2026 with 1 month lead: DUE_SOON in November, OVERDUE in January
    make_equipment(lab_a, number="8", interval=12, lead=1, last_calibrated_month="2025-12")

    assert generate_notifications(db, today=TODAY) == 1
    assert generate_notifications(db, today=date(2027, 1, 2)) == 1

    first, second = notifications_for(db, admin_a)
    assert first.resolved_at is not None
    assert second.resolved_at is None
    assert "Po terminie" in second.title


def test_new_calibration_resolves_open_notification(
    db: Session, overdue_in_a: Equipment, admin_a: User
) -> None:
    generate_notifications(db, today=TODAY)
    db.add(
        Calibration(
            equipment_id=overdue_in_a.id,
            calibrated_month=date(2026, 11, 1),
            result="OK",
            next_due_month=date(2027, 11, 1),
            source="MANUAL",
        )
    )
    db.flush()

    assert generate_notifications(db, today=TODAY) == 0
    assert notifications_for(db, admin_a)[0].resolved_at is not None


def test_check_out_of_range_notifies_lab_admins_now(
    client: TestClient,
    db: Session,
    make_equipment: MakeEquipment,
    make_check_plan: Callable[..., CheckPlan],
    lab_a: Lab,
    admin_a: User,
    admin_w: User,
    auth: Auth,
) -> None:
    plan = make_check_plan(make_equipment(lab_a, number="9"), TEMP_FIELDS)

    response = client.post(
        f"/api/check-plans/{plan.id}/records",
        headers=auth(admin_a),
        json={"performed_on": "2026-11-27", "values": {"temp": "23,5"}},
    )

    assert response.status_code == 201
    assert [n.kind for n in notifications_for(db, admin_a)] == ["CHECK_OUT_OF_RANGE"]
    assert notifications_for(db, admin_w) == []


def test_result_out_of_range_notifies_all_admins(
    client: TestClient,
    db: Session,
    make_parameter: Callable[..., TestParameter],
    make_user: MakeUser,
    admin_a: User,
    admin_w: User,
    auth: Auth,
) -> None:
    param = make_parameter()
    worker = make_user("worker", all_labs=True)

    response = client.post(
        "/api/test-results",
        headers=auth(worker),
        json={"parameter_id": param.id, "sample_label": "Próbka 1", "value": "3,35"},
    )

    assert response.status_code == 201
    assert [n.kind for n in notifications_for(db, admin_a)] == ["RESULT_OUT_OF_RANGE"]
    assert [n.kind for n in notifications_for(db, admin_w)] == ["RESULT_OUT_OF_RANGE"]
    assert notifications_for(db, worker) == []


@pytest.mark.usefixtures("overdue_in_a")
def test_disabled_rule_creates_nothing(
    client: TestClient, db: Session, admin_a: User, auth: Auth
) -> None:
    rules = client.get("/api/notification-rules", headers=auth(admin_a)).json()
    calibration = next(r for r in rules if r["kind"] == "CALIBRATION_DUE")

    response = client.put(
        "/api/notification-rules",
        headers=auth(admin_a),
        json=[{**calibration, "enabled": False}],
    )

    assert response.status_code == 200
    assert generate_notifications(db, today=TODAY) == 0


def test_worker_cannot_change_rules(
    client: TestClient, make_user: MakeUser, lab_a: Lab, auth: Auth
) -> None:
    response = client.put(
        "/api/notification-rules",
        headers=auth(make_user("worker", labs=[lab_a])),
        json=[],
    )

    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


@pytest.mark.usefixtures("overdue_in_a")
def test_run_once_accepts_today_override(db: Session, admin_a: User) -> None:
    assert run_once(today=date(2026, 12, 15), db=db) == 1
    assert len(notifications_for(db, admin_a)) == 1


@pytest.mark.usefixtures("overdue_in_a")
def test_list_and_mark_read(
    client: TestClient, db: Session, admin_a: User, admin_w: User, auth: Auth
) -> None:
    generate_notifications(db, today=TODAY)
    headers = auth(admin_a)

    unread = client.get("/api/notifications", headers=headers, params={"unread": True}).json()
    foreign = client.post(f"/api/notifications/{unread[0]['id']}/read", headers=auth(admin_w))
    marked = client.post(f"/api/notifications/{unread[0]['id']}/read", headers=headers)
    after = client.get("/api/notifications", headers=headers, params={"unread": True}).json()

    assert [n["kind"] for n in unread] == ["CALIBRATION_DUE"]
    assert foreign.status_code == 404
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None
    assert after == []


def test_check_due_reaches_lab_workers(
    db: Session,
    make_equipment: MakeEquipment,
    make_check_plan: Callable[..., CheckPlan],
    make_user: MakeUser,
    lab_a: Lab,
    lab_w: Lab,
) -> None:
    plan = make_check_plan(make_equipment(lab_a, number="10"), TEMP_FIELDS, interval=1, lead=0)
    worker_a = make_user("worker", labs=[lab_a])
    worker_w = make_user("worker", labs=[lab_w])
    admin = make_user("admin", labs=[lab_a])
    # last check 05.10.2026, monthly, no lead -> due 11/2026 -> DUE_SOON on 27.11.2026
    db.add(
        CheckRecord(
            check_plan_id=plan.id,
            performed_on=date(2026, 10, 5),
            values={"temp": "20"},
            out_of_range=False,
            performed_by=admin.id,
        )
    )
    db.flush()

    generate_notifications(db, today=TODAY)

    assert [n.kind for n in notifications_for(db, worker_a)] == ["CHECK_DUE"]
    assert notifications_for(db, worker_w) == []
