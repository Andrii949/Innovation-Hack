"""Idempotent starter and demo data seeder for Cementownia Warta (T18)."""

from __future__ import annotations

import argparse
import csv
import importlib
import importlib.util
import secrets
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.context import audit_context
from app.audit.listener import register_audit_listener
from app.auth.models import Lab, User
from app.auth.security import hash_password, verify_password
from app.auth.service import ensure_default_roles
from app.core.dates import add_months, next_due_month
from app.db import SessionLocal
from app.equipment.models import (
    Calibration,
    CalibrationPoint,
    CheckPlan,
    CheckRecord,
    Equipment,
    EquipmentAuthorization,
)
from app.forms.models import FormTemplate
from app.forms.validation import FieldSpec, validate_field_specs

if TYPE_CHECKING:
    from collections.abc import Sequence


@dataclass(frozen=True)
class _EquipmentSpec:
    lab_code: str
    number: str
    public_id: str
    name: str
    category: str
    manufacturer: str
    model: str
    location: str
    calibration_mode: str
    calibration_required: bool
    interval_months: int | None
    lead_months: int
    calibrated_offset_months: int | None
    vendor: str
    point: tuple[str, str, str, str] | None
    authorize_worker: bool = False
    withdrawn_reason: str | None = None


_EQUIPMENT_SPECS: tuple[_EquipmentSpec, ...] = (
    _EquipmentSpec(
        lab_code="A",
        number="121",
        public_id="CWA000121A",
        name="Waga analityczna",
        category="Wagi",
        manufacturer="Radwag",
        model="AS 220.R2",
        location="Pracownia A — stół wagowy 1",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=-6,
        vendor="RADWAG Wagi Elektroniczne",
        point=("200 g", "-0.0002", "0.0004", "g"),
        authorize_worker=True,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="122",
        public_id="CWA000122A",
        name="Termohigrometr",
        category="Warunki środowiskowe",
        manufacturer="Testo",
        model="608-H1",
        location="Pracownia A — ściana północna",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=-6,
        vendor="Laboratorium Wzorcujące Testo",
        point=("20 °C", "0.1", "0.3", "°C"),
        authorize_worker=True,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="123",
        public_id="CWA000123A",
        name="Termometr szklany laboratoryjny",
        category="Temperatura",
        manufacturer="GUM",
        model="TL-01",
        location="Pracownia A — szafa 2",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=24,
        lead_months=2,
        calibrated_offset_months=-23,
        vendor="OUM Łódź",
        point=("20 °C", "-0.05", "0.10", "°C"),
        authorize_worker=True,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="124",
        public_id="CWA000124A",
        name="Wzorzec masy 500 g",
        category="Wzorce masy",
        manufacturer="GUM",
        model="F1-500",
        location="Pracownia A — sejf wzorców",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=24,
        lead_months=3,
        calibrated_offset_months=-26,
        vendor="GUM Warszawa",
        point=("500 g", "-0.001", "0.002", "g"),
        authorize_worker=False,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="125",
        public_id="CWA000125A",
        name="Piec muflowy",
        category="Piece",
        manufacturer="Nabertherm",
        model="L 9/11",
        location="Pracownia A — stanowisko prażenia",
        calibration_mode="ON_SITE",
        calibration_required=True,
        interval_months=12,
        lead_months=2,
        calibrated_offset_months=-11,
        vendor="Termo-Cal Serwis",
        point=("950 °C", "1.5", "3.0", "°C"),
        authorize_worker=True,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="126",
        public_id="CWA000126A",
        name="Piknometr helowy",
        category="Gęstość",
        manufacturer="Micromeritics",
        model="AccuPyc II 1345",
        location="Pracownia A — stół 3",
        calibration_mode="ON_SITE",
        calibration_required=True,
        interval_months=12,
        lead_months=2,
        calibrated_offset_months=-4,
        vendor="Micromeritics Service PL",
        point=("10 cm³", "0.002", "0.005", "cm³"),
        authorize_worker=True,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="127",
        public_id="CWA000127A",
        name="Spektrofotometr UV-Vis",
        category="Spektrometria",
        manufacturer="Shimadzu",
        model="UV-1900i",
        location="Pracownia A — stół optyczny",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=-15,
        vendor="Shimadzu Polska",
        point=("412 nm", "0.2", "0.5", "nm"),
        authorize_worker=True,
    ),
    _EquipmentSpec(
        lab_code="A",
        number="128",
        public_id="CWA000128A",
        name="Fotometr płomieniowy",
        category="Fotometria",
        manufacturer="Sherwood",
        model="M410",
        location="Pracownia A — magazyn serwisu",
        calibration_mode="ON_SITE",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=None,
        vendor="LabService",
        point=None,
        authorize_worker=False,
        withdrawn_reason="Uszkodzenie detektora — wycofany do naprawy",
    ),
    _EquipmentSpec(
        lab_code="W",
        number="201",
        public_id="CWW000201W",
        name="Prasa do badań wytrzymałości",
        category="Wytrzymałość",
        manufacturer="Controls",
        model="Automax 5",
        location="Pracownia W — hala pras",
        calibration_mode="ON_SITE",
        calibration_required=True,
        interval_months=12,
        lead_months=2,
        calibrated_offset_months=-5,
        vendor="Controls Polska",
        point=("100 kN", "0.15", "0.40", "kN"),
    ),
    _EquipmentSpec(
        lab_code="W",
        number="202",
        public_id="CWW000202W",
        name="Aparat Vicata",
        category="Czas wiązania",
        manufacturer="Controls",
        model="Vicamatic-2",
        location="Pracownia W — stół zaczynów",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=-11,
        vendor="Controls Polska",
        point=("10 mm", "0.02", "0.05", "mm"),
    ),
    _EquipmentSpec(
        lab_code="W",
        number="203",
        public_id="CWW000203W",
        name="Pierścienie Le Chateliera",
        category="Stałość objętości",
        manufacturer="Toni Technik",
        model="LC-Set",
        location="Pracownia W — regał 4",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=24,
        lead_months=1,
        calibrated_offset_months=-25,
        vendor="OUM Katowice",
        point=("10 mm", "0.05", "0.10", "mm"),
    ),
    _EquipmentSpec(
        lab_code="W",
        number="204",
        public_id="CWW000204W",
        name="Aparat Blaine'a",
        category="Miałkość",
        manufacturer="Toni Technik",
        model="ToniPERM",
        location="Pracownia W — stół 2",
        calibration_mode="EXTERNAL",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=-3,
        vendor="ICiMB Kraków",
        point=("3500 cm²/g", "15", "35", "cm²/g"),
    ),
    _EquipmentSpec(
        lab_code="W",
        number="205",
        public_id="CWW000205W",
        name="Komora klimatyczna dojrzewania próbek",
        category="Warunki środowiskowe",
        manufacturer="Memmert",
        model="HPP260",
        location="Pracownia W — strefa dojrzewania",
        calibration_mode="ON_SITE",
        calibration_required=True,
        interval_months=12,
        lead_months=1,
        calibrated_offset_months=None,
        vendor="Memmert Serwis",
        point=None,
    ),
    _EquipmentSpec(
        lab_code="P",
        number="301",
        public_id="CWP000301P",
        name="Kalorymetr semi-adiabatyczny",
        category="Kalorymetria",
        manufacturer="IKA",
        model="C 6000",
        location="Pracownia P — stanowisko 1",
        calibration_mode="ON_SITE",
        calibration_required=True,
        interval_months=12,
        lead_months=2,
        calibrated_offset_months=-8,
        vendor="IKA Poland",
        point=("300 J/g", "1.2", "2.5", "J/g"),
    ),
    _EquipmentSpec(
        lab_code="P",
        number="302",
        public_id="CWP000302P",
        name="Mieszadło magnetyczne pomocnicze",
        category="Pomocnicze",
        manufacturer="IKA",
        model="RCT basic",
        location="Pracownia P — stół 2",
        calibration_mode="EXTERNAL",
        calibration_required=False,
        interval_months=None,
        lead_months=1,
        calibrated_offset_months=None,
        vendor="",
        point=None,
    ),
)


def _upsert_lab(db: Session, *, code: str, name: str) -> Lab:
    lab = db.scalars(select(Lab).where(Lab.code == code)).first()
    if lab is None:
        lab = Lab(code=code, name=name, active=True)
        db.add(lab)
        db.flush()
    return lab


def _upsert_user(
    db: Session,
    *,
    login_name: str,
    full_name: str,
    role_id: int,
    all_labs: bool,
    labs: Sequence[Lab],
    env_key: str,
) -> User:
    import os

    raw_secret = os.environ.get(env_key, "").strip()
    user = db.scalars(select(User).where(User.login == login_name)).first()
    if user is None:
        initial_secret = raw_secret if raw_secret else secrets.token_urlsafe(24)
        user = User(
            login=login_name,
            full_name=full_name,
            password_hash=hash_password(initial_secret),
            role_id=role_id,
            all_labs=all_labs,
            active=True,
        )
        user.labs = list(labs)
        db.add(user)
        db.flush()
        return user

    if raw_secret and not verify_password(raw_secret, user.password_hash):
        user.password_hash = hash_password(raw_secret)
    target_lab_ids = {lab.id for lab in labs}
    if {lab.id for lab in user.labs} != target_lab_ids:
        user.labs = list(labs)
    db.flush()
    return user


def _upsert_form_template(
    db: Session,
    *,
    name: str,
    raw_fields: list[dict[str, Any]],
) -> FormTemplate:
    existing = db.scalars(select(FormTemplate).where(FormTemplate.name == name)).first()
    if existing is not None:
        return existing
    specs = [FieldSpec.model_validate(item) for item in raw_fields]
    tpl = FormTemplate(name=name, fields=validate_field_specs(specs))
    db.add(tpl)
    db.flush()
    return tpl


def _upsert_check_plan(
    db: Session,
    *,
    equipment: Equipment,
    name: str,
    interval_months: int,
    lead_months: int,
    form_template: FormTemplate,
) -> CheckPlan:
    plan = db.scalars(
        select(CheckPlan).where(
            CheckPlan.equipment_id == equipment.id,
            CheckPlan.name == name,
        )
    ).first()
    if plan is not None:
        return plan
    plan = CheckPlan(
        equipment_id=equipment.id,
        name=name,
        interval_months=interval_months,
        lead_months=lead_months,
        form_template_id=form_template.id,
        active=True,
    )
    db.add(plan)
    db.flush()
    return plan


def _upsert_check_record(
    db: Session,
    *,
    plan: CheckPlan,
    performed_on: date,
    values: dict[str, Any],
    performed_by: int,
) -> None:
    existing = db.scalars(
        select(CheckRecord).where(
            CheckRecord.check_plan_id == plan.id,
            CheckRecord.performed_on == performed_on,
        )
    ).first()
    if existing is not None:
        return
    rec = CheckRecord(
        check_plan_id=plan.id,
        performed_on=performed_on,
        values=values,
        out_of_range=False,
        note="Wpis startowy demo",
        performed_by=performed_by,
    )
    db.add(rec)
    db.flush()


def _seed_optional_reagents(
    db: Session,
    *,
    labs: dict[str, Lab],
    today: date,
    worker_id: int,
) -> None:
    if (
        importlib.util.find_spec("app.reagents") is None
        or importlib.util.find_spec("app.reagents.models") is None
    ):
        return
    reagents_mod = importlib.import_module("app.reagents.models")
    reagent_cls = getattr(reagents_mod, "Reagent", None)
    lot_cls = getattr(reagents_mod, "ReagentLot", None)
    stock_count_cls = getattr(reagents_mod, "StockCount", None)
    if reagent_cls is None or lot_cls is None or stock_count_cls is None:
        return

    lab_a = labs["A"]
    specs = [
        (
            "Kwas solny 0,1 M",
            "REAGENT",
            "ml",
            Decimal("600"),
            30,
            1,
            "HCl-2609",
            Decimal("450"),
            12,
        ),
        ("Chlorek baru", "REAGENT", "g", Decimal("250"), 30, 1, "BaCl2-2611", Decimal("850"), 18),
        ("CRM cementu 2401", "CRM", "op.", Decimal("1"), 30, 6, "CRM-2401-A", Decimal("2"), 5),
    ]
    for name, kind, unit, min_stock, interval_days, lead_m, lot_no, qty, exp_months in specs:
        reagent = db.scalars(
            select(reagent_cls).where(reagent_cls.lab_id == lab_a.id, reagent_cls.name == name)
        ).first()
        if reagent is None:
            reagent = reagent_cls(
                lab_id=lab_a.id,
                name=name,
                kind=kind,
                unit=unit,
                min_stock=min_stock,
                stock_count_interval_days=interval_days,
                expiry_lead_months=lead_m,
                active=True,
            )
            db.add(reagent)
            db.flush()

        lot = db.scalars(
            select(lot_cls).where(lot_cls.reagent_id == reagent.id, lot_cls.lot_no == lot_no)
        ).first()
        if lot is None:
            db.add(
                lot_cls(
                    reagent_id=reagent.id,
                    lot_no=lot_no,
                    expiry_date=add_months(today, exp_months),
                    quantity=qty,
                    received_on=today - timedelta(days=20),
                )
            )
            db.flush()

        counted_on = today - timedelta(days=5)
        cnt = db.scalars(
            select(stock_count_cls).where(
                stock_count_cls.reagent_id == reagent.id,
                stock_count_cls.counted_on == counted_on,
            )
        ).first()
        if cnt is None:
            db.add(
                stock_count_cls(
                    reagent_id=reagent.id,
                    quantity=qty,
                    counted_on=counted_on,
                    counted_by=worker_id,
                )
            )
            db.flush()


def _seed_optional_results(
    db: Session,
    *,
    today: date,
    worker_id: int,
) -> None:
    if (
        importlib.util.find_spec("app.results") is None
        or importlib.util.find_spec("app.results.models") is None
    ):
        return
    results_mod = importlib.import_module("app.results.models")
    param_cls = getattr(results_mod, "TestParameter", None)
    result_cls = getattr(results_mod, "TestResult", None)
    if param_cls is None or result_cls is None:
        return

    csv_path = Path(__file__).resolve().parents[2] / "data" / "seed" / "cement_parameters.csv"
    if csv_path.is_file():
        with csv_path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                existing = db.scalars(
                    select(param_cls).where(
                        param_cls.material == row["material"],
                        param_cls.name == row["name"],
                        param_cls.unit == row["unit"],
                    )
                ).first()
                if existing is None:
                    db.add(
                        param_cls(
                            material=row["material"],
                            name=row["name"],
                            unit=row["unit"],
                            min_value=Decimal(row["min_value"]) if row["min_value"] else None,
                            max_value=Decimal(row["max_value"]) if row["max_value"] else None,
                            method=row["method"],
                            accredited=row["accredited"] == "true",
                            active=True,
                        )
                    )
            db.flush()

    so3 = db.scalars(select(param_cls).where(param_cls.name == "zawartość SO₃")).first()
    if so3 is None:
        return

    samples = [
        ("C-26/091", Decimal("2.41"), True, today - timedelta(days=75)),
        ("C-26/104", Decimal("2.88"), True, today - timedelta(days=50)),
        ("C-26/118", Decimal("3.02"), True, today - timedelta(days=25)),
        ("C-26/135", Decimal("3.35"), False, today - timedelta(days=7)),
    ]
    for sample_label, value, in_range, sampled_day in samples:
        existing_res = db.scalars(
            select(result_cls).where(
                result_cls.parameter_id == so3.id,
                result_cls.sample_label == sample_label,
            )
        ).first()
        if existing_res is None:
            db.add(
                result_cls(
                    parameter_id=so3.id,
                    sample_label=sample_label,
                    value=value,
                    min_snapshot=so3.min_value,
                    max_snapshot=so3.max_value,
                    in_range=in_range,
                    created_by=worker_id,
                    created_at=datetime(
                        sampled_day.year,
                        sampled_day.month,
                        sampled_day.day,
                        10,
                        0,
                        tzinfo=UTC,
                    ),
                )
            )
    db.flush()


def seed(db: Session, *, today: date) -> None:
    """Populate starter labs, users, equipment, check plans, and optional domain data."""
    register_audit_listener(Session)
    roles = ensure_default_roles(db)

    lab_a = _upsert_lab(db, code="A", name="Analityczna")
    lab_w = _upsert_lab(db, code="W", name="Wytrzymałościowa")
    lab_p = _upsert_lab(db, code="P", name="Paliw")
    labs_by_code = {"A": lab_a, "W": lab_w, "P": lab_p}

    admin = _upsert_user(
        db,
        login_name="admin",
        full_name="Specjalista ds. wyposażenia",
        role_id=roles["admin"].id,
        all_labs=True,
        labs=(),
        env_key="SEED_ADMIN_PASSWORD",
    )
    _upsert_user(
        db,
        login_name="kierownik",
        full_name="dr Anita Smolarek-Nowak",
        role_id=roles["manager"].id,
        all_labs=True,
        labs=(),
        env_key="SEED_MANAGER_PASSWORD",
    )
    laborant = _upsert_user(
        db,
        login_name="laborant",
        full_name="Laborant Pracowni A",
        role_id=roles["worker"].id,
        all_labs=False,
        labs=(lab_a,),
        env_key="SEED_WORKER_PASSWORD",
    )

    first_of_today = date(today.year, today.month, 1)
    seeded_equipment: dict[str, Equipment] = {}

    with audit_context(user_id=admin.id, reason="Dane startowe i demo"):
        for spec in _EQUIPMENT_SPECS:
            lab = labs_by_code[spec.lab_code]
            eq = db.scalars(
                select(Equipment).where(
                    Equipment.lab_id == lab.id,
                    Equipment.number == spec.number,
                )
            ).first()
            if eq is None:
                withdrawn_at = (
                    datetime(today.year, today.month, today.day, 8, 0, tzinfo=UTC)
                    if spec.withdrawn_reason is not None
                    else None
                )
                eq = Equipment(
                    public_id=spec.public_id,
                    lab_id=lab.id,
                    number=spec.number,
                    name=spec.name,
                    category=spec.category,
                    manufacturer=spec.manufacturer,
                    model=spec.model,
                    location=spec.location,
                    calibration_required=spec.calibration_required,
                    calibration_interval_months=spec.interval_months,
                    calibration_mode=spec.calibration_mode,
                    lead_months=spec.lead_months,
                    withdrawn_at=withdrawn_at,
                    withdrawn_reason=spec.withdrawn_reason,
                )
                db.add(eq)
                db.flush()
            seeded_equipment[f"{spec.number}/{spec.lab_code}"] = eq

            if spec.authorize_worker:
                auth_row = db.scalars(
                    select(EquipmentAuthorization).where(
                        EquipmentAuthorization.equipment_id == eq.id,
                        EquipmentAuthorization.user_id == laborant.id,
                    )
                ).first()
                if auth_row is None:
                    db.add(EquipmentAuthorization(equipment_id=eq.id, user_id=laborant.id))
                    db.flush()

            if spec.calibrated_offset_months is not None and spec.interval_months is not None:
                cal_month = add_months(first_of_today, spec.calibrated_offset_months)
                cal = db.scalars(
                    select(Calibration).where(
                        Calibration.equipment_id == eq.id,
                        Calibration.calibrated_month == cal_month,
                    )
                ).first()
                if cal is None:
                    points = (
                        [
                            CalibrationPoint(
                                point=spec.point[0],
                                error=Decimal(spec.point[1]),
                                uncertainty=Decimal(spec.point[2]),
                                unit=spec.point[3],
                            )
                        ]
                        if spec.point is not None
                        else []
                    )
                    cal = Calibration(
                        equipment_id=eq.id,
                        calibrated_month=cal_month,
                        vendor=spec.vendor or None,
                        certificate_no=f"SW/{cal_month.year}/{spec.lab_code}{spec.number}",
                        result="OK",
                        next_due_month=next_due_month(cal_month, spec.interval_months),
                        note="Przeniesione z ewidencji papierowej",
                        source="MANUAL",
                        created_by=admin.id,
                        points=points,
                    )
                    db.add(cal)
                    db.flush()

        env_tpl = _upsert_form_template(
            db,
            name="Kontrola warunków środowiskowych",
            raw_fields=[
                {
                    "key": "temperature_c",
                    "label": "Temperatura",
                    "type": "number",
                    "unit": "°C",
                    "min": "18.0",
                    "max": "22.0",
                    "required": True,
                },
                {
                    "key": "humidity_pct",
                    "label": "Wilgotność względna",
                    "type": "number",
                    "unit": "%",
                    "min": "40",
                    "max": "70",
                    "required": True,
                },
            ],
        )
        scale_tpl = _upsert_form_template(
            db,
            name="Sprawdzenie wagi wzorcem 500 g",
            raw_fields=[
                {
                    "key": "reading_g",
                    "label": "Wskazanie wagi",
                    "type": "number",
                    "unit": "g",
                    "min": "499.998",
                    "max": "500.002",
                    "required": True,
                },
                {
                    "key": "level_ok",
                    "label": "Poziomnica w środku",
                    "type": "bool",
                    "required": True,
                },
            ],
        )

        prev_month_start = add_months(first_of_today, -1)
        temp_plan_a = _upsert_check_plan(
            db,
            equipment=seeded_equipment["122/A"],
            name="Sprawdzenie temperatury",
            interval_months=1,
            lead_months=0,
            form_template=env_tpl,
        )
        _upsert_check_record(
            db,
            plan=temp_plan_a,
            performed_on=date(today.year, today.month, min(today.day, 5)),
            values={"temperature_c": "20.4", "humidity_pct": "52"},
            performed_by=laborant.id,
        )

        scale_plan_a = _upsert_check_plan(
            db,
            equipment=seeded_equipment["121/A"],
            name="Sprawdzenie wagi",
            interval_months=3,
            lead_months=0,
            form_template=scale_tpl,
        )
        _upsert_check_record(
            db,
            plan=scale_plan_a,
            performed_on=prev_month_start.replace(day=10),
            values={"reading_g": "500.000", "level_ok": True},
            performed_by=laborant.id,
        )

        _upsert_check_plan(
            db,
            equipment=seeded_equipment["205/W"],
            name="Sprawdzenie temperatury",
            interval_months=1,
            lead_months=0,
            form_template=env_tpl,
        )

        _seed_optional_reagents(db, labs=labs_by_code, today=today, worker_id=laborant.id)
        _seed_optional_results(db, today=today, worker_id=laborant.id)


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for `python -m app.seed`."""
    parser = argparse.ArgumentParser(description="Seed starter and demo data.")
    parser.add_argument(
        "--today",
        type=date.fromisoformat,
        default=None,
        help="Override reference date (YYYY-MM-DD).",
    )
    args = parser.parse_args(argv)
    target_today = args.today if args.today is not None else datetime.now(UTC).date()

    with SessionLocal() as db:
        seed(db, today=target_today)
        db.commit()

    sys.stdout.write(f"Seeded starter/demo data for {target_today.isoformat()}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
