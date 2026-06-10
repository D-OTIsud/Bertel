"""Attach the preceding `--` comment block from the .sql files to function/policy nodes whose
catalog comment is empty (tbls/catalog only sees COMMENT ON, not the `--` headers)."""
import re


def _index_definitions(sql_text):
    """Return {('function', schema, name): doc} from preceding `--` blocks for CREATE FUNCTION."""
    out = {}
    lines = sql_text.splitlines()
    fn_re = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+([a-z_][\w]*)\.([a-z_][\w]*)", re.I)
    for i, line in enumerate(lines):
        m = fn_re.search(line)
        if not m:
            continue
        block = []
        j = i - 1
        while j >= 0 and lines[j].lstrip().startswith("--"):
            block.append(lines[j].lstrip()[2:].strip())
            j -= 1
        if block:
            out[("function", m.group(1).lower(), m.group(2).lower())] = "\n".join(reversed(block))
    return out


def attach_sql_docs(nodes, sql_paths):
    idx = {}
    for path in sql_paths:
        try:
            with open(path, encoding="utf-8") as f:
                idx.update(_index_definitions(f.read()))
        except (OSError, UnicodeDecodeError):
            continue
    for n in nodes:
        if n.get("doc"):
            continue
        if n["kind"] == "function":
            key = ("function", n["schema"].lower(), n["label"].lower())
            if key in idx:
                n["doc"] = idx[key]
    return nodes
