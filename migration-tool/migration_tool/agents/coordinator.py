"""Coordinator agent orchestrating the routing of payloads."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Iterable, List, Optional, Sequence

from ..ai import FieldRouter
from ..schemas import (
    AgentContext,
    FieldRoutingDecision,
    RawEstablishmentPayload,
    RoutedFragment,
)
from ..telemetry import EventLog
from ..webhook import WebhookNotifier
from .amenities import AmenitiesAgent
from .base import Agent
from .contact import ContactAgent
from .environment import EnvironmentAgent
from .identity import IdentityAgent
from .languages import LanguageAgent
from .location import LocationAgent
from .media import MediaAgent
from .payments import PaymentMethodAgent
from .pet_policy import PetPolicyAgent
from .providers import ProviderAgent
from .schedule import ScheduleAgent


class Coordinator:
    """Coordinate routing between specialised agents."""

    def __init__(
        self,
        identity_agent: IdentityAgent,
        location_agent: LocationAgent,
        contact_agent: ContactAgent,
        amenities_agent: AmenitiesAgent,
        language_agent: LanguageAgent,
        payment_agent: PaymentMethodAgent,
        environment_agent: EnvironmentAgent,
        pet_policy_agent: PetPolicyAgent,
        media_agent: MediaAgent,
        provider_agent: ProviderAgent,
        schedule_agent: ScheduleAgent,
        webhook: WebhookNotifier,
        telemetry: EventLog,
        router: FieldRouter,
    ) -> None:
        self.agents: Dict[str, Agent] = {
            "identity": identity_agent,
            "location": location_agent,
            "contact": contact_agent,
            "amenities": amenities_agent,
            "languages": language_agent,
            "payments": payment_agent,
            "environment": environment_agent,
            "pet_policy": pet_policy_agent,
            "media": media_agent,
            "providers": provider_agent,
            "schedule": schedule_agent,
        }
        self.webhook = webhook
        self.telemetry = telemetry
        self.router = router

    def descriptors(self) -> Iterable[Dict[str, Any]]:
        for name, agent in self.agents.items():
            yield agent.descriptor().model_dump()

    async def handle(self, payload: RawEstablishmentPayload) -> tuple[List[RoutedFragment], Dict[str, Any]]:
        coordinator_id = str(uuid.uuid4())
        payload_dict = payload.model_dump(by_alias=True)
        data_section = payload_dict.pop("data", {})
        if isinstance(data_section, dict):
            combined_payload = {**payload_dict, **data_section}
        else:
            combined_payload = {**payload_dict, "raw_data": data_section}
        if payload.source_organization_id:
            combined_payload.setdefault("source_organization_id", payload.source_organization_id)
        decision: FieldRoutingDecision = await self.router.route(
            payload=combined_payload,
            agent_descriptors=[agent.descriptor() for agent in self.agents.values()],
        )
        context = AgentContext(
            coordinator_id=coordinator_id,
            source_payload=combined_payload,
            object_id=self._extract_initial_object_id(combined_payload, payload.legacy_ids),
            source_organization_id=payload.source_organization_id,
        )
        fragments: List[RoutedFragment] = []

        self.telemetry.record(
            "coordinator.received",
            {
                "coordinator_id": coordinator_id,
                "payload": combined_payload,
                "decision": decision.model_dump(),
            },
        )

        processed_agents: set[str] = set()

        identity_agent = self.agents.get("identity")
        if identity_agent:
            identity_payload = self._build_identity_payload(
                base_payload=combined_payload,
                raw_payload=payload,
                initial_object_id=context.object_id,
                section=decision.sections.get("identity"),
            )

            if identity_payload:
                section_payload = self._prepare_section_payload(
                    identity_payload,
                    payload,
                    context.object_id,
                )
                try:
                    result = await identity_agent.handle(section_payload, context)
                    context.object_id = result.get("object_id") or context.object_id
                    context.duplicate_of = result.get("duplicate_of") or context.duplicate_of
                    fragments.append(
                        RoutedFragment(agent="identity", status="processed", payload=section_payload, message=None)
                    )
                    self.telemetry.record(
                        "coordinator.agent.identity",
                        {
                            "coordinator_id": coordinator_id,
                            "payload": section_payload,
                            "result": result,
                        },
                    )
                except Exception as exc:
                    fragments.append(
                        RoutedFragment(agent="identity", status="error", payload=section_payload, message=str(exc))
                    )
                    self.telemetry.record(
                        "coordinator.agent_error.identity",
                        {
                            "coordinator_id": coordinator_id,
                            "payload": section_payload,
                            "error": str(exc),
                        },
                    )
                processed_agents.add("identity")

        for name, agent in self.agents.items():
            if name in processed_agents:
                continue
            section_payload = dict(decision.sections.get(name, {}))
            if not section_payload:
                continue

            section_payload = self._prepare_section_payload(
                section_payload,
                payload,
                context.object_id,
            )

            try:
                result = await agent.handle(section_payload, context)
                fragments.append(
                    RoutedFragment(agent=name, status="processed", payload=section_payload, message=None)
                )
                self.telemetry.record(
                    f"coordinator.agent.{name}",
                    {"coordinator_id": coordinator_id, "payload": section_payload, "result": result},
                )
            except Exception as exc:
                fragments.append(
                    RoutedFragment(agent=name, status="error", payload=section_payload, message=str(exc))
                )
                self.telemetry.record(
                    f"coordinator.agent_error.{name}",
                    {"coordinator_id": coordinator_id, "payload": section_payload, "error": str(exc)},
                )

        leftovers = decision.leftovers
        if leftovers:
            await self.webhook.notify({
                "coordinator_id": coordinator_id,
                "establishment": payload.establishment_name,
                "unresolved": leftovers,
            })

        return fragments, leftovers

    def _prepare_section_payload(
        self,
        section_payload: Dict[str, Any],
        payload: RawEstablishmentPayload,
        object_id: Optional[str],
    ) -> Dict[str, Any]:
        enriched = dict(section_payload)
        if object_id:
            enriched.setdefault("establishment_id", object_id)
            enriched.setdefault("object_id", object_id)
        else:
            enriched.setdefault("establishment_id", None)
        enriched.setdefault("establishment_name", payload.establishment_name)
        enriched.setdefault("category", payload.establishment_category)
        enriched.setdefault("subcategory", payload.establishment_subcategory)
        if payload.legacy_ids is not None:
            enriched.setdefault("legacy_ids", payload.legacy_ids)
        else:
            enriched.setdefault("legacy_ids", [])
        if payload.source_organization_id:
            enriched.setdefault("source_organization_id", payload.source_organization_id)
        return enriched
      
    def _build_identity_payload(
        self,
        *,
        base_payload: Dict[str, Any],
        raw_payload: RawEstablishmentPayload,
        initial_object_id: Optional[str],
        section: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Compose the payload passed to the identity agent.

        The router may fail to assign fields to the identity section when payloads
        are highly irregular. This helper hydrates a minimal fragment so the
        identity agent can always attempt to create or reuse the canonical object
        and return the Supabase-generated identifier for downstream agents.
        """

        identity_payload: Dict[str, Any] = {}
        if section:
            identity_payload.update(section)

        def _set_default(key: str, value: Any) -> None:
            if value in (None, "", [], {}):
                return
            identity_payload.setdefault(key, value)

        _set_default("establishment_name", base_payload.get("establishment_name") or base_payload.get("name"))
        if raw_payload.establishment_name:
            identity_payload["establishment_name"] = raw_payload.establishment_name

        _set_default("category", base_payload.get("category"))
        if raw_payload.establishment_category:
            identity_payload["category"] = raw_payload.establishment_category

        _set_default("subcategory", base_payload.get("subcategory"))
        if raw_payload.establishment_subcategory:
            identity_payload["subcategory"] = raw_payload.establishment_subcategory

        description = (
            identity_payload.get("description")
            or base_payload.get("description")
            or base_payload.get("summary")
            or base_payload.get("descriptif")
        )
        _set_default("description", description)

        existing_legacy = identity_payload.get("legacy_ids") or []
        if isinstance(existing_legacy, str):
            existing_legacy = [existing_legacy]
        legacy_candidates = list(existing_legacy)
        payload_legacy = raw_payload.legacy_ids or base_payload.get("legacy_ids") or []
        if isinstance(payload_legacy, str):
            payload_legacy = [payload_legacy]
        for candidate in payload_legacy:
            if candidate and candidate not in legacy_candidates:
                legacy_candidates.append(candidate)
        identity_payload["legacy_ids"] = legacy_candidates

        candidate_object_id = (
            identity_payload.get("establishment_id")
            or identity_payload.get("object_id")
            or base_payload.get("establishment_id")
            or base_payload.get("object_id")
            or initial_object_id
        )
        if candidate_object_id:
            identity_payload.setdefault("establishment_id", candidate_object_id)

        if base_payload:
            _set_default("source_payload", base_payload)

        return identity_payload if identity_payload.get("establishment_name") else {}

    def _build_identity_payload(
        self,
        *,
        base_payload: Dict[str, Any],
        raw_payload: RawEstablishmentPayload,
        initial_object_id: Optional[str],
        section: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Compose the payload passed to the identity agent.

        The router may fail to assign fields to the identity section when payloads
        are highly irregular. This helper hydrates a minimal fragment so the
        identity agent can always attempt to create or reuse the canonical object
        and return the Supabase-generated identifier for downstream agents.
        """

        identity_payload: Dict[str, Any] = {}
        if section:
            identity_payload.update(section)

        def _set_default(key: str, value: Any) -> None:
            if value in (None, "", [], {}):
                return
            identity_payload.setdefault(key, value)

        _set_default("establishment_name", base_payload.get("establishment_name") or base_payload.get("name"))
        if raw_payload.establishment_name:
            identity_payload["establishment_name"] = raw_payload.establishment_name

        _set_default("category", base_payload.get("category"))
        if raw_payload.establishment_category:
            identity_payload["category"] = raw_payload.establishment_category

        _set_default("subcategory", base_payload.get("subcategory"))
        if raw_payload.establishment_subcategory:
            identity_payload["subcategory"] = raw_payload.establishment_subcategory

        description = (
            identity_payload.get("description")
            or base_payload.get("description")
            or base_payload.get("summary")
            or base_payload.get("descriptif")
        )
        _set_default("description", description)

        existing_legacy = identity_payload.get("legacy_ids") or []
        if isinstance(existing_legacy, str):
            existing_legacy = [existing_legacy]
        legacy_candidates = list(existing_legacy)
        payload_legacy = raw_payload.legacy_ids or base_payload.get("legacy_ids") or []
        if isinstance(payload_legacy, str):
            payload_legacy = [payload_legacy]
        for candidate in payload_legacy:
            if candidate and candidate not in legacy_candidates:
                legacy_candidates.append(candidate)
        identity_payload["legacy_ids"] = legacy_candidates

        candidate_object_id = (
            identity_payload.get("establishment_id")
            or identity_payload.get("object_id")
            or base_payload.get("establishment_id")
            or base_payload.get("object_id")
            or initial_object_id
        )
        if candidate_object_id:
            identity_payload.setdefault("establishment_id", candidate_object_id)

        if base_payload:
            _set_default("source_payload", base_payload)

        return identity_payload if identity_payload.get("establishment_name") else {}

    @staticmethod
    def _extract_initial_object_id(
        payload: Dict[str, Any],
        legacy_ids: Optional[Sequence[str]],
    ) -> Optional[str]:
        for key in ("object_id", "establishment_id", "id"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value
        if legacy_ids:
            for candidate in legacy_ids:
                if candidate:
                    return str(candidate)
        return None


RECOGNISED_FIELDS: Dict[str, List[str]] = {
    "identity": [
        "establishment_name",
        "establishment_id",
        "object_id",
        "category",
        "subcategory",
        "legacy_ids",
        "description",
    ],
    "location": [
        "address_line1",
        "address_line2",
        "postcode",
        "postal_code",
        "city",
        "latitude",
        "longitude",
        "code_insee",
    ],
    "contact": ["phone", "email", "website"],
    "amenities": ["amenities"],
    "languages": ["languages"],
    "payments": ["payment_methods"],
    "environment": ["environment_tags"],
    "pet_policy": ["pets_allowed"],
    "media": ["media"],
    "providers": ["providers"],
    "schedule": ["schedule", "horaires"],
}


def partition_payload(payload: Dict[str, Any]) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    sections: Dict[str, Dict[str, Any]] = {agent: {} for agent in RECOGNISED_FIELDS}
    leftovers: Dict[str, Any] = {}

    for key, value in payload.items():
        assigned = False
        for agent, fields in RECOGNISED_FIELDS.items():
            if key in fields:
                sections[agent][key] = value
                assigned = True
                break
        if not assigned:
            leftovers[key] = value

    sections = {agent: data for agent, data in sections.items() if data}
    return sections, leftovers


__all__ = ["Coordinator", "partition_payload", "RECOGNISED_FIELDS"]
