from __future__ import annotations

import asyncio
import io
import json
import hashlib
import re
from dataclasses import dataclass
from typing import Any
from xml.etree import ElementTree as ET

import pandas as pd

from core.ai_graph import generate_mapping_plan, run_cleaner_batch
from core.config import settings
from core.schemas import MappingPlan, MappingTarget, MultiSheetMappingPlan, SheetSample, WorkbookPayload
from core.supabase_client import insert_staging_table_rows, update_import_batch_row
try:
    from core.target_schema import TARGET_SCHEMA_RULES, VALID_TRANSFORMS, flatten_required_columns
except ModuleNotFoundError:
    from universal_ai_ingestor.core.target_schema import (  # type: ignore
        TARGET_SCHEMA_RULES,
        VALID_TRANSFORMS,
        flatten_required_columns,
    )


@dataclass
class ParsedPayload:
    source_format: str
    dataframe: pd.DataFrame
    workbook_sheets: dict[str, pd.DataFrame] | None = None


def parse_payload(content_type: str | None, payload: bytes, source_name: str | None = None) -> ParsedPayload:
    ct = (content_type or "").lower()
    filename = (source_name or "").lower()
    if (
        "spreadsheetml" in ct
        or "excel" in ct
        or filename.endswith(".xlsx")
        or filename.endswith(".xlsm")
        or (payload[:2] == b"PK" and "csv" not in ct and "json" not in ct and "xml" not in ct)
    ):
        sheets = pd.read_excel(io.BytesIO(payload), sheet_name=None)
        normalized_sheets: dict[str, pd.DataFrame] = {}
        frames: list[pd.DataFrame] = []
        for raw_sheet_name, sheet_df in sheets.items():
            if sheet_df is None or sheet_df.empty:
                continue
            name = str(raw_sheet_name).strip() or "Sheet"
            normalized = sheet_df.copy()
            normalized.columns = [str(c).strip() for c in normalized.columns]
            normalized["source_sheet"] = name
            normalized["source_row_index"] = range(1, len(normalized) + 1)
            normalized_sheets[name] = normalized
            frames.append(normalized)
        combined = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        return ParsedPayload(source_format="xlsx", dataframe=combined, workbook_sheets=normalized_sheets)
    if "csv" in ct:
        df = pd.read_csv(io.BytesIO(payload))
        return ParsedPayload(source_format="csv", dataframe=df)
    if "json" in ct:
        obj = json.loads(payload.decode("utf-8"))
        if isinstance(obj, list):
            df = pd.DataFrame(obj)
        else:
            df = pd.DataFrame([obj])
        return ParsedPayload(source_format="json", dataframe=df)
    if "xml" in ct or payload.strip().startswith(b"<"):
        root = ET.fromstring(payload.decode("utf-8"))
        rows = []
        for child in root:
            row = {sub.tag: (sub.text or "") for sub in list(child)}
            if row:
                rows.append(row)
        df = pd.DataFrame(rows)
        return ParsedPayload(source_format="xml", dataframe=df)
    # Default fallback: attempt CSV.
    df = pd.read_csv(io.BytesIO(payload))
    return ParsedPayload(source_format="csv", dataframe=df)


def schema_snapshot_from_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    sample_dtypes = {c: str(t) for c, t in df.dtypes.items()}
    required = flatten_required_columns()
    return {
        "target_tables": list(TARGET_SCHEMA_RULES.keys()),
        "target_required_fields": required,
        "allowed_transforms": sorted(VALID_TRANSFORMS),
        "incoming_columns": list(df.columns),
        "incoming_dtypes": sample_dtypes,
    }


def _sanitize_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert non-JSON-serializable types (datetime, Timestamp, etc.) to strings."""
    import datetime as _dt

    sanitized: list[dict[str, Any]] = []
    for row in records:
        clean: dict[str, Any] = {}
        for k, v in row.items():
            if isinstance(v, (_dt.datetime, _dt.date, _dt.time)):
                clean[k] = v.isoformat()
            elif hasattr(v, "isoformat"):
                clean[k] = v.isoformat()
            elif isinstance(v, float) and pd.isna(v):
                clean[k] = None
            else:
                clean[k] = v
        sanitized.append(clean)
    return sanitized


def workbook_payload_from_sheets(sheets: dict[str, pd.DataFrame], workbook_name: str | None = None) -> WorkbookPayload:
    samples: list[SheetSample] = []
    for sheet_name, df in sheets.items():
        sample_rows = _sanitize_records(df.head(settings.sample_rows).to_dict(orient="records"))
        samples.append(
            SheetSample(
                sheet_name=sheet_name,
                incoming_columns=list(df.columns),
                sample_rows=sample_rows,
            )
        )
    return WorkbookPayload(workbook_name=workbook_name, sheets=samples)


def apply_mapping(df: pd.DataFrame, plan: MappingPlan) -> pd.DataFrame:
    out = pd.DataFrame()
    for target in plan.targets:
        if target.source_key not in df.columns:
            continue
        value = df[target.source_key]
        if target.transform == "split_gps":
            split = value.astype(str).str.replace(" ", "", regex=False).str.split(",", n=1, expand=True)
            if target.column == "latitude":
                out[target.column] = pd.to_numeric(split[0], errors="coerce")
            elif target.column == "longitude":
                out[target.column] = pd.to_numeric(split[1], errors="coerce")
        elif target.transform == "lowercase":
            out[target.column] = value.astype(str).str.lower()
        else:
            out[target.column] = value
    if "name" not in out.columns and len(df.columns) > 0:
        out["name"] = df.iloc[:, 0].astype(str)
    if "object_type" not in out.columns:
        out["object_type"] = "ORG"
    return out


def apply_mapping_by_table(df: pd.DataFrame, plan: MappingPlan) -> dict[str, pd.DataFrame]:
    table_outputs: dict[str, pd.DataFrame] = {}
    for target in plan.targets:
        if target.source_key not in df.columns:
            continue
        table_name = target.table or "object_temp"
        table_df = table_outputs.setdefault(table_name, pd.DataFrame(index=df.index))
        value = df[target.source_key]
        if target.transform == "split_gps":
            split = value.astype(str).str.replace(" ", "", regex=False).str.split(",", n=1, expand=True)
            if target.column == "latitude":
                table_df[target.column] = pd.to_numeric(split[0], errors="coerce")
            elif target.column == "longitude":
                table_df[target.column] = pd.to_numeric(split[1], errors="coerce")
        elif target.transform == "lowercase":
            table_df[target.column] = value.astype(str).str.lower()
        else:
            table_df[target.column] = value

    object_df = table_outputs.setdefault("object_temp", pd.DataFrame(index=df.index))
    if "name" not in object_df.columns and len(df.columns) > 0:
        object_df["name"] = df.iloc[:, 0].astype(str)
    if "object_type" not in object_df.columns:
        object_df["object_type"] = "ORG"
    return table_outputs


def _load_approved_contract_plan(sb, batch_id: str, source_format: str) -> MappingPlan | MultiSheetMappingPlan | None:
    contract_resp = (
        sb.schema("staging")
        .table("mapping_contract")
        .select("id,status")
        .eq("import_batch_id", batch_id)
        .order("contract_version", desc=True)
        .limit(1)
        .execute()
    )
    contract_rows = contract_resp.data or []
    if not contract_rows:
        return None
    contract_row = contract_rows[0]
    if contract_row.get("status") != "approved":
        return None
    field_resp = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("sheet_name,source_column,target_table,target_column,transform,confidence")
        .eq("contract_id", contract_row["id"])
        .eq("status", "approved")
        .execute()
    )
    field_rows = field_resp.data or []
    if not field_rows:
        return None
    per_sheet_targets: dict[str, list[MappingTarget]] = {}
    per_sheet_conf: dict[str, list[float]] = {}
    for row in field_rows:
        table_name = row.get("target_table") or "object_temp"
        column_name = row.get("target_column") or row.get("source_column")
        transform_name = row.get("transform") or "identity"
        table_rule = TARGET_SCHEMA_RULES.get(str(table_name))
        if table_rule is None:
            continue
        if str(column_name) not in {c.column for c in table_rule.columns}:
            continue
        if str(transform_name) not in table_rule.allowed_transforms:
            continue
        sheet = row.get("sheet_name") or "default"
        per_sheet_targets.setdefault(sheet, []).append(
            MappingTarget(
                table=table_name,
                column=column_name,
                transform=transform_name,
                source_key=row.get("source_column"),
                source_sheet=sheet,
            )
        )
        per_sheet_conf.setdefault(sheet, []).append(float(row.get("confidence") or 0))
    if len(per_sheet_targets) == 1 and "default" in per_sheet_targets:
        confs = per_sheet_conf.get("default", [0.0])
        return MappingPlan(
            source_format=source_format,
            confidence=sum(confs) / len(confs),
            targets=per_sheet_targets["default"],
            assumptions=["approved_mapping_contract"],
        )
    per_sheet_plans: dict[str, MappingPlan] = {}
    for sheet, targets in per_sheet_targets.items():
        confs = per_sheet_conf.get(sheet, [0.0])
        per_sheet_plans[sheet] = MappingPlan(
            source_format=source_format,
            confidence=sum(confs) / len(confs),
            targets=targets,
            assumptions=["approved_mapping_contract"],
        )
    conf_all = [v for vals in per_sheet_conf.values() for v in vals] or [0.0]
    return MultiSheetMappingPlan(
        source_format=source_format,
        confidence=sum(conf_all) / len(conf_all),
        per_sheet=per_sheet_plans,
        assumptions=["approved_mapping_contract_multisheet"],
    )


def _load_approved_contract_relations(sb, batch_id: str) -> list[dict[str, Any]]:
    """Load approved relation hypotheses from the discovery contract."""
    contract_resp = (
        sb.schema("staging")
        .table("mapping_contract")
        .select("id,status")
        .eq("import_batch_id", batch_id)
        .order("contract_version", desc=True)
        .limit(1)
        .execute()
    )
    contract_rows = contract_resp.data or []
    if not contract_rows:
        return []
    contract_row = contract_rows[0]
    if contract_row.get("status") != "approved":
        return []
    relation_resp = (
        sb.schema("staging")
        .table("mapping_relation_hypothesis")
        .select(
            "from_sheet,from_column,to_sheet,to_column,"
            "relation_type,separator,is_join_table,"
            "target_staging_table,target_entity_type,confidence"
        )
        .eq("contract_id", contract_row["id"])
        .eq("status", "approved")
        .execute()
    )
    return relation_resp.data or []


_LEGACY_RELATION_FALLBACKS: list[dict[str, Any]] = [
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


def _pick_from_row(row: dict[str, Any], candidates: list[str]) -> Any:
    for key in candidates:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _to_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_pipe_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        except Exception:  # noqa: BLE001
            pass
    return [s.strip() for s in re.split(r"[|,;]", text) if s.strip()]


def _to_list_with_separator(value: Any, separator: str = ",") -> list[str]:
    """Split a value using a contract-specified separator (AI-determined)."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        except Exception:  # noqa: BLE001
            pass
    return [s.strip() for s in text.split(separator) if s.strip()]


def _stable_key(prefix: str, *parts: Any) -> str:
    raw = "|".join([(str(p) if p is not None else "") for p in parts]).lower()
    return f"{prefix}::{hashlib.md5(raw.encode('utf-8')).hexdigest()}"


def _chunked_insert(
    sb,
    table_name: str,
    rows: list[dict[str, Any]],
    *,
    upsert: bool = False,
    on_conflict: str | None = None,
) -> None:
    if not rows:
        return
    for i in range(0, len(rows), settings.etl_chunk_size):
        insert_staging_table_rows(
            sb,
            table_name,
            rows[i : i + settings.etl_chunk_size],
            upsert=upsert,
            on_conflict=on_conflict,
        )


def _resolve_relations_for_row(
    *,
    row: dict[str, Any],
    source_sheet: str,
    contract_relations: list[dict[str, Any]],
    batch_id: str,
    staging_object_key: str,
    lineage_row: dict[str, Any],
    external_id: Any,
    org_rows: dict[str, dict[str, Any]],
    org_link_rows: list[dict[str, Any]],
    amenity_rows: list[dict[str, Any]],
    payment_rows: list[dict[str, Any]],
    media_rows: list[dict[str, Any]],
) -> None:
    """Route multi-value tokens to staging tables based on contract relations."""
    for relation in contract_relations:
        rel_sheet = relation.get("from_sheet", "")
        if rel_sheet and rel_sheet != "*" and rel_sheet != source_sheet:
            continue

        candidates = relation.get("from_column_candidates")
        if candidates:
            raw_val = _pick_from_row(row, candidates)
            source_col = next(
                (c for c in candidates if c in row and row[c] not in (None, "")),
                candidates[0] if candidates else "unknown",
            )
        else:
            source_col = relation.get("from_column", "")
            raw_val = row.get(source_col)

        if not raw_val:
            continue

        separator = relation.get("separator", ",")
        entity_type = relation.get("target_entity_type", "")
        tokens = _to_list_with_separator(raw_val, separator)
        if not tokens:
            continue

        if entity_type == "org":
            for token in tokens:
                token = token.strip()
                rel_org_key = f"org::source::{token}"
                org_rows.setdefault(
                    rel_org_key,
                    {
                        "import_batch_id": batch_id,
                        "staging_org_key": rel_org_key,
                        "name": f"Imported organization {token}",
                        "source_org_object_id": token,
                        "external_id": None,
                        "source_sheet": source_sheet,
                        "raw_source_data": lineage_row,
                        "resolution_status": "pending",
                        "policy_action": "allow_auto",
                        "is_approved": True,
                    },
                )
                org_link_rows.append(
                    {
                        "import_batch_id": batch_id,
                        "staging_object_key": staging_object_key,
                        "staging_org_key": rel_org_key,
                        "source_sheet": source_sheet,
                        "source_column": source_col,
                        "raw_relation_token": token,
                        "role_code": "owner",
                        "is_primary": False,
                        "note": f"derived_from_{source_col}",
                        "raw_source_data": lineage_row,
                        "resolution_status": "pending",
                        "is_approved": True,
                    }
                )
        elif entity_type == "amenity":
            for token in tokens:
                amenity_rows.append(
                    {
                        "import_batch_id": batch_id,
                        "staging_object_key": staging_object_key,
                        "amenity_code": token.lower(),
                        "source_sheet": source_sheet,
                        "source_column": source_col,
                        "raw_relation_token": token,
                        "raw_source_data": lineage_row,
                        "resolution_status": "pending",
                        "is_approved": True,
                    }
                )
        elif entity_type == "payment":
            for token in tokens:
                payment_rows.append(
                    {
                        "import_batch_id": batch_id,
                        "staging_object_key": staging_object_key,
                        "payment_code": token.lower(),
                        "source_sheet": source_sheet,
                        "source_column": source_col,
                        "raw_relation_token": token,
                        "raw_source_data": lineage_row,
                        "resolution_status": "pending",
                        "is_approved": True,
                    }
                )
        elif entity_type == "media":
            for position, media_url in enumerate(tokens):
                media_rows.append(
                    {
                        "import_batch_id": batch_id,
                        "staging_object_key": staging_object_key,
                        "source_sheet": source_sheet,
                        "source_column": source_col,
                        "source_url": media_url,
                        "url_token": media_url.rsplit("/", 1)[-1].lower(),
                        "source_external_object_token": str(external_id).lower() if external_id else None,
                        "position": position,
                        "raw_source_data": lineage_row,
                        "resolution_status": "pending",
                        "processing_status": "pending_download",
                        "is_approved": False,
                    }
                )


async def clean_unstructured(df: pd.DataFrame, columns: list[str]) -> tuple[pd.DataFrame, int]:
    if not columns:
        return df, 0
    corrected_count = 0
    for col in columns:
        if col not in df.columns:
            continue
        values = df[col].fillna("").astype(str).tolist()
        cleaned: list[dict[str, Any]] = []
        for i in range(0, len(values), settings.cleaner_batch_size):
            batch = values[i : i + settings.cleaner_batch_size]
            response = await run_cleaner_batch(batch)
            cleaned.extend([it.normalized for it in response.items])
            corrected_count += sum(1 for it in response.items if bool(it.normalized))
        df[f"{col}_cleaned"] = cleaned[: len(df)]
    return df, corrected_count


async def run_batch_pipeline(
    *,
    sb,
    batch_id: str,
    payload: bytes,
    content_type: str | None,
    source_name: str | None = None,
    default_org_object_id: str | None = None,
    default_org_name: str | None = None,
    use_cleaner: bool = False,
) -> dict[str, Any]:
    update_import_batch_row(sb, batch_id, status="profiling")
    parsed = parse_payload(content_type, payload, source_name=source_name)
    schema_snapshot = schema_snapshot_from_dataframe(parsed.dataframe)
    sample_rows = parsed.dataframe.head(settings.sample_rows).to_dict(orient="records")
    workbook_payload = None
    if parsed.workbook_sheets:
        workbook_payload = workbook_payload_from_sheets(parsed.workbook_sheets, workbook_name=source_name)

    update_import_batch_row(sb, batch_id, status="mapping")
    mapping_source_label = "llm_plan"
    plan_bundle = _load_approved_contract_plan(sb, batch_id, parsed.source_format)
    if plan_bundle is None:
        try:
            plan_bundle = generate_mapping_plan(
                schema_snapshot=schema_snapshot,
                sample_rows=sample_rows,
                source_format=parsed.source_format,
                workbook_payload=workbook_payload,
            )
        except Exception:  # noqa: BLE001
            # Deterministic fallback if LLM mapping fails.
            if workbook_payload is not None and workbook_payload.sheets:
                plan_bundle = MultiSheetMappingPlan(
                    source_format=parsed.source_format,
                    confidence=0.0,
                    per_sheet={
                        s.sheet_name: MappingPlan(
                            source_format=parsed.source_format,
                            confidence=0.0,
                            targets=[],
                            assumptions=[f"llm_fallback_for_sheet:{s.sheet_name}"],
                        )
                        for s in workbook_payload.sheets
                    },
                    assumptions=["llm_workbook_fallback"],
                )
            else:
                plan_bundle = MappingPlan(
                    source_format=parsed.source_format,
                    confidence=0.0,
                    targets=[],
                    assumptions=["llm_fallback"],
                )
    else:
        mapping_source_label = "approved_contract"
    update_import_batch_row(sb, batch_id, mapping_rules=plan_bundle.model_dump())

    update_import_batch_row(sb, batch_id, status="transforming")
    transformed_by_table: dict[str, pd.DataFrame] = {}
    if isinstance(plan_bundle, MultiSheetMappingPlan) and parsed.workbook_sheets:
        merged_tables: dict[str, list[pd.DataFrame]] = {}
        for sheet_name, sheet_df in parsed.workbook_sheets.items():
            sheet_plan = plan_bundle.per_sheet.get(sheet_name) or MappingPlan(
                source_format=parsed.source_format,
                confidence=0.0,
                targets=[],
                assumptions=[f"missing_sheet_plan:{sheet_name}"],
            )
            table_outputs = apply_mapping_by_table(sheet_df, sheet_plan)
            for table_name, table_df in table_outputs.items():
                tagged = table_df.copy()
                tagged["source_sheet"] = sheet_name
                merged_tables.setdefault(table_name, []).append(tagged)
        transformed_by_table = {
            table_name: pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
            for table_name, parts in merged_tables.items()
        }
        unstructured_fields = sorted(
            {
                field
                for per_sheet_plan in plan_bundle.per_sheet.values()
                for field in per_sheet_plan.unstructured_fields
            }
        )
    else:
        single_plan = plan_bundle if isinstance(plan_bundle, MappingPlan) else MappingPlan(source_format=parsed.source_format, confidence=0.0, targets=[])
        transformed_by_table = apply_mapping_by_table(parsed.dataframe, single_plan)
        unstructured_fields = single_plan.unstructured_fields

    transformed = transformed_by_table.get("object_temp", pd.DataFrame()).copy()
    for table_name, table_df in transformed_by_table.items():
        if table_name == "object_temp":
            continue
        for col in table_df.columns:
            if col not in transformed.columns:
                transformed[col] = table_df[col]

    ai_corrections = 0
    if use_cleaner:
        try:
            transformed, ai_corrections = await clean_unstructured(transformed, unstructured_fields)
        except Exception:  # noqa: BLE001
            # Keep pipeline progressing with deterministic output if cleaner fails.
            pass
    transformed = transformed.fillna("")
    required_object_fields = flatten_required_columns().get("object_temp", set())
    missing_required = [field for field in required_object_fields if field not in transformed.columns]
    if missing_required:
        raise ValueError(f"Approved mapping missing required object fields: {', '.join(sorted(missing_required))}")
    empty_required = [
        field
        for field in required_object_fields
        if transformed[field].astype(str).str.strip().eq("").all()
    ]
    if empty_required:
        raise ValueError(f"Required object fields contain no values: {', '.join(sorted(empty_required))}")

    object_rows: list[dict[str, Any]] = []
    org_rows: dict[str, dict[str, Any]] = {}
    location_rows: list[dict[str, Any]] = []
    contact_rows: list[dict[str, Any]] = []
    org_link_rows: list[dict[str, Any]] = []
    class_scheme_rows: dict[str, dict[str, Any]] = {}
    class_value_rows: dict[str, dict[str, Any]] = {}
    object_class_rows: list[dict[str, Any]] = []
    amenity_rows: list[dict[str, Any]] = []
    payment_rows: list[dict[str, Any]] = []
    media_rows: list[dict[str, Any]] = []

    contract_relations = _load_approved_contract_relations(sb, batch_id)
    if not contract_relations:
        contract_relations = _LEGACY_RELATION_FALLBACKS

    for row in transformed.to_dict(orient="records"):
        lineage_row = dict(row)
        lineage_row["_lineage"] = {"mapping_source": mapping_source_label}
        source_sheet = _pick_from_row(row, ["source_sheet", "_sheet", "sheet_name"]) or "default"
        source_org = _pick_from_row(
            row,
            ["source_org_object_id", "organization_object_id", "org_object_id", "org_id", "organization_id"],
        )
        org_name = _pick_from_row(row, ["org_name", "organization_name", "organization", "owner_org_name"])
        if not source_org and default_org_object_id:
            source_org = default_org_object_id
        if not org_name and default_org_name:
            org_name = default_org_name
        external_id = _pick_from_row(row, ["external_id", "source_object_id", "id_externe", "partner_id"])
        email = _pick_from_row(row, ["email", "mail", "courriel", "contact_email"])
        phone = _pick_from_row(row, ["phone", "telephone", "tel", "mobile", "contact_phone"])
        latitude = _to_float_or_none(_pick_from_row(row, ["latitude", "lat", "coord_lat"]))
        longitude = _to_float_or_none(_pick_from_row(row, ["longitude", "lon", "lng", "coord_lon"]))
        staging_object_key = _stable_key("obj", row.get("name"), external_id, latitude, longitude)

        staging_org_key = None
        if source_org:
            staging_org_key = f"org::source::{source_org}"
        elif org_name:
            staging_org_key = _stable_key("org", org_name)

        object_rows.append(
            {
                "staging_object_key": staging_object_key,
                "staging_org_key": staging_org_key,
                "source_sheet": source_sheet,
                "raw_source_data": lineage_row,
                "object_type": row.get("object_type"),
                "name": row.get("name"),
                "org_name": org_name,
                "external_id": external_id,
                "source_org_object_id": source_org,
                "email": email,
                "phone": phone,
                "latitude": latitude,
                "longitude": longitude,
                "deduplication_status": "pending",
                "resolution_status": "pending",
                "is_approved": False,
            }
        )

        if staging_org_key:
            org_rows.setdefault(
                staging_org_key,
                {
                    "import_batch_id": batch_id,
                    "staging_org_key": staging_org_key,
                    "name": org_name or "Imported organization",
                    "source_org_object_id": source_org,
                    "external_id": None,
                    "source_sheet": source_sheet,
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "policy_action": "allow_auto",
                    "is_approved": True,
                },
            )
            org_link_rows.append(
                {
                    "import_batch_id": batch_id,
                    "staging_object_key": staging_object_key,
                    "staging_org_key": staging_org_key,
                    "source_sheet": source_sheet,
                    "role_code": (_pick_from_row(row, ["org_role_code", "organization_role"]) or "owner").lower(),
                    "is_primary": True,
                    "note": None,
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "is_approved": True,
                }
            )

        if latitude is not None and longitude is not None:
            location_rows.append(
                {
                    "import_batch_id": batch_id,
                    "staging_object_key": staging_object_key,
                    "latitude": latitude,
                    "longitude": longitude,
                    "source_sheet": source_sheet,
                    "address1": _pick_from_row(row, ["address1", "adresse", "address"]),
                    "city": _pick_from_row(row, ["city", "ville", "commune"]),
                    "postcode": _pick_from_row(row, ["postcode", "postal_code", "cp"]),
                    "is_main_location": True,
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "is_approved": True,
                }
            )

        if email:
            contact_rows.append(
                {
                    "import_batch_id": batch_id,
                    "staging_object_key": staging_object_key,
                    "kind_code": "email",
                    "value": str(email),
                    "source_sheet": source_sheet,
                    "is_public": True,
                    "is_primary": True,
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "is_approved": True,
                }
            )
        if phone:
            contact_rows.append(
                {
                    "import_batch_id": batch_id,
                    "staging_object_key": staging_object_key,
                    "kind_code": "phone",
                    "value": str(phone),
                    "source_sheet": source_sheet,
                    "is_public": True,
                    "is_primary": True,
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "is_approved": True,
                }
            )

        scheme_code = _pick_from_row(row, ["classification_scheme", "classification_scheme_code", "scheme_code"])
        value_code = _pick_from_row(row, ["classification_value", "classification_value_code", "value_code"])
        if scheme_code and value_code:
            scheme_code = str(scheme_code).lower()
            value_code = str(value_code).lower()
            class_scheme_rows.setdefault(
                scheme_code,
                {
                    "import_batch_id": batch_id,
                    "scheme_code": scheme_code,
                    "scheme_name": str(
                        _pick_from_row(row, ["classification_scheme_name", "scheme_name"]) or scheme_code
                    ),
                    "source_sheet": source_sheet,
                    "description": None,
                    "selection": "single",
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "policy_action": "require_review",
                    "is_approved": False,
                },
            )
            class_value_rows.setdefault(
                f"{scheme_code}::{value_code}",
                {
                    "import_batch_id": batch_id,
                    "scheme_code": scheme_code,
                    "value_code": value_code,
                    "source_sheet": source_sheet,
                    "value_name": str(_pick_from_row(row, ["classification_value_name", "value_name"]) or value_code),
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "policy_action": "require_review",
                    "is_approved": False,
                },
            )
            object_class_rows.append(
                {
                    "import_batch_id": batch_id,
                    "staging_object_key": staging_object_key,
                    "scheme_code": scheme_code,
                    "value_code": value_code,
                    "source_sheet": source_sheet,
                    "raw_source_data": lineage_row,
                    "resolution_status": "pending",
                    "is_approved": False,
                }
            )

        _resolve_relations_for_row(
            row=row,
            source_sheet=source_sheet,
            contract_relations=contract_relations,
            batch_id=batch_id,
            staging_object_key=staging_object_key,
            lineage_row=lineage_row,
            external_id=external_id,
            org_rows=org_rows,
            org_link_rows=org_link_rows,
            amenity_rows=amenity_rows,
            payment_rows=payment_rows,
            media_rows=media_rows,
        )

    # Base object staging load.
    enriched_objects = [{"import_batch_id": batch_id, **r} for r in object_rows]
    _chunked_insert(sb, "object_temp", enriched_objects)

    # Typed staging entities.
    _chunked_insert(sb, "org_temp", list(org_rows.values()), upsert=True, on_conflict="import_batch_id,staging_org_key")
    _chunked_insert(
        sb,
        "object_location_temp",
        location_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,is_main_location",
    )
    _chunked_insert(
        sb,
        "contact_channel_temp",
        contact_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,kind_code,value",
    )
    _chunked_insert(
        sb,
        "object_org_link_temp",
        org_link_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,staging_org_key,role_code",
    )
    _chunked_insert(
        sb,
        "ref_classification_scheme_temp",
        list(class_scheme_rows.values()),
        upsert=True,
        on_conflict="import_batch_id,scheme_code",
    )
    _chunked_insert(
        sb,
        "ref_classification_value_temp",
        list(class_value_rows.values()),
        upsert=True,
        on_conflict="import_batch_id,scheme_code,value_code",
    )
    _chunked_insert(
        sb,
        "object_classification_temp",
        object_class_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,scheme_code,value_code",
    )
    _chunked_insert(
        sb,
        "object_amenity_temp",
        amenity_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,amenity_code",
    )
    _chunked_insert(
        sb,
        "object_payment_method_temp",
        payment_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,payment_code",
    )
    _chunked_insert(
        sb,
        "media_temp",
        media_rows,
        upsert=True,
        on_conflict="import_batch_id,staging_object_key,source_url",
    )

    update_import_batch_row(sb, batch_id, status="staging_loaded")
    return {
        "rows_loaded": len(object_rows),
        "locations": len(location_rows),
        "contacts": len(contact_rows),
        "ai_corrections": ai_corrections,
    }


def run_batch_pipeline_sync(**kwargs):
    return asyncio.run(run_batch_pipeline(**kwargs))
