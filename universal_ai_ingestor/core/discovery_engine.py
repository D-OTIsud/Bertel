from __future__ import annotations

import re
from typing import Any

import pandas as pd

try:
    from core.schemas import (
        DiscoveryContract,
        DiscoveryFieldProposal,
        DiscoveryRelationHypothesis,
        DiscoverySheetProfile,
    )
except ModuleNotFoundError:
    from universal_ai_ingestor.core.schemas import (  # type: ignore
        DiscoveryContract,
        DiscoveryFieldProposal,
        DiscoveryRelationHypothesis,
        DiscoverySheetProfile,
    )


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def _detect_entity_type(sheet_name: str, columns: list[str]) -> tuple[str, float]:
    name = _norm(sheet_name)
    joined = " ".join(_norm(c) for c in columns)
    if any(k in name for k in ("galerie", "gallery", "media", "photo", "image")):
        return "media", 0.95
    if "amenity" in name or "equip" in name:
        return "amenity", 0.85
    if "org" in name or "owner" in name or "company" in name:
        return "organization", 0.8
    if "object" in name or "listing" in name or "place" in name:
        return "object", 0.8
    if "url" in joined and ("image" in joined or "photo" in joined):
        return "media", 0.7
    return "object", 0.45


def _infer_target(source_column: str) -> tuple[str, str, str, float, str]:
    col = _norm(source_column)
    if col in {"name", "nom", "title"}:
        return "object_temp", "name", "identity", 0.95, "Direct lexical match for object name."
    if col in {"type", "object_type", "categorie", "category"}:
        return "object_temp", "object_type", "identity", 0.9, "Column indicates type/category semantics."
    if "email" in col or "mail" in col:
        return "contact_channel_temp", "value", "identity", 0.95, "Contact email pattern."
    if "phone" in col or "tel" in col or "mobile" in col:
        return "contact_channel_temp", "value", "identity", 0.95, "Contact phone pattern."
    if col in {"lat", "latitude", "coord_lat"}:
        return "object_location_temp", "latitude", "identity", 0.95, "Latitude geospatial candidate."
    if col in {"lon", "lng", "longitude", "coord_lon"}:
        return "object_location_temp", "longitude", "identity", 0.95, "Longitude geospatial candidate."
    if "address" in col or "adresse" in col:
        return "object_location_temp", "address1", "identity", 0.85, "Address lexical match."
    if "city" in col or "ville" in col or "commune" in col:
        return "object_location_temp", "city", "identity", 0.85, "City lexical match."
    if "post" in col or col in {"cp", "zip"}:
        return "object_location_temp", "postcode", "identity", 0.85, "Postal code lexical match."
    if "external" in col or col in {"id", "source_id", "partner_id", "id_externe"}:
        return "object_temp", "external_id", "identity", 0.8, "Potential external identifier."
    if "org" in col and "id" in col:
        return "object_temp", "source_org_object_id", "identity", 0.8, "Organization identifier candidate."
    if "org" in col and "name" in col:
        return "object_temp", "org_name", "identity", 0.8, "Organization name candidate."
    if any(k in col for k in ("media_url", "image_url", "photo_url", "photos", "images")):
        return "media_temp", "source_url", "split_list", 0.9, "Media URL collection candidate."
    if "amenity" in col or "equip" in col:
        return "object_amenity_temp", "amenity_code", "split_list", 0.75, "Amenities code list candidate."
    if "payment" in col:
        return "object_payment_method_temp", "payment_code", "split_list", 0.75, "Payment method list candidate."
    return "object_temp", col, "identity", 0.35, "Low-confidence fallback mapping."


def _profile_column(series: pd.Series) -> dict[str, Any]:
    values = [str(v).strip() for v in series.fillna("").tolist()]
    non_empty = [v for v in values if v]
    unique_count = len(set(non_empty))
    sample = non_empty[:5]
    delimiter_counts = {
        ",": sum(1 for v in non_empty if "," in v),
        ";": sum(1 for v in non_empty if ";" in v),
        "|": sum(1 for v in non_empty if "|" in v),
    }
    return {
        "dtype": str(series.dtype),
        "null_ratio": 1 - (len(non_empty) / len(values) if values else 1),
        "unique_count": unique_count,
        "samples": sample,
        "delimiter_counts": delimiter_counts,
    }


def build_discovery_contract(*, source_format: str, sheets: dict[str, pd.DataFrame]) -> DiscoveryContract:
    sheet_profiles: list[DiscoverySheetProfile] = []
    field_proposals: list[DiscoveryFieldProposal] = []
    relation_hypotheses: list[DiscoveryRelationHypothesis] = []
    assumptions: list[str] = []
    scores: list[float] = []

    for sheet_name, df in sheets.items():
        columns = [str(c) for c in df.columns]
        inferred_type, entity_conf = _detect_entity_type(sheet_name, columns)
        sheet_profile_payload = {
            "rows": int(len(df)),
            "columns": {
                col: _profile_column(df[col]) for col in df.columns
            },
        }
        sheet_profiles.append(
            DiscoverySheetProfile(
                sheet_name=sheet_name,
                inferred_entity_type=inferred_type,
                confidence=entity_conf,
                profile=sheet_profile_payload,
            )
        )
        scores.append(entity_conf)

        for col in columns:
            target_table, target_column, transform, conf, rationale = _infer_target(col)
            field_proposals.append(
                DiscoveryFieldProposal(
                    sheet_name=sheet_name,
                    source_column=col,
                    target_table=target_table,
                    target_column=target_column,
                    transform=transform,
                    confidence=conf,
                    rationale=rationale,
                    status="approved" if conf >= 0.9 else "proposed",
                )
            )
            scores.append(conf)

    sheet_cols = {s.sheet_name: set(s.profile.get("columns", {}).keys()) for s in sheet_profiles}
    for left_name, left_cols in sheet_cols.items():
        for right_name, right_cols in sheet_cols.items():
            if left_name == right_name:
                continue
            for left_col in left_cols:
                norm_left = _norm(left_col)
                if not norm_left.endswith("_id"):
                    continue
                expected = norm_left
                if expected in {_norm(c) for c in right_cols}:
                    relation_hypotheses.append(
                        DiscoveryRelationHypothesis(
                            from_sheet=left_name,
                            from_column=left_col,
                            to_sheet=right_name,
                            to_column=left_col,
                            relation_type="foreign_key_candidate",
                            confidence=0.75,
                            rationale="Column suffix _id matched across sheets.",
                            status="proposed",
                        )
                    )
                    scores.append(0.75)

    overall = sum(scores) / len(scores) if scores else 0.0
    if overall < 0.8:
        assumptions.append("Manual mapping review required for low-confidence legacy nomenclature.")

    return DiscoveryContract(
        source_format=source_format,
        overall_confidence=overall,
        assumptions=assumptions,
        sheets=sheet_profiles,
        fields=field_proposals,
        relations=relation_hypotheses,
    )


def persist_discovery_contract(sb, *, batch_id: str, contract: DiscoveryContract) -> dict[str, Any]:
    latest = (
        sb.schema("staging")
        .table("mapping_contract")
        .select("contract_version")
        .eq("import_batch_id", batch_id)
        .order("contract_version", desc=True)
        .limit(1)
        .execute()
    )
    rows = latest.data or []
    contract_version = int(rows[0]["contract_version"]) + 1 if rows else 1
    review_required = any(f.confidence < 0.9 for f in contract.fields) or any(r.confidence < 0.9 for r in contract.relations)
    status = "review_required" if review_required else "approved"

    inserted = (
        sb.schema("staging")
        .table("mapping_contract")
        .insert(
            {
                "import_batch_id": batch_id,
                "contract_version": contract_version,
                "source_format": contract.source_format,
                "overall_confidence": contract.overall_confidence,
                "status": status,
                "assumptions": contract.assumptions,
                "is_immutable": status == "approved",
            }
        )
        .execute()
    )
    contract_row = (inserted.data or [])[0]
    contract_id = contract_row["id"]

    if contract.sheets:
        sb.schema("staging").table("mapping_contract_sheet").insert(
            [
                {
                    "contract_id": contract_id,
                    "sheet_name": s.sheet_name,
                    "inferred_entity_type": s.inferred_entity_type,
                    "confidence": s.confidence,
                    "profile": s.profile,
                }
                for s in contract.sheets
            ]
        ).execute()

    if contract.fields:
        sb.schema("staging").table("mapping_contract_field").insert(
            [
                {
                    "contract_id": contract_id,
                    "sheet_name": f.sheet_name,
                    "source_column": f.source_column,
                    "target_table": f.target_table,
                    "target_column": f.target_column,
                    "transform": f.transform,
                    "confidence": f.confidence,
                    "rationale": f.rationale,
                    "status": f.status if status != "review_required" else "proposed",
                }
                for f in contract.fields
            ]
        ).execute()

    if contract.relations:
        sb.schema("staging").table("mapping_relation_hypothesis").insert(
            [
                {
                    "contract_id": contract_id,
                    "from_sheet": r.from_sheet,
                    "from_column": r.from_column,
                    "to_sheet": r.to_sheet,
                    "to_column": r.to_column,
                    "relation_type": r.relation_type,
                    "confidence": r.confidence,
                    "rationale": r.rationale,
                    "status": r.status if status != "review_required" else "proposed",
                }
                for r in contract.relations
            ]
        ).execute()

    return {
        "contract_id": contract_id,
        "contract_version": contract_version,
        "status": status,
        "review_required": review_required,
        "overall_confidence": contract.overall_confidence,
    }
