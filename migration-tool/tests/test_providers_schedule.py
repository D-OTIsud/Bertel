import pytest

from migration_tool.agents.providers import ProviderAgent
from migration_tool.agents.schedule import ScheduleAgent
from migration_tool.schemas import AgentContext
from migration_tool.supabase_client import SupabaseService
from migration_tool.telemetry import EventLog


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_provider_agent_extraction() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    agent = ProviderAgent(supabase, telemetry)

    # Test payload with nested provider data (like your real data)
    payload = {
        "establishment_id": "reccZJ9INTTb7Mxtg",
        "prestataires": [
            {
                "data": [
                    {
                        "row_number": 30,
                        "Presta ID": "AdJe0544bj",
                        "Nom": "Adenor",
                        "Prénom": "Jean-Luc",
                        "Genre": "Mr",
                        "Email": "loc.amarysreunion@orange.fr",
                        "Numéro de telephone": "0692600544",
                        "Fonction": "",
                        "Newsletter": True,
                        "Nombre d'establissements": 3,
                        "Numéro": 37,
                        "rue": "Chemin de la Concession les Bas",
                        "Code Postal": 97418,
                        "ville": "La Plaine des Cafres",
                        "Lieux-dits": "",
                    },
                    {
                        "row_number": 31,
                        "Presta ID": "AdMa0544yT",
                        "Nom": "Adenor",
                        "Prénom": "Maryse",
                        "Genre": "Mme",
                        "Email": "lerelaiscommerson97418@orange.fr",
                        "Numéro de telephone": "0692600544",
                        "Fonction": "Gérant",
                        "Newsletter": True,
                        "Nombre d'establissements": 0,
                        "Numéro": "37",
                        "rue": "rue Boisjoly Potier",
                        "Code Postal": 97418,
                        "ville": "La Plaine des Cafres",
                        "Lieux-dits": "",
                        "DOB": "01/04/1972",
                        "Revenus": "Principale",
                    }
                ]
            }
        ]
    }
    context = AgentContext(coordinator_id="test", source_payload=payload)

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["operation"] == "no_data"  # Because Supabase is not available in test
    assert result["message"] == "No valid provider data found"


@pytest.mark.anyio
async def test_schedule_agent_extraction() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    agent = ScheduleAgent(supabase, telemetry)

    # Test payload with nested schedule data (like your real data)
    payload = {
        "establishment_id": "reccZJ9INTTb7Mxtg",
        "horaires": [
            {
                "data": [
                    {
                        "row_number": 500,
                        "Horaires_id": "3508de48",
                        "formulaire": "reccZJ9INTTb7Mxtg",
                        "jours": "Mercredi , Jeudi , Vendredi , Samedi , Dimanche",
                        "AM_Start": "09:30",
                        "AM_Finish": "15:00",
                        "PM_Start": "",
                        "PM_Finish": "",
                        "Révervation": True,
                    }
                ]
            }
        ]
    }
    context = AgentContext(coordinator_id="test", source_payload=payload)

    result = await agent.handle(payload, context)

    assert result["status"] == "ok"
    assert result["operation"] == "no_data"  # Because Supabase is not available in test
    assert result["message"] == "No valid schedule data found"


def test_schedule_day_parsing() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    agent = ScheduleAgent(supabase, telemetry)

    # Test French day parsing
    jours_str = "Mercredi , Jeudi , Vendredi , Samedi , Dimanche"
    days = agent._parse_days(jours_str)
    
    expected_days = ["wednesday", "thursday", "friday", "saturday", "sunday"]
    assert days == expected_days


def test_provider_record_extraction() -> None:
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    agent = ProviderAgent(supabase, telemetry)

    provider_data = {
        "Presta ID": "AdJe0544bj",
        "Nom": "Adenor",
        "Prénom": "Jean-Luc",
        "Genre": "Mr",
        "Email": "loc.amarysreunion@orange.fr",
        "Numéro de telephone": "0692600544",
        "Fonction": "Gérant",
        "Newsletter": True,
        "Numéro": 37,
        "rue": "Chemin de la Concession les Bas",
        "Code Postal": 97418,
        "ville": "La Plaine des Cafres",
    }

    provider_record = agent._extract_provider_record(provider_data, "test_establishment")
    
    assert provider_record is not None
    assert provider_record.provider_id == "AdJe0544bj"
    assert provider_record.last_name == "Adenor"
    assert provider_record.first_name == "Jean-Luc"
    assert provider_record.email == "loc.amarysreunion@orange.fr"
    assert provider_record.phone == "0692600544"
    assert provider_record.function == "Gérant"
    assert provider_record.newsletter is True
    assert provider_record.address1 == "37 Chemin de la Concession les Bas"
    assert provider_record.postcode == 97418
    assert provider_record.city == "La Plaine des Cafres"
