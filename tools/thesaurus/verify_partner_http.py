"""Run the partner HTTP rollout checks with an explicitly supplied temporary key.

Never prints or writes the key. State/report files contain public vocabulary data
and signed pagination cursors only. Database fixture changes remain explicit.
"""

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="https://bertel.otisud.re")
parser.add_argument("--key-file", type=Path, required=True)
parser.add_argument("--state", type=Path, required=True)
parser.add_argument("--report", type=Path, required=True)
parser.add_argument("--catalog-before", type=Path)
parser.add_argument("--phase", choices=["start", "continue", "quota", "revoked", "final"], required=True)
args = parser.parse_args()
base = args.base_url.rstrip("/")
if urlparse(base).scheme != "https":
    raise SystemExit("HTTPS target required")
key = json.loads(args.key_file.read_text(encoding="utf-8-sig"))["api_key"]
state = json.loads(args.state.read_text(encoding="utf-8")) if args.state.exists() else {}
report = json.loads(args.report.read_text(encoding="utf-8")) if args.report.exists() else {"checks": []}


def request(path, expected=200, auth=True, etag=None):
    headers = {"Accept": "application/json"}
    if auth:
        headers["Authorization"] = "Bearer " + key
    if etag:
        headers["If-None-Match"] = etag
    try:
        response = urlopen(Request(base + path, headers=headers), timeout=30)
    except HTTPError as error:
        response = error
    status = response.status
    raw = response.read()
    assert status == expected, f"{path.split('?')[0]}: expected {expected}, received {status}"
    report["checks"].append({"path": path.split("?")[0], "status": status, "phase": args.phase})
    return (json.loads(raw) if raw else None), dict(response.headers)


def check_catalog():
    actual, _ = request("/api/public/catalog?lang=fr")
    if args.catalog_before:
        before = json.loads(args.catalog_before.read_text(encoding="utf-8-sig"))
        assert actual == before, "Legacy catalog representation changed"
        report["legacy_catalog_identical"] = True
    report["legacy_domain_count"] = len(actual["data"])


if args.phase == "start":
    request("/api/public/thesaurus", expected=401, auth=False)
    check_catalog()
    manifest, _ = request("/api/public/thesaurus")
    release = manifest["meta"]["release_id"]
    assert manifest["data"]["base_uri"] == base + "/api/public/thesaurus/concepts/"
    assert manifest["data"]["license"] and manifest["data"]["attribution"]
    frozen_path = f"/api/public/thesaurus/releases/{release}"
    _, headers = request(frozen_path)
    etag = next(v for k, v in headers.items() if k.lower() == "etag")
    request(frozen_path, expected=304, etag=etag)
    suffix = "?" + urlencode({"domains": "taxonomy_hlo", "lang": "fr", "page_size": 2})
    first, _ = request(f"{frozen_path}/concepts{suffix}")
    exported, _ = request(f"{frozen_path}/export?domains=taxonomy_hlo&lang=fr")
    rdf, rdf_headers = request(f"{frozen_path}/export?domains=taxonomy_hlo&lang=fr&format=jsonld")
    rdf_nodes = {node["concept_id"]: node for node in rdf["@graph"]}
    assert any(k.lower() == "content-type" and v.startswith("application/ld+json") for k, v in rdf_headers.items())
    expected_ids = [concept["concept_id"] for concept in exported["data"]]
    assert set(rdf_nodes) == set(expected_ids), "JSON/JSON-LD identities differ"
    for concept in exported["data"]:
        node = rdf_nodes[concept["concept_id"]]
        assert node["@id"] == concept["uri"]
        assert node["prefLabel"] == concept["preferred_labels"]
        assert node["definition"] == concept["definitions"]
        for name in ["code", "domain", "lifecycle", "assignable", "valid_from", "valid_to", "notes", "mappings", "relations"]:
            assert node[name] == concept[name], "JSON/JSON-LD field differs: " + name
        uri_prefix = concept["uri"][:-len(concept["concept_id"])]
        for source_name, rdf_name in [("broader", "skos:broader"), ("narrower", "skos:narrower"), ("related", "skos:related"), ("replaced_by", "dct:isReplacedBy")]:
            assert {link["@id"] for link in node.get(rdf_name, [])} == {uri_prefix + identity for identity in concept[source_name]}
    first_concept = first["data"][0]
    request(f"{frozen_path}/concepts/{first_concept['concept_id']}")
    request(urlparse(first_concept["uri"]).path)
    request(urlparse(first_concept["uri"]).path, expected=401, auth=False)
    request(f"{frozen_path}/concepts/00000000-0000-4000-8000-000000000000", expected=404)
    request(f"{frozen_path}/concepts?domains=crm_sentiment", expected=400)
    state = {"release": release, "frozen_path": frozen_path, "etag": etag,
             "expected_ids": expected_ids, "seen": [row["concept_id"] for row in first["data"]],
             "next_cursor": first["meta"]["next_cursor"], "page_suffix": suffix}
    assert state["next_cursor"], "Pilot corpus needs more than one page"
    report.update(pilot_release=release, json_jsonld_equal=True, pilot_concepts=len(expected_ids))
elif args.phase == "continue":
    current, _ = request("/api/public/thesaurus")
    assert current["meta"]["release_id"] > state["release"], "Publish the next domain before continuing"
    seen = list(state["seen"])
    cursor = state["next_cursor"]
    while cursor:
        path = state["frozen_path"] + "/concepts" + state["page_suffix"] + "&" + urlencode({"cursor": cursor})
        page, _ = request(path)
        assert page["meta"]["release_id"] == state["release"], "Pagination mixed release generations"
        seen.extend(row["concept_id"] for row in page["data"])
        cursor = page["meta"]["next_cursor"]
    assert len(seen) == len(set(seen)), "Pagination duplicated identities"
    assert set(seen) == set(state["expected_ids"]), "Pagination omitted or added identities"
    request(state["frozen_path"], expected=304, etag=state["etag"])
    report.update(pagination_during_publication=True, paged_concepts=len(seen), latest_release=current["meta"]["release_id"])
elif args.phase == "quota":
    request(state["frozen_path"], expected=429, etag=state["etag"])
    report["quota_before_304"] = True
elif args.phase == "revoked":
    request(state["frozen_path"], expected=401, etag=state["etag"])
    report["revocation_before_304"] = True
else:
    check_catalog()
    manifest, _ = request("/api/public/thesaurus")
    release = manifest["meta"]["release_id"]
    report.update(final_release=release, governed_public_domains=len(manifest["data"]["domains"]))
    request(f"/api/public/thesaurus/releases/{release}/changes?page_size=2")
    exported, _ = request(f"/api/public/thesaurus/releases/{release}/export")
    historical = [concept for concept in exported["data"] if concept["lifecycle"] in ("retired", "deprecated")]
    if historical:
        request(f"/api/public/thesaurus/concepts/{historical[0]['concept_id']}")
    report["historical_concepts_resolvable"] = len(historical)
    objects, _ = request("/api/public/objects?page_size=1")
    report["object_endpoint_responds"] = True

args.state.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"phase": args.phase, "passed": True, "http_checks": len(report["checks"])}))
