from enum import StrEnum


class Status(StrEnum):
    """Status of an item with a deadline (docs/02-architektura.md §4.2)."""

    OK = "OK"
    DUE_SOON = "DUE_SOON"
    OVERDUE = "OVERDUE"
    NO_DATA = "NO_DATA"
    WITHDRAWN = "WITHDRAWN"
    NOT_REQUIRED = "NOT_REQUIRED"
    LOW = "LOW"
    COUNT_DUE = "COUNT_DUE"
