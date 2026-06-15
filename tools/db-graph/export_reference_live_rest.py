"""Export public reference rows through the Supabase REST API.

This is the practical companion to Supabase MCP for large reference dumps:
use MCP to retrieve the project URL/publishable key and to audit counts, then
let this script page through PostgREST without truncating the agent response.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dbgraph.reference_extract import live_reference_tables  # noqa: E402


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "db-graph-out")
PAGE_SIZE = 1000


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _decode_json_value(value):
    if isinstance(value, str):
        return json.loads(value)
    return value


def _load_mcp_audit():
    path = os.environ.get("DB_GRAPH_MCP_AUDIT_JSON") or os.path.join(OUT, "reference_live_audit.json")
    if not os.path.exists(path):
        return None
    payload = _decode_json_value(_read_json(path))
    if isinstance(payload, list) and payload and isinstance(payload[0], dict) and "mcp_reference_audit" in payload[0]:
        return _decode_json_value(payload[0]["mcp_reference_audit"])
    if isinstance(payload, dict) and "mcp_reference_audit" in payload:
        return _decode_json_value(payload["mcp_reference_audit"])
    return payload


def _audit_counts(audit):
    out = {}
    if not audit:
        return out
    for row in audit.get("reference_table_counts") or []:
        if row.get("table"):
            out[row["table"]] = int(row.get("rows") or 0)
    return out


def _order_columns(columns):
    preferred = [
        "domain", "position", "sort_order", "rank", "ordinal", "code", "slug",
        "external_code", "scheme_code", "category_code", "group_code", "name",
        "label", "id",
    ]
    return [col for col in preferred if col in columns]


def _request_json(url, key, path, params=None, page=0):
    query = urllib.parse.urlencode(params or {}, doseq=True)
    full_url = "%s/rest/v1/%s%s" % (url.rstrip("/"), path, ("?" + query) if query else "")
    start = page * PAGE_SIZE
    end = start + PAGE_SIZE - 1
    req = urllib.request.Request(full_url, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Accept": "application/json",
        "Range-Unit": "items",
        "Range": "%d-%d" % (start, end),
    })
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def _fetch_table(url, key, table, columns):
    name = table.split(".", 1)[1]
    order = ",".join("%s.asc.nullslast" % col for col in _order_columns(columns))
    params = {"select": "*"}
    if order:
        params["order"] = order

    rows = []
    page = 0
    while True:
        batch = _request_json(url, key, name, params=params, page=page)
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        page += 1
        time.sleep(0.1)
    return rows


def _lookup(rows, key_col="id", value_col="code"):
    return {row.get(key_col): row.get(value_col) for row in rows if row.get(key_col) is not None}


def _lookup_row(rows, key_col="id"):
    return {row.get(key_col): row for row in rows if row.get(key_col) is not None}


def _enrich(table_rows):
    ref_code_by_id = _lookup_row(table_rows.get("public.ref_code", []))
    scheme_by_id = _lookup_row(table_rows.get("public.ref_classification_scheme", []))
    class_value_by_id = _lookup_row(table_rows.get("public.ref_classification_value", []))
    action_by_id = _lookup_row(table_rows.get("public.ref_sustainability_action", []))
    action_group_by_id = _lookup_row(table_rows.get("public.ref_sustainability_action_group", []))
    action_category_by_id = _lookup_row(table_rows.get("public.ref_sustainability_action_category", []))
    metric_by_id = _lookup_row(table_rows.get("public.ref_capacity_metric", []))

    for row in table_rows.get("public.ref_amenity", []):
        family = ref_code_by_id.get(row.get("family_id"))
        if family:
            row.setdefault("family_code", family.get("code"))
            row.setdefault("family_name", family.get("name"))

    for row in table_rows.get("public.ref_capacity_applicability", []):
        metric = metric_by_id.get(row.get("metric_id"))
        if metric:
            row.setdefault("metric_code", metric.get("code"))
            row.setdefault("metric_name", metric.get("name"))

    for row in table_rows.get("public.ref_classification_value", []):
        scheme = scheme_by_id.get(row.get("scheme_id"))
        if scheme:
            row.setdefault("scheme_code", scheme.get("code"))
            row.setdefault("scheme_name", scheme.get("name"))

    for row in table_rows.get("public.ref_classification_equivalent_group", []):
        scheme = scheme_by_id.get(row.get("scheme_id"))
        group = action_group_by_id.get(row.get("group_id"))
        if scheme:
            row.setdefault("classification_code", scheme.get("code"))
            row.setdefault("classification_name", scheme.get("name"))
        if group:
            row.setdefault("group_code", group.get("code"))
            row.setdefault("group_name", group.get("name"))

    for row in table_rows.get("public.ref_classification_equivalent_action", []):
        scheme = scheme_by_id.get(row.get("scheme_id"))
        action = action_by_id.get(row.get("action_id"))
        if scheme:
            row.setdefault("classification_code", scheme.get("code"))
            row.setdefault("classification_name", scheme.get("name"))
        if action:
            row.setdefault("action_external_code", action.get("external_code") or action.get("code"))
            row.setdefault("action_label", action.get("label"))

    for row in table_rows.get("public.ref_sustainability_action", []):
        category = action_category_by_id.get(row.get("category_id"))
        group = action_group_by_id.get(row.get("group_id"))
        if category:
            row.setdefault("category_code", category.get("code"))
            row.setdefault("category_name", category.get("name"))
        if group:
            row.setdefault("group_code", group.get("code"))
            row.setdefault("group_name", group.get("name"))

    for row in table_rows.get("public.ref_sustainability_action_group", []):
        category = action_category_by_id.get(row.get("category_id"))
        if category:
            row.setdefault("category_code", category.get("code"))
            row.setdefault("category_name", category.get("name"))

    for row in table_rows.get("public.ref_code_taxonomy_closure", []):
        ancestor = ref_code_by_id.get(row.get("ancestor_id"))
        descendant = ref_code_by_id.get(row.get("descendant_id"))
        if ancestor:
            row.setdefault("ancestor_code", ancestor.get("code"))
            row.setdefault("ancestor_name", ancestor.get("name"))
        if descendant:
            row.setdefault("descendant_code", descendant.get("code"))
            row.setdefault("descendant_name", descendant.get("name"))


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from Supabase MCP first.")

    graph = _read_json(os.path.join(OUT, "graph.json"))
    extra = _read_json(os.path.join(OUT, "catalog_extra.json"))
    targets = live_reference_tables(graph, extra)

    audit = _load_mcp_audit()
    mcp_counts = _audit_counts(audit)
    table_rows = {}
    errors = []
    for target in targets:
        table = target["table"]
        try:
            table_rows[table] = _fetch_table(url, key, table, target["columns"])
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
            message = str(exc)
            if isinstance(exc, urllib.error.HTTPError):
                try:
                    message = exc.read().decode("utf-8", "replace")
                except Exception:
                    pass
            errors.append({"table": table, "message": message})
            table_rows[table] = []

    _enrich(table_rows)

    trusted_tables = []
    count_mismatches = []
    for table in sorted(table_rows):
        rest_count = len(table_rows[table])
        mcp_count = mcp_counts.get(table)
        if mcp_count is None or mcp_count == rest_count:
            trusted_tables.append(table)
            continue
        count_mismatches.append({"table": table, "mcp_rows": mcp_count, "rest_rows": rest_count})
        errors.append({
            "table": table,
            "message": "Publishable REST returned %d row(s), MCP audit counted %d; SQL seed rows are preserved for this table." % (
                rest_count, mcp_count),
        })

    rows = []
    for table in trusted_tables:
        for values in table_rows[table]:
            rows.append({
                "table": table,
                "values": values,
                "source": "supabase-rest:%s" % table,
                "source_kind": "supabase_rest_publishable_via_mcp",
            })

    live = {
        "status": "mcp_verified_rest_export",
        "queried_at": datetime.now(timezone.utc).isoformat(),
        "transport": "supabase_rest_publishable",
        "mcp_role": "project URL/key discovery plus execute_sql/list_tables audit",
        "tables": trusted_tables,
        "mcp_audit_queried_at": (audit or {}).get("queried_at"),
        "count_mismatches": count_mismatches,
        "errors": errors,
        "truncated": [],
    }
    out = {"rows": rows, "derived_sources": [], "live": live}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "reference_live.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)

    print("exported %d live reference rows from %d tables (%d errors)" % (
        len(rows), len(table_rows), len(errors)))


if __name__ == "__main__":
    main()
