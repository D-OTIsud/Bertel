"""Supabase wrapper that degrades gracefully when credentials are missing."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from supabase import Client, create_client

from .telemetry import EventLog


class SupabaseService:
    """Facade encapsulating Supabase interactions."""

    def __init__(self, url: Optional[str], key: Optional[str], telemetry: EventLog):
        self.telemetry = telemetry
        self._client: Optional[Client] = None
        if url and key:
            self._client = create_client(url, key)
            self.telemetry.record(
                "supabase.connected",
                {"url": url},
            )
        else:
            self.telemetry.record(
                "supabase.disabled",
                {"reason": "missing credentials"},
            )

    @property
    def client(self) -> Optional[Client]:
        return self._client

    async def upsert(self, table: str, data: Dict[str, Any], *, on_conflict: Optional[str] = None) -> Dict[str, Any]:
        """Upsert data into a given table."""

        if not self._client:
            payload = {
                "table": table,
                "data": data,
                "on_conflict": on_conflict,
            }
            self.telemetry.record("supabase.skipped", payload)
            return {"status": "skipped", "reason": "no credentials", "payload": payload}

        def _execute() -> Dict[str, Any]:
            query = self._client.table(table).upsert(data)
            if on_conflict:
                query = query.on_conflict(on_conflict)
            response = query.execute()
            return getattr(response, "model_dump", lambda: response.__dict__)()

        try:
            result = await asyncio.to_thread(_execute)
            self.telemetry.record(
                "supabase.upsert",
                {"table": table, "data": data, "on_conflict": on_conflict, "response": result},
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive logging
            self.telemetry.record(
                "supabase.error",
                {"table": table, "data": data, "error": str(exc)},
            )
            raise


__all__ = ["SupabaseService"]
