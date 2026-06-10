# DB knowledge graph (tools/db-graph)

Composes [tbls](https://github.com/k1LoW/tbls) (tables/FKs/ER/markdown) with a thin Python glue that adds
functions/RPCs, RLS policies, enums, and a unified interactive force graph. See the design spec:
`docs/superpowers/specs/2026-06-10-db-knowledge-graph-design.md`.

## Prerequisites
- `tbls` on PATH (GitHub release binary `tbls_*_windows_amd64`, or `winget`).
- `TBLS_DSN` env var = the Supabase Postgres connection string, e.g.
  `postgres://USER:PASSWORD@HOST:5432/postgres?sslmode=require` (or the pooler host).
- Python via the repo venv: `.tools/python/Scripts/python.exe`.

## Refresh (full)
```bash
set TBLS_DSN=postgres://...               # PowerShell: $env:TBLS_DSN = "postgres://..."
tbls doc --rm-dist -c tools/db-graph/.tbls.yml
tbls out -t json -o db-graph-out/schema_tbls.json -c tools/db-graph/.tbls.yml
# Gap extract (functions/policies incl. storage + RESTRICTIVE flag/enums/partition map) — psql, OR run db_supplement_extract.sql via the Supabase MCP and save the JSON:
psql "%TBLS_DSN%" -tAf tools/db-graph/db_supplement_extract.sql > db-graph-out/catalog_extra.json
# Build the unified graph + agent artifacts:
.tools/python/Scripts/python.exe tools/db-graph/db_graph.py
```

Outputs: `dbdoc/` (committed), `db-graph-out/graph.json` + `*.md` (committed), `graph.html` + the JSON inputs (gitignored).

## Viewer (`graph.html`)
Open directly in a browser (no server needed). Features: dark theme by default (Light/Dark toggle),
filter chips by node kind and table domain (with all/none shortcuts), search, wheel-zoom + drag-pan,
and click-a-node to highlight its edges/neighbors and list its connections (clickable — click-through
pans to the target; background click clears). Function/policy/trigger labels appear past ~1.3× zoom to
keep the default view readable. Re-render after template changes with
`.tools/python/Scripts/python.exe tools/db-graph/db_graph.py` (re-uses the existing JSON inputs).
