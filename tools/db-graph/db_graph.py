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
