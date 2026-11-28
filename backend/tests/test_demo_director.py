from datetime import date

import pytest
from app.auth.models import User
from app.core.db_security import ensure_db_roles
from app.demo_director import (
    main as director_main,
)
from app.demo_director import (
    prepare_clean_stage,
    stage_status,
    trigger_manager_report,
    trigger_out_of_range_check,
    trigger_out_of_range_result,
    trigger_time_jump,
)
from app.notifications.models import Notification, NotificationKind
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

TODAY = date(2026, 11, 27)


def _unread_for(db: Session, login_name: str) -> list[Notification]:
    user = db.scalars(select(User).where(User.login == login_name)).one()
    return list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.read_at.is_(None),
                Notification.resolved_at.is_(None),
            )
        ).all()
    )


@pytest.mark.req("F3", "F5", "F9", "F11")
def test_demo_director_triggers_all_stage_scenarios_and_resets_cleanly(db: Session) -> None:
    prep = prepare_clean_stage(db, today=TODAY)
    assert prep.created_notifications == 0
    assert _unread_for(db, "admin") == []
    assert _unread_for(db, "kierownik") == []

    # 1) Out-of-range check from worker -> admin gets CHECK_OUT_OF_RANGE
    chk = trigger_out_of_range_check(db, temperature="23,5", performed_on=TODAY)
    assert chk.created_notifications >= 1
    admin_unread = _unread_for(db, "admin")
    assert any(n.kind == NotificationKind.CHECK_OUT_OF_RANGE.value for n in admin_unread)

    # 2) Out-of-range cement SO3 result -> admin gets RESULT_OUT_OF_RANGE
    res = trigger_out_of_range_result(db, value="3,35")
    assert res.created_notifications >= 1
    admin_unread = _unread_for(db, "admin")
    assert any(n.kind == NotificationKind.RESULT_OUT_OF_RANGE.value for n in admin_unread)

    # 3) Manager PDF report -> kierownik gets REPORT_READY
    rep = trigger_manager_report(db, today=TODAY)
    assert rep.created_notifications >= 1
    mgr_unread = _unread_for(db, "kierownik")
    assert any(n.kind == NotificationKind.REPORT_READY.value for n in mgr_unread)

    # 4) Time jump forward -> scheduled deadline notifications fire, and after reset can fire again
    jump_date = date(2027, 2, 15)
    jump1 = trigger_time_jump(db, target_date=jump_date)
    assert jump1.created_notifications >= 1

    prepare_clean_stage(db, today=TODAY)
    assert db.scalar(select(func.count(Notification.id))) == 0

    jump2 = trigger_time_jump(db, target_date=jump_date)
    assert jump2.created_notifications == jump1.created_notifications


@pytest.mark.req("17025-7.5.2", "17025-7.11.3")
def test_demo_director_runs_under_least_privilege_app_role_and_cli(
    db: Session,
    capsys: pytest.CaptureFixture[str],
) -> None:
    ensure_db_roles(db.connection(), app_user="_test_lab_app")
    db.execute(text("SET LOCAL ROLE _test_lab_app"))
    prepare_clean_stage(db, today=TODAY)
    trigger_out_of_range_check(db, temperature="24,1", performed_on=TODAY)
    st = stage_status(db)
    db.execute(text("RESET ROLE"))

    assert st["admin"] >= 1
    exit_code = director_main(["--action", "status"], db=db)
    assert exit_code == 0
    assert "admin" in capsys.readouterr().out


@pytest.mark.req("F3")
def test_demo_director_interactive_menu_loop(
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    prepare_clean_stage(db, today=TODAY)
    inputs = iter(["2", "3", "5", "q"])
    monkeypatch.setattr("builtins.input", lambda: next(inputs))

    exit_code = director_main([], db=db)
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "Stage Director" in out
    assert "Recorded check" in out
    assert "Recorded result" in out
    assert len(_unread_for(db, "admin")) == 2
