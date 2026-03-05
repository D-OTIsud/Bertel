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
    allowed_transforms: tuple[str, ...]
    columns: tuple[TargetColumnRule, ...]


TARGET_SCHEMA_RULES: dict[str, TargetTableRule] = {
    "object_temp": TargetTableRule(
        table="object_temp",
        entity="object",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule("name", ("name", "nom", "title"), required_for_entity=True),
            TargetColumnRule("object_type", ("object_type", "type", "category"), required_for_entity=True),
            TargetColumnRule("external_id", ("external_id", "source_id", "partner_id", "id_externe")),
            TargetColumnRule("source_org_object_id", ("organization_id", "org_id", "org_object_id")),
            TargetColumnRule("org_name", ("organization_name", "org_name", "owner_org_name")),
            TargetColumnRule("email", ("email", "mail", "courriel")),
            TargetColumnRule("phone", ("phone", "telephone", "mobile", "tel")),
            TargetColumnRule("latitude", ("latitude", "lat", "coord_lat")),
            TargetColumnRule("longitude", ("longitude", "lon", "lng", "coord_lon")),
        ),
    ),
    "object_location_temp": TargetTableRule(
        table="object_location_temp",
        entity="object_location",
        allowed_transforms=("identity", "split_gps"),
        columns=(
            TargetColumnRule("latitude", ("latitude", "lat", "coord_lat")),
            TargetColumnRule("longitude", ("longitude", "lon", "lng", "coord_lon")),
            TargetColumnRule("address1", ("address", "address1", "adresse")),
            TargetColumnRule("city", ("city", "ville", "commune")),
            TargetColumnRule("postcode", ("postcode", "postal_code", "cp", "zip")),
        ),
    ),
    "contact_channel_temp": TargetTableRule(
        table="contact_channel_temp",
        entity="contact",
        allowed_transforms=("identity", "lowercase"),
        columns=(
            TargetColumnRule("value", ("email", "mail", "courriel", "phone", "telephone", "tel", "mobile")),
            TargetColumnRule("kind_code", ("kind_code", "contact_kind", "contact_type")),
        ),
    ),
    "media_temp": TargetTableRule(
        table="media_temp",
        entity="media",
        allowed_transforms=("identity", "split_list"),
        columns=(
            TargetColumnRule("source_url", ("media_url", "image_url", "photo_url", "photos", "images", "media_urls")),
        ),
    ),
    "object_amenity_temp": TargetTableRule(
        table="object_amenity_temp",
        entity="amenity",
        allowed_transforms=("identity", "split_list"),
        columns=(TargetColumnRule("amenity_code", ("amenity", "amenities", "amenity_codes", "equipments")),),
    ),
    "object_payment_method_temp": TargetTableRule(
        table="object_payment_method_temp",
        entity="payment",
        allowed_transforms=("identity", "split_list"),
        columns=(TargetColumnRule("payment_code", ("payment", "payment_codes", "payment_methods")),),
    ),
}

VALID_TRANSFORMS: set[str] = {"identity", "lowercase", "split_list", "split_gps"}


def flatten_required_columns() -> dict[str, set[str]]:
    required: dict[str, set[str]] = {}
    for table, rule in TARGET_SCHEMA_RULES.items():
        required[table] = {col.column for col in rule.columns if col.required_for_entity}
    return required


def find_best_target(source_column_normalized: str) -> tuple[str, str, str, float, str]:
    for table_rule in TARGET_SCHEMA_RULES.values():
        for col_rule in table_rule.columns:
            alias_set = {a.lower() for a in col_rule.aliases}
            if source_column_normalized in alias_set:
                return (
                    table_rule.table,
                    col_rule.column,
                    col_rule.default_transform,
                    0.95,
                    f"Schema alias match for {table_rule.table}.{col_rule.column}.",
                )
    for table_rule in TARGET_SCHEMA_RULES.values():
        for col_rule in table_rule.columns:
            alias_set = {a.lower() for a in col_rule.aliases}
            if any(alias in source_column_normalized for alias in alias_set):
                return (
                    table_rule.table,
                    col_rule.column,
                    col_rule.default_transform,
                    0.82,
                    f"Schema fuzzy match for {table_rule.table}.{col_rule.column}.",
                )
    return (
        "object_temp",
        source_column_normalized,
        "identity",
        0.35,
        "No schema match found; fallback to object_temp.",
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
