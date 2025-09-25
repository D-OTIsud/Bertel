"""Webhook notifier used for unresolved fragments."""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx

from .telemetry import EventLog


class WebhookNotifier:
    """Send asynchronous notifications to an external system."""

    def __init__(self, url: Optional[str], telemetry: EventLog):
        self.url = url
        self.telemetry = telemetry
        if not url:
            self.telemetry.record(
                "webhook.disabled",
                {"reason": "missing url"},
            )

    async def notify(self, payload: Dict[str, Any]) -> None:
        if not self.url:
            self.telemetry.record("webhook.skipped", payload)
            return

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.url, json=payload, timeout=10)
                response.raise_for_status()
                self.telemetry.record(
                    "webhook.sent",
                    {"payload": payload, "status_code": response.status_code},
                )
            except httpx.HTTPError as exc:  # pragma: no cover - network failure
                self.telemetry.record(
                    "webhook.error",
                    {"payload": payload, "error": str(exc)},
                )


__all__ = ["WebhookNotifier"]
