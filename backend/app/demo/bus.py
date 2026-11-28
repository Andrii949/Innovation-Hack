"""In-memory event bus for presenter-triggered demo signals.

Events live only in the API process and are meant to drive the app on stage, not to be
durable. Run a single uvicorn worker when using the presentation console.
"""

from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from itertools import count
from threading import Lock
from typing import Literal

DemoAction = Literal["push", "scan", "card", "toast"]


@dataclass(frozen=True, slots=True)
class DemoEvent:
    id: int
    action: DemoAction
    public_id: str | None
    code: str | None
    name: str | None
    title: str
    message: str
    source: Literal["nfc", "qr"] | None
    created_at: datetime


_events: deque[DemoEvent] = deque(maxlen=200)
_lock = Lock()
_ids = count(1)


def publish(
    *,
    action: DemoAction,
    title: str,
    message: str,
    public_id: str | None = None,
    code: str | None = None,
    name: str | None = None,
    source: Literal["nfc", "qr"] | None = None,
) -> DemoEvent:
    with _lock:
        event = DemoEvent(
            id=next(_ids),
            action=action,
            public_id=public_id,
            code=code,
            name=name,
            title=title,
            message=message,
            source=source,
            created_at=datetime.now(UTC),
        )
        _events.append(event)
        return event


def since(after: int) -> list[DemoEvent]:
    with _lock:
        return [event for event in _events if event.id > after]
