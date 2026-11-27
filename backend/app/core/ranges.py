"""Measured numbers and range checks (docs/02-architektura.md D7)."""

import re
from decimal import Decimal
from enum import StrEnum

# ASCII digits only: `\d` would also accept digits from other scripts, e.g. "٣".
_NUMBER = re.compile(r"-?[0-9]+(?:[.,][0-9]+)?")


class RangeResult(StrEnum):
    IN_RANGE = "IN_RANGE"
    BELOW = "BELOW"
    ABOVE = "ABOVE"


def parse_decimal(text: str) -> Decimal:
    """Parse a number typed with a decimal comma or dot; anything else raises ValueError."""
    stripped = text.strip()
    if not _NUMBER.fullmatch(stripped):
        msg = f"not a number: {text!r}"
        raise ValueError(msg)
    return Decimal(stripped.replace(",", "."))


def check_range(
    value: Decimal, min_value: Decimal | None, max_value: Decimal | None
) -> RangeResult:
    """Inclusive bounds; a missing bound is open."""
    if min_value is not None and value < min_value:
        return RangeResult.BELOW
    if max_value is not None and value > max_value:
        return RangeResult.ABOVE
    return RangeResult.IN_RANGE
