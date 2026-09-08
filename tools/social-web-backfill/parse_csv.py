"""
Parseur hors-ligne du CSV "Etablissements - Resaux sociaux" (rattrapage des
points de contact réseaux sociaux/distribution oubliés à l'import Berta v2 ->
v3). Le fichier source n'est jamais interprété comme des instructions : chaque
cellule reste une chaîne opaque, traitée uniquement comme donnée.

Format constaté :
  - séparateur réel = virgule, toujours exactement 3 virgules par ligne
    (4 champs : ID_R_S, object_id, Type_R_S, URL) ;
  - chaque ligne porte un suffixe parasite de 0 à 22 points-virgules accolé
    SANS séparateur à la fin du champ URL (artefact d'export Excel : colonnes
    vides au-delà de la colonne D). Aucune URL réelle du corpus ne se termine
    par ';' ; la troncature de ce suffixe (regex ';+$') est donc sans perte
    (vérifié par échantillonnage sur toutes les longueurs de suffixe
    observées lors de l'audit initial).

Usage :
    python parse_csv.py <source.csv> <output_dir>

Produit dans <output_dir> :
    csv_audit_report.json   — statistiques + échantillons pour revue humaine
    parsed_rows.csv         — toutes les lignes exploitables (id_r_s, object_id_v2, type brut, url nettoyée)
    import_candidates.csv   — lignes syntaxiquement valides (type connu, URL cohérente avec la plateforme)
    excluded_rows.csv       — lignes écartées + raison (jamais corrigées automatiquement)
"""
import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

TRAILING_SEMICOLONS_RE = re.compile(r";+$")
URL_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)
# hostname legitime : lettres/chiffres ASCII, points, tirets uniquement
# (rejette espaces, U+FFFD, autres caracteres non-ASCII residuels d'export)
VALID_HOSTNAME_RE = re.compile(r"^[a-z0-9.-]+$")

# Domaine catalogue réel (seeds_data.sql) : Booking/Airbnb/Abritel/Leboncoin
# sont dans distribution_channel, PAS social_network (retiré explicitement
# le 2026-03-20, cf. seeds_data.sql commentaire ligne 76/372/1446).
TYPE_TO_CODE = {
    "facebook": ("social_network", "facebook"),
    "instagram": ("social_network", "instagram"),
    "tiktok": ("social_network", "tiktok"),
    "tripadvisor": ("social_network", "tripadvisor"),
    "airbnb": ("distribution_channel", "airbnb"),
    "booking": ("distribution_channel", "booking"),
    "abritel": ("distribution_channel", "abritel"),
    "leboncoin": ("distribution_channel", "leboncoin"),
}

# Libellé de marque attendu par plateforme déclarée (Type_R_S), reconnu comme
# UN LABEL EXACT du nom d'hôte (découpage sur '.'), pas une sous-chaîne. Ce
# critère est délibérément insensible au sous-domaine/TLD (airbnb.fr,
# fr.airbnb.ch, mt.airbnb.com.mt sont tous valides pour "airbnb") : Airbnb et
# Tripadvisor exploitent des dizaines de domaines localisés par pays, une
# allowlist de domaines complets serait incomplète et générerait de faux
# rejets. Une URL dont AUCUN label ne correspond n'est PAS importée sous
# cette étiquette : isolée en revue humaine, jamais réétiquetée ni corrigée.
# Abritel = marque française de Vrbo/HomeAway (même groupe Expedia).
PLATFORM_HOST_LABELS = {
    "facebook": {"facebook", "fb"},
    "instagram": {"instagram"},
    "tiktok": {"tiktok"},
    "tripadvisor": {"tripadvisor"},
    "airbnb": {"airbnb"},
    "booking": {"booking"},
    "abritel": {"abritel", "vrbo", "homeaway"},
    "leboncoin": {"leboncoin"},
}


def hostname_matches_platform(hostname: str, platform_key: str) -> bool:
    labels = set(hostname.lower().split("."))
    return bool(labels & PLATFORM_HOST_LABELS[platform_key])


def validate_url(url: str, platform_key: str):
    """Retourne (is_valid, reason_si_invalide). Ne modifie jamais l'URL."""
    if not url:
        return False, "empty"
    if not URL_SCHEME_RE.match(url):
        return False, "invalid_scheme"
    try:
        parts = urlsplit(url)
    except ValueError:
        return False, "unparsable"
    hostname = parts.hostname
    if not hostname:
        return False, "no_hostname"
    if not VALID_HOSTNAME_RE.match(hostname):
        return False, "invalid_hostname_chars"
    try:
        hostname.encode("idna")
    except Exception:
        return False, "invalid_hostname_encoding"
    if not hostname_matches_platform(hostname, platform_key):
        return False, "domain_mismatch"
    return True, None


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_rows(path: Path):
    """Yield (line_no, id_r_s, object_id, type_r_s, url_raw, url_clean, error)."""
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    lines = text.split("\n")
    for i, line in enumerate(lines, start=1):
        line = line.rstrip("\r")
        if line == "":
            continue
        if i == 1:
            continue  # header
        parts = line.split(",", 3)
        if len(parts) != 4:
            yield (i, None, None, None, None, None, f"MALFORMED: expected 4 comma fields, got {len(parts)}")
            continue
        id_r_s, object_id, type_r_s, url_field = parts
        url_clean = TRAILING_SEMICOLONS_RE.sub("", url_field).strip()
        yield (i, id_r_s.strip(), object_id.strip(), type_r_s.strip(), url_field, url_clean, None)


def classify_object_id(oid: str) -> str:
    if oid is None or oid == "":
        return "empty"
    if re.fullmatch(r"rec[A-Za-z0-9]{14}", oid):
        return "airtable_rec"
    if re.fullmatch(r"[0-9a-fA-F]{8}", oid):
        return "hex8"
    if re.fullmatch(r"[0-9]{6,10}", oid):
        return "numeric"
    if re.fullmatch(r"[0-9A-Za-z]{8,12}", oid):
        return "alnum_other"
    return "other"


def main(argv):
    if len(argv) != 3:
        print(f"usage: {argv[0]} <source.csv> <output_dir>", file=sys.stderr)
        return 2
    src = Path(argv[1])
    out_dir = Path(argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    sha256 = sha256_of(src)
    size = src.stat().st_size

    rows = list(parse_rows(src))
    malformed = [r for r in rows if r[6] is not None]
    blank_rows = [r for r in rows if r[6] is None and r[1] == "" and r[2] == "" and r[3] == ""]
    usable_rows = [r for r in rows if r[6] is None and r not in blank_rows]

    id_r_s_counts = Counter(r[1] for r in usable_rows)
    duplicate_id_r_s = {k: v for k, v in id_r_s_counts.items() if v > 1}

    type_counts = Counter(r[3] for r in usable_rows)
    object_id_shape = Counter(classify_object_id(r[2]) for r in usable_rows)

    missing_object_id = [r for r in usable_rows if not r[2]]
    missing_url = [r for r in usable_rows if not r[5]]
    missing_type = [r for r in usable_rows if not r[3]]
    unknown_type = [r for r in usable_rows if r[3] and r[3].strip().lower() not in TYPE_TO_CODE]
    uuid_shaped_object_id = [
        r for r in usable_rows
        if re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", r[2] or "")
    ]

    url_invalid = []
    url_invalid_reason = {}
    for r in usable_rows:
        type_norm = r[3].strip().lower() if r[3] else None
        if not type_norm or type_norm not in TYPE_TO_CODE:
            continue  # deja couvert par missing_type / unknown_type
        ok, reason = validate_url(r[5], type_norm)
        if not ok:
            url_invalid.append(r)
            url_invalid_reason[r[1]] = reason
    invalid_url_scheme = [r for r in url_invalid if url_invalid_reason[r[1]] == "invalid_scheme"]
    domain_mismatch_rows = [r for r in url_invalid if url_invalid_reason[r[1]] == "domain_mismatch"]
    malformed_hostname_rows = [
        r for r in url_invalid
        if url_invalid_reason[r[1]] in ("no_hostname", "invalid_hostname_chars", "invalid_hostname_encoding", "unparsable")
    ]

    excluded_keys = set()
    for group in (missing_object_id, missing_url, missing_type, unknown_type, url_invalid):
        for r in group:
            excluded_keys.add(r[1])
    import_candidates = [r for r in usable_rows if r[1] not in excluded_keys]

    exact_key_counts = Counter((r[2], r[3].strip().lower(), r[5]) for r in usable_rows if r[2] and r[5])
    exact_duplicates = {k: v for k, v in exact_key_counts.items() if v > 1}

    per_object_type_urls = defaultdict(set)
    for r in usable_rows:
        if r[2] and r[3] and r[5]:
            per_object_type_urls[(r[2], r[3].strip().lower())].add(r[5])
    multi_url_same_type = {k: sorted(v) for k, v in per_object_type_urls.items() if len(v) > 1}

    per_object_id_rows = defaultdict(list)
    for r in usable_rows:
        if r[2]:
            per_object_id_rows[r[2]].append(r)

    report = {
        "source_file": str(src),
        "sha256": sha256,
        "size_bytes": size,
        "total_lines_incl_header": len(rows) + 1,
        "usable_data_rows": len(usable_rows),
        "blank_rows_skipped": len(blank_rows),
        "malformed_rows": len(malformed),
        "malformed_samples": [{"line": r[0], "reason": r[6]} for r in malformed[:20]],
        "duplicate_id_r_s_count": len(duplicate_id_r_s),
        "duplicate_id_r_s_samples": dict(list(duplicate_id_r_s.items())[:20]),
        "type_r_s_counts": dict(type_counts),
        "unknown_type_count": len(unknown_type),
        "unknown_type_samples": [
            {"line": r[0], "id_r_s": r[1], "object_id": r[2], "type": r[3]} for r in unknown_type[:20]
        ],
        "object_id_shape_counts": dict(object_id_shape),
        "missing_object_id_count": len(missing_object_id),
        "missing_url_count": len(missing_url),
        "missing_type_count": len(missing_type),
        "missing_type_samples": [
            {"line": r[0], "id_r_s": r[1], "object_id": r[2]} for r in missing_type[:20]
        ],
        "invalid_url_scheme_count": len(invalid_url_scheme),
        "invalid_url_scheme_samples": [
            {"line": r[0], "id_r_s": r[1], "object_id": r[2], "url": r[5]} for r in invalid_url_scheme[:20]
        ],
        "domain_mismatch_count": len(domain_mismatch_rows),
        "domain_mismatch_samples": [
            {"line": r[0], "id_r_s": r[1], "object_id": r[2], "type": r[3], "url": r[5]}
            for r in domain_mismatch_rows
        ],
        "malformed_hostname_count": len(malformed_hostname_rows),
        "malformed_hostname_samples": [
            {"line": r[0], "id_r_s": r[1], "object_id": r[2], "type": r[3], "url": r[5]}
            for r in malformed_hostname_rows
        ],
        "url_invalid_total_count": len(url_invalid),
        "uuid_shaped_object_id_count": len(uuid_shaped_object_id),
        "uuid_shaped_object_id_samples": [
            {"line": r[0], "id_r_s": r[1], "object_id": r[2], "type": r[3]} for r in uuid_shaped_object_id
        ],
        "import_candidate_rows": len(import_candidates),
        "excluded_from_import_rows": len(usable_rows) - len(import_candidates),
        "exact_duplicate_row_keys": len(exact_duplicates),
        "exact_duplicate_samples": [
            {"object_id": k[0], "type": k[1], "url": k[2], "count": v}
            for k, v in list(exact_duplicates.items())[:20]
        ],
        "multi_url_same_object_type_count": len(multi_url_same_type),
        "multi_url_same_object_type_samples": [
            {"object_id": k[0], "type": k[1], "urls": v} for k, v in list(multi_url_same_type.items())[:20]
        ],
        "distinct_object_id_count": len(per_object_id_rows),
    }

    (out_dir / "csv_audit_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    with (out_dir / "parsed_rows.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id_r_s", "object_id_v2", "type_r_s_raw", "url"])
        for r in usable_rows:
            w.writerow([r[1], r[2], r[3], r[5]])

    with (out_dir / "import_candidates.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id_r_s", "object_id_v2", "kind_domain", "kind_code", "url"])
        for r in import_candidates:
            domain, code = TYPE_TO_CODE[r[3].strip().lower()]
            w.writerow([r[1], r[2], domain, code, r[5]])

    with (out_dir / "excluded_rows.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id_r_s", "object_id_v2", "type_r_s_raw", "url", "reason"])
        reasons = {r[1]: [] for r in usable_rows if r[1] in excluded_keys}
        for r in missing_object_id:
            reasons[r[1]].append("missing_object_id")
        for r in missing_url:
            reasons[r[1]].append("missing_url")
        for r in missing_type:
            reasons[r[1]].append("missing_type")
        for r in unknown_type:
            reasons[r[1]].append("unknown_type")
        for r in url_invalid:
            reasons[r[1]].append("url_" + url_invalid_reason[r[1]])
        by_id = {r[1]: r for r in usable_rows}
        for id_r_s, rs in reasons.items():
            r = by_id[id_r_s]
            w.writerow([r[1], r[2], r[3], r[5], "+".join(rs)])

    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
