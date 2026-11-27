from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.config import get_settings


def get_today() -> date:
    """Today in the laboratory's time zone; an injectable dependency so tests can override it."""
    return datetime.now(tz=ZoneInfo(get_settings().timezone)).date()
