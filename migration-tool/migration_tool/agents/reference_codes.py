"""Agent responsible for managing and caching reference codes."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..schemas import AgentContext
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class ReferenceCodeAgent(Agent):
    name = "reference_codes"
    description = "Provides cached lookup/creation of reference codes across agents."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["requests"]
        self._memory: Dict[Tuple[str, str], Optional[str]] = {}

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        raw_requests = payload.get("requests", [])
        if isinstance(raw_requests, dict):
            request_list: List[Any] = [raw_requests]
        elif isinstance(raw_requests, Iterable):
            request_list = list(raw_requests)
        else:
            request_list = []

        results: List[Dict[str, Any]] = []
        for request in request_list:
            if not isinstance(request, dict):
                continue
            domain = request.get("domain")
            code = request.get("code")
            if not domain or not code:
                continue
            identifier = await self.ensure(
                domain=domain,
                code=str(code),
                name=request.get("name"),
                description=request.get("description"),
                metadata=request.get("metadata"),
            )
            results.append({"domain": domain, "code": code, "id": identifier})

        context.share(
            self.name,
            {"requests": request_list, "results": results},
            overwrite=True,
        )
        return {"status": "ok", "operation": "lookup", "results": results}

    async def ensure(
        self,
        *,
        domain: str,
        code: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        normalized = self.supabase.normalize_code(code)
        cache_key = (domain, normalized)
        if cache_key in self._memory:
            return self._memory[cache_key]

        identifier = await self.supabase.lookup(f"ref_code_{domain}", code=normalized)
        if identifier:
            self._memory[cache_key] = identifier
            return identifier

        identifier = await self.supabase.ensure_code(
            domain=domain,
            code=normalized,
            name=name or code,
            description=description,
            metadata=metadata,
        )
        self._memory[cache_key] = identifier
        return identifier

    async def lookup(self, *, domain: str, code: str) -> Optional[str]:
        normalized = self.supabase.normalize_code(code)
        cache_key = (domain, normalized)
        if cache_key in self._memory:
            return self._memory[cache_key]
        identifier = await self.supabase.lookup(f"ref_code_{domain}", code=normalized)
        self._memory[cache_key] = identifier
        return identifier


__all__ = ["ReferenceCodeAgent"]
