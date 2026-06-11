"""Parse tbls JSON (tables/FKs/triggers) and the gap-extract JSON (functions/policies/enums)
into the shared node/edge model. No DB access; pure transforms."""
import re

# schema part optional: trigger defs say `EXECUTE FUNCTION update_updated_at_column()` unqualified
# when the function resolves via search_path — requiring the dot silently dropped 112/267 edges.
_EXEC_FN = re.compile(r"execute\s+(?:function|procedure)\s+((?:[a-z_][\w]*\.)?[a-z_][\w]*)\s*\(", re.I)


def _split(qualname):
    """'public.object' -> ('public', 'object'); bare name -> ('public', name)."""
    if "." in qualname:
        s, n = qualname.split(".", 1)
        return s, n
    return "public", qualname


def _rel_name(value):
    if isinstance(value, dict):
        return value.get("name")
    if isinstance(value, str):
        return value
    return None


def _rel_col_name(value):
    if isinstance(value, dict):
        return value.get("name")
    if isinstance(value, str):
        return value
    return None


def load_tbls_schema(tbls):
    nodes, edges = [], []
    pk_cols = {}  # table id -> set of pk column names
    for t in tbls.get("tables", []):
        schema, name = _split(t["name"])
        kind = {"VIEW": "view", "MATERIALIZED VIEW": "matview"}.get(t.get("type", "TABLE"), "table")
        pks = set()
        for c in t.get("constraints", []):
            if c.get("type") == "PRIMARY KEY":
                pks.update(c.get("columns", []))
        pk_cols[t["name"]] = pks
        cols = [{"name": c["name"], "type": c["type"], "nullable": bool(c.get("nullable", True)),
                 "pk": c["name"] in pks} for c in t.get("columns", [])]
        nodes.append({"id": t["name"], "kind": kind, "label": name, "schema": schema,
                      "domain": None, "doc": (t.get("comment") or None),
                      "props": {"columns": cols, "rls_enabled": None}})
        for tr in t.get("triggers", []):
            tid = "trigger:%s:%s" % (t["name"], tr["name"])
            nodes.append({"id": tid, "kind": "trigger", "label": tr["name"], "schema": schema,
                          "domain": None, "doc": (tr.get("comment") or None),
                          "props": {"table": t["name"], "timing": None, "events": []}})
            edges.append({"source": tid, "target": t["name"], "kind": "trigger_on", "props": {}})
            m = _EXEC_FN.search(tr.get("def", ""))
            if m:
                fname = m.group(1)
                if "." not in fname:
                    # unqualified = search_path resolution; in this DB that is the table's own schema
                    fname = "%s.%s" % (schema, fname)
                edges.append({"source": tid, "target": fname, "kind": "executes", "props": {}})
    for r in tbls.get("relations", []):
        child = _rel_name(r.get("table"))
        parent = _rel_name(r.get("parent_table"))
        if not child or not parent:
            continue
        pairs = list(zip([name for name in (_rel_col_name(c) for c in r.get("columns", [])) if name],
                         [name for name in (_rel_col_name(c) for c in r.get("parent_columns", [])) if name]))
        edges.append({"source": child, "target": parent, "kind": "fk",
                      "props": {"columns": [list(p) for p in pairs]}})
    return nodes, edges


def _fn_id(schema, name, args):
    return "%s.%s(%s)" % (schema, name, args or "")


def load_extra(extra):
    nodes, edges = [], []
    for f in extra.get("functions", []):
        fid = _fn_id(f["schema"], f["name"], f.get("args", ""))
        nodes.append({"id": fid, "kind": "function", "label": f["name"], "schema": f["schema"],
                      "domain": None, "doc": (f.get("comment") or None),
                      "props": {"signature": "%s(%s)" % (f["name"], f.get("args", "")),
                                "returns": f.get("returns", ""), "security_definer": bool(f.get("security_definer")),
                                "volatility": f.get("volatility", ""), "dynamic_sql": False}})
    # partitions are not tbls table nodes — roll their policies' gates edges up to the parent
    # (props.table keeps the real partition name; the edge records which partition it came via)
    part_parent = {p["child"]: p["parent"] for p in extra.get("partitions", [])}
    for p in extra.get("policies", []):
        pid = "policy:%s.%s:%s" % (p["schema"], p["table"], p["name"])
        tid = "%s.%s" % (p["schema"], p["table"])
        pred = " | ".join(x for x in [p.get("qual"), p.get("with_check")] if x) or ""
        # cap predicate size in the committed artifacts, but make the cut visible —
        # a silent mid-word truncation reads as a complete (wrong) predicate
        if len(pred) > 400:
            pred = pred[:400] + " …[truncated — full text in catalog_extra.json or live pg_policies]"
        props = {"table": tid, "cmd": p.get("cmd", ""), "roles": p.get("roles") or [],
                 "predicate": pred}
        if p.get("permissive") == "RESTRICTIVE":
            props["restrictive"] = True
        gate_target = part_parent.get(tid, tid)
        if gate_target != tid:
            props["partition_of"] = gate_target
        nodes.append({"id": pid, "kind": "policy", "label": p["name"], "schema": p["schema"],
                      "domain": None, "doc": None, "props": props})
        edges.append({"source": pid, "target": gate_target, "kind": "gates",
                      "props": ({"via_partition": tid} if gate_target != tid else {})})
    for en in extra.get("enums", []):
        eid = "%s.%s" % (en["schema"], en["name"])
        nodes.append({"id": eid, "kind": "enum", "label": en["name"], "schema": en["schema"],
                      "domain": None, "doc": None, "props": {"values": en.get("values") or []}})
        for col in en.get("used_by", []):
            parts = col.rsplit(".", 1)
            tbl = parts[0] if len(parts) == 2 else col
            edges.append({"source": tbl, "target": eid, "kind": "typed_by", "props": {"column": col}})
    return nodes, edges
