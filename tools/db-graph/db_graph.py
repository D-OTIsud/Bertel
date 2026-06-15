"""CLI: read db-graph-out/{schema_tbls.json, catalog_extra.json} + the .sql files, build the unified
graph, and emit graph.json + graph.html + FUNCTIONS/POLICIES/TYPES/DB_AGENT_INDEX markdown.
Strips function bodies from everything it writes."""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dbgraph.build import build_graph  # noqa: E402
from dbgraph.reference_extract import (extract_live_reference_values, extract_reference_values,  # noqa: E402
                                       load_mcp_reference_values, merge_reference_extracts)
from dbgraph.render import (render_api_db_reference_html, render_html, write_functions_md,  # noqa: E402
                            write_index_md, write_policies_md, write_types_md)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "db-graph-out")
DOCS = os.path.join(ROOT, "docs")


def _read(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return json.load(f)


def _make_sources_relative(refs):
    prefix = ROOT.replace("\\", "/").rstrip("/") + "/"
    for bucket in ("rows", "derived_sources"):
        for item in refs.get(bucket, []):
            source = item.get("source", "")
            if source.startswith(prefix):
                item["source"] = source[len(prefix):]
    return refs


def _reference_sql_paths(sql_paths):
    skipped_prefixes = ("test_", "ci_")
    skipped_names = {"lot1_pilot_inserts.sql"}
    out = []
    for path in sql_paths:
        name = os.path.basename(path).lower()
        if name.endswith(".tmp.sql") or name in skipped_names or name.startswith(skipped_prefixes):
            continue
        out.append(path)
    return sorted(out)


def _load_live_reference_extract(g, extra):
    mcp_path = os.environ.get("DB_GRAPH_MCP_REFERENCE_JSON") or os.path.join(OUT, "reference_live.json")
    if os.path.exists(mcp_path):
        return load_mcp_reference_values(mcp_path), "Supabase MCP JSON=%s" % os.path.relpath(mcp_path, ROOT).replace("\\", "/")
    if os.environ.get("TBLS_DSN") and os.environ.get("DB_GRAPH_ALLOW_DIRECT_LIVE") == "1":
        return extract_live_reference_values(os.environ["TBLS_DSN"], g, extra), "direct TBLS_DSN opt-in"
    return {"live": {"status": "not_queried", "tables": [], "errors": [], "truncated": []}}, "Supabase MCP JSON=missing"


def main():
    if not (os.path.exists(os.path.join(OUT, "schema_tbls.json")) and
            os.path.exists(os.path.join(OUT, "catalog_extra.json"))):
        sys.exit("Missing db-graph-out/schema_tbls.json or catalog_extra.json — run tbls + the gap extract first (see tools/db-graph/README.md).")
    tbls = _read("schema_tbls.json")
    extra = _read("catalog_extra.json")
    sql_paths = glob.glob(os.path.join(ROOT, "Base de donnée DLL et API", "*.sql"))
    reference_paths = _reference_sql_paths(sql_paths)
    g = build_graph(tbls, extra, sql_paths)
    seed_refs = _make_sources_relative(extract_reference_values(reference_paths))
    live_refs, live_note = _load_live_reference_extract(g, extra)
    refs = merge_reference_extracts(seed_refs, live_refs)
    refs = _make_sources_relative(refs)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)
    with open(os.path.join(OUT, "graph.json"), "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "graph.html"), "w", encoding="utf-8") as f:
        f.write(render_html(g))
    for name, fn in (("FUNCTIONS.md", write_functions_md), ("POLICIES.md", write_policies_md),
                     ("TYPES.md", write_types_md), ("DB_AGENT_INDEX.md", write_index_md)):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(fn(g))
    with open(os.path.join(DOCS, "api-db-reference.html"), "w", encoding="utf-8") as f:
        f.write(render_api_db_reference_html(g, refs, live_note=live_note))
    live = refs.get("live", {})
    print("db-graph: wrote %d nodes / %d edges and %d reference rows (%s, %d SQL seed rows from %d files) to %s and docs/api-db-reference.html" % (
        len(g["nodes"]), len(g["edges"]), len(refs.get("rows", [])),
        live.get("status", "unknown"), refs.get("seed", {}).get("rows", 0), len(reference_paths), OUT))


if __name__ == "__main__":
    main()
