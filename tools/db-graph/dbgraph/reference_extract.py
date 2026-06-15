"""Extract versioned reference values from SQL seed files.

The database graph knows table structure, functions, policies, and enums. It
does not carry row data. This module adds a small, conservative extractor for
reference rows that are committed as SQL seeds, so the generated docs can list
codes, tags, roles, permissions, and similar vocabularies without touching the
live database.
"""
import os
import re
import ssl
from datetime import date, datetime, time
from decimal import Decimal
from urllib.parse import parse_qs, unquote, urlparse
from uuid import UUID


_INSERT_VALUES = re.compile(
    r"\binsert\s+into\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)\s*\(([^)]*)\)\s*values\s*",
    re.I,
)
_CTE_VALUES = re.compile(
    r"\b([a-z_][\w]*)\s*\(([^)]*)\)\s+as\s*\(\s*values\s*",
    re.I,
)
_NEXT_REF_INSERT = re.compile(
    r"\binsert\s+into\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)\s*\(([^)]*)\)",
    re.I,
)


def _strip_line_comments(sql):
    out = []
    i = 0
    in_quote = False
    while i < len(sql):
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""
        if ch == "'":
            out.append(ch)
            if in_quote and nxt == "'":
                out.append(nxt)
                i += 2
                continue
            in_quote = not in_quote
            i += 1
            continue
        if not in_quote and ch == "-" and nxt == "-":
            while i < len(sql) and sql[i] not in "\r\n":
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _split_columns(text):
    return [c.strip().strip('"') for c in text.replace("\n", " ").split(",") if c.strip()]


def _find_matching(text, start, open_ch="(", close_ch=")"):
    depth = 0
    in_quote = False
    i = start
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if ch == "'":
            if in_quote and nxt == "'":
                i += 2
                continue
            in_quote = not in_quote
        elif not in_quote:
            if ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def _read_value_tuples(text, start):
    tuples = []
    pos = start
    while pos < len(text):
        while pos < len(text) and text[pos] in " \t\r\n,":
            pos += 1
        if pos >= len(text) or text[pos] != "(":
            break
        end = _find_matching(text, pos)
        if end == -1:
            break
        tuples.append(text[pos + 1:end])
        pos = end + 1
    return tuples, pos


def _split_tuple(text):
    parts = []
    start = 0
    depth = 0
    in_quote = False
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if ch == "'":
            if in_quote and nxt == "'":
                i += 2
                continue
            in_quote = not in_quote
        elif not in_quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "," and depth == 0:
                parts.append(text[start:i].strip())
                start = i + 1
        i += 1
    parts.append(text[start:].strip())
    return parts


def _clean_value(value):
    raw = value.strip()
    low = raw.lower()
    if low in ("null", "null::uuid", "null::text"):
        return None
    if low in ("true", "false"):
        return low == "true"
    if raw.startswith("'"):
        end = 1
        buf = []
        while end < len(raw):
            ch = raw[end]
            nxt = raw[end + 1] if end + 1 < len(raw) else ""
            if ch == "'" and nxt == "'":
                buf.append("'")
                end += 2
                continue
            if ch == "'":
                return "".join(buf)
            buf.append(ch)
            end += 1
    if re.fullmatch(r"-?\d+", raw):
        try:
            return int(raw)
        except ValueError:
            return raw
    if re.fullmatch(r"-?\d+\.\d+", raw):
        try:
            return float(raw)
        except ValueError:
            return raw
    return raw


def _line_for(text, offset):
    return text.count("\n", 0, offset) + 1


def _qualify(table):
    return table if "." in table else "public." + table


def _split_qualname(table):
    schema, _, name = _qualify(table).partition(".")
    return schema, name


def _quote_ident(value):
    return '"' + str(value).replace('"', '""') + '"'


def _is_reference_target(table):
    name = table.split(".")[-1]
    return name.startswith("ref_") or name in {"tag_link"}


def _rows_from_tuples(table, columns, tuples, path, line, source_kind):
    rows = []
    for tup in tuples:
        values = [_clean_value(v) for v in _split_tuple(tup)]
        item = {}
        for idx, col in enumerate(columns):
            item[col] = values[idx] if idx < len(values) else None
        rows.append({
            "table": _qualify(table),
            "values": item,
            "source": "%s:%d" % (path.replace("\\", "/"), line),
            "source_kind": source_kind,
        })
    return rows


def extract_reference_values(sql_paths):
    """Return reference rows extracted from committed SQL files.

    The extractor intentionally focuses on explicit VALUES tuples. Derived
    INSERT...SELECT statements are tracked as sources, but not guessed as row
    values because the values depend on previous data.
    """
    rows = []
    derived_sources = []
    seen = set()
    for path in sql_paths:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            original = f.read()
        sql = _strip_line_comments(original)

        for match in _INSERT_VALUES.finditer(sql):
            table = _qualify(match.group(1))
            if not _is_reference_target(table):
                continue
            columns = _split_columns(match.group(2))
            tuples, _ = _read_value_tuples(sql, match.end())
            rows.extend(_rows_from_tuples(table, columns, tuples, path, _line_for(sql, match.start()), "insert_values"))

        for match in _CTE_VALUES.finditer(sql):
            columns = _split_columns(match.group(2))
            tuples, end_pos = _read_value_tuples(sql, match.end())
            following = sql[end_pos:end_pos + 2400]
            insert = _NEXT_REF_INSERT.search(following)
            if not insert:
                continue
            table = _qualify(insert.group(1))
            if not _is_reference_target(table):
                continue
            key = (path, match.start(), table)
            if key in seen:
                continue
            seen.add(key)
            rows.extend(_rows_from_tuples(table, columns, tuples, path, _line_for(sql, match.start()), "cte_values"))

        for match in re.finditer(r"\binsert\s+into\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)\s*\(", sql, re.I):
            table = _qualify(match.group(1))
            if not _is_reference_target(table):
                continue
            after = sql[match.end():match.end() + 500]
            if re.search(r"\)\s*values\s*", after, re.I):
                continue
            derived_sources.append({
                "table": table,
                "source": "%s:%d" % (path.replace("\\", "/"), _line_for(sql, match.start())),
                "note": "INSERT derives values through SELECT/CTE; row values are not guessed.",
            })
    return {"rows": rows, "derived_sources": derived_sources}


def live_reference_tables(graph, extra=None):
    """Return canonical public reference tables to read from a live DB.

    `ref_code_*` partition children are skipped because reading the parent
    `public.ref_code` already returns every domain/code row.
    """
    partition_children = {
        row.get("child")
        for row in (extra or {}).get("partitions", [])
        if row.get("parent") == "public.ref_code"
    }
    out = []
    seen = set()
    for node in graph.get("nodes", []):
        if node.get("kind") not in ("table", "view", "matview"):
            continue
        if node.get("schema") != "public":
            continue
        table = node.get("id")
        label = node.get("label", "")
        if not table or table in seen or table in partition_children:
            continue
        if not label.startswith("ref_"):
            continue
        columns = [c.get("name") for c in node.get("props", {}).get("columns", []) if c.get("name")]
        if columns:
            out.append({"table": table, "columns": columns})
            seen.add(table)
    return sorted(out, key=lambda item: item["table"])


def _parse_dsn(dsn):
    parsed = urlparse(dsn)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ValueError("TBLS_DSN must use postgres:// or postgresql://")
    params = parse_qs(parsed.query)
    sslmode = (params.get("sslmode", [""])[0] or "").lower()
    if sslmode == "require":
        ssl_context = ssl._create_unverified_context()
    elif sslmode in ("verify-ca", "verify-full"):
        ssl_context = ssl.create_default_context()
    else:
        ssl_context = None
    database = unquote(parsed.path.lstrip("/")) if parsed.path else None
    return {
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 5432,
        "database": database or None,
        "ssl_context": ssl_context,
    }


def _serialise_live_value(value):
    if isinstance(value, (datetime, date, time, Decimal, UUID)):
        return str(value)
    if isinstance(value, list):
        return [_serialise_live_value(v) for v in value]
    if isinstance(value, tuple):
        return [_serialise_live_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _serialise_live_value(v) for k, v in value.items()}
    return value


def _order_columns(columns):
    preferred = [
        "domain", "position", "sort_order", "rank", "code", "slug", "external_code",
        "scheme_code", "category_code", "group_code", "name", "label", "id",
    ]
    return [col for col in preferred if col in columns]


def extract_live_reference_values(dsn, graph, extra=None, max_rows_per_table=10000):
    """Read canonical reference rows from a live Postgres database.

    Returns the same shape as `extract_reference_values`, with a `live` metadata
    block recording queried tables, per-table errors, and truncation.
    """
    try:
        import pg8000.dbapi as pgdb
    except ImportError as exc:
        return {
            "rows": [],
            "derived_sources": [],
            "live": {"status": "error", "message": "pg8000 is not installed", "errors": [str(exc)], "tables": []},
        }

    targets = live_reference_tables(graph, extra)
    live = {"status": "queried", "tables": [], "errors": [], "truncated": []}
    rows = []
    try:
        conn = pgdb.connect(**_parse_dsn(dsn), timeout=20, application_name="bertel-db-doc-reference")
    except Exception as exc:
        return {
            "rows": [],
            "derived_sources": [],
            "live": {"status": "error", "message": "could not connect with TBLS_DSN", "errors": [str(exc)], "tables": []},
        }

    try:
        cur = conn.cursor()
        for target in targets:
            table = target["table"]
            schema, name = _split_qualname(table)
            columns = target["columns"]
            select_cols = ", ".join(_quote_ident(col) for col in columns)
            order_cols = _order_columns(columns)
            order_sql = ""
            if order_cols:
                order_sql = " ORDER BY " + ", ".join(_quote_ident(col) + " NULLS LAST" for col in order_cols)
            sql = "SELECT %s FROM %s.%s%s LIMIT %s" % (
                select_cols, _quote_ident(schema), _quote_ident(name), order_sql, int(max_rows_per_table) + 1,
            )
            try:
                cur.execute(sql)
                fetched = cur.fetchall()
                live["tables"].append(table)
            except Exception as exc:
                live["errors"].append({"table": table, "message": str(exc)})
                try:
                    conn.rollback()
                except Exception:
                    pass
                continue
            if len(fetched) > max_rows_per_table:
                live["truncated"].append({"table": table, "limit": max_rows_per_table})
                fetched = fetched[:max_rows_per_table]
            for row in fetched:
                values = {col: _serialise_live_value(row[idx]) for idx, col in enumerate(columns)}
                rows.append({
                    "table": table,
                    "values": values,
                    "source": "live:%s" % table,
                    "source_kind": "live_table",
                })
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return {"rows": rows, "derived_sources": [], "live": live}


def merge_reference_extracts(seed_refs, live_refs):
    """Prefer live rows for successfully queried tables, keep seeds for the rest."""
    live = (live_refs or {}).get("live") or {"status": "not_queried", "tables": []}
    queried = set(live.get("tables") or [])
    rows = list((live_refs or {}).get("rows") or [])
    rows.extend(row for row in (seed_refs or {}).get("rows", []) if row.get("table") not in queried)
    return {
        "rows": rows,
        "derived_sources": list((seed_refs or {}).get("derived_sources", [])) + list((live_refs or {}).get("derived_sources", [])),
        "live": live,
        "seed": {
            "rows": len((seed_refs or {}).get("rows", [])),
            "derived_sources": len((seed_refs or {}).get("derived_sources", [])),
        },
    }
