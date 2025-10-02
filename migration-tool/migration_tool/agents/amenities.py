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
            context=context.snapshot(),
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
        responses: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        for amenity in amenities:
            amenity.object_id = amenity.object_id or context.object_id
            if not amenity.object_id:
                skipped.append(
                    {
                        "amenity": amenity.model_dump(),
                        "reason": "missing_object_id",
                    }
                )
                self.telemetry.record(
                    "agent.amenities.skip_missing_object_id",
                    {
                        "context": context.model_dump(),
                        "amenity": amenity.model_dump(),
                    },
                )
                continue
            amenity_id = await self.supabase.ensure_amenity(
                code=amenity.amenity_code,
                name=amenity.amenity_name or amenity.raw_label,
                family_code=amenity.amenity_family_code,
            )
            if not amenity_id:
                skipped.append(
                    {
                        "amenity": amenity.model_dump(),
                        "reason": "unresolved_amenity",
                    }
                )
                self.telemetry.record(
                    "agent.amenities.skip_unresolved_amenity",
                    {
                        "context": context.model_dump(),
                        "amenity": amenity.model_dump(),
                    },
                )
                continue
            data = amenity.to_supabase(amenity_id=amenity_id)
            responses.append(
                await self.supabase.upsert(
                    "object_amenity",
                    data,
                    on_conflict="object_id,amenity_id",
                )
            )
        context.share(
            self.name,
            {
                "amenities": [amenity.model_dump() for amenity in amenities],
                "responses": responses,
                "skipped": skipped,
            },
            overwrite=True,
        )
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_amenity",
            "responses": responses,
            "skipped": skipped,
        }


__all__ = ["AmenitiesAgent"]
