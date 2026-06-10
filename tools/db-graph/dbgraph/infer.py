"""Infer RPC->table reads/writes edges by regex over function bodies. Resolution is against the
known table set; matches are tagged with confidence; dynamic SQL is flagged, never guessed."""
import re

_READ = re.compile(r"\b(?:from|join)\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)", re.I)
_WRITE = re.compile(r"\b(?:insert\s+into|update|delete\s+from)\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)", re.I)
_DYNAMIC = re.compile(r"\bexecute\b.*\bformat\s*\(", re.I | re.S)


def _resolve(ident, tables):
    """Return (table_id, confidence) or (None, None). tables = set of 'schema.name'."""
    ident = ident.lower()
    if ident in tables:
        return ident, "high"
    bare = ident.split(".")[-1]
    cands = sorted(t for t in tables if t.split(".")[-1] == bare)  # sorted => deterministic across runs
    if ("public." + bare) in tables:
        return "public." + bare, "high"
    if len(cands) == 1:
        return cands[0], "medium"
    if len(cands) > 1:
        return cands[0], "low"
    return None, None


def infer_rpc_table_edges(functions, tables):
    edges = []
    flags = {}  # (schema, name) -> dynamic_sql bool
    best = {}   # (fid, table, kind) -> (confidence_rank, edge)
    rank = {"high": 3, "medium": 2, "low": 1}
    for f in functions:
        fid = "%s.%s(%s)" % (f["schema"], f["name"], f.get("args", ""))
        body = f.get("body", "") or ""
        flags[(f["schema"], f["name"])] = bool(_DYNAMIC.search(body))
        for kind, rx in (("reads", _READ), ("writes", _WRITE)):
            for m in rx.finditer(body):
                tid, conf = _resolve(m.group(1), tables)
                if not tid:
                    continue
                key = (fid, tid, kind)
                if key in best and rank[best[key][0]] >= rank[conf]:
                    continue
                ev = body[max(0, m.start()):m.end()].strip()
                best[key] = (conf, {"source": fid, "target": tid, "kind": kind,
                                    "props": {"inference": {"method": "regex", "confidence": conf, "evidence": ev}}})
    for _conf, edge in best.values():
        edges.append(edge)
    return edges, flags
