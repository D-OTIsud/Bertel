"""Canonical target schema rules for Bertel staging tables.

Domain model summary (drives all mapping decisions):
──────────────────────────────────────────────────────
• The `object` table is the keystone.  Every entity (hotel, restaurant,
  itinerary, event, *and* organizations) lives here.  `object_type` codes:
  HOT=Hotel, RES=Restaurant, ITI=Itinerary, FMA=Event, ORG=Organisation, etc.

• Organizations are ALSO objects (type ORG).  They are linked to the entities
  they manage via `object_org_link` (N:M, with a role like Owner/Manager).

• Actors (human contacts: director, owner, guide) are separate from objects.
  They have their own tables (actor, actor_object_role, actor_channel) but
  there are NO staging tables for them yet.  Actor data should be stored in
  `object_temp.raw_source_data` JSON for now.

• `external_id` on object_temp is CRITICAL for upsert: it stores the source
  system's native ID so the ingestor can match existing records.

• Addresses / GPS go to `object_location_temp`, NOT object_temp.
• Contact details of the *establishment* go to `contact_channel_temp`.
• Descriptions (short/long text) have no staging table -- store in
  `object_temp.raw_source_data`.
• Opening hours, prices, menus, itinerary geometry have no staging tables --
  store in `object_temp.raw_source_data`.

Staging tables available:
  object_temp, org_temp, object_location_temp, contact_channel_temp,
  object_org_link_temp, object_classification_temp, media_temp,
  object_amenity_temp, object_payment_method_temp,
  ref_code_temp, ref_classification_scheme_temp, ref_classification_value_temp
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


# Object type codes the AI should recognize in source data
KNOWN_OBJECT_TYPES = {
    "HOT": "Hôtel / Hotel",
    "RES": "Restaurant",
    "ITI": "Itinéraire / Itinerary",
    "FMA": "Fête et Manifestation / Event",
    "ORG": "Organisation / Structure",
    "HPA": "Hôtellerie de plein air / Campsite",
    "HLO": "Hébergement locatif / Rental",
    "DEG": "Dégustation / Tasting",
    "COM": "Commerce / Shop",
    "LOI": "Loisirs / Leisure",
    "PCU": "Patrimoine culturel / Cultural heritage",
    "ASC": "Activité sportive / Sport activity",
}


TARGET_SCHEMA_RULES: dict[str, TargetTableRule] = {
    # ------------------------------------------------------------------
    # object_temp -- THE primary entity table (everything resolves here)
    # ------------------------------------------------------------------
    "object_temp": TargetTableRule(
        table="object_temp",
        entity="object",
        description=(
            "The MAIN entity table. Every imported record (hotel, restaurant, "
            "place, POI, event, itinerary, organization) becomes one row here. "
            "The object_type field uses standard codes (HOT, RES, ORG, ITI, FMA...). "
            "The external_id field is CRITICAL for upsert -- it stores the source "
            "system's native ID."
        ),
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "name",
                (
                    "name", "nom", "raison_sociale", "denomination", "titre", "title",
                    "label", "libelle", "intitule", "object_name", "nom_commercial",
                    "nom_etablissement", "nom_lieu", "etablissement", "enseigne",
                    "business_name", "company_name", "full_name", "display_name",
                    "nom_structure", "nom_site", "nom_du_lieu", "designation",
                    "appellation", "nom_complet",
                ),
                required_for_entity=True,
            ),
            TargetColumnRule(
                "object_type",
                (
                    "object_type", "type", "category", "categorie", "type_objet",
                    "entity_type", "kind", "genre", "nature", "classification",
                    "type_etablissement", "type_structure", "type_offre",
                    "type_hebergement", "type_activite", "typologie",
                ),
                required_for_entity=True,
            ),
            TargetColumnRule(
                "external_id",
                (
                    "external_id", "source_id", "partner_id", "id_externe", "id",
                    "identifiant", "reference", "ref", "code", "numero",
                    "siret", "siren", "naf", "ape", "rna", "id_source",
                    "id_apidae", "id_tourinsoft", "id_datatourisme", "code_insee",
                    "id_partenaire", "numero_agrement", "ref_externe",
                ),
            ),
            TargetColumnRule(
                "source_org_object_id",
                (
                    "organization_id", "org_id", "org_object_id", "id_organisation",
                    "id_organisme", "structure_id", "id_structure",
                ),
            ),
            TargetColumnRule(
                "org_name",
                (
                    "organization_name", "org_name", "owner_org_name", "nom_organisme",
                    "nom_organisation", "structure", "proprietaire", "gestionnaire",
                    "nom_structure_gestionnaire", "nom_proprietaire",
                ),
            ),
            TargetColumnRule(
                "email",
                (
                    "email", "mail", "courriel", "e_mail", "adresse_email",
                    "contact_email", "email_address", "adresse_courriel",
                    "email_contact", "adresse_mail", "mel",
                ),
            ),
            TargetColumnRule(
                "phone",
                (
                    "phone", "telephone", "mobile", "tel", "fax", "numero_telephone",
                    "tel_fixe", "tel_mobile", "gsm", "phone_number", "portable",
                    "numero_mobile", "numero_tel", "tel_1", "tel_2",
                ),
            ),
            TargetColumnRule(
                "latitude",
                ("latitude", "lat", "coord_lat", "y", "geo_lat", "geo_point_lat"),
            ),
            TargetColumnRule(
                "longitude",
                ("longitude", "lon", "lng", "coord_lon", "x", "geo_lon", "geo_lng", "geo_point_lon"),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # org_temp -- organization resolution
    # Organizations are ALSO objects (type ORG). This table resolves the
    # org identity so object_org_link_temp can reference it.
    # ------------------------------------------------------------------
    "org_temp": TargetTableRule(
        table="org_temp",
        entity="organization",
        description=(
            "Organizations that own or manage objects. An organization is itself "
            "an object (type ORG). If the source data has columns identifying the "
            "managing structure separately (org name, org SIRET), map them here."
        ),
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "name",
                (
                    "org_name", "organization", "organisme", "structure",
                    "nom_organisation", "nom_organisme", "societe", "company",
                    "proprietaire", "gestionnaire", "mandataire",
                    "nom_structure_mere", "group_name", "groupe",
                ),
                required_for_entity=True,
            ),
            TargetColumnRule(
                "source_org_object_id",
                ("org_id", "organization_id", "id_organisation", "id_organisme", "id_structure"),
            ),
            TargetColumnRule(
                "external_id",
                ("org_external_id", "id_externe_org", "siret_org", "siren_org", "siret_structure"),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # object_location_temp -- address + GPS
    # One object can have multiple locations but one must be is_main_location.
    # GPS columns: lat/lon are stored; PostGIS geog2 is auto-computed.
    # ------------------------------------------------------------------
    "object_location_temp": TargetTableRule(
        table="object_location_temp",
        entity="object_location",
        description=(
            "Physical address and GPS for an object. Address fields (street, city, "
            "postcode) ALWAYS go here, NOT in object_temp. An object can have "
            "multiple locations (e.g. start/end of an itinerary). PostGIS geog2 "
            "is auto-computed from lat/lon."
        ),
        allowed_transforms=("identity", "split_gps"),
        columns=(
            TargetColumnRule("latitude", ("latitude", "lat", "coord_lat", "y", "geo_lat", "geo_point_lat")),
            TargetColumnRule("longitude", ("longitude", "lon", "lng", "coord_lon", "x", "geo_lon", "geo_lng", "geo_point_lon")),
            TargetColumnRule(
                "address1",
                (
                    "address", "address1", "adresse", "adresse1", "adresse_postale",
                    "rue", "voie", "street", "street_address", "adresse_ligne1",
                    "numero_voie", "adresse_complete", "adresse_rue",
                    "no_et_rue", "numero_rue", "ligne_adresse",
                ),
            ),
            TargetColumnRule(
                "city",
                (
                    "city", "ville", "commune", "localite", "town", "municipality",
                    "nom_commune", "lieu_dit", "nom_ville", "city_name",
                ),
            ),
            TargetColumnRule(
                "postcode",
                (
                    "postcode", "postal_code", "cp", "zip", "code_postal", "zipcode",
                    "zip_code", "cedex", "code_commune", "code_insee",
                ),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # contact_channel_temp -- establishment contacts (NOT actor contacts)
    # Each channel = one row with a kind_code (EMAIL, PHONE, WEBSITE, etc.)
    # ------------------------------------------------------------------
    "contact_channel_temp": TargetTableRule(
        table="contact_channel_temp",
        entity="contact",
        description=(
            "Contact channels of the ESTABLISHMENT (not of human actors). "
            "Each contact (email, phone, website, social URL) becomes one row. "
            "kind_code is auto-inferred from the value if not provided explicitly "
            "(e.g. an email address -> kind_code=EMAIL)."
        ),
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "value",
                (
                    "email", "mail", "courriel", "phone", "telephone", "tel", "mobile",
                    "fax", "website", "site_web", "url", "lien", "facebook",
                    "instagram", "twitter", "linkedin", "tiktok", "youtube",
                    "site_internet", "page_facebook", "compte_instagram",
                    "numero_telephone", "portable", "gsm", "site_web_url",
                    "url_site", "twitter_url", "facebook_url", "tripadvisor",
                ),
            ),
            TargetColumnRule(
                "kind_code",
                (
                    "kind_code", "contact_kind", "contact_type", "type_contact",
                    "canal", "channel", "type_coordonnee",
                ),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # object_org_link_temp -- links objects to their managing organizations
    # N:M relationship with a role (owner, manager, partner...)
    # ------------------------------------------------------------------
    "object_org_link_temp": TargetTableRule(
        table="object_org_link_temp",
        entity="object_org_link",
        description=(
            "Links an object to its organization(s). role_code defines the "
            "relationship (owner, manager, partner). is_primary marks the main "
            "organization when an object has multiple."
        ),
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "role_code",
                (
                    "role", "role_code", "fonction", "lien", "relation",
                    "type_lien", "ownership_type", "role_org", "type_relation",
                ),
            ),
            TargetColumnRule(
                "is_primary",
                ("is_primary", "principal", "primaire", "main"),
            ),
            TargetColumnRule(
                "note",
                (
                    "note", "commentaire", "comment", "remarque", "observation",
                    "description_lien", "precision", "details",
                ),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # object_classification_temp -- labels and ratings
    # scheme_code = taxonomy name, value_code = specific tag
    # ------------------------------------------------------------------
    "object_classification_temp": TargetTableRule(
        table="object_classification_temp",
        entity="classification",
        description=(
            "Official labels and ratings (e.g. 4 étoiles, Qualité Tourisme). "
            "scheme_code identifies the taxonomy (star_rating, label_qualite...), "
            "value_code is the specific value."
        ),
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule(
                "scheme_code",
                (
                    "scheme_code", "classification_scheme", "taxonomy", "nomenclature",
                    "type_classement", "classement", "type_label", "label_type",
                ),
            ),
            TargetColumnRule(
                "value_code",
                (
                    "value_code", "classification_value", "classement_valeur",
                    "etoiles", "stars", "star_rating", "ranking", "rang",
                    "niveau", "level", "grade", "note_qualite", "label",
                    "classement", "nombre_etoiles", "nb_etoiles",
                ),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # media_temp -- images, documents, videos
    # ------------------------------------------------------------------
    "media_temp": TargetTableRule(
        table="media_temp",
        entity="media",
        description=(
            "Media files linked to objects: photos, videos, documents. "
            "Can be linked to a specific org via org_object_id. "
            "If a column contains multiple URLs separated by comma/pipe, "
            "use split_list transform."
        ),
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule(
                "source_url",
                (
                    "media_url", "image_url", "photo_url", "photos", "images",
                    "media_urls", "galerie", "gallery", "illustration",
                    "url_photo", "lien_image", "lien_photo", "photo",
                    "image", "fichier", "document_url", "url_media",
                    "video_url", "lien_video", "visuel", "vignette",
                ),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # object_amenity_temp -- equipment, facilities, features
    # ------------------------------------------------------------------
    "object_amenity_temp": TargetTableRule(
        table="object_amenity_temp",
        entity="amenity",
        description=(
            "Amenities and equipment: wifi, parking, pool, AC... "
            "Linked to ref_amenity codes. If the source column has a "
            "delimited list, use split_list transform."
        ),
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule(
                "amenity_code",
                (
                    "amenity", "amenities", "amenity_codes", "equipments",
                    "equipement", "equipements", "prestations", "services",
                    "installations", "facilities", "features", "commodites",
                    "confort", "conforts", "standing",
                ),
            ),
        ),
    ),

    # ------------------------------------------------------------------
    # object_payment_method_temp -- accepted payment methods
    # ------------------------------------------------------------------
    "object_payment_method_temp": TargetTableRule(
        table="object_payment_method_temp",
        entity="payment",
        description=(
            "Payment methods accepted: CB, cash, check, ANCV vouchers... "
            "Linked to ref_code_payment_method."
        ),
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule(
                "payment_code",
                (
                    "payment", "payment_codes", "payment_methods", "moyens_paiement",
                    "paiement", "mode_paiement", "modes_paiement", "cb",
                    "cheque", "especes", "ancv", "cheques_vacances",
                ),
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

# Metadata / admin fields that should be auto-skipped
METADATA_PATTERNS: tuple[str, ...] = (
    "formulaire", "source_sheet", "row_index", "row_number",
    "unnamed", "moderer", "moderateur", "moderator",
    "date_creation", "date_modification", "created_at", "updated_at",
    "user", "utilisateur", "auteur", "author", "modified_by",
    "created_by", "date_saisie", "date_maj", "date_import",
    "id_interne", "internal_id", "date_derniere_mise_a_jour",
)

# Columns that hold descriptive text -- no dedicated staging table,
# will land in object_temp.raw_source_data
DESCRIPTION_PATTERNS: tuple[str, ...] = (
    "description", "desc_courte", "desc_longue", "descriptif",
    "description_courte", "description_longue", "resume",
    "presentation", "texte", "mesures_sanitaires", "covid",
    "acces", "info_complementaire", "remarques_internes",
    "comment", "commentaire", "observation", "note",
    "horaires_texte", "tarif_texte", "conditions",
)


def flatten_required_columns() -> dict[str, set[str]]:
    required: dict[str, set[str]] = {}
    for table, rule in TARGET_SCHEMA_RULES.items():
        required[table] = {col.column for col in rule.columns if col.required_for_entity}
    return required


def build_target_schema_context() -> dict[str, object]:
    """Build the full schema context dict passed to the AI mapping agent."""
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
        "known_object_types": KNOWN_OBJECT_TYPES,
        "data_model_overview": (
            "The Bertel database is a tourism CRM. The 'object' table is the central node -- "
            "every entity (hotel, restaurant, itinerary, event, organization) is an object row "
            "with an object_type code (HOT, RES, ITI, FMA, ORG...). "
            "Organizations are ALSO objects (type ORG) linked to other objects via object_org_link. "
            "Actors (human contacts like directors/owners) are separate from objects and have no "
            "staging table yet -- their data goes into raw_source_data JSON. "
            "external_id is critical for upsert: it stores the source system's native ID."
        ),
        "relationship_hints": [
            "object_temp is the PRIMARY entity. Most source fields map here unless they clearly belong to a sub-table.",
            "org_temp resolves organizations. Organizations are also objects (type ORG) that own/manage other objects.",
            "object_org_link_temp links objects to their managing organizations (N:M with role).",
            "contact_channel_temp holds the ESTABLISHMENT's contacts (email, phone, social). NOT personal contacts of humans.",
            "object_location_temp stores addresses + GPS. If source has address/street/city/postcode fields, map them HERE, not object_temp.",
            "object_classification_temp stores official labels and star ratings.",
            "media_temp stores image/photo/document URLs. Use split_list for multi-URL columns.",
            "object_amenity_temp and object_payment_method_temp for equipment and payment method lists.",
            "Descriptive text (description, presentation, horaires_texte) has NO staging table -- it goes to raw_source_data.",
            "Actor/human data (directeur, contact name, personne) has NO staging table -- it goes to raw_source_data.",
            "Metadata fields (date_creation, user, moderator, formulaire) should be SKIPPED.",
            "external_id on object_temp is CRITICAL: it's the source system's ID for upsert matching.",
        ],
    }


def find_best_target(source_column_normalized: str) -> tuple[str, str, str, float, str]:
    """Find the best staging table + column for a normalized source column name."""
    # 1. Exact alias match -> 95%
    exact = _ALIAS_INDEX.get(source_column_normalized)
    if exact:
        return (
            exact[0], exact[1], exact[2], 0.95,
            f"Exact alias match: {exact[0]}.{exact[1]}",
        )

    # 2. Substring match -> 70-85%
    best: tuple[str, str, str, float, str] | None = None
    for alias, (table, column, transform) in _ALIAS_INDEX.items():
        if len(alias) < 3:
            continue
        if alias in source_column_normalized or source_column_normalized in alias:
            length_ratio = min(len(alias), len(source_column_normalized)) / max(len(alias), len(source_column_normalized))
            score = round(0.70 + 0.15 * length_ratio, 2)
            if best is None or score > best[3]:
                best = (table, column, transform, score, f"Fuzzy alias match: {table}.{column}")
    if best:
        return best

    # 3. Metadata / admin fields -> skip recommendation
    for pat in METADATA_PATTERNS:
        if pat in source_column_normalized:
            return (
                "object_temp", "name", "identity", 0.10,
                f"Likely metadata/admin field (matched '{pat}'). Recommend SKIP.",
            )

    # 4. Description text -> raw_source_data (low confidence, skip)
    for pat in DESCRIPTION_PATTERNS:
        if pat in source_column_normalized:
            return (
                "object_temp", "name", "identity", 0.20,
                f"Descriptive text (matched '{pat}'). No staging column; stored in raw_source_data.",
            )

    # 5. No match at all
    return (
        "object_temp", "name", "identity", 0.15,
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
