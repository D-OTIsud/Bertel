"""Canonical target schema rules for ALL Bertel staging tables.

The Bertel database is a tourism CRM where EVERY entity (hotel, restaurant,
itinerary, event, organization) lives in the `object` table, identified by
`object_type` codes (HOT, RES, ITI, FMA, ORG...).

The staging layer mirrors the production schema.  Each staging table has a
`staging_object_key` that will resolve to an `object.id` during commit.

ETL execution order (to respect FK constraints):
  1. Resolve ref_* lookups
  2. Upsert actors & organizations (actor_temp, org_temp)
  3. Upsert the root object (object_temp)
  4. Traceability (object_external_id_temp, object_origin_temp)
  5. Governance (object_org_link_temp, actor_object_role_temp)
  6. Core satellites (location, description, contact_channel)
  7. Media, CRM notes
  8. Domain-specific (iti, fma, room_type, opening_period, price)
  9. M:N characteristics (amenity, language, payment, classification, legal, env_tag)
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

try:
    from core.generated_schema_catalog import AUTO_TARGET_TABLE_SPECS
except ImportError:  # pragma: no cover
    from universal_ai_ingestor.core.generated_schema_catalog import AUTO_TARGET_TABLE_SPECS


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
    production_table: str
    allowed_transforms: tuple[str, ...]
    columns: tuple[TargetColumnRule, ...]


def _build_generated_rule(table: str, spec: dict[str, object]) -> TargetTableRule:
    columns = tuple(
        TargetColumnRule(column=str(name), aliases=tuple(str(alias) for alias in aliases))
        for name, aliases in spec["columns"]
    )
    return TargetTableRule(
        table=table,
        entity=str(spec["entity"]),
        description=str(spec["description"]),
        production_table=str(spec["production_table"]),
        allowed_transforms=tuple(str(t) for t in spec["allowed_transforms"]),
        columns=columns,
    )


GENERATED_TARGET_TABLE_RULES: tuple[TargetTableRule, ...] = tuple(
    _build_generated_rule(table, spec)
    for table, spec in sorted(AUTO_TARGET_TABLE_SPECS.items())
)

_STAGING_SQL_FILES: tuple[str, ...] = (
    "staging_ingestor.sql",
    "staging_v2_tables.sql",
    "staging_v3_tables.sql",
)
_CREATE_TABLE_RE = re.compile(
    r"CREATE TABLE IF NOT EXISTS\s+staging\.([a-z0-9_]+)\s*\((.*?)\);",
    re.IGNORECASE | re.DOTALL,
)
_ALTER_TABLE_RE = re.compile(
    r"ALTER TABLE(?:\s+IF\s+EXISTS)?\s+staging\.([a-z0-9_]+)\s+(.*?);",
    re.IGNORECASE | re.DOTALL,
)
_COLUMN_LINE_RE = re.compile(r'^\s*"?([a-z0-9_]+)"?\s+[a-z]', re.IGNORECASE)


def _extract_column_names(block: str) -> tuple[str, ...]:
    names: list[str] = []
    seen: set[str] = set()
    for raw_line in block.splitlines():
        line = raw_line.split("--", 1)[0].strip()
        if not line:
            continue
        match = _COLUMN_LINE_RE.match(line)
        if not match:
            continue
        name = match.group(1)
        if name.lower() in {"constraint", "primary", "foreign", "unique", "check"}:
            continue
        if name not in seen:
            names.append(name)
            seen.add(name)
    return tuple(names)


def _load_staging_table_columns() -> dict[str, tuple[str, ...]]:
    sql_root = Path(__file__).resolve().parents[1] / "sql"
    table_columns: dict[str, list[str]] = {}

    def append_column(table: str, column: str) -> None:
        bucket = table_columns.setdefault(table, [])
        if column not in bucket:
            bucket.append(column)

    for file_name in _STAGING_SQL_FILES:
        path = sql_root / file_name
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        for table, block in _CREATE_TABLE_RE.findall(content):
            for column in _extract_column_names(block):
                append_column(table, column)
        for table, block in _ALTER_TABLE_RE.findall(content):
            for match in re.finditer(r"ADD COLUMN IF NOT EXISTS\s+([a-z0-9_]+)\b", block, re.IGNORECASE):
                append_column(table, match.group(1))

    return {table: tuple(columns) for table, columns in table_columns.items()}


def _reconcile_rule_with_staging_columns(rule: TargetTableRule, staging_columns: tuple[str, ...]) -> TargetTableRule:
    if not staging_columns:
        return rule
    curated_by_column = {
        column.column: column
        for column in rule.columns
        if column.column in staging_columns
    }
    ordered_columns = tuple(
        curated_by_column.get(column, TargetColumnRule(column=column, aliases=(column,)))
        for column in staging_columns
    )
    return TargetTableRule(
        table=rule.table,
        entity=rule.entity,
        description=rule.description,
        production_table=rule.production_table,
        allowed_transforms=rule.allowed_transforms,
        columns=ordered_columns,
    )


_STAGING_TABLE_COLUMNS: dict[str, tuple[str, ...]] = _load_staging_table_columns()
KNOWN_OBJECT_TYPES = {
    "HOT": "Hôtel", "RES": "Restaurant", "ITI": "Itinéraire",
    "FMA": "Fête/Événement", "ORG": "Organisation", "HPA": "Camping",
    "HLO": "Hébergement locatif", "DEG": "Dégustation", "COM": "Commerce",
    "LOI": "Loisirs", "PCU": "Patrimoine culturel", "ASC": "Activité sportive",
}

# ─────────────────────────────────────────────────────────────────────
# PART 1 : Core & Identity
# ─────────────────────────────────────────────────────────────────────

_object_temp = TargetTableRule(
    table="object_temp",
    entity="object",
    production_table="object",
    description="Main entity (hotel, restaurant, POI, org...). object_type uses codes HOT/RES/ORG/ITI/FMA etc. external_id is CRITICAL for upsert.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("name", (
            "name", "nom", "raison_sociale", "denomination", "titre", "title",
            "label", "libelle", "intitule", "object_name", "nom_commercial",
            "nom_etablissement", "nom_lieu", "etablissement", "enseigne",
            "business_name", "company_name", "full_name", "display_name",
            "nom_structure", "nom_site", "designation", "appellation",
        ), required_for_entity=True),
        TargetColumnRule("object_type", (
            "object_type", "type", "category", "categorie", "type_objet",
            "entity_type", "kind", "genre", "nature", "type_etablissement",
            "type_structure", "type_offre", "type_hebergement", "type_activite",
            "typologie",
        ), required_for_entity=True),
        TargetColumnRule("external_id", (
            "external_id", "source_id", "partner_id", "id_externe", "id",
            "identifiant", "reference", "ref", "code", "numero",
            "siret", "siren", "naf", "ape", "rna", "id_source",
            "id_apidae", "id_tourinsoft", "id_datatourisme", "code_insee",
        )),
        TargetColumnRule("source_org_object_id", (
            "organization_id", "org_id", "org_object_id", "id_organisation",
            "id_organisme", "structure_id",
        )),
        TargetColumnRule("org_name", (
            "organization_name", "org_name", "owner_org_name", "nom_organisme",
            "nom_organisation", "structure", "proprietaire", "gestionnaire",
        )),
        TargetColumnRule("email", (
            "email", "mail", "courriel", "e_mail", "adresse_email",
            "contact_email", "email_address", "mel",
        )),
        TargetColumnRule("phone", (
            "phone", "telephone", "mobile", "tel", "fax",
            "tel_fixe", "tel_mobile", "gsm", "portable",
        )),
        TargetColumnRule("latitude", ("latitude", "lat", "coord_lat", "y", "geo_lat")),
        TargetColumnRule("longitude", ("longitude", "lon", "lng", "coord_lon", "x", "geo_lon")),
    ),
)

_object_external_id_temp = TargetTableRule(
    table="object_external_id_temp",
    entity="external_id",
    production_table="object_external_id",
    description="Maps source-system IDs to internal object IDs. CRITICAL for upsert/dedup across imports.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("external_id", (
            "external_id", "id_externe", "source_id", "id_source",
            "id_apidae", "id_tourinsoft", "id_datatourisme", "id_partenaire",
            "partner_id", "ref_externe",
        ), required_for_entity=True),
        TargetColumnRule("organization_object_id", (
            "org_object_id", "id_organisation_source",
        )),
    ),
)

_object_origin_temp = TargetTableRule(
    table="object_origin_temp",
    entity="origin",
    production_table="object_origin",
    description="Tracks which source system imported the object (Apidae, Tourinsoft, manual...).",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("source_system", (
            "source_system", "source", "provenance", "systeme_source",
            "origine", "imported_from", "flux",
        ), required_for_entity=True),
        TargetColumnRule("source_object_id", (
            "source_object_id", "id_source", "id_flux",
        )),
    ),
)

# ─────────────────────────────────────────────────────────────────────
# PART 2 : Governance & Actors
# ─────────────────────────────────────────────────────────────────────

_org_temp = TargetTableRule(
    table="org_temp",
    entity="organization",
    production_table="object (type ORG)",
    description="Organizations (offices de tourisme, groups, companies). Orgs are objects with type=ORG.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("name", (
            "org_name", "organization", "organization_name", "owner_org_name", "organisme", "structure",
            "nom_organisation", "nom_organisme", "societe", "company",
            "proprietaire", "gestionnaire", "mandataire", "groupe",
        ), required_for_entity=True),
        TargetColumnRule("source_org_object_id", (
            "org_id", "organization_id", "id_organisation", "id_organisme",
        )),
        TargetColumnRule("external_id", (
            "org_external_id", "siret_org", "siren_org", "siret_structure",
        )),
    ),
)

_object_org_link_temp = TargetTableRule(
    table="object_org_link_temp",
    entity="object_org_link",
    production_table="object_org_link",
    description="Links object to managing organization(s). N:M with role (owner, manager, partner). is_primary marks the main org.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("role_code", (
            "role", "role_code", "fonction", "lien", "relation",
            "type_lien", "ownership_type", "role_org",
        )),
        TargetColumnRule("is_primary", ("is_primary", "principal", "primaire")),
        TargetColumnRule("note", ("note", "commentaire_lien", "precision")),
    ),
)

_actor_temp = TargetTableRule(
    table="actor_temp",
    entity="actor",
    production_table="actor",
    description="Human contacts (director, owner, guide). Actors are people, NOT objects.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("display_name", (
            "contact_name", "nom_contact", "interlocuteur", "responsable",
            "personne", "nom_prenom", "full_name_contact",
        )),
        TargetColumnRule("first_name", (
            "first_name", "prenom", "prenom_contact",
        )),
        TargetColumnRule("last_name", (
            "last_name", "nom_famille", "nom_contact_famille",
            "patronyme",
        )),
        TargetColumnRule("gender", (
            "gender", "civilite", "titre_civilite", "sexe",
        )),
    ),
)

_actor_channel_temp = TargetTableRule(
    table="actor_channel_temp",
    entity="actor_channel",
    production_table="actor_channel",
    description="Personal contact details of an actor (their direct phone, personal email). NOT the establishment's contacts.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("kind_code", ("kind_code", "type_contact_acteur")),
        TargetColumnRule("value", (
            "actor_email", "email_contact", "tel_contact", "mobile_contact",
            "email_direct", "tel_direct",
        )),
        TargetColumnRule("is_primary", ("is_primary",)),
    ),
)

_actor_object_role_temp = TargetTableRule(
    table="actor_object_role_temp",
    entity="actor_object_role",
    production_table="actor_object_role",
    description="Links an actor (human) to an object with a role (director, owner, guide, technical contact).",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("role_code", (
            "actor_role", "role_acteur", "fonction_contact",
            "titre_poste", "poste", "job_title",
        )),
        TargetColumnRule("is_primary", ("is_primary_contact", "contact_principal")),
        TargetColumnRule("note", ("note_contact", "precision_role")),
    ),
)

# ─────────────────────────────────────────────────────────────────────
# PART 3 : Core Satellites (location, description, contacts, media)
# ─────────────────────────────────────────────────────────────────────

_object_location_temp = TargetTableRule(
    table="object_location_temp",
    entity="object_location",
    production_table="object_location",
    description="Physical address + GPS. Address fields ALWAYS go here (not object_temp). PostGIS geog2 auto-computed from lat/lon.",
    allowed_transforms=("identity", "split_gps"),
    columns=(
        TargetColumnRule("latitude", ("latitude", "lat", "coord_lat", "y", "geo_lat")),
        TargetColumnRule("longitude", ("longitude", "lon", "lng", "coord_lon", "x", "geo_lon")),
        TargetColumnRule("address1", (
            "address", "address1", "adresse", "adresse1", "adresse_postale",
            "rue", "voie", "street", "numero_voie", "adresse_complete",
        )),
        TargetColumnRule("city", (
            "city", "ville", "commune", "localite", "town",
            "nom_commune", "lieu_dit",
        )),
        TargetColumnRule("postcode", (
            "postcode", "postal_code", "cp", "zip", "code_postal",
            "zipcode", "cedex",
        )),
    ),
)

_object_description_temp = TargetTableRule(
    table="object_description_temp",
    entity="object_description",
    production_table="object_description",
    description="Textual descriptions (short, long, mobile, sanitary). org_object_id=NULL for canonical/official text.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("description", (
            "description", "descriptif", "presentation", "texte",
            "description_longue", "desc_longue", "long_description",
            "description_complete",
        )),
        TargetColumnRule("description_chapo", (
            "description_chapo", "desc_courte", "description_courte",
            "short_description", "accroche", "resume", "chapeau",
        )),
        TargetColumnRule("description_mobile", (
            "description_mobile", "desc_mobile",
        )),
        TargetColumnRule("sanitary_measures", (
            "sanitary_measures", "mesures_sanitaires", "covid",
            "mesures_covid", "protocole_sanitaire",
        )),
    ),
)

_contact_channel_temp = TargetTableRule(
    table="contact_channel_temp",
    entity="contact_channel",
    production_table="contact_channel",
    description="Establishment's contacts (standard phone, generic email, website, social). NOT personal actor contacts.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("value", (
            "email", "mail", "courriel", "phone", "telephone", "tel", "mobile",
            "fax", "website", "site_web", "url", "lien", "facebook",
            "instagram", "twitter", "linkedin", "tiktok", "youtube",
            "site_internet", "portable", "gsm", "tripadvisor",
        )),
        TargetColumnRule("kind_code", (
            "kind_code", "contact_kind", "contact_type", "type_contact", "canal",
        )),
    ),
)

_media_temp = TargetTableRule(
    table="media_temp",
    entity="media",
    production_table="media",
    description="Photos, videos, documents. Use split_list for multi-URL columns. media_type_id resolved from ref_code.",
    allowed_transforms=("identity", "split_list"),
    columns=(
        TargetColumnRule("source_url", (
            "media_url", "image_url", "photo_url", "photos", "images",
            "media_urls", "galerie", "gallery", "illustration",
            "url_photo", "lien_image", "photo", "image", "visuel",
            "video_url", "lien_video", "document_url",
        )),
    ),
)

# ─────────────────────────────────────────────────────────────────────
# PART 4 : Characteristics & Labels (M:N)
# ─────────────────────────────────────────────────────────────────────

_object_classification_temp = TargetTableRule(
    table="object_classification_temp",
    entity="classification",
    production_table="object_classification",
    description="Official labels and star ratings (e.g. 4 étoiles, Qualité Tourisme). scheme_code=taxonomy, value_code=specific value.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("scheme_code", (
            "scheme_code", "classification_scheme", "type_classement",
            "classement", "type_label", "label_type", "nomenclature",
        )),
        TargetColumnRule("value_code", (
            "value_code", "classification_value", "etoiles", "stars",
            "star_rating", "nombre_etoiles", "nb_etoiles", "rang",
            "niveau", "level", "grade", "label",
        )),
    ),
)

_object_amenity_temp = TargetTableRule(
    table="object_amenity_temp",
    entity="amenity",
    production_table="object_amenity",
    description="Equipment and facilities (pool, wifi, parking, AC). Linked to ref_amenity.",
    allowed_transforms=("identity", "split_list"),
    columns=(
        TargetColumnRule("amenity_code", (
            "amenity", "amenities", "equipments", "equipement", "equipements",
            "prestations", "services", "installations", "facilities",
            "features", "commodites", "confort",
        )),
    ),
)

_object_payment_method_temp = TargetTableRule(
    table="object_payment_method_temp",
    entity="payment",
    production_table="object_payment_method",
    description="Accepted payment methods (CB, cash, check, ANCV). Linked to ref_code_payment_method.",
    allowed_transforms=("identity", "split_list"),
    columns=(
        TargetColumnRule("payment_code", (
            "payment", "payment_codes", "payment_methods", "moyens_paiement",
            "paiement", "mode_paiement", "modes_paiement",
        )),
    ),
)

_object_language_temp = TargetTableRule(
    table="object_language_temp",
    entity="language",
    production_table="object_language",
    description="Languages spoken at reception. Linked to ref_language.",
    allowed_transforms=("identity", "split_list", "lowercase"),
    columns=(
        TargetColumnRule("language_code", (
            "language", "langue", "langues", "languages",
            "langues_parlees", "spoken_languages", "langue_accueil",
        )),
        TargetColumnRule("level_code", ("level", "niveau_langue")),
    ),
)

_object_environment_tag_temp = TargetTableRule(
    table="object_environment_tag_temp",
    entity="environment_tag",
    production_table="object_environment_tag",
    description="Environment/situation tags (mountain, seaside, city center). Linked to ref_code_environment_tag.",
    allowed_transforms=("identity", "split_list", "lowercase"),
    columns=(
        TargetColumnRule("environment_tag_code", (
            "environment", "environnement", "situation", "milieu",
            "environment_tag", "localisation_type", "cadre",
        )),
    ),
)

_object_legal_temp = TargetTableRule(
    table="object_legal_temp",
    entity="legal",
    production_table="object_legal",
    description="Legal compliance (SIRET, license, insurance, permits). Linked to ref_legal_type. Has temporal validity.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("type_code", (
            "legal_type", "type_legal", "type_conformite",
            "document_type", "type_document_legal",
        )),
        TargetColumnRule("value", (
            "legal_value", "siret", "siren", "numero_licence",
            "numero_agrement", "numero_assurance", "rib", "iban",
        )),
        TargetColumnRule("valid_from", ("valid_from", "date_debut_validite")),
        TargetColumnRule("valid_to", ("valid_to", "date_fin_validite", "expiration")),
        TargetColumnRule("note", ("note_legal", "commentaire_legal")),
    ),
)

# ─────────────────────────────────────────────────────────────────────
# PART 5 : Time, Money & Opening
# ─────────────────────────────────────────────────────────────────────

_object_price_temp = TargetTableRule(
    table="object_price_temp",
    entity="price",
    production_table="object_price",
    description="Pricing (adult, child, group). amount + currency + kind (adult/child) + unit (per night/per person).",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("kind_code", (
            "price_kind", "type_tarif", "tarif_type", "price_type",
        )),
        TargetColumnRule("unit_code", (
            "price_unit", "unite_tarif", "par_nuit", "per_night",
        )),
        TargetColumnRule("amount", (
            "price", "tarif", "prix", "amount", "montant",
            "tarif_adulte", "tarif_enfant", "tarif_groupe",
            "prix_adulte", "prix_enfant",
        )),
        TargetColumnRule("amount_max", (
            "price_max", "tarif_max", "prix_max",
        )),
        TargetColumnRule("currency", ("currency", "devise", "monnaie")),
        TargetColumnRule("conditions", (
            "conditions_tarifaires", "tarif_conditions", "price_conditions",
        )),
        TargetColumnRule("valid_from", ("tarif_debut", "price_valid_from")),
        TargetColumnRule("valid_to", ("tarif_fin", "price_valid_to")),
    ),
)

_object_capacity_temp = TargetTableRule(
    table="object_capacity_temp",
    entity="capacity",
    production_table="object_capacity",
    description="Capacity metrics (rooms, beds, seats, max persons). Linked to ref_capacity_metric.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("metric_code", (
            "capacity_type", "type_capacite", "metric",
        )),
        TargetColumnRule("value_integer", (
            "capacity", "capacite", "nb_chambres", "nb_lits",
            "nb_couverts", "nb_places", "nb_emplacements",
            "rooms", "beds", "seats", "places",
        )),
        TargetColumnRule("unit", ("unit", "unite")),
    ),
)

_opening_period_temp = TargetTableRule(
    table="opening_period_temp",
    entity="opening",
    production_table="opening_period",
    description="Opening hours tree. Flattened: period name + date range + weekdays + time range.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("period_name", (
            "period", "periode", "saison", "season",
            "periode_ouverture", "opening_period",
        )),
        TargetColumnRule("date_start", (
            "date_start", "date_debut", "ouverture_debut",
            "start_date", "debut_periode",
        )),
        TargetColumnRule("date_end", (
            "date_end", "date_fin", "ouverture_fin",
            "end_date", "fin_periode",
        )),
        TargetColumnRule("schedule_text", (
            "horaires", "horaires_texte", "opening_hours",
            "heures_ouverture", "schedule",
        )),
        TargetColumnRule("weekdays", (
            "jours", "weekdays", "jours_ouverture", "days",
        )),
        TargetColumnRule("start_time", (
            "heure_debut", "start_time", "opening_time",
        )),
        TargetColumnRule("end_time", (
            "heure_fin", "end_time", "closing_time",
        )),
    ),
)

# ─────────────────────────────────────────────────────────────────────
# PART 6 : Domain-specific (Typologies)
# ─────────────────────────────────────────────────────────────────────

_object_fma_temp = TargetTableRule(
    table="object_fma_temp",
    entity="event",
    production_table="object_fma",
    description="Event dates. For recurring events, is_recurring=true + recurrence_pattern.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("event_start_date", (
            "event_start", "date_debut_evenement", "debut_evenement",
            "event_date", "date_evenement", "date_fma",
        )),
        TargetColumnRule("event_end_date", (
            "event_end", "date_fin_evenement", "fin_evenement",
        )),
        TargetColumnRule("event_start_time", (
            "event_start_time", "heure_debut_evenement",
        )),
        TargetColumnRule("event_end_time", (
            "event_end_time", "heure_fin_evenement",
        )),
        TargetColumnRule("is_recurring", (
            "is_recurring", "recurrent", "periodique",
        )),
        TargetColumnRule("recurrence_pattern", (
            "recurrence", "pattern", "frequence",
        )),
    ),
)

_object_iti_temp = TargetTableRule(
    table="object_iti_temp",
    entity="itinerary",
    production_table="object_iti",
    description="Itinerary details. Geometry (GPX) auto-generates cached_gpx/cached_kml via trigger.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("distance_km", (
            "distance", "distance_km", "longueur", "length_km",
        )),
        TargetColumnRule("duration_hours", (
            "duration", "duree", "duration_hours", "temps_parcours",
        )),
        TargetColumnRule("difficulty_level", (
            "difficulty", "difficulte", "niveau_difficulte",
        )),
        TargetColumnRule("elevation_gain", (
            "elevation_gain", "denivele", "denivele_positif", "d_plus",
        )),
        TargetColumnRule("is_loop", (
            "is_loop", "boucle", "circuit",
        )),
        TargetColumnRule("gpx_data", (
            "gpx", "gpx_data", "trace_gpx", "geom",
        )),
    ),
)

_object_room_type_temp = TargetTableRule(
    table="object_room_type_temp",
    entity="room_type",
    production_table="object_room_type",
    description="Accommodation room types with capacity, size, bed configuration, base price.",
    allowed_transforms=("identity",),
    columns=(
        TargetColumnRule("code", ("room_code", "code_chambre", "type_code")),
        TargetColumnRule("name", (
            "room_name", "nom_chambre", "type_chambre",
            "room_type", "type_hebergement_detail",
        )),
        TargetColumnRule("capacity_adults", (
            "capacity_adults", "nb_adultes", "adultes",
        )),
        TargetColumnRule("capacity_children", (
            "capacity_children", "nb_enfants", "enfants",
        )),
        TargetColumnRule("capacity_total", (
            "capacity_total", "capacite_totale", "nb_personnes",
        )),
        TargetColumnRule("size_sqm", (
            "size_sqm", "superficie", "surface", "m2",
        )),
        TargetColumnRule("bed_config", (
            "bed_config", "configuration_lits", "lits", "beds",
        )),
        TargetColumnRule("total_rooms", (
            "total_rooms", "nb_chambres_type", "quantite",
        )),
        TargetColumnRule("base_price", (
            "base_price", "prix_base", "tarif_chambre",
        )),
    ),
)

# ─────────────────────────────────────────────────────────────────────
# PART 7 : CRM & Operations
# ─────────────────────────────────────────────────────────────────────

_crm_interaction_temp = TargetTableRule(
    table="crm_interaction_temp",
    entity="crm_interaction",
    production_table="crm_interaction",
    description="CRM contact history: calls, emails, meetings. Always linked to an object. Optionally linked to an actor.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("interaction_type", (
            "interaction_type", "type_interaction", "type_echange",
            "canal", "channel", "mode_contact",
        )),
        TargetColumnRule("direction", (
            "direction", "sens", "inbound", "outbound",
        )),
        TargetColumnRule("subject", (
            "subject", "objet", "sujet", "motif", "topic",
        )),
        TargetColumnRule("body", (
            "body", "contenu", "message", "notes_echange",
            "compte_rendu", "resume_echange",
        )),
        TargetColumnRule("source", (
            "interaction_source", "source_echange",
        )),
        TargetColumnRule("occurred_at", (
            "occurred_at", "date_echange", "date_contact",
            "date_appel", "date_interaction",
        )),
        TargetColumnRule("duration_min", (
            "duration_min", "duree_min", "duree_appel",
        )),
        TargetColumnRule("demand_topic_code", (
            "demand_topic", "sujet_demande", "topic_code",
            "type_demande", "motif_demande",
        )),
        TargetColumnRule("status", (
            "interaction_status", "statut_echange",
        )),
    ),
)

_crm_task_temp = TargetTableRule(
    table="crm_task_temp",
    entity="crm_task",
    production_table="crm_task",
    description="CRM follow-up tasks (to-do list). Linked to an object, optionally to an actor or interaction.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("title", (
            "task_title", "titre_tache", "tache", "todo",
            "action_a_faire", "suivi",
        )),
        TargetColumnRule("description", (
            "task_description", "description_tache", "detail_tache",
        )),
        TargetColumnRule("status", (
            "task_status", "statut_tache", "etat_tache",
        )),
        TargetColumnRule("priority", (
            "priority", "priorite", "urgence",
        )),
        TargetColumnRule("due_at", (
            "due_at", "echeance", "date_echeance", "deadline",
            "date_limite",
        )),
    ),
)

_object_membership_temp = TargetTableRule(
    table="object_membership_temp",
    entity="membership",
    production_table="object_membership",
    description="Memberships/subscriptions: an object (establishment) paying dues to an org (e.g. Office de Tourisme).",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("campaign_code", (
            "campaign", "campagne", "campagne_adhesion",
        )),
        TargetColumnRule("tier_code", (
            "tier", "niveau_adhesion", "formule", "pack",
        )),
        TargetColumnRule("status", (
            "membership_status", "statut_adhesion", "etat_adhesion",
        )),
        TargetColumnRule("starts_at", (
            "starts_at", "date_debut_adhesion", "debut_adhesion",
        )),
        TargetColumnRule("ends_at", (
            "ends_at", "date_fin_adhesion", "fin_adhesion", "expiration_adhesion",
        )),
        TargetColumnRule("payment_date", (
            "payment_date", "date_paiement", "date_cotisation",
        )),
    ),
)

_object_review_temp = TargetTableRule(
    table="object_review_temp",
    entity="review",
    production_table="object_review",
    description="External reviews (TripAdvisor, Google, Booking...). Rating, author, content, source.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("source_code", (
            "review_source", "source_avis", "plateforme_avis",
            "tripadvisor", "google_reviews", "booking",
        )),
        TargetColumnRule("rating", (
            "rating", "note", "note_avis", "score", "evaluation",
        )),
        TargetColumnRule("rating_max", (
            "rating_max", "note_max", "score_max",
        )),
        TargetColumnRule("title", (
            "review_title", "titre_avis",
        )),
        TargetColumnRule("content", (
            "review_content", "contenu_avis", "texte_avis", "avis",
            "commentaire_client", "review_text",
        )),
        TargetColumnRule("author_name", (
            "author_name", "nom_auteur", "auteur_avis", "reviewer",
        )),
        TargetColumnRule("review_date", (
            "review_date", "date_avis", "date_review",
        )),
        TargetColumnRule("traveler_type", (
            "traveler_type", "type_voyageur", "profil_voyageur",
        )),
    ),
)


# ─────────────────────────────────────────────────────────────────────

_ref_code_temp = TargetTableRule(
    table="ref_code_temp",
    entity="ref_code",
    production_table="ref_code",
    description="Reference codes imported into staging for domain lookups and exhaustive manual mapping.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("domain", ("domain",)),
        TargetColumnRule("code", ("code",)),
        TargetColumnRule("name", ("name",)),
        TargetColumnRule("description", ("description",)),
    ),
)

_ref_classification_scheme_temp = TargetTableRule(
    table="ref_classification_scheme_temp",
    entity="ref_classification_scheme",
    production_table="ref_classification_scheme",
    description="Classification scheme staging table used for labels, stars, and taxonomy setup.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("scheme_code", ("scheme_code",)),
        TargetColumnRule("scheme_name", ("scheme_name",)),
        TargetColumnRule("description", ("description",)),
        TargetColumnRule("selection", ("selection",)),
    ),
)

_ref_classification_value_temp = TargetTableRule(
    table="ref_classification_value_temp",
    entity="ref_classification_value",
    production_table="ref_classification_value",
    description="Classification values staged per scheme for exhaustive manual mapping coverage.",
    allowed_transforms=("identity", "lowercase"),
    columns=(
        TargetColumnRule("scheme_code", ("scheme_code",)),
        TargetColumnRule("value_code", ("value_code",)),
        TargetColumnRule("value_name", ("value_name",)),
    ),
)

# Registry
# ─────────────────────────────────────────────────────────────────────

_BASE_TARGET_SCHEMA_RULES: dict[str, TargetTableRule] = {
    r.table: r for r in [
        # Part 1: Core
        _object_temp, _object_external_id_temp, _object_origin_temp,
        # Part 2: Governance
        _org_temp, _object_org_link_temp,
        _actor_temp, _actor_channel_temp, _actor_object_role_temp,
        # Part 3: Satellites
        _object_location_temp, _object_description_temp,
        _contact_channel_temp, _media_temp,
        # Part 4: Characteristics
        _object_classification_temp, _object_amenity_temp,
        _object_payment_method_temp, _object_language_temp,
        _object_environment_tag_temp, _object_legal_temp,
        # Part 5: Time & Money
        _object_price_temp, _object_capacity_temp, _opening_period_temp,
        # Part 6: Typologies
        _object_fma_temp, _object_iti_temp, _object_room_type_temp,
        # Part 7: CRM
        _crm_interaction_temp, _crm_task_temp,
        _object_membership_temp, _object_review_temp,
        _ref_code_temp, _ref_classification_scheme_temp, _ref_classification_value_temp,
        *GENERATED_TARGET_TABLE_RULES,
    ]
}

TARGET_SCHEMA_RULES: dict[str, TargetTableRule] = {
    table: _reconcile_rule_with_staging_columns(rule, _STAGING_TABLE_COLUMNS.get(table, ()))
    for table, rule in _BASE_TARGET_SCHEMA_RULES.items()
}
VALID_TRANSFORMS: set[str] = {"identity", "lowercase", "split_list", "split_gps"}

# Pre-built alias index: normalized_alias -> (table, column, default_transform)
_ALIAS_INDEX: dict[str, tuple[str, str, str]] = {}
for _tbl_key, _tbl_rule in TARGET_SCHEMA_RULES.items():
    for _col_rule in _tbl_rule.columns:
        for _alias in _col_rule.aliases:
            _k = _alias.lower()
            if _k not in _ALIAS_INDEX:
                _ALIAS_INDEX[_k] = (_tbl_key, _col_rule.column, _col_rule.default_transform)

METADATA_PATTERNS: tuple[str, ...] = (
    "formulaire", "source_sheet", "row_index", "row_number",
    "unnamed", "moderer", "moderateur", "moderator",
    "date_creation", "date_modification", "created_at", "updated_at",
    "user", "utilisateur", "auteur", "author", "modified_by",
    "created_by", "date_saisie", "date_maj", "date_import",
)


def flatten_required_columns() -> dict[str, set[str]]:
    return {
        table: {c.column for c in rule.columns if c.required_for_entity}
        for table, rule in TARGET_SCHEMA_RULES.items()
    }


def build_target_schema_context() -> dict[str, object]:
    """Build schema context dict sent to the AI mapping agent."""
    tables = [
        {
            "table": r.table,
            "entity": r.entity,
            "production_table": r.production_table,
            "description": r.description,
            "allowed_transforms": list(r.allowed_transforms),
            "columns": [
                {"column": c.column, "aliases": list(c.aliases),
                 "required": c.required_for_entity, "default_transform": c.default_transform}
                for c in r.columns
            ],
        }
        for r in TARGET_SCHEMA_RULES.values()
    ]
    return {
        "target_tables": tables,
        "required_columns_by_table": {k: sorted(v) for k, v in flatten_required_columns().items()},
        "known_object_types": KNOWN_OBJECT_TYPES,
        "data_model_overview": (
            "Bertel is a tourism CRM. The 'object' table is the central node -- every entity "
            "(hotel HOT, restaurant RES, itinerary ITI, event FMA, organization ORG...) is an "
            "object row. Organizations are ALSO objects (type ORG) linked via object_org_link. "
            "Actors (human contacts) have their own tables. external_id is critical for upsert."
        ),
        "etl_execution_order": [
            "1. Resolve ref_* lookups (language, amenity, payment codes...)",
            "2. Upsert actors & organizations (actor_temp, org_temp)",
            "3. Upsert root object (object_temp) -- get generated ID",
            "4. Traceability (object_external_id_temp, object_origin_temp)",
            "5. Governance (object_org_link_temp, actor_object_role_temp)",
            "6. Core satellites (object_location_temp, object_description_temp, contact_channel_temp)",
            "7. Media (media_temp)",
            "8. Domain-specific (object_fma_temp, object_iti_temp, object_room_type_temp, opening_period_temp, object_price_temp)",
            "9. M:N characteristics (amenity, language, payment, classification, legal, environment_tag)",
        ],
        "relationship_hints": [
            "object_temp is PRIMARY. Most fields land here unless clearly belonging to a sub-table.",
            "Address/GPS fields -> object_location_temp (NEVER object_temp).",
            "Descriptions/text -> object_description_temp (NEVER object_temp).",
            "Establishment contacts (phone, email, website) -> contact_channel_temp.",
            "Personal contacts of humans -> actor_channel_temp (different from establishment).",
            "org_temp for organization data. object_org_link_temp for object-to-org linkage.",
            "actor_temp for human identity. actor_object_role_temp for their role on the object.",
            "external_id/source system -> object_external_id_temp and object_origin_temp.",
            "Star ratings/labels -> object_classification_temp (scheme_code + value_code).",
            "SIRET/license/legal -> object_legal_temp.",
            "Capacity (rooms, beds, seats) -> object_capacity_temp.",
            "Pricing -> object_price_temp. Opening hours -> opening_period_temp.",
            "Event dates -> object_fma_temp. Itinerary details -> object_iti_temp. Rooms -> object_room_type_temp.",
            "CRM interactions (calls, emails, meetings) -> crm_interaction_temp.",
            "CRM follow-up tasks -> crm_task_temp.",
            "Memberships/subscriptions (adhesion, cotisation) -> object_membership_temp.",
            "External reviews (TripAdvisor, Google, Booking ratings) -> object_review_temp.",
            "Metadata (date_creation, user, moderator) -> SKIP.",
        ],
    }


def find_best_target(source_column_normalized: str) -> tuple[str, str, str, float, str]:
    """Find the best staging table + column for a normalized source column name."""
    exact = _ALIAS_INDEX.get(source_column_normalized)
    if exact:
        return (exact[0], exact[1], exact[2], 0.95, f"Exact alias match: {exact[0]}.{exact[1]}")

    best: tuple[str, str, str, float, str] | None = None
    for alias, (table, column, transform) in _ALIAS_INDEX.items():
        if len(alias) < 3:
            continue
        if alias in source_column_normalized or source_column_normalized in alias:
            ratio = min(len(alias), len(source_column_normalized)) / max(len(alias), len(source_column_normalized))
            score = round(0.70 + 0.15 * ratio, 2)
            if best is None or score > best[3]:
                best = (table, column, transform, score, f"Fuzzy alias match: {table}.{column}")
    if best:
        return best

    for pat in METADATA_PATTERNS:
        if pat in source_column_normalized:
            return ("object_temp", "name", "identity", 0.10,
                    f"Likely metadata (matched '{pat}'). Recommend SKIP.")

    return ("object_temp", "name", "identity", 0.15, "No schema match. Manual mapping required.")


def validate_mapping_target(target_table: str, target_column: str, transform: str) -> tuple[bool, str]:
    rule = TARGET_SCHEMA_RULES.get(target_table)
    if not rule:
        return False, f"Unknown table '{target_table}'"
    if target_column not in {c.column for c in rule.columns}:
        return False, f"Unknown column '{target_column}' for '{target_table}'"
    if transform not in VALID_TRANSFORMS:
        return False, f"Unknown transform '{transform}'"
    if transform not in rule.allowed_transforms:
        return False, f"Transform '{transform}' not allowed for '{target_table}'"
    return True, "ok"








