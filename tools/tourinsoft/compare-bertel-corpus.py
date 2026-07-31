#!/usr/bin/env python3
"""Compare public Tourinsoft feeds with the linked Bertel corpus by exact title.

Only aggregate counts are written. Source titles and object identifiers remain in
memory so the evidence artifact can be committed without publishing personal or
commercial data copied from either system.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path


ATOM = "http://www.w3.org/2005/Atom"
META = "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"
DATA = "http://schemas.microsoft.com/ado/2007/08/dataservices"
NS = {"a": ATOM, "m": META, "d": DATA}


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def normalize_title(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(character for character in decomposed if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).strip()


def direct_values(entry: ET.Element) -> dict[str, str]:
    properties = entry.find("a:content/m:properties", NS)
    if properties is None:
        return {}
    return {local(child.tag): child.text or "" for child in list(properties)}


def fetch_feed(url: str) -> ET.Element:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/atom+xml, application/xml;q=0.9", "User-Agent": "Bertel-contract-audit/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return ET.fromstring(response.read())


def query_bertel() -> list[dict[str, str]]:
    executable = shutil.which("supabase")
    if not executable:
        raise RuntimeError("supabase CLI not found on PATH")
    sql = "select id, object_type::text, name from public.object where status = 'published' order by id"
    result = subprocess.run(
        [executable, "db", "query", "--linked", "--output", "json", sql],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    payload = json.loads(result.stdout)
    return payload["rows"]


def nested_reference_codes(entry: ET.Element) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    for link in entry.findall("a:link", NS):
        relation = link.attrib.get("title", "")
        inline = link.find("m:inline", NS)
        if not relation or inline is None:
            continue
        nested_entries = inline.findall("a:entry", NS) + inline.findall("a:feed/a:entry", NS)
        for nested in nested_entries:
            properties = direct_values(nested)
            code = properties.get("ThesCode") or properties.get("Code")
            if code:
                values.append((relation, code))
    return values


def sorted_counter(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def serialize_cross_tab(cross_tab: dict[str, Counter[str]]) -> dict[str, dict[str, int]]:
    return {
        key: sorted_counter(counts)
        for key, counts in sorted(cross_tab.items(), key=lambda item: item[0].casefold())
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="docs/integrations/tourinsoft/reunion-regional-v1/feeds.json")
    parser.add_argument("--output", default="docs/integrations/tourinsoft/reunion-regional-v1/bertel-overlap.json")
    args = parser.parse_args()

    root = Path.cwd()
    feeds: list[dict[str, str]] = json.loads((root / args.catalog).read_text(encoding="utf-8"))
    bertel_rows = query_bertel()
    by_title: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in bertel_rows:
        normalized = normalize_title(row["name"])
        if normalized:
            by_title[normalized].append(row)

    feed_results: list[dict[str, object]] = []
    for feed in feeds:
        entries = fetch_feed(feed["url"]).findall("a:entry", NS)
        match_status: Counter[str] = Counter()
        unique_types: Counter[str] = Counter()
        compatible_ambiguous_types: Counter[str] = Counter()
        prefix_types: dict[str, Counter[str]] = defaultdict(Counter)
        relation_code_types: dict[str, Counter[str]] = defaultdict(Counter)

        for entry in entries:
            properties = direct_values(entry)
            title = properties.get("SyndicObjectName") or entry.findtext("a:title", default="", namespaces=NS)
            candidates = by_title.get(normalize_title(title), []) if title else []
            candidate_types = sorted({candidate["object_type"] for candidate in candidates})
            if not candidates:
                match_status["unmatched"] += 1
                continue
            if len(candidates) == 1:
                match_status["unique"] += 1
                bertel_type = candidates[0]["object_type"]
                unique_types[bertel_type] += 1
            elif len(candidate_types) == 1:
                match_status["ambiguous_same_type"] += 1
                bertel_type = candidate_types[0]
                compatible_ambiguous_types[bertel_type] += 1
            else:
                match_status["ambiguous_multiple_types"] += 1
                continue

            object_id = properties.get("SyndicObjectID", "")
            if object_id:
                prefix_types[object_id[:3]][bertel_type] += 1
            for relation, code in nested_reference_codes(entry):
                relation_code_types[f"{relation}.{code}"][bertel_type] += 1

        feed_results.append({
            "slug": feed["slug"],
            "feed_id": feed["id"],
            "tourinsoft_objects": len(entries),
            "match_status": sorted_counter(match_status),
            "unique_match_bertel_types": sorted_counter(unique_types),
            "ambiguous_same_type_bertel_types": sorted_counter(compatible_ambiguous_types),
            "object_prefix_to_bertel_type": serialize_cross_tab(prefix_types),
            "reference_code_to_bertel_type": serialize_cross_tab(relation_code_types),
        })

    output = {
        "method": "case-, accent- and punctuation-insensitive exact title match against linked published Bertel objects",
        "privacy": "aggregate counts only; no source title or object identifier is persisted",
        "bertel_published_objects": len(bertel_rows),
        "feed_count": len(feeds),
        "feeds": feed_results,
    }
    output_path = root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
