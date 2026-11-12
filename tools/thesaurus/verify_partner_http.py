"""Run the partner HTTP rollout checks with an explicitly supplied temporary key.

Never prints or writes the key. State/report files contain public vocabulary data
and signed pagination cursors only. Database fixture changes remain explicit.

The official edition (manifest release_id) and the preparation snapshot behind a pinned
release are distinct. The continue phase compares the stored edition and the pinned full
manifest ETag before choosing between stable pagination and proof that an old cursor is
rejected after the snapshot moved within the same edition.
"""

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

COMPACT_DISCOVERY_META = {"contract_version", "release_id", "previous_release_id", "as_of"}
COMPACT_LIST_META = {"contract_version", "release_id", "total", "next_cursor"}
COMPACT_DOMAIN_KEYS = {"domain", "name", "effective_lang"}
COMPACT_RELEASE_KEYS = {"release_id", "previous_release_id", "as_of"}
COMPACT_ROW_CORE = {"concept_id", "domain", "code", "name", "effective_lang", "lifecycle", "assignable"}
COMPACT_ROW_OPTIONAL = {"context_key", "description", "definition_lang", "valid_from", "valid_to", "broader", "member_of", "replaced_by"}
COMPACT_ROW_LISTS = ("broader", "member_of", "replaced_by")

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="https://bertel.otisud.re")
parser.add_argument("--key-file", type=Path, required=True)
parser.add_argument("--state", type=Path, required=True)
parser.add_argument("--report", type=Path, required=True)
parser.add_argument("--catalog-before", type=Path)
parser.add_argument("--phase", choices=["start", "continue", "quota", "revoked", "final"], required=True)
parser.add_argument("--continuation-mode", choices=["frozen", "snapshot-changed"], default="frozen",
                    help="Expected continue scenario; snapshot invalidation must be requested explicitly")
args = parser.parse_args()
base = args.base_url.rstrip("/")
if urlparse(base).scheme != "https":
    raise SystemExit("HTTPS target required")
key = json.loads(args.key_file.read_text(encoding="utf-8-sig"))["api_key"]
state = json.loads(args.state.read_text(encoding="utf-8")) if args.state.exists() else {}
report = json.loads(args.report.read_text(encoding="utf-8")) if args.report.exists() else {"checks": []}


def fetch(path, expected=200, auth=True, etag=None):
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
    return raw, dict(response.headers)


def request(path, expected=200, auth=True, etag=None):
    raw, headers = fetch(path, expected, auth, etag)
    return (json.loads(raw) if raw else None), headers


def expect_error(path, status, code):
    raw, _ = fetch(path, expected=status)
    error = json.loads(raw).get("error")
    actual = error.get("code") if isinstance(error, dict) else error
    assert actual == code, f"{path.split('?')[0]}: expected error {code}"


def etag_of(headers):
    return next(value for name, value in headers.items() if name.lower() == "etag")


def check_compact_row(row):
    keys = set(row)
    assert not COMPACT_ROW_CORE - keys, "compact row lacks core fields"
    assert not keys - COMPACT_ROW_CORE - COMPACT_ROW_OPTIONAL, "compact row has unexpected fields"
    assert isinstance(row["concept_id"], str) and isinstance(row["domain"], str), "compact identity shape"
    assert isinstance(row["code"], str) and isinstance(row["lifecycle"], str), "compact code/lifecycle shape"
    assert isinstance(row["assignable"], bool), "compact assignable must be boolean"
    assert row["name"] is None or isinstance(row["name"], str), "compact name must be string or null"
    assert row["effective_lang"] is None or isinstance(row["effective_lang"], str), "compact effective_lang must be string or null"
    if "context_key" in row:
        assert isinstance(row["context_key"], str) and row["context_key"], "context_key must be omitted when empty"
    assert ("description" in row) == ("definition_lang" in row), "description and definition_lang must appear together"
    if "description" in row:
        assert row["description"], "empty description must be omitted"
        assert row["definition_lang"] is None or isinstance(row["definition_lang"], str), "definition_lang must be string or null"
    for name in ("valid_from", "valid_to"):
        if name in row:
            assert isinstance(row[name], str) and row[name], f"{name} must be omitted when absent"
    for name in COMPACT_ROW_LISTS:
        if name in row:
            assert isinstance(row[name], list) and row[name], f"{name} must be omitted when empty"


def check_compact_list(body, release_id):
    assert set(body["meta"]) == COMPACT_LIST_META, "compact list meta keys differ"
    assert body["meta"]["release_id"] == release_id, "compact list release differs"
    for row in body["data"]:
        check_compact_row(row)


def check_compact_manifest(body, release_id, discovery):
    assert set(body["meta"]) == COMPACT_DISCOVERY_META, "compact manifest meta keys differ"
    assert body["meta"]["release_id"] == release_id, "compact manifest release differs"
    data = body["data"]
    expected = {"license", "attribution", "domains"} | ({"releases"} if discovery else set())
    assert set(data) == expected, "compact manifest data keys differ"
    for name in ("license", "attribution"):
        assert data[name] is None or isinstance(data[name], str), f"{name} must be string or null"
    for domain in data["domains"]:
        assert set(domain) == COMPACT_DOMAIN_KEYS, "compact domain keys differ"
    for item in data.get("releases", []):
        assert set(item) == COMPACT_RELEASE_KEYS, "compact release summary keys differ"


def check_compact_domains(compact_domains, full_domains):
    expected = [{"domain": d["domain"], "name": d.get("name"), "effective_lang": d.get("effective_lang")} for d in full_domains]
    assert compact_domains == expected, "compact domains differ from full manifest"


def check_compact_matches_full(row, full):
    for name in ("concept_id", "domain", "code", "lifecycle", "assignable", "name", "effective_lang"):
        assert row[name] == full.get(name), "compact field differs from full: " + name
    for name in ("valid_from", "valid_to", "context_key", *COMPACT_ROW_LISTS):
        assert row.get(name) == (full.get(name) or None), "compact optional field differs from full: " + name
    description = full.get("description")
    expected_description = description if isinstance(description, str) and description.strip() else None
    assert row.get("description") == expected_description, "compact description differs from full"
    if "description" in row:
        assert row["definition_lang"] == full.get("definition_lang"), "compact definition language differs from full"


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
    frozen, headers = request(frozen_path)
    etag = etag_of(headers)
    request(frozen_path, expected=304, etag=etag)

    discovery, discovery_headers = request("/api/public/thesaurus?lang=fr")
    compact_discovery, compact_discovery_headers = request("/api/public/thesaurus?view=compact&lang=fr")
    check_compact_manifest(compact_discovery, release, discovery=True)
    check_compact_domains(compact_discovery["data"]["domains"], discovery["data"]["domains"])
    assert [r["release_id"] for r in compact_discovery["data"]["releases"]] == [r["release_id"] for r in discovery["data"]["releases"]], "compact release history differs"
    compact_discovery_etag = etag_of(compact_discovery_headers)
    assert compact_discovery_etag != etag_of(discovery_headers), "compact and full discovery share a validator"
    request("/api/public/thesaurus?view=compact&lang=fr", expected=304, etag=compact_discovery_etag)
    request("/api/public/thesaurus?view=compact&lang=fr", etag=etag_of(discovery_headers))

    compact_frozen_path = frozen_path + "?view=compact"
    compact_frozen, compact_frozen_headers = request(compact_frozen_path)
    check_compact_manifest(compact_frozen, release, discovery=False)
    check_compact_domains(compact_frozen["data"]["domains"], frozen["data"]["domains"])
    compact_frozen_etag = etag_of(compact_frozen_headers)
    assert compact_frozen_etag != etag, "compact and full release manifests share a validator"
    request(compact_frozen_path, expected=304, etag=compact_frozen_etag)

    suffix = "?" + urlencode({"domains": "taxonomy_hlo", "lang": "fr", "page_size": 2})
    first, first_headers = request(f"{frozen_path}/concepts{suffix}")
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

    compact_suffix = suffix + "&view=compact"
    compact_first, compact_first_headers = request(f"{frozen_path}/concepts{compact_suffix}")
    check_compact_list(compact_first, release)
    full_by_id = {concept["concept_id"]: concept for concept in exported["data"]}
    assert [row["concept_id"] for row in compact_first["data"]] == [row["concept_id"] for row in first["data"]], "compact first page identities differ"
    assert compact_first["meta"]["total"] == first["meta"]["total"], "compact total differs"
    for row in compact_first["data"]:
        check_compact_matches_full(row, full_by_id[row["concept_id"]])
    assert etag_of(compact_first_headers) != etag_of(first_headers), "compact and full lists share a validator"
    request(f"{frozen_path}/concepts{compact_suffix}", expected=304, etag=etag_of(compact_first_headers))
    compact_cursor = compact_first["meta"]["next_cursor"]
    assert compact_cursor and compact_cursor != first["meta"]["next_cursor"], "compact cursor must differ from full cursor"
    expect_error(f"{frozen_path}/concepts{suffix}&" + urlencode({"cursor": compact_cursor}), 400, "invalid_cursor")
    expect_error(f"{frozen_path}/concepts{compact_suffix}&" + urlencode({"cursor": first["meta"]["next_cursor"]}), 400, "invalid_cursor")
    compact_seen = [row["concept_id"] for row in compact_first["data"]]
    cursor = compact_cursor
    while cursor:
        page, _ = request(f"{frozen_path}/concepts{compact_suffix}&" + urlencode({"cursor": cursor}))
        check_compact_list(page, release)
        assert page["meta"]["total"] == first["meta"]["total"], "compact total changed during pagination"
        for row in page["data"]:
            check_compact_matches_full(row, full_by_id[row["concept_id"]])
        compact_seen.extend(row["concept_id"] for row in page["data"])
        cursor = page["meta"]["next_cursor"]
    assert len(compact_seen) == len(set(compact_seen)), "compact pagination duplicated identities"
    assert set(compact_seen) == set(expected_ids), "compact pagination omitted or added identities"

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
    report.update(pilot_release=release, json_jsonld_equal=True, pilot_concepts=len(expected_ids),
                  compact_checked=True, compact_pilot_concepts=len(compact_seen))
elif args.phase == "continue":
    current, _ = request("/api/public/thesaurus")
    current_release = current["meta"]["release_id"]
    assert current_release >= state["release"], "Official edition regressed below the stored edition"
    _, frozen_headers = request(state["frozen_path"])
    if etag_of(frozen_headers) != state["etag"]:
        assert args.continuation_mode == "snapshot-changed", "Pinned snapshot changed; frozen pagination was not verified"
        assert current_release == state["release"], "Pinned manifest changed on a newer edition: investigate before continuing"
        stale_path = state["frozen_path"] + "/concepts" + state["page_suffix"] + "&" + urlencode({"cursor": state["next_cursor"]})
        expect_error(stale_path, 400, "invalid_cursor")
        report.update(preparation_snapshot_invalidated=True, pagination_during_publication=False,
                      continuation="stale_snapshot_same_edition",
                      pagination_not_verified="preparation snapshot moved without a new official edition")
    else:
        assert args.continuation_mode == "frozen", "Expected preparation snapshot change did not occur"
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
        continuation = "stable_snapshot_new_edition" if current_release > state["release"] else "stable_snapshot_same_edition"
        report.update(pagination_during_publication=True, paged_concepts=len(seen), latest_release=current_release,
                      continuation=continuation)
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
