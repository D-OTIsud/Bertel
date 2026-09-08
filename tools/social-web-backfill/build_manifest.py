"""
Assemble le manifeste GELÉ du backfill réseaux sociaux/distribution
(Berta v2 -> v3), à partir de trois exports déjà produits :

  1. import_candidates.csv : id_r_s, object_id_v2, kind_domain, kind_code, url
     (sortie de parse_csv.py — validation syntaxique/domaine déjà faite).
  2. v2_to_v3.tsv : object_id_v2, object_id_v3
     (résultat d'un JOIN en LECTURE SEULE contre object_origin
     WHERE source_system = 'berta_v2_csv_export', exécuté via psql dans une
     transaction BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY ;
     colonne vide = ancien ID sans correspondance, jamais deviné).
  3. kind_ids.tsv : domain, code, id
     (les 8 UUID ref_code correspondant aux (kind_domain, kind_code) attendus,
     lus en LECTURE SEULE dans la même transaction).

Le manifeste produit fige, pour chaque ligne candidate RÉSOLUE (object_id_v2
trouvé dans object_origin) : id_r_s, object_id_v2, expected_object_id_v3,
kind_domain, kind_code, expected_kind_id, url. Les lignes sans correspondance
restent HORS manifeste (jamais devinées, jamais résolues par nom).

Le SQL d'application ne fait ensuite JAMAIS confiance à une re-résolution
libre de object_origin/ref_code : il réaffirme que la ligne vivante correspond
EXACTEMENT à expected_object_id_v3 / expected_kind_id, et échoue fort (RAISE
EXCEPTION) sinon — ceci empêche qu'un changement de mapping survenu entre cet
audit et l'application fasse silencieusement atterrir une URL sur un autre
objet.

Usage :
    python build_manifest.py <import_candidates.csv> <v2_to_v3.tsv> <kind_ids.tsv> <output_dir>

Produit dans <output_dir> :
    manifest.csv   — pour \\copy côté SQL (id_r_s,object_id_v2,expected_object_id_v3,kind_domain,kind_code,expected_kind_id,url)
    manifest.json  — même contenu + métadonnées (horodatage, comptes, sha256 des entrées source)
    manifest.sha256 — empreinte de manifest.csv (le runner SQL vérifie cette empreinte avant de charger le fichier)
"""
import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def read_csv_dicts(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_tsv_dicts(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def main(argv):
    if len(argv) != 5:
        print(
            f"usage: {argv[0]} <import_candidates.csv> <v2_to_v3.tsv> <kind_ids.tsv> <output_dir>",
            file=sys.stderr,
        )
        return 2

    candidates_path, v2v3_path, kinds_path, out_dir = (Path(a) for a in argv[1:])
    out_dir.mkdir(parents=True, exist_ok=True)

    candidates = read_csv_dicts(candidates_path)
    v2v3_rows = read_tsv_dicts(v2v3_path)
    kind_rows = read_tsv_dicts(kinds_path)

    v2_to_v3 = {r["object_id_v2"]: r["object_id_v3"] for r in v2v3_rows if r.get("object_id_v3")}
    kind_id = {(r["domain"], r["code"]): r["id"] for r in kind_rows}

    missing_kind = {
        (c["kind_domain"], c["kind_code"])
        for c in candidates
        if (c["kind_domain"], c["kind_code"]) not in kind_id
    }
    if missing_kind:
        raise SystemExit(f"kind_ids.tsv incomplet, manquants: {sorted(missing_kind)}")

    seen_id_r_s = set()
    manifest_rows = []
    unmatched_count = 0
    for c in candidates:
        if c["id_r_s"] in seen_id_r_s:
            raise SystemExit(f"id_r_s dupliqué dans import_candidates.csv: {c['id_r_s']}")
        seen_id_r_s.add(c["id_r_s"])

        v3 = v2_to_v3.get(c["object_id_v2"])
        if not v3:
            unmatched_count += 1
            continue

        manifest_rows.append(
            {
                "id_r_s": c["id_r_s"],
                "object_id_v2": c["object_id_v2"],
                "expected_object_id_v3": v3,
                "kind_domain": c["kind_domain"],
                "kind_code": c["kind_code"],
                "expected_kind_id": kind_id[(c["kind_domain"], c["kind_code"])],
                "url": c["url"],
            }
        )

    fieldnames = [
        "id_r_s",
        "object_id_v2",
        "expected_object_id_v3",
        "kind_domain",
        "kind_code",
        "expected_kind_id",
        "url",
    ]
    manifest_csv_path = out_dir / "manifest.csv"
    with manifest_csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in manifest_rows:
            w.writerow(row)

    sha256 = hashlib.sha256(manifest_csv_path.read_bytes()).hexdigest()
    (out_dir / "manifest.sha256").write_text(sha256 + "\n", encoding="utf-8")

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_rows_in": len(candidates),
        "manifest_rows_out": len(manifest_rows),
        "unmatched_excluded": unmatched_count,
        "distinct_expected_objects": len({r["expected_object_id_v3"] for r in manifest_rows}),
        "manifest_csv_sha256": sha256,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps({"meta": meta, "rows": manifest_rows}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(json.dumps(meta, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
