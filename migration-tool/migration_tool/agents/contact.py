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
            context=context.snapshot(),
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
        responses: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        for channel in channels:
            if not channel.value:
                continue
            original_kind = channel.kind_code or "other"
            normalized_kind = self.supabase.normalize_code(original_kind)

            channel.object_id = channel.object_id or context.object_id
            if not channel.object_id:
                skipped.append(
                    {
                        "channel": channel.model_dump(),
                        "reason": "missing_object_id",
                    }
                )
                self.telemetry.record(
                    "agent.contact.skip_missing_object_id",
                    {
                        "context": context.model_dump(),
                        "channel": channel.model_dump(),
                    },
                )
                continue
            if normalized_kind.startswith("social_"):
                skipped.append(
                    {
                        "channel": channel.model_dump(),
                        "reason": "unsupported_social_channel",
                    }
                )
                self.telemetry.record(
                    "agent.contact.skip_social_channel",
                    {
                        "context": context.model_dump(),
                        "channel": channel.model_dump(),
                    },
                )
                continue

            kind_id = await context.lookup_reference_code(
                domain="contact_kind",
                code=normalized_kind,
            )
            if not kind_id:
                kind_id = await context.ensure_reference_code(
                    domain="contact_kind",
                    code=normalized_kind,
                    name=original_kind.replace("_", " ").title(),
                )
            if not kind_id:
                skipped.append(
                    {
                        "channel": channel.model_dump(),
                        "reason": "unresolved_kind",
                    }
                )
                self.telemetry.record(
                    "agent.contact.skip_unresolved_kind",
                    {
                        "context": context.model_dump(),
                        "channel": channel.model_dump(),
                    },
                )
                continue
            role_id = None
            if channel.role_code:
                normalized_role = self.supabase.normalize_code(channel.role_code)
                role_id = await self.supabase.lookup("ref_contact_role", code=normalized_role)
                if not role_id:
                    await self.supabase.upsert(
                        "ref_contact_role",
                        {
                            "code": normalized_role,
                            "name": channel.role_code.replace("_", " ").title(),
                        },
                        on_conflict="code",
                    )
                    role_id = await self.supabase.lookup("ref_contact_role", code=normalized_role)
                channel.role_code = normalized_role
            channel.kind_code = normalized_kind
            data = channel.to_supabase(kind_id=kind_id, role_id=role_id)
            responses.append(await self.supabase.upsert("contact_channel", data))

        context.share(
            self.name,
            {
                "channels": [channel.model_dump() for channel in channels],
                "responses": responses,
                "skipped": skipped,
            },
            overwrite=True,
        )
        return {
            "status": "ok",
            "operation": "upsert",
            "table": "contact_channel",
            "responses": responses,
            "skipped": skipped,
        }


__all__ = ["ContactAgent"]
