"""Tests hors base: selection, provenance, rendu et conservation des journaux."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prepare_run as runner
from filter_manifest_by_url_check import select_rows, write_rows

KIND = "b15b0aa4-6220-4f70-9804-15d41c42ee17"
IDENTIFIER = "5680c776-3803-4a99-8d5c-0e4cdfc0cf36"


def source_row(source_id="rs1"):
    return {"id_r_s": source_id, "object_id_v2": "old1", "expected_object_id_v3": "OBJ1",
            "kind_domain": "social_network", "kind_code": "facebook", "expected_kind_id": KIND,
            "url": "https://www.facebook.com/page?x=1;y=2&name=l'ile"}


def result(row, status, coherence="UNVERIFIED"):
    return {"id_r_s": row["id_r_s"], "object_id_v2": row["object_id_v2"], "url": row["url"],
            "check_status": status, "coherence_status": coherence, "classification_version": "5"}


class BackfillTests(unittest.TestCase):
    def test_manual_review_policy_preserves_unknown_but_excludes_dead(self):
        rows = [source_row(str(i)) for i in range(5)]
        results = [result(rows[0], "BLOCKED"), result(rows[1], "CONFIRMED_UNAVAILABLE"),
                   result(rows[2], "REACHABLE", "CONSISTENT"),
                   result(rows[3], "NOT_CHECKED_BLOCKED_DOMAIN")]
        selected, excluded, review = select_rows(rows, results)
        self.assertEqual([r["id_r_s"] for r in selected], ["0", "2", "3", "4"])
        self.assertEqual([r["id_r_s"] for r in excluded], ["1"])
        self.assertEqual([r["id_r_s"] for r in review], ["0", "3", "4"])

    def test_wrong_page_or_redirect_is_excluded(self):
        row = source_row()
        for status, coherence in [("REDIRECT_REVIEW", "UNVERIFIED"), ("REACHABLE", "MISMATCH")]:
            self.assertEqual(len(select_rows([row], [result(row, status, coherence)])[1]), 1)

    def test_stale_classifier_is_not_evidence_of_dead_page(self):
        row = source_row()
        old = result(row, "CONFIRMED_UNAVAILABLE")
        old["classification_version"] = "1"
        selected, excluded, review = select_rows([row], [old])
        self.assertEqual((len(selected), len(excluded), len(review)), (1, 0, 1))

    def test_duplicate_source_or_result_is_refused(self):
        row = source_row()
        with self.assertRaises(ValueError):
            select_rows([row, row], [])
        evidence = result(row, "REACHABLE", "CONSISTENT")
        with self.assertRaises(ValueError):
            select_rows([row], [evidence, evidence])

    def test_evidence_must_match_exact_url_and_old_id(self):
        row = source_row()
        for field in ("url", "object_id_v2"):
            evidence = result(row, "REACHABLE", "CONSISTENT")
            evidence[field] = "different"
            with self.assertRaises(ValueError):
                select_rows([row], [evidence])

    def test_sql_data_is_quoted_and_not_rendered_twice(self):
        payload = "l'ile; __EXPECTED_ROWS__"
        rendered = runner.render("SELECT __DATA__", {"__DATA__": runner.sql_literal(payload)})
        self.assertEqual(rendered, "SELECT 'l''ile; __EXPECTED_ROWS__'")
        with self.assertRaises(ValueError):
            runner.render("SELECT __MISSING__", {})

    def test_paths_with_spaces_work_ambiguous_paths_are_refused(self):
        self.assertIn("space name", runner.path_literal(Path("space name/file.csv")))
        for value in ("bad'path", "bad\npath"):
            with self.assertRaises(ValueError):
                runner.path_literal(Path(value))

    def test_prepare_freezes_source_and_keeps_previous_run_and_journal(self):
        with tempfile.TemporaryDirectory(prefix="bertel_social_test_") as directory:
            folder = Path(directory)
            raw = folder / "source.csv"
            raw.write_text("frozen source", encoding="utf-8")
            digest = runner.sha(raw)
            runner.dump(folder / "csv_audit_report.json", {"sha256": digest, "source_file": str(raw)})
            row = source_row()
            write_rows(folder / "manifest.csv", [row], list(row))
            (folder / "manifest.sha256").write_text(runner.sha(folder / "manifest.csv"), encoding="utf-8")
            write_rows(folder / "object_names.csv", [{"id_v2": "old1", "object_id_v3": "OBJ1", "name": "Test", "status": "published"}],
                       ["id_v2", "object_id_v3", "name", "status"])
            with patch.object(runner, "SOURCE_SHA256", digest):
                first, meta = runner.prepare(folder)
                journal = first / "applied_row_ids.csv"
                journal.write_text("original journal", encoding="utf-8")
                second, _ = runner.prepare(folder)
                self.assertNotEqual(first, second)
                self.assertEqual(journal.read_text(encoding="utf-8"), "original journal")
                sql = (first / "apply.sql").read_text(encoding="utf-8")
                self.assertNotIn("__MANIFEST_JSON__", sql)
                self.assertNotIn("\\copy", sql)
                self.assertIn("l''ile", sql)
                self.assertIn("expected_status", sql)
                self.assertFalse(meta["database_executed"])
                raw.write_text("changed source", encoding="utf-8")
                with self.assertRaises(ValueError):
                    runner.prepare(folder)

    def test_journal_validates_full_snapshot_and_provenance(self):
        row = source_row()
        snapshot = {"id": IDENTIFIER, "object_id": "OBJ1", "kind_id": KIND,
                    "kind_domain": "social_network", "value": row["url"], "is_public": True,
                    "position": 0, "created_at": "2026-09-07T00:00:00+00:00", "updated_at": "2026-09-07T00:00:00+00:00"}
        entry = {"id": IDENTIFIER, "id_r_s": "rs1", "object_id_v2": "old1", "row_snapshot": json.dumps(snapshot)}
        self.assertEqual(runner.validate_journal([entry], [row])[0]["row_snapshot"], snapshot)
        self.assertEqual(runner.validate_journal([], [row]), [])
        with self.assertRaises(ValueError):
            runner.validate_journal([entry, entry], [row])
        snapshot["object_id"] = "OTHER"
        entry["row_snapshot"] = json.dumps(snapshot)
        with self.assertRaises(ValueError):
            runner.validate_journal([entry], [row])

    def test_journal_renders_verification_without_database_and_full_snapshot_rollback(self):
        with tempfile.TemporaryDirectory(prefix="bertel_social_journal_") as directory:
            run = Path(directory)
            row = source_row()
            write_rows(run / "selected.csv", [row], list(row))
            runner.dump(run / "run.json", {"selected_sha256": runner.sha(run / "selected.csv")})
            snapshot = {"id": IDENTIFIER, "object_id": "OBJ1", "kind_id": KIND,
                        "kind_domain": "social_network", "value": row["url"], "is_public": True,
                        "position": 0, "created_at": "2026-09-07T00:00:00+00:00", "updated_at": "2026-09-07T00:00:00+00:00"}
            entry = {"id_r_s": "rs1", "object_id_v2": "old1", "id": IDENTIFIER, "row_snapshot": json.dumps(snapshot)}
            write_rows(run / "applied_row_ids.csv", [entry], list(entry))
            output, meta = runner.journal(run)
            verification = (output / "postverify.sql").read_text(encoding="utf-8")
            rollback = (output / "rollback.sql").read_text(encoding="utf-8")
            self.assertIn("READ ONLY", verification)
            self.assertNotIn("CREATE TEMP", verification)
            self.assertNotIn("__JOURNAL_JSON__", verification + rollback)
            self.assertIn("to_jsonb(c) = j.row_snapshot", rollback)
            self.assertIn("l''ile", rollback)
            self.assertFalse(meta["database_executed"])


if __name__ == "__main__":
    unittest.main()
