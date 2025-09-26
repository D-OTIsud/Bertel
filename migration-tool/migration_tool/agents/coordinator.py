"""Coordinator agent orchestrating the routing of payloads."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Iterable, List, Optional, Sequence

from ..ai import FieldRouter, PromptLibrary
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
from .verification import VerificationAgent
from .reference_codes import ReferenceCodeAgent


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
        verification_agent: VerificationAgent,
        prompt_library: PromptLibrary,
        reference_agent: ReferenceCodeAgent,
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
        self.verification_agent = verification_agent
        self.prompt_library = prompt_library
        self.reference_agent = reference_agent

    def descriptors(self) -> Iterable[Dict[str, Any]]:
        for name, agent in self.agents.items():
            yield agent.descriptor().model_dump()
        yield self.verification_agent.descriptor().model_dump()
        yield self.reference_agent.descriptor().model_dump()

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

        fallback_sections, fallback_leftovers = partition_payload(combined_payload)

        merged_sections: Dict[str, Dict[str, Any]] = {}
        for name, section in decision.sections.items():
            if section:
                merged_sections[name] = dict(section)

        for agent_name, fallback_section in fallback_sections.items():
            target_section = merged_sections.setdefault(agent_name, {})
            for field_name, value in fallback_section.items():
                target_section.setdefault(field_name, value)

        leftovers: Dict[str, Any] = dict(decision.leftovers)
        ignored_leftover_keys = {
            "name",
            "dataProvidingOrg",
            "source_organization_id",
            "raw_batch",
            "raw_blocks",
            "raw_main_record",
            "raw_additional_sections",
            "raw_payload",
        }
        for key, value in fallback_leftovers.items():
            if key in ignored_leftover_keys:
                continue
            leftovers.setdefault(key, value)

        recognised_keys = {key for section in merged_sections.values() for key in section.keys()}
        for key in list(leftovers.keys()):
            if key in recognised_keys:
                leftovers.pop(key)

        decision.sections = merged_sections
        decision.leftovers = leftovers
        context = AgentContext(
            coordinator_id=coordinator_id,
            source_payload=combined_payload,
            object_id=self._extract_initial_object_id(combined_payload, payload.legacy_ids),
            source_organization_id=payload.source_organization_id,
            prompt_library=self.prompt_library,
        )
        context.attach_reference_agent(self.reference_agent)
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
                    identity_agent,
                    identity_payload,
                    payload,
                    context,
                )
                self.telemetry.record(
                    "coordinator.agent_start.identity",
                    {
                        "coordinator_id": coordinator_id,
                        "payload": section_payload,
                    },
                )
                try:
                    result = await identity_agent.handle(section_payload, context)
                    context.object_id = result.get("object_id") or context.object_id
                    context.duplicate_of = result.get("duplicate_of") or context.duplicate_of
                    identity_state = context.recall("identity")
                    identity_state.update(
                        {
                            "payload": section_payload,
                            "result": result,
                            "object_id": context.object_id,
                            "duplicate_of": context.duplicate_of,
                        }
                    )
                    context.share("identity", identity_state, overwrite=True)
                    context.log_event(
                        "identity",
                        status="processed",
                        payload=section_payload,
                        result=result,
                    )
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
                    identity_state = context.recall("identity")
                    identity_state.update({"payload": section_payload, "error": str(exc)})
                    context.share("identity", identity_state, overwrite=True)
                    context.log_event(
                        "identity",
                        status="error",
                        payload=section_payload,
                        error=str(exc),
                    )
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
                agent,
                section_payload,
                payload,
                context,
            )

            self.telemetry.record(
                f"coordinator.agent_start.{name}",
                {
                    "coordinator_id": coordinator_id,
                    "payload": section_payload,
                },
            )

            try:
                result = await agent.handle(section_payload, context)
                agent_state = context.recall(name)
                agent_state.update(
                    {
                        "payload": section_payload,
                        "result": result,
                        "object_id": context.object_id,
                    }
                )
                context.share(name, agent_state, overwrite=True)
                context.log_event(
                    name,
                    status="processed",
                    payload=section_payload,
                    result=result,
                )
                fragments.append(
                    RoutedFragment(agent=name, status="processed", payload=section_payload, message=None)
                )
                self.telemetry.record(
                    f"coordinator.agent.{name}",
                    {"coordinator_id": coordinator_id, "payload": section_payload, "result": result},
                )
            except Exception as exc:
                agent_state = context.recall(name)
                agent_state.update({"payload": section_payload, "error": str(exc)})
                context.share(name, agent_state, overwrite=True)
                context.log_event(
                    name,
                    status="error",
                    payload=section_payload,
                    error=str(exc),
                )
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

        verification_payload = {
            "fragments": [fragment.model_dump() for fragment in fragments],
            "leftovers": leftovers,
        }
        self.telemetry.record(
            "coordinator.agent_start.verification",
            {"coordinator_id": coordinator_id, "payload": verification_payload},
        )
        try:
            verification_result = await self.verification_agent.handle(verification_payload, context)
            context.log_event(
                "verification",
                status="processed",
                payload=verification_payload,
                result=verification_result,
            )
            fragments.append(
                RoutedFragment(agent="verification", status="processed", payload=verification_payload, message=None)
            )
            self.telemetry.record(
                "coordinator.agent.verification",
                {
                    "coordinator_id": coordinator_id,
                    "payload": verification_payload,
                    "result": verification_result,
                },
            )
        except Exception as exc:
            context.log_event(
                "verification",
                status="error",
                payload=verification_payload,
                error=str(exc),
            )
            fragments.append(
                RoutedFragment(agent="verification", status="error", payload=verification_payload, message=str(exc))
            )
            self.telemetry.record(
                "coordinator.agent_error.verification",
                {
                    "coordinator_id": coordinator_id,
                    "payload": verification_payload,
                    "error": str(exc),
                },
            )

        return fragments, leftovers

    def _prepare_section_payload(
        self,
        agent: Agent,
        section_payload: Dict[str, Any],
        payload: RawEstablishmentPayload,
        context: AgentContext,
    ) -> Dict[str, Any]:
        allowed_keys = set(agent.expected_fields or [])
        enriched = {
            key: value
            for key, value in section_payload.items()
            if not allowed_keys or key in allowed_keys
        }

        if agent.name == "identity":
            defaults: Dict[str, Any] = {}
            if payload.establishment_name:
                defaults["establishment_name"] = payload.establishment_name
            if payload.establishment_category:
                defaults["category"] = payload.establishment_category
            if payload.establishment_subcategory:
                defaults["subcategory"] = payload.establishment_subcategory
            if payload.legacy_ids is not None:
                defaults["legacy_ids"] = payload.legacy_ids
            if payload.source_organization_id:
                defaults["source_organization_id"] = payload.source_organization_id
            for key, value in defaults.items():
                enriched.setdefault(key, value)
        else:
            if context.object_id:
                if "establishment_id" in allowed_keys:
                    enriched.setdefault("establishment_id", context.object_id)
                if "object_id" in allowed_keys:
                    enriched.setdefault("object_id", context.object_id)

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
