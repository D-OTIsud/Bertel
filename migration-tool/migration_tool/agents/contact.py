"""Contact agent responsible for communication channels."""

from __future__ import annotations

from typing import Any, Dict, List

from ..ai import LLMClient
from ..schemas import AgentContext, ContactChannelRecord, ContactTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class ContactAgent(AIEnabledAgent):
    name = "contact"
    description = "Formats contact information (phone, mail, website, social links)."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
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
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=ContactTransformation,
        )
        channels: List[ContactChannelRecord] = transformation.channels
        self.telemetry.record(
            "agent.contact.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "channels": [channel.model_dump() for channel in channels],
            },
        )
        responses = []
        for channel in channels:
            if not channel.value:
                continue
            kind_id = await self.supabase.lookup("ref_code_contact_kind", code=channel.kind_code)
            role_id = None
            if channel.role_code:
                role_id = await self.supabase.lookup("ref_contact_role", code=channel.role_code)
            data = channel.to_supabase(kind_id=kind_id, role_id=role_id)
            responses.append(await self.supabase.upsert("contact_channel", data))
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "contact_channel",
            "responses": responses,
        }


__all__ = ["ContactAgent"]
