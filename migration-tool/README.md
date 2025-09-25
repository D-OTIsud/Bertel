# Bertel Migration Tool

This package contains a lightweight ingestion service designed to receive heterogeneous establishment payloads, orchestrate their normalisation and dispatch the resulting entities to the unified Bertel database.

The tool exposes an HTTP API as well as a monitoring dashboard that lets operators visualise the journey of each payload, observe which specialised agent handled which slice of data, and inspect eventual routing errors. Unhandled fragments can be escalated to an external webhook for manual triage.

## Features

- **FastAPI ingestion endpoint** receiving raw JSON payloads.
- **Coordinator agent** that partitions payloads into semantic sections (identity, localisation, contact, amenities, schedule, media and legacy identifiers).
- **Specialised agents** that transform their respective section and write to Supabase/PostgreSQL using the existing unified schema.
- **In-memory telemetry log** that records every routing step and feeds the dashboard UI.
- **Webhook notifications** whenever a fragment cannot be routed to a specialised agent.
- **Dashboard UI** (available at `/`) with live updates of processed payloads, emitted records and potential failures.

## Getting started

### 1. Install dependencies

```bash
pip install -e .[dev]
```

### 2. Configure environment variables

Create a `.env` file (or export the variables) with the credentials of your Supabase instance and the webhook endpoint used for escalation:

```env
MIGRATION_SUPABASE_URL=<https://your-project.supabase.co>
MIGRATION_SUPABASE_SERVICE_KEY=<service_role_key>
MIGRATION_WEBHOOK_URL=<https://your.webhook/endpoint>
MIGRATION_DASHBOARD_RETENTION=200  # optional, number of events kept in memory
```

### 3. Launch the API server

```bash
uvicorn migration_tool.main:create_app --factory --reload --port 8090
```

The dashboard is exposed on [http://localhost:8090/](http://localhost:8090/). The ingestion endpoint is available at `POST /ingest`.

### 4. Run the test-suite

```bash
pytest
```

### 5. Containerised usage

You can run the ingestion stack through Docker without installing any local Python dependencies.

1. Create a `.env` file next to `docker-compose.yml` (reuse the variables from step 2).
2. Build and start the stack:

   ```bash
   docker compose up --build
   ```

   The API will be available on [http://localhost:8090](http://localhost:8090). The same container serves the dashboard UI.

3. To stop the services:

   ```bash
   docker compose down
   ```

## API overview

- `POST /ingest`: submit a raw establishment payload (JSON). Returns the actions performed by each agent and the list of unresolved fragments.
- `GET /events`: retrieve the latest telemetry entries.
- `GET /agents`: list registered agents and the kind of payload slices they accept.
- `GET /health`: simple health probe.
- `GET /`: dashboard visualisation.

## Architecture

```
migration_tool/
├── agents/
│   ├── base.py              # shared agent protocol
│   ├── coordinator.py       # coordinator + partition logic
│   ├── identity.py          # writes canonical establishment entries
│   ├── location.py          # handles addresses & geospatial data
│   ├── contact.py           # handles phone/mail/web & access info
│   ├── amenities.py         # handles equipment/services tags
│   └── media.py             # handles media galleries
├── config.py                # settings sourced from env vars
├── main.py                  # FastAPI application factory
├── schemas.py               # pydantic models for I/O & context
├── supabase_client.py       # safe Supabase wrapper
├── telemetry.py             # in-memory event bus
└── webhook.py               # async notifier for unresolved fragments
```

Specialised agents never alter the business meaning of the data. They solely adjust the structure (renaming fields, splitting arrays, converting coordinates) before persisting the records.

## Development notes

- The Supabase wrapper degrades gracefully when credentials are missing: operations are recorded as "skipped" within telemetry so the rest of the pipeline can still be exercised locally.
- The dashboard uses progressive enhancement (vanilla JS + HTMX-style polling) to keep the stack lightweight. No additional build step is required.
- Event retention is purely in-memory; for production usage you may want to plug a persistent backend (Redis, Postgres etc.).

## License

MIT
