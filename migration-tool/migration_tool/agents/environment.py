from __future__ import annotations

from typing import Any, Dict, List

from ..ai import LLMClient
from ..schemas import AgentContext, EnvironmentTagTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class EnvironmentAgent(AIEnabledAgent):
    """Agent that links environment/localisation tags to objects."""

    name = "environment"
    description = "Registers environment tags describing the establishment context."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["environment_tags", "localisations", "environment"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=EnvironmentTagTransformation,
            context=context.snapshot(),
        )
        responses: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        for record in transformation.environment_tags:
            environment_code = (record.environment_code or "").strip()
            if not environment_code and record.environment_name:
                environment_code = self.supabase.normalize_code(record.environment_name)
            if not environment_code:
                skipped.append(
                    {
                        "tag": record.model_dump(),
                        "reason": "missing_environment_code",
                    }
                )
                self.telemetry.record(
                    "agent.environment.skip_missing_code",
                    {
                        "context": context.model_dump(),
                        "tag": record.model_dump(),
                    },
                )
                continue

            record.object_id = record.object_id or context.object_id
            if not record.object_id:
                skipped.append(
                    {
                        "tag": record.model_dump(),
                        "reason": "missing_object_id",
                    }
                )
                self.telemetry.record(
                    "agent.environment.skip_missing_object_id",
                    {
                        "context": context.model_dump(),
                        "tag": record.model_dump(),
                    },
                )
                continue

            tag_id = await context.ensure_reference_code(
                domain="environment_tag",
                code=environment_code,
                name=record.environment_name or environment_code.replace("_", " ").title(),
            )
            if not tag_id:
                skipped.append(
                    {
                        "tag": record.model_dump(),
                        "reason": "unresolved_environment_tag",
                    }
                )
                self.telemetry.record(
                    "agent.environment.skip_unresolved_tag",
                    {
                        "context": context.model_dump(),
                        "tag": record.model_dump(),
                    },
                )
                continue
            data = record.to_supabase(environment_tag_id=tag_id)
            responses.append(
                await self.supabase.upsert(
                    "object_environment_tag",
                    data,
                    on_conflict="object_id,environment_tag_id",
                )
            )

        self.telemetry.record(
            "agent.environment.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "environment_tags": [record.model_dump() for record in transformation.environment_tags],
            },
        )

        context.share(
            self.name,
            {
                "environment_tags": [
                    record.model_dump() for record in transformation.environment_tags
                ],
                "responses": responses,
                "skipped": skipped,
            },
            overwrite=True,
        )

        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_environment_tag",
            "responses": responses,
            "skipped": skipped,
        }


__all__ = ["EnvironmentAgent"]
