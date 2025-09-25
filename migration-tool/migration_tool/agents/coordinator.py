"""Coordinator agent orchestrating the routing of payloads."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Iterable, List

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
from .identity import IdentityAgent
from .location import LocationAgent
from .media import MediaAgent
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
        combined_payload = {**payload_dict, **payload.data}
        decision: FieldRoutingDecision = await self.router.route(
            payload=combined_payload,
            agent_descriptors=[agent.descriptor() for agent in self.agents.values()],
        )
        context = AgentContext(coordinator_id=coordinator_id, source_payload=payload_dict)
        fragments: List[RoutedFragment] = []

        self.telemetry.record(
            "coordinator.received",
            {
                "coordinator_id": coordinator_id,
                "payload": payload_dict,
                "decision": decision.model_dump(),
            },
        )

        for name, agent in self.agents.items():
            section_payload = dict(decision.sections.get(name, {}))
            if not section_payload:
                continue

            section_payload.setdefault("establishment_id", payload_dict.get("legacy_ids", [None])[0])
            section_payload.setdefault("establishment_name", payload.establishment_name)
            section_payload.setdefault("category", payload.establishment_category)
            section_payload.setdefault("subcategory", payload.establishment_subcategory)
            section_payload.setdefault("legacy_ids", payload.legacy_ids)

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


__all__ = ["Coordinator"]
