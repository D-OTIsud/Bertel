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

def test_load_tbls_accepts_string_relation_shape():
    nodes, edges = load_tbls_schema({
        "tables": [],
        "relations": [{
            "table": "public.object_fma",
            "columns": ["object_id"],
            "parent_table": "public.object",
            "parent_columns": ["id"],
        }],
    })
    assert nodes == []
    assert edges == [{
        "source": "public.object_fma",
        "target": "public.object",
        "kind": "fk",
        "props": {"columns": [["object_id", "id"]]},
    }]

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
    fn = next(n for n in nodes if n["kind"] == "function")
    assert "body" not in fn["props"] and "prosrc" not in fn["props"]
