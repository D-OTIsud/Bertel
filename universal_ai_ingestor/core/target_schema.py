"""Canonical target schema rules for the Bertel staging tables.

Each TargetTableRule declares:
  - which staging table the data lands in
  - the set of allowed columns (with rich alias lists in both EN and FR)
  - which transforms are legal for that table

The alias lists are the main lever for improving rule-based mapping accuracy:
if a source column normalizes to any alias, it gets a high-confidence match.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TargetColumnRule:
    column: str
    aliases: tuple[str, ...]
    default_transform: str = "identity"
    required_for_entity: bool = False


@dataclass(frozen=True)
class TargetTableRule:
    table: str
    entity: str
    description: str
    allowed_transforms: tuple[str, ...]
    columns: tuple[TargetColumnRule, ...]


TARGET_SCHEMA_RULES: dict[str, TargetTableRule] = {
    # ------------------------------------------------------------------
    # object_temp -- primary entity (person, place, company, POI...)
    # ------------------------------------------------------------------
    "object_temp": TargetTableRule(
        table="object_temp",
        entity="object",
        description="Main entity table. Every imported row usually resolves to one object_temp record. Objects can be places, companies, people, POIs, etc.",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "name",
                ("name", "nom", "raison_sociale", "denomination", "titre", "title",
                 "label", "libelle", "intitule", "object_name", "nom_commercial",
                 "nom_etablissement", "nom_lieu", "etablissement", "enseigne",
                 "business_name", "company_name", "full_name", "display_name"),
                required_for_entity=True,
            ),
            TargetColumnRule(
                "object_type",
                ("object_type", "type", "category", "categorie", "type_objet",
                 "entity_type", "kind", "genre", "nature", "classification",
                 "type_etablissement", "type_structure"),
                required_for_entity=True,
            ),
            TargetColumnRule(
                "external_id",
                ("external_id", "source_id", "partner_id", "id_externe", "id",
                 "identifiant", "reference", "ref", "code", "numero",
                 "siret", "siren", "naf", "ape", "rna", "id_source"),
            ),
            TargetColumnRule(
                "source_org_object_id",
                ("organization_id", "org_id", "org_object_id", "id_organisation",
                 "id_organisme", "structure_id"),
            ),
            TargetColumnRule(
                "org_name",
                ("organization_name", "org_name", "owner_org_name", "nom_organisme",
                 "nom_organisation", "structure", "proprietaire"),
            ),
            TargetColumnRule(
                "email",
                ("email", "mail", "courriel", "e_mail", "adresse_email",
                 "contact_email", "email_address", "adresse_courriel",
                 "email_contact", "adresse_mail"),
            ),
            TargetColumnRule(
                "phone",
                ("phone", "telephone", "mobile", "tel", "fax", "numero_telephone",
                 "tel_fixe", "tel_mobile", "gsm", "phone_number", "portable",
                 "numero_mobile", "numero_tel"),
            ),
            TargetColumnRule(
                "latitude",
                ("latitude", "lat", "coord_lat", "y", "geo_lat"),
            ),
            TargetColumnRule(
                "longitude",
                ("longitude", "lon", "lng", "coord_lon", "x", "geo_lon", "geo_lng"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # org_temp -- organization resolution
    # ------------------------------------------------------------------
    "org_temp": TargetTableRule(
        table="org_temp",
        entity="organization",
        description="Organizations that own or manage objects. If the source lists separate org data, map it here.",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "name",
                ("org_name", "organization", "organisme", "structure",
                 "nom_organisation", "nom_organisme", "societe", "company",
                 "proprietaire", "gestionnaire", "mandataire"),
                required_for_entity=True,
            ),
            TargetColumnRule(
                "source_org_object_id",
                ("org_id", "organization_id", "id_organisation", "id_organisme"),
            ),
            TargetColumnRule(
                "external_id",
                ("org_external_id", "id_externe_org", "siret_org", "siren_org"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # object_location_temp -- address + GPS
    # ------------------------------------------------------------------
    "object_location_temp": TargetTableRule(
        table="object_location_temp",
        entity="object_location",
        description="Physical address and/or GPS coordinates for an object. One object can have multiple locations.",
        allowed_transforms=("identity", "split_gps"),
        columns=(
            TargetColumnRule("latitude", ("latitude", "lat", "coord_lat", "y", "geo_lat")),
            TargetColumnRule("longitude", ("longitude", "lon", "lng", "coord_lon", "x", "geo_lon", "geo_lng")),
            TargetColumnRule(
                "address1",
                ("address", "address1", "adresse", "adresse1", "adresse_postale",
                 "rue", "voie", "street", "street_address", "adresse_ligne1",
                 "numero_voie", "adresse_complete"),
            ),
            TargetColumnRule(
                "city",
                ("city", "ville", "commune", "localite", "town", "municipality",
                 "nom_commune", "lieu_dit"),
            ),
            TargetColumnRule(
                "postcode",
                ("postcode", "postal_code", "cp", "zip", "code_postal", "zipcode",
                 "zip_code", "cedex", "code_commune"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # contact_channel_temp -- email, phone, website, social
    # ------------------------------------------------------------------
    "contact_channel_temp": TargetTableRule(
        table="contact_channel_temp",
        entity="contact",
        description="Contact channels for objects: email, phone, website, social URLs. Each channel gets its own row with a kind_code.",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "value",
                ("email", "mail", "courriel", "phone", "telephone", "tel", "mobile",
                 "fax", "website", "site_web", "url", "lien", "facebook",
                 "instagram", "twitter", "linkedin", "tiktok", "youtube",
                 "site_internet", "page_facebook", "compte_instagram",
                 "numero_telephone", "portable", "gsm"),
            ),
            TargetColumnRule(
                "kind_code",
                ("kind_code", "contact_kind", "contact_type", "type_contact",
                 "canal", "channel"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # object_org_link_temp -- links objects to orgs
    # ------------------------------------------------------------------
    "object_org_link_temp": TargetTableRule(
        table="object_org_link_temp",
        entity="object_org_link",
        description="Links objects to organizations with a role (owner, manager, etc.).",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "role_code",
                ("role", "role_code", "fonction", "lien", "relation",
                 "type_lien", "ownership_type"),
            ),
            TargetColumnRule(
                "is_primary",
                ("is_primary", "principal", "primaire", "main"),
            ),
            TargetColumnRule(
                "note",
                ("note", "commentaire", "comment", "remarque", "observation",
                 "description_lien", "precision"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # object_classification_temp -- scheme + value pairs
    # ------------------------------------------------------------------
    "object_classification_temp": TargetTableRule(
        table="object_classification_temp",
        entity="classification",
        description="Classification tags: scheme_code identifies the taxonomy (e.g. 'naf_code', 'star_rating'), value_code is the specific value.",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "scheme_code",
                ("scheme_code", "classification_scheme", "taxonomy", "nomenclature",
                 "type_classement", "classement"),
            ),
            TargetColumnRule(
                "value_code",
                ("value_code", "classification_value", "classement_valeur",
                 "etoiles", "stars", "star_rating", "ranking", "rang",
                 "niveau", "level", "grade", "note_qualite"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # media_temp -- images, documents, URLs
    # ------------------------------------------------------------------
    "media_temp": TargetTableRule(
        table="media_temp",
        entity="media",
        description="Media files: images, photos, document URLs linked to objects.",
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule(
                "source_url",
                ("media_url", "image_url", "photo_url", "photos", "images",
                 "media_urls", "galerie", "gallery", "illustration",
                 "url_photo", "lien_image", "lien_photo", "photo",
                 "image", "fichier", "document_url", "url_media"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # object_amenity_temp -- equipment / facilities
    # ------------------------------------------------------------------
    "object_amenity_temp": TargetTableRule(
        table="object_amenity_temp",
        entity="amenity",
        description="Amenities, equipment, and facility features for objects (e.g. parking, wifi, pool).",
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule(
                "amenity_code",
                ("amenity", "amenities", "amenity_codes", "equipments",
                 "equipement", "equipements", "prestations", "services",
                 "installations", "facilities", "features", "commodites"),
            ),
        ),
    ),
    # ------------------------------------------------------------------
    # object_payment_method_temp -- accepted payment methods
    # ------------------------------------------------------------------
    "object_payment_method_temp": TargetTableRule(
        table="object_payment_method_temp",
        entity="payment",
        description="Payment methods accepted by the object (e.g. CB, cash, check).",
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule(
                "payment_code",
                ("payment", "payment_codes", "payment_methods", "moyens_paiement",
                 "paiement", "mode_paiement", "modes_paiement", "cb", "cheque"),
            ),
        ),
    ),
}

VALID_TRANSFORMS: set[str] = {"identity", "lowercase", "split_list", "split_gps"}

# Pre-built lookup: normalized_alias -> (table, column, default_transform)
_ALIAS_INDEX: dict[str, tuple[str, str, str]] = {}
for _table_key, _table_rule in TARGET_SCHEMA_RULES.items():
    for _col_rule in _table_rule.columns:
        for _alias in _col_rule.aliases:
            _ALIAS_INDEX[_alias.lower()] = (_table_key, _col_rule.column, _col_rule.default_transform)


def flatten_required_columns() -> dict[str, set[str]]:
    required: dict[str, set[str]] = {}
    for table, rule in TARGET_SCHEMA_RULES.items():
        required[table] = {col.column for col in rule.columns if col.required_for_entity}
    return required


def build_target_schema_context() -> dict[str, object]:
    tables: list[dict[str, object]] = []
    for rule in TARGET_SCHEMA_RULES.values():
        tables.append(
            {
                "table": rule.table,
                "entity": rule.entity,
                "description": rule.description,
                "allowed_transforms": list(rule.allowed_transforms),
                "columns": [
                    {
                        "column": col.column,
                        "aliases": list(col.aliases),
                        "required": col.required_for_entity,
                        "default_transform": col.default_transform,
                    }
                    for col in rule.columns
                ],
            }
        )
    return {
        "target_tables": tables,
        "required_columns_by_table": {k: sorted(v) for k, v in flatten_required_columns().items()},
        "relationship_hints": [
            "object_temp is the PRIMARY entity. Most source fields map here unless they clearly belong to a sub-table.",
            "org_temp is for organization-level data that needs its own resolution cycle.",
            "object_org_link_temp links objects to organizations (ownership, management roles).",
            "contact_channel_temp holds individual contact entries (email, phone, social). Each contact becomes one row with a kind_code.",
            "object_location_temp stores physical addresses and GPS. If source has address fields, map them here, NOT to object_temp.",
            "object_classification_temp stores typed tags like star ratings, quality levels, NAF codes.",
            "media_temp stores image/photo URLs. If a column has multiple URLs separated by comma/pipe, use split_list transform.",
            "object_amenity_temp and object_payment_method_temp model many-to-one feature lists.",
            "Fields like 'Commentaire', 'Description', 'Notes' that describe the object should map to object_temp.name if no dedicated column exists, or be skipped.",
            "Fields like 'User', 'Moderer', 'Date' that are metadata about the source record (who entered it, moderation status, entry date) should typically be SKIPPED.",
        ],
    }


def find_best_target(source_column_normalized: str) -> tuple[str, str, str, float, str]:
    """Find the best staging table + column for a normalized source column name.

    Returns (table, column, transform, confidence, rationale).
    """
    exact = _ALIAS_INDEX.get(source_column_normalized)
    if exact:
        return (
            exact[0],
            exact[1],
            exact[2],
            0.95,
            f"Exact alias match: {exact[0]}.{exact[1]}",
        )

    best: tuple[str, str, str, float, str] | None = None
    for alias, (table, column, transform) in _ALIAS_INDEX.items():
        if len(alias) < 3:
            continue
        if alias in source_column_normalized or source_column_normalized in alias:
            score = 0.82
            length_ratio = min(len(alias), len(source_column_normalized)) / max(len(alias), len(source_column_normalized))
            score = 0.70 + 0.15 * length_ratio
            if best is None or score > best[3]:
                best = (table, column, transform, round(score, 2), f"Fuzzy alias match: {table}.{column}")
    if best:
        return best

    skip_patterns = (
        "formulaire", "source_sheet", "row_index", "row_number",
        "unnamed", "moderer", "moderateur", "moderator",
        "date_creation", "date_modification", "created_at", "updated_at",
        "user", "utilisateur", "auteur", "author",
    )
    for pat in skip_patterns:
        if pat in source_column_normalized:
            return (
                "object_temp",
                "name",
                "identity",
                0.15,
                f"Likely metadata/admin field (matched '{pat}'). Recommend skipping.",
            )

    return (
        "object_temp",
        "name",
        "identity",
        0.25,
        "No schema match found. Manual mapping required.",
    )


def validate_mapping_target(target_table: str, target_column: str, transform: str) -> tuple[bool, str]:
    table_rule = TARGET_SCHEMA_RULES.get(target_table)
    if not table_rule:
        return False, f"Unsupported target_table '{target_table}'"
    allowed_columns = {col.column for col in table_rule.columns}
    if target_column not in allowed_columns:
        return False, f"Unsupported target_column '{target_column}' for table '{target_table}'"
    if transform not in VALID_TRANSFORMS:
        return False, f"Unsupported transform '{transform}'"
    if transform not in table_rule.allowed_transforms:
        return False, f"Transform '{transform}' not allowed for table '{target_table}'"
    return True, "ok"
