"""Supabase wrapper that degrades gracefully when credentials are missing."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from supabase import Client, create_client

from .telemetry import EventLog


class SupabaseService:
    """Facade encapsulating Supabase interactions."""

    def __init__(self, url: Optional[str], key: Optional[str], telemetry: EventLog):
        self.telemetry = telemetry
        self._client: Optional[Client] = None
        self._lookup_cache: Dict[Tuple[str, str, str], Optional[str]] = {}
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

    async def upsert(
        self,
        table: str,
        data: Union[Dict[str, Any], Sequence[Dict[str, Any]]],
        *,
        on_conflict: Optional[str] = None,
    ) -> Dict[str, Any]:
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

    async def lookup(self, table: str, *, code: str, code_field: str = "code") -> Optional[str]:
        """Resolve a reference code to its primary key."""

        cache_key = (table, code_field, code)
        if cache_key in self._lookup_cache:
            return self._lookup_cache[cache_key]

        if not code:
            self._lookup_cache[cache_key] = None
            return None

        if not self._client:
            self._lookup_cache[cache_key] = None
            self.telemetry.record(
                "supabase.lookup.skipped",
                {"table": table, "code": code, "reason": "no credentials"},
            )
            return None

        def _execute() -> Optional[str]:
            response = (
                self._client.table(table)
                .select("id")
                .eq(code_field, code)
                .limit(1)
                .execute()
            )
            data: Optional[List[Dict[str, Any]]] = None
            if hasattr(response, "data"):
                data = response.data  # type: ignore[assignment]
            elif isinstance(response, dict):
                data = response.get("data")  # type: ignore[assignment]
            else:
                data = getattr(response, "__dict__", {}).get("data")
            if data:
                first = data[0]
                if isinstance(first, dict):
                    return str(first.get("id")) if first.get("id") else None
            return None

        identifier = await asyncio.to_thread(_execute)
        self._lookup_cache[cache_key] = identifier
        self.telemetry.record(
            "supabase.lookup",
            {"table": table, "code": code, "code_field": code_field, "resolved_id": identifier},
        )
        return identifier


__all__ = ["SupabaseService"]
