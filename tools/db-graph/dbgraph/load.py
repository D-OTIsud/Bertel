"""Parse tbls JSON (tables/FKs/triggers) and the gap-extract JSON (functions/policies/enums)
into the shared node/edge model. No DB access; pure transforms."""
import re

_EXEC_FN = re.compile(r"execute\s+(?:function|procedure)\s+([a-z_][\w]*\.[a-z_][\w]*)\s*\(", re.I)


def _split(qualname):
    """'public.object' -> ('public', 'object'); bare name -> ('public', name)."""
    if "." in qualname:
        s, n = qualname.split(".", 1)
        return s, n
    return "public", qualname


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
                edges.append({"source": tid, "target": m.group(1), "kind": "executes", "props": {}})
    for r in tbls.get("relations", []):
        child = r.get("table", {}).get("name")
        parent = r.get("parent_table", {}).get("name")
        if not child or not parent:
            continue
        pairs = list(zip([c["name"] for c in r.get("columns", [])],
                         [c["name"] for c in r.get("parent_columns", [])]))
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
    for p in extra.get("policies", []):
        pid = "policy:%s.%s:%s" % (p["schema"], p["table"], p["name"])
        tid = "%s.%s" % (p["schema"], p["table"])
        pred = " | ".join(x for x in [p.get("qual"), p.get("with_check")] if x) or ""
        nodes.append({"id": pid, "kind": "policy", "label": p["name"], "schema": p["schema"],
                      "domain": None, "doc": None,
                      "props": {"table": tid, "cmd": p.get("cmd", ""), "roles": p.get("roles") or [],
                                "predicate": pred[:400]}})
        edges.append({"source": pid, "target": tid, "kind": "gates", "props": {}})
    for en in extra.get("enums", []):
        eid = "%s.%s" % (en["schema"], en["name"])
        nodes.append({"id": eid, "kind": "enum", "label": en["name"], "schema": en["schema"],
                      "domain": None, "doc": None, "props": {"values": en.get("values") or []}})
        for col in en.get("used_by", []):
            parts = col.rsplit(".", 1)
            tbl = parts[0] if len(parts) == 2 else col
            edges.append({"source": tbl, "target": eid, "kind": "typed_by", "props": {"column": col}})
    return nodes, edges
