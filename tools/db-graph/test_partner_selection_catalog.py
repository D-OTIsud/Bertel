import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from merge_partner_selection_catalog import FUNCTIONS, READERS, TABLE, merge_graph, patch_function_sections


def fixture():
    nodes = [{"id": name, "kind": "table", "label": name.split(".")[1], "schema": "public",
              "domain": "object-core", "doc": None, "props": {"columns": [], "rls_enabled": True}}
             for name in ("public.object", "public.object_cuisine_type", "public.ref_code_cuisine_type")]
    old = {"id": "api.get_filtered_object_ids(p_filters jsonb)", "kind": "function",
           "label": "get_filtered_object_ids", "schema": "api", "domain": "api", "doc": "Baseline source doc",
           "props": {"signature": "get_filtered_object_ids(p_filters jsonb)", "returns": "jsonb",
                     "security_definer": True, "volatility": "s", "dynamic_sql": False,
                     "sources": [{"path": "Base de donnée DLL et API/api_views_functions.sql", "line": 1060}]}}
    nodes.append(old)
    edge = {"source": "public.object_cuisine_type", "target": "public.object", "kind": "fk", "props": {"columns": [["object_id", "id"]]}}
    graph = {"nodes": nodes, "edges": [edge], "partitions": {"unrelated.child": "unrelated.parent"},
             "meta": {}, "catalog_provenance": {"full_catalog_ledger": 212, "targeted_function_updates": [{"id": "055511", "source": "older verified capture"}]}}
    fns = []
    for schema, name in FUNCTIONS:
        reference = "public.object" if name == "get_filtered_object_ids" else TABLE
        fns.append({"schema": schema, "name": name, "args": "p_filters jsonb", "returns": "jsonb",
                    "security_definer": name != "get_active_partner_selection_definition",
                    "volatility": "s", "comment": None, "body_md5": "a" * 32,
                    "settings": ["search_path=pg_catalog,internal,pg_temp"], "owner": "postgres",
                    "execute_roles": ["service_role"], "dynamic_sql": False,
                    "effective_execute": {"anon": False, "authenticated": False, "service_role": True},
                    "references": [{"kind": "reads", "identifier": reference, "evidence": "FROM " + reference}]})
    capture = {"_capture": {"captured_at": "synthetic-test-time", "database_name": "synthetic_local_test"},
               "table_catalog": {"tables": [{"name": TABLE, "type": "BASE TABLE", "comment": "SYNTHETIC",
                     "columns": [{"name": "id", "type": "bigint", "nullable": False},
                                 {"name": "org_object_id", "type": "text", "nullable": False}],
                     "constraints": [{"name": "synthetic_pk", "type": "PRIMARY KEY", "columns": ["id"], "def": "PRIMARY KEY (id)"}], "indexes": [], "triggers": []}],
                     "relations": [{"table": TABLE, "parent_table": "public.object",
                                    "columns": ["org_object_id"], "parent_columns": ["id"]}]},
               "table_security": [{"name": TABLE, "rls_enabled": True, "rls_forced": False, "policies": [],
                   "owner": "postgres", "acl": None, "client_select": {"anon": False, "authenticated": False},
                   "client_write": {"anon": False, "authenticated": False}}],
               "functions": fns, "preserved_readers": [{"name": key, "body_md5": value} for key, value in READERS.items()]}
    return graph, capture


def test_scoped_merge_keeps_baseline_and_055511_provenance():
    baseline, capture = fixture()
    before = copy.deepcopy(baseline)
    graph, _, _ = merge_graph(baseline, capture, "SYNTHETIC UNIT TEST; not production")
    assert baseline == before
    assert graph["nodes"][:3] == before["nodes"][:3]
    assert before["edges"][0] in graph["edges"]
    assert graph["partitions"] == before["partitions"]
    assert graph["catalog_provenance"]["full_catalog_ledger"] == 212
    assert graph["catalog_provenance"]["targeted_function_updates"] == before["catalog_provenance"]["targeted_function_updates"]
    assert graph["catalog_provenance"]["targeted_catalog_updates"][0]["source"].startswith("SYNTHETIC")
    assert graph["meta"]["table_count"] == 4
    assert graph["meta"]["function_count"] == 13
    assert next(n for n in graph["nodes"] if n["id"] == TABLE)["props"]["rls_enabled"] is True
    assert next(n for n in graph["nodes"] if n["label"] == "get_filtered_object_ids")["props"]["sources"] == before["nodes"][-1]["props"]["sources"]
    assert any(e["source"] == TABLE and e["target"] == "public.object" for e in graph["edges"])


def test_identical_capture_is_idempotent_without_duplicate_nodes_edges_or_provenance():
    baseline, capture = fixture()
    first, _, _ = merge_graph(baseline, capture, "SYNTHETIC")
    second, _, _ = merge_graph(first, capture, "SYNTHETIC")
    assert second == first


@pytest.mark.parametrize("changed", ["reader", "grant", "function", "body"])
def test_changed_contract_is_rejected_before_artifact_writes(changed):
    baseline, capture = fixture()
    if changed == "reader":
        capture["preserved_readers"][0]["body_md5"] = "b" * 32
    elif changed == "grant":
        capture["table_security"][0]["client_select"]["anon"] = True
    elif changed == "function":
        capture["functions"].pop()
    else:
        capture["functions"][0]["body"] = "Must never be captured"
    with pytest.raises(ValueError):
        merge_graph(baseline, capture, "SYNTHETIC")


def test_section_patch_retains_schema_headers_and_manual_acl_addenda():
    tick = chr(96)
    def fn(name, text):
        return "### " + tick + name + tick + "\n" + text + "\n\n"
    original = "# Access\n\n## schema " + tick + "api" + tick + "\n\n"
    original += fn("api.a()", "unchanged A")
    original += fn("api.get_filtered_object_ids()", "old reader")
    original += fn("api.z()", "unchanged Z\nmanual ACL")
    original += "## schema " + tick + "internal" + tick + "\n\n" + fn("internal.keep()", "manual internal proof")
    generated = original.replace("old reader", "new reader") + fn("api.created()", "new configuration")
    updated = patch_function_sections(original, generated, {"api.get_filtered_object_ids()"},
                                      {"api.get_filtered_object_ids()", "api.created()"}, 3)
    assert "old reader" not in updated
    assert "new reader" in updated and "new configuration" in updated
    assert "unchanged Z\nmanual ACL" in updated and "manual internal proof" in updated
    assert updated.count("## schema " + tick + "internal" + tick) == 1
    assert updated.index("api.created()") < updated.index("api.get_filtered_object_ids()")


def test_synthetic_dry_merge_against_repository_baseline_preserves_manual_headers():
    import json
    from dbgraph.render import write_functions_md
    from dbgraph.typemap import write_function_access_md
    root = Path(__file__).resolve().parents[2]
    out = root / "db-graph-out"
    original_bytes = (out / "graph.json").read_bytes()
    baseline = json.loads(original_bytes)
    _, capture = fixture()
    engine = next(n for n in baseline["nodes"] if n["kind"] == "function" and n["label"] == "get_filtered_object_ids")
    next(f for f in capture["functions"] if f["name"] == "get_filtered_object_ids")["args"] = engine["props"]["signature"].split("(", 1)[1][:-1]
    graph, old, new = merge_graph(baseline, capture, "SYNTHETIC unit test; no production artifact update")
    for name, generated, level in (("FUNCTIONS.md", write_functions_md(graph), 2),
                                  ("FUNCTION_ACCESS.md", write_function_access_md(graph, {}), 3)):
        text = (out / name).read_text(encoding="utf-8")
        updated = patch_function_sections(text, generated, old, new, level)
        assert "list_partner_selection_objects_with_vocabulary" in updated
        assert updated.count("## schema") == text.count("## schema")
    assert graph["catalog_provenance"]["full_catalog_ledger"] == baseline["catalog_provenance"]["full_catalog_ledger"]
    assert (out / "graph.json").read_bytes() == original_bytes


def test_artifact_writer_is_idempotent_in_synthetic_temporary_workspace(tmp_path):
    import json
    import shutil
    from merge_partner_selection_catalog import write_artifacts
    source = Path(__file__).resolve().parents[2] / "db-graph-out"
    out = tmp_path / "db-graph-out"
    out.mkdir()
    for name in ("graph.json", "FUNCTIONS.md", "FUNCTION_ACCESS.md", "DB_AGENT_INDEX.md"):
        shutil.copyfile(source / name, out / name)
    baseline = json.loads((out / "graph.json").read_text(encoding="utf-8"))
    _, capture = fixture()
    engine = next(n for n in baseline["nodes"] if n["kind"] == "function" and n["label"] == "get_filtered_object_ids")
    next(f for f in capture["functions"] if f["name"] == "get_filtered_object_ids")["args"] = engine["props"]["signature"].split("(", 1)[1][:-1]
    write_artifacts(tmp_path, capture, "SYNTHETIC UNIT TEST; not production", "synthetic")
    first = {name: (out / name).read_bytes() for name in ("graph.json", "FUNCTIONS.md", "FUNCTION_ACCESS.md", "DB_AGENT_INDEX.md")}
    write_artifacts(tmp_path, capture, "SYNTHETIC UNIT TEST; not production", "synthetic")
    assert first == {name: (out / name).read_bytes() for name in first}
    evidence = json.loads((out / "PARTNER_SELECTION_ADMIN_CATALOG.json").read_text(encoding="utf-8"))
    assert evidence["capture_provenance"]["source"].startswith("SYNTHETIC")
    assert evidence["_capture"]["database_name"] == "synthetic_local_test"
    assert all("body" not in fn for fn in evidence["functions"])
