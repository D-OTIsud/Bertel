"""Amenity agent handling onsite services and equipment."""

from __future__ import annotations

from typing import Any, Dict, List

from ..schemas import AgentContext
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class AmenitiesAgent(Agent):
    name = "amenities"
    description = "Splits raw equipment/services into structured tags."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["amenities", "equipment", "services"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        raw_values: List[str] = []
        for key in ("amenities", "equipment", "services"):
            value = payload.get(key)
            if isinstance(value, list):
                raw_values.extend(value)
            elif isinstance(value, str):
                raw_values.extend([segment.strip() for segment in value.split(",") if segment.strip()])

        tags = sorted(set(raw_values))
        data = {
            "object_id": payload.get("establishment_id"),
            "tags": tags,
        }
        self.telemetry.record(
            "agent.amenities.transform",
            {"context": context.model_dump(), "payload": payload, "tags": tags},
        )
        response = await self.supabase.upsert("object_amenities", data, on_conflict="object_id")
        return {"status": "ok", "operation": "upsert", "table": "object_amenities", "response": response}


__all__ = ["AmenitiesAgent"]
