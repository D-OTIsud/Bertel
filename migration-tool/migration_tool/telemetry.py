"""Simple in-memory telemetry store used by the dashboard."""

from __future__ import annotations

import datetime as dt
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, Iterable, List


@dataclass(slots=True)
class TelemetryEvent:
    """Represent a single telemetry event."""

    type: str
    payload: Dict[str, Any]
    timestamp: dt.datetime = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    def as_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
        }


class EventLog:
    """Fixed-size FIFO log of events."""

    def __init__(self, retention: int = 200):
        self._events: Deque[TelemetryEvent] = deque(maxlen=retention)

    def record(self, event_type: str, payload: Dict[str, Any]) -> None:
        self._events.appendleft(TelemetryEvent(type=event_type, payload=payload))

    def bulk(self, events: Iterable[TelemetryEvent]) -> None:
        for event in events:
            self._events.appendleft(event)

    def snapshot(self) -> List[Dict[str, Any]]:
        return [event.as_dict() for event in self._events]

    def clear(self) -> None:
        self._events.clear()


__all__ = ["EventLog", "TelemetryEvent"]
