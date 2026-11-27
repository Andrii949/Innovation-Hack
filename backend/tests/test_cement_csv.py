import csv
from decimal import Decimal
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "data" / "seed" / "cement_parameters.csv"
EXPECTED_COLUMNS = [
    "material",
    "name",
    "unit",
    "min_value",
    "max_value",
    "method",
    "accredited",
]


def _load_rows() -> list[dict[str, str]]:
    with CSV_PATH.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames == EXPECTED_COLUMNS
        return list(reader)


@pytest.mark.req("F9", "17025-7.11.2")
def test_cement_csv_has_25_valid_rows() -> None:
    assert CSV_PATH.is_file()
    rows = _load_rows()
    assert len(rows) == 25

    for row in rows:
        assert row["material"]
        assert row["name"]
        assert row["unit"]
        assert row["method"]
        assert row["accredited"] in {"true", "false"}

        min_raw = row["min_value"]
        max_raw = row["max_value"]
        assert "," not in min_raw
        assert "," not in max_raw

        if min_raw or max_raw:
            assert Decimal(min_raw) <= Decimal(max_raw)


@pytest.mark.req("F9", "17025-7.11.2")
def test_cement_csv_key_parameters_and_open_consistency() -> None:
    by_name = {row["name"]: row for row in _load_rows()}
    assert len(by_name) == 25

    so3 = by_name["zawartość SO₃"]
    assert (so3["min_value"], so3["max_value"], so3["accredited"]) == ("0.10", "3.20", "false")

    chloride = by_name["zawartość Cl⁻"]
    assert (chloride["min_value"], chloride["max_value"], chloride["accredited"]) == (
        "0.005",
        "0.105",
        "false",
    )

    consistency = by_name["konsystencja zaczynów normowych"]
    assert (consistency["min_value"], consistency["max_value"], consistency["accredited"]) == (
        "",
        "",
        "true",
    )


@pytest.mark.req("F9", "17025-7.11.2")
def test_cement_csv_accredited_counts_and_strength_splits() -> None:
    rows = _load_rows()
    accredited_count = sum(1 for row in rows if row["accredited"] == "true")
    non_accredited_count = sum(1 for row in rows if row["accredited"] == "false")
    assert (accredited_count, non_accredited_count) == (7, 18)

    by_name = {row["name"]: row for row in rows}
    assert by_name["wytrzymałość zapraw na ściskanie (kN)"]["unit"] == "kN"
    assert by_name["wytrzymałość zapraw na ściskanie (MPa)"]["unit"] == "MPa"
    assert by_name["wytrzymałość zapraw na zginanie (kN)"]["unit"] == "kN"
    assert by_name["wytrzymałość zapraw na zginanie (MPa)"]["unit"] == "MPa"
