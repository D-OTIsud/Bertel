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
