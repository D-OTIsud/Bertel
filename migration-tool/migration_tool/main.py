"""FastAPI application factory."""

from __future__ import annotations

import pathlib
from typing import Dict

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .agents.amenities import AmenitiesAgent
from .agents.contact import ContactAgent
from .agents.coordinator import Coordinator
from .agents.identity import IdentityAgent
from .agents.location import LocationAgent
from .agents.media import MediaAgent
from .config import Settings, get_settings
from .schemas import IngestionResponse, RawEstablishmentPayload
from .supabase_client import SupabaseService
from .telemetry import EventLog
from .webhook import WebhookNotifier


def create_app(settings: Settings = Depends(get_settings)) -> FastAPI:
    telemetry = EventLog(retention=settings.dashboard_retention)
    supabase = SupabaseService(settings.supabase_url, settings.supabase_service_key, telemetry)
    webhook = WebhookNotifier(settings.webhook_url, telemetry)

    coordinator = Coordinator(
        identity_agent=IdentityAgent(supabase, telemetry),
        location_agent=LocationAgent(supabase, telemetry),
        contact_agent=ContactAgent(supabase, telemetry),
        amenities_agent=AmenitiesAgent(supabase, telemetry),
        media_agent=MediaAgent(supabase, telemetry),
        webhook=webhook,
        telemetry=telemetry,
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
