"""Coordinator agent orchestrating the routing of payloads."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Iterable, List, Tuple

from ..schemas import AgentContext, RawEstablishmentPayload, RoutedFragment
from ..telemetry import EventLog
from ..webhook import WebhookNotifier
from .amenities import AmenitiesAgent
from .base import Agent
from .contact import ContactAgent
from .identity import IdentityAgent
from .location import LocationAgent
from .media import MediaAgent


RECOGNISED_FIELDS = {
    "identity": {
        "establishment_id",
        "establishment_name",
        "category",
        "subcategory",
        "description",
        "legacy_ids",
    },
    "location": {
        "address_line1",
        "address_line2",
        "postal_code",
        "city",
        "country",
        "latitude",
        "longitude",
        "coordinates",
        "meeting_point",
    },
    "contact": {
        "phone",
        "email",
        "website",
        "booking_url",
        "socials",
    },
    "amenities": {"amenities", "equipment", "services"},
    "media": {"media", "photos", "videos"},
}


def partition_payload(payload: Dict[str, Any]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """Partition the payload into recognised sections and leftovers."""

    sections: Dict[str, Dict[str, Any]] = {key: {} for key in RECOGNISED_FIELDS}
    leftovers: Dict[str, Any] = {}

    for key, value in payload.items():
        matched = False
        for section, expected in RECOGNISED_FIELDS.items():
            if key in expected:
                sections[section][key] = value
                matched = True
                break
        if not matched:
            leftovers[key] = value

    return sections, leftovers


class Coordinator:
    """Coordinate routing between specialised agents."""

    def __init__(
        self,
        identity_agent: IdentityAgent,
        location_agent: LocationAgent,
        contact_agent: ContactAgent,
        amenities_agent: AmenitiesAgent,
        media_agent: MediaAgent,
        webhook: WebhookNotifier,
        telemetry: EventLog,
    ) -> None:
        self.agents: Dict[str, Agent] = {
            "identity": identity_agent,
            "location": location_agent,
            "contact": contact_agent,
            "amenities": amenities_agent,
            "media": media_agent,
        }
        self.webhook = webhook
        self.telemetry = telemetry

    def descriptors(self) -> Iterable[Dict[str, Any]]:
        for name, agent in self.agents.items():
            yield agent.descriptor().model_dump()

    async def handle(self, payload: RawEstablishmentPayload) -> Tuple[List[RoutedFragment], Dict[str, Any]]:
        coordinator_id = str(uuid.uuid4())
        payload_dict = payload.model_dump(by_alias=True)
        sections, leftovers = partition_payload({**payload_dict, **payload.data})
        context = AgentContext(coordinator_id=coordinator_id, source_payload=payload_dict)
        fragments: List[RoutedFragment] = []

        self.telemetry.record(
            "coordinator.received",
            {"coordinator_id": coordinator_id, "payload": payload_dict, "sections": sections, "leftovers": leftovers},
        )

        for name, agent in self.agents.items():
            section_payload = sections.get(name, {})
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

        if leftovers:
            await self.webhook.notify({
                "coordinator_id": coordinator_id,
                "establishment": payload.establishment_name,
                "unresolved": leftovers,
            })

        return fragments, leftovers


__all__ = ["Coordinator", "partition_payload"]
