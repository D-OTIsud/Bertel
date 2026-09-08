"""Selection apres decision utilisateur: verification humaine progressive.
Les liens inaccessibles au robot restent candidats; seules les preuves connues
d'indisponibilite ou d'incoherence excluent une ligne. Aucune requete reseau.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

def read_rows(path):
    with Path(path).open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))

def write_rows(path, rows, columns):
    with Path(path).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

def select_rows(manifest, results):
    by_id = {}
    for result in results:
        source_id = result["id_r_s"]
        if source_id in by_id:
            raise ValueError(f"Resultat web duplique: {source_id}")
        by_id[source_id] = result
    seen = set()
    selected, excluded, review = [], [], []
    for row in manifest:
        source_id = row["id_r_s"]
        if not source_id or source_id in seen:
            raise ValueError(f"ID_R_S vide ou duplique: {source_id}")
        seen.add(source_id)
        result = by_id.get(source_id)
        if result and any(result[key] != row[key] for key in ("object_id_v2", "url")):
            raise ValueError(f"Resultat web desaligne: {source_id}")
        trusted = result if result and result.get("classification_version") == "5" else {}
        status = trusted.get("check_status", "NOT_CHECKED")
        coherence = trusted.get("coherence_status", "UNVERIFIED")
        detail = {**row, "check_status": status, "coherence_status": coherence,
                  "reason": trusted.get("reason", "Verification ulterieure par les utilisateurs")}
        if status in {"CONFIRMED_UNAVAILABLE", "REDIRECT_REVIEW"} or coherence == "MISMATCH":
            excluded.append(detail)
        else:
            selected.append(row)
            if (status, coherence) != ("REACHABLE", "CONSISTENT"):
                review.append(detail)
    return selected, excluded, review

def main(argv):
    if len(argv) != 4:
        raise SystemExit("usage: filter_manifest_by_url_check.py manifest.csv results.csv output_dir")
    manifest_path, results_path, output = map(Path, argv[1:])
    manifest = read_rows(manifest_path)
    results = read_rows(results_path) if results_path.exists() else []
    selected, excluded, review = select_rows(manifest, results)
    output.mkdir(parents=True, exist_ok=True)
    columns = list(manifest[0]) if manifest else []
    details = columns + ["check_status", "coherence_status", "reason"]
    write_rows(output / "manifest_filtered_for_apply.csv", selected, columns)
    write_rows(output / "manifest_excluded_url_dead_or_mismatch.csv", excluded, details)
    write_rows(output / "manifest_excluded_url_review.csv", review, details)
    summary = {"policy": "verification_humaine_progressive", "manifest_rows": len(manifest),
               "selected_rows": len(selected), "excluded_dead_or_mismatch": len(excluded),
               "selected_needing_human_review": len(review),
               "web_results_sha256": hashlib.sha256(results_path.read_bytes()).hexdigest() if results_path.exists() else None}
    (output / "selection_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
