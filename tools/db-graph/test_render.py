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
