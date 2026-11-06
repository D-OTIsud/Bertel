"""Private document row values must never reach public generated documentation."""
import json
from pathlib import Path

import pg8000.dbapi
import pytest

import export_reference_live_rest as rest
from dbgraph.reference_extract import (
    extract_live_reference_values, extract_reference_values, load_mcp_reference_values,
    merge_reference_extracts,
    public_reference_rows,
)
from dbgraph.render import render_api_db_reference_html

PRIVATE_URL = "https://example.invalid/PRIVATE_DOCUMENT_SENTINEL.pdf"


def rows():
    return [
        {"table": "public.ref_document", "values": {"id": "public", "access_scope": "public", "name": "PUBLIC_DOCUMENT_SENTINEL"}, "source": "fixture"},
        {"table": "public.ref_document", "values": {"id": "PRIVATE_DOCUMENT_IDENTIFIER", "name": "PRIVATE_DOCUMENT_NAME", "access_scope": "legal_private", "url": PRIVATE_URL}, "source": "fixture"},
        {"table": "ref_document", "values": {"id": "legacy", "access_scope": None, "url": PRIVATE_URL}, "source": "fixture"},
        {"table": "public.ref_document", "values": {"id": "missing", "url": PRIVATE_URL}, "source": "fixture"},
    ]


def graph():
    return {"nodes": [{"id": "public.ref_document", "kind": "table", "schema": "public",
        "label": "ref_document", "domain": "ref-lookups", "doc": "Schema includes private document locations.",
        "props": {"columns": [{"name": key, "type": "text", "nullable": True, "pk": key == "id"}
            for key in ("id", "access_scope", "url", "name")]}}], "edges": [],
        "meta": {"table_count": 1, "view_count": 0, "enum_count": 0, "function_count": 0,
                 "policy_count": 0, "trigger_count": 0, "edge_count": 0}}


def test_seed_document_rows_require_explicit_public_scope(tmp_path):
    source = tmp_path / "seeds.sql"
    source.write_text("INSERT INTO ref_document(id,access_scope,name) VALUES "
        "('a','public','PUBLIC_DOCUMENT_SENTINEL'),('b','legal_private','PRIVATE_DOCUMENT_SENTINEL'),"
        "('c',NULL,'PRIVATE_DOCUMENT_SENTINEL');", encoding="utf-8")
    result = extract_reference_values([str(source)])
    assert [row["values"]["id"] for row in result["rows"]] == ["a"]


def test_mcp_cache_and_merge_filter_private_and_unknown_scopes(tmp_path):
    cache = tmp_path / "cache.json"
    cache.write_text(json.dumps({"reference_extract": {"rows": rows()}}), encoding="utf-8")
    loaded = load_mcp_reference_values(str(cache))
    assert [row["values"]["id"] for row in loaded["rows"]] == ["public"]
    merged = merge_reference_extracts({"rows": rows()}, {"rows": rows(), "live": {"tables": []}})
    assert all(row["values"]["access_scope"] == "public" for row in merged["rows"])
    assert PRIVATE_URL not in json.dumps(loaded) + json.dumps(merged)


def test_renderer_filters_raw_payload_but_preserves_table_schema():
    schema = graph()
    before = json.dumps(schema, sort_keys=True)
    output = render_api_db_reference_html(schema, {"rows": rows(), "derived_sources": []})
    assert PRIVATE_URL not in output
    assert "PRIVATE_DOCUMENT_IDENTIFIER" not in output
    assert "PRIVATE_DOCUMENT_NAME" not in output
    assert "PUBLIC_DOCUMENT_SENTINEL" in output
    assert "access_scope" in output and "ref_document" in output
    assert json.dumps(schema, sort_keys=True) == before
    # This name really is rendered for an allowed row. A URL alone was a
    # vacuous negative because this renderer does not display values.url.
    allowed = rows()[1]
    allowed["values"]["access_scope"] = "public"
    control = render_api_db_reference_html(schema, {"rows": [allowed]})
    assert "PRIVATE_DOCUMENT_NAME" in control


TABLE_ALIASES = ["public.ref_document", "ref_document", "PUBLIC.ref_document",
    "PUBLIC.REF_DOCUMENT", '"public"."ref_document"', 'public."ref_document"',
    '"public".ref_document', " PUBLIC . ref_document "]


@pytest.mark.parametrize("table", TABLE_ALIASES)
def test_cache_merge_and_renderer_canonicalize_before_filter_and_output(tmp_path, table):
    fixture = rows()
    for row in fixture:
        row["table"] = table
    before = json.dumps(fixture, sort_keys=True)
    cache = tmp_path / "alias-cache.json"
    cache.write_text(json.dumps({"rows": fixture}), encoding="utf-8")
    loaded = load_mcp_reference_values(str(cache))
    merged = merge_reference_extracts({"rows": fixture}, {"rows": fixture})
    for result in (loaded, merged):
        assert all(row["table"] == "public.ref_document" for row in result["rows"])
        assert all(row["values"]["id"] == "public" for row in result["rows"])
        assert "PRIVATE_DOCUMENT_NAME" not in json.dumps(result)
    output = render_api_db_reference_html(graph(), {"rows": fixture})
    assert "PUBLIC_DOCUMENT_SENTINEL" in output
    assert "PRIVATE_DOCUMENT_IDENTIFIER" not in output
    assert "PRIVATE_DOCUMENT_NAME" not in output
    assert json.dumps(fixture, sort_keys=True) == before


@pytest.mark.parametrize("table", ["PUBLIC.ref_document", "public.REF_DOCUMENT", "PUBLIC.REF_DOCUMENT"])
def test_legal_unquoted_sql_aliases_keep_only_explicitly_public_rows(tmp_path, table):
    source = tmp_path / "alias-seeds.sql"
    source.write_text(f"INSERT INTO {table}(id,access_scope,name) VALUES "
        "('a','public','PUBLIC_DOCUMENT_SENTINEL'),"
        "('b','legal_private','PRIVATE_DOCUMENT_NAME'),('c',NULL,'PRIVATE_DOCUMENT_NAME');", encoding="utf-8")
    result = extract_reference_values([str(source)])
    assert len(result["rows"]) == 1
    assert result["rows"][0]["table"] == "public.ref_document"
    assert result["rows"][0]["values"]["id"] == "a"


@pytest.mark.parametrize("table", ['"PUBLIC".ref_document', 'public."REF_DOCUMENT"',
    '"public.ref_document"', "public.ref_document.extra", "public.ref_document; SELECT 1", ""])
def test_ambiguous_identifiers_refuse_before_publication(table):
    with pytest.raises(ValueError, match="reference table identifier"):
        public_reference_rows([{**rows()[0], "table": table}])


def test_live_table_alias_excludes_stale_seed_values():
    seed = {"rows": [rows()[0]]}
    live = {"rows": [{**rows()[0], "table": "PUBLIC.ref_document",
        "values": {"id": "live", "name": "LIVE", "access_scope": "public"}}],
        "live": {"tables": ['"public"."ref_document"'], "status": "queried"}}
    result = merge_reference_extracts(seed, live)
    assert result["live"]["tables"] == ["public.ref_document"]
    assert [row["values"]["id"] for row in result["rows"]] == ["live"]


@pytest.mark.parametrize("table", TABLE_ALIASES)
def test_rest_alias_filters_before_request_and_output(monkeypatch, table):
    requests = []
    def request(url, key, path, params=None, page=0):
        requests.append((path, params))
        return [row["values"] for row in rows()]
    monkeypatch.setattr(rest, "_request_json", request)
    result = rest._fetch_table("https://example.invalid", "fixture", table, ["id"])
    assert requests[0][0] == "ref_document"
    assert requests[0][1]["access_scope"] == "eq.public"
    assert [row["id"] for row in result] == ["public"]
    assert rest._audit_counts({"reference_table_counts": [{"table": table,
        "rows": 10, "public_rows": 1}]}) == {"public.ref_document": 1}


@pytest.mark.parametrize("table", ["internal.ref_document", '"PUBLIC".ref_document', None])
def test_rest_unsupported_table_refuses_before_any_request(monkeypatch, table):
    def forbidden(*args, **kwargs):
        pytest.fail("unsupported reference identity must fail before HTTP")
    monkeypatch.setattr(rest, "_request_json", forbidden)
    with pytest.raises(ValueError):
        rest._fetch_table("https://example.invalid", "fixture", table, ["id"])


def test_direct_reader_filters_on_server_and_before_return(monkeypatch):
    queries = []
    class Cursor:
        def execute(self, query):
            queries.append(query)
        def fetchall(self):
            return [(row["values"].get("id"), row["values"].get("access_scope"),
                     row["values"].get("url"), row["values"].get("name")) for row in rows()]
    class Connection:
        def cursor(self): return Cursor()
        def close(self): pass
    monkeypatch.setattr(pg8000.dbapi, "connect", lambda **kwargs: Connection())
    result = extract_live_reference_values("postgres://fixture:fixture@localhost/fixture", graph())
    assert '\"access_scope\" = \'public\'' in queries[0]
    assert [row["values"]["id"] for row in result["rows"]] == ["public"]
    assert PRIVATE_URL not in json.dumps(result)


def test_rest_reader_filters_before_transfer_and_cache(monkeypatch):
    requests = []
    def request(url, key, path, params=None, page=0):
        requests.append(params)
        return [row["values"] for row in rows()]
    monkeypatch.setattr(rest, "_request_json", request)
    result = rest._fetch_table("https://example.invalid", "fixture", "public.ref_document", ["id"])
    assert requests[0]["access_scope"] == "eq.public"
    assert [row["id"] for row in result] == ["public"]
    assert rest._audit_counts({"reference_table_counts": [{"table": "public.ref_document", "rows": 10, "public_rows": 1}]}) == {"public.ref_document": 1}


def test_mcp_sql_filters_document_values_and_keeps_full_metadata_counts():
    folder = Path(__file__).parent
    query = (folder / "db_reference_extract.sql").read_text(encoding="utf-8")
    audit = (folder / "db_reference_audit.sql").read_text(encoding="utf-8")
    assert "FROM public.ref_document t WHERE t.access_scope = 'public'" in query
    assert "'public_rows'" in audit
    assert "('public.ref_document', (SELECT count(*) FROM public.ref_document))" in audit
