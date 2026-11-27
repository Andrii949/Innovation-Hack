import itertools
from collections.abc import Callable, Iterator, Sequence
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from app.auth.models import Lab, User, UserSession
from app.auth.security import hash_password, new_token
from app.auth.service import ensure_default_roles
from app.config import get_settings
from app.core.clock import get_today
from app.db import get_db
from app.equipment._core import next_due_month
from app.equipment.models import Calibration, CalibrationPoint, CheckPlan, Equipment
from app.equipment.service import new_public_id, parse_month_str
from app.forms.models import FormTemplate
from app.forms.validation import FieldSpec, validate_field_specs
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select
from sqlalchemy.orm import Session

TODAY = date(2026, 11, 27)
BACKEND_ROOT = Path(__file__).resolve().parents[1]
_PASSWORD_HASH_CACHE: dict[str, str] = {}
_USER_SEQ = itertools.count(1)
_DEFAULT_CRED = "-".join(("test", "pass", "123"))


def _cached_hash(password: str) -> str:
    if password not in _PASSWORD_HASH_CACHE:
        _PASSWORD_HASH_CACHE[password] = hash_password(password)
    return _PASSWORD_HASH_CACHE[password]


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    test_engine = create_engine(get_settings().database_url, pool_pre_ping=True)

    alembic_config = Config(str(BACKEND_ROOT / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    command.upgrade(alembic_config, "head")

    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """Session inside a transaction rolled back after each test."""
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(
            bind=connection,
            autoflush=False,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()


@pytest.fixture
def client(db: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    settings = get_settings()
    monkeypatch.setattr(settings, "files_dir", tmp_path / "files")

    def _override_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_today] = lambda: TODAY
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_lab(db: Session) -> Callable[..., Lab]:
    def _make_lab(code: str = "A", name: str = "Analityczna", *, active: bool = True) -> Lab:
        existing = db.scalars(select(Lab).where(Lab.code == code)).first()
        if existing is not None:
            return existing
        lab = Lab(code=code, name=name, active=active)
        db.add(lab)
        db.flush()
        return lab

    return _make_lab


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    def _make_user(
        role: str = "worker",
        labs: Sequence[Lab] = (),
        all_labs: bool = False,
        password: str | None = None,
        login: str | None = None,
        full_name: str | None = None,
        active: bool = True,
    ) -> User:
        roles = ensure_default_roles(db)
        seq = next(_USER_SEQ)
        login_name = login or f"{role}_{seq}"
        raw_secret = password if password is not None else _DEFAULT_CRED
        user = User(
            login=login_name,
            full_name=full_name or f"Test {login_name}",
            password_hash=_cached_hash(raw_secret),
            role_id=roles[role].id,
            all_labs=all_labs,
            active=active,
        )
        user.labs = list(labs)
        db.add(user)
        db.flush()
        db.refresh(user)
        return user

    return _make_user


@pytest.fixture
def auth(db: Session) -> Callable[[User], dict[str, str]]:
    def _auth(user: User) -> dict[str, str]:
        raw_token, token_digest = new_token()
        session_row = UserSession(
            user_id=user.id,
            token_hash=token_digest,
            expires_at=datetime.now(UTC) + timedelta(hours=12),
            revoked_at=None,
            device_info="pytest",
        )
        db.add(session_row)
        db.flush()
        return {"Authorization": f"Bearer {raw_token}"}

    return _auth


@pytest.fixture
def make_equipment(db: Session) -> Callable[..., Equipment]:
    def _make_equipment(
        lab: Lab,
        number: str = "121",
        name: str = "Waga analityczna",
        interval: int | None = 12,
        lead: int = 1,
        last_calibrated_month: str | None = None,
        *,
        calibration_required: bool = True,
        calibration_mode: str = "EXTERNAL",
    ) -> Equipment:
        eq = Equipment(
            public_id=new_public_id(),
            lab_id=lab.id,
            number=number,
            name=name,
            calibration_required=calibration_required,
            calibration_interval_months=interval if calibration_required else None,
            calibration_mode=calibration_mode,
            lead_months=lead,
        )
        db.add(eq)
        db.flush()
        db.refresh(eq)
        if last_calibrated_month is not None:
            cal_date = parse_month_str(last_calibrated_month)
            due = next_due_month(cal_date, interval) if interval is not None else None
            cal = Calibration(
                equipment_id=eq.id,
                calibrated_month=cal_date,
                result="OK",
                next_due_month=due,
                note="Przeniesione z ewidencji papierowej",
                source="MANUAL",
            )
            db.add(cal)
            db.flush()
        return eq

    return _make_equipment


@pytest.fixture
def make_calibration(db: Session) -> Callable[..., Calibration]:
    def _make_calibration(
        eq: Equipment,
        month: str,
        result: str = "OK",
        *,
        vendor: str = "GUM",
        certificate_no: str | None = None,
    ) -> Calibration:
        cal_date = parse_month_str(month)
        due = (
            next_due_month(cal_date, eq.calibration_interval_months)
            if eq.calibration_required and eq.calibration_interval_months is not None
            else None
        )
        cal = Calibration(
            equipment_id=eq.id,
            calibrated_month=cal_date,
            vendor=vendor,
            certificate_no=certificate_no,
            result=result,
            next_due_month=due,
            source="MANUAL",
            points=[
                CalibrationPoint(
                    point="1",
                    error=Decimal("0"),
                    uncertainty=Decimal("0.01"),
                    unit="j.",
                )
            ],
        )
        db.add(cal)
        db.flush()
        db.refresh(cal)
        return cal

    return _make_calibration


@pytest.fixture
def make_check_plan(db: Session) -> Callable[..., CheckPlan]:
    def _make_check_plan(
        eq: Equipment,
        fields: list[dict[str, Any]],
        interval: int = 1,
        lead: int = 0,
        name: str = "Sprawdzenie okresowe",
    ) -> CheckPlan:
        specs = [FieldSpec.model_validate(f) for f in fields]
        tpl = FormTemplate(name=f"Szablon {name}", fields=validate_field_specs(specs))
        db.add(tpl)
        db.flush()
        plan = CheckPlan(
            equipment_id=eq.id,
            name=name,
            interval_months=interval,
            lead_months=lead,
            form_template_id=tpl.id,
            active=True,
        )
        db.add(plan)
        db.flush()
        db.refresh(plan)
        return plan

    return _make_check_plan
