"""Attach SQL source metadata and preceding `--` comment blocks to function nodes.

tbls/catalog sees COMMENT ON metadata, but not the file/line where a function is
defined and not the inline `--` header blocks that often document RPC behavior.
"""
import re


def _source_path(path):
    cleaned = path.replace("\\", "/")
    for marker in ("Base de donnée DLL et API/", "tools/db-graph/"):
        if marker in cleaned:
            return marker + cleaned.split(marker, 1)[1]
    return cleaned


def _find_matching_paren(text, start):
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
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def _normalise_signature(name, args):
    compact_args = re.sub(r"\s+", " ", (args or "").strip())
    return "%s(%s)" % (name.lower(), compact_args.lower())


def _entry_signature(sql_text, start_offset, name):
    pos = start_offset
    while pos < len(sql_text) and sql_text[pos].isspace():
        pos += 1
    if pos >= len(sql_text) or sql_text[pos] != "(":
        return None
    end = _find_matching_paren(sql_text, pos)
    if end == -1:
        return None
    return _normalise_signature(name, sql_text[pos + 1:end])


def _index_definitions(sql_text, path):
    """Return indexed CREATE FUNCTION entries with docs, sources and signatures."""
    by_name = {}
    by_signature = {}
    raw_lines = sql_text.splitlines(True)
    lines = [line.rstrip("\r\n") for line in raw_lines]
    fn_re = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+([a-z_][\w]*)\.([a-z_][\w]*)", re.I)
    offset = 0
    for i, line in enumerate(lines):
        m = fn_re.search(line)
        if not m:
            offset += len(raw_lines[i])
            continue
        block = []
        j = i - 1
        while j >= 0 and lines[j].lstrip().startswith("--"):
            block.append(lines[j].lstrip()[2:].strip())
            j -= 1
        doc = "\n".join(reversed(block)) if block else None
        schema = m.group(1).lower()
        name = m.group(2).lower()
        source = {"path": _source_path(path), "line": i + 1}
        signature = _entry_signature(sql_text, offset + m.end(), name)
        entry = {"doc": doc, "source": source, "signature": signature}
        by_name.setdefault(("function", schema, name), []).append(entry)
        if signature:
            by_signature.setdefault(("function", schema, signature), []).append(entry)
        offset += len(raw_lines[i])
    return {"by_name": by_name, "by_signature": by_signature}


def _merge_index(into, indexed):
    for bucket in ("by_name", "by_signature"):
        for key, entries in indexed.get(bucket, {}).items():
            into[bucket].setdefault(key, []).extend(entries)


def _node_signature_key(node):
    signature = node.get("props", {}).get("signature")
    if not signature:
        args = node.get("id", "").partition("(")[2].rpartition(")")[0]
        signature = "%s(%s)" % (node["label"], args)
    return ("function", node["schema"].lower(), re.sub(r"\s+", " ", signature.strip()).lower())


def _is_stub_doc(doc):
    if not doc:
        return False
    low = doc.lower()
    return "forward declarations" in low or "minimal stubs" in low


def _best_doc(entries):
    docs = [entry.get("doc") for entry in entries if entry.get("doc")]
    if not docs:
        return None
    non_stub = [doc for doc in docs if not _is_stub_doc(doc)]
    return (non_stub or docs)[-1]


def attach_sql_docs(nodes, sql_paths):
    idx = {"by_name": {}, "by_signature": {}}
    for path in sql_paths:
        try:
            with open(path, encoding="utf-8") as f:
                _merge_index(idx, _index_definitions(f.read(), path))
        except (OSError, UnicodeDecodeError):
            continue
    for n in nodes:
        if n["kind"] == "function":
            name_key = ("function", n["schema"].lower(), n["label"].lower())
            entries = idx["by_signature"].get(_node_signature_key(n)) or idx["by_name"].get(name_key)
            if entries:
                sources = [entry["source"] for entry in entries if entry.get("source")]
                if sources:
                    n.setdefault("props", {})["sources"] = sources
                    if len(sources) == 1:
                        n["props"]["source"] = sources[0]
                if not n.get("doc"):
                    doc = _best_doc(entries)
                    if doc:
                        n["doc"] = doc
    return nodes
