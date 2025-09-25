"""Amenity agent handling onsite services and equipment."""

from __future__ import annotations

from typing import Any, Dict, List

from ..ai import LLMClient
from ..schemas import AgentContext, AmenityLinkRecord, AmenityTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class AmenitiesAgent(AIEnabledAgent):
    name = "amenities"
    description = "Splits raw equipment/services into structured tags."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["amenities", "equipment", "services"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=AmenityTransformation,
        )
        amenities: List[AmenityLinkRecord] = transformation.amenities
        self.telemetry.record(
            "agent.amenities.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "amenities": [amenity.model_dump() for amenity in amenities],
            },
        )
        responses = []
        for amenity in amenities:
            amenity_id = await self.supabase.lookup("ref_amenity", code=amenity.amenity_code)
            data = amenity.to_supabase(amenity_id=amenity_id)
            responses.append(
                await self.supabase.upsert(
                    "object_amenity",
                    data,
                    on_conflict="object_id,amenity_id",
                )
            )
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_amenity",
            "responses": responses,
        }


__all__ = ["AmenitiesAgent"]
