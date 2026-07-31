#!/usr/bin/env python3
"""Build the feed-field coverage ledger for the regional Tourinsoft snapshot.

This ledger deliberately describes observed source coverage only. It does not turn
an observed public syndication property into an approved Tourinsoft write mapping.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


FIELDNAMES = [
    "feed",
    "path",
    "scope",
    "collection",
    "name",
    "edm_type",
    "declared",
    "observed",
    "observed_count",
    "non_empty_count",
    "empty_count",
    "coverage_pct",
    "present_in_feed_count",
    "reuse_class",
    "coverage_status",
    "mapping_status",
    "evidence",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--contract-dir",
        default="docs/integrations/tourinsoft/reunion-regional-v1",
    )
    args = parser.parse_args()

    contract_dir = Path.cwd() / args.contract_dir
    union_rows = json.loads((contract_dir / "field-union.json").read_text(encoding="utf-8"))
    union_by_path = {row["path"]: row for row in union_rows}

    with (contract_dir / "field-inventory.csv").open(encoding="utf-8", newline="") as source:
        inventory = list(csv.DictReader(source))

    coverage = []
    for row in inventory:
        collection = row["collection"] or "object"
        path = f"{collection}.{row['name']}"
        union = union_by_path.get(path)
        if union is None:
            raise SystemExit(f"Inventory path absent from field-union.json: {path}")
        coverage.append({
            "feed": row["feed"],
            "path": path,
            "scope": row["scope"],
            "collection": row["collection"],
            "name": row["name"],
            "edm_type": row["type"],
            "declared": row["declared"],
            "observed": row["observed"],
            "observed_count": row["count"],
            "non_empty_count": row["non_empty"],
            "empty_count": row["empty"],
            "coverage_pct": row["coverage_pct"],
            "present_in_feed_count": union["feed_count"],
            "reuse_class": union["reuse_class"],
            "coverage_status": "observed_source" if row["observed"].casefold() == "true" else "declared_unobserved",
            "mapping_status": "unclassified",
            "evidence": f"source-schemas/{row['feed']}.json",
        })

    output_path = contract_dir / "field-coverage.csv"
    with output_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(coverage)

    print(
        f"Tourinsoft regional coverage built: {len(coverage)} feed-field occurrences, "
        f"{len(union_rows)} union paths -> {output_path}"
    )


if __name__ == "__main__":
    main()
