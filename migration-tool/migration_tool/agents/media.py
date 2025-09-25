"""Media agent handling photos and videos."""

from __future__ import annotations

from typing import Any, Dict, List

from ..schemas import AgentContext
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class MediaAgent(Agent):
    name = "media"
    description = "Normalises media galleries and associated metadata."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["media", "photos", "videos"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        media_items: List[Dict[str, Any]] = []
        for key in ("media", "photos", "videos"):
            value = payload.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        media_items.append(item)
                    elif isinstance(item, str):
                        media_items.append({"url": item})

        data = {
            "object_id": payload.get("establishment_id"),
            "items": media_items,
        }
        self.telemetry.record(
            "agent.media.transform",
            {"context": context.model_dump(), "payload": payload, "items": media_items},
        )
        response = await self.supabase.upsert("object_media", data, on_conflict="object_id")
        return {"status": "ok", "operation": "upsert", "table": "object_media", "response": response}


__all__ = ["MediaAgent"]
