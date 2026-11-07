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

def test_build_policies_and_triggers_inherit_table_domain():
    g = build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])
    policy = next(n for n in g["nodes"] if n["id"] == "policy:public.object_fma:canonical_ins_object_fma")
    trigger = next(n for n in g["nodes"] if n["id"] == "trigger:public.object:trg_guard_object_type_change")
    assert policy["domain"] == "object-facets"
    assert trigger["domain"] == "object-core"

def test_build_has_no_dangling_edges_and_resolves_executes():
    g = build_graph(_fix("schema_tbls.sample.json"), _fix("catalog_extra.sample.json"), sql_paths=[])
    ids = {n["id"] for n in g["nodes"]}
    for e in g["edges"]:
        assert e["source"] in ids and e["target"] in ids, "dangling edge: %s" % e
    ex = [e for e in g["edges"] if e["kind"] == "executes"]
    if ex:
        assert "assert_object_type_change_consistent" in ex[0]["target"]
