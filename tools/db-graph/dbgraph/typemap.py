"""Object-type-centric views of the unified graph.

Three agent artifacts, all *computed* from the graph (so they refresh with every build, never
hand-rot):

  OBJECT_TYPES.md       — one section per `object_type` enum value: label, editor archetype,
                          type-specific facet tables (ref_facet_applicability), and the common
                          object-attached tables every type inherits.
  FUNCTION_ACCESS.md    — one row per function: output (returns), how to reach it (PostgREST RPC /
                          internal / trigger / Next.js route), and the set of object types whose
                          data it touches (derived: reads/writes -> facet applicability + the
                          object/common-child membership).
  SURFACE_COVERAGE.md   — completeness check: every object-attached table vs. whether a consumer
                          (getter) RPC is detected reading it (the §101/§103 invariant). Gaps are
                          flagged; the regex-inference false-negative caveat is stated inline.

The object_type label + archetype come from tools/db-graph/object_type_meta.json (mirror of the
frontend archetypes.ts). Everything else comes from the live graph.
"""
from collections import defaultdict

# Next.js privileged server routes that wrap a SQL entry point (the rest of the DB surface is reached
# by direct PostgREST rpc/ calls from supabase-js). Keyed by function label.
_ROUTE_WRAPPERS = {
    "rpc_delete_object": "POST /api/objects/delete",
    "rpc_erase_actor_pii": "POST /api/rgpd/erase",
    "rpc_gdpr_erase_actor": "POST /api/rgpd/erase",
    "rpc_gdpr_erase_subject": "POST /api/rgpd/erase",
}

# Object-keyed tables that are NOT editor-authorable content: system ledgers / workflow / org rows
# written by their own subsystem, never authored per-object in the editor. They are object-attached
# structurally (FK to object) but are out of scope for the §101/§103 "emitted by a getter" invariant.
_SYSTEM_LEDGER = {
    "public.promotion_usage", "public.audit_session", "public.publication_object",
    "public.promotion_object", "public.pending_change", "public.incident_report",
    "public.org_config", "public.org_permission", "public.user_org_membership",
}


def _doc_first_line(doc):
    """First meaningful line of a function comment — skip banner/separator lines (===, ---, ***)."""
    if not doc:
        return None
    for raw in doc.split("\n"):
        line = raw.strip().strip("=-*# ").strip()
        if line and any(c.isalpha() for c in line):
            return line
    return None


def _by(nodes, kind):
    return [n for n in nodes if n["kind"] == kind]


def _object_type_values(g):
    for n in g["nodes"]:
        if n["kind"] == "enum" and n["label"] == "object_type":
            return list(n["props"].get("values", []))
    return []


def _fk_children_of(g, parent_id):
    """Table ids with a direct FK to parent_id."""
    return {e["source"] for e in g["edges"] if e["kind"] == "fk" and e["target"] == parent_id}


def _applies_to(g):
    """object_type code -> sorted list of facet table ids that apply to it."""
    out = defaultdict(set)
    for e in g["edges"]:
        if e["kind"] == "applies_to":
            out[e["props"]["object_type"]].add(e["target"])
    return {k: sorted(v) for k, v in out.items()}


def _facet_tables(g):
    """All type-specific facet table ids (union of applies_to targets)."""
    return {e["target"] for e in g["edges"] if e["kind"] == "applies_to"}


def _object_attached(g):
    """Classify object-attached tables.

    Returns (object_keyed, place_keyed, facet_subtrees) where:
      object_keyed  = table ids with a direct FK to public.object
      place_keyed   = table ids with a direct FK to public.object_place (sub-place keyed)
      facet_subtrees= {facet_table_id: set(descendant table ids reached via FK chains not passing
                       back through public.object)} for each type-specific facet table.
    """
    object_keyed = _fk_children_of(g, "public.object")
    place_keyed = _fk_children_of(g, "public.object_place")
    facets = _facet_tables(g) & object_keyed
    # FK adjacency child->parent restricted to public tables, excluding edges into public.object
    children_of = defaultdict(set)
    for e in g["edges"]:
        if e["kind"] == "fk" and e["target"] != "public.object":
            children_of[e["target"]].add(e["source"])
    subtrees = {}
    for f in facets:
        seen, stack = set(), [f]
        while stack:
            cur = stack.pop()
            for ch in children_of.get(cur, ()):
                if ch not in seen and ch != f:
                    seen.add(ch)
                    stack.append(ch)
        subtrees[f] = seen
    return object_keyed, place_keyed, subtrees


def _domain_of(g):
    return {n["id"]: n.get("domain") for n in g["nodes"]}


def _label_of(g):
    return {n["id"]: n.get("label") for n in g["nodes"]}


def _reads_writes(g):
    reads = defaultdict(set)   # fid -> {table_id}
    writes = defaultdict(set)
    for e in g["edges"]:
        if e["kind"] == "reads":
            reads[e["source"]].add(e["target"])
        elif e["kind"] == "writes":
            writes[e["source"]].add(e["target"])
    return reads, writes


def _types_for_table(table_id, applies_rev, common_set):
    """Which object types a table belongs to. ('ALL',) for object/common children; a tuple of
    type codes for a type-specific facet (or its subtree); () if not object-scoped."""
    if table_id == "public.object" or table_id in common_set:
        return ("ALL",)
    if table_id in applies_rev:
        return tuple(sorted(applies_rev[table_id]))
    return ()


# ─────────────────────────────────────────────────────────────────────────────
# OBJECT_TYPES.md
# ─────────────────────────────────────────────────────────────────────────────
def write_object_types_md(g, meta):
    values = _object_type_values(g)
    applies = _applies_to(g)
    object_keyed, place_keyed, subtrees = _object_attached(g)
    facets = set(subtrees)
    label_of = _label_of(g)
    dom = _domain_of(g)
    types_meta = meta.get("types", {})
    arch_meta = meta.get("_archetypes", {})

    # common = object-keyed children that are neither a facet nor inside a facet subtree
    facet_subtree_union = set().union(*subtrees.values()) if subtrees else set()
    common = sorted(t for t in object_keyed if t not in facets and t not in facet_subtree_union)

    out = ["# Object types — the type map",
           "",
           "_One section per `object_type` enum value. Label + editor archetype mirror "
           "`bertel-tourism-ui/src/features/object-editor/archetypes.ts`; facet applicability and "
           "the table sets are computed live from the graph. ‘Common tables’ apply to **every** "
           "type; only the type-specific facet tables are gated by `ref_facet_applicability` "
           "(enforced by `trg_assert_facet_applicable`)._",
           ""]

    # summary table
    out.append("## Summary")
    out.append("")
    out.append("| Code | Label | Archetype | Type-specific facet tables |")
    out.append("|------|-------|-----------|----------------------------|")
    for code in values:
        tm = types_meta.get(code, {})
        arch = tm.get("archetype")
        arch_name = arch_meta.get(arch, {}).get("codeName", arch) if arch else "— (unsupported in editor)"
        facet_list = applies.get(code, [])
        facet_str = ", ".join("`%s`" % label_of.get(f, f) for f in facet_list) or "_(none — generic modules only)_"
        out.append("| `%s` | %s | %s | %s |" % (code, tm.get("label", ""), arch_name, facet_str))
    out.append("")

    # common tables (shared by all types)
    out.append("## Common object-attached tables (every type carries these)")
    out.append("")
    out.append("_Direct FK children of `object` that are **not** type-specific facets — the shared "
               "object model, **not gated** by `ref_facet_applicability`. Grouped by domain. Note: a "
               "few are semantically type-leaning but NOT DB-enforced (e.g. `object_stay_policy` ≈ HEB "
               "check-in/out, `object_cuisine_type` ≈ RES, `object_group_policy`/`object_pet_policy` ≈ "
               "HEB) — any type may legally carry a row. The list also includes structural object-keyed "
               "rows that are not editor content (CRM, promotion, publication, audit, org membership)._")
    out.append("")
    by_dom = defaultdict(list)
    for t in common:
        by_dom[dom.get(t) or "other"].append(label_of.get(t, t))
    for d in sorted(by_dom):
        out.append("- **%s**: %s" % (d, ", ".join("`%s`" % x for x in sorted(by_dom[d]))))
    if place_keyed:
        out.append("- **place-keyed** (sub-place `object_place` children, present when an object has "
                   "sub-places): %s" % ", ".join("`%s`" % label_of.get(t, t) for t in sorted(place_keyed)))
    out.append("")

    # per-type detail
    out.append("## Per-type detail")
    out.append("")
    for code in values:
        tm = types_meta.get(code, {})
        arch = tm.get("archetype")
        out.append("### `%s` — %s" % (code, tm.get("label", "")))
        if arch:
            am = arch_meta.get(arch, {})
            out.append("- **Editor archetype:** `%s` (%s) — _%s_" % (arch, am.get("codeName", arch), am.get("family", "")))
        else:
            out.append("- **Editor archetype:** none — ORG is deliberately unsupported in the object "
                       "editor (managed via /team). Renders an explicit unsupported-type panel.")
        facet_list = applies.get(code, [])
        if facet_list:
            for f in facet_list:
                sub = sorted(subtrees.get(f, set()))
                sub_str = (" → sub-tables: " + ", ".join("`%s`" % label_of.get(s, s) for s in sub)) if sub else ""
                out.append("- **Facet** `%s`%s" % (label_of.get(f, f), sub_str))
        else:
            out.append("- **Facets:** none — uses only the common object model (generic modules).")
        out.append("- Inherits the %d common object-attached tables listed above." % len(common))
        out.append("")
    return "\n".join(out)


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION_ACCESS.md
# ─────────────────────────────────────────────────────────────────────────────
def _access_path(n):
    schema, label, returns = n["schema"], n["label"], (n["props"].get("returns") or "")
    if label in _ROUTE_WRAPPERS:
        return "Next.js route — `%s` (wraps `%s.%s`, runs as the caller)" % (_ROUTE_WRAPPERS[label], schema, label)
    if returns.strip().lower() == "trigger":
        return "trigger function — fires from a table trigger, not callable directly"
    if schema == "api":
        return "PostgREST RPC — `POST /rest/v1/rpc/%s`" % label
    if schema == "internal":
        return "internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed"
    if schema == "public":
        return "PostgREST RPC — `POST /rest/v1/rpc/%s` (public schema, if exposed) / SQL-callable" % label
    if schema in ("audit", "crm"):
        return "%s schema — SQL-callable; reached via api/internal wrappers, not PostgREST" % schema
    return "%s.%s" % (schema, label)


def _types_served(fid, reads, writes, applies_rev, common_set):
    tables = reads.get(fid, set()) | writes.get(fid, set())
    if not tables:
        return None  # no detected table touch
    type_set, touches_all = set(), False
    for t in tables:
        tt = _types_for_table(t, applies_rev, common_set)
        if tt == ("ALL",):
            touches_all = True
        else:
            type_set.update(tt)
    if touches_all:
        return "ALL"
    if type_set:
        return sorted(type_set)
    return []  # touches only non-object-scoped tables (ref/rbac/admin/infra)


def write_function_access_md(g, meta):
    fns = sorted(_by(g["nodes"], "function"), key=lambda n: (n["schema"], n["label"]))
    reads, writes = _reads_writes(g)
    object_keyed, place_keyed, subtrees = _object_attached(g)
    facets = set(subtrees)
    facet_subtree_union = set().union(*subtrees.values()) if subtrees else set()
    common_set = {t for t in object_keyed if t not in facets and t not in facet_subtree_union} | place_keyed
    # reverse applies_to: facet table id -> [object types]; subtree tables inherit their facet's types
    applies = _applies_to(g)
    applies_rev = defaultdict(set)
    for code, fl in applies.items():
        for f in fl:
            applies_rev[f].add(code)
            for s in subtrees.get(f, set()):
                applies_rev[s].add(code)

    out = ["# Functions — output, access path & object types served",
           "",
           "_For every function: what it **returns** (output), **how to reach it**, and **which "
           "object types** its data touches. Object types are derived from detected reads/writes → "
           "facet applicability + object/common-child membership; `ALL` = touches `object` or a "
           "common child (so serves every type). `—` under types = not object-scoped (ref / rbac / "
           "admin / infra) or no table touch detected. Reads/writes are regex-inferred (false "
           "negatives possible — see SURFACE_COVERAGE.md)._",
           ""]
    by_schema = defaultdict(list)
    for n in fns:
        by_schema[n["schema"]].append(n)
    for schema in sorted(by_schema):
        out.append("## schema `%s`" % schema)
        out.append("")
        for n in by_schema[schema]:
            sig = n["props"].get("signature", n["label"])
            returns = n["props"].get("returns", "")
            flags = []
            if n["props"].get("security_definer"):
                flags.append("DEFINER")
            if n["props"].get("dynamic_sql"):
                flags.append("dyn-SQL")
            flag_str = (" _(%s)_" % ", ".join(flags)) if flags else ""
            served = _types_served(n["id"], reads, writes, applies_rev, common_set)
            if served == "ALL":
                served_str = "**all object types**"
            elif isinstance(served, list) and served:
                served_str = ", ".join("`%s`" % c for c in served)
            else:
                served_str = "—"
            out.append("### `%s.%s`%s" % (schema, sig, flag_str))
            out.append("- **returns:** `%s`" % returns)
            out.append("- **access:** %s" % _access_path(n))
            out.append("- **object types served:** %s" % served_str)
            first = _doc_first_line(n["doc"])
            if first:
                out.append("- _%s_" % first)
            out.append("")
    return "\n".join(out)


# ─────────────────────────────────────────────────────────────────────────────
# SURFACE_COVERAGE.md
# ─────────────────────────────────────────────────────────────────────────────
def _consumer_functions(g):
    """Functions that look like read/consumer entry points (api/public getters + list/get/search)."""
    out = set()
    for n in g["nodes"]:
        if n["kind"] != "function":
            continue
        if n["schema"] in ("api", "internal", "public"):
            out.add(n["id"])
    return out


def write_surface_coverage_md(g, meta):
    object_keyed, place_keyed, subtrees = _object_attached(g)
    label_of = _label_of(g)
    dom = _domain_of(g)
    partitions = g.get("partitions", {})  # child id -> parent id
    reads, _writes = _reads_writes(g)
    consumers = _consumer_functions(g)
    # table -> set of consumer fids reading it
    readers = defaultdict(set)
    for fid, tables in reads.items():
        if fid in consumers:
            for t in tables:
                readers[t].add(fid)

    raw_attached = object_keyed | place_keyed | (set().union(*subtrees.values()) if subtrees else set())
    # drop partition children — their coverage rolls up to the parent (which is also in the set)
    all_attached = sorted(t for t in raw_attached if t not in partitions)

    def is_covered(t):
        return bool(readers.get(t))

    out = ["# Surface coverage — every authorable table vs. a consumer RPC",
           "",
           "_The §101/§103 invariant: any **authorable** object-attached table MUST be emitted by a "
           "consumer RPC (a getter), not reachable only by direct PostgREST. This checks each "
           "object-attached table for a detected `reads` edge from an api/internal/public function. "
           "`object_version_*` partitions are rolled up to `object_version`; system ledgers "
           "(promotion/publication/audit/org/CRM-workflow rows written by their own subsystem, not "
           "authored per-object in the editor) are reported separately._",
           "",
           "> ⚠️ **Reads are regex-inferred — false negatives exist** (e.g. `save_object_places` "
           "writes `object_zone` but the edge wasn't detected). A table flagged ‘no consumer "
           "detected’ is a **candidate** gap to verify in the function body or live, not a proven "
           "one. Confirmed exposure gaps belong in the decision log (§101/§103).",
           ""]
    authorable = [t for t in all_attached if t not in _SYSTEM_LEDGER]
    ledgers = [t for t in all_attached if t in _SYSTEM_LEDGER]
    auth_covered = [t for t in authorable if is_covered(t)]
    auth_gaps = [t for t in authorable if not is_covered(t)]

    out.append("## Summary")
    out.append("- authorable object-attached tables: **%d** — emitted by a detected consumer read: "
               "**%d** — candidate gaps: **%d**" % (len(authorable), len(auth_covered), len(auth_gaps)))
    out.append("- system-ledger object-attached tables (out of §101 scope): **%d** (%s)" % (
        len(ledgers), ", ".join("`%s`" % label_of.get(t, t) for t in ledgers) or "none"))
    out.append("")
    out.append("## Candidate authorable gaps (verify before trusting)")
    out.append("")
    if auth_gaps:
        by_dom = defaultdict(list)
        for t in auth_gaps:
            by_dom[dom.get(t) or "other"].append(label_of.get(t, t))
        for d in sorted(by_dom):
            out.append("- **%s**: %s" % (d, ", ".join("`%s`" % x for x in sorted(by_dom[d]))))
    else:
        out.append("_None — every authorable object-attached table has at least one detected "
                   "consumer read. The §101/§103 invariant holds across the live surface._")
    out.append("")
    out.append("## Covered authorable tables")
    out.append("")
    for t in auth_covered:
        names = sorted({r.split(".")[1].split("(")[0] if "." in r else r for r in readers[t]})
        shown = ", ".join("`%s`" % x for x in names[:6]) + (" …" if len(names) > 6 else "")
        out.append("- `%s` ← %s" % (label_of.get(t, t), shown))
    out.append("")
    return "\n".join(out)
