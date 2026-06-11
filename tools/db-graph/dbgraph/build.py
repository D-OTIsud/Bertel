"""Assemble the unified graph from tbls JSON + the gap-extract, plus inferred edges, docs,
classification, and the first-class object-model relationship layer."""
from .load import load_tbls_schema, load_extra
from .infer import infer_rpc_table_edges
from .docs import attach_sql_docs
from .classify import classify

_CARRIER = {"object_relation": "object_rel", "object_org_link": "org_link", "actor_object_role": "actor_role"}


def _inherit_attached_domains(nodes, edges):
    by_id = {n["id"]: n for n in nodes}

    def domain_for(node_id):
        node = by_id.get(node_id)
        return node.get("domain") if node else None

    gate_targets = {}
    for e in edges:
        if e["kind"] == "gates":
            gate_targets.setdefault(e["source"], []).append(e["target"])

    for n in nodes:
        if n["kind"] == "trigger":
            dom = domain_for(n.get("props", {}).get("table"))
            if dom:
                n["domain"] = dom
        elif n["kind"] == "policy":
            candidates = [n.get("props", {}).get("table")] + gate_targets.get(n["id"], [])
            for target in candidates:
                dom = domain_for(target)
                if dom:
                    n["domain"] = dom
                    break


def build_graph(tbls, extra, sql_paths):
    nodes, edges = load_tbls_schema(tbls)
    en, ee = load_extra(extra)
    nodes += en
    edges += ee

    # policies can gate tables outside the tbls scope (e.g. storage.objects, the media-bucket
    # RESTRICTIVE policy): keep them attached via an explicit stub node rather than silently
    # pruning the gates edge. Stubs are excluded from meta counts.
    known = {n["id"] for n in nodes}
    for e in edges:
        if e["kind"] == "gates" and e["target"] not in known:
            sch, _, nm = e["target"].partition(".")
            nodes.append({"id": e["target"], "kind": "table", "label": nm, "schema": sch,
                          "domain": None, "doc": "(outside tbls scope — stub carrying RLS policies)",
                          "props": {"columns": [], "rls_enabled": True, "external": True}})
            known.add(e["target"])

    table_ids = {n["id"] for n in nodes if n["kind"] in ("table", "view", "matview")}

    inferred, flags = infer_rpc_table_edges(extra.get("functions", []), table_ids)
    edges += inferred
    for n in nodes:
        if n["kind"] == "function":
            n["props"]["dynamic_sql"] = flags.get((n["schema"], n["label"]), False)

    gated = {e["target"] for e in edges if e["kind"] == "gates"}
    for n in nodes:
        if n["kind"] in ("table", "view", "matview"):
            n["props"]["rls_enabled"] = n["id"] in gated

    attach_sql_docs(nodes, sql_paths)
    for n in nodes:
        n["domain"] = classify(n)
    _inherit_attached_domains(nodes, edges)

    for n in nodes:
        if n["kind"] == "table" and n["label"] in _CARRIER:
            n["props"]["relationship_carrier"] = _CARRIER[n["label"]]

    enum_id = next((n["id"] for n in nodes if n["kind"] == "enum" and n["label"] == "object_type"), None)
    present = {n["id"] for n in nodes}
    for row in extra.get("applicability", []):
        facet_id = "public." + row["facet_table"]
        if enum_id and facet_id in present:
            edges.append({"source": enum_id, "target": facet_id, "kind": "applies_to",
                          "props": {"object_type": row["object_type"]}})

    # resolve `executes` targets (trigger def gives schema.name; function ids carry args), then prune
    # any edge referencing a missing node id (prevents the d3 force graph from crashing on dangling edges).
    fn_by_name = {}
    for n in nodes:
        if n["kind"] == "function":
            fn_by_name.setdefault("%s.%s" % (n["schema"], n["label"]), n["id"])
    for e in edges:
        if e["kind"] == "executes" and e["target"] not in present:
            e["target"] = fn_by_name.get(e["target"], e["target"])
    edges = [e for e in edges if e["source"] in present and e["target"] in present]

    meta = {
        "table_count": sum(1 for n in nodes if n["kind"] == "table" and not n["props"].get("external")),
        "view_count": sum(1 for n in nodes if n["kind"] in ("view", "matview")),
        "function_count": sum(1 for n in nodes if n["kind"] == "function"),
        "policy_count": sum(1 for n in nodes if n["kind"] == "policy"),
        "trigger_count": sum(1 for n in nodes if n["kind"] == "trigger"),
        "enum_count": sum(1 for n in nodes if n["kind"] == "enum"),
        "edge_count": len(edges),
    }
    return {"meta": meta, "nodes": nodes, "edges": edges}
