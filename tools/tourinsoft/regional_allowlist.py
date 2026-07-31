"""Single source of truth for the regional Tourinsoft extension allowlist."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


PROFILE_BY_FEED = {
    "decouverte": "tourinsoft_reunion_decouverte_v1",
    "hebergement": "tourinsoft_reunion_hebergement_v1",
    "information_service": "tourinsoft_reunion_information_service_v1",
    "loisir_plein_air": "tourinsoft_reunion_loisir_plein_air_v1",
    "restauration": "tourinsoft_reunion_restauration_v1",
    "transport": "tourinsoft_reunion_transport_v1",
}


def wire_path(path: str) -> str:
    """Remove the inventory-only root scope from an actual wire path."""
    return path.removeprefix("object.")


def is_extension_match_key(path: str) -> bool:
    """Return whether an approved leaf is needed only to match a relation safely."""
    path = wire_path(path)
    return (
        path.endswith(".ThesCode")
        or path.endswith(".Coordonnees")
        or path.endswith(".Lien")
        or path.endswith(".URL")
        or path.endswith(".URLvideo")
        or path.endswith(".Photo.Url")
        or path.endswith(".DocumentFichier.Url")
        or path
        in {
            "Tarifs.Datedebutaffichage",
            "Tarifs.Datefinvalidite",
            "Tarifs.MinimumEuro",
            "Tarifs.MaximumEuro",
            "PeriodeOuvertures.Datedebut",
            "PeriodeOuvertures.Datefin",
            "ClassificationType.ThesCode",
        }
    )


def build_extension_allowlist(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Derive profile paths from mapping decisions; excluded paths can never enter."""
    allowlist: list[dict[str, Any]] = []
    for feed, profile in PROFILE_BY_FEED.items():
        present = [row for row in rows if feed in str(row.get("feeds", "")).split("|")]
        paths = sorted({
            wire_path(str(row["path"]))
            for row in present
            if row.get("mapping_status") == "pending_crt"
            or (
                row.get("mapping_status") == "approved"
                and is_extension_match_key(str(row["path"]))
            )
        })
        canonical_keys = sorted({
            wire_path(str(row["path"])).split(".", 1)[0]
            for row in present
            if row.get("mapping_status") == "approved"
            and wire_path(str(row["path"])) != "SyndicObjectID"
        })
        allowlist.append({
            "profile": profile,
            "paths": paths,
            "canonical_keys": canonical_keys,
        })
    return allowlist
