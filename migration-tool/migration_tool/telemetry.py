"""Simple in-memory telemetry store used by the dashboard."""

from __future__ import annotations

import datetime as dt
from collections import deque
import asyncio
from typing import Any, Deque, Dict, Iterable, List, Set
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
        self._listeners: Set[asyncio.Queue] = set()

    def record(self, event_type: str, payload: Dict[str, Any]) -> None:
        event = TelemetryEvent(type=event_type, payload=payload)
        self._events.appendleft(event)
        self._fan_out(event.as_dict())

    def bulk(self, events: Iterable[TelemetryEvent]) -> None:
        for event in events:
            self._events.appendleft(event)
            self._fan_out(event.as_dict())

    def snapshot(self) -> List[Dict[str, Any]]:
        return [event.as_dict() for event in self._events]

    def clear(self) -> None:
        self._events.clear()
        self._fan_out({"type": "telemetry.cleared", "payload": {}, "timestamp": dt.datetime.now(dt.timezone.utc).isoformat()})

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._listeners.discard(queue)

    def _fan_out(self, event: Dict[str, Any]) -> None:
        for queue in list(self._listeners):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass


__all__ = ["EventLog", "TelemetryEvent"]
