import pytest

from migration_tool.agents.identity import IdentityAgent
from migration_tool.schemas import AgentContext, IdentityRecord
from migration_tool.telemetry import EventLog
from migration_tool.ai import LLMClient, PromptLibrary


pytestmark = pytest.mark.anyio("asyncio")


class DummyLLM(LLMClient):
    name = "dummy"

    async def classify_fields(self, *, payload, agent_descriptors):  # pragma: no cover - unused in tests
        raise NotImplementedError

    async def transform_fragment(self, *, agent_name, payload, response_model, context=None):
        return IdentityRecord(
            object_id=payload.get("establishment_id"),
            object_type="HOT",
            name=payload.get("establishment_name", "Unknown"),
            description=payload.get("description"),
            category_code="res",
            subcategory_code="bar",
            legacy_ids=payload.get("legacy_ids", []),
            source_extra={k: v for k, v in payload.items() if k not in {"establishment_name", "legacy_ids"}},
        )


class StubSupabase:
    def __init__(self) -> None:
        self.upserts = []
        self.find_kwargs = None
        self.find_result = None
        self.external_calls = []
        self.generated_id = "GEN-001"

    async def upsert(self, table, data, on_conflict=None):
        self.upserts.append((table, data, on_conflict))
        identifier = data.get("id") or self.generated_id
        return {"data": [{"id": identifier}]}

    async def find_existing_object(self, **kwargs):
        self.find_kwargs = kwargs
        return self.find_result

    async def record_external_ids(self, *, object_id, organization_id, external_ids):
        call = {
            "object_id": object_id,
            "organization_id": organization_id,
            "external_ids": list(external_ids),
        }
        self.external_calls.append(call)
        return [{"object_id": object_id, "external_id": ext} for ext in external_ids]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def test_identity_agent_reuses_existing_object():
    supabase = StubSupabase()
    supabase.find_result = {"id": "OBJ-123", "match_reason": "coordinates"}
    agent = IdentityAgent(supabase=supabase, telemetry=EventLog(), llm=DummyLLM())

    payload = {
        "establishment_name": "Test Establishment",
        "legacy_ids": ["LEG-001"],
        "description": "Sample",
    }
    context = AgentContext(
        coordinator_id="coord",
        source_payload={
            "latitude": 12.34,
            "longitude": 56.78,
            "provider_id": "ORG-777",
        },
        prompt_library=PromptLibrary(),
    )

    result = await agent.handle(payload, context)

    assert result["object_id"] == "OBJ-123"
    assert result["duplicate_of"] == "OBJ-123"
    assert context.object_id == "OBJ-123"
    assert context.duplicate_of == "OBJ-123"
    assert supabase.find_kwargs == {
        "name": "Test Establishment",
        "latitude": 12.34,
        "longitude": 56.78,
        "category": "res",
        "subcategory": "bar",
    }
    assert supabase.upserts[0][1]["id"] == "OBJ-123"
    assert supabase.external_calls == [
        {"object_id": "OBJ-123", "organization_id": "ORG-777", "external_ids": ["LEG-001"]}
    ]


async def test_identity_agent_inserts_new_object_when_no_match():
    supabase = StubSupabase()
    supabase.generated_id = "OBJ-999"
    agent = IdentityAgent(supabase=supabase, telemetry=EventLog(), llm=DummyLLM())

    payload = {
        "establishment_name": "Another Establishment",
        "legacy_ids": ["LEG-XYZ"],
    }
    context = AgentContext(
        coordinator_id="coord",
        source_payload={"provider_organization_id": "ORG-123"},
        prompt_library=PromptLibrary(),
    )

    result = await agent.handle(payload, context)

    assert result["object_id"] == "OBJ-999"
    assert result["duplicate_of"] is None
    assert context.object_id == "OBJ-999"
    assert context.duplicate_of is None
    assert supabase.external_calls == [
        {"object_id": "OBJ-999", "organization_id": "ORG-123", "external_ids": ["LEG-XYZ"]}
    ]
