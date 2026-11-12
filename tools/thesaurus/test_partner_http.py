"""Offline tests for verify_partner_http.py.

urlopen is replaced by a synthetic three-concept corpus; no socket is ever opened.
Run with: python -I tools/thesaurus/test_partner_http.py
"""

import contextlib
import copy
import io
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

SCRIPT = Path(__file__).with_name("verify_partner_http.py")
BASE = "https://bertel.example.test"
URI = BASE + "/api/public/thesaurus/concepts/"
KEY = "unit-test-key-not-real"
RELEASE = 2
C1 = "11111111-1111-4111-8111-111111111111"
C2 = "22222222-2222-4222-8222-222222222222"
C3 = "33333333-3333-4333-8333-333333333333"
DOMAIN = {"domain": "taxonomy_hlo", "name": "Hiérarchie", "effective_lang": "fr", "counters": {"concepts": 3}}


def concept(cid, code, **overrides):
    row = {"concept_id": cid, "uri": URI + cid, "domain": "taxonomy_hlo", "code": code, "name": code.title(),
           "effective_lang": "fr", "preferred_labels": {"fr": code.title()}, "definitions": {"fr": "Définition " + code},
           "lifecycle": "active", "assignable": True, "valid_from": None, "valid_to": None, "notes": [],
           "mappings": [], "relations": [], "broader": [], "narrower": [], "related": [], "replaced_by": [], "member_of": []}
    row.update(overrides)
    return row


FULL = [
    concept(C1, "alpha", description="Description alpha", definition_lang="fr", context_key="ctx-a", narrower=[C2]),
    concept(C2, "beta", valid_from="2026-01-01", broader=[C1], member_of=[C1]),
    concept(C3, "gamma", lifecycle="retired", assignable=False, valid_to="2025-12-31", replaced_by=[C1]),
]
COMPACT = {
    C1: {"concept_id": C1, "domain": "taxonomy_hlo", "code": "alpha", "name": "Alpha", "effective_lang": "fr",
         "lifecycle": "active", "assignable": True, "context_key": "ctx-a", "description": "Description alpha", "definition_lang": "fr"},
    C2: {"concept_id": C2, "domain": "taxonomy_hlo", "code": "beta", "name": "Beta", "effective_lang": "fr",
         "lifecycle": "active", "assignable": True, "valid_from": "2026-01-01", "broader": [C1], "member_of": [C1]},
    C3: {"concept_id": C3, "domain": "taxonomy_hlo", "code": "gamma", "name": "Gamma", "effective_lang": "fr",
         "lifecycle": "retired", "assignable": False, "valid_to": "2025-12-31", "replaced_by": [C1]},
}
RELEASES = [{"release_id": 2, "previous_release_id": 1, "as_of": "2026-11-12T08:00:00Z", "metadata_checksum": "m2"},
            {"release_id": 1, "previous_release_id": None, "as_of": "2026-11-11T08:00:00Z", "metadata_checksum": "m1"}]


def full_meta(release_id):
    return {"contract_version": "1.0.0", "release_id": release_id, "vocabulary_release": release_id,
            "previous_release_id": 1, "as_of": "2026-11-12T08:00:00Z", "metadata_checksum": "m"}


def compact_meta(release_id):
    return {"contract_version": "1.0.0", "release_id": release_id, "previous_release_id": 1, "as_of": "2026-11-12T08:00:00Z"}


def full_discovery(current):
    data = {"base_uri": URI, "license": "Licence test", "attribution": "Attribution test",
            "domains": [dict(DOMAIN)], "releases": copy.deepcopy(RELEASES), "editorial_rules": {"review": "x"}}
    return {"meta": full_meta(current), "data": data}


def compact_discovery(current):
    domains = [{"domain": "taxonomy_hlo", "name": "Hiérarchie", "effective_lang": "fr"}]
    releases = [{"release_id": r["release_id"], "previous_release_id": r["previous_release_id"], "as_of": r["as_of"]} for r in RELEASES]
    return {"meta": compact_meta(current), "data": {"license": "Licence test", "attribution": "Attribution test",
                                                     "domains": domains, "releases": releases}}


def full_release():
    body = full_discovery(RELEASE)
    body["meta"] = full_meta(RELEASE)
    return body


def compact_release():
    domains = [{"domain": "taxonomy_hlo", "name": "Hiérarchie", "effective_lang": "fr"}]
    return {"meta": compact_meta(RELEASE), "data": {"license": "Licence test", "attribution": "Attribution test", "domains": domains}}


def jsonld(concepts):
    graph = []
    for item in concepts:
        node = {"@id": item["uri"], "concept_id": item["concept_id"], "prefLabel": item["preferred_labels"],
                "definition": item["definitions"]}
        node.update({k: item[k] for k in ("code", "domain", "lifecycle", "assignable", "valid_from", "valid_to", "notes", "mappings", "relations")})
        for source, name in (("broader", "skos:broader"), ("narrower", "skos:narrower"),
                             ("related", "skos:related"), ("replaced_by", "dct:isReplacedBy")):
            node[name] = [{"@id": URI + identity} for identity in item[source]]
        graph.append(node)
    return {"@context": {}, "@graph": graph}


class FakeResponse:
    def __init__(self, status, body=b"", headers=None):
        self.status = status
        self._body = body
        self.headers = headers or {}

    def read(self):
        return self._body


def json_reply(status, payload, headers=None):
    return FakeResponse(status, json.dumps(payload).encode("utf-8"),
                        {"Content-Type": "application/json; charset=utf-8", **(headers or {})})


class FakeAPI:
    """Synthetic partner API. `generation` models the preparation snapshot behind the pinned release."""

    def __init__(self):
        self.current = RELEASE
        self.generation = "g1"
        self.accept_stale_cursors = False
        self.transform = lambda kind, body: body
        self.calls = []

    def urlopen(self, req, timeout=None):
        url = urlparse(req.full_url)
        query = {name: values[0] for name, values in parse_qs(url.query).items()}
        headers = {name.lower(): value for name, value in req.header_items()}
        self.calls.append(req.full_url)
        if url.path == "/api/public/catalog":
            return json_reply(200, {"data": [{"domain": "taxonomy_hlo"}]})
        if headers.get("authorization") != "Bearer " + KEY:
            return json_reply(401, {"error": {"code": "unauthorized"}})
        return self.route(url.path, query, headers.get("if-none-match"), url.query)

    def route(self, path, query, if_none_match, raw_query):
        compact = query.get("view") == "compact"
        frozen = f"/api/public/thesaurus/releases/{RELEASE}"
        if path == "/api/public/thesaurus":
            body = compact_discovery(self.current) if compact else full_discovery(self.current)
            return self.serve("discovery", compact, body, '"discovery"', if_none_match)
        if path == frozen:
            body = compact_release() if compact else full_release()
            return self.serve("release", compact, body, f'"release-{self.generation}"', if_none_match)
        if path == frozen + "/concepts":
            return self.concepts(query, compact, raw_query, if_none_match)
        if path == frozen + "/export":
            if query.get("format") == "jsonld":
                return FakeResponse(200, json.dumps(jsonld(FULL)).encode("utf-8"),
                                    {"Content-Type": "application/ld+json; charset=utf-8"})
            return json_reply(200, {"meta": {"release_id": RELEASE}, "data": FULL})
        if path.startswith(frozen + "/concepts/") or path.startswith("/api/public/thesaurus/concepts/"):
            known = [row for row in FULL if row["concept_id"] == path.rsplit("/", 1)[1]]
            if not known:
                return json_reply(404, {"error": {"code": "not_found"}})
            return json_reply(200, {"meta": {"release_id": RELEASE}, "data": known[0]})
        if path == "/api/public/objects":
            return json_reply(200, {"data": [], "meta": {}})
        return json_reply(404, {"error": {"code": "not_found"}})

    def concepts(self, query, compact, raw_query, if_none_match):
        if query.get("domains", "taxonomy_hlo") != "taxonomy_hlo":
            return json_reply(400, {"error": {"code": "invalid_parameters"}})
        view = "compact" if compact else "full"
        size = int(query.get("page_size", "2"))
        offset = 0
        if query.get("cursor"):
            parts = query["cursor"].split(":")
            stale = len(parts) == 3 and parts[2] != self.generation and not self.accept_stale_cursors
            if len(parts) != 3 or parts[0] != view or stale:
                return json_reply(400, {"error": {"code": "invalid_cursor"}})
            offset = int(parts[1])
        page = FULL[offset:offset + size]
        rows = [COMPACT[row["concept_id"]] for row in page] if compact else page
        next_offset = offset + size
        next_cursor = f"{view}:{next_offset}:{self.generation}" if next_offset < len(FULL) else None
        meta = {"contract_version": "1.0.0", "release_id": RELEASE, "total": len(FULL), "next_cursor": next_cursor}
        if not compact:
            meta.update(vocabulary_release=RELEASE, page_size=size)
        return self.serve("list", compact, {"meta": meta, "data": rows}, f'"list-{self.generation}-{raw_query}"', if_none_match)

    def serve(self, kind, compact, body, etag, if_none_match):
        if compact:
            body = self.transform(kind, copy.deepcopy(body))
            etag += "-compact"
        if if_none_match == etag:
            return FakeResponse(304, b"", {"ETag": etag})
        return json_reply(200, body, {"ETag": etag})


class PartnerHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.key_file = root / "key.json"
        self.key_file.write_text(json.dumps({"api_key": KEY}), encoding="utf-8")
        self.state = root / "state.json"
        self.report = root / "report.json"
        self.api = FakeAPI()

    def run_phase(self, phase, *extra):
        argv = [str(SCRIPT), "--base-url", BASE, "--key-file", str(self.key_file),
                "--state", str(self.state), "--report", str(self.report), "--phase", phase, *extra]
        out = io.StringIO()
        with mock.patch.object(sys, "argv", argv), \
                mock.patch("urllib.request.urlopen", side_effect=self.api.urlopen), \
                contextlib.redirect_stdout(out):
            self.last_namespace = runpy.run_path(str(SCRIPT), run_name="__main__")
        return out.getvalue()

    def read_report(self):
        return json.loads(self.report.read_text(encoding="utf-8"))

    def test_start_passes_and_never_prints_key(self):
        out = self.run_phase("start")
        report = self.read_report()
        self.assertTrue(report["compact_checked"])
        self.assertTrue(report["json_jsonld_equal"])
        self.assertEqual(report["compact_pilot_concepts"], 3)
        self.assertNotIn(KEY, out)
        self.assertNotIn(KEY, self.state.read_text(encoding="utf-8"))
        self.assertNotIn(KEY, self.report.read_text(encoding="utf-8"))

    def test_start_rejects_wrong_compact_shapes(self):
        cases = [
            ("list", lambda body: body["data"][0].__setitem__("valid_from", None), "null optional field"),
            ("list", lambda body: body["data"][0].pop("description"), "definition_lang without description"),
            ("list", lambda body: body["data"][0].pop("name"), "missing core field"),
            ("list", lambda body: body["meta"].__setitem__("vocabulary_release", RELEASE), "full-only meta key"),
            ("list", lambda body: body["data"][1].__setitem__("broader", []), "empty optional list present"),
            ("discovery", lambda body: body["data"]["domains"][0].__setitem__("counters", {}), "nested domain field"),
            ("discovery", lambda body: body["data"].pop("releases"), "missing release history"),
            ("release", lambda body: body["data"].__setitem__("releases", []), "history in release view"),
        ]
        for kind, mutate, label in cases:
            with self.subTest(label=label):
                self.api = FakeAPI()

                def apply(name, body, kind=kind, mutate=mutate):
                    if name == kind:
                        mutate(body)
                    return body

                self.api.transform = apply
                with self.assertRaises(AssertionError):
                    self.run_phase("start")
                self.assertFalse(self.state.exists())

    def test_continue_stable_path_after_additive_edition(self):
        self.run_phase("start")
        self.api.current = 3
        self.run_phase("continue")
        report = self.read_report()
        self.assertTrue(report["pagination_during_publication"])
        self.assertEqual(report["continuation"], "stable_snapshot_new_edition")
        self.assertEqual(report["paged_concepts"], 3)
        self.assertEqual(report["latest_release"], 3)

    def test_continue_stable_path_same_edition(self):
        self.run_phase("start")
        self.run_phase("continue")
        report = self.read_report()
        self.assertTrue(report["pagination_during_publication"])
        self.assertEqual(report["continuation"], "stable_snapshot_same_edition")

    def test_continue_same_edition_snapshot_moved_records_invalidation(self):
        self.run_phase("start")
        self.api.generation = "g2"
        self.run_phase("continue", "--continuation-mode", "snapshot-changed")
        report = self.read_report()
        self.assertTrue(report["preparation_snapshot_invalidated"])
        self.assertFalse(report["pagination_during_publication"])
        self.assertEqual(report["continuation"], "stale_snapshot_same_edition")
        self.assertNotIn("paged_concepts", report)

    def test_continue_does_not_accept_snapshot_change_in_frozen_scenario(self):
        self.run_phase("start")
        self.api.generation = "g2"
        with self.assertRaisesRegex(AssertionError, "frozen pagination was not verified"):
            self.run_phase("continue")

    def test_continue_requires_change_in_snapshot_change_scenario(self):
        self.run_phase("start")
        with self.assertRaisesRegex(AssertionError, "did not occur"):
            self.run_phase("continue", "--continuation-mode", "snapshot-changed")

    def test_continue_rejects_edition_regression(self):
        self.run_phase("start")
        self.api.current = 1
        with self.assertRaises(AssertionError):
            self.run_phase("continue")

    def test_continue_rejects_pinned_manifest_change_on_newer_edition(self):
        self.run_phase("start")
        self.api.current = 3
        self.api.generation = "g2"
        with self.assertRaisesRegex(AssertionError, "Pinned manifest changed on a newer edition"):
            self.run_phase("continue", "--continuation-mode", "snapshot-changed")

    def test_continue_rejects_old_cursor_accepted_after_snapshot_move(self):
        self.run_phase("start")
        self.api.generation = "g2"
        self.api.accept_stale_cursors = True
        with self.assertRaises(AssertionError):
            self.run_phase("continue", "--continuation-mode", "snapshot-changed")

    def test_start_rejects_semantic_changes_or_total_drift_on_later_compact_pages(self):
        for field, changed in [("name", "Wrong label"), ("assignable", True), ("total", 900)]:
            with self.subTest(field=field):
                self.api = FakeAPI()

                def mutate(kind, body, field=field, changed=changed):
                    if kind == "list" and body["data"] and body["data"][0]["concept_id"] == C3:
                        if field == "total":
                            body["meta"][field] = changed
                        else:
                            body["data"][0][field] = changed
                    return body

                self.api.transform = mutate
                with self.assertRaises(AssertionError):
                    self.run_phase("start")

    def test_comparison_accepts_omitted_blank_legacy_descriptions(self):
        self.run_phase("start")
        row = {key: value for key, value in COMPACT[C1].items() if key not in ("description", "definition_lang")}
        for description in (None, "", "   "):
            with self.subTest(description=description):
                full = {**FULL[0], "description": description}
                self.last_namespace["check_compact_matches_full"](row, full)


if __name__ == "__main__":
    unittest.main()
