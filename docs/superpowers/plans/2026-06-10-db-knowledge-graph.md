# Database Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a re-runnable tool that turns the Bertel3.0 Postgres schema into an interactive visual + an agent-readable summary, by composing `tbls` (tables/FKs/ER/markdown) with a thin Python glue that adds functions/RPCs, RLS policies, enums, and a unified force graph.

**Architecture:** `tbls` introspects live Postgres → `dbdoc/` (markdown + ER) and `db-graph-out/schema_tbls.json` (the table/FK/trigger backbone). A gap-extract SQL pulls the three things tbls can't see (functions+bodies, RLS policies, enums) → `catalog_extra.json`. A Python glue merges both, infers RPC→table edges by regex (with confidence), attaches `--` docs, and emits a unified `graph.json` + interactive `graph.html` + `FUNCTIONS.md`/`POLICIES.md`/`TYPES.md`/`DB_AGENT_INDEX.md`. Committed artifacts carry no function bodies.

**Tech Stack:** `tbls` (Go binary), Python 3 (stdlib only — runs in the existing `.tools/python` venv), d3.js (CDN, in the generated HTML), Supabase MCP / `psql` for extraction.

---

## Context primer (read first — assume zero project context)

- **Repo:** `C:\Users\dphil\Bertel3.0` (Windows, git branch `master`, commit directly to master then push — the project's convention).
- **Design spec (read it):** `docs/superpowers/specs/2026-06-10-db-knowledge-graph-design.md`. This plan implements it. If anything here contradicts the spec, the spec wins.
- **Python:** use the existing venv — `.tools/python/Scripts/python.exe` and `.tools/python/Scripts/pip.exe`. No new pip deps (stdlib only). Run tests with `.tools/python/Scripts/python.exe -m pytest` (install pytest into the venv in Task 0 if absent).
- **Live DB:** reachable two ways — (a) the **Supabase MCP** `execute_sql` (the agent has this; no creds in the repo), or (b) `psql "$TBLS_DSN"` if the user exports a connection string. **tbls needs (b)**; the gap-extract can use either.
- **`.sql` source:** `Base de donnée DLL et API/*.sql` (folder name has spaces + accents — always quote paths).
- **The data model the glue produces** (used by every task — keep field names exact):

```python
# Node (dict)
{
  "id": str,        # "public.object" (table/view/enum) | "api.rpc_create_object(text,text,text)" (function, schema.name+args)
                    # | "policy:public.object_fma:canonical_ins_object_fma" | "trigger:public.object:trg_guard_object_type_change"
  "kind": str,      # "table" | "view" | "matview" | "enum" | "function" | "policy" | "trigger"
  "label": str,     # short display name ("object", "rpc_create_object", "canonical_ins_object_fma")
  "schema": str,    # "public" | "api" | "internal" | "audit" | "crm" | "auth"
  "domain": str,    # classify() tag: "object-core","object-facets","opening","pricing","media","sustainability",
                    #                 "ref-lookups","actor-org","rbac","audit","branding","api","other"
  "doc": str | None,
  "props": dict,    # kind-specific (below). FUNCTION props NEVER include the body.
}
# table/view/matview props: {"columns":[{"name","type","nullable":bool,"pk":bool}], "rls_enabled":bool}
# enum     props: {"values":[str]}
# function props: {"signature":str,"returns":str,"security_definer":bool,"volatility":str,"dynamic_sql":bool}
# policy   props: {"table":str,"cmd":str,"roles":[str],"predicate":str}     # predicate = qual/with_check summary
# trigger  props: {"table":str,"timing":str,"events":[str]}

# Edge (dict)
{
  "source": str,    # node id
  "target": str,    # node id
  "kind": str,      # "fk"|"reads"|"writes"|"gates"|"trigger_on"|"executes"|"typed_by"|"object_rel"|"org_link"|"actor_role"|"applies_to"
  "props": dict,    # fk: {"columns":[[child_col,parent_col]]}; reads/writes: {"inference":{"method":"regex","confidence":"high|medium|low","evidence":str}}
}
# Graph (dict): {"meta":{...counts...}, "nodes":[...], "edges":[...]}
```

---

## Task 0: Venv + pytest

**Files:** none (environment setup).

- [ ] **Step 1: Confirm pytest is available in the venv**

Run: `.tools/python/Scripts/python.exe -m pytest --version`
Expected: a version line. If it errors with "No module named pytest", run:
`.tools/python/Scripts/pip.exe install pytest`
Then re-run `--version` and confirm it prints.

- [ ] **Step 2: Create the tool directory**

Run: `mkdir tools\db-graph` (PowerShell) — confirm `tools/db-graph/` exists.

---

## Task 1: tbls config + tool README + gitignore

**Files:**
- Create: `tools/db-graph/.tbls.yml`
- Create: `tools/db-graph/README.md`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Write `tools/db-graph/.tbls.yml`**

```yaml
# tbls config for the Bertel3.0 DB knowledge graph.
# DSN is taken ONLY from the TBLS_DSN env var — never put a literal connection string here (this file is committed).
dsn: ${TBLS_DSN}

# Output table docs + ER here; commit dbdoc/.
docPath: dbdoc

# Do NOT write dbdoc/schema.json (tbls doc would by default). The JSON backbone comes from
# `tbls out -t json -o db-graph-out/schema_tbls.json` instead (kept out of dbdoc/ to avoid a stray
# committed dump and a --rm-dist conflict).
disableOutputSchema: true

format:
  adjust: true

er:
  format: svg

# Focused sub-diagram for the object model (the relationship layer).
viewpoints:
  - name: Object model
    desc: The object entity, its type-specific facet tables, child tables, and object-to-object relationships.
    tables:
      - object
      - object_relation
      - object_org_link
      - actor_object_role
      - object_iti
      - object_fma
      - object_act
      - object_room_type
      - object_meeting_room
      - object_menu
      - ref_facet_registry
      - ref_facet_applicability
```

- [ ] **Step 2: Write `tools/db-graph/README.md`**

````markdown
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
# Gap extract (functions/policies/enums) — psql, OR run db_supplement_extract.sql via the Supabase MCP and save the JSON:
psql "%TBLS_DSN%" -tAf tools/db-graph/db_supplement_extract.sql > db-graph-out/catalog_extra.json
# Build the unified graph + agent artifacts:
.tools/python/Scripts/python.exe tools/db-graph/db_graph.py
```

Outputs: `dbdoc/` (committed), `db-graph-out/graph.json` + `*.md` (committed), `graph.html` + the JSON inputs (gitignored).
````

- [ ] **Step 3: Add gitignore entries**

Append to `.gitignore` (repo root):

```
# DB knowledge graph — transient/bulky outputs (db-graph-out/graph.json + *.md ARE committed)
db-graph-out/schema_tbls.json
db-graph-out/catalog_extra.json
db-graph-out/graph.html
```

- [ ] **Step 4: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/.tbls.yml tools/db-graph/README.md .gitignore
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): tbls config + tool README + gitignore" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Gap-extract SQL + real fixture

**Files:**
- Create: `tools/db-graph/db_supplement_extract.sql`
- Create: `tools/db-graph/fixtures/catalog_extra.sample.json` (committed test fixture)

The extract returns ONE json row: `{ "functions":[...], "policies":[...], "enums":[...], "applicability":[...] }`.

- [ ] **Step 1: Write `tools/db-graph/db_supplement_extract.sql`**

```sql
-- db_supplement_extract.sql — the gaps tbls does not cover: functions (with bodies, for edge
-- inference only), RLS policies, enums (+ columns using them), and the type->facet applicability rows.
-- Emits a single JSON document. Run via psql (-tA) or the Supabase MCP.
SELECT json_build_object(
  'functions', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'args', pg_get_function_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'comment', obj_description(p.oid, 'pg_proc'),
      'body', p.prosrc
    ))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','api','internal','audit','crm')
      AND p.prokind = 'f'
  ), '[]'::json),
  'policies', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', schemaname, 'table', tablename, 'name', policyname,
      'cmd', cmd, 'roles', roles, 'qual', qual, 'with_check', with_check
    ))
    FROM pg_policies WHERE schemaname IN ('public','api','internal','audit','crm')
  ), '[]'::json),
  'enums', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', n.nspname, 'name', t.typname,
      'values', (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid),
      'used_by', (SELECT COALESCE(json_agg(DISTINCT (cn.nspname || '.' || c.relname || '.' || a.attname)), '[]'::json)
                  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace cn ON cn.oid = c.relnamespace
                  WHERE a.atttypid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
                    AND c.relkind IN ('r','p','v','m')   -- real relations only (exclude index pseudo-columns)
                    AND cn.nspname IN ('public','api','internal','audit','crm'))
    ))
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e' AND n.nspname IN ('public','api','internal','audit','crm')
  ), '[]'::json),
  'applicability', COALESCE((
    SELECT json_agg(json_build_object('object_type', a.object_type::text, 'facet_table', a.facet_table))
    FROM ref_facet_applicability a
  ), '[]'::json)
) AS extra;
```

- [ ] **Step 2: Run it against live and save a fixture.** Run the query via the Supabase MCP `execute_sql` (paste the SQL body). Build `tools/db-graph/fixtures/catalog_extra.sample.json` from the result with: **exactly these 3 functions** — `api.rpc_create_object` (body contains `INSERT INTO object`), `api.assert_object_type_change_consistent` (body contains `EXECUTE format(` — and it is the function the `schema_tbls.sample.json` trigger executes, so the build's `executes` edge resolves), and `api.is_object_owner` (read-only `SELECT … FROM actor_object_role`); the **3 `object_fma` per-command policies** (`canonical_ins/upd/del_object_fma`); the **`object_type` enum** (its 17 values + a `used_by` of `["public.object.object_type"]`); and **3 applicability rows**. Keep the function `body` short — trim to the lines that contain the read/write/dynamic clauses. This fixture drives the TDD in Tasks 3–7 without a live DB.

- [ ] **Step 3: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add "tools/db-graph/db_supplement_extract.sql" tools/db-graph/fixtures/catalog_extra.sample.json
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): gap-extract SQL (functions/policies/enums) + fixture" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `load.py` — parse tbls JSON + the gap-extract

**Files:**
- Create: `tools/db-graph/dbgraph/__init__.py` (empty)
- Create: `tools/db-graph/dbgraph/load.py`
- Create: `tools/db-graph/fixtures/schema_tbls.sample.json`
- Test: `tools/db-graph/test_load.py`

tbls JSON shape (verified from tbls `schema/schema.go`): top-level `tables[]` (each `name` like `public.object`, `type` `"TABLE"|"VIEW"`, `comment`, `columns[]` `{name,type,nullable,comment}`, `constraints[]`, `triggers[]` `{name,def,comment}`) and `relations[]` (`{table:{name}, columns:[{name}], parent_table:{name}, parent_columns:[{name}]}`).

- [ ] **Step 1: Write the tbls fixture** `tools/db-graph/fixtures/schema_tbls.sample.json`:

```json
{
  "name": "bertel",
  "tables": [
    {"name": "public.object", "type": "TABLE", "comment": "Root entity",
     "columns": [{"name":"id","type":"text","nullable":false,"comment":"PK"},
                 {"name":"object_type","type":"object_type","nullable":false,"comment":""}],
     "constraints": [{"name":"object_pkey","type":"PRIMARY KEY","columns":["id"]}],
     "triggers": [{"name":"trg_guard_object_type_change","def":"CREATE TRIGGER trg_guard_object_type_change BEFORE UPDATE OF object_type ON object FOR EACH ROW EXECUTE FUNCTION api.assert_object_type_change_consistent()","comment":""}]},
    {"name": "public.object_fma", "type": "TABLE", "comment": "",
     "columns": [{"name":"object_id","type":"text","nullable":false,"comment":""}],
     "constraints": [], "triggers": []}
  ],
  "relations": [
    {"table": {"name": "public.object_fma"}, "columns": [{"name": "object_id"}],
     "parent_table": {"name": "public.object"}, "parent_columns": [{"name": "id"}]}
  ]
}
```

- [ ] **Step 2: Write the failing test** `tools/db-graph/test_load.py`:

```python
import json, os
from dbgraph.load import load_tbls_schema, load_extra

HERE = os.path.dirname(__file__)

def _fix(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as f:
        return json.load(f)

def test_load_tbls_yields_table_nodes_with_columns_and_pk():
    nodes, edges = load_tbls_schema(_fix("schema_tbls.sample.json"))
    obj = next(n for n in nodes if n["id"] == "public.object")
    assert obj["kind"] == "table" and obj["schema"] == "public" and obj["label"] == "object"
    cols = {c["name"]: c for c in obj["props"]["columns"]}
    assert cols["id"]["pk"] is True and cols["object_type"]["pk"] is False

def test_load_tbls_yields_fk_edge_child_to_parent():
    nodes, edges = load_tbls_schema(_fix("schema_tbls.sample.json"))
    fk = [e for e in edges if e["kind"] == "fk"]
    assert {"source": "public.object_fma", "target": "public.object"} == {"source": fk[0]["source"], "target": fk[0]["target"]}
    assert fk[0]["props"]["columns"] == [["object_id", "id"]]

def test_load_tbls_yields_trigger_node_and_executes_edge():
    nodes, edges = load_tbls_schema(_fix("schema_tbls.sample.json"))
    trig = next(n for n in nodes if n["kind"] == "trigger")
    assert trig["props"]["table"] == "public.object"
    assert any(e["kind"] == "trigger_on" and e["source"] == trig["id"] and e["target"] == "public.object" for e in edges)
    assert any(e["kind"] == "executes" and e["source"] == trig["id"] and "assert_object_type_change_consistent" in e["target"] for e in edges)

def test_load_extra_yields_function_policy_enum_nodes():
    extra = _fix("catalog_extra.sample.json")
    nodes, edges = load_extra(extra)
    assert any(n["kind"] == "function" for n in nodes)
    assert any(n["kind"] == "policy" for n in nodes)
    enum = next(n for n in nodes if n["kind"] == "enum")
    assert isinstance(enum["props"]["values"], list) and len(enum["props"]["values"]) > 0
    # function nodes never carry the body
    fn = next(n for n in nodes if n["kind"] == "function")
    assert "body" not in fn["props"] and "prosrc" not in fn["props"]
```

- [ ] **Step 3: Run to verify failure**

Run: `.tools/python/Scripts/python.exe -m pytest tools/db-graph/test_load.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dbgraph'` (run pytest from `tools/db-graph/`: `cd tools/db-graph && ...python.exe -m pytest test_load.py -v`).

- [ ] **Step 4: Create `tools/db-graph/dbgraph/__init__.py`** (empty file).

- [ ] **Step 5: Write `tools/db-graph/dbgraph/load.py`**

```python
"""Parse tbls JSON (tables/FKs/triggers) and the gap-extract JSON (functions/policies/enums)
into the shared node/edge model. No DB access; pure transforms."""
import re

_EXEC_FN = re.compile(r"execute\s+(?:function|procedure)\s+([a-z_][\w]*\.[a-z_][\w]*)\s*\(", re.I)


def _split(qualname):
    """'public.object' -> ('public', 'object'); bare name -> ('public', name)."""
    if "." in qualname:
        s, n = qualname.split(".", 1)
        return s, n
    return "public", qualname


def load_tbls_schema(tbls):
    nodes, edges = [], []
    pk_cols = {}  # table id -> set of pk column names
    for t in tbls.get("tables", []):
        schema, name = _split(t["name"])
        kind = {"VIEW": "view", "MATERIALIZED VIEW": "matview"}.get(t.get("type", "TABLE"), "table")
        pks = set()
        for c in t.get("constraints", []):
            if c.get("type") == "PRIMARY KEY":
                pks.update(c.get("columns", []))
        pk_cols[t["name"]] = pks
        cols = [{"name": c["name"], "type": c["type"], "nullable": bool(c.get("nullable", True)),
                 "pk": c["name"] in pks} for c in t.get("columns", [])]
        nodes.append({"id": t["name"], "kind": kind, "label": name, "schema": schema,
                      "domain": None, "doc": (t.get("comment") or None),
                      "props": {"columns": cols, "rls_enabled": None}})
        for tr in t.get("triggers", []):
            tid = "trigger:%s:%s" % (t["name"], tr["name"])
            nodes.append({"id": tid, "kind": "trigger", "label": tr["name"], "schema": schema,
                          "domain": None, "doc": (tr.get("comment") or None),
                          "props": {"table": t["name"], "timing": None, "events": []}})
            edges.append({"source": tid, "target": t["name"], "kind": "trigger_on", "props": {}})
            m = _EXEC_FN.search(tr.get("def", ""))
            if m:
                edges.append({"source": tid, "target": m.group(1), "kind": "executes", "props": {}})
    for r in tbls.get("relations", []):
        child = r.get("table", {}).get("name")
        parent = r.get("parent_table", {}).get("name")
        if not child or not parent:
            continue
        pairs = list(zip([c["name"] for c in r.get("columns", [])],
                         [c["name"] for c in r.get("parent_columns", [])]))
        edges.append({"source": child, "target": parent, "kind": "fk",
                      "props": {"columns": [list(p) for p in pairs]}})
    return nodes, edges


def _fn_id(schema, name, args):
    return "%s.%s(%s)" % (schema, name, args or "")


def load_extra(extra):
    nodes, edges = [], []
    for f in extra.get("functions", []):
        fid = _fn_id(f["schema"], f["name"], f.get("args", ""))
        nodes.append({"id": fid, "kind": "function", "label": f["name"], "schema": f["schema"],
                      "domain": None, "doc": (f.get("comment") or None),
                      "props": {"signature": "%s(%s)" % (f["name"], f.get("args", "")),
                                "returns": f.get("returns", ""), "security_definer": bool(f.get("security_definer")),
                                "volatility": f.get("volatility", ""), "dynamic_sql": False}})
    for p in extra.get("policies", []):
        pid = "policy:%s.%s:%s" % (p["schema"], p["table"], p["name"])
        tid = "%s.%s" % (p["schema"], p["table"])
        pred = " | ".join(x for x in [p.get("qual"), p.get("with_check")] if x) or ""
        nodes.append({"id": pid, "kind": "policy", "label": p["name"], "schema": p["schema"],
                      "domain": None, "doc": None,
                      "props": {"table": tid, "cmd": p.get("cmd", ""), "roles": p.get("roles") or [],
                                "predicate": pred[:400]}})
        edges.append({"source": pid, "target": tid, "kind": "gates", "props": {}})
    for en in extra.get("enums", []):
        eid = "%s.%s" % (en["schema"], en["name"])
        nodes.append({"id": eid, "kind": "enum", "label": en["name"], "schema": en["schema"],
                      "domain": None, "doc": None, "props": {"values": en.get("values") or []}})
        for col in en.get("used_by", []):
            parts = col.rsplit(".", 1)
            tbl = parts[0] if len(parts) == 2 else col
            edges.append({"source": tbl, "target": eid, "kind": "typed_by", "props": {"column": col}})
    return nodes, edges
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_load.py -v`
Expected: 4 passed. (If `test_load_extra_*` fails because the fixture lacks a function/policy/enum, fix the fixture from Task 2 Step 2.)

- [ ] **Step 7: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/dbgraph/__init__.py tools/db-graph/dbgraph/load.py tools/db-graph/test_load.py tools/db-graph/fixtures/schema_tbls.sample.json
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): load tbls JSON + gap-extract into node/edge model" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `infer.py` — RPC→table edges with confidence

**Files:**
- Create: `tools/db-graph/dbgraph/infer.py`
- Test: `tools/db-graph/test_infer.py`

- [ ] **Step 1: Write the failing test** `tools/db-graph/test_infer.py`:

```python
from dbgraph.infer import infer_rpc_table_edges

TABLES = {"public.object", "public.object_fma", "public.object_price"}

def _fn(name, body, schema="api", args="p_id text"):
    return {"schema": schema, "name": name, "args": args, "body": body}

def test_write_edge_high_confidence_on_insert_into_known_table():
    fns = [_fn("w", "BEGIN INSERT INTO object_fma (object_id) VALUES (p_id); END")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    w = next(e for e in edges if e["kind"] == "writes")
    assert w["target"] == "public.object_fma"
    assert w["props"]["inference"]["confidence"] == "high"

def test_read_edge_from_known_table():
    fns = [_fn("r", "SELECT * FROM object o WHERE o.id = p_id")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    assert any(e["kind"] == "reads" and e["target"] == "public.object" for e in edges)

def test_unknown_table_is_not_emitted():
    fns = [_fn("u", "SELECT * FROM not_a_table")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    assert edges == []

def test_dynamic_sql_flagged_not_guessed():
    fns = [_fn("d", "EXECUTE format('SELECT 1 FROM %I', some_table)")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    assert flags[("api", "d")] is True
    # no edge guessed from inside the format() string
    assert all("some_table" not in e["target"] for e in edges)

def test_dedup_keeps_highest_confidence():
    fns = [_fn("m", "INSERT INTO object_price (x) VALUES (1); UPDATE object_price SET x=2;")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    writes = [e for e in edges if e["kind"] == "writes" and e["target"] == "public.object_price"]
    assert len(writes) == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_infer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dbgraph.infer'`.

- [ ] **Step 3: Write `tools/db-graph/dbgraph/infer.py`**

```python
"""Infer RPC->table reads/writes edges by regex over function bodies. Resolution is against the
known table set; matches are tagged with confidence; dynamic SQL is flagged, never guessed."""
import re

_READ = re.compile(r"\b(?:from|join)\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)", re.I)
_WRITE = re.compile(r"\b(?:insert\s+into|update|delete\s+from)\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)", re.I)
_DYNAMIC = re.compile(r"\bexecute\b.*\bformat\s*\(", re.I | re.S)


def _resolve(ident, tables):
    """Return (table_id, confidence) or (None, None). tables = set of 'schema.name'."""
    ident = ident.lower()
    if ident in tables:
        return ident, "high"
    # bare name -> match a public.<name> or any schema.<name>
    bare = ident.split(".")[-1]
    cands = sorted(t for t in tables if t.split(".")[-1] == bare)  # sorted => deterministic across runs
    if ("public." + bare) in tables:
        return "public." + bare, "high"
    if len(cands) == 1:
        return cands[0], "medium"
    if len(cands) > 1:
        return cands[0], "low"
    return None, None


def infer_rpc_table_edges(functions, tables):
    edges = []
    flags = {}  # (schema, name) -> dynamic_sql bool
    best = {}   # (fid, table, kind) -> (confidence_rank, edge)
    rank = {"high": 3, "medium": 2, "low": 1}
    for f in functions:
        fid = "%s.%s(%s)" % (f["schema"], f["name"], f.get("args", ""))
        body = f.get("body", "") or ""
        flags[(f["schema"], f["name"])] = bool(_DYNAMIC.search(body))
        for kind, rx in (("reads", _READ), ("writes", _WRITE)):
            for m in rx.finditer(body):
                tid, conf = _resolve(m.group(1), tables)
                if not tid:
                    continue
                key = (fid, tid, kind)
                if key in best and rank[best[key][0]] >= rank[conf]:
                    continue
                ev = body[max(0, m.start()):m.end()].strip()
                best[key] = (conf, {"source": fid, "target": tid, "kind": kind,
                                    "props": {"inference": {"method": "regex", "confidence": conf, "evidence": ev}}})
    for _conf, edge in best.values():
        edges.append(edge)
    return edges, flags
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_infer.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/dbgraph/infer.py tools/db-graph/test_infer.py
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): regex RPC->table edge inference with confidence + dynamic-SQL flag" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `classify.py` + `docs.py` — domains + `--` doc attachment

**Files:**
- Create: `tools/db-graph/dbgraph/classify.py`
- Create: `tools/db-graph/dbgraph/docs.py`
- Test: `tools/db-graph/test_classify_docs.py`

- [ ] **Step 1: Write the failing test** `tools/db-graph/test_classify_docs.py`:

```python
import os
from dbgraph.classify import classify
from dbgraph.docs import attach_sql_docs

def test_classify_object_core_and_facets():
    assert classify({"schema": "public", "label": "object", "kind": "table"}) == "object-core"
    assert classify({"schema": "public", "label": "object_fma", "kind": "table"}) == "object-facets"
    assert classify({"schema": "public", "label": "ref_amenity", "kind": "table"}) == "ref-lookups"
    assert classify({"schema": "api", "label": "rpc_create_object", "kind": "function"}) == "api"
    assert classify({"schema": "audit", "label": "audit_log", "kind": "table"}) == "audit"

def test_attach_sql_docs_grabs_preceding_comment_block(tmp_path):
    sql = tmp_path / "x.sql"
    sql.write_text(
        "-- assert_facet_applicable() validates the type->facet rule.\n"
        "-- Fail-closed: an enrolled table must have a registry row.\n"
        "CREATE OR REPLACE FUNCTION api.assert_facet_applicable()\nRETURNS trigger AS $$ BEGIN END $$;\n",
        encoding="utf-8")
    nodes = [{"id": "api.assert_facet_applicable()", "kind": "function",
              "schema": "api", "label": "assert_facet_applicable", "doc": None}]
    attach_sql_docs(nodes, [str(sql)])
    assert "validates the type->facet rule" in nodes[0]["doc"]

def test_attach_sql_docs_does_not_override_existing_doc(tmp_path):
    sql = tmp_path / "y.sql"
    sql.write_text("-- file comment\nCREATE FUNCTION api.f() RETURNS void AS $$$$;\n", encoding="utf-8")
    nodes = [{"id": "api.f()", "kind": "function", "schema": "api", "label": "f", "doc": "catalog comment wins"}]
    attach_sql_docs(nodes, [str(sql)])
    assert nodes[0]["doc"] == "catalog comment wins"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_classify_docs.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dbgraph.classify'`.

- [ ] **Step 3: Write `tools/db-graph/dbgraph/classify.py`**

```python
"""Tag a node with a domain, by schema + label prefix. One rule list; first match wins."""

_FACET = ("object_iti", "object_fma", "object_act", "object_room_type", "object_meeting_room", "object_menu")


def classify(node):
    s, label, kind = node.get("schema"), (node.get("label") or ""), node.get("kind")
    if kind in ("trigger", "policy"):
        return kind
    if s == "audit":
        return "audit"
    if s == "crm":
        return "ref-lookups" if label.startswith("ref_") else "object-core"
    if s in ("api", "internal") and kind == "function":
        return "api"
    if label == "object":
        return "object-core"
    if any(label.startswith(p) for p in _FACET):
        return "object-facets"
    if label.startswith("opening_"):
        return "opening"
    if label.startswith(("object_price", "object_discount", "object_capacity")):
        return "pricing"
    if label.startswith(("media", "object_media")):
        return "media"
    if label.startswith(("object_sustainability", "ref_sustainability")):
        return "sustainability"
    if label.startswith(("actor", "object_org_link", "object_membership", "org_")):
        return "actor-org"
    if label.startswith(("user_", "app_user", "user_permission")):
        return "rbac"
    if label.startswith(("ui_", "branding")):
        return "branding"
    if label.startswith("ref_"):
        return "ref-lookups"
    if label.startswith("object_"):
        return "object-core"
    return "other"
```

- [ ] **Step 4: Write `tools/db-graph/dbgraph/docs.py`**

```python
"""Attach the preceding `--` comment block from the .sql files to function/policy nodes whose
catalog comment is empty (tbls/catalog only sees COMMENT ON, not the `--` headers)."""
import re


def _index_definitions(sql_text):
    """Return {('function', schema, name): doc} from preceding `--` blocks for CREATE FUNCTION."""
    out = {}
    lines = sql_text.splitlines()
    fn_re = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+([a-z_][\w]*)\.([a-z_][\w]*)", re.I)
    for i, line in enumerate(lines):
        m = fn_re.search(line)
        if not m:
            continue
        block = []
        j = i - 1
        while j >= 0 and lines[j].lstrip().startswith("--"):
            block.append(lines[j].lstrip()[2:].strip())
            j -= 1
        if block:
            out[("function", m.group(1).lower(), m.group(2).lower())] = "\n".join(reversed(block))
    return out


def attach_sql_docs(nodes, sql_paths):
    idx = {}
    for path in sql_paths:
        try:
            with open(path, encoding="utf-8") as f:
                idx.update(_index_definitions(f.read()))
        except (OSError, UnicodeDecodeError):
            continue
    for n in nodes:
        if n.get("doc"):
            continue
        if n["kind"] == "function":
            key = ("function", n["schema"].lower(), n["label"].lower())
            if key in idx:
                n["doc"] = idx[key]
    return nodes
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_classify_docs.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/dbgraph/classify.py tools/db-graph/dbgraph/docs.py tools/db-graph/test_classify_docs.py
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): domain classifier + .sql comment-block doc attachment" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `build.py` — assemble the unified graph

**Files:**
- Create: `tools/db-graph/dbgraph/build.py`
- Test: `tools/db-graph/test_build.py`

`build_graph` merges tbls nodes/edges + extra nodes/edges + inferred edges, sets `dynamic_sql` flags + `rls_enabled`, classifies every node, adds the object-model relationship edges (`object_rel`/`org_link`/`actor_role` tags + `applies_to` from applicability rows), and returns the Graph dict. It does NOT carry function bodies.

- [ ] **Step 1: Write the failing test** `tools/db-graph/test_build.py`:

```python
import json, os
from dbgraph.build import build_graph

HERE = os.path.dirname(__file__)

def _fix(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as f:
        return json.load(f)

def test_build_merges_and_classifies():
    g = build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])
    obj = next(n for n in g["nodes"] if n["id"] == "public.object")
    assert obj["domain"] == "object-core"
    assert g["meta"]["table_count"] >= 1 and "function_count" in g["meta"]
    # no bodies leaked
    for n in g["nodes"]:
        if n["kind"] == "function":
            assert "body" not in n["props"]

def test_build_adds_applies_to_edges_from_applicability():
    g = build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])
    assert any(e["kind"] == "applies_to" for e in g["edges"]) or _fix("catalog_extra.sample.json").get("applicability") == []

def test_build_tags_object_relation_carrier_if_present():
    tbls = _fix("schema_tbls.sample.json")
    tbls["tables"].append({"name": "public.object_relation", "type": "TABLE", "comment": "",
                           "columns": [{"name": "source_object_id", "type": "text", "nullable": False, "comment": ""}],
                           "constraints": [], "triggers": []})
    g = build_graph(tbls, _fix("catalog_extra.sample.json"), sql_paths=[])
    rel = next(n for n in g["nodes"] if n["id"] == "public.object_relation")
    assert rel["props"].get("relationship_carrier") == "object_rel"

def test_build_has_no_dangling_edges_and_resolves_executes():
    g = build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])
    ids = {n["id"] for n in g["nodes"]}
    for e in g["edges"]:
        assert e["source"] in ids and e["target"] in ids, "dangling edge: %s" % e
    ex = [e for e in g["edges"] if e["kind"] == "executes"]
    if ex:  # the trigger's executes edge resolved to the function node id (which carries args)
        assert "assert_object_type_change_consistent" in ex[0]["target"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_build.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dbgraph.build'`.

- [ ] **Step 3: Write `tools/db-graph/dbgraph/build.py`**

```python
"""Assemble the unified graph from tbls JSON + the gap-extract, plus inferred edges, docs,
classification, and the first-class object-model relationship layer."""
from .load import load_tbls_schema, load_extra
from .infer import infer_rpc_table_edges
from .docs import attach_sql_docs
from .classify import classify

_CARRIER = {"object_relation": "object_rel", "object_org_link": "org_link", "actor_object_role": "actor_role"}


def build_graph(tbls, extra, sql_paths):
    nodes, edges = load_tbls_schema(tbls)
    en, ee = load_extra(extra)
    nodes += en
    edges += ee
    table_ids = {n["id"] for n in nodes if n["kind"] in ("table", "view", "matview")}

    # RPC->table edges + dynamic-sql flags
    inferred, flags = infer_rpc_table_edges(extra.get("functions", []), table_ids)
    edges += inferred
    for n in nodes:
        if n["kind"] == "function":
            n["props"]["dynamic_sql"] = flags.get((n["schema"], n["label"]), False)

    # rls_enabled: a table is RLS-relevant if any policy gates it
    gated = {e["target"] for e in edges if e["kind"] == "gates"}
    for n in nodes:
        if n["kind"] in ("table", "view", "matview"):
            n["props"]["rls_enabled"] = n["id"] in gated

    # docs from .sql, then classify
    attach_sql_docs(nodes, sql_paths)
    for n in nodes:
        n["domain"] = classify(n)

    # object-model relationship carriers
    for n in nodes:
        if n["kind"] == "table" and n["label"] in _CARRIER:
            n["props"]["relationship_carrier"] = _CARRIER[n["label"]]

    # applies_to edges from the applicability rule (object_type value -> facet table)
    enum_id = next((n["id"] for n in nodes if n["kind"] == "enum" and n["label"] == "object_type"), None)
    present = {n["id"] for n in nodes}
    for row in extra.get("applicability", []):
        facet_id = "public." + row["facet_table"]
        if enum_id and facet_id in present:
            edges.append({"source": enum_id, "target": facet_id, "kind": "applies_to",
                          "props": {"object_type": row["object_type"]}})

    # resolve `executes` targets (trigger def gives schema.name; function ids carry args), then prune
    # any edge referencing a missing node id (prevents the d3 force graph from crashing on dangling edges).
    fn_by_name = {}
    for n in nodes:
        if n["kind"] == "function":
            fn_by_name.setdefault("%s.%s" % (n["schema"], n["label"]), n["id"])
    for e in edges:
        if e["kind"] == "executes" and e["target"] not in present:
            e["target"] = fn_by_name.get(e["target"], e["target"])
    edges = [e for e in edges if e["source"] in present and e["target"] in present]

    meta = {
        "table_count": sum(1 for n in nodes if n["kind"] == "table"),
        "view_count": sum(1 for n in nodes if n["kind"] in ("view", "matview")),
        "function_count": sum(1 for n in nodes if n["kind"] == "function"),
        "policy_count": sum(1 for n in nodes if n["kind"] == "policy"),
        "trigger_count": sum(1 for n in nodes if n["kind"] == "trigger"),
        "enum_count": sum(1 for n in nodes if n["kind"] == "enum"),
        "edge_count": len(edges),
    }
    return {"meta": meta, "nodes": nodes, "edges": edges}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_build.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/dbgraph/build.py tools/db-graph/test_build.py
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): assemble unified graph (merge + infer + classify + object-model layer)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `render.py` — agent markdown + the interactive HTML

**Files:**
- Create: `tools/db-graph/dbgraph/render.py`
- Test: `tools/db-graph/test_render.py`

- [ ] **Step 1: Write the failing test** `tools/db-graph/test_render.py`:

```python
import json, os
from dbgraph.build import build_graph
from dbgraph.render import write_functions_md, write_policies_md, write_types_md, render_html, write_index_md

HERE = os.path.dirname(__file__)

def _g():
    def _fix(n):
        with open(os.path.join(HERE, "fixtures", n), encoding="utf-8") as f:
            return json.load(f)
    return build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])

def test_functions_md_lists_signature_and_no_body():
    md = write_functions_md(_g())
    assert "## " in md  # at least one function heading
    assert "$$" not in md  # no raw bodies

def test_policies_md_groups_by_table():
    md = write_policies_md(_g())
    assert "object" in md.lower()

def test_types_md_lists_object_type_values():
    md = write_types_md(_g())
    assert "object_type" in md

def test_index_md_has_counts():
    md = write_index_md(_g())
    assert "table" in md.lower() and "function" in md.lower()

def test_render_html_embeds_graph_json_and_d3():
    html = render_html(_g())
    assert "<svg" in html and "d3" in html
    assert '"nodes"' in html  # embedded graph data
```

- [ ] **Step 2: Run to verify failure**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_render.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dbgraph.render'`.

- [ ] **Step 3: Write `tools/db-graph/dbgraph/render.py`**

```python
"""Render the unified graph into agent markdown (FUNCTIONS/POLICIES/TYPES/INDEX) and an
interactive d3 force-graph HTML. Committed artifacts carry no function bodies."""
import json


def _by(nodes, kind):
    return [n for n in nodes if n["kind"] == kind]


def write_functions_md(g):
    fns = sorted(_by(g["nodes"], "function"), key=lambda n: (n["schema"], n["label"]))
    rw = {}
    for e in g["edges"]:
        if e["kind"] in ("reads", "writes"):
            rw.setdefault(e["source"], []).append((e["kind"], e["target"], e["props"]["inference"]["confidence"]))
    out = ["# Functions / RPCs\n", "_Reads/writes are regex-inferred and flagged by confidence._\n"]
    for n in fns:
        out.append("## `%s.%s`" % (n["schema"], n["props"]["signature"]))
        meta = []
        if n["props"]["security_definer"]:
            meta.append("SECURITY DEFINER")
        if n["props"]["dynamic_sql"]:
            meta.append("dynamic SQL")
        out.append("- returns: `%s`%s" % (n["props"]["returns"], (" — " + ", ".join(meta)) if meta else ""))
        touched = rw.get(n["id"], [])
        for kind, target, conf in sorted(touched):
            out.append("- %s `%s` _(%s)_" % (kind, target, conf))
        if n["doc"]:
            out.append("\n> " + n["doc"].replace("\n", "\n> "))
        out.append("")
    return "\n".join(out)


def write_policies_md(g):
    pol = _by(g["nodes"], "policy")
    by_table = {}
    for p in pol:
        by_table.setdefault(p["props"]["table"], []).append(p)
    out = ["# RLS policies (by table)\n"]
    for tbl in sorted(by_table):
        out.append("## `%s`" % tbl)
        for p in sorted(by_table[tbl], key=lambda x: (x["props"]["cmd"], x["label"])):
            out.append("- **%s** `%s` — roles %s\n  - `%s`" % (
                p["props"]["cmd"], p["label"], p["props"]["roles"], p["props"]["predicate"]))
        out.append("")
    return "\n".join(out)


def write_types_md(g):
    enums = _by(g["nodes"], "enum")
    applies = {}
    for e in g["edges"]:
        if e["kind"] == "applies_to":
            applies.setdefault(e["props"]["object_type"], []).append(e["target"])
    out = ["# Enums & the object-model rule\n"]
    for en in sorted(enums, key=lambda n: n["label"]):
        out.append("## `%s.%s`" % (en["schema"], en["label"]))
        out.append("- values: " + ", ".join("`%s`" % v for v in en["props"]["values"]))
        out.append("")
    if applies:
        out.append("## Type → facet applicability (`ref_facet_applicability`)\n")
        for ot in sorted(applies):
            out.append("- `%s` → %s" % (ot, ", ".join("`%s`" % t for t in sorted(applies[ot]))))
    return "\n".join(out)


def write_index_md(g):
    m = g["meta"]
    out = ["# Database knowledge graph — index\n",
           "Generated by `tools/db-graph/db_graph.py` (tbls + glue). See the design spec.\n",
           "## Counts",
           "- tables: %d · views: %d · functions: %d · policies: %d · triggers: %d · enums: %d · edges: %d" % (
               m["table_count"], m["view_count"], m["function_count"], m["policy_count"],
               m["trigger_count"], m["enum_count"], m["edge_count"]),
           "\n## Artifacts",
           "- `dbdoc/` — per-table docs + ER (tbls)",
           "- `db-graph-out/FUNCTIONS.md` · `POLICIES.md` · `TYPES.md` — the glue (functions/policies/enums)",
           "- `db-graph-out/graph.json` — the unified model · `graph.html` — interactive force graph",
           "\n## Tables by domain"]
    by_dom = {}
    for n in g["nodes"]:
        if n["kind"] == "table":
            by_dom.setdefault(n["domain"], []).append(n["label"])
    for dom in sorted(by_dom):
        out.append("- **%s**: %s" % (dom, ", ".join("`%s`" % t for t in sorted(by_dom[dom]))))
    return "\n".join(out)


_HTML = """<!doctype html><meta charset="utf-8"><title>DB graph</title>
<style>body{font:13px sans-serif;margin:0}#side{position:fixed;right:0;top:0;width:300px;height:100%;
overflow:auto;border-left:1px solid #ddd;padding:8px;background:#fff}#f{padding:6px}
.n{cursor:pointer}text{pointer-events:none;font-size:9px}</style>
<div id="f"><input id="q" placeholder="search…" oninput="hl()"> <span id="meta"></span></div>
<svg id="svg" width="100%" height="640"></svg><div id="side"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script>
const G = __GRAPH__;
const COLOR = {table:"#1D9E75",view:"#5DCAA5",matview:"#5DCAA5",enum:"#7F77DD",function:"#D85A30",policy:"#378ADD",trigger:"#BA7517"};
document.getElementById("meta").textContent = G.meta.table_count+" tables · "+G.meta.function_count+" fns · "+G.meta.policy_count+" policies";
const svg=d3.select("#svg"), W=svg.node().clientWidth, H=640;
const link=svg.append("g").attr("stroke","#bbb").attr("stroke-opacity",.4).selectAll("line").data(G.edges).join("line");
const node=svg.append("g").selectAll("circle").data(G.nodes).join("circle").attr("class","n")
  .attr("r",d=>d.kind==="table"?6:4).attr("fill",d=>COLOR[d.kind]||"#888").on("click",(e,d)=>detail(d));
const label=svg.append("g").selectAll("text").data(G.nodes).join("text").text(d=>d.label).attr("dx",6).attr("dy",3);
const sim=d3.forceSimulation(G.nodes).force("link",d3.forceLink(G.edges).id(d=>d.id).distance(40))
  .force("charge",d3.forceManyBody().strength(-60)).force("center",d3.forceCenter(W/2,H/2));
sim.on("tick",()=>{link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
  node.attr("cx",d=>d.x).attr("cy",d=>d.y);label.attr("x",d=>d.x).attr("y",d=>d.y);});
node.call(d3.drag().on("start",(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y;})
  .on("drag",(e,d)=>{d.fx=e.x;d.fy=e.y;}).on("end",(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));
function hl(){const q=document.getElementById("q").value.toLowerCase();
  node.attr("opacity",d=>!q||d.id.toLowerCase().includes(q)?1:.1);
  label.attr("opacity",d=>!q||d.id.toLowerCase().includes(q)?1:.1);}
function detail(d){const s=document.getElementById("side");let h="<h3>"+d.label+"</h3><p>"+d.kind+" · "+d.schema+" · "+d.domain+"</p>";
  if(d.doc)h+="<pre style='white-space:pre-wrap'>"+d.doc+"</pre>";
  if(d.props.columns)h+="<ul>"+d.props.columns.map(c=>"<li>"+c.name+" : "+c.type+(c.pk?" 🔑":"")+"</li>").join("")+"</ul>";
  if(d.props.signature)h+="<p><code>"+d.props.signature+" → "+d.props.returns+"</code></p>";
  if(d.props.values)h+="<p>"+d.props.values.join(", ")+"</p>";
  if(d.props.predicate)h+="<pre style='white-space:pre-wrap'>"+d.props.predicate+"</pre>";
  s.innerHTML=h;}
</script>"""


def render_html(g):
    return _HTML.replace("__GRAPH__", json.dumps(g))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest test_render.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/dbgraph/render.py tools/db-graph/test_render.py
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): render agent markdown (functions/policies/types/index) + d3 force-graph HTML" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: CLI + AGENTS.md pointer + end-to-end run

**Files:**
- Create: `tools/db-graph/db_graph.py`
- Modify: `AGENTS.md` (repo root — add a DB-graph pointer next to the graphify section)

- [ ] **Step 1: Write `tools/db-graph/db_graph.py`**

```python
"""CLI: read db-graph-out/{schema_tbls.json, catalog_extra.json} + the .sql files, build the unified
graph, and emit graph.json + graph.html + FUNCTIONS/POLICIES/TYPES/DB_AGENT_INDEX markdown.
Strips function bodies from everything it writes."""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dbgraph.build import build_graph  # noqa: E402
from dbgraph.render import (render_html, write_functions_md, write_index_md,  # noqa: E402
                            write_policies_md, write_types_md)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "db-graph-out")


def _read(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return json.load(f)


def main():
    if not (os.path.exists(os.path.join(OUT, "schema_tbls.json")) and
            os.path.exists(os.path.join(OUT, "catalog_extra.json"))):
        sys.exit("Missing db-graph-out/schema_tbls.json or catalog_extra.json — run tbls + the gap extract first (see tools/db-graph/README.md).")
    tbls = _read("schema_tbls.json")
    extra = _read("catalog_extra.json")
    sql_paths = glob.glob(os.path.join(ROOT, "Base de donnée DLL et API", "*.sql"))
    g = build_graph(tbls, extra, sql_paths)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "graph.json"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "graph.html"), "w", encoding="utf-8") as f:
        f.write(render_html(g))
    for name, fn in (("FUNCTIONS.md", write_functions_md), ("POLICIES.md", write_policies_md),
                     ("TYPES.md", write_types_md), ("DB_AGENT_INDEX.md", write_index_md)):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(fn(g))
    print("db-graph: wrote %d nodes / %d edges to %s" % (len(g["nodes"]), len(g["edges"]), OUT))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add the AGENTS.md pointer.** Open `AGENTS.md`, find the `## graphify` section, and add immediately after it:

```markdown
## db knowledge graph

A schema knowledge graph (tables, FKs, RPCs, RLS policies, enums) lives in `db-graph-out/` + `dbdoc/`, built by `tools/db-graph/`.

- For **database** questions (what writes a table? which policies gate it? what does an RPC touch?), read `db-graph-out/DB_AGENT_INDEX.md` first, then `FUNCTIONS.md` / `POLICIES.md` / `TYPES.md` and the per-table pages under `dbdoc/`. These are derived from the live catalog + the `.sql` docs.
- Regenerate after schema changes per `tools/db-graph/README.md` (needs `TBLS_DSN`). The visual is `db-graph-out/graph.html`.
```

- [ ] **Step 3: End-to-end run against live.** Ensure the real inputs exist in `db-graph-out/`:
  - Run tbls (needs `TBLS_DSN`): `tbls doc --rm-dist -c tools/db-graph/.tbls.yml` then `tbls out -t json -o db-graph-out/schema_tbls.json -c tools/db-graph/.tbls.yml`. **If tbls or the DSN are unavailable in this session, this step is blocked** — note it and have the user run those two commands; the build can't produce real `dbdoc/`/`graph.json` until then.
  - Gap extract: run `db_supplement_extract.sql` via the Supabase MCP (the agent has it) and save the returned JSON to `db-graph-out/catalog_extra.json` (or `psql "%TBLS_DSN%" -tAf tools/db-graph/db_supplement_extract.sql > db-graph-out/catalog_extra.json`).
  - Then: `.tools/python/Scripts/python.exe tools/db-graph/db_graph.py`
  - Expected: prints `db-graph: wrote N nodes / M edges`. Open `db-graph-out/graph.html` in a browser; spot-check `DB_AGENT_INDEX.md` counts vs the live catalog; confirm `object_fma` in `POLICIES.md` shows its per-command policies and `FUNCTIONS.md` shows the RPCs that write it.

- [ ] **Step 4: Full test suite green**

Run: `cd tools/db-graph && ..\..\.tools\python\Scripts\python.exe -m pytest -v`
Expected: all tests pass (load/infer/classify_docs/build/render).

- [ ] **Step 5: Commit the tool + the committed artifacts**

> If tbls could not run this session (no DSN), the `dbdoc/` + `db-graph-out/*` artifacts won't exist yet — in that case commit only `tools/db-graph/db_graph.py` + `AGENTS.md` now, and run Step 3 + this artifact commit once `TBLS_DSN` is available (the `git add` of a missing path errors otherwise).

```bash
git -C "C:\Users\dphil\Bertel3.0" add tools/db-graph/db_graph.py AGENTS.md dbdoc db-graph-out/graph.json db-graph-out/FUNCTIONS.md db-graph-out/POLICIES.md db-graph-out/TYPES.md db-graph-out/DB_AGENT_INDEX.md
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db-graph): CLI + AGENTS pointer + generated artifacts (committed; graph.html/json-inputs gitignored)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git -C "C:\Users\dphil\Bertel3.0" push
```

---

## Self-review notes (already applied)

- **Spec coverage:** tbls config + viewpoints (T1) · gap extract functions/policies/enums + applicability (T2) · tbls-JSON + extra load (T3) · regex RPC edges + confidence + dynamic flag (T4) · classify + `--` docs (T5) · unified graph, no bodies, object-model layer (T6) · agent markdown + interactive HTML (T7) · CLI + AGENTS pointer + commit policy + end-to-end (T8). Supabase Studio is a workflow note in the README (no code).
- **tbls JSON field names** are pinned from `schema/schema.go` (tables/relations/triggers); triggers come from tbls (not the gap extract), the executed function is regexed from the trigger `def`.
- **No function bodies** in any committed artifact (graph.json + *.md); bodies live only in the gitignored `catalog_extra.json`, used solely for edge inference.
- **DSN is runtime-only:** `.tbls.yml` uses `${TBLS_DSN}`; T8 Step 3 flags that tbls (the bulk) needs the user's DSN — if absent in the build session, the glue still runs on a fixture-shaped `schema_tbls.json` the user produces.
- **Type consistency:** node/edge dict shapes match across `load`/`infer`/`build`/`render`; `_fn_id` (load) and the function-id format in `infer`/`build` are identical (`schema.name(args)`).
