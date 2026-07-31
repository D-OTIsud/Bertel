#!/usr/bin/env python3
"""Validate the checked-in six-feed Tourinsoft Reunion evidence snapshot."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

from regional_allowlist import build_extension_allowlist


EXPECTED_FEEDS = {
    "decouverte",
    "hebergement",
    "information_service",
    "loisir_plein_air",
    "restauration",
    "transport",
}
EXPECTED_PROFILES = {
    "tourinsoft_reunion_decouverte_v1",
    "tourinsoft_reunion_hebergement_v1",
    "tourinsoft_reunion_information_service_v1",
    "tourinsoft_reunion_loisir_plein_air_v1",
    "tourinsoft_reunion_restauration_v1",
    "tourinsoft_reunion_transport_v1",
}
EXPECTED_UNION_PATHS = 683
ALLOWED_REUSE_CLASSES = {"all_feeds", "shared", "feed_specific"}
ALLOWED_MAPPING_STATUSES = {"unclassified", "approved", "pending_crt", "excluded"}


def load_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"cannot read {path}: {exc}")
        return None


def load_csv(path: Path, errors: list[str]) -> list[dict[str, str]]:
    try:
        with path.open(encoding="utf-8", newline="") as source:
            return list(csv.DictReader(source))
    except (OSError, csv.Error) as exc:
        errors.append(f"cannot read {path}: {exc}")
        return []


def occurrence_key(row: dict[str, str]) -> tuple[str, str, str, str]:
    return row["feed"], row["scope"], row["collection"], row["name"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--contract-dir",
        default="docs/integrations/tourinsoft/reunion-regional-v1",
    )
    parser.add_argument(
        "--migration",
        default="supabase/migrations/20260731041455_tourinsoft_reunion_regional_v1.sql",
    )
    args = parser.parse_args()

    contract_dir = Path.cwd() / args.contract_dir
    errors: list[str] = []
    catalog = load_json(contract_dir / "feeds.json", errors)
    summary = load_json(contract_dir / "feed-summary.json", errors)
    union_rows = load_json(contract_dir / "field-union.json", errors)
    inventory = load_csv(contract_dir / "field-inventory.csv", errors)
    coverage = load_csv(contract_dir / "field-coverage.csv", errors)
    extension_allowlist = load_json(contract_dir / "extension-allowlist.json", errors)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        raise SystemExit(1)

    if not isinstance(catalog, list):
        errors.append("feeds.json must contain a JSON array")
        catalog = []
    catalog_slugs = [str(row.get("slug", "")) for row in catalog]
    if len(catalog) != 6:
        errors.append(f"catalog must contain 6 feeds, found {len(catalog)}")
    if set(catalog_slugs) != EXPECTED_FEEDS or len(catalog_slugs) != len(set(catalog_slugs)):
        errors.append(f"catalog slugs differ from the six expected profiles: {catalog_slugs}")
    ids = [str(row.get("id", "")).casefold() for row in catalog]
    urls = [str(row.get("url", "")) for row in catalog]
    if len(ids) != len(set(ids)) or any(not value for value in ids):
        errors.append("catalog feed identifiers must be non-empty and unique")
    if len(urls) != len(set(urls)) or any(not value.startswith("https://") for value in urls):
        errors.append("catalog feed URLs must be unique HTTPS URLs")
    for row in catalog:
        if str(row.get("id", "")).casefold() not in str(row.get("url", "")).casefold():
            errors.append(f"catalog URL does not contain its feed id: {row.get('slug')}")

    schema_occurrences: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    computed_union: dict[str, set[str]] = {}
    object_total = 0
    schema_by_slug: dict[str, dict[str, Any]] = {}
    for feed in catalog:
        slug = str(feed.get("slug", ""))
        schema = load_json(contract_dir / "source-schemas" / f"{slug}.json", errors)
        if not isinstance(schema, dict):
            continue
        schema_by_slug[slug] = schema
        for key, source_key in (("slug", "slug"), ("name", "name"), ("id", "id")):
            if str(schema.get(key, "")).casefold() != str(feed.get(source_key, "")).casefold():
                errors.append(f"{slug} schema {key} does not match feeds.json")
        if str(schema.get("source_url", "")) != str(feed.get("url", "")):
            errors.append(f"{slug} schema source_url does not match feeds.json")
        object_total += int(schema.get("object_count", 0))

        scoped = [("object", "", field) for field in schema.get("object_fields", [])]
        for collection, relation in schema.get("relations", {}).items():
            scoped.extend(("relation", collection, field) for field in relation.get("fields", []))
        for scope, collection, field in scoped:
            name = str(field.get("name", ""))
            key = (slug, scope, collection, name)
            if key in schema_occurrences:
                errors.append(f"duplicate schema field occurrence: {key}")
            schema_occurrences[key] = field
            path = f"{collection or 'object'}.{name}"
            computed_union.setdefault(path, set()).add(slug)

    if not isinstance(summary, dict):
        errors.append("feed-summary.json must contain a JSON object")
        summary = {}
    if summary.get("feed_count") != 6:
        errors.append(f"feed-summary feed_count must be 6, found {summary.get('feed_count')}")
    if summary.get("total_objects") != object_total:
        errors.append(
            f"feed-summary total_objects {summary.get('total_objects')} does not match schemas {object_total}"
        )
    summary_slugs = {str(row.get("slug", "")) for row in summary.get("feeds", [])}
    if summary_slugs != EXPECTED_FEEDS:
        errors.append("feed-summary does not account for the six catalog feeds")
    for row in summary.get("feeds", []):
        slug = str(row.get("slug", ""))
        schema = schema_by_slug.get(slug)
        if schema is None:
            continue
        expected_summary = {
            "object_count": int(schema.get("object_count", 0)),
            "object_field_count": len(schema.get("object_fields", [])),
            "relation_count": len(schema.get("relations", {})),
            "relation_field_count": sum(
                len(relation.get("fields", [])) for relation in schema.get("relations", {}).values()
            ),
        }
        for key, expected in expected_summary.items():
            if row.get(key) != expected:
                errors.append(f"feed-summary {key} mismatch for {slug}")

    if not isinstance(union_rows, list):
        errors.append("field-union.json must contain a JSON array")
        union_rows = []
    if len(union_rows) != EXPECTED_UNION_PATHS:
        errors.append(f"field union must contain {EXPECTED_UNION_PATHS} paths, found {len(union_rows)}")
    union_by_path: dict[str, dict[str, Any]] = {}
    for row in union_rows:
        path = str(row.get("path", ""))
        if path in union_by_path:
            errors.append(f"duplicate union path: {path}")
        union_by_path[path] = row
        expected_feeds = computed_union.get(path, set())
        actual_feeds = set(row.get("feeds", []))
        if actual_feeds != expected_feeds:
            errors.append(f"union feed membership mismatch: {path}")
        feed_count = len(actual_feeds)
        expected_class = "all_feeds" if feed_count == 6 else "shared" if feed_count > 1 else "feed_specific"
        if row.get("feed_count") != feed_count or row.get("reuse_class") != expected_class:
            errors.append(f"union reuse metadata mismatch: {path}")
        if row.get("reuse_class") not in ALLOWED_REUSE_CLASSES:
            errors.append(f"invalid reuse_class for {path}: {row.get('reuse_class')}")
    if set(union_by_path) != set(computed_union):
        errors.append("field-union paths do not exactly match the six source schemas")
    if summary.get("union_field_count") != len(union_rows):
        errors.append("feed-summary union_field_count does not match field-union.json")
    computed_reuse_counts = {
        "all_feed_field_count": sum(row.get("reuse_class") == "all_feeds" for row in union_rows),
        "shared_field_count": sum(row.get("reuse_class") == "shared" for row in union_rows),
        "feed_specific_field_count": sum(row.get("reuse_class") == "feed_specific" for row in union_rows),
    }
    for key, expected in computed_reuse_counts.items():
        if summary.get(key) != expected:
            errors.append(f"feed-summary {key} does not match field-union.json")

    inventory_by_key: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for row in inventory:
        key = occurrence_key(row)
        if key in inventory_by_key:
            errors.append(f"duplicate inventory occurrence: {key}")
        inventory_by_key[key] = row
        schema_field = schema_occurrences.get(key)
        if schema_field is None:
            errors.append(f"inventory occurrence absent from source schema: {key}")
            continue
        comparisons = {
            "type": "type",
            "declared": "declared",
            "observed": "observed",
            "count": "count",
            "non_empty": "non_empty",
            "empty": "empty",
            "coverage_pct": "coverage_pct",
        }
        for csv_key, schema_key in comparisons.items():
            if str(row.get(csv_key, "")) != str(schema_field.get(schema_key, "")):
                errors.append(f"inventory {csv_key} mismatch for {key}")
    if set(inventory_by_key) != set(schema_occurrences):
        errors.append("field-inventory.csv does not exactly account for all schema occurrences")

    coverage_by_key: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for row in coverage:
        key = occurrence_key(row)
        if key in coverage_by_key:
            errors.append(f"duplicate coverage occurrence: {key}")
        coverage_by_key[key] = row
        inventory_row = inventory_by_key.get(key)
        if inventory_row is None:
            errors.append(f"coverage occurrence absent from inventory: {key}")
            continue
        coverage_inventory_fields = {
            "edm_type": "type",
            "declared": "declared",
            "observed": "observed",
            "observed_count": "count",
            "non_empty_count": "non_empty",
            "empty_count": "empty",
            "coverage_pct": "coverage_pct",
        }
        for coverage_key, inventory_key in coverage_inventory_fields.items():
            if row.get(coverage_key) != inventory_row.get(inventory_key):
                errors.append(f"coverage {coverage_key} mismatch for {key}")
        path = f"{row['collection'] or 'object'}.{row['name']}"
        union = union_by_path.get(path)
        if row.get("path") != path or union is None:
            errors.append(f"coverage path mismatch for {key}")
            continue
        if row.get("reuse_class") != str(union.get("reuse_class")):
            errors.append(f"coverage reuse_class mismatch for {key}")
        if row.get("present_in_feed_count") != str(union.get("feed_count")):
            errors.append(f"coverage feed count mismatch for {key}")
        if row.get("coverage_status") not in {"observed_source", "declared_unobserved"}:
            errors.append(f"invalid coverage status for {key}: {row.get('coverage_status')}")
        if row.get("mapping_status") not in ALLOWED_MAPPING_STATUSES:
            errors.append(f"invalid mapping status for {key}: {row.get('mapping_status')}")
        if row.get("evidence") != f"source-schemas/{row['feed']}.json":
            errors.append(f"coverage evidence mismatch for {key}")
    if set(coverage_by_key) != set(inventory_by_key):
        errors.append("field-coverage.csv does not exactly account for every inventory row")

    # When a union-level write mapping is added, make its completeness part of this check.
    mapping_path = contract_dir / "field-mapping.csv"
    mappings: list[dict[str, str]] = []
    mapping_note = "no write mapping yet"
    if mapping_path.exists():
        mappings = load_csv(mapping_path, errors)
        mapped_paths: list[str] = []
        for row in mappings:
            path = row.get("path") or f"{row.get('tourinsoft_collection') or 'object'}.{row.get('tourinsoft_field', '')}"
            mapped_paths.append(path)
            status = row.get("review_status") or row.get("mapping_status")
            if status not in {"approved", "pending_crt", "excluded"}:
                errors.append(f"invalid write mapping status for {path}: {status}")
        if len(mapped_paths) != len(set(mapped_paths)):
            errors.append("field-mapping.csv contains duplicate union paths")
        if set(mapped_paths) != set(union_by_path):
            errors.append("field-mapping.csv must classify every union path exactly once")
        mapping_note = f"{len(mappings)} write mappings"

    if not isinstance(extension_allowlist, list):
        errors.append("extension-allowlist.json must contain a JSON array")
        extension_allowlist = []
    profiles = [str(entry.get("profile", "")) for entry in extension_allowlist]
    if set(profiles) != EXPECTED_PROFILES or len(profiles) != len(set(profiles)):
        errors.append(f"extension allowlist must contain the six exact profiles: {profiles}")
    for entry in extension_allowlist:
        paths = [str(path) for path in entry.get("paths", [])]
        canonical_keys = [str(path) for path in entry.get("canonical_keys", [])]
        if not paths or len(paths) != len(set(paths)) or paths != sorted(paths):
            errors.append(f"invalid extension paths for {entry.get('profile')}")
        if len(canonical_keys) != len(set(canonical_keys)) or canonical_keys != sorted(canonical_keys):
            errors.append(f"invalid canonical keys for {entry.get('profile')}")
    if mappings:
        expected_allowlist = build_extension_allowlist(mappings)
        if extension_allowlist != expected_allowlist:
            errors.append(
                "extension-allowlist.json is not derived exactly from field-mapping.csv "
                "(pending_crt plus approved match keys only)"
            )

    migration_path = Path.cwd() / args.migration
    try:
        migration_sql = migration_path.read_text(encoding="utf-8")
        if "$allowlist$" in migration_sql:
            errors.append("obsolete broad $allowlist$ payload remains in the migration")
        embedded_match = re.search(
            r"\$safe_allowlist\$(.*?)\$safe_allowlist\$::jsonb",
            migration_sql,
            re.DOTALL,
        )
        if embedded_match is None:
            errors.append(f"safe extension allowlist missing from {migration_path}")
        else:
            embedded_allowlist = json.loads(embedded_match.group(1))
            if embedded_allowlist != extension_allowlist:
                errors.append("migration $safe_allowlist$ differs from extension-allowlist.json")
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"cannot validate migration extension allowlist: {exc}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        raise SystemExit(1)
    print(
        "Tourinsoft regional evidence OK: "
        f"6 feeds, {object_total} objects, {len(union_rows)} union paths, "
        f"{len(inventory)} feed-field occurrences, {mapping_note}"
    )


if __name__ == "__main__":
    main()
