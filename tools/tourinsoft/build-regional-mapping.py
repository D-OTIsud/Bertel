#!/usr/bin/env python3
"""Classify every declared Tourinsoft regional path against the Bertel export.

The rules are intentionally conservative: a path is approved only when the
regional serializer has a typed canonical source. Legitimate target-only fields
remain round-trippable through object_interop_extension but pending CRT review.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

from regional_allowlist import build_extension_allowlist


FIELDS = [
    "path", "scope", "collection", "field", "feeds", "reuse_class",
    "bertel_source", "transform", "mapping_status", "review_status",
    "implementation", "evidence", "notes",
]

ROOT_SOURCES = {
    "SyndicObjectName": ("object.name", "direct"),
    "Nometablissement": ("object.name", "direct"),
    "ObjectTypeName": ("ref_interop_value_crosswalk.target_label", "profile_crosswalk"),
    "ObjectTypeFix": ("ref_interop_value_crosswalk.target_external_id", "profile_crosswalk"),
    "Published": ("object.published_at | object.updated_at", "iso_datetime"),
    "Updated": ("object.updated_at", "iso_datetime"),
    "EnLigne": ("object.status", "published_to_true"),
    "Adresse1": ("object_location.address1", "main_location"),
    "Adresse2": ("object_location.address2", "main_location"),
    "Adresse3": ("object_location.address3", "main_location"),
    "CodePostal": ("object_location.postcode", "main_location"),
    "Commune": ("object_location.city", "main_location"),
    "CodeINSEE": ("object_location.code_insee", "main_location"),
    "GmapLatitude": ("object_location.latitude", "decimal_string"),
    "GmapLongitude": ("object_location.longitude", "decimal_string"),
    "SIRET": ("object_legal.value", "active_public_siret"),
    "Menuenfant": ("object_menu", "public_child_menu_exists"),
    "Ouvertdimanchesoir": ("opening_*", "sunday_frame_after_18h"),
    "Receptiongroupe": ("object_group_policy", "policy_exists"),
    "Groupeaccepte": ("object_group_policy", "policy_exists"),
}

CODE_COLLECTIONS = {
    "LanguesParleess": "object_language + ref_language",
    "ModesPaiements": "object_payment_method + ref_code_payment_method",
    "PrestationsEquipementss": "object_amenity + ref_amenity",
    "Localisations": "object_environment_tag + ref_code_environment_tag",
    "Localisationss": "object_environment_tag + ref_code_environment_tag",
    "Thematiques": "object_environment_tag + ref_code_environment_tag",
    "Typecuisines": "object_cuisine_type + ref_code_cuisine_type",
    "Labels": "object_classification + ref_classification_scheme",
    "Marques": "object_classification + ref_classification_scheme",
}

TECHNICAL_FIELDS = {"Ordre", "ThesOrdre", "ThesPicto"}
IDENTITY_PENDING_FIELDS = {"ID", "SyndicObjectId", "ThesID", "SyndicStructureId"}


def mapping_for(row: dict[str, object]) -> tuple[str, str, str, str, str]:
    collection = str(row.get("collection") or "")
    field = str(row["field"])
    leaf = field.rsplit(".", 1)[-1]
    top = field.split(".", 1)[0]

    if collection == "TisTracking" or top == "TisTracking" or field.startswith("TIS_TRACKING_"):
        return "", "excluded_auxiliary", "excluded", "excluded", "Tourinsoft tracking, not business data"
    if collection == "Structure" or top in {"Structure", "Bureau"}:
        return "", "target_managed_provenance", "excluded", "excluded", "Managed by the CRT account/structure"
    if leaf in TECHNICAL_FIELDS or field == "SyndicObjectOrder":
        return "", "excluded_auxiliary", "excluded", "excluded", "Ordering/pictogram metadata"
    if leaf in IDENTITY_PENDING_FIELDS or field == "IdentifiantSoubik":
        return "object_interop_extension", "target_identity_roundtrip", "pending_crt", "pending_crt", "CRT must confirm identifiers required on write"
    if field == "RaisonSociale":
        return "", "excluded_private", "excluded", "excluded", "Bertel legal type is non-public"

    if not collection:
        if field == "SyndicObjectID":
            return (
                "object_interop_extension.external_id",
                "profile_scoped_target_identity",
                "approved",
                "approved",
                "Omitted until the CRT assigns or confirms the identifier; never synthesized from the Bertel UUID",
            )
        if field in ROOT_SOURCES:
            source, transform = ROOT_SOURCES[field]
            return source, transform, "approved", "approved", "Canonical regional serializer"
        if field.startswith("ClassificationType.") and leaf in {"ThesCode", "ThesLibelle"}:
            return "ref_tourinsoft_reunion_profile", "profile_constant", "approved", "approved", "Exact feed profile"
        if field.startswith("ClassificationCategorie.") and leaf in {"ThesCode", "ThesLibelle"}:
            return "object_taxonomy + ref_interop_value_crosswalk", "taxonomy_crosswalk", "approved", "approved", "Information/service scalar category"
        if field.startswith("Lieudit.") and leaf == "ThesLibelle":
            return "object_location.lieu_dit", "thesaurus_shape", "approved", "approved", "Canonical location"

    if collection.startswith("Classification") and leaf in {"ThesCode", "ThesLibelle"}:
        return "object_taxonomy + ref_code", "profile_taxonomy_crosswalk", "approved", "approved", "Family-specific collection name"
    if collection in CODE_COLLECTIONS and leaf in {"ThesCode", "ThesLibelle"}:
        return CODE_COLLECTIONS[collection], "profile_value_crosswalk", "approved", "approved", "Typed canonical mapping"
    if collection in {"Access", "Descriptifaccess"} and field == "Descriptifduplandacces":
        return "object_location.direction", "strip_markdown", "approved", "approved", "Alias selected by profile"
    if collection == "Descriptifss" and field in {"Accroche", "Descriptioncommerciale"}:
        source = "object_description.description_chapo" if field == "Accroche" else "object_description.description"
        return source, "public_french_strip_markdown", "approved", "approved", "Canonical description"
    if collection == "Moyencommunications" and (
        field == "Coordonnees" or
        (top in {"Moyendecommunication", "Typedecoordonnees"} and leaf in {"ThesCode", "ThesLibelle"})
    ):
        return "contact_channel + ref_code_contact_kind", "public_contact_crosswalk", "approved", "approved", "Public contacts only"
    if collection == "Reseauxsociauxs" and (
        field == "URL" or (top == "Typedeplateforme" and leaf in {"ThesCode", "ThesLibelle"})
    ):
        return "object_web_channel + ref_code_social_network", "public_social_crosswalk", "approved", "approved", "Public URLs only"
    if collection == "Reservations" and field == "Lien":
        return "object_web_channel", "public_booking_url", "approved", "approved", "Public booking channels"
    if collection == "Photos" and (field in {"Datedefindutilisation"} or (top == "Photo" and leaf in {"MediaID", "Titre", "Credit", "Url"})):
        return "media", "published_public_unexpired_photo", "approved", "approved", "Rights/publication filtered"
    if collection == "Videos" and field == "URLvideo":
        return "media", "published_public_unexpired_video", "approved", "approved", "Video media type"
    if collection == "Fichiers" and top == "DocumentFichier" and leaf in {"MediaID", "Titre", "Credit", "Url"}:
        return "object_document + ref_document", "public_document", "approved", "approved", "Public document only"
    if collection in {"Animauxs", "Animauxacceptess"} and field in {"Animauxacceptes", "Complementdinformations"}:
        return "object_pet_policy", "profile_alias", "approved", "approved", "Canonical pet policy"
    if collection == "Tarifs" and field in {
        "Nom", "MinimumEuro", "MaximumEuro", "Datedebutaffichage", "Datefinvalidite", "complementtarifs"
    }:
        return "object_price + price references", "stable_public_price", "approved", "approved", "Canonical price"
    if collection == "PeriodeOuvertures" and (
        field in {"Datedebut", "Datefin", "Precisionssurlesouvertures"} or
        re.fullmatch(r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)heure(?:debut|fin)[12]", field)
    ):
        return "opening_period + opening_schedule + opening_time_*", "flatten_weekday_slots", "approved", "approved", "Two stable slots per weekday"
    if collection == "Horairearriveedeparts" and field in {"Heuredarrivee", "Heuredarriveemax", "Heurededepart"}:
        return "object_stay_policy", "time_string", "approved", "approved", "Accommodation only"
    if collection == "Capacites" and field in {
        "Capacite", "Capacitetotale", "Capaciteensalle", "Capaciteenterrasse",
        "Capacitetotalenombredepersonnes", "Nombredelits", "Nombretotaldechambres",
        "Surfacedelhabitation", "Salledereunion"
    }:
        return "object_capacity | object_act | object_meeting_room", "profile_capacity_shape", "approved", "approved", "Includes dedicated terrace_seats metric"
    if collection == "Capacitecampings" and field in {"Capacite", "Nombredeproduits", "Superficieduterrain"}:
        return "object_capacity", "camping_capacity_shape", "approved", "approved", "Camping only"

    if collection == "Typeequipements":
        return "", "excluded_redundant", "excluded", "excluded", "Duplicates profile/category routing"

    return (
        "object_interop_extension.data",
        "profile_scoped_roundtrip",
        "pending_crt",
        "pending_crt",
        "No approved canonical Bertel mapping yet; preserved without loss when supplied by the CRT connector",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract-dir", default="docs/integrations/tourinsoft/reunion-regional-v1")
    args = parser.parse_args()
    contract_dir = Path.cwd() / args.contract_dir
    union = json.loads((contract_dir / "field-union.json").read_text(encoding="utf-8"))
    rows = []
    for item in union:
        source, transform, status, review, notes = mapping_for(item)
        implementation = (
            "api.tourinsoft_reunion_regional_documents"
            if status == "approved"
            else "public.object_interop_extension"
            if status == "pending_crt"
            else "not_exported"
        )
        rows.append({
            "path": item["path"],
            "scope": item["scope"],
            "collection": item["collection"],
            "field": item["field"],
            "feeds": "|".join(item["feeds"]),
            "reuse_class": item["reuse_class"],
            "bertel_source": source,
            "transform": transform,
            "mapping_status": status,
            "review_status": review,
            "implementation": implementation,
            "evidence": "field-union.json",
            "notes": notes,
        })
    output = contract_dir / "field-mapping.csv"
    with output.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    allowlist = build_extension_allowlist(rows)
    allowlist_output = contract_dir / "extension-allowlist.json"
    allowlist_output.write_text(
        json.dumps(allowlist, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    counts = {status: sum(row["mapping_status"] == status for row in rows) for status in ("approved", "pending_crt", "excluded")}
    print(
        f"Tourinsoft regional mapping built: {len(rows)} paths — {counts}; "
        f"{sum(len(entry['paths']) for entry in allowlist)} allowlisted profile paths "
        f"-> {output}, {allowlist_output}"
    )


if __name__ == "__main__":
    main()
