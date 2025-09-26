import pytest

from migration_tool.ai import FieldRouter, PromptLibrary, RuleBasedLLM
from migration_tool.agents.environment import EnvironmentAgent
from migration_tool.agents.identity import IdentityAgent
from migration_tool.agents.languages import LanguageAgent
from migration_tool.agents.payments import PaymentMethodAgent
from migration_tool.agents.pet_policy import PetPolicyAgent
from migration_tool.schemas import AgentContext, AgentDescriptor
from migration_tool.supabase_client import SupabaseService
from migration_tool.telemetry import EventLog


class ReferenceAgentStub:
    async def ensure(
        self,
        *,
        domain: str,
        code: str,
        name: str | None = None,
        description: str | None = None,
        metadata: dict | None = None,
    ) -> str:
        return f"{domain}:{code}"

    async def lookup(self, *, domain: str, code: str) -> str | None:
        return f"{domain}:{code}"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_field_router_rule_based_assignment() -> None:
    router = FieldRouter(RuleBasedLLM())
    descriptors = [
        AgentDescriptor(name="identity", description="identity", expected_fields=[]),
        AgentDescriptor(name="location", description="location", expected_fields=[]),
        AgentDescriptor(name="contact", description="contact", expected_fields=[]),
    ]
    payload = {
        "establishment_name": "Hôtel des Tests",
        "address_line1": "1 rue de la Paix",
        "city": "Paris",
        "phone": "+33 1 23 45 67 89",
        "legacy_ids": ["LEG-123"],
        "random_field": "keep me",
    }

    decision = await router.route(payload=payload, agent_descriptors=descriptors)

    assert decision.sections["location"]["address1"] == "1 rue de la Paix"
    assert decision.sections["contact"]["phone"] == "+33 1 23 45 67 89"
    assert "random_field" in decision.leftovers


@pytest.mark.anyio
async def test_identity_agent_rule_based_transformation() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = IdentityAgent(supabase, telemetry, llm)

    payload = {
        "establishment_id": "TEST1234567890",
        "establishment_name": "Base Test Hotel",
        "category": "Hotel",
        "legacy_ids": ["LEGACY-1"],
        "description": "Bel établissement au centre-ville",
    }
    context = AgentContext(
        coordinator_id="coord",
        source_payload=payload,
        prompt_library=PromptLibrary(),
    )
    context.attach_reference_agent(ReferenceAgentStub())

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object"
    assert result["response"]["status"] == "skipped"


@pytest.mark.anyio
async def test_language_agent_rule_based_transformation() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = LanguageAgent(supabase, telemetry, llm)

    payload = {"establishment_id": "OBJ1", "languages": ["Français", "Anglais"]}
    context = AgentContext(
        coordinator_id="coord",
        source_payload=payload,
        object_id="OBJ1",
        prompt_library=PromptLibrary(),
    )
    context.attach_reference_agent(ReferenceAgentStub())

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object_language"
    assert len(result["responses"]) == 2


@pytest.mark.anyio
async def test_payment_agent_rule_based_transformation() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = PaymentMethodAgent(supabase, telemetry, llm)

    payload = {"establishment_id": "OBJ1", "payment_methods": ["Carte Bancaire", "Espèces"]}
    context = AgentContext(
        coordinator_id="coord",
        source_payload=payload,
        object_id="OBJ1",
        prompt_library=PromptLibrary(),
    )
    context.attach_reference_agent(ReferenceAgentStub())

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object_payment_method"
    assert len(result["responses"]) == 2


@pytest.mark.anyio
async def test_environment_agent_rule_based_transformation() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = EnvironmentAgent(supabase, telemetry, llm)

    payload = {"establishment_id": "OBJ1", "environment_tags": ["Village", "Milieu rural"]}
    context = AgentContext(
        coordinator_id="coord",
        source_payload=payload,
        object_id="OBJ1",
        prompt_library=PromptLibrary(),
    )
    context.attach_reference_agent(ReferenceAgentStub())

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object_environment_tag"
    assert len(result["responses"]) == 2


@pytest.mark.anyio
async def test_pet_policy_agent_rule_based_transformation() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = PetPolicyAgent(supabase, telemetry, llm)

    payload = {"establishment_id": "OBJ1", "pets_allowed": "oui"}
    context = AgentContext(
        coordinator_id="coord",
        source_payload=payload,
        object_id="OBJ1",
        prompt_library=PromptLibrary(),
    )

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object_pet_policy"
    assert result["response"]["status"] == "skipped"
