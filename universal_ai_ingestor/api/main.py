from __future__ import annotations

import hmac
import logging
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from core.config import settings
from core.discovery_engine import build_discovery_contract, persist_discovery_contract
from core.etl_engine import parse_payload, run_batch_pipeline_sync
from core.schemas import BatchStatus, IngestAccepted
from core.supabase_client import (
    append_import_event,
    ensure_import_batch_row_extended,
    fetch_raw_payload,
    find_batch_by_id,
    find_batch_by_idempotency,
    get_supabase,
    hash_payload,
    store_raw_payload,
    update_import_batch_row,
)
from core.target_schema import TARGET_SCHEMA_RULES, validate_mapping_target

app = FastAPI(title="Bertel Data Ingestor", version="2.0.0")
security = HTTPBearer(auto_error=False)
logger = logging.getLogger("ingestor.api")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

MAX_INGEST_BYTES = settings.ingest_max_bytes
MAX_ETL_ATTEMPTS = settings.etl_max_attempts
RETRY_BACKOFF = settings.etl_retry_backoff_seconds


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> None:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if not hmac.compare_digest(credentials.credentials, settings.api_bearer_token):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _detect_extension(content_type: str | None, fallback_name: str | None = None) -> str:
    ct = (content_type or "").lower()
    if "spreadsheet" in ct or "excel" in ct or "sheet" in ct:
        return "xlsx"
    if "json" in ct:
        return "json"
    if "xml" in ct:
        return "xml"
    if "csv" in ct:
        return "csv"
    if fallback_name and "." in fallback_name:
        return fallback_name.rsplit(".", 1)[-1].lower()
    return "bin"


def _latest_contract(sb, batch_id: str) -> dict[str, Any] | None:
    resp = (
        sb.schema("staging")
        .table("mapping_contract")
        .select("id,contract_version,status,overall_confidence,approved_at,approved_by,assumptions")
        .eq("import_batch_id", batch_id)
        .order("contract_version", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _contract_fields(sb, contract_id: str) -> list[dict[str, Any]]:
    resp = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("id,sheet_name,source_column,target_table,target_column,transform,confidence,rationale,status")
        .eq("contract_id", contract_id)
        .order("sheet_name")
        .execute()
    )
    return resp.data or []


def _batch_events(sb, batch_id: str, limit: int = 50) -> list[dict[str, Any]]:
    resp = (
        sb.schema("staging")
        .table("import_events")
        .select("phase,level,message,payload,created_at")
        .eq("import_batch_id", batch_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def _approve_and_validate(sb, batch_id: str, contract_id: str) -> None:
    """Bulk-approve all proposed fields, then auto-reject any that are invalid."""
    now_iso = datetime.now(timezone.utc).isoformat()
    (
        sb.schema("staging")
        .table("mapping_contract_field")
        .update({"status": "approved", "reviewed_by": "auto", "reviewed_at": now_iso})
        .eq("contract_id", contract_id)
        .in_("status", ["proposed", "approved"])
        .execute()
    )
    (
        sb.schema("staging")
        .table("mapping_relation_hypothesis")
        .update({"status": "approved"})
        .eq("contract_id", contract_id)
        .in_("status", ["proposed", "approved"])
        .execute()
    )
    approved_fields = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("id,target_table,target_column,transform")
        .eq("contract_id", contract_id)
        .eq("status", "approved")
        .execute()
    ).data or []
    for row in approved_fields:
        ok, reason = validate_mapping_target(
            target_table=str(row.get("target_table") or "").strip(),
            target_column=str(row.get("target_column") or "").strip(),
            transform=str(row.get("transform") or "identity").strip(),
        )
        if not ok:
            (
                sb.schema("staging")
                .table("mapping_contract_field")
                .update({"status": "rejected", "review_reason": f"auto_invalid: {reason}"})
                .eq("id", row["id"])
                .execute()
            )
    remaining = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("id")
        .eq("contract_id", contract_id)
        .eq("status", "approved")
        .limit(1)
        .execute()
    ).data or []
    if not remaining:
        raise HTTPException(status_code=400, detail="All mapping fields were invalid. Review and correct mappings.")
    (
        sb.schema("staging")
        .table("mapping_contract")
        .update({
            "status": "approved",
            "approved_by": "auto",
            "approved_at": now_iso,
            "is_immutable": True,
        })
        .eq("id", contract_id)
        .execute()
    )
    update_import_batch_row(sb, batch_id, status="mapping_approved")


def _run_full_pipeline(batch_id: str, *, use_cleaner: bool = False) -> None:
    """Background task: approve mapping -> ETL -> dedup -> resolve -> commit."""
    sb = get_supabase()
    batch = find_batch_by_id(sb, batch_id)
    if not batch:
        logger.error("pipeline: batch %s not found", batch_id)
        return
    metadata = batch.get("metadata") or {}
    storage_path = metadata.get("storage_path")
    if not storage_path:
        update_import_batch_row(sb, batch_id, status="failed", error_message="No storage_path in batch metadata")
        return

    contract = _latest_contract(sb, batch_id)
    if not contract:
        update_import_batch_row(sb, batch_id, status="failed", error_message="No mapping contract found")
        return
    if contract.get("status") != "approved":
        try:
            _approve_and_validate(sb, batch_id, contract["id"])
        except HTTPException as exc:
            update_import_batch_row(sb, batch_id, status="failed", error_message=str(exc.detail))
            return

    payload = fetch_raw_payload(sb, storage_path)
    content_type = metadata.get("content_type")
    source_name = metadata.get("filename")
    org_id = (metadata.get("organization_object_id") or "").strip()
    org_name = metadata.get("organization_name")

    append_import_event(sb, batch_id=batch_id, phase="pipeline", level="info", message="Full pipeline started")
    last_exc: Exception | None = None
    for attempt in range(1, MAX_ETL_ATTEMPTS + 1):
        update_import_batch_row(sb, batch_id, attempt_delta=1)
        try:
            pipeline_stats = run_batch_pipeline_sync(
                sb=sb,
                batch_id=batch_id,
                payload=payload,
                content_type=content_type,
                source_name=source_name,
                default_org_object_id=org_id or None,
                default_org_name=org_name,
                use_cleaner=use_cleaner,
            )
            refreshed = find_batch_by_id(sb, batch_id) or {}
            metadata_now = dict(refreshed.get("metadata") or metadata or {})
            metadata_now["sheet_progress"] = pipeline_stats or {}
            (
                sb.schema("staging")
                .table("import_batches")
                .update({"metadata": metadata_now})
                .eq("batch_id", batch_id)
                .execute()
            )
            update_import_batch_row(sb, batch_id, status="staging_loaded")
            append_import_event(
                sb,
                batch_id=batch_id,
                phase="etl",
                level="info",
                message="ETL completed",
                payload={"attempt": attempt, "stats": pipeline_stats or {}},
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            append_import_event(
                sb, batch_id=batch_id, phase="etl", level="error",
                message="ETL attempt failed",
                payload={"attempt": attempt, "error": str(exc)},
            )
            if attempt < MAX_ETL_ATTEMPTS:
                time.sleep(RETRY_BACKOFF * attempt)
    else:
        update_import_batch_row(sb, batch_id, status="failed_permanent", error_message=str(last_exc))
        return

    # Dedup
    try:
        sb.rpc("run_staging_dedup", {"p_batch_id": batch_id, "p_distance_meters": 50, "p_name_similarity": 0.45}).execute()
        update_import_batch_row(sb, batch_id, status="deduplicated")
        append_import_event(sb, batch_id=batch_id, phase="dedup", level="info", message="Deduplication done")
    except Exception as exc:  # noqa: BLE001
        append_import_event(sb, batch_id=batch_id, phase="dedup", level="warning", message=f"Dedup skipped: {exc}")

    # Resolve dependencies
    try:
        sb.rpc("resolve_staging_dependencies", {"p_batch_id": batch_id}).execute()
        append_import_event(sb, batch_id=batch_id, phase="resolve", level="info", message="Dependencies resolved")
    except Exception as exc:  # noqa: BLE001
        append_import_event(sb, batch_id=batch_id, phase="resolve", level="warning", message=f"Resolve skipped: {exc}")

    # Commit
    try:
        sb.rpc("commit_staging_to_public", {"p_batch_id": batch_id}).execute()
        update_import_batch_row(sb, batch_id, status="committed")
        append_import_event(sb, batch_id=batch_id, phase="commit", level="info", message="Committed to production")
    except Exception as exc:  # noqa: BLE001
        update_import_batch_row(sb, batch_id, status="failed", error_message=f"Commit failed: {exc}")
        append_import_event(sb, batch_id=batch_id, phase="commit", level="error", message=f"Commit failed: {exc}")


# ---------------------------------------------------------------------------
# 1. Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "2.0.0"}


# ---------------------------------------------------------------------------
# 2. List organizations
# ---------------------------------------------------------------------------

@app.get("/api/v1/orgs", dependencies=[Depends(verify_token)])
def list_orgs(search: str = Query(default="", max_length=200)) -> JSONResponse:
    sb = get_supabase()
    try:
        query = (
            sb.table("object")
            .select("id,name,object_type")
            .eq("object_type", "ORG")
            .order("name")
            .limit(200)
        )
        if search.strip():
            query = query.ilike("name", f"%{search.strip()}%")
        result = query.execute()
        orgs = [
            {"object_id": r["id"], "name": r["name"], "org_type_code": r.get("object_type", "ORG")}
            for r in (result.data or [])
        ]
        return JSONResponse(content={"orgs": orgs})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch orgs: %s", exc)
        return JSONResponse(content={"orgs": [], "warning": "Could not load organizations. Enter org ID manually."})


# ---------------------------------------------------------------------------
# 3. Ingest (upload + auto-discover)
# ---------------------------------------------------------------------------

@app.post("/api/v1/ingest", dependencies=[Depends(verify_token)], response_model=IngestAccepted, status_code=202)
async def ingest(
    request: Request,
    upload_file: UploadFile | None = File(default=None),
    organization_object_id: str = Query(..., min_length=1),
    organization_name: str | None = Query(default=None),
) -> IngestAccepted:
    batch_id = str(uuid4())

    if upload_file is not None:
        payload = await upload_file.read()
        content_type = upload_file.content_type
        filename = upload_file.filename
    else:
        payload = await request.body()
        content_type = request.headers.get("content-type")
        filename = "webhook_payload"

    if not payload:
        raise HTTPException(status_code=400, detail="Empty payload")
    if len(payload) > MAX_INGEST_BYTES:
        raise HTTPException(status_code=413, detail=f"Payload too large ({len(payload)} bytes)")

    org_id = organization_object_id.strip()
    org_name = (organization_name or "").strip() or None

    sb = get_supabase()
    payload_sha = hash_payload(payload)
    existing = find_batch_by_idempotency(sb, payload_sha256=payload_sha)
    if existing and existing.get("status") not in ("failed", "failed_permanent"):
        return IngestAccepted(
            batch_id=existing["batch_id"],
            status=BatchStatus(existing["status"]),
            status_url=f"/api/v1/ingest/{existing['batch_id']}",
        )

    extension = _detect_extension(content_type, filename)
    storage_path = store_raw_payload(sb, batch_id, payload, extension, source_name=filename)
    ensure_import_batch_row_extended(
        sb=sb,
        batch_id=batch_id,
        idempotency_key=None,
        payload_sha256=payload_sha,
        metadata={
            "filename": filename,
            "content_type": content_type,
            "storage_path": storage_path,
            "payload_size": len(payload),
            "organization_object_id": org_id,
            "organization_name": org_name,
        },
    )
    append_import_event(sb, batch_id=batch_id, phase="ingest", level="info", message="Payload accepted")

    update_import_batch_row(sb, batch_id, status="discovering")
    parsed = parse_payload(content_type, payload, source_name=filename)
    sheets = parsed.workbook_sheets if parsed.workbook_sheets and len(parsed.workbook_sheets) > 0 else {"default": parsed.dataframe}
    contract = build_discovery_contract(source_format=parsed.source_format, sheets=sheets)
    stored = persist_discovery_contract(sb, batch_id=batch_id, contract=contract)

    batch_status = "mapping_review_required"
    update_import_batch_row(sb, batch_id, status=batch_status, mapping_rules={"discovery": stored})
    append_import_event(sb, batch_id=batch_id, phase="discovery", level="info", message="Discovery complete", payload=stored)

    return IngestAccepted(
        batch_id=batch_id,
        status=BatchStatus(batch_status),
        status_url=f"/api/v1/ingest/{batch_id}",
    )


# ---------------------------------------------------------------------------
# 4. Batch status + events
# ---------------------------------------------------------------------------

@app.get("/api/v1/ingest/{batch_id}", dependencies=[Depends(verify_token)])
def batch_status(batch_id: str) -> JSONResponse:
    sb = get_supabase()
    batch = find_batch_by_id(sb, batch_id)
    if not batch:
        return JSONResponse(status_code=404, content={"error": "batch not found"})

    contract = _latest_contract(sb, batch_id)
    fields = _contract_fields(sb, contract["id"]) if contract else []
    events = _batch_events(sb, batch_id)

    return JSONResponse(content=jsonable_encoder({
        "batch_id": batch_id,
        "status": batch.get("status"),
        "created_at": batch.get("created_at"),
        "updated_at": batch.get("updated_at"),
        "error": batch.get("error_message"),
        "metadata": batch.get("metadata"),
        "contract": contract,
        "fields": fields,
        "events": events,
    }))


@app.get("/api/v1/ingest/{batch_id}/preview", dependencies=[Depends(verify_token)])
def batch_preview(batch_id: str) -> JSONResponse:
    sb = get_supabase()
    batch = find_batch_by_id(sb, batch_id)
    if not batch:
        return JSONResponse(status_code=404, content={"error": "batch not found"})

    objects = (
        sb.schema("staging")
        .table("object_temp")
        .select("staging_object_key,name,object_type,org_name,external_id,source_sheet")
        .eq("import_batch_id", batch_id)
        .limit(5)
        .execute()
    ).data or []
    object_keys = [str(r.get("staging_object_key")) for r in objects if r.get("staging_object_key")]
    if not object_keys:
        return JSONResponse(content={"rows": []})

    locations = (
        sb.schema("staging")
        .table("object_location_temp")
        .select("staging_object_key,address1,city,postcode,latitude,longitude")
        .eq("import_batch_id", batch_id)
        .in_("staging_object_key", object_keys)
        .execute()
    ).data or []
    contacts = (
        sb.schema("staging")
        .table("contact_channel_temp")
        .select("staging_object_key,kind_code,value,is_primary")
        .eq("import_batch_id", batch_id)
        .in_("staging_object_key", object_keys)
        .execute()
    ).data or []
    descriptions = (
        sb.schema("staging")
        .table("object_description_temp")
        .select("staging_object_key,description,description_chapo")
        .eq("import_batch_id", batch_id)
        .in_("staging_object_key", object_keys)
        .execute()
    ).data or []

    location_by_key = {str(r.get("staging_object_key")): r for r in locations}
    description_by_key = {str(r.get("staging_object_key")): r for r in descriptions}
    contacts_by_key: dict[str, list[dict[str, Any]]] = {}
    for row in contacts:
        k = str(row.get("staging_object_key"))
        contacts_by_key.setdefault(k, []).append(row)

    rows: list[dict[str, Any]] = []
    for obj in objects:
        key = str(obj.get("staging_object_key"))
        rows.append(
            {
                "object": obj,
                "object_location": location_by_key.get(key),
                "contact_channel": contacts_by_key.get(key, []),
                "object_description": description_by_key.get(key),
            }
        )
    return JSONResponse(content=jsonable_encoder({"rows": rows}))


# ---------------------------------------------------------------------------
# 5. Update field mappings
# ---------------------------------------------------------------------------

class FieldCorrection(BaseModel):
    field_id: str
    target_table: str = ""
    target_column: str = ""
    transform: str = "identity"
    skip: bool = False


class MappingCorrections(BaseModel):
    corrections: list[FieldCorrection]


@app.patch("/api/v1/ingest/{batch_id}/mapping", dependencies=[Depends(verify_token)])
def update_mapping(batch_id: str, body: MappingCorrections) -> JSONResponse:
    sb = get_supabase()
    contract = _latest_contract(sb, batch_id)
    if not contract:
        return JSONResponse(status_code=404, content={"error": "No contract found"})

    corrections = body.corrections

    updated = 0
    errors: list[str] = []
    for corr in corrections:
        field_id = corr.field_id
        target_table = corr.target_table.strip()
        target_column = corr.target_column.strip()
        transform = corr.transform.strip()

        if corr.skip:
            (
                sb.schema("staging")
                .table("mapping_contract_field")
                .update({"status": "rejected", "review_reason": "user_skipped"})
                .eq("id", field_id)
                .eq("contract_id", contract["id"])
                .execute()
            )
            updated += 1
            continue

        if target_table and target_column:
            ok, reason = validate_mapping_target(target_table, target_column, transform)
            if not ok:
                errors.append(f"Field {field_id}: {reason}")
                continue
            (
                sb.schema("staging")
                .table("mapping_contract_field")
                .update({
                    "target_table": target_table,
                    "target_column": target_column,
                    "transform": transform,
                    "status": "approved",
                    "reviewed_by": "user",
                    "reviewed_at": datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", field_id)
                .eq("contract_id", contract["id"])
                .execute()
            )
            updated += 1

    return JSONResponse(content={"updated": updated, "errors": errors})


# ---------------------------------------------------------------------------
# 6. Execute full pipeline
# ---------------------------------------------------------------------------

@app.post("/api/v1/ingest/{batch_id}/execute", dependencies=[Depends(verify_token)])
def execute_pipeline(
    batch_id: str,
    background_tasks: BackgroundTasks,
    use_cleaner: bool = Query(default=False),
) -> JSONResponse:
    sb = get_supabase()
    batch = find_batch_by_id(sb, batch_id)
    if not batch:
        return JSONResponse(status_code=404, content={"error": "batch not found"})
    if batch.get("status") == "committed":
        return JSONResponse(status_code=409, content={"error": "Batch already committed"})

    background_tasks.add_task(_run_full_pipeline, batch_id, use_cleaner=use_cleaner)
    update_import_batch_row(sb, batch_id, status="profiling")
    return JSONResponse(content={"batch_id": batch_id, "status": "pipeline_started", "use_cleaner": use_cleaner})


# ---------------------------------------------------------------------------
# 7. Rollback
# ---------------------------------------------------------------------------

@app.post("/api/v1/ingest/{batch_id}/rollback", dependencies=[Depends(verify_token)])
def rollback_batch(batch_id: str, force: bool = Query(default=True)) -> JSONResponse:
    sb = get_supabase()
    try:
        result = sb.rpc("rollback_staging_batch_compensate", {"p_batch_id": batch_id, "p_force": force}).execute()
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": str(exc)})
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})


# ---------------------------------------------------------------------------
# 8. Purge
# ---------------------------------------------------------------------------

@app.post("/api/v1/ingest/{batch_id}/purge", dependencies=[Depends(verify_token)])
def purge_batch(batch_id: str, force: bool = Query(default=True)) -> JSONResponse:
    sb = get_supabase()
    try:
        result = sb.rpc("purge_staging_batch", {"p_batch_id": batch_id, "p_force": force}).execute()
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": str(exc)})
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})
