from __future__ import annotations

import os
import re
from typing import Any

import pandas as pd

try:
    from core.target_schema import build_target_schema_context, find_best_target, validate_mapping_target
except ModuleNotFoundError:
    from universal_ai_ingestor.core.target_schema import (  # type: ignore
        build_target_schema_context,
        find_best_target,
        validate_mapping_target,
    )

try:
    from core.schemas import (
        DiscoveryContract,
        DiscoveryFieldProposal,
        DiscoveryRelationHypothesis,
        DiscoverySheetProfile,
        MappingPlan,
        MultiSheetMappingPlan,
        SheetSample,
        WorkbookPayload,
    )
except ModuleNotFoundError:
    from universal_ai_ingestor.core.schemas import (  # type: ignore
        DiscoveryContract,
        DiscoveryFieldProposal,
        DiscoveryRelationHypothesis,
        DiscoverySheetProfile,
        MappingPlan,
        MultiSheetMappingPlan,
        SheetSample,
        WorkbookPayload,
    )


def _workbook_payload_from_sheets(sheets: dict[str, pd.DataFrame]) -> WorkbookPayload:
    samples: list[SheetSample] = []
    for sheet_name, df in sheets.items():
        samples.append(
            SheetSample(
                sheet_name=sheet_name,
                incoming_columns=[str(c) for c in df.columns],
                sample_rows=df.head(20).to_dict(orient="records"),
            )
        )
    return WorkbookPayload(workbook_name="discovery_workbook", sheets=samples)


def _enhance_with_ai_workbook(
    *,
    source_format: str,
    sheets: dict[str, pd.DataFrame],
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

    workbook_payload = _workbook_payload_from_sheets(sheets)
    global_sample_rows: list[dict[str, Any]] = []
    for sheet in workbook_payload.sheets:
        global_sample_rows.extend(sheet.sample_rows[:10])

    try:
        plan_bundle = generate_mapping_plan(
            schema_snapshot=build_target_schema_context(),
            sample_rows=global_sample_rows[:30],
            source_format=source_format,
            workbook_payload=workbook_payload,
        )
    except Exception as exc:  # noqa: BLE001
        assumptions.append(f"AI discovery failed ({exc.__class__.__name__}); kept rule-based mappings.")
        return

    ai_by_sheet_and_source: dict[tuple[str, str], Any] = {}
    if isinstance(plan_bundle, MultiSheetMappingPlan):
        for sheet_name, plan in plan_bundle.per_sheet.items():
            for target in plan.targets:
                ai_by_sheet_and_source[(sheet_name, str(target.source_key))] = target
    elif isinstance(plan_bundle, MappingPlan):
        default_sheet = next(iter(sheets.keys()), "default")
        for target in plan_bundle.targets:
            ai_by_sheet_and_source[(default_sheet, str(target.source_key))] = target

    updated = 0
    for idx, proposal in enumerate(proposals):
        ai_target = ai_by_sheet_and_source.get((proposal.sheet_name, proposal.source_column))
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
            confidence=max(float(proposal.confidence), float(getattr(plan_bundle, "confidence", 0.0)), 0.7),
            rationale=f"AI-assisted mapping from source sample for {proposal.source_column}.",
            status="proposed",
        )
        scores.append(max(float(getattr(plan_bundle, "confidence", 0.0)), 0.7))
        updated += 1
    assumptions.append(
        f"AI discovery applied across workbook for {updated} fields." if updated else
        "AI discovery run produced no valid upgrades."
    )


_ENTITY_KEYWORD_MAP: dict[str, tuple[str, str]] = {
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

_MULTI_VALUE_DELIMITER_THRESHOLD = 0.3


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


def _resolve_entity_from_column(column_name: str) -> tuple[str, str]:
    """Match column name against semantic keywords to identify entity type and staging table."""
    norm = _norm(column_name)
    for keyword, (entity_type, staging_table) in _ENTITY_KEYWORD_MAP.items():
        if keyword in norm:
            return entity_type, staging_table
    return "", ""


def _detect_delimiter_relations(
    sheet_profiles: list[DiscoverySheetProfile],
    relation_hypotheses: list[DiscoveryRelationHypothesis],
    scores: list[float],
) -> None:
    """Detect multi-value columns using delimiter frequency from column profiles."""
    for sheet_profile in sheet_profiles:
        columns_data = sheet_profile.profile.get("columns", {})
        total_rows = sheet_profile.profile.get("rows", 0)
        if total_rows == 0:
            continue
        for col_name, col_profile in columns_data.items():
            delimiter_counts: dict[str, int] = col_profile.get("delimiter_counts", {})
            best_sep, best_count = None, 0
            for sep, count in delimiter_counts.items():
                if count > best_count:
                    best_sep = sep
                    best_count = count
            if not best_sep or best_count / total_rows < _MULTI_VALUE_DELIMITER_THRESHOLD:
                continue
            entity_type, staging_table = _resolve_entity_from_column(col_name)
            conf = 0.7 if entity_type else 0.5
            relation_hypotheses.append(
                DiscoveryRelationHypothesis(
                    from_sheet=sheet_profile.sheet_name,
                    from_column=col_name,
                    separator=best_sep,
                    relation_type="multi_value_list",
                    target_entity_type=entity_type,
                    target_staging_table=staging_table,
                    is_join_table=False,
                    confidence=conf,
                    rationale=(
                        f"Delimiter '{best_sep}' in {best_count}/{total_rows} rows"
                        + (f"; column name maps to entity '{entity_type}'." if entity_type else "; entity type unknown, needs review.")
                    ),
                    status="proposed",
                )
            )
            scores.append(conf)


def _detect_join_tables(
    sheet_profiles: list[DiscoverySheetProfile],
    relation_hypotheses: list[DiscoveryRelationHypothesis],
    scores: list[float],
) -> None:
    """Detect sheets that look like pure junction tables (only 2-3 ID-like columns)."""
    for sheet_profile in sheet_profiles:
        columns_data = sheet_profile.profile.get("columns", {})
        col_names = list(columns_data.keys())
        if not (2 <= len(col_names) <= 3):
            continue
        id_cols = [c for c in col_names if _norm(c).endswith(("_id", "_ids", "_code", "_codes"))]
        if len(id_cols) < 2:
            continue
        entity_type, staging_table = _resolve_entity_from_column(sheet_profile.sheet_name)
        relation_hypotheses.append(
            DiscoveryRelationHypothesis(
                from_sheet=sheet_profile.sheet_name,
                from_column=id_cols[0],
                to_column=id_cols[1],
                relation_type="join_table",
                is_join_table=True,
                target_entity_type=entity_type,
                target_staging_table=staging_table,
                confidence=0.8,
                rationale=f"Sheet has {len(col_names)} columns with {len(id_cols)} ID-like fields; likely a junction table.",
                status="proposed",
            )
        )
        scores.append(0.8)


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
    _enhance_with_ai_workbook(
        source_format=source_format,
        sheets=sheets,
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

    _detect_delimiter_relations(sheet_profiles, relation_hypotheses, scores)
    _detect_join_tables(sheet_profiles, relation_hypotheses, scores)

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
                    "separator": r.separator,
                    "is_join_table": r.is_join_table,
                    "target_staging_table": r.target_staging_table,
                    "target_entity_type": r.target_entity_type,
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
