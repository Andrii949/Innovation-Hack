"""Standard laboratory equipment catalog / presets (LECO analyzers & cement lab instruments)."""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import Permission, has_permission
from app.equipment.models import EquipmentCatalogItem
from app.equipment.schemas import (
    EquipmentCatalogCreate,
    EquipmentCatalogOut,
    EquipmentCatalogUpdate,
)
from app.errors import AppError
from app.settings.service import get_setting

_SLUG_CLEAN_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class _CatalogSeed:
    slug: str
    name: str
    category: str
    manufacturer: str
    model: str
    software_version: str | None
    suggested_lab_code: str | None
    calibration_required: bool
    calibration_interval_months: int | None
    calibration_mode: str
    lead_months: int
    acceptance_criteria: str | None = None
    notes: str | None = None
    search_aliases: str | None = None


DEFAULT_EQUIPMENT_CATALOG: tuple[_CatalogSeed, ...] = (
    # --- LECO Corporation analyzers (fuels, coal, cement, clinker, raw materials) ---
    _CatalogSeed(
        slug="leco-ac600",
        name="Kalorymetr izoperiboliczny",
        category="Kalorymetry",
        manufacturer="LECO",
        model="AC600",
        software_version="Cornerstone",
        suggested_lab_code="P",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria=(
            "RSD pojemności cieplnej <= 0,10 %; zgodność z CRM kwasu benzoesowego"
        ),
        notes=(
            "Oznaczanie ciepła spalania i wartości opałowej węgla, koksu oraz paliw alternatywnych"
        ),
        search_aliases="ACO600 AC-600 leki analizator kalorymetr cieplo spalania",
    ),
    _CatalogSeed(
        slug="leco-sc628",
        name="Analizator siarki i węgla",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="SC628",
        software_version="Cornerstone",
        suggested_lab_code="P",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria=(
            "Odchylenie dla CRM węgla/cementu w granicach niepewności certyfikowanej"
        ),
        notes=(
            "Oznaczanie całkowitej zawartości siarki i węgla metodą spalania "
            "w piecu oporowym z detekcją NDIR"
        ),
        search_aliases="SC-628 S628 C628 leki siarka wegiel analizator",
    ),
    _CatalogSeed(
        slug="leco-sc832",
        name="Analizator siarki i węgla",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="SC832",
        software_version="Cornerstone",
        suggested_lab_code="P",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Błąd dla CRM siarki <= ±0,03 % S; liniowość komory NDIR potwierdzona",
        notes=(
            "Wysokoprzepustowy analizator C/S dla węgla, koksu, paliw alternatywnych, "
            "cementu i wapienia"
        ),
        search_aliases="832 S832 C832 SC-832 leki analizator siarki",
    ),
    _CatalogSeed(
        slug="leco-sc632",
        name="Analizator siarki i węgla",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="SC632",
        software_version="Chroma",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Zgodność oznaczeń SO3 / S całkowitej z CRM cementu i klinkieru",
        notes="Oznaczanie siarki i węgla w cemencie, klinkierze, gipsie i surowcach mineralnych",
        search_aliases="SC-632 leki analizator siarki cement",
    ),
    _CatalogSeed(
        slug="leco-chn628",
        name="Analizator elementarny węgla, wodoru i azotu",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="CHN628",
        software_version="Cornerstone",
        suggested_lab_code="P",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Zgodność z CRM EDTA / węgla dla C, H, N w granicach tolerancji metody",
        notes=(
            "Jednoczesne oznaczanie C, H, N w paliwach stałych, biomasie "
            "i paliwach alternatywnych RDF"
        ),
        search_aliases="CHN CHN-628 628 leki analizator wegiel wodor azot",
    ),
    _CatalogSeed(
        slug="leco-chn828",
        name="Analizator elementarny C/H/N",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="CHN828",
        software_version="Cornerstone",
        suggested_lab_code="P",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Powtarzalność i odzysk dla CRM C/H/N zgodnie z kartą kontrolną",
        notes="Analizator spalaniowy C/H/N z piecem pionowym dla laboratorium paliw",
        search_aliases="CHN CHN-828 CN828 828 leki analizator",
    ),
    _CatalogSeed(
        slug="leco-tga801",
        name="Analizator termograwimetryczny",
        category="Analizatory termograwimetryczne",
        manufacturer="LECO",
        model="TGA801",
        software_version="Cornerstone",
        suggested_lab_code="P",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Błąd wagi wewnętrznej <= ±0,0005 g; temperatura pieca ±3 °C",
        notes=(
            "Automatyczne oznaczanie wilgoci, popiołu, części lotnych "
            "i strat prażenia (LOI, do 19 próbek)"
        ),
        search_aliases="TGA TGA-801 801 leki termograwimetr straty prazenia popiol wilgoc",
    ),
    _CatalogSeed(
        slug="leco-tga701",
        name="Analizator termograwimetryczny",
        category="Analizatory termograwimetryczne",
        manufacturer="LECO",
        model="TGA701",
        software_version="TGA701 Windows",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Błąd wagi wewnętrznej <= ±0,0005 g; stabilność temperatury w 950 °C",
        notes=(
            "Oznaczanie strat prażenia (PN-EN 196-2), wilgoci i popiołu "
            "w cemencie, klinkierze i węglu"
        ),
        search_aliases="TGA TGA-701 701 leki termograwimetr straty prazenia",
    ),
    _CatalogSeed(
        slug="leco-ama254",
        name="Analizator rtęci (AAS z amalgamacją)",
        category="Spektrometria",
        manufacturer="LECO",
        model="AMA254",
        software_version="Quicksilver",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Krzywa kalibracyjna R^2 >= 0,999; odzysk CRM rtęci 90-110 %",
        notes=(
            "Absorpcyjna spektrometria atomowa techniką amalgamacji "
            "(0,010-20,0 mg/kg Hg, PB-14.NZ.PA)"
        ),
        search_aliases="AMA AMA-254 rtec Hg leki analizator rteci",
    ),
    _CatalogSeed(
        slug="leco-cs744",
        name="Analizator węgla i siarki indukcyjny",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="CS744",
        software_version="Cornerstone",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Zgodność z CRM dla C i S w matrycach nieorganicznych",
        notes=(
            "Spalanie w piecu indukcyjnym wysokiej częstotliwości dla klinkieru, żużla i surowców"
        ),
        search_aliases="CS-744 744 leki analizator",
    ),
    _CatalogSeed(
        slug="leco-cs844",
        name="Analizator węgla i siarki indukcyjny z podwójnym detektorem",
        category="Analizatory elementarne",
        manufacturer="LECO",
        model="CS844",
        software_version="Cornerstone",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Zgodność z CRM dla niskich i wysokich stężeń C oraz S",
        notes="Analizator indukcyjny C/S o rozszerzonym zakresie pomiarowym",
        search_aliases="CS-844 844 leki analizator",
    ),
    # --- Standard Cementownia Warta analytical & physical testing equipment ---
    _CatalogSeed(
        slug="radwag-as-220-r2",
        name="Waga analityczna",
        category="Wagi",
        manufacturer="Radwag",
        model="AS 220.R2",
        software_version=None,
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria="Błąd wskazania <= ±0,0005 g w pełnym zakresie do 220 g",
        notes="Waga analityczna d = 0,1 mg do naważek w analizie chemicznej cementu (PN-EN 196-2)",
        search_aliases="waga szalkowa dokladna radwag",
    ),
    _CatalogSeed(
        slug="mettler-xsr204",
        name="Waga analityczna",
        category="Wagi",
        manufacturer="Mettler Toledo",
        model="XSR204",
        software_version="LabX",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria="Błąd wskazania <= ±0,0004 g",
        notes="Waga analityczna z automatyczną adiustacją wewnętrzną FACT",
        search_aliases="mettler waga analityczna",
    ),
    _CatalogSeed(
        slug="radwag-wlc-6-a2",
        name="Waga laboratoryjna precyzyjna",
        category="Wagi",
        manufacturer="Radwag",
        model="WLC 6/A2",
        software_version=None,
        suggested_lab_code="W",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria="Błąd wskazania <= ±0,2 g",
        notes="Naważanie składników zapraw normowych (cement, piasek normowy CEN, woda)",
        search_aliases="waga techniczna precyzyjna zaprawy",
    ),
    _CatalogSeed(
        slug="testo-608-h1",
        name="Termohigrometr",
        category="Warunki środowiskowe",
        manufacturer="Testo",
        model="608-H1",
        software_version=None,
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria="Temperatura ±0,5 °C; wilgotność względna ±3 % RH",
        notes="Ciągły nadzór temperatury i wilgotności w pomieszczeniach laboratoryjnych",
        search_aliases="termometr higrometr wilgotnosciomierz",
    ),
    _CatalogSeed(
        slug="nabertherm-l9-11",
        name="Piec muflowy",
        category="Piece",
        manufacturer="Nabertherm",
        model="L 9/11",
        software_version="B510",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Rozkład i dokładność temperatury w 950 °C ±15 °C (PN-EN 196-2)",
        notes="Prażenie próbek cementu i klinkieru (straty prażenia, analizy wagowe)",
        search_aliases="piec komorowy muflowy prazenie",
    ),
    _CatalogSeed(
        slug="micromeritics-accupyc-1345",
        name="Piknometr helowy",
        category="Gęstość",
        manufacturer="Micromeritics",
        model="AccuPyc II 1345",
        software_version="AccuPyc v2",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Objętość kuli wzorcowej zgodna w granicach ±0,02 cm³",
        notes="Oznaczanie gęstości właściwej cementu i klinkieru portlandzkiego (PN-EN 196-6)",
        search_aliases="piknometr gestosc wlasciwa hel",
    ),
    _CatalogSeed(
        slug="shimadzu-uv-1900i",
        name="Spektrofotometr UV-Vis",
        category="Spektrometria",
        manufacturer="Shimadzu",
        model="UV-1900i",
        software_version="LabSolutions UV-Vis",
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria="Dokładność długości fali ±0,5 nm; fotometryczna ±0,004 Abs",
        notes=(
            "Oznaczanie rozpuszczalnego chromu (VI) w cemencie "
            "metodą spektrofotometryczną (PN-EN 196-10)"
        ),
        search_aliases="spektrofotometr chrom VI Cr",
    ),
    _CatalogSeed(
        slug="sherwood-m410",
        name="Fotometr płomieniowy",
        category="Fotometria",
        manufacturer="Sherwood",
        model="M410",
        software_version=None,
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=1,
        acceptance_criteria="Liniowość dla wzorców Na2O i K2O; dryft <= 2 %/h",
        notes="Oznaczanie zawartości alkaliów Na2O i K2O w cemencie i klinkierze (PN-EN 196-2)",
        search_aliases="fotometr plomieniowy sodu potasu alkalia",
    ),
    _CatalogSeed(
        slug="controls-automax-5",
        name="Prasa do badań wytrzymałości",
        category="Wytrzymałość",
        manufacturer="Controls",
        model="Automax 5",
        software_version="Automax Firmware",
        suggested_lab_code="W",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria=(
            "Klasa dokładności 1 wg PN-EN ISO 7500-1 i PN-EN 196-1 (błąd względny <= ±1 %)"
        ),
        notes=(
            "Badania niszczące wytrzymałości beleczek zapraw cementowych "
            "na ściskanie i zginanie (PN-EN 196-1)"
        ),
        search_aliases="prasa wytrzymalosciowa sciskanie zginanie beleczki",
    ),
    _CatalogSeed(
        slug="controls-vicamatic-2",
        name="Aparat Vicata automatyczny",
        category="Czas wiązania",
        manufacturer="Controls",
        model="Vicamatic-2",
        software_version=None,
        suggested_lab_code="W",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria=(
            "Masa części ruchomej 300 ± 1 g; średnica igły 1,13 ± 0,05 mm (PN-EN 196-3)"
        ),
        notes=(
            "Oznaczanie konsystencji normowej oraz początku i końca czasu wiązania "
            "zaczynów (PN-EN 196-3)"
        ),
        search_aliases="vicat wiazanie konsystencja igla",
    ),
    _CatalogSeed(
        slug="toni-technik-toniperm",
        name="Aparat Blaine'a",
        category="Powierzchnia właściwa",
        manufacturer="Toni Technik",
        model="ToniPERM",
        software_version=None,
        suggested_lab_code="W",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="EXTERNAL",
        lead_months=1,
        acceptance_criteria=(
            "Weryfikacja na certyfikowanym materiale odniesienia cementu wg PN-EN 196-6"
        ),
        notes=(
            "Oznaczanie powierzchni właściwej cementu metodą przepuszczalności "
            "powietrza Blaine'a (PN-EN 196-6)"
        ),
        search_aliases="blaine powierzchnia wlasciwa przemial",
    ),
    _CatalogSeed(
        slug="controls-langavant",
        name="Kalorymetr semi-adiabatyczny",
        category="Kalorymetry",
        manufacturer="Controls",
        model="Langavant",
        software_version=None,
        suggested_lab_code="W",
        calibration_required=True,
        calibration_interval_months=12,
        calibration_mode="ON_SITE",
        lead_months=2,
        acceptance_criteria="Współczynnik strat ciepła i pojemność cieplna wg PN-EN 196-9",
        notes=(
            "Oznaczanie ciepła hydratacji cementu metodą semi-adiabatyczną Langavanta (PN-EN 196-9)"
        ),
        search_aliases="cieplo hydratacji langavant kalorymetr cementu",
    ),
    _CatalogSeed(
        slug="gum-f1-500g",
        name="Wzorzec masy 500 g klasy F1",
        category="Wzorce masy",
        manufacturer="GUM",
        model="F1-500",
        software_version=None,
        suggested_lab_code="A",
        calibration_required=True,
        calibration_interval_months=24,
        calibration_mode="EXTERNAL",
        lead_months=3,
        acceptance_criteria="Błąd dopuszczalny MPE ±2,5 mg wg OIML R 111 dla klasy F1",
        notes="Odważnik wzorcowy do okresowych sprawdzeń pośrednich wag laboratoryjnych",
        search_aliases="odwaznik wzorzec masy 500g",
    ),
)


def _slugify(manufacturer: str, model: str, name: str) -> str:
    raw = f"{manufacturer}-{model}-{name}".lower()
    cleaned = _SLUG_CLEAN_RE.sub("-", raw).strip("-")
    return cleaned[:90] or "preset"


def _unique_slug(db: Session, base_slug: str) -> str:
    candidate = base_slug
    idx = 2
    while (
        db.scalars(
            select(EquipmentCatalogItem.id).where(EquipmentCatalogItem.slug == candidate)
        ).first()
        is not None
    ):
        candidate = f"{base_slug[:84]}-{idx}"
        idx += 1
    return candidate


def ensure_default_equipment_catalog(db: Session) -> bool:
    existing_slugs = set(db.scalars(select(EquipmentCatalogItem.slug)).all())
    added = False
    for spec in DEFAULT_EQUIPMENT_CATALOG:
        if spec.slug in existing_slugs:
            continue
        db.add(
            EquipmentCatalogItem(
                slug=spec.slug,
                name=spec.name,
                category=spec.category,
                manufacturer=spec.manufacturer,
                model=spec.model,
                software_version=spec.software_version,
                suggested_lab_code=spec.suggested_lab_code,
                calibration_required=spec.calibration_required,
                calibration_interval_months=spec.calibration_interval_months,
                calibration_mode=spec.calibration_mode,
                lead_months=spec.lead_months,
                acceptance_criteria=spec.acceptance_criteria,
                notes=spec.notes,
                search_aliases=spec.search_aliases,
                active=True,
            )
        )
        added = True
    if added:
        db.flush()
    return added


def serialize_catalog_item(item: EquipmentCatalogItem) -> EquipmentCatalogOut:
    return EquipmentCatalogOut(
        id=item.id,
        slug=item.slug,
        name=item.name,
        category=item.category,
        manufacturer=item.manufacturer,
        model=item.model,
        display_label=f"{item.manufacturer} {item.model} - {item.name}",
        software_version=item.software_version,
        suggested_lab_code=item.suggested_lab_code,
        calibration_required=item.calibration_required,
        calibration_interval_months=item.calibration_interval_months,
        calibration_mode=item.calibration_mode,
        lead_months=item.lead_months,
        acceptance_criteria=item.acceptance_criteria,
        notes=item.notes,
        active=item.active,
    )


def list_catalog_items(
    db: Session,
    *,
    query: str | None = None,
    manufacturer: str | None = None,
    category: str | None = None,
    lab_code: str | None = None,
    include_inactive: bool = False,
) -> list[EquipmentCatalogOut]:
    if ensure_default_equipment_catalog(db):
        db.commit()

    stmt = select(EquipmentCatalogItem).order_by(
        EquipmentCatalogItem.manufacturer,
        EquipmentCatalogItem.model,
        EquipmentCatalogItem.id,
    )
    if not include_inactive:
        stmt = stmt.where(EquipmentCatalogItem.active.is_(True))

    rows = list(db.scalars(stmt).all())

    if manufacturer:
        m_needle = manufacturer.strip().lower()
        rows = [r for r in rows if r.manufacturer.lower() == m_needle]
    if category:
        c_needle = category.strip().lower()
        rows = [r for r in rows if r.category.lower() == c_needle]
    if lab_code:
        l_needle = lab_code.strip().upper()
        rows = [r for r in rows if r.suggested_lab_code == l_needle]
    if query:
        tokens = [tok for tok in query.strip().lower().split() if tok]
        filtered: list[EquipmentCatalogItem] = []
        for r in rows:
            haystack = " ".join(
                part
                for part in (
                    r.manufacturer,
                    r.model,
                    r.name,
                    r.category,
                    r.software_version or "",
                    r.search_aliases or "",
                    r.notes or "",
                )
            ).lower()
            if all(tok in haystack for tok in tokens):
                filtered.append(r)
        rows = filtered

    return [serialize_catalog_item(r) for r in rows]


def get_catalog_item_or_404(db: Session, catalog_id: int) -> EquipmentCatalogItem:
    if ensure_default_equipment_catalog(db):
        db.commit()
    item = db.get(EquipmentCatalogItem, catalog_id)
    if item is None:
        raise AppError(404, "NOT_FOUND", "Nie znaleziono szablonu urządzenia w katalogu")
    return item


def _require_catalog_write(user: User) -> None:
    if not (
        has_permission(user, Permission.EQUIPMENT_WRITE)
        or has_permission(user, Permission.SETTINGS_WRITE)
    ):
        raise AppError(403, "FORBIDDEN", "Brak uprawnień do edycji katalogu urządzeń")


def _validate_catalog_lead_and_interval(
    db: Session,
    *,
    calibration_required: bool,
    interval: int | None,
    lead_months: int,
) -> None:
    bounds = get_setting(db, "equipment_lead_months_range")
    lo, hi = int(bounds[0]), int(bounds[1])
    if lead_months < lo or lead_months > hi:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            f"Wyprzedzenie musi mieścić się w zakresie {lo}-{hi} miesięcy",
            details=[{"field": "lead_months", "message": f"Dozwolony zakres: {lo}..{hi}"}],
        )
    if calibration_required and (interval is None or interval < 1):
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Wymagany dodatni interwał wzorcowania w miesiącach",
            details=[
                {
                    "field": "calibration_interval_months",
                    "message": "Wymagana liczba >= 1",
                }
            ],
        )


def create_catalog_item(
    db: Session,
    user: User,
    data: EquipmentCatalogCreate,
) -> EquipmentCatalogItem:
    _require_catalog_write(user)
    ensure_default_equipment_catalog(db)

    clean_name = data.name.strip()
    clean_cat = data.category.strip()
    clean_mfg = data.manufacturer.strip()
    clean_model = data.model.strip()
    if not clean_name or not clean_cat or not clean_mfg or not clean_model:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Nazwa, kategoria, producent oraz model są wymagane",
        )

    _validate_catalog_lead_and_interval(
        db,
        calibration_required=data.calibration_required,
        interval=data.calibration_interval_months,
        lead_months=data.lead_months,
    )

    slug = _unique_slug(db, _slugify(clean_mfg, clean_model, clean_name))
    item = EquipmentCatalogItem(
        slug=slug,
        name=clean_name,
        category=clean_cat,
        manufacturer=clean_mfg,
        model=clean_model,
        software_version=data.software_version.strip() if data.software_version else None,
        suggested_lab_code=data.suggested_lab_code.strip().upper()
        if data.suggested_lab_code
        else None,
        calibration_required=data.calibration_required,
        calibration_interval_months=data.calibration_interval_months
        if data.calibration_required
        else None,
        calibration_mode=data.calibration_mode,
        lead_months=data.lead_months,
        acceptance_criteria=data.acceptance_criteria,
        notes=data.notes,
        search_aliases=data.search_aliases,
        active=data.active,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def update_catalog_item(
    db: Session,
    user: User,
    catalog_id: int,
    data: EquipmentCatalogUpdate,
) -> EquipmentCatalogItem:
    _require_catalog_write(user)
    item = get_catalog_item_or_404(db, catalog_id)
    fields_set = data.model_fields_set

    for str_field in ("name", "category", "manufacturer", "model"):
        if str_field in fields_set and getattr(data, str_field) is not None:
            cleaned = str(getattr(data, str_field)).strip()
            if not cleaned:
                raise AppError(422, "VALIDATION_ERROR", f"Pole {str_field} nie może być puste")
            setattr(item, str_field, cleaned)

    for opt_field in ("software_version", "acceptance_criteria", "notes", "search_aliases"):
        if opt_field in fields_set:
            setattr(item, opt_field, getattr(data, opt_field))
    if "suggested_lab_code" in fields_set:
        item.suggested_lab_code = (
            data.suggested_lab_code.strip().upper() if data.suggested_lab_code else None
        )

    new_req = (
        data.calibration_required
        if "calibration_required" in fields_set and data.calibration_required is not None
        else item.calibration_required
    )
    new_interval = (
        data.calibration_interval_months
        if "calibration_interval_months" in fields_set
        else item.calibration_interval_months
    )
    new_lead = (
        data.lead_months
        if "lead_months" in fields_set and data.lead_months is not None
        else item.lead_months
    )
    _validate_catalog_lead_and_interval(
        db,
        calibration_required=new_req,
        interval=new_interval,
        lead_months=new_lead,
    )

    item.calibration_required = new_req
    item.calibration_interval_months = new_interval if new_req else None
    item.lead_months = new_lead
    if "calibration_mode" in fields_set and data.calibration_mode is not None:
        item.calibration_mode = data.calibration_mode
    if "active" in fields_set and data.active is not None:
        item.active = data.active

    db.flush()
    db.refresh(item)
    return item
