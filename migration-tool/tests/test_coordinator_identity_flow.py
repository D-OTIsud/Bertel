import pytest

from migration_tool.agents.base import Agent
from migration_tool.agents.coordinator import Coordinator
from migration_tool.schemas import FieldRoutingDecision, RawEstablishmentPayload
from migration_tool.telemetry import EventLog
from migration_tool.webhook import WebhookNotifier


pytestmark = pytest.mark.anyio("asyncio")


class StubRouter:
    def __init__(self, sections: dict[str, dict[str, object]]) -> None:
        self._sections = sections

    async def route(self, *, payload, agent_descriptors):  # pragma: no cover - simple shim
        return FieldRoutingDecision(
            assignments=[],
            leftovers={},
            sections={name: dict(section) for name, section in self._sections.items()},
        )


class IdentityStub(Agent):
    name = "identity"
    description = "stub"

    def __init__(self, generated_id: str = "OBJ-IDENTITY") -> None:
        super().__init__()
        self.generated_id = generated_id
        self.calls: list[dict[str, object]] = []
        self.expected_fields = ["establishment_name"]

    async def handle(self, payload, context):
        self.calls.append(payload)
        context.object_id = payload.get("establishment_id") or self.generated_id
        return {"object_id": context.object_id}


class RecordingStub(Agent):
    def __init__(self, name: str) -> None:
        super().__init__()
        self.name = name
        self.description = name
        self.expected_fields = []
        self.calls: list[dict[str, object]] = []
        self.object_ids: list[object] = []

    async def handle(self, payload, context):
        self.calls.append(payload)
        self.object_ids.append(context.object_id)
        return {"status": "ok", "agent": self.name}


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_identity_id_propagation_when_router_omits_section():
    sample_payload = RawEstablishmentPayload.model_validate(
        [
            {
                "dataProvidingOrg": "ORG-001",
                "data": [
                    {
                        "Nom_OTI": "Le Relais Commerson",
                        "Groupe catégorie": "Restauration",
                        "Nom catégorie": "Restaurant",
                        "Nom sous catégorie": "Restaurant",
                        "Coordonnées GPS": "-21.204197, 55.577417",
                    }
                ],
            }
        ]
    )

    identity_agent = IdentityStub()
    contact_agent = RecordingStub("contact")
    router = StubRouter({"contact": {"phone": ["0262275287"]}})
    telemetry = EventLog()
    webhook = WebhookNotifier(url=None, telemetry=telemetry)

    coordinator = Coordinator(
        identity_agent=identity_agent,
        location_agent=RecordingStub("location"),
        contact_agent=contact_agent,
        amenities_agent=RecordingStub("amenities"),
        language_agent=RecordingStub("languages"),
        payment_agent=RecordingStub("payments"),
        environment_agent=RecordingStub("environment"),
        pet_policy_agent=RecordingStub("pet_policy"),
        media_agent=RecordingStub("media"),
        provider_agent=RecordingStub("providers"),
        schedule_agent=RecordingStub("schedule"),
        webhook=webhook,
        telemetry=telemetry,
        router=router,
    )

    fragments, leftovers = await coordinator.handle(sample_payload)

    assert leftovers == {}
    assert any(fragment.agent == "identity" for fragment in fragments)
    assert contact_agent.object_ids[0] == identity_agent.generated_id
    assert contact_agent.calls[0]["establishment_id"] == identity_agent.generated_id
    assert identity_agent.calls[0]["establishment_name"] == sample_payload.establishment_name
    assert identity_agent.calls[0]["legacy_ids"] == []

