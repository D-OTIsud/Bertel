"""Media agent handling photos and videos."""

from __future__ import annotations

from typing import Any, Dict, List

from ..ai import LLMClient
from ..schemas import AgentContext, MediaRecord, MediaTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class MediaAgent(AIEnabledAgent):
    name = "media"
    description = "Normalises media galleries and associated metadata."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["media", "photos", "videos"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=MediaTransformation,
            context=context.snapshot(),
        )
        media: List[MediaRecord] = transformation.media
        self.telemetry.record(
            "agent.media.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "media": [item.model_dump() for item in media],
            },
        )
        responses: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        for item in media:
            if not item.url:
                skipped.append(
                    {
                        "media": item.model_dump(),
                        "reason": "missing_url",
                    }
                )
                self.telemetry.record(
                    "agent.media.skip_missing_url",
                    {
                        "context": context.model_dump(),
                        "media": item.model_dump(),
                    },
                )
                continue
            item.object_id = item.object_id or context.object_id
            if not item.object_id:
                skipped.append(
                    {
                        "media": item.model_dump(),
                        "reason": "missing_object_id",
                    }
                )
                self.telemetry.record(
                    "agent.media.skip_missing_object_id",
                    {
                        "context": context.model_dump(),
                        "media": item.model_dump(),
                    },
                )
                continue
            original_media_type = item.media_type_code or "image"
            normalized_media_type = self.supabase.normalize_code(original_media_type)
            media_type_id = await context.lookup_reference_code(
                domain="media_type",
                code=normalized_media_type,
            )
            if not media_type_id:
                media_type_id = await context.ensure_reference_code(
                    domain="media_type",
                    code=normalized_media_type,
                    name=original_media_type.replace("_", " ").title(),
                )
            if not media_type_id:
                skipped.append(
                    {
                        "media": item.model_dump(),
                        "reason": "unresolved_media_type",
                    }
                )
                self.telemetry.record(
                    "agent.media.skip_unresolved_type",
                    {
                        "context": context.model_dump(),
                        "media": item.model_dump(),
                    },
                )
                continue
            item.media_type_code = normalized_media_type
            responses.append(
                await self.supabase.upsert(
                    "media",
                    item.to_supabase(media_type_id=media_type_id),
                )
            )
        context.share(
            self.name,
            {
                "media": [item.model_dump() for item in media],
                "responses": responses,
                "skipped": skipped,
            },
            overwrite=True,
        )
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "media",
            "responses": responses,
            "skipped": skipped,
        }


__all__ = ["MediaAgent"]
