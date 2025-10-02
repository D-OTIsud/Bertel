from __future__ import annotations

from typing import Any, Dict

from ..ai import LLMClient
from ..schemas import AgentContext, PetPolicyTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class PetPolicyAgent(AIEnabledAgent):
    """Agent that records pet policy information for an establishment."""

    name = "pet_policy"
    description = "Stores whether pets are accepted and associated notes."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["pets_allowed", "pet_policy", "animaux"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=PetPolicyTransformation,
            context=context.snapshot(),
        )
        record = transformation.pet_policy
        if not record or record.accepted is None and not record.conditions:
            context.share(
                self.name,
                {"pet_policy": None, "status": "no_data"},
                overwrite=True,
            )
            return {
                "status": "ok",
                "operation": "no_data",
                "message": "No pet policy information provided",
            }

        record.object_id = record.object_id or context.object_id
        if not record.object_id:
            self.telemetry.record(
                "agent.pet_policy.skip_missing_object_id",
                {
                    "context": context.model_dump(),
                    "payload": payload,
                    "record": record.model_dump(),
                },
            )
            context.share(
                self.name,
                {
                    "pet_policy": record.model_dump(),
                    "status": "skipped",
                    "reason": "missing_object_id",
                },
                overwrite=True,
            )
            return {
                "status": "ok",
                "operation": "skipped",
                "message": "Pet policy skipped due to missing object identifier",
            }

        data = record.to_supabase()
        response = await self.supabase.upsert(
            "object_pet_policy",
            data,
            on_conflict="object_id",
        )

        self.telemetry.record(
            "agent.pet_policy.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "pet_policy": record.model_dump() if record else None,
            },
        )

        context.share(
            self.name,
            {
                "pet_policy": record.model_dump(),
                "response": response,
            },
            overwrite=True,
        )

        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_pet_policy",
            "response": response,
        }


__all__ = ["PetPolicyAgent"]
