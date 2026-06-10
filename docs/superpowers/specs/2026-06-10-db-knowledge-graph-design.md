# Database Knowledge Graph — Design Spec (2026-06-10)

## Goal

A **re-runnable tool** that turns the Bertel3.0 Postgres schema into two kept-in-sync artifacts:
1. an **interactive visual** you open and explore (tables, FKs, the `object_type` enum, RPCs, RLS policies, triggers); and
2. an **agent-readable summary** Claude reads to answer DB questions accurately ("what writes `object_fma`?", "which policies gate `object_price`?") instead of re-deriving from ~1 MB of `.sql`.

It covers the **full schema** — with the **object-to-object relationship model surfaced first-class** (the user's headline ask: "the object, the relationship between objects, and the RPCs").

## Locked decisions (from brainstorming 2026-06-10)

| Decision | Choice | Why |
|---|---|---|
| Purpose | **Both** — visual explorer + agent context | The user wants to see/understand it *and* give Claude accurate DB context |
| Source of truth | **Hybrid** — live catalog (`pg_catalog`) for structure + `.sql` `--` comments for prose | Catalog is authoritative & complete (fresh==live verified); but most documentation lives in `--` line comments / file headers, **not** `COMMENT ON`, so the files are needed for docs |
| Scope | **Full schema** (~158 tables, ~138 `api.*` functions, all policies/triggers) | User wants completeness; ~300–400 nodes is small vs the 5,800-node code graph and stays tractable with clustering + filters |
| Build strategy | **Re-runnable tool**, split **extract → build** | Only option that delivers the hybrid source, refreshes cleanly as the schema evolves (it changes often), and keeps the build credential-free |
| RPC→table edges | **Regex scan** of function bodies, flagged `inferred` | Fast, no deps, ~95% accurate at this scale; a real SQL parse (sqlglot) is marginal gain for more complexity |

## Architecture — three stages

```
extract  →  tools/db-graph/db_graph_extract.sql   (one query: pg_catalog → db-graph-out/catalog.json)
build    →  tools/db-graph/db_graph.py            (catalog.json + .sql docs → model + edges + clusters)
emit     →  db-graph-out/graph.json · graph.html · DB_REPORT.md
```

### Stage 1 — extract (`db_graph_extract.sql`)
One committed introspection query that returns the entire catalog as a **single JSON document** (`SELECT json_build_object(...)`), so it can be run uniformly via:
- `psql "$DATABASE_URL" -tAf db_graph_extract.sql > db-graph-out/catalog.json` (the user's Supabase connection string), **or**
- the Supabase MCP `execute_sql` (Claude refreshes it).

It emits, scoped to the project schemas (`public`, `api`, `internal`, `audit`, `crm`); `auth.users` is included **only as a referenced external node** (the FK target for `app_user_profile` / actor links), not fully expanded; `pg_catalog` / `information_schema` / `extensions` / `storage` / `graphql` are excluded:
- **tables / views / matviews** — name, schema, kind, `relrowsecurity`, `COMMENT ON` (`obj_description`), and **columns** (name, type, nullable, default, is-PK).
- **foreign keys** — `pg_constraint` contype='f': (table, columns) → (referenced table, columns).
- **enums** — `pg_enum`: type name + ordered values (the `object_type` 17-value enum especially).
- **functions/RPCs** — `pg_proc`: schema, name, arg signature, return type, `prosecdef` (SECURITY DEFINER), `provolatile`, and **`prosrc`** (the body, for read/write inference) + `COMMENT ON`.
- **policies** — `pg_policies`: table, name, cmd, roles, `qual`, `with_check`.
- **triggers** — `pg_trigger` (non-internal): table, name, timing/events, the function it executes.

The build step does **not** need DB access — `catalog.json` is the contract.

### Stage 2 — build (`db_graph.py`, Python, runs in the existing `.tools/python` venv)
Pure transforms (each unit-testable in isolation):
1. **`catalog_to_nodes(catalog)`** → node list (one per table/view/matview/enum/function/policy/trigger). Columns are attached to their table node as a property, **not** separate nodes.
2. **`catalog_to_edges(catalog)`** → structural edges: `fk`, `gates` (policy→table), `trigger_on` (trigger→table) + `executes` (trigger→function), `typed_by` (enum-typed column → enum).
3. **`infer_rpc_table_edges(functions)`** → `reads`/`writes` edges by regex-scanning each `prosrc` for identifiers after `from`/`join` (read) and `insert into`/`update`/`delete from` (write), resolved against the known table set. Edges are tagged `confidence: "inferred"`. `EXECUTE format(...)` dynamic SQL that can't be resolved is recorded as a per-function `dynamic_sql: true` flag rather than a guessed edge.
4. **`attach_sql_docs(nodes, sql_files)`** → scans `Base de donnée DLL et API/*.sql` for each object's definition (`CREATE TABLE x`, `CREATE … FUNCTION api.y`) and attaches the **preceding `--` comment block** (and file header) as the node's `doc` when the catalog `COMMENT ON` is absent. Catalog `COMMENT ON` wins when present.
5. **`classify(node)`** → `schema` + a `domain` tag (object-core, object-facets, opening, pricing, media, sustainability, ref-lookups, actor-org, rbac, audit, branding, other) by name/prefix rules, used for cluster coloring/grouping.

### Stage 3 — emit
Writes the three artifacts (Outputs 1 & 2 below).

## Graph data model

**Node kinds** (~300–400 total): `table`, `view`, `matview`, `enum`, `function`, `policy`, `trigger`.

**Edge kinds:**
- `fk` — table → referenced table (carries the column pair).
- `reads` / `writes` — function → table (inferred, flagged).
- `gates` — policy → table.
- `trigger_on` — trigger → table; `executes` — trigger → function.
- `typed_by` — table (column) → enum.
- **Object-model relationship layer (first-class, SCHEMA-level — not per-row instances):** the relationship *structure* is surfaced on its own, so "how objects relate" reads without the FK plumbing noise —
  - the `object_type` enum node carrying its 17 values;
  - the three link tables — `object_relation`, `object_org_link`, `actor_object_role` — tagged as the **relationship carriers** (object↔object, object↔ORG, actor↔object) with their FK endpoints into `object`/`actor` highlighted, and `object_relation`'s vocabulary table `ref_object_relation_type` attached;
  - the **type→facet rule** read from `ref_facet_applicability`'s 21 rows (a *compact reference table*, deliberately read as data — not bulk) rendered as `applies_to` edges: each `object_type` value → the facet table it may carry.
  - **Per-row instance relationships** (which specific objects link to which) are **data, not schema** → out of scope for v1; a future "data-level mode" could plot them. The one exception is the 21-row applicability rule above, which is small enough to render as structure.

**Clustering:** group by `schema` first, then `domain` tag; the visual colors nodes by kind and can group/tint by domain.

## Output 1 — interactive visual (`db-graph-out/graph.html`)

Self-contained HTML, **d3 force layout** (d3 from cdnjs, like graphify's `graph.html`). Keeps the full-schema view usable via:
- **Filter panel** — toggle node kinds (hide `policy`/`trigger`), schemas, edge kinds, and domains (e.g. hide `ref-lookups` + `audit` to declutter).
- **Search box** — jump to a table/function by name.
- **Click a node → detail panel** — its columns (name·type·nullable·PK), inbound/outbound FKs, the policies gating it, its triggers, the RPCs that read/write it, and its `doc`.
- Nodes colored by kind, sized by degree; object-model relationship edges visually distinct.

## Output 2 — agent artifact (`db-graph-out/DB_REPORT.md` + `graph.json`)

- **`DB_REPORT.md`** — the agent-readable map:
  - **Index** (tables by domain; functions by schema).
  - **Object model** section: the `object_type` enum + values, the `ref_facet_applicability` matrix, and the three relationship tables explained.
  - **Per-table** sections: columns, FKs in/out, RLS policies (cmd + predicate summary), triggers, RPCs that read/write it, and the `doc`.
  - **Per-RPC** sections: signature, SECURITY DEFINER?, tables read/written (flagged inferred), and the `doc`.
- **`graph.json`** — the machine-readable model (nodes + edges + metadata) for queries/diffs.
- **`CLAUDE.md` pointer** — one line directing Claude to read `db-graph-out/DB_REPORT.md` for database questions (mirrors how graphify is referenced today).

## File layout, refresh, and git

```
tools/db-graph/
  db_graph_extract.sql     # the introspection query (committed)
  db_graph.py              # the build script (committed)
  test_db_graph.py         # unit + smoke tests (committed)
db-graph-out/
  catalog.json             # extract output      — GITIGNORED (transient, bulky)
  graph.json               # the model           — COMMITTED (small, diff-reviewable, agent reads)
  graph.html               # interactive visual  — GITIGNORED (bulky, regenerable)
  DB_REPORT.md             # agent artifact       — COMMITTED (agent reads; reviewable in diffs)
```

**Refresh workflow:**
1. Extract: `psql "$DATABASE_URL" -tAf tools/db-graph/db_graph_extract.sql > db-graph-out/catalog.json` (or Claude runs it via the MCP and writes `catalog.json`).
2. Build: `.tools/python/Scripts/python tools/db-graph/db_graph.py` → regenerates `graph.json`, `graph.html`, `DB_REPORT.md`.

(A git hook / `npm`-style shortcut can be added later — not in v1.)

## Testing

- **Unit** (pure transforms): `catalog_to_nodes`, `catalog_to_edges`, `infer_rpc_table_edges` (incl. a dynamic-SQL case that must NOT emit a guessed edge), `attach_sql_docs` (preceding `--` block association), `classify`.
- **Smoke**: against a small fixture `catalog.json`, assert node/edge counts and that a known table (`object_fma`) renders its 3 per-command policies + the RPCs touching it, and that the `object_type` enum surfaces its values.
- **Optional live check**: a script run that builds from a fresh MCP-extracted `catalog.json` and asserts counts are within range of the live catalog (table count, function count).

## Out of scope (YAGNI)

- **Column-level nodes** — columns live in the table's detail/section, not as graph nodes (would explode node count with little value).
- **A dedicated ER-diagram renderer** — the detail panel lists columns + FKs; no separate boxes-and-crows-feet view in v1.
- **`sqlglot` / full SQL parse** — regex inference is sufficient; revisit only if false edges become a real problem.
- **Live-introspection-at-build mode** — the decoupled `catalog.json` contract is the design; no single-shot DB-connecting build.
- **Auto-refresh hook** — manual two-step refresh in v1; a hook can come later.
- **Any write to the database** — the tool is strictly read-only (introspection only).

## Risks / notes

- **Dynamic SQL** (`EXECUTE format(...)`) in functions (e.g. `api.facet_applicability_violations`, the §47 policy loops) can't be resolved to table names by regex → those are flagged `dynamic_sql`, not turned into guessed edges. Acceptable; noted in the report.
- **Catalog visibility** — the extract must run as a role that can read all target schemas (the Supabase service/owner connection does; the MCP does).
- **Schema churn** — the DB evolves frequently (§46–§48 landed during this session); the committed `DB_REPORT.md`/`graph.json` will show meaningful diffs on each refresh, which is a feature (review-able schema drift).
