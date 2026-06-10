# Database Knowledge Graph — Design Spec (2026-06-10)

## Goal

Turn the Bertel3.0 Postgres schema into kept-in-sync artifacts: an **interactive visual** to explore (tables, FKs, the `object_type` enum, RPCs, RLS policies, triggers) and an **agent-readable summary** Claude reads to answer DB questions ("what writes `object_fma`?", "which policies gate `object_price`?"). Covers the **full schema**, with the **object-to-object relationship model surfaced first-class**. Built by **composing an existing tool (tbls) + a thin custom glue**, not from scratch.

## Locked decisions (brainstorming 2026-06-10)

| Decision | Choice | Why |
|---|---|---|
| Purpose | **Both** — visual explorer + agent context | See/understand it *and* give Claude accurate DB context |
| Source of truth | **Hybrid** — live catalog + `.sql` `--` comments | Catalog is authoritative; most docs live in `--` lines, not `COMMENT ON` |
| Scope | **Full schema** (~158 tables, ~138 `api.*` functions, all policies/triggers) | Completeness; ~300–400 nodes stays tractable with filters/clustering |
| Build strategy | **Existing tool (tbls) + thin glue** | tbls is maintained and nails tables/FKs/ER/markdown/viewpoints; only the Bertel-specific gaps need custom code |
| RPC→table edges | **Regex scan** of function bodies, flagged `inferred` | Fast, no deps, ~95% accurate; dynamic SQL flagged not guessed |
| Visual | **tbls ER + Supabase Studio + a custom interactive force graph** | tbls/Studio give documentation ER + live FK exploration for free; the one bespoke piece is the unified, filterable force graph that also carries RPCs/policies/enums |

## What tbls covers vs the glue (verified against tbls docs, 2026-06-10)

- **tbls covers (the bulk):** tables, views, columns, FKs, indexes, constraints, **triggers**, comments, **ER diagrams** (SVG + Mermaid), a machine-readable **`schema.json`**, and **viewpoints** (focused domain sub-diagrams). Convention: commit `dbdoc/`; `tbls diff` catches drift.
- **tbls does NOT cover (→ the glue):** database **functions/RPCs**, **RLS policies**, **custom types/enums** (so it won't even show `object_type`). It reads `COMMENT ON`, **not** `--` file comments.

## Architecture — compose + glue

```
tbls doc                       →  dbdoc/                       (per-table .md, ER svg+mermaid, viewpoints)   [existing tool]
tbls out -t json -o …          →  db-graph-out/schema_tbls.json (machine-readable table/FK/trigger backbone)  [existing tool]
db_supplement_extract.sql      →  db-graph-out/catalog_extra.json (functions + policies + enums + applicability) [psql or MCP]
db_graph.py  reads schema_tbls.json + catalog_extra.json
             →  db-graph-out/graph.json + graph.html            (unified force graph)
             →  db-graph-out/FUNCTIONS.md · POLICIES.md · TYPES.md · DB_AGENT_INDEX.md
Supabase Studio                →  live interactive FK exploration                                       [built-in, zero build]
```

### Components
1. **tbls** — release binary on PATH (no go/scoop here → GitHub release `tbls_*_windows_amd64` dropped in `~/.local/bin`, or `winget`). Driven by a committed **`tools/db-graph/.tbls.yml`** with:
   - `dsn: ${TBLS_DSN}` — **env interpolation only; the file MUST NOT contain a literal connection string** (it is committed).
   - `disableOutputSchema: true` — so `tbls doc` does **not** write `dbdoc/schema.json` (the JSON backbone comes from `tbls out` into `db-graph-out/` instead, avoiding a stray committed schema dump and a `--rm-dist` conflict).
   - output `dbdoc/`, ER format `mermaid` + `svg`, and **viewpoints** including an **"Object model"** viewpoint (object + object_* facet/child tables + `object_relation`/`object_org_link`/`actor_object_role` + `ref_facet_*`).
   Run: `tbls doc` then `tbls out -t json -o db-graph-out/schema_tbls.json`.
2. **Gap extract** — committed **`tools/db-graph/db_supplement_extract.sql`**: one query → `catalog_extra.json` with `pg_proc` (functions: schema, name, args, returns, `prosecdef`, `prosrc`, comment), `pg_policies` (RLS), `pg_type`/`pg_enum` (enums + values + columns using each), and the small `ref_facet_applicability` rows (the type→facet rule). Run via psql (`TBLS_DSN`) **or** the Supabase MCP.
3. **Glue build** — **`tools/db-graph/db_graph.py`** (Python, `.tools/python` venv). Pure transforms, each unit-testable:
   - `load_tbls_schema(db-graph-out/schema_tbls.json)` → table/view/column/FK/trigger backbone, produced by `tbls out --format json` (no re-introspection — tbls already did it).
   - `load_extra(catalog_extra.json)` → function/policy/enum records.
   - `infer_rpc_table_edges(functions)` → `reads`/`writes` edges by regex over `prosrc` (after `from`/`join` = read; `insert into`/`update`/`delete from` = write), resolved against the known table set. **Each edge carries confidence metadata**: `inference: { method: "regex", confidence: "high|medium|low", evidence: "<matched clause>" }` — `high` for an unambiguous `insert into <known_table>` / `from <known_table>`; `medium`/`low` when the identifier is an alias/CTE name, qualified oddly, or sits near a dynamic block. Unresolved `EXECUTE format(...)` → a function-level `dynamic_sql: true` flag, **no guessed edge**.
   - `attach_sql_docs(nodes, "Base de donnée DLL et API/*.sql")` → the preceding `--` comment block for each `CREATE … FUNCTION`/policy (which tbls never sees); `COMMENT ON` wins when present.
   - `build_graph(...)` → unified `graph.json` + renders `graph.html`.
   - `write_supplement(...)` → `FUNCTIONS.md`, `POLICIES.md`, `TYPES.md`, `DB_AGENT_INDEX.md`.

## Graph data model (the custom force graph)

- **Nodes**: `table`/`view`/`matview` (from tbls schema.json), `enum`, `function`, `policy`, `trigger`. Columns stay in detail, not as nodes.
- **Edges**: `fk` (tbls), `reads`/`writes` (glue, inferred), `gates` (policy→table), `trigger_on`/`executes` (trigger→table/function), `typed_by` (column→enum).
- **Object-model layer (first-class, SCHEMA-level — not per-row instances):** the `object_type` enum + 17 values; the three link tables (`object_relation`, `object_org_link`, `actor_object_role`) tagged as relationship carriers with their FK endpoints into `object`/`actor` highlighted + `ref_object_relation_type` vocabulary; and the type→facet rule from `ref_facet_applicability`'s 21 rows rendered as `applies_to` edges. Per-row instance relationships are data, not schema → out of scope v1.
- **Clustering / filtering**: by schema + domain tag; the `graph.html` filter panel toggles node kinds / schemas / domains / edge kinds, has search, and a click→detail panel.

**Committed-artifact content (no function bodies):** function nodes in the **committed** `graph.json` and `FUNCTIONS.md` carry **signature, return type, SECURITY DEFINER flag, the inferred reads/writes edges (+ confidence), and the doc — NOT the full `prosrc` body**. `prosrc` is read only transiently for edge inference and lives **only** in the gitignored `catalog_extra.json`. (The repo is private, so this is a deliberate leanness/dedup choice — bodies already live in the `.sql` files — not a secrecy requirement.)

## Outputs

1. **`dbdoc/` (tbls, COMMITTED)** — per-table Markdown + ER diagrams (SVG + Mermaid incl. the object-model viewpoint). The human/agent table+FK documentation. (No `schema.json` here — `disableOutputSchema: true`; the JSON backbone is `db-graph-out/schema_tbls.json` via `tbls out`.)
2. **Supabase Studio Schema Visualizer** — live interactive FK exploration, no artifact (just a workflow note in the README).
3. **`db-graph-out/` glue (mixed git)** — `graph.html` (custom interactive force graph; gitignored, regenerable), `graph.json` (unified model; committed), `FUNCTIONS.md` + `POLICIES.md` + `TYPES.md` + `DB_AGENT_INDEX.md` (agent artifacts; committed).
4. **`CLAUDE.md` pointer** — one line → `db-graph-out/DB_AGENT_INDEX.md` (which links to `dbdoc/` + the supplement), mirroring how graphify is referenced.

## File layout, refresh, git

```
tools/db-graph/
  .tbls.yml                  # tbls config (${TBLS_DSN} only, viewpoints, dbdoc/) — committed
  db_supplement_extract.sql  # functions+policies+enums query              — committed
  db_graph.py                # glue build                                  — committed
  test_db_graph.py           # tests                                       — committed
  README.md                  # refresh command sequence + prerequisites    — committed
dbdoc/                       # tbls output (md, ER; NO schema.json — disabled) — COMMITTED (tbls convention)
db-graph-out/
  schema_tbls.json           # tbls JSON (glue input)  — GITIGNORED
  catalog_extra.json         # gap extract (glue input)— GITIGNORED
  graph.html                 # custom force graph      — GITIGNORED
  graph.json                 # unified model           — COMMITTED
  FUNCTIONS.md POLICIES.md TYPES.md DB_AGENT_INDEX.md   — COMMITTED
```

**Refresh** (also documented in `tools/db-graph/README.md`): `set TBLS_DSN=…` → `tbls doc` → `tbls out -t json -o db-graph-out/schema_tbls.json` → run the gap extract (psql or MCP → `catalog_extra.json`) → `.tools/python/Scripts/python tools/db-graph/db_graph.py`.

## Prerequisites (confirm before implementation)

- **Supabase direct connection string** (DSN with password + `sslmode=require`, or the pooler host) — **tbls connects live and cannot run without it.** The glue's gap-extract can alternatively run via the MCP, but tbls (the bulk) needs the DSN. → User to provide / confirm available.
- **tbls binary** installed on PATH (release binary or winget).

## Testing

- **Unit** (glue transforms): `infer_rpc_table_edges` (incl. a dynamic-SQL case that must NOT emit a guessed edge), `attach_sql_docs`, `load_tbls_schema`, `build_graph`, `classify`.
- **Smoke**: from a small fixture (`schema.json` + `catalog_extra.json`), assert node/edge counts, that `object_fma` carries its 3 per-command policies + the RPCs touching it, and that the `object_type` enum surfaces its values.
- tbls itself is trusted (maintained); we don't test it, only the glue and the assembled graph.

## Out of scope (v1, YAGNI)

- Re-introspecting tables/FKs in the glue (tbls owns that via `schema.json`).
- Column-level graph nodes; a hand-built ER renderer (tbls owns ER).
- `sqlglot` / full SQL parse (regex inference is enough).
- Per-row instance object relationships (a future "data-level mode").
- Auto-refresh hook (manual refresh in v1).
- Any DB write (read-only introspection only).

## Risks / notes

- **DSN is a hard dependency** for tbls (see Prerequisites). If unavailable, the bulk can't be generated by tbls and we'd revisit (the glue could fall back to MCP-introspecting tables too, but that re-adds the code we're avoiding).
- **Dynamic SQL** (`EXECUTE format(...)`, the §47 policy loops, `api.facet_applicability_violations`) → flagged `dynamic_sql`, not guessed edges.
- **`tbls doc --rm-dist`** would wipe non-tbls files in `dbdoc/`, so glue output lives in `db-graph-out/`, not `dbdoc/`.
- **Schema churn** (§46–§48 landed this session) → committed `graph.json`/`*.md`/`dbdoc/` show review-able drift on each refresh (a feature; `tbls diff` can gate it in CI later).
