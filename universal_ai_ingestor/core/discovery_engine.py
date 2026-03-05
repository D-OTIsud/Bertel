from __future__ import annotations

import re
import os
from typing import Any

import pandas as pd

try:
    from core.target_schema import find_best_target, validate_mapping_target
except ModuleNotFoundError:
    from universal_ai_ingestor.core.target_schema import find_best_target, validate_mapping_target  # type: ignore

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


def _discovery_schema_snapshot(columns: list[str], sheet_name: str) -> dict[str, Any]:
    return {
        "target_tables": [
            "object_temp",
            "object_location_temp",
            "contact_channel_temp",
            "media_temp",
            "object_amenity_temp",
            "object_payment_method_temp",
        ],
        "allowed_transforms": ["identity", "lowercase", "split_list", "split_gps"],
        "incoming_columns": columns,
        "sheet_name": sheet_name,
    }


def _enhance_with_ai(
    *,
    source_format: str,
    sheet_name: str,
    df: pd.DataFrame,
    proposals: list[DiscoveryFieldProposal],
    scores: list[float],
    assumptions: list[str],
) -> None:
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key.strip():
        assumptions.append("AI discovery skipped: OPENAI_API_KEY is missing.")
        return
    try:
        from core.ai_graph import generate_mapping_plan
    except ModuleNotFoundError:
        try:
            from universal_ai_ingestor.core.ai_graph import generate_mapping_plan  # type: ignore
        except ModuleNotFoundError:
            assumptions.append("AI discovery skipped: mapping agent module unavailable.")
            return

    try:
        plan = generate_mapping_plan(
            schema_snapshot=_discovery_schema_snapshot(list(df.columns), sheet_name),
            sample_rows=df.head(10).to_dict(orient="records"),
            source_format=source_format,
            workbook_payload=None,
        )
    except Exception as exc:  # noqa: BLE001
        assumptions.append(f"AI discovery failed ({exc.__class__.__name__}); kept rule-based mappings.")
        return

    ai_by_source = {str(t.source_key): t for t in plan.targets}
    updated = 0
    for idx, proposal in enumerate(proposals):
        if proposal.sheet_name != sheet_name:
            continue
        ai_target = ai_by_source.get(proposal.source_column)
        if ai_target is None:
            continue
        ok, _ = validate_mapping_target(
            target_table=ai_target.table,
            target_column=ai_target.column,
            transform=ai_target.transform or "identity",
        )
        if not ok:
            continue
        proposals[idx] = DiscoveryFieldProposal(
            sheet_name=proposal.sheet_name,
            source_column=proposal.source_column,
            target_table=ai_target.table,
            target_column=ai_target.column,
            transform=ai_target.transform or "identity",
            confidence=max(float(proposal.confidence), float(plan.confidence), 0.65),
            rationale=f"AI-assisted mapping from source sample for {proposal.source_column}.",
            status="proposed",
        )
        scores.append(max(float(plan.confidence), 0.65))
        updated += 1
    assumptions.append(
        f"AI discovery applied on sheet '{sheet_name}' for {updated} fields." if updated else
        f"AI discovery run on sheet '{sheet_name}' but produced no valid upgrades."
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
    return find_best_target(col)


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
        _enhance_with_ai(
            source_format=source_format,
            sheet_name=sheet_name,
            df=df,
            proposals=field_proposals,
            scores=scores,
            assumptions=assumptions,
        )

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
