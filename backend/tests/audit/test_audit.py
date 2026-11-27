from typing import Any

from app.audit.context import audit_context
from app.audit.models import AuditLog
from app.audit.service import log_event
from app.settings.models import Setting
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session


def test_update_records_before_and_after(db: Session) -> None:
    setting = Setting(key="default_equipment_lead_months", value=1)
    db.add(setting)
    db.flush()

    with audit_context(user_id=7, reason="test"):
        setting.value = 2
        db.flush()

    updates = db.scalars(
        select(AuditLog).where(AuditLog.entity == "setting", AuditLog.action == "update")
    ).all()
    assert len(updates) == 1
    entry = updates[0]
    assert entry.entity_id == "default_equipment_lead_months"
    assert entry.before == {"value": 1}
    assert entry.after == {"value": 2}
    assert entry.user_id == 7
    assert entry.reason == "test"


def test_create_and_delete_are_recorded(db: Session) -> None:
    with audit_context(user_id=3, reason="init"):
        setting = Setting(key="max_upload_mb", value=15)
        db.add(setting)
        db.flush()

    with audit_context(user_id=4, reason="cleanup"):
        db.delete(setting)
        db.flush()

    rows = db.scalars(
        select(AuditLog)
        .where(AuditLog.entity == "setting", AuditLog.entity_id == "max_upload_mb")
        .order_by(AuditLog.id)
    ).all()
    assert [row.action for row in rows] == ["create", "delete"]
    assert rows[0].before is None
    assert rows[0].after == {"key": "max_upload_mb", "value": 15}
    assert rows[0].user_id == 3
    assert rows[1].before == {"key": "max_upload_mb", "value": 15}
    assert rows[1].after is None
    assert rows[1].user_id == 4
    assert rows[1].reason == "cleanup"


def test_audit_rows_are_not_audited(db: Session) -> None:
    db.add(Setting(key="session_ttl_hours", value=8))
    db.flush()

    rows = db.scalars(select(AuditLog)).all()
    assert len(rows) == 1
    assert rows[0].entity == "setting"


def test_log_event_writes_reject(db: Session) -> None:
    log_event(
        db,
        action="reject",
        entity="test_result",
        entity_id=None,
        after={"value": "3,35"},
        user_id=7,
        reason="out_of_range",
    )
    db.flush()

    row = db.scalars(select(AuditLog).where(AuditLog.action == "reject")).one()
    assert row.entity == "test_result"
    assert row.entity_id is None
    assert row.after == {"value": "3,35"}
    assert row.user_id == 7
    assert row.reason == "out_of_range"


def test_get_audit_endpoint_filters(
    client: TestClient,
    db: Session,
    make_user: Any,
    auth: Any,
) -> None:
    admin = make_user("admin", all_labs=True)
    with audit_context(user_id=1, reason="cfg"):
        db.add(Setting(key="worker_interval_minutes", value=30))
        db.flush()

    response = client.get(
        "/api/audit?entity=setting&entity_id=worker_interval_minutes",
        headers=auth(admin),
    )
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["action"] == "create"
    assert items[0]["entity"] == "setting"
