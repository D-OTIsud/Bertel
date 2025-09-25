import pytest

from migration_tool.ai import FieldRouter, RuleBasedLLM
from migration_tool.agents.identity import IdentityAgent
from migration_tool.schemas import AgentContext, AgentDescriptor
from migration_tool.supabase_client import SupabaseService
from migration_tool.telemetry import EventLog


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
    context = AgentContext(coordinator_id="coord", source_payload=payload)

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object"
    assert result["response"]["status"] == "skipped"
