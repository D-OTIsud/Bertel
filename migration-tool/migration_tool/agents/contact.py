"""Contact agent responsible for communication channels."""

from __future__ import annotations

from typing import Any, Dict

from ..schemas import AgentContext
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class ContactAgent(Agent):
    name = "contact"
    description = "Formats contact information (phone, mail, website, social links)."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = [
            "phone",
            "email",
            "website",
            "socials",
            "booking_url",
        ]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        socials = payload.get("socials", {})
        data = {
            "object_id": payload.get("establishment_id"),
            "phone": payload.get("phone"),
            "email": payload.get("email"),
            "website": payload.get("website"),
            "booking_url": payload.get("booking_url"),
            "facebook": socials.get("facebook"),
            "instagram": socials.get("instagram"),
            "twitter": socials.get("twitter"),
        }
        self.telemetry.record(
            "agent.contact.transform",
            {"context": context.model_dump(), "payload": payload, "data": data},
        )
        response = await self.supabase.upsert("object_contact", data, on_conflict="object_id")
        return {"status": "ok", "operation": "upsert", "table": "object_contact", "response": response}


__all__ = ["ContactAgent"]
