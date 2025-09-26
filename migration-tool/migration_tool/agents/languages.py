from __future__ import annotations

from typing import Any, Dict, Optional

from ..ai import LLMClient
from ..schemas import AgentContext, LanguageTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class LanguageAgent(AIEnabledAgent):
    """Agent responsible for linking spoken languages to objects."""

    name = "languages"
    description = "Registers spoken languages for the establishment."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["languages", "langues", "spoken_languages"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=LanguageTransformation,
            context=context.snapshot(),
        )
        responses = []
        for record in transformation.languages:
            language_code = (record.language_code or "").strip()
            if not language_code and record.language_name:
                language_code = self.supabase.normalize_code(record.language_name)
            if not language_code:
                continue

            language_id = await self.supabase.ensure_language(
                code=language_code,
                name=record.language_name,
            )
            level_id: Optional[str] = None
            if record.proficiency_code:
                level_id = await context.ensure_reference_code(
                    domain="language_level",
                    code=record.proficiency_code,
                    name=record.proficiency_code.replace("_", " ").title(),
                )

            data = record.to_supabase(language_id=language_id, level_id=level_id)
            responses.append(
                await self.supabase.upsert(
                    "object_language",
                    data,
                    on_conflict="object_id,language_id",
                )
            )

        self.telemetry.record(
            "agent.languages.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "languages": [record.model_dump() for record in transformation.languages],
            },
        )

        context.share(
            self.name,
            {
                "languages": [record.model_dump() for record in transformation.languages],
                "responses": responses,
            },
            overwrite=True,
        )

        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_language",
            "responses": responses,
        }


__all__ = ["LanguageAgent"]
