"""Location agent handling addresses and geospatial data."""

from __future__ import annotations

from typing import Any, Dict, List

from ..ai import LLMClient
from ..schemas import AgentContext, LocationRecord, LocationTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class LocationAgent(AIEnabledAgent):
    name = "location"
    description = "Normalises addressing and coordinate data."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
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
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=LocationTransformation,
            context=context.snapshot(),
        )
        locations: List[LocationRecord] = transformation.locations
        self.telemetry.record(
            "agent.location.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "locations": [record.model_dump() for record in locations],
            },
        )
        responses = []
        for record in locations:
            if not record.object_id:
                continue
            responses.append(
                await self.supabase.upsert("object_location", record.to_supabase())
            )

        context.share(
            self.name,
            {
                "locations": [record.model_dump() for record in locations],
                "responses": responses,
            },
            overwrite=True,
        )
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_location",
            "responses": responses,
        }


__all__ = ["LocationAgent"]
