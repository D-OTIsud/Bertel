from __future__ import annotations

from typing import Any, Dict, List, Optional

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
        responses: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        for record in transformation.languages:
            language_code = (record.language_code or "").strip()
            if not language_code and record.language_name:
                language_code = self.supabase.normalize_code(record.language_name)
            if not language_code:
                skipped.append(
                    {
                        "language": record.model_dump(),
                        "reason": "missing_language_code",
                    }
                )
                self.telemetry.record(
                    "agent.languages.skip_missing_code",
                    {
                        "context": context.model_dump(),
                        "language": record.model_dump(),
                    },
                )
                continue

            record.object_id = record.object_id or context.object_id
            if not record.object_id:
                skipped.append(
                    {
                        "language": record.model_dump(),
                        "reason": "missing_object_id",
                    }
                )
                self.telemetry.record(
                    "agent.languages.skip_missing_object_id",
                    {
                        "context": context.model_dump(),
                        "language": record.model_dump(),
                    },
                )
                continue

            language_id = await self.supabase.ensure_language(
                code=language_code,
                name=record.language_name,
            )
            if not language_id and not self.supabase.client:
                language_id = await context.ensure_reference_code(
                    domain="language",
                    code=language_code,
                    name=record.language_name or language_code.upper(),
                )
            if not language_id:
                skipped.append(
                    {
                        "language": record.model_dump(),
                        "reason": "unresolved_language",
                    }
                )
                self.telemetry.record(
                    "agent.languages.skip_unresolved_language",
                    {
                        "context": context.model_dump(),
                        "language": record.model_dump(),
                    },
                )
                continue
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
                "skipped": skipped,
            },
            overwrite=True,
        )

        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_language",
            "responses": responses,
            "skipped": skipped,
        }


__all__ = ["LanguageAgent"]
