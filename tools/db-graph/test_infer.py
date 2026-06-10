from dbgraph.infer import infer_rpc_table_edges

TABLES = {"public.object", "public.object_fma", "public.object_price"}

def _fn(name, body, schema="api", args="p_id text"):
    return {"schema": schema, "name": name, "args": args, "body": body}

def test_write_edge_high_confidence_on_insert_into_known_table():
    fns = [_fn("w", "BEGIN INSERT INTO object_fma (object_id) VALUES (p_id); END")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    w = next(e for e in edges if e["kind"] == "writes")
    assert w["target"] == "public.object_fma"
    assert w["props"]["inference"]["confidence"] == "high"

def test_read_edge_from_known_table():
    fns = [_fn("r", "SELECT * FROM object o WHERE o.id = p_id")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    assert any(e["kind"] == "reads" and e["target"] == "public.object" for e in edges)

def test_unknown_table_is_not_emitted():
    fns = [_fn("u", "SELECT * FROM not_a_table")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    assert edges == []

def test_dynamic_sql_flagged_not_guessed():
    fns = [_fn("d", "EXECUTE format('SELECT 1 FROM %I', some_table)")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    assert flags[("api", "d")] is True
    assert all("some_table" not in e["target"] for e in edges)

def test_dedup_keeps_highest_confidence():
    fns = [_fn("m", "INSERT INTO object_price (x) VALUES (1); UPDATE object_price SET x=2;")]
    edges, flags = infer_rpc_table_edges(fns, TABLES)
    writes = [e for e in edges if e["kind"] == "writes" and e["target"] == "public.object_price"]
    assert len(writes) == 1
