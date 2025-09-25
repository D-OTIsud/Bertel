"""FastAPI application factory."""

from __future__ import annotations

import pathlib
from typing import Dict

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .agents.amenities import AmenitiesAgent
from .agents.contact import ContactAgent
from .agents.coordinator import Coordinator
from .agents.environment import EnvironmentAgent
from .agents.identity import IdentityAgent
from .agents.languages import LanguageAgent
from .agents.location import LocationAgent
from .agents.media import MediaAgent
from .agents.payments import PaymentMethodAgent
from .agents.pet_policy import PetPolicyAgent
from .agents.providers import ProviderAgent
from .agents.schedule import ScheduleAgent
from .ai import FieldRouter, RuleBasedLLM, build_llm
from .config import Settings, get_settings
from .schemas import IngestionResponse, RawEstablishmentPayload
from .supabase_client import SupabaseService
from .telemetry import EventLog
from .webhook import WebhookNotifier


def create_app(settings: Settings | None = None) -> FastAPI:
    if settings is None:
        settings = get_settings()
    telemetry = EventLog(retention=settings.dashboard_retention)
    supabase = SupabaseService(settings.supabase_url, settings.supabase_service_key, telemetry)
    webhook = WebhookNotifier(settings.webhook_url, telemetry)
    try:
        llm = build_llm(
            provider=settings.ai_provider,
            api_key=settings.openai_api_key,
            model=settings.ai_model,
            temperature=settings.ai_temperature,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        telemetry.record("ai.initialisation_failed", {"provider": settings.ai_provider, "error": str(exc)})
        llm = RuleBasedLLM()
    telemetry.record("ai.initialised", {"provider": getattr(llm, "name", "unknown")})
    router = FieldRouter(llm)

    coordinator = Coordinator(
        identity_agent=IdentityAgent(supabase, telemetry, llm),
        location_agent=LocationAgent(supabase, telemetry, llm),
        contact_agent=ContactAgent(supabase, telemetry, llm),
        amenities_agent=AmenitiesAgent(supabase, telemetry, llm),
        language_agent=LanguageAgent(supabase, telemetry, llm),
        payment_agent=PaymentMethodAgent(supabase, telemetry, llm),
        environment_agent=EnvironmentAgent(supabase, telemetry, llm),
        pet_policy_agent=PetPolicyAgent(supabase, telemetry, llm),
        media_agent=MediaAgent(supabase, telemetry, llm),
        provider_agent=ProviderAgent(supabase, telemetry, llm),
        schedule_agent=ScheduleAgent(supabase, telemetry, llm),
        webhook=webhook,
        telemetry=telemetry,
        router=router,
    )

    app = FastAPI(title="Bertel Migration Tool", version="0.1.0")

    templates_path = pathlib.Path(__file__).parent / "templates"
    static_path = pathlib.Path(__file__).parent / "static"
    templates = Jinja2Templates(directory=str(templates_path))

    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

    @app.on_event("startup")
    async def _startup() -> None:  # pragma: no cover - FastAPI lifecycle
        telemetry.record("app.startup", {})

    @app.get("/", response_class=HTMLResponse)
    async def dashboard(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            "dashboard.html",
            {
                "request": request,
            },
        )

    @app.get("/health")
    async def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/events")
    async def events() -> Dict[str, object]:
        return {"events": telemetry.snapshot()}

    @app.get("/agents")
    async def agents() -> Dict[str, object]:
        return {"agents": list(coordinator.descriptors())}

    @app.post("/ingest", response_model=IngestionResponse)
    async def ingest(payload: RawEstablishmentPayload) -> IngestionResponse:
        fragments, leftovers = await coordinator.handle(payload)
        response = IngestionResponse(
            establishment_name=payload.establishment_name,
            routed_fragments=fragments,
            unresolved_fragments=leftovers,
        )
        telemetry.record(
            "coordinator.responded",
            response.model_dump(),
        )
        return response

    return app


def run() -> None:  # pragma: no cover - convenience script
    import uvicorn

    uvicorn.run("migration_tool.main:create_app", factory=True, reload=False)


__all__ = ["create_app", "run"]
