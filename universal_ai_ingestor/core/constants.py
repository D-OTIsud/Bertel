from typing import Any

# Relational mappings
ENTITY_TYPE_TO_STAGING: dict[str, str] = {
    "org": "object_org_link_temp",
    "amenity": "object_amenity_temp",
    "payment": "object_payment_method_temp",
    "media": "media_temp",
    "language": "object_language_temp",
    "environment_tag": "object_environment_tag_temp",
}

LEGACY_RELATION_FALLBACKS: list[dict[str, Any]] = [
    {
        "from_sheet": "*",
        "from_column_candidates": ["related_org_ids", "org_ids", "organization_ids", "associated_org_ids"],
        "separator": ",",
        "target_entity_type": "org",
        "target_staging_table": "object_org_link_temp",
    },
    {
        "from_sheet": "*",
        "from_column_candidates": ["amenity_codes", "amenities", "amenities_any", "amenity"],
        "separator": ",",
        "target_entity_type": "amenity",
        "target_staging_table": "object_amenity_temp",
    },
    {
        "from_sheet": "*",
        "from_column_candidates": ["payment_codes", "payment_methods", "payments_any", "payment"],
        "separator": ",",
        "target_entity_type": "payment",
        "target_staging_table": "object_payment_method_temp",
    },
    {
        "from_sheet": "*",
        "from_column_candidates": ["media_urls", "media_url", "photo_urls", "image_urls", "photos"],
        "separator": ",",
        "target_entity_type": "media",
        "target_staging_table": "media_temp",
    },
]

# Discovery mapping
ENTITY_KEYWORD_MAP: dict[str, tuple[str, str]] = {
    "prestataire": ("org", "object_org_link_temp"),
    "proprietaire": ("org", "object_org_link_temp"),
    "gerant": ("org", "object_org_link_temp"),
    "gestionnaire": ("org", "object_org_link_temp"),
    "fournisseur": ("org", "object_org_link_temp"),
    "partenaire": ("org", "object_org_link_temp"),
    "collaborateur": ("org", "object_org_link_temp"),
    "mandataire": ("org", "object_org_link_temp"),
    "org": ("org", "object_org_link_temp"),
    "organisation": ("org", "object_org_link_temp"),
    "societe": ("org", "object_org_link_temp"),
    "amenity": ("amenity", "object_amenity_temp"),
    "amenities": ("amenity", "object_amenity_temp"),
    "equipement": ("amenity", "object_amenity_temp"),
    "prestation": ("amenity", "object_amenity_temp"),
    "installation": ("amenity", "object_amenity_temp"),
    "commodite": ("amenity", "object_amenity_temp"),
    "paiement": ("payment", "object_payment_method_temp"),
    "payment": ("payment", "object_payment_method_temp"),
    "moyen_paiement": ("payment", "object_payment_method_temp"),
    "mode_paiement": ("payment", "object_payment_method_temp"),
    "media": ("media", "media_temp"),
    "photo": ("media", "media_temp"),
    "image": ("media", "media_temp"),
    "galerie": ("media", "media_temp"),
    "visuel": ("media", "media_temp"),
    "langue": ("language", "object_language_temp"),
    "language": ("language", "object_language_temp"),
    "langues_parlees": ("language", "object_language_temp"),
    "environnement": ("environment_tag", "object_environment_tag_temp"),
    "situation": ("environment_tag", "object_environment_tag_temp"),
}

MULTI_VALUE_DELIMITER_THRESHOLD = 0.3
