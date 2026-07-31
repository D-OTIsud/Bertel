#!/usr/bin/env python3
"""Build schema-only evidence for every configured Tourinsoft Reunion feed.

The public payloads are downloaded in memory. Only field names, types, cardinality,
coverage and controlled-reference samples are written to the repository; the source
objects themselves are never persisted.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


ATOM = "http://www.w3.org/2005/Atom"
META = "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"
DATA = "http://schemas.microsoft.com/ado/2007/08/dataservices"
EDM = "http://schemas.microsoft.com/ado/2008/09/edm"
NS = {"a": ATOM, "m": META, "d": DATA}
REFERENCE_FIELD_RE = re.compile(
    r"(^|\.)(ThesCode|ThesLibelle|ObjectTypeName|ObjectTypeFix|Code|Libelle)$",
    re.IGNORECASE,
)


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


@dataclass
class FieldStats:
    declared_type: str = ""
    count: int = 0
    empty: int = 0
    non_empty: int = 0
    types: Counter[str] = field(default_factory=Counter)
    reference_values: Counter[str] = field(default_factory=Counter)

    def add(self, name: str, value: str, edm_type: str, is_null: bool) -> None:
        self.count += 1
        self.types[edm_type] += 1
        if is_null or value == "":
            self.empty += 1
            return
        self.non_empty += 1
        if REFERENCE_FIELD_RE.search(name) and len(value) <= 200:
            self.reference_values[value] += 1

    def serialize(self, name: str) -> dict[str, object]:
        result: dict[str, object] = {
            "name": name,
            "type": ", ".join(sorted(self.types)) or self.declared_type,
            "declared": bool(self.declared_type),
            "observed": self.count > 0,
            "count": self.count,
            "non_empty": self.non_empty,
            "empty": self.empty,
            "coverage_pct": round(100 * self.non_empty / self.count, 1) if self.count else 0,
        }
        if self.reference_values:
            result["reference_values"] = [
                {"value": value, "count": count}
                for value, count in self.reference_values.most_common(100)
            ]
        return result


def flatten_property(node: ET.Element, prefix: str = "") -> Iterable[tuple[str, str, str, bool]]:
    name = f"{prefix}.{local(node.tag)}" if prefix else local(node.tag)
    children = [child for child in list(node) if child.tag.startswith("{" + DATA + "}")]
    if children:
        for child in children:
            yield from flatten_property(child, name)
        return
    yield (
        name,
        node.text or "",
        node.attrib.get("{" + META + "}type", "Edm.String"),
        node.attrib.get("{" + META + "}null") == "true",
    )


def direct_properties(entry: ET.Element) -> list[tuple[str, str, str, bool]]:
    properties = entry.find("a:content/m:properties", NS)
    if properties is None:
        return []
    values: list[tuple[str, str, str, bool]] = []
    for child in list(properties):
        values.extend(flatten_property(child))
    return values


def collect(stats: dict[str, FieldStats], properties: Iterable[tuple[str, str, str, bool]]) -> None:
    for name, value, edm_type, is_null in properties:
        stats[name].add(name, value, edm_type, is_null)


def fetch_xml(url: str) -> ET.Element:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/atom+xml, application/xml;q=0.9", "User-Agent": "Bertel-contract-audit/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return ET.fromstring(response.read())


def metadata_contract(metadata_root: ET.Element) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    """Return declared flattened root fields and relation fields from OData EDM."""
    schemas = [node for node in metadata_root.iter() if local(node.tag) == "Schema"]
    typed_nodes: dict[str, ET.Element] = {}
    associations: dict[str, ET.Element] = {}
    root_type: ET.Element | None = None
    for schema in schemas:
        namespace = schema.attrib.get("Namespace", "")
        for child in list(schema):
            kind = local(child.tag)
            name = child.attrib.get("Name", "")
            qualified = f"{namespace}.{name}" if namespace and name else name
            if kind in {"EntityType", "ComplexType"} and name:
                typed_nodes[qualified] = child
                typed_nodes.setdefault(name, child)
                if kind == "EntityType" and name == "SyndicObject":
                    root_type = child
            elif kind == "Association" and name:
                associations[qualified] = child
                associations.setdefault(name, child)
    if root_type is None:
        raise ValueError("Tourinsoft metadata has no SyndicObject entity")

    def unwrap(type_name: str) -> str:
        if type_name.startswith("Collection(") and type_name.endswith(")"):
            return type_name[11:-1]
        return type_name

    def find_type(type_name: str) -> ET.Element | None:
        unwrapped = unwrap(type_name)
        exact = typed_nodes.get(unwrapped)
        return exact if exact is not None else typed_nodes.get(unwrapped.rsplit(".", 1)[-1])

    def flatten_declared(type_node: ET.Element, prefix: str = "", seen: tuple[str, ...] = ()) -> dict[str, str]:
        result: dict[str, str] = {}
        node_name = type_node.attrib.get("Name", "")
        if node_name in seen:
            return result
        next_seen = (*seen, node_name)
        for prop in list(type_node):
            if local(prop.tag) != "Property":
                continue
            name = prop.attrib.get("Name", "")
            type_name = prop.attrib.get("Type", "Edm.String")
            path = f"{prefix}.{name}" if prefix else name
            nested = find_type(type_name)
            if nested is None or type_name.startswith("Edm."):
                result[path] = type_name
            else:
                nested_fields = flatten_declared(nested, path, next_seen)
                if nested_fields:
                    result.update(nested_fields)
                else:
                    result[path] = type_name
        return result

    object_fields = flatten_declared(root_type)
    relation_fields: dict[str, dict[str, str]] = {}
    for nav in list(root_type):
        if local(nav.tag) != "NavigationProperty":
            continue
        relation_name = nav.attrib.get("Name", "")
        relationship = nav.attrib.get("Relationship", "")
        to_role = nav.attrib.get("ToRole", "")
        association = associations.get(relationship)
        if association is None:
            association = associations.get(relationship.rsplit(".", 1)[-1])
        target_type_name = ""
        if association is not None:
            ends = [end for end in list(association) if local(end.tag) == "End"]
            target = next((end for end in ends if end.attrib.get("Role") == to_role), None)
            if target is None and ends:
                target = ends[-1]
            if target is not None:
                target_type_name = target.attrib.get("Type", "")
        target_type = find_type(target_type_name)
        if relation_name and target_type is not None:
            relation_fields[relation_name] = flatten_declared(target_type)
        elif relation_name:
            relation_fields[relation_name] = {}
    return object_fields, relation_fields


def analyze_feed(feed: dict[str, str]) -> dict[str, object]:
    root = fetch_xml(feed["url"])
    feed_base = root.attrib.get("{http://www.w3.org/XML/1998/namespace}base", "")
    metadata_url = feed_base.rstrip("/") + "/$metadata"
    declared_object_fields, declared_relation_fields = metadata_contract(fetch_xml(metadata_url))
    entries = root.findall("a:entry", NS)
    object_stats: dict[str, FieldStats] = defaultdict(FieldStats)
    relation_stats: dict[str, dict[str, FieldStats]] = defaultdict(lambda: defaultdict(FieldStats))
    relation_entry_counts: Counter[str] = Counter()
    prefixes: Counter[str] = Counter()
    object_type_names: Counter[str] = Counter()
    object_type_fixes: Counter[str] = Counter()

    for name, edm_type in declared_object_fields.items():
        object_stats[name].declared_type = edm_type
    for relation, fields in declared_relation_fields.items():
        relation_entry_counts.setdefault(relation, 0)
        for name, edm_type in fields.items():
            relation_stats[relation][name].declared_type = edm_type

    for entry in entries:
        properties = direct_properties(entry)
        collect(object_stats, properties)
        values = {name: value for name, value, _, _ in properties}
        object_id = values.get("SyndicObjectID", "")
        if not object_id:
            id_text = entry.findtext("a:id", default="", namespaces=NS)
            match = re.search(r"Objects\('([^']+)'\)", id_text)
            object_id = match.group(1) if match else ""
        if object_id:
            prefixes[object_id[:3]] += 1
        if values.get("ObjectTypeName"):
            object_type_names[values["ObjectTypeName"]] += 1
        if values.get("ObjectTypeFix"):
            object_type_fixes[values["ObjectTypeFix"]] += 1

        for link in entry.findall("a:link", NS):
            title = link.attrib.get("title", "")
            inline = link.find("m:inline", NS)
            if inline is None or not title:
                continue
            nested_entries = inline.findall("a:entry", NS) + inline.findall("a:feed/a:entry", NS)
            relation_entry_counts[title] += len(nested_entries)
            for nested in nested_entries:
                collect(relation_stats[title], direct_properties(nested))

    serialize = lambda stats: [stats[name].serialize(name) for name in sorted(stats, key=str.casefold)]
    return {
        "slug": feed["slug"],
        "name": feed["name"],
        "id": feed["id"],
        "source_url": feed["url"],
        "feed_base": feed_base,
        "metadata_url": metadata_url,
        "feed_updated": root.findtext("a:updated", default="", namespaces=NS),
        "object_count": len(entries),
        "object_id_prefixes": dict(prefixes),
        "object_type_names": dict(object_type_names),
        "object_type_fixes": dict(object_type_fixes),
        "object_fields": serialize(object_stats),
        "relations": {
            relation: {
                "entry_count": relation_entry_counts[relation],
                "fields": serialize(stats),
            }
            for relation, stats in sorted(relation_stats.items(), key=lambda item: item[0].casefold())
        },
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="docs/integrations/tourinsoft/reunion-regional-v1/feeds.json")
    parser.add_argument("--output", default="docs/integrations/tourinsoft/reunion-regional-v1")
    args = parser.parse_args()

    root = Path.cwd()
    catalog_path = root / args.catalog
    output_dir = root / args.output
    feeds: list[dict[str, str]] = json.loads(catalog_path.read_text(encoding="utf-8"))
    analyses = [analyze_feed(feed) for feed in feeds]

    for analysis in analyses:
        write_json(output_dir / "source-schemas" / f"{analysis['slug']}.json", analysis)

    summary_feeds = []
    union: dict[str, dict[str, object]] = {}
    inventory_rows: list[dict[str, object]] = []
    for analysis in analyses:
        summary_feeds.append({
            "slug": analysis["slug"],
            "name": analysis["name"],
            "id": analysis["id"],
            "url": analysis["source_url"],
            "feed_updated": analysis["feed_updated"],
            "object_count": analysis["object_count"],
            "object_id_prefixes": analysis["object_id_prefixes"],
            "object_type_names": analysis["object_type_names"],
            "object_type_fixes": analysis["object_type_fixes"],
            "object_field_count": len(analysis["object_fields"]),
            "observed_object_field_count": sum(field["observed"] for field in analysis["object_fields"]),
            "relation_count": len(analysis["relations"]),
            "relation_field_count": sum(len(data["fields"]) for data in analysis["relations"].values()),
            "observed_relation_field_count": sum(
                field["observed"]
                for data in analysis["relations"].values()
                for field in data["fields"]
            ),
        })

        scoped_fields = [("object", "", field) for field in analysis["object_fields"]]
        for relation, relation_data in analysis["relations"].items():
            scoped_fields.extend(("relation", relation, field) for field in relation_data["fields"])
        for scope, collection, field_data in scoped_fields:
            path_key = f"{collection or 'object'}.{field_data['name']}"
            union_row = union.setdefault(path_key, {
                "scope": scope,
                "collection": collection,
                "field": field_data["name"],
                "feeds": [],
                "observed_in_feeds": [],
            })
            union_row["feeds"].append(analysis["slug"])
            if field_data["observed"]:
                union_row["observed_in_feeds"].append(analysis["slug"])
            inventory_rows.append({
                "feed": analysis["slug"],
                "scope": scope,
                "collection": collection,
                **{key: field_data[key] for key in (
                    "name", "type", "declared", "observed", "count", "non_empty", "empty", "coverage_pct"
                )},
            })

    total_feeds = len(analyses)
    union_rows = []
    for path_key, row in sorted(union.items(), key=lambda item: item[0].casefold()):
        feed_count = len(row["feeds"])
        union_rows.append({
            "path": path_key,
            **row,
            "feed_count": feed_count,
            "reuse_class": "all_feeds" if feed_count == total_feeds else "shared" if feed_count > 1 else "feed_specific",
        })

    write_json(output_dir / "feed-summary.json", {
        "generated_from": str(catalog_path.relative_to(root)).replace("\\", "/"),
        "feed_count": total_feeds,
        "total_objects": sum(int(analysis["object_count"]) for analysis in analyses),
        "feeds": summary_feeds,
        "union_field_count": len(union_rows),
        "all_feed_field_count": sum(row["reuse_class"] == "all_feeds" for row in union_rows),
        "shared_field_count": sum(row["reuse_class"] == "shared" for row in union_rows),
        "feed_specific_field_count": sum(row["reuse_class"] == "feed_specific" for row in union_rows),
    })
    write_json(output_dir / "field-union.json", union_rows)

    inventory_path = output_dir / "field-inventory.csv"
    inventory_path.parent.mkdir(parents=True, exist_ok=True)
    with inventory_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=[
            "feed", "scope", "collection", "name", "type", "declared", "observed",
            "count", "non_empty", "empty", "coverage_pct"
        ])
        writer.writeheader()
        writer.writerows(inventory_rows)

    print(json.dumps({
        "feeds": len(analyses),
        "objects": sum(int(analysis["object_count"]) for analysis in analyses),
        "union_fields": len(union_rows),
        "all_feeds": sum(row["reuse_class"] == "all_feeds" for row in union_rows),
        "shared": sum(row["reuse_class"] == "shared" for row in union_rows),
        "feed_specific": sum(row["reuse_class"] == "feed_specific" for row in union_rows),
        "output": str(output_dir),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
