import pytest

from migration_tool.ai import RuleBasedLLM
from migration_tool.agents.providers import ProviderAgent
from migration_tool.agents.schedule import ScheduleAgent
from migration_tool.schemas import AgentContext, ProviderTransformation, ScheduleTransformation
from migration_tool.supabase_client import SupabaseService
from migration_tool.telemetry import EventLog


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_provider_agent_ai_transformation() -> None:
    """Test that ProviderAgent uses AI for transformation."""
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = ProviderAgent(supabase, telemetry, llm)

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

    # Test AI transformation directly
    transformation = await llm.transform_fragment(
        agent_name="providers",
        payload=payload,
        response_model=ProviderTransformation,
    )

    assert isinstance(transformation, ProviderTransformation)
    assert len(transformation.providers) == 2
    
    # Check first provider
    provider1 = transformation.providers[0]
    assert provider1.provider_id == "AdJe0544bj"
    assert provider1.last_name == "Adenor"
    assert provider1.first_name == "Jean-Luc"
    assert provider1.email == "loc.amarysreunion@orange.fr"
    assert provider1.phone == "0692600544"
    assert provider1.newsletter is True
    assert provider1.address1 == "Chemin de la Concession les Bas"
    assert provider1.postcode == 97418
    assert provider1.city == "La Plaine des Cafres"
    
    # Check second provider
    provider2 = transformation.providers[1]
    assert provider2.provider_id == "AdMa0544yT"
    assert provider2.last_name == "Adenor"
    assert provider2.first_name == "Maryse"
    assert provider2.function == "Gérant"
    assert provider2.date_of_birth == "01/04/1972"
    assert provider2.revenue == "Principale"

    # Test agent handle method
    result = await agent.handle(payload, context)
    assert result["status"] == "ok"
    assert result["operation"] == "no_data"  # Because Supabase is not available in test


@pytest.mark.anyio
async def test_schedule_agent_ai_transformation() -> None:
    """Test that ScheduleAgent uses AI for transformation."""
    telemetry = EventLog(retention=10)
    supabase = SupabaseService(url=None, key=None, telemetry=telemetry)
    llm = RuleBasedLLM()
    agent = ScheduleAgent(supabase, telemetry, llm)

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

    # Test AI transformation directly
    transformation = await llm.transform_fragment(
        agent_name="schedule",
        payload=payload,
        response_model=ScheduleTransformation,
    )

    assert isinstance(transformation, ScheduleTransformation)
    assert len(transformation.schedules) == 1
    
    # Check schedule
    schedule = transformation.schedules[0]
    assert schedule.days == ["wednesday", "thursday", "friday", "saturday", "sunday"]
    assert schedule.am_start == "09:30"
    assert schedule.am_finish == "15:00"
    assert schedule.pm_start == ""
    assert schedule.pm_finish == ""
    assert schedule.reservation_required is True
    assert schedule.schedule_type == "regular"

    # Test agent handle method
    result = await agent.handle(payload, context)
    assert result["status"] == "ok"
    assert result["operation"] == "no_data"  # Because Supabase is not available in test


def test_rule_based_llm_providers_transformation() -> None:
    """Test RuleBasedLLM transformation for providers."""
    llm = RuleBasedLLM()
    
    payload = {
        "establishment_id": "test_est",
        "prestataires": [
            {
                "data": [
                    {
                        "Presta ID": "test_provider",
                        "Nom": "Dupont",
                        "Prénom": "Jean",
                        "Email": "jean.dupont@test.com",
                        "Numéro de telephone": "0123456789",
                        "Fonction": "Manager",
                        "Newsletter": True,
                    }
                ]
            }
        ]
    }
    
    transformation = llm._transform_providers(payload)
    
    assert len(transformation.providers) == 1
    provider = transformation.providers[0]
    assert provider.provider_id == "test_provider"
    assert provider.last_name == "Dupont"
    assert provider.first_name == "Jean"
    assert provider.email == "jean.dupont@test.com"
    assert provider.phone == "0123456789"
    assert provider.function == "Manager"
    assert provider.newsletter is True


def test_rule_based_llm_schedule_transformation() -> None:
    """Test RuleBasedLLM transformation for schedule."""
    llm = RuleBasedLLM()
    
    payload = {
        "establishment_id": "test_est",
        "horaires": [
            {
                "data": [
                    {
                        "jours": "Lundi, Mardi, Mercredi",
                        "AM_Start": "08:00",
                        "AM_Finish": "12:00",
                        "PM_Start": "14:00",
                        "PM_Finish": "18:00",
                        "Révervation": False,
                    }
                ]
            }
        ]
    }
    
    transformation = llm._transform_schedule(payload)
    
    assert len(transformation.schedules) == 1
    schedule = transformation.schedules[0]
    assert schedule.days == ["monday", "tuesday", "wednesday"]
    assert schedule.am_start == "08:00"
    assert schedule.am_finish == "12:00"
    assert schedule.pm_start == "14:00"
    assert schedule.pm_finish == "18:00"
    assert schedule.reservation_required is False
    assert schedule.schedule_type == "regular"


def test_schedule_day_parsing_ai() -> None:
    """Test AI day parsing from French to English."""
    llm = RuleBasedLLM()
    
    # Test various French day formats
    jours_str = "Lundi , Mardi , Mercredi , Jeudi , Vendredi , Samedi , Dimanche"
    days = llm._parse_schedule_days(jours_str)
    
    expected_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    assert days == expected_days
    
    # Test with extra spaces and mixed case
    jours_str2 = "  LUNDI  ,  mardi  ,  MERCREDI  "
    days2 = llm._parse_schedule_days(jours_str2)
    assert days2 == ["monday", "tuesday", "wednesday"]
    
    # Test empty string
    days3 = llm._parse_schedule_days("")
    assert days3 == []
