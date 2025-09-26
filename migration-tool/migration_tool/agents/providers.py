"""Provider agent handling prestataire data with database lookup."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from ..ai import LLMClient
from ..schemas import AgentContext, ProviderRecord, ProviderTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class ProviderAgent(AIEnabledAgent):
    name = "providers"
    description = "Handles provider (prestataire) data with database lookup and creation."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = [
            "prestataires",
            "providers",
            "presta_id",
            "nom",
            "prenom",
            "email",
            "telephone",
            "fonction",
        ]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        establishment_id = (
            payload.get("establishment_id")
            or payload.get("object_id")
            or context.object_id
        )
        if not establishment_id:
            return {"status": "error", "message": "Missing establishment_id"}

        # Use AI to transform the payload into structured provider data
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=ProviderTransformation,
            context=context.snapshot(),
        )
        
        self.telemetry.record(
            "agent.providers.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "transformation": transformation.model_dump(),
            },
        )

        created_providers: List[str] = []
        provider_links: List[Dict[str, str]] = []
        skipped_links: List[Dict[str, Any]] = []

        for provider_record in transformation.providers:
            if not provider_record.last_name or not provider_record.first_name:
                continue

            # Check if provider already exists
            existing_provider = await self._find_existing_provider(provider_record)

            if existing_provider:
                # Provider exists, just create the link
                provider_id = str(existing_provider["id"])
                self.telemetry.record(
                    "agent.providers.link_existing",
                    {
                        "context": context.model_dump(),
                        "provider_id": provider_id,
                        "establishment_id": establishment_id,
                        "provider_data": provider_record.to_supabase(),
                    },
                )
                legacy_ids = provider_record.legacy_ids or self._coerce_legacy_ids(
                    existing_provider.get("legacy_ids")
                )
                context.register_provider(
                    provider_id=provider_id,
                    email=existing_provider.get("email") or provider_record.email,
                    phone=existing_provider.get("phone") or provider_record.phone,
                    legacy_ids=legacy_ids,
                )
            else:
                # Provider doesn't exist, create it
                provider_id = await self._create_provider(provider_record, context)
                if provider_id:
                    created_providers.append(provider_id)
                    self.telemetry.record(
                        "agent.providers.create_new",
                        {
                            "context": context.model_dump(),
                            "provider_id": provider_id,
                            "establishment_id": establishment_id,
                            "provider_data": provider_record.to_supabase(),
                        },
                    )
                    context.register_provider(
                        provider_id=provider_id,
                        email=provider_record.email,
                        phone=provider_record.phone,
                        legacy_ids=provider_record.legacy_ids,
                    )

            if provider_id:
                provider_links.append({
                    "object_id": establishment_id,
                    "provider_id": provider_id,
                })

        # Also process any pre-defined links from the AI transformation
        for link in transformation.object_provider_links:
            link_object_id = link.get("object_id") or establishment_id
            link_provider_id = link.get("provider_id")
            if not link_object_id or not link_provider_id:
                skipped_links.append(
                    {
                        "link": dict(link),
                        "reason": "missing_object_or_provider",
                    }
                )
                self.telemetry.record(
                    "agent.providers.skip_link_missing_ids",
                    {
                        "context": context.model_dump(),
                        "link": link,
                    },
                )
                continue
            candidate = {"object_id": link_object_id, "provider_id": link_provider_id}
            if candidate not in provider_links:
                provider_links.append(candidate)

        # Create object-provider links
        if provider_links:
            link_results = []
            for link in provider_links:
                result = await self.supabase.upsert(
                    "object_provider",
                    link,
                    on_conflict="object_id,provider_id"
                )
                link_results.append(result)

            context.share(
                self.name,
                {
                    "providers": [record.model_dump() for record in transformation.providers],
                    "links": provider_links,
                    "responses": link_results,
                    "skipped_links": skipped_links,
                },
                overwrite=True,
            )
            return {
                "status": "ok",
                "operation": "upsert",
                "table": "object_provider",
                "created_providers": created_providers,
                "linked_providers": len(provider_links),
                "response": link_results,
                "skipped_links": skipped_links,
            }
        else:
            context.share(
                self.name,
                {
                    "providers": [record.model_dump() for record in transformation.providers],
                    "links": provider_links,
                    "responses": [],
                    "skipped_links": skipped_links,
                },
                overwrite=True,
            )
            return {
                "status": "ok",
                "operation": "no_data",
                "message": "No valid provider data found",
                "created_providers": created_providers,
                "linked_providers": 0,
                "skipped_links": skipped_links,
            }


    async def _find_existing_provider(self, provider_record: ProviderRecord) -> Optional[Dict[str, Any]]:
        """Find existing provider by email or phone."""
        if not self.supabase.client:
            return None

        try:
            # Try to find by email first
            if provider_record.email:
                result = await self.supabase.client.table("provider").select("*").eq("email", provider_record.email).execute()
                if result.data and len(result.data) > 0:
                    return result.data[0]

            # Try to find by phone
            if provider_record.phone:
                result = await self.supabase.client.table("provider").select("*").eq("phone", provider_record.phone).execute()
                if result.data and len(result.data) > 0:
                    return result.data[0]

            # Try to find by legacy_id if available
            if provider_record.legacy_ids:
                for legacy_id in provider_record.legacy_ids:
                    result = await self.supabase.client.table("provider").select("*").contains("legacy_ids", [legacy_id]).execute()
                    if result.data and len(result.data) > 0:
                        return result.data[0]

            return None
        except Exception as e:
            self.telemetry.record(
                "agent.providers.lookup_error",
                {"error": str(e), "provider_record": provider_record.to_supabase()},
            )
            return None

    async def _create_provider(self, provider_record: ProviderRecord, context: AgentContext) -> Optional[str]:
        """Create a new provider in the database."""
        try:
            payload = provider_record.to_supabase()

            if not provider_record.provider_id:
                payload = {key: value for key, value in payload.items() if key != "id" or value is not None}

            response = await self.supabase.upsert(
                "provider",
                payload,
                on_conflict="id" if provider_record.provider_id else None,
            )

            provider_id = provider_record.provider_id or self._extract_provider_id(response)
            if not provider_id:
                provider_id = str(uuid.uuid4())
                self.telemetry.record(
                    "agent.providers.generated_local_id",
                    {
                        "context": context.model_dump(),
                        "provider_record": provider_record.to_supabase(),
                        "reason": "missing returned id",
                    },
                )

            provider_record.provider_id = provider_id
            return provider_id
        except Exception as e:
            self.telemetry.record(
                "agent.providers.create_error",
                {
                    "error": str(e),
                    "provider_record": provider_record.to_supabase(),
                    "context": context.model_dump(),
                },
            )
            return None

    def _extract_provider_id(self, response: Dict[str, Any]) -> Optional[str]:
        if not isinstance(response, dict):
            return None

        data = response.get("data")
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict) and first.get("id"):
                return str(first["id"])

        if response.get("id"):
            return str(response["id"])

        return None

    def _coerce_legacy_ids(self, value: Optional[Any]) -> List[str]:
        if not value:
            return []
        if isinstance(value, (list, tuple, set)):
            return [str(item) for item in value if item]
        return [str(value)]


__all__ = ["ProviderAgent"]
