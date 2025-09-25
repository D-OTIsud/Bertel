import types

import pytest

from migration_tool.ai import RuleBasedLLM
from migration_tool.agents.providers import ProviderAgent
from migration_tool.agents.schedule import ScheduleAgent
from migration_tool.schemas import AgentContext
from migration_tool.supabase_client import SupabaseService
from migration_tool.telemetry import EventLog


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_provider_agent_processes_nested_payload() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = ProviderAgent(supabase, telemetry, llm)

    payload = {
        "establishment_id": "reccZJ9INTTb7Mxtg",
        "prestataires": [
            {
                "data": [
                    {
                        "Presta ID": "AdJe0544bj",
                        "Nom": "Adenor",
                        "Prénom": "Jean-Luc",
                        "Email": "jean@example.com",
                        "Numéro de telephone": "0692600544",
                    },
                    {
                        "Presta ID": "AdMa0544yT",
                        "Nom": "Adenor",
                        "Prénom": "Maryse",
                        "Email": "maryse@example.com",
                        "Numéro de telephone": "0692600545",
                    },
                ]
            }
        ],
    }
    context = AgentContext(coordinator_id="test", source_payload=payload, object_id="reccZJ9INTTb7Mxtg")

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["table"] == "object_provider"
    assert result["linked_providers"] == 2

    jean_identifier = context.provider_registry.get("jean@example.com")
    maryse_identifier = context.provider_registry.get("maryse@example.com")

    assert jean_identifier is not None
    assert maryse_identifier is not None
    assert jean_identifier == context.provider_registry.get("AdJe0544bj")
    assert maryse_identifier == context.provider_registry.get("AdMa0544yT")


@pytest.mark.anyio
async def test_provider_agent_uses_returned_identifier() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)

    async def fake_upsert(self, table, data, on_conflict=None):
        if table == "provider":
            assert "id" not in data
            return {"data": [{"id": "prov-123", "email": data.get("email")}]}  # type: ignore[return-value]
        if table == "object_provider":
            assert data.get("provider_id") == "prov-123"
            return {"data": [data]}  # type: ignore[return-value]
        return {"data": []}  # type: ignore[return-value]

    supabase.upsert = types.MethodType(fake_upsert, supabase)  # type: ignore[assignment]

    llm = RuleBasedLLM()
    agent = ProviderAgent(supabase, telemetry, llm)

    payload = {
        "establishment_id": "obj-1",
        "providers": [
            {
                "Nom": "Doe",
                "Prénom": "Jane",
                "Email": "jane@example.com",
                "Numéro de telephone": "0123456789",
                "Presta ID": "legacy-123",
            }
        ],
    }
    context = AgentContext(coordinator_id="test", source_payload=payload, object_id="obj-1")

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["created_providers"] == ["prov-123"]
    assert context.provider_registry["jane@example.com"] == "prov-123"
    assert context.provider_registry["legacy-123"] == "prov-123"


@pytest.mark.anyio
async def test_schedule_agent_processes_nested_payload() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = ScheduleAgent(supabase, telemetry, llm)

    payload = {
        "establishment_id": "reccZJ9INTTb7Mxtg",
        "horaires": [
            {
                "data": [
                    {
                        "Horaires_id": "3508de48",
                        "jours": "Mercredi , Jeudi , Vendredi , Samedi , Dimanche",
                        "AM_Start": "09:30",
                        "AM_Finish": "15:00",
                        "Révervation": True,
                    }
                ]
            }
        ],
    }
    context = AgentContext(coordinator_id="test", source_payload=payload, object_id="reccZJ9INTTb7Mxtg")

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["operation"] == "upsert"
    assert result["created_schedules"] == 1


def test_rule_based_schedule_day_parsing() -> None:
    llm = RuleBasedLLM()
    jours_str = "Mercredi , Jeudi , Vendredi , Samedi , Dimanche"
    days = llm._parse_schedule_days(jours_str)

    expected_days = ["wednesday", "thursday", "friday", "saturday", "sunday"]
    assert days == expected_days
