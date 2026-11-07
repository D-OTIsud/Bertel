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
              "schema": "api", "label": "assert_facet_applicable", "doc": None, "props": {}}]
    attach_sql_docs(nodes, [str(sql)])
    assert "validates the type->facet rule" in nodes[0]["doc"]
    assert nodes[0]["props"]["source"]["line"] == 3
    assert nodes[0]["props"]["source"]["path"].endswith("x.sql")

def test_attach_sql_docs_does_not_override_existing_doc(tmp_path):
    sql = tmp_path / "y.sql"
    sql.write_text("-- file comment\nCREATE FUNCTION api.f() RETURNS void AS $$$$;\n", encoding="utf-8")
    nodes = [{"id": "api.f()", "kind": "function", "schema": "api", "label": "f", "doc": "catalog comment wins", "props": {}}]
    attach_sql_docs(nodes, [str(sql)])
    assert nodes[0]["doc"] == "catalog comment wins"
    assert nodes[0]["props"]["source"]["line"] == 2

def test_attach_sql_docs_keeps_multiple_sources_for_overloads(tmp_path):
    sql = tmp_path / "overloads.sql"
    sql.write_text(
        "CREATE FUNCTION api.f(p_id text) RETURNS text AS $$$$;\n"
        "CREATE FUNCTION api.f(p_id uuid) RETURNS text AS $$$$;\n",
        encoding="utf-8")
    nodes = [{"id": "api.f(text)", "kind": "function", "schema": "api", "label": "f", "doc": None, "props": {}}]
    attach_sql_docs(nodes, [str(sql)])
    assert [s["line"] for s in nodes[0]["props"]["sources"]] == [1, 2]
    assert "source" not in nodes[0]["props"]

def test_attach_sql_docs_prefers_exact_signature_when_available(tmp_path):
    sql = tmp_path / "overloads.sql"
    sql.write_text(
        "-- text overload\nCREATE FUNCTION api.f(p_id text) RETURNS text AS $$$$;\n"
        "-- uuid overload\nCREATE FUNCTION api.f(p_id uuid) RETURNS text AS $$$$;\n",
        encoding="utf-8")
    nodes = [{"id": "api.f(p_id text)", "kind": "function", "schema": "api", "label": "f",
              "doc": None, "props": {"signature": "f(p_id text)"}}]
    attach_sql_docs(nodes, [str(sql)])
    assert nodes[0]["doc"] == "text overload"
    assert nodes[0]["props"]["source"]["line"] == 2
    assert [s["line"] for s in nodes[0]["props"]["sources"]] == [2]

def test_attach_sql_docs_prefers_canonical_doc_over_forward_declaration(tmp_path):
    sql = tmp_path / "rls.sql"
    sql.write_text(
        "-- Forward declarations\n"
        "-- Declare minimal stubs for fresh apply.\n"
        "CREATE OR REPLACE FUNCTION api.is_platform_superuser() RETURNS boolean AS $$$$;\n"
        "-- Helper : autorite plateforme\n"
        "-- Utilise pour les operations reservees.\n"
        "CREATE OR REPLACE FUNCTION api.is_platform_superuser() RETURNS boolean AS $$$$;\n",
        encoding="utf-8")
    nodes = [{"id": "api.is_platform_superuser()", "kind": "function", "schema": "api",
              "label": "is_platform_superuser", "doc": None,
              "props": {"signature": "is_platform_superuser()"}}]
    attach_sql_docs(nodes, [str(sql)])
    assert nodes[0]["doc"] == "Helper : autorite plateforme\nUtilise pour les operations reservees."
    assert [s["line"] for s in nodes[0]["props"]["sources"]] == [3, 6]
    assert "source" not in nodes[0]["props"]
