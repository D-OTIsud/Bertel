import pytest

from migration_tool.ai import PromptLibrary

from migration_tool.agents.base import Agent
from migration_tool.agents.coordinator import Coordinator
from migration_tool.schemas import FieldRoutingDecision, RawEstablishmentPayload
from migration_tool.telemetry import EventLog
from migration_tool.webhook import WebhookNotifier
from migration_tool.agents.verification import VerificationAgent


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
        self.shared: list[dict[str, object]] = []

    async def handle(self, payload, context):
        self.calls.append(payload)
        context.object_id = payload.get("establishment_id") or self.generated_id
        context.share(
            self.name,
            {
                "payload": payload,
                "object_id": context.object_id,
            },
            overwrite=True,
        )
        self.shared.append(context.recall(self.name))
        return {"object_id": context.object_id}


class RecordingStub(Agent):
    def __init__(self, name: str) -> None:
        super().__init__()
        self.name = name
        self.description = name
        self.expected_fields = []
        self.calls: list[dict[str, object]] = []
        self.object_ids: list[object] = []
        self.recalled_identity: list[dict[str, object]] = []
        self.shared_snapshots: list[dict[str, object]] = []

    async def handle(self, payload, context):
        self.calls.append(payload)
        self.object_ids.append(context.object_id)
        self.recalled_identity.append(context.recall("identity"))
        context.share(
            self.name,
            {
                "payload": payload,
                "object_id": context.object_id,
            },
            overwrite=True,
        )
        self.shared_snapshots.append(context.recall(self.name))
        return {"status": "ok", "agent": self.name}


class ReferenceAgentStub(Agent):
    name = "reference_codes"
    description = "stub"

    def __init__(self) -> None:
        super().__init__()
        self.expected_fields = ["requests"]
        self.created: dict[tuple[str, str], str] = {}

    async def handle(self, payload, context):  # pragma: no cover - unused in tests
        return {"status": "ok"}

    async def ensure(
        self,
        *,
        domain: str,
        code: str,
        name: str | None = None,
        description: str | None = None,
        metadata: dict | None = None,
    ) -> str:
        key = (domain, code)
        if key not in self.created:
            self.created[key] = f"{domain}:{code}"
        return self.created[key]

    async def lookup(self, *, domain: str, code: str) -> str | None:
        return self.created.get((domain, code))


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
    prompt_library = PromptLibrary()
    verification_agent = VerificationAgent(telemetry, prompt_library)

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
        verification_agent=verification_agent,
        prompt_library=prompt_library,
        reference_agent=ReferenceAgentStub(),
    )

    fragments, leftovers = await coordinator.handle(sample_payload)

    assert leftovers == {}
    assert any(fragment.agent == "identity" for fragment in fragments)
    assert contact_agent.object_ids[0] == identity_agent.generated_id
    assert "establishment_id" not in contact_agent.calls[0]
    assert identity_agent.calls[0]["establishment_name"] == sample_payload.establishment_name
    assert identity_agent.calls[0]["legacy_ids"] == []


@pytest.mark.anyio
async def test_fallback_partition_routes_recognised_fields():
    sample_payload = RawEstablishmentPayload.model_validate(
        {
            "name": "Chez Partition",
            "category": "Restaurant",
            "subcategory": "Brasserie",
            "data": {
                "phone": "0262275287",
                "address_line1": "1 Rue du Port",
                "city": "Saint-Denis",
                "unknown": "keep-me",
            },
        }
    )

    identity_agent = IdentityStub()
    location_agent = RecordingStub("location")
    contact_agent = RecordingStub("contact")
    router = StubRouter({})
    telemetry = EventLog()
    webhook = WebhookNotifier(url=None, telemetry=telemetry)
    prompt_library = PromptLibrary()
    verification_agent = VerificationAgent(telemetry, prompt_library)

    coordinator = Coordinator(
        identity_agent=identity_agent,
        location_agent=location_agent,
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
        verification_agent=verification_agent,
        prompt_library=prompt_library,
        reference_agent=ReferenceAgentStub(),
    )

    fragments, leftovers = await coordinator.handle(sample_payload)

    assert leftovers == {"unknown": "keep-me"}
    assert location_agent.calls
    assert location_agent.calls[0]["address_line1"] == "1 Rue du Port"
    assert contact_agent.calls
    assert contact_agent.calls[0]["phone"] == "0262275287"
    processed_agents = {fragment.agent for fragment in fragments}
    assert "location" in processed_agents
    assert "contact" in processed_agents


@pytest.mark.anyio
async def test_agents_can_share_state_via_context():
    sample_payload = RawEstablishmentPayload.model_validate(
        {
            "name": "Maison Partagée",
            "establishment_name": "Maison Partagée",
            "data": {
                "address_line1": "5 Rue du Port",
                "phone": ["0262000000"],
            },
        }
    )

    identity_agent = IdentityStub()
    location_agent = RecordingStub("location")
    contact_agent = RecordingStub("contact")
    router = StubRouter(
        {
            "identity": {"establishment_name": "Maison Partagée"},
            "location": {"address_line1": "5 Rue du Port"},
            "contact": {"phone": ["0262000000"]},
        }
    )
    telemetry = EventLog()
    webhook = WebhookNotifier(url=None, telemetry=telemetry)
    prompt_library = PromptLibrary()
    verification_agent = VerificationAgent(telemetry, prompt_library)

    coordinator = Coordinator(
        identity_agent=identity_agent,
        location_agent=location_agent,
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
        verification_agent=verification_agent,
        prompt_library=prompt_library,
        reference_agent=ReferenceAgentStub(),
    )

    fragments, leftovers = await coordinator.handle(sample_payload)

    assert leftovers == {}
    assert identity_agent.shared[-1]["object_id"] == identity_agent.generated_id
    assert contact_agent.recalled_identity[-1]["object_id"] == identity_agent.generated_id
    assert location_agent.recalled_identity[-1]["object_id"] == identity_agent.generated_id
    assert contact_agent.shared_snapshots[-1]["payload"]["phone"] == ["0262000000"]
    assert location_agent.shared_snapshots[-1]["payload"]["address_line1"] == "5 Rue du Port"
    routed_agents = {fragment.agent for fragment in fragments}
    assert routed_agents.issuperset({"identity", "contact", "location"})

