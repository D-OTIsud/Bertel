"""One-shot merge of the 2026-06-10 live delta into db-graph-out/catalog_extra.json:
adds the 'partitions' child->parent map and the 3 storage.objects policies (with the
'permissive' flag) without re-running the full extract. Future full runs of
db_supplement_extract.sql produce all of this directly; this script is then obsolete."""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "db-graph-out", "catalog_extra.json")

REF_CODE = ("mood menu_category dietary_tag social_network price_unit meeting_equipment "
            "opening_schedule_type demand_subtopic allergen cuisine_type iti_practice demand_topic "
            "accommodation_type transport_type tourism_type season_type booking_status promotion_type "
            "activity_type partnership_type assistance_type destination_type document_type insurance_type "
            "feedback_type event_type package_type membership_campaign incident_category room_type "
            "view_type amenity_type membership_tier environment_tag amenity_family media_tag weekday "
            "language_level price_kind other contact_kind media_type payment_method client_type "
            "service_type").split()
OBJECT_VERSION = "default 2026_05 2026_03 2026_04".split()
AUDIT_LOG = "2026_07 2026_08 2026_06 2026_03 2026_04 default 2026_05".split()

PARTITIONS = (
    [{"child": "public.ref_code_%s" % s, "parent": "public.ref_code"} for s in REF_CODE]
    + [{"child": "public.object_version_%s" % s, "parent": "public.object_version"} for s in OBJECT_VERSION]
    + [{"child": "audit.audit_log_%s" % s, "parent": "audit.audit_log"} for s in AUDIT_LOG]
)

STORAGE_POLICIES = [
    {"schema": "storage", "table": "objects", "name": "media_no_anon_write", "cmd": "ALL",
     "roles": ["anon", "authenticated"], "qual": "(bucket_id <> 'media'::text)",
     "with_check": "(bucket_id <> 'media'::text)", "permissive": "RESTRICTIVE"},
    {"schema": "storage", "table": "objects", "name": "media_public_read", "cmd": "SELECT",
     "roles": ["public"], "qual": "(bucket_id = 'media'::text)",
     "with_check": None, "permissive": "PERMISSIVE"},
    {"schema": "storage", "table": "objects", "name": "media_service_role_write", "cmd": "ALL",
     "roles": ["service_role"], "qual": "(bucket_id = 'media'::text)",
     "with_check": "(bucket_id = 'media'::text)", "permissive": "PERMISSIVE"},
]


def main():
    with open(OUT, encoding="utf-8") as f:
        extra = json.load(f)
    extra["partitions"] = PARTITIONS
    existing = {(p["schema"], p["table"], p["name"]) for p in extra["policies"]}
    added = [p for p in STORAGE_POLICIES if (p["schema"], p["table"], p["name"]) not in existing]
    extra["policies"] += added
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(extra, f, ensure_ascii=False, indent=1)
    print("merged: %d partitions, %d storage policies added (total policies %d)" % (
        len(PARTITIONS), len(added), len(extra["policies"])))


if __name__ == "__main__":
    main()
