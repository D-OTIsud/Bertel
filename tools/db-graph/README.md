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
# Optional live reference rows for the public documentation:
# 1) run tools/db-graph/db_reference_audit.sql via Supabase MCP execute_sql
#    to verify live counts without returning a huge payload;
# 2) retrieve the project URL + a non-disabled publishable key via Supabase MCP;
# 3) export rows locally through PostgREST, avoiding MCP response truncation:
#    PowerShell:
#    $env:SUPABASE_URL="https://..."
#    $env:SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
#    .tools/python/Scripts/python.exe tools/db-graph/export_reference_live_rest.py
#
# If you specifically need a pure MCP JSON dump and your client can handle the
# payload size, run tools/db-graph/db_reference_extract.sql via MCP execute_sql
# and save the returned `reference_extract` row to db-graph-out/reference_live.json.

# Build the unified graph + agent artifacts:
.tools/python/Scripts/python.exe tools/db-graph/db_graph.py
```

Outputs: `dbdoc/` (generated locally and gitignored), `db-graph-out/graph.json` + `*.md` (committed), `docs/api-db-reference.html` (committed API/DB reference with RPC/table/RLS/ref-code listings from the graph, public live reference rows from Supabase MCP when `db-graph-out/reference_live.json` exists, and top-level non-temporary SQL seeds as fallback), `graph.html` + the JSON inputs (gitignored).

`TBLS_DSN` is still used by `tbls` and by the psql gap extract above. Direct live reference extraction from `TBLS_DSN` is intentionally opt-in only: set `DB_GRAPH_ALLOW_DIRECT_LIVE=1` if MCP is unavailable and you explicitly want that fallback.

## MCP fallback for slow or interrupted native connections

`db_catalog_bulk_extract.sql` is a read-only PostgreSQL 17 catalogue query producing
the JSON datasource accepted by tbls 1.94.5. It reads metadata, never table row data.
Run it through Supabase `execute_sql`, advancing `params.page_offset` by
`params.page_size` until every table is collected. Concatenate all `tables` and
`relations` arrays before rendering; `functions` and `enums` occur on page zero.
Validate the assembled counts against every `total_*` field in `_live_export` and
reject duplicate table names or changed counts between pages.

For a response too large for MCP, retrieve text chunks of at most 40,000 characters
plus the complete payload's `md5` and character length. Use one fixed capture timestamp
literal in place of `statement_timestamp()` for all chunks of a page, and require the
same hash on every chunk. Never replace a missing live page with an older snapshot.
Save the assembled datasource to the ignored `db-graph-out/schema_tbls.json`, then render
locally without repeating remote introspection:

```powershell
tbls doc --dsn "json://db-graph-out/schema_tbls.json" --rm-dist -c tools/db-graph/.tbls.yml
```

Retrieve `db_supplement_extract.sql` through MCP as well. Reference row extraction
uses `db_reference_extract.sql`, then `DB_GRAPH_MCP_REFERENCE_JSON` selects that fresh
file for `db_graph.py`. Generated documentation must distinguish the live extraction
timestamp from later publications or HTTP acceptance checks.

Document references have a separate privacy boundary: only
`public.ref_document.access_scope = 'public'` rows may appear in generated values.
NULL, missing and all other scopes are excluded by the SQL/REST readers, cache loader,
seed merge and final HTML renderer. The complete table schema and audit count remain
available; the audit additionally reports `public_rows` for export reconciliation.

## Viewer (`graph.html`)
Open directly in a browser (no server needed). Features: dark theme by default (Light/Dark toggle),
filter chips by node kind and table domain (with all/none shortcuts), search, wheel-zoom + drag-pan,
and click-a-node to highlight its edges/neighbors and list its connections (clickable — click-through
pans to the target; background click clears). Function/policy/trigger labels appear past ~1.3× zoom to
keep the default view readable. Re-render after template changes with
`.tools/python/Scripts/python.exe tools/db-graph/db_graph.py` (re-uses the existing JSON inputs).
