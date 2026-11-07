import json, os
from dbgraph.build import build_graph
from dbgraph.render import (render_api_db_reference_html, render_html, write_functions_md,
                            write_index_md, write_policies_md, write_types_md)

HERE = os.path.dirname(__file__)

def _g():
    def _fix(n):
        with open(os.path.join(HERE, "fixtures", n), encoding="utf-8") as f:
            return json.load(f)
    return build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])

def test_functions_md_lists_signature_and_no_body():
    md = write_functions_md(_g())
    assert "## " in md
    assert "$$" not in md

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
    assert '"nodes"' in html
    assert 'id="schemas"' in html
    assert 'id="publicApi"' in html
    assert "fitVisibleTables" in html
    assert "schemaOn[n.schema" in html

def test_render_api_db_reference_html_lists_rpcs_tables_and_refs():
    graph = _g()
    fn = next(n for n in graph["nodes"] if n["kind"] == "function")
    fn["props"]["source"] = {"path": "C:/repo/Base de donnée DLL et API/api_views_functions.sql", "line": 42}
    html = render_api_db_reference_html(graph, {
        "rows": [{
            "table": "public.ref_code",
            "values": {"domain": "payment_method", "code": "cash", "name": "Especes"},
            "source": "seed.sql:1",
            "source_kind": "insert_values",
        }],
        "derived_sources": [],
        "live": {"status": "not_queried", "tables": []},
        "seed": {"rows": 1, "derived_sources": 0},
    }, live_note="Supabase MCP JSON=missing")
    assert "Référence API" in html
    assert "RPC / fonctions" in html
    assert "RLS policies" in html
    assert "api_views_functions.sql:42" in html
    assert "payment_method:cash" in html
    assert "Supabase MCP JSON=missing" in html
    assert "Écarts de couverture" in html
    assert "Aucune lecture live MCP" in html

def test_render_api_db_reference_html_describes_live_rows():
    graph = _g()
    html = render_api_db_reference_html(graph, {
        "rows": [{
            "table": "public.ref_code",
            "values": {"domain": "payment_method", "code": "especes", "name": "Espèces"},
        "source": "mcp:public.ref_code",
        "source_kind": "mcp_execute_sql",
    }],
    "derived_sources": [],
        "live": {"status": "mcp_queried", "tables": ["public.ref_code"], "errors": [], "truncated": []},
        "seed": {"rows": 10, "derived_sources": 0},
    }, live_note="Supabase MCP JSON=db-graph-out/reference_live.json")

    assert "Lecture live MCP effectuée" in html
    assert "payment_method:especes" in html
    assert "mcp:public.ref_code" in html

def test_render_api_db_reference_html_handles_live_connection_error():
    html = render_api_db_reference_html(_g(), {
        "rows": [],
        "derived_sources": [],
        "live": {"status": "error", "message": "could not connect", "errors": ["timeout"], "tables": []},
        "seed": {"rows": 0, "derived_sources": 0},
    }, live_note="Supabase MCP JSON=db-graph-out/reference_live.json")

    assert "Lecture live demandée mais échouée" in html
    assert "timeout" in html
