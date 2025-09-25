"""Identity agent responsible for the canonical establishment record."""

from __future__ import annotations

from typing import Any, Dict

from ..schemas import AgentContext
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class IdentityAgent(Agent):
    name = "identity"
    description = "Creates or updates the canonical establishment entry."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = [
            "establishment_id",
            "establishment_name",
            "category",
            "subcategory",
            "description",
            "legacy_ids",
        ]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        data = {
            "object_id": payload.get("establishment_id"),
            "name": payload.get("establishment_name"),
            "category": payload.get("category"),
            "subcategory": payload.get("subcategory"),
            "description": payload.get("description"),
            "legacy_ids": payload.get("legacy_ids"),
        }
        self.telemetry.record(
            "agent.identity.transform",
            {"context": context.model_dump(), "payload": payload, "data": data},
        )
        response = await self.supabase.upsert("object", data, on_conflict="object_id")
        return {"status": "ok", "operation": "upsert", "table": "object", "response": response}


__all__ = ["IdentityAgent"]
