"""Merge this lot's body-free live metadata into the existing mixed-age graph.

No DB connection. Dry run by default. Existing complete-catalog provenance and
unrelated nodes/edges/Markdown are retained; this never claims a full refresh.
"""
import argparse
import copy
import json
import re
from pathlib import Path

from dbgraph.classify import classify
from dbgraph.infer import _resolve
from dbgraph.load import load_extra, load_tbls_schema
from dbgraph.render import render_html, write_functions_md
from dbgraph.typemap import write_function_access_md
from partner_selection_catalog_query import FUNCTIONS

TABLE = "internal.partner_selection"
READERS = {
    "api.list_partner_objects_with_vocabulary": "ddcb1112ad9cdb9b7fcba9bfd4a881e6",
    "api.list_partner_selection_objects_with_vocabulary": "b39369e86bff568b267e832da825dfe9",
}
TICK = chr(96)


def merge_graph(baseline, capture, source_label):
    """Pure transform, also used with explicitly labelled synthetic test input."""
    table_catalog = capture["table_catalog"]
    if [t["name"] for t in table_catalog["tables"]] != [TABLE]:
        raise ValueError("Expected exactly internal.partner_selection")
    functions = capture["functions"]
    if len(functions) != len(FUNCTIONS) or {(f["schema"], f["name"]) for f in functions} != set(FUNCTIONS):
        raise ValueError("Missing, duplicate or unexpected function identity")
    actual_readers = {r["name"]: r["body_md5"] for r in capture["preserved_readers"]}
    if actual_readers != READERS:
        raise ValueError("Existing public reader changed or is absent")
    security, = capture["table_security"]
    if security["name"] != TABLE or not security["rls_enabled"] or security["policies"]:
        raise ValueError("Unexpected private-table RLS/policy contract")
    if any(security["client_select"].values()) or any(security["client_write"].values()):
        raise ValueError("Private selection table has client privileges")
    for f in functions:
        if "body" in f or not re.fullmatch("[0-9a-f]{32}", f["body_md5"]):
            raise ValueError("Expected body-free metadata with a body hash")
        if f["schema"] == "internal" and (f["effective_execute"]["anon"] or f["effective_execute"]["authenticated"]):
            raise ValueError("Internal helper unexpectedly executable by a client role")
        if f["name"] == "get_active_partner_selection_definition":
            if f["effective_execute"] != {"anon": False, "authenticated": False, "service_role": True}:
                raise ValueError("Active partner definition reader is not service-only")

    graph = copy.deepcopy(baseline)
    table_nodes, table_edges = load_tbls_schema(table_catalog)
    if len(table_nodes) != 1:
        raise ValueError("Unexpected trigger/view in the scoped table capture")
    table = table_nodes[0]
    table["domain"] = classify(table)
    table["props"].update(rls_enabled=security["rls_enabled"], rls_forced=security["rls_forced"],
                          owner=security["owner"], acl=security["acl"])
    new_nodes, _ = load_extra({"functions": functions})
    by_name = {(n["schema"], n["label"]): n for n in new_nodes}
    captured_at = capture["_capture"]["captured_at"]
    for f in functions:
        node = by_name[(f["schema"], f["name"])]
        node["domain"] = classify(node)
        node["props"].update(dynamic_sql=f["dynamic_sql"], body_md5=f["body_md5"],
                             catalog_captured_at=captured_at, execute_roles=f["execute_roles"],
                             effective_execute=f["effective_execute"], settings=f["settings"], owner=f["owner"])
    new_nodes = [table] + new_nodes
    scope = set(FUNCTIONS)
    affected_old = {n["id"] for n in baseline["nodes"] if n["id"] == TABLE or
                    (n["kind"] == "function" and (n["schema"], n["label"]) in scope)}
    replacements = {n["id"]: n for n in new_nodes}
    old_to_new = {}
    for old in baseline["nodes"]:
        if old["id"] not in affected_old:
            continue
        replacement = table if old["id"] == TABLE else by_name[(old["schema"], old["label"])]
        if old["props"].get("sources"):
            replacement["props"]["sources"] = copy.deepcopy(old["props"]["sources"])
        if old.get("doc") and replacement.get("doc") is None:
            replacement["doc"] = old["doc"]
        old_to_new[old["id"]] = replacement["id"]
    seen = set()
    nodes = []
    for old in baseline["nodes"]:
        if old["id"] in affected_old:
            node = replacements[old_to_new[old["id"]]]
            if node["id"] in seen:
                raise ValueError("Overloaded affected function needs manual review")
            nodes.append(node)
            seen.add(node["id"])
        else:
            nodes.append(old)
    for node in new_nodes:
        if node["id"] in seen:
            continue
        kind = node["kind"]
        pos = next((i for i, n in enumerate(nodes)
                    if n["kind"] == ("function" if kind == "table" else "policy")), len(nodes))
        nodes.insert(pos, node)
        seen.add(node["id"])
    graph["nodes"] = nodes
    edges = []
    for edge in baseline["edges"]:
        if edge["source"] in affected_old:
            continue
        if edge["target"] in old_to_new:
            edge = copy.deepcopy(edge)
            edge["target"] = old_to_new[edge["target"]]
        edges.append(edge)
    known = {n["id"] for n in nodes}
    tables = {n["id"] for n in nodes if n["kind"] in ("table", "view", "matview")}
    inferred = {}
    for f in functions:
        source = by_name[(f["schema"], f["name"])]["id"]
        for ref in f["references"]:
            if ref["kind"] not in ("reads", "writes"):
                raise ValueError("Unexpected inferred reference kind")
            target, confidence = _resolve(ref["identifier"], tables)
            if target:
                inferred[(source, target, ref["kind"])] = {
                    "source": source, "target": target, "kind": ref["kind"],
                    "props": {"inference": {"method": "regex", "confidence": confidence, "evidence": ref["evidence"]}}}
    graph["edges"] = edges + table_edges + list(inferred.values())
    if len({n["id"] for n in nodes}) != len(nodes):
        raise ValueError("Duplicate graph node")
    if any(e["source"] not in known or e["target"] not in known for e in graph["edges"]):
        raise ValueError("Dangling graph edge")
    graph["meta"] = {
        "table_count": sum(n["kind"] == "table" and not n["props"].get("external") for n in nodes),
        "view_count": sum(n["kind"] in ("view", "matview") for n in nodes),
        **{kind + "_count": sum(n["kind"] == kind for n in nodes)
           for kind in ("function", "policy", "trigger", "enum")},
        "edge_count": len(graph["edges"]),
    }
    provenance = {"scope": "targeted table/function metadata; not a complete catalog refresh",
                  "source": source_label, "captured_at": captured_at, "table": TABLE,
                  "project_ref": capture["_capture"].get("project_ref"),
                  "migration_history": copy.deepcopy(capture.get("migration_history", [])),
                  "functions": [n["id"] for n in new_nodes if n["kind"] == "function"],
                  "preserved_readers": actual_readers}
    old_provenance = graph.setdefault("catalog_provenance", {})
    updates = old_provenance.setdefault("targeted_catalog_updates", [])
    if provenance not in updates:
        updates.append(provenance)
    # Unrelated graph objects are byte-for-byte data-equal, in their original order.
    assert [n for n in graph["nodes"] if n["id"] not in replacements] == [
        n for n in baseline["nodes"] if n["id"] not in affected_old]
    for edge in baseline["edges"]:
        if edge["source"] not in affected_old and edge["target"] not in old_to_new:
            assert edge in graph["edges"]
    return graph, affected_old, {n["id"] for n in new_nodes if n["kind"] == "function"}


def sections(text, level):
    """Only function sections; schema headers/manual addenda remain outside replacements."""
    pattern = r"(?m)^" + "#" * level + r" " + TICK + r"([^" + TICK + r"]+)" + TICK + r"[^\n]*\n"
    starts = list(re.finditer(pattern, text))
    result = {}
    for match in starts:
        tail = text[match.end():]
        end = re.search(r"(?m)^#{1," + str(level) + r"} ", tail)
        stop = match.end() + end.start() if end else len(text)
        result[match.group(1)] = (match.start(), stop, text[match.start():stop])
    return result


def patch_function_sections(original, generated, old_ids, new_ids, level):
    parsed = sections(original, level)
    for identity in old_ids:
        if identity in parsed:
            start, stop, _ = parsed[identity]
            original = original[:start] + original[stop:]
            parsed = sections(original, level)
    fresh = sections(generated, level)
    for identity in sorted(new_ids):
        block = fresh[identity][2]
        parsed = sections(original, level)
        key = identity.split("(", 1)[0]
        same_schema = [(name, span) for name, span in parsed.items()
                       if name.split(".", 1)[0] == identity.split(".", 1)[0]]
        later = [(name, span) for name, span in same_schema if name.split("(", 1)[0] > key]
        if later:
            position = min(span[0] for _, span in later)
        elif same_schema:
            position = max(span[1] for _, span in same_schema)
        else:
            raise ValueError("New schema requires an explicit Markdown heading")
        original = original[:position] + block + original[position:]
    return original


def table_markdown(capture):
    table, = capture["table_catalog"]["tables"]
    sec, = capture["table_security"]
    lines = ["## New private table", "", TICK + TABLE + TICK, "", "| Column | Type | Nullable | Default / identity |",
             "| --- | --- | --- | --- |"]
    for column in table["columns"]:
        default = column.get("default") or column.get("extra_def") or ""
        lines.append("| %s | %s | %s | %s |" % (column["name"], column["type"],
                     column["nullable"], default.replace("|", "\\|")))
    lines += ["", "- RLS enabled: %s; forced: %s; policies: %s." %
              (sec["rls_enabled"], sec["rls_forced"], len(sec["policies"])),
              "- Client SELECT grants: %s; client write grants: %s." % (sec["client_select"], sec["client_write"])]
    for bucket in ("constraints", "indexes"):
        lines += ["", "### " + bucket.title(), ""]
        lines += ["- " + TICK + item.get("def", item["name"]) + TICK for item in table[bucket]]
    return "\n".join(lines)


def write_artifacts(root, capture, source_label, project_ref):
    out = root / "db-graph-out"
    baseline = json.loads((out / "graph.json").read_text(encoding="utf-8"))
    graph, old_ids, new_ids = merge_graph(baseline, capture, source_label)
    source_paths = list((root / "supabase/migrations").glob("*restaurant_cuisine_filter.sql"))
    source_paths += list((root / "supabase/migrations").glob("*partner_selection_registry.sql"))
    source_paths += list((root / "Base de donnée DLL et API").glob("restaurant_cuisine_filter.sql"))
    for node in graph["nodes"]:
        if node["id"] not in new_ids:
            continue
        pattern = re.compile(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+" + re.escape(node["schema"] + "." + node["label"]) + r"\b", re.I)
        sources = node["props"].setdefault("sources", [])
        for path in source_paths:
            for line, value in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if pattern.search(value) or (node["label"] == "get_filtered_object_ids" and "target constant regprocedure" in value):
                    source = {"path": path.relative_to(root).as_posix(), "line": line}
                    if source not in sources:
                        sources.append(source)
    generated = write_functions_md(graph)
    function_text = patch_function_sections((out / "FUNCTIONS.md").read_text(encoding="utf-8"),
                                           generated, old_ids, new_ids, 2)
    access_generated = write_function_access_md(graph, {})
    metadata = {(f["schema"], f["name"]): f for f in capture["functions"]}
    for identity, (_, _, block) in list(sections(access_generated, 3).items()):
        if identity not in new_ids:
            continue
        name = identity.split("(", 1)[0]
        schema, label = name.split(".", 1)
        facts = metadata[(schema, label)]
        extra = "- **EXECUTE grants:** " + ", ".join(TICK + role + TICK for role in facts["execute_roles"]) + ".\n"
        extra += "- **Effective EXECUTE:** " + json.dumps(facts["effective_execute"], sort_keys=True) + ".\n"
        if label not in ("get_filtered_object_ids", "cuisine_filter_codes"):
            extra += "- **Result scope:** organization-owned selection configuration; not an object resource serializer.\n"
        lines = block.splitlines(keepends=True)
        revised = "".join(lines[:2]) + extra + "".join(lines[2:])
        access_generated = access_generated.replace(block, revised, 1)
    access_text = patch_function_sections((out / "FUNCTION_ACCESS.md").read_text(encoding="utf-8"),
                                         access_generated, old_ids, new_ids, 3)
    index = (out / "DB_AGENT_INDEX.md").read_text(encoding="utf-8")
    m = graph["meta"]
    counts = "- tables: {table_count} · views: {view_count} · functions: {function_count} · policies: {policy_count} · triggers: {trigger_count} · enums: {enum_count} · edges: {edge_count}".format(**m)
    index = re.sub(r"(?m)^- tables:.*$", counts, index, count=1)
    note = "\nTargeted capture at %s: private selection table, registry RPCs and cuisine filter. Full catalogue 212 (8 November) and the 055511 supplement remain the baseline; this is not a full refresh. See [PARTNER_SELECTION_ADMIN.md](PARTNER_SELECTION_ADMIN.md).\n" % capture["_capture"]["captured_at"]
    if note.strip() not in index:
        index = index.replace("## Provenance du catalogue\n", "## Provenance du catalogue\n" + note, 1)
    domain = next(n["domain"] for n in graph["nodes"] if n["id"] == TABLE)
    labels = sorted(n["label"] for n in graph["nodes"] if n["kind"] == "table" and n["domain"] == domain)
    index = re.sub(r"(?m)^- \*\*" + re.escape(domain) + r"\*\*:.*$",
                   "- **%s**: %s" % (domain, ", ".join(TICK + label + TICK for label in labels)), index, count=1)
    safe = copy.deepcopy(capture)
    safe["capture_provenance"] = {"source": source_label, "project_ref": project_ref,
                                  "scope": "targeted only; complete catalogue baseline remains 212"}
    intro = "# Partner selection administration and cuisines — targeted catalogue supplement\n\n"
    intro += "Captured at %s via %s, project %s. The complete catalogue remains ledger 212 (8 November 2026), plus the separate 055511 RPC supplement. Only this lot's table, foreign key and functions were inspected; no business rows or function bodies were retrieved. Unrelated graph nodes, edges, Markdown addenda, policies and per-table baseline docs are retained.\n\n" % (capture["_capture"]["captured_at"], source_label, project_ref)
    text = intro + table_markdown(capture)
    text += "\n\n## Applied migration history\n\n"
    for migration in capture.get("migration_history", []):
        filename = migration["version"] + "_" + migration["name"] + ".sql"
        text += "- [%s](../supabase/migrations/%s).\n" % (filename, filename)
    text += "\n\n## Functions\n\n| Function | Returns | Definer | Body MD5 |\n| --- | --- | --- | --- |\n"
    for f in capture["functions"]:
        text += "| %s.%s | %s | %s | %s |\n" % (f["schema"], f["name"], f["returns"], f["security_definer"], f["body_md5"])
    text += "\nExact signatures, ACLs, indexes and inferred direct references are in [PARTNER_SELECTION_ADMIN_CATALOG.json](PARTNER_SELECTION_ADMIN_CATALOG.json). References are regex-inferred; indirect function calls are not expanded into table edges. Table grants and physical RLS are recorded even though the private table has no policies.\n\n"
    text += "Other derived views and docs/api-db-reference.html keep their earlier provenance; no full tbls regeneration is claimed. The ignored per-table supplement below is generated from this targeted metadata, not by a full tbls run.\n"
    outputs = {"graph.json": json.dumps(graph, ensure_ascii=False, indent=1),
               "FUNCTIONS.md": function_text, "FUNCTION_ACCESS.md": access_text,
               "DB_AGENT_INDEX.md": index, "PARTNER_SELECTION_ADMIN.md": text,
               "PARTNER_SELECTION_ADMIN_CATALOG.json": json.dumps(safe, ensure_ascii=False, indent=2) + "\n",
               "graph.html": render_html(graph)}
    for name, data in outputs.items():
        (out / name).write_text(data, encoding="utf-8", newline="\n")
    dbdoc = root / "dbdoc"
    dbdoc.mkdir(exist_ok=True)
    (dbdoc / (TABLE + ".md")).write_text(
        "# " + TABLE + "\n\nTargeted captured-metadata page; not a full tbls regeneration.\n\n" +
        table_markdown(capture), encoding="utf-8", newline="\n")
    return graph["meta"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--source-label", required=True)
    parser.add_argument("--project-ref")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    capture = json.loads(args.capture.read_text(encoding="utf-8"))
    baseline = json.loads((args.root / "db-graph-out/graph.json").read_text(encoding="utf-8"))
    graph, _, _ = merge_graph(baseline, capture, args.source_label)
    if args.apply:
        if args.project_ref != "ryycrdhlkmzpxwwwwupy" or capture["_capture"]["database_name"] != "postgres":
            parser.error("Production artifact write requires the verified Bertel project and postgres catalogue; local/test captures cannot replace production docs")
        write_artifacts(args.root, capture, args.source_label, args.project_ref)
    print(json.dumps({"mode": "applied targeted supplement" if args.apply else "dry run; no files changed",
                      "source": args.source_label, "captured_at": capture["_capture"]["captured_at"],
                      "counts": graph["meta"]}))


if __name__ == "__main__":
    main()
