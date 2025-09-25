"""Location agent handling addresses and geospatial data."""

from __future__ import annotations

from typing import Any, Dict

from ..schemas import AgentContext
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class LocationAgent(Agent):
    name = "location"
    description = "Normalises addressing and coordinate data."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = [
            "address_line1",
            "address_line2",
            "postal_code",
            "city",
            "country",
            "latitude",
            "longitude",
            "meeting_point",
        ]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        coordinates = payload.get("coordinates", {})
        data = {
            "object_id": payload.get("establishment_id"),
            "address_line1": payload.get("address_line1"),
            "address_line2": payload.get("address_line2"),
            "postal_code": payload.get("postal_code"),
            "city": payload.get("city"),
            "country": payload.get("country"),
            "latitude": coordinates.get("lat") or payload.get("latitude"),
            "longitude": coordinates.get("lon") or payload.get("longitude"),
            "meeting_point": payload.get("meeting_point"),
        }
        self.telemetry.record(
            "agent.location.transform",
            {"context": context.model_dump(), "payload": payload, "data": data},
        )
        response = await self.supabase.upsert("object_location", data, on_conflict="object_id")
        return {"status": "ok", "operation": "upsert", "table": "object_location", "response": response}


__all__ = ["LocationAgent"]
