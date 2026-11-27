from decimal import Decimal

import pytest
from app.core.ranges import RangeResult, check_range, parse_decimal


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("3,35", "3.35"),
        (" 0,105 ", "0.105"),
        ("3.20", "3.20"),
        ("-0,001", "-0.001"),
        ("2800", "2800"),
    ],
)
def test_parse_decimal_accepts_comma_and_dot(text: str, expected: str) -> None:
    assert parse_decimal(text) == Decimal(expected)


@pytest.mark.parametrize(
    "text", ["", "  ", "abc", "1,2,3", "1.2.3", "NaN", "Infinity", "1e5", "3,", "٣"]
)
def test_parse_decimal_rejects_garbage(text: str) -> None:
    with pytest.raises(ValueError, match="not a number"):
        parse_decimal(text)


def test_so3_range_from_scope_form() -> None:
    # docs/01-zadanie.md §4: SO3 range 0.10 to 3.20 %
    lo, hi = Decimal("0.10"), Decimal("3.20")
    assert check_range(Decimal("3.20"), lo, hi) is RangeResult.IN_RANGE
    assert check_range(Decimal("3.21"), lo, hi) is RangeResult.ABOVE
    assert check_range(Decimal("0.09"), lo, hi) is RangeResult.BELOW


def test_chloride_range_keeps_precision() -> None:
    # docs/01-zadanie.md §4: chloride range 0.005 to 0.105 %
    lo, hi = Decimal("0.005"), Decimal("0.105")
    assert check_range(parse_decimal("0,1050"), lo, hi) is RangeResult.IN_RANGE
    assert check_range(parse_decimal("0,1051"), lo, hi) is RangeResult.ABOVE


def test_open_bounds() -> None:
    # consistency of standard paste has no range
    assert check_range(Decimal(999), None, None) is RangeResult.IN_RANGE
    assert check_range(Decimal(-1), Decimal(0), None) is RangeResult.BELOW
