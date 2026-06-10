"""Tag a node with a domain, by schema + label prefix. One rule list; first match wins."""

_FACET = ("object_iti", "object_fma", "object_act", "object_room_type", "object_meeting_room", "object_menu")


def classify(node):
    s, label, kind = node.get("schema"), (node.get("label") or ""), node.get("kind")
    if kind in ("trigger", "policy"):
        return kind
    if s == "audit":
        return "audit"
    if s == "crm":
        return "ref-lookups" if label.startswith("ref_") else "object-core"
    if s in ("api", "internal") and kind == "function":
        return "api"
    if label == "object":
        return "object-core"
    if any(label.startswith(p) for p in _FACET):
        return "object-facets"
    if label.startswith("opening_"):
        return "opening"
    if label.startswith(("object_price", "object_discount", "object_capacity")):
        return "pricing"
    if label.startswith(("media", "object_media")):
        return "media"
    if label.startswith(("object_sustainability", "ref_sustainability")):
        return "sustainability"
    if label.startswith(("actor", "object_org_link", "object_membership", "org_")):
        return "actor-org"
    if label.startswith(("user_", "app_user", "user_permission")):
        return "rbac"
    if label.startswith(("ui_", "branding")):
        return "branding"
    if label.startswith("ref_"):
        return "ref-lookups"
    if label.startswith("object_"):
        return "object-core"
    return "other"
