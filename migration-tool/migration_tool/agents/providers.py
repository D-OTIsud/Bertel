"""Provider agent handling prestataire data with database lookup."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..schemas import AgentContext, ProviderRecord, ProviderTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class ProviderAgent(Agent):
    name = "providers"
    description = "Handles provider (prestataire) data with database lookup and creation."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
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
        establishment_id = payload.get("establishment_id") or payload.get("object_id")
        if not establishment_id:
            return {"status": "error", "message": "Missing establishment_id"}

        # Extract provider data from payload
        providers_data = payload.get("prestataires") or payload.get("providers") or []
        
        # If it's a single provider object, wrap it in a list
        if isinstance(providers_data, dict):
            providers_data = [providers_data]
        
        # If it's nested in a "data" array, extract it
        if isinstance(providers_data, list) and len(providers_data) > 0:
            if isinstance(providers_data[0], dict) and "data" in providers_data[0]:
                providers_data = providers_data[0]["data"]

        created_providers = []
        provider_links = []

        for provider_data in providers_data:
            if not isinstance(provider_data, dict):
                continue

            # Extract provider information
            provider_record = self._extract_provider_record(provider_data, establishment_id)
            if not provider_record:
                continue

            # Check if provider already exists
            existing_provider = await self._find_existing_provider(provider_record)
            
            if existing_provider:
                # Provider exists, just create the link
                provider_id = existing_provider["id"]
                self.telemetry.record(
                    "agent.providers.link_existing",
                    {
                        "context": context.model_dump(),
                        "provider_id": provider_id,
                        "establishment_id": establishment_id,
                        "provider_data": provider_record.to_supabase(),
                    },
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

            if provider_id:
                provider_links.append({
                    "object_id": establishment_id,
                    "provider_id": provider_id,
                })

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
            
            return {
                "status": "ok",
                "operation": "upsert",
                "table": "object_provider",
                "created_providers": created_providers,
                "linked_providers": len(provider_links),
                "response": link_results,
            }
        else:
            return {
                "status": "ok",
                "operation": "no_data",
                "message": "No valid provider data found",
                "created_providers": [],
                "linked_providers": 0,
            }

    def _extract_provider_record(self, provider_data: Dict[str, Any], establishment_id: str) -> Optional[ProviderRecord]:
        """Extract provider record from raw data."""
        try:
            # Map French field names to our schema
            provider_id = provider_data.get("Presta ID") or provider_data.get("provider_id")
            last_name = provider_data.get("Nom") or provider_data.get("last_name") or ""
            first_name = provider_data.get("Prénom") or provider_data.get("first_name") or ""
            
            if not last_name or not first_name:
                return None

            return ProviderRecord(
                provider_id=provider_id,
                last_name=last_name,
                first_name=first_name,
                gender=provider_data.get("Genre") or provider_data.get("gender"),
                email=provider_data.get("Email") or provider_data.get("email"),
                phone=provider_data.get("Numéro de telephone") or provider_data.get("phone"),
                function=provider_data.get("Fonction") or provider_data.get("function"),
                newsletter=provider_data.get("Newsletter", False),
                address1=provider_data.get("Numéro") and provider_data.get("rue") and 
                        f"{provider_data.get('Numéro')} {provider_data.get('rue')}",
                postcode=provider_data.get("Code Postal") or provider_data.get("postcode"),
                city=provider_data.get("ville") or provider_data.get("city"),
                lieu_dit=provider_data.get("Lieux-dits") or provider_data.get("lieu_dit"),
                date_of_birth=provider_data.get("DOB") or provider_data.get("date_of_birth"),
                revenue=provider_data.get("Revenus") or provider_data.get("revenue"),
                legacy_ids=[provider_id] if provider_id else [],
            )
        except Exception as e:
            self.telemetry.record(
                "agent.providers.extract_error",
                {"error": str(e), "provider_data": provider_data},
            )
            return None

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
            # Generate a new UUID for the provider if not provided
            if not provider_record.provider_id:
                import uuid
                provider_record.provider_id = str(uuid.uuid4())

            result = await self.supabase.upsert("provider", provider_record.to_supabase(), on_conflict="id")
            return provider_record.provider_id
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


__all__ = ["ProviderAgent"]
