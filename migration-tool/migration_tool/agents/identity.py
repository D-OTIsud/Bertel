"""Identity agent responsible for the canonical establishment record."""

from __future__ import annotations

from typing import Any, Dict

from ..ai import LLMClient
from ..schemas import AgentContext, IdentityRecord
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class IdentityAgent(AIEnabledAgent):
    name = "identity"
    description = "Creates or updates the canonical establishment entry."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
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
        record = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=IdentityRecord,
        )
        data = record.to_supabase()
        self.telemetry.record(
            "agent.identity.transform",
            {"context": context.model_dump(), "payload": payload, "record": record.model_dump(), "data": data},
        )
        response = await self.supabase.upsert("object", data, on_conflict="id")
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object",
            "response": response,
        }


__all__ = ["IdentityAgent"]
