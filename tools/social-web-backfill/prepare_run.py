"""Prepare un lot SQL relisible, sans connexion reseau ni execution SQL.

prepare <dossier_audit>: source/manifeste verifies, selection humaine progressive,
SQL autonome et dossier de run exclusif. journal <run>: verification et rollback
depuis les seuls UUID INSERT RETURNING et leur snapshot integral.
"""
import argparse
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from filter_manifest_by_url_check import read_rows, write_rows, select_rows

REPO = Path(__file__).resolve().parents[2]
SQL = REPO / "Base de donnée DLL et API"
SOURCE_SHA256 = "d4cd18c351fd34559093dc9978ddc6f9644e1a3c6ec62a75a8cf501a2d16b9b1"
PREFIX = "social_web_channel_backfill_20260907"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def path_literal(path):
    value = Path(path).resolve().as_posix()
    # psql meta-command quoting differs from SQL literal quoting. Refuse
    # ambiguous path characters instead of attempting a second escaping layer.
    if any(ch in value for ch in "'\r\n\x00"):
        raise ValueError("Chemin psql contenant une apostrophe ou un caractere de controle")
    return "'" + value + "'"


def render(template, values):
    tokens = set(re.findall(r"__[A-Z_]+__", template))
    if tokens != set(values):
        raise ValueError(f"Jetons SQL incoherents: {tokens ^ set(values)}")
    return re.sub(r"__[A-Z_]+__", lambda match: values[match.group()], template)


def new_run(parent):
    directory = Path(parent) / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ_") + uuid.uuid4().hex)
    directory.mkdir(parents=True, exist_ok=False)
    return directory


def dump(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def prepare(folder):
    folder = Path(folder).resolve()
    audit = json.loads((folder / "csv_audit_report.json").read_text(encoding="utf-8"))
    if audit["sha256"] != SOURCE_SHA256 or sha(audit["source_file"]) != SOURCE_SHA256:
        raise ValueError("Le CSV source differe du fichier audite")
    expected = (folder / "manifest.sha256").read_text(encoding="utf-8").strip()
    if sha(folder / "manifest.csv") != expected:
        raise ValueError("Le manifeste a change depuis sa revue")
    manifest = read_rows(folder / "manifest.csv")
    results_path = folder / "url_checks" / "results.csv"
    results = read_rows(results_path) if results_path.exists() else []
    selected, excluded, review = select_rows(manifest, results)
    names = {row["id_v2"]: row for row in read_rows(folder / "object_names.csv")}
    for row in selected:
        name = names.get(row["object_id_v2"], {})
        if name.get("object_id_v3") != row["expected_object_id_v3"] or not name.get("status"):
            raise ValueError(f"Snapshot objet manquant/desaligne: {row['id_r_s']}")
        row["expected_status"] = name["status"]
        uuid.UUID(row["expected_kind_id"])
    if not selected:
        raise ValueError("Aucune entree selectionnee")
    tuples = {(r["expected_object_id_v3"], r["expected_kind_id"], r["url"]) for r in selected}
    if len(tuples) != len(selected):
        raise ValueError("Plusieurs entrees source produisent le meme canal V3")
    run = new_run(folder / "runs")
    write_rows(run / "selected.csv", selected, list(selected[0]))
    details = list(manifest[0]) + ["check_status", "coherence_status", "reason"]
    # select_rows references the manifest rows, so expected_status may have
    # been added to selected rows; exclusion/review dictionaries are copies.
    details = [key for key in details if key != "expected_status"]
    write_rows(run / "excluded.csv", excluded, details)
    write_rows(run / "review.csv", review, details)
    values = {
        "__MANIFEST_JSON__": sql_literal(json.dumps(selected, ensure_ascii=False)),
        "__EXPECTED_ROWS__": str(len(selected)),
        "__JOURNAL_PATH__": path_literal(run / "applied_row_ids.csv"),
        "__EXISTING_PATH__": path_literal(run / "already_present.csv"),
        "__OTHER_URLS_PATH__": path_literal(run / "same_platform_other_values.csv"),
    }
    template = (SQL / (PREFIX + ".sql")).read_text(encoding="utf-8-sig")
    (run / "apply.sql").write_text(render(template, values), encoding="utf-8")
    meta = {"prepared_at_utc": datetime.now(timezone.utc).isoformat(),
            "policy": "verification_humaine_progressive", "source_sha256": SOURCE_SHA256,
            "manifest_sha256": expected, "selected_sha256": sha(run / "selected.csv"),
            "web_results_sha256": sha(results_path) if results_path.exists() else None,
            "apply_sql_sha256": sha(run / "apply.sql"),
            "selected_rows": len(selected), "excluded_rows": len(excluded),
            "selected_needing_human_review": len(review), "database_executed": False}
    dump(run / "run.json", meta)
    return run, meta


def validate_journal(rows, selected):
    manifest = {r["id_r_s"]: r for r in selected}
    output, seen = [], set()
    for row in rows:
        identifier = str(uuid.UUID(row["id"]))
        if identifier in seen:
            raise ValueError("UUID duplique dans le journal")
        seen.add(identifier)
        snapshot = json.loads(row["row_snapshot"])
        source = manifest.get(row["id_r_s"])
        if not source or row["object_id_v2"] != source["object_id_v2"]:
            raise ValueError("Journal sans provenance dans ce lot")
        expected = {"id": identifier, "object_id": source["expected_object_id_v3"],
                    "kind_id": source["expected_kind_id"], "kind_domain": source["kind_domain"],
                    "value": source["url"]}
        if any(snapshot.get(key) != value for key, value in expected.items()):
            raise ValueError("Snapshot journal different du lot")
        if not all(key in snapshot for key in ("created_at", "updated_at", "is_public", "position")):
            raise ValueError("Snapshot journal incomplet")
        output.append({"id": identifier, "row_snapshot": snapshot})
    return output


def journal(run):
    run = Path(run).resolve()
    meta = json.loads((run / "run.json").read_text(encoding="utf-8"))
    if sha(run / "selected.csv") != meta["selected_sha256"]:
        raise ValueError("Selection du run modifiee")
    rows = validate_journal(read_rows(run / "applied_row_ids.csv"), read_rows(run / "selected.csv"))
    output = new_run(run / "verification")
    payload = sql_literal(json.dumps(rows, ensure_ascii=False))
    for suffix in ("postverify", "rollback"):
        values = {"__JOURNAL_JSON__": payload}
        if suffix == "rollback":
            values.update({"__SKIPPED_PATH__": path_literal(output / "changed_preserved.csv"),
                           "__DELETED_PATH__": path_literal(output / "deleted.csv")})
        template = (SQL / (PREFIX + "_" + suffix + ".sql")).read_text(encoding="utf-8-sig")
        (output / (suffix + ".sql")).write_text(render(template, values), encoding="utf-8")
    dump(output / "journal_provenance.json", {"journal_sha256": sha(run / "applied_row_ids.csv"), "rows": len(rows)})
    return output, {"journal_rows": len(rows), "database_executed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "journal"))
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    directory, meta = prepare(args.directory) if args.mode == "prepare" else journal(args.directory)
    print(json.dumps({"directory": str(directory), **meta}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
