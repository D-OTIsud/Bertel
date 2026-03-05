from __future__ import annotations

import hmac
import logging
import time
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import settings
from core.discovery_engine import build_discovery_contract, persist_discovery_contract
from core.etl_engine import parse_payload, run_batch_pipeline_sync
from core.idempotency_contract import evaluate_idempotency_reuse
from core.media_pipeline import derive_media_governance, download_media, upload_media_bytes
from core.schemas import BatchRecord, BatchStatus, IngestAccepted
from core.supabase_client import (
    append_import_event,
    ensure_import_batch_row_extended,
    fetch_raw_payload,
    find_batch_by_id,
    find_batch_by_key,
    find_batch_by_idempotency,
    get_supabase,
    hash_payload,
    store_raw_payload,
    update_import_batch_row,
)

app = FastAPI(title="Universal AI Data Ingestor API", version="0.1.0")
security = HTTPBearer(auto_error=False)
logger = logging.getLogger("universal_ai_ingestor.api")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

batch_registry: dict[str, BatchRecord] = {}
MAX_ETL_ATTEMPTS = settings.etl_max_attempts
RETRY_BACKOFF_SECONDS = settings.etl_retry_backoff_seconds
MAX_INGEST_BYTES = settings.ingest_max_bytes


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> None:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if not hmac.compare_digest(credentials.credentials, settings.api_bearer_token):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


def detect_extension(content_type: str | None, fallback_name: str | None = None) -> str:
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


def _run_etl_task(
    batch_id: str,
    payload: bytes,
    content_type: str | None,
    source_name: str | None = None,
    default_org_object_id: str | None = None,
    default_org_name: str | None = None,
) -> None:
    sb = get_supabase()
    is_approved, latest = _ensure_mapping_approved(sb, batch_id)
    if not is_approved:
        raise RuntimeError(f"Cannot run ETL before mapping approval for batch {batch_id}: {latest}")
    append_import_event(sb, batch_id=batch_id, phase="etl", level="info", message="ETL task started")
    last_exc: Exception | None = None
    for attempt in range(1, MAX_ETL_ATTEMPTS + 1):
        update_import_batch_row(sb, batch_id, attempt_delta=1)
        try:
            run_batch_pipeline_sync(
                sb=sb,
                batch_id=batch_id,
                payload=payload,
                content_type=content_type,
                source_name=source_name,
                default_org_object_id=default_org_object_id,
                default_org_name=default_org_name,
            )
            update_import_batch_row(sb, batch_id, status="staging_loaded")
            append_import_event(
                sb,
                batch_id=batch_id,
                phase="etl",
                level="info",
                message="ETL task completed",
                payload={"attempt": attempt},
            )
            record = batch_registry.get(batch_id)
            if record is not None:
                record.status = BatchStatus.staging_loaded
                record.updated_at = datetime.now(timezone.utc)
            logger.info("batch_completed batch_id=%s attempt=%s", batch_id, attempt)
            return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            append_import_event(
                sb,
                batch_id=batch_id,
                phase="etl",
                level="error",
                message="ETL attempt failed",
                payload={"attempt": attempt, "error": str(exc), "error_class": exc.__class__.__name__},
            )
            logger.exception("batch_failed batch_id=%s attempt=%s error=%s", batch_id, attempt, exc)
            if attempt < MAX_ETL_ATTEMPTS:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)
            else:
                update_import_batch_row(
                    sb,
                    batch_id,
                    status="failed_permanent",
                    error_message=str(exc),
                    error_class=exc.__class__.__name__,
                )
                record = batch_registry.get(batch_id)
                if record is not None:
                    record.status = BatchStatus.failed_permanent
                    record.error = str(exc)
                    record.updated_at = datetime.now(timezone.utc)
    if last_exc is not None:
        raise last_exc


def _record_from_db(sb, batch_id: str) -> BatchRecord | None:
    resp = (
        sb.schema("staging")
        .table("import_batches")
        .select("batch_id,status,created_at,updated_at,metadata,error_message")
        .eq("batch_id", batch_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    row = rows[0]
    metadata = row.get("metadata") or {}
    return BatchRecord(
        batch_id=row["batch_id"],
        status=BatchStatus(row["status"]),
        created_at=datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")),
        updated_at=datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")),
        filename=metadata.get("filename"),
        content_type=metadata.get("content_type"),
        storage_path=metadata.get("storage_path"),
        error=row.get("error_message"),
    )


def _sheet_progress_from_db(sb, batch_id: str) -> dict[str, Any]:
    resp = (
        sb.schema("staging")
        .table("object_temp")
        .select("source_sheet,deduplication_status,resolution_status")
        .eq("import_batch_id", batch_id)
        .limit(10000)
        .execute()
    )
    rows = resp.data or []
    progress: dict[str, dict[str, Any]] = {}
    for row in rows:
        sheet = row.get("source_sheet") or "default"
        sheet_state = progress.setdefault(
            sheet,
            {"rows": 0, "dedup_status": {}, "resolution_status": {}},
        )
        sheet_state["rows"] += 1
        dedup = row.get("deduplication_status") or "unknown"
        resolution = row.get("resolution_status") or "unknown"
        sheet_state["dedup_status"][dedup] = sheet_state["dedup_status"].get(dedup, 0) + 1
        sheet_state["resolution_status"][resolution] = sheet_state["resolution_status"].get(resolution, 0) + 1
    return progress


def _latest_mapping_contract(sb, batch_id: str) -> dict[str, Any] | None:
    resp = (
        sb.schema("staging")
        .table("mapping_contract")
        .select("id,contract_version,status,overall_confidence,approved_at,approved_by")
        .eq("import_batch_id", batch_id)
        .order("contract_version", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _ensure_mapping_approved(sb, batch_id: str) -> tuple[bool, dict[str, Any] | None]:
    latest = _latest_mapping_contract(sb, batch_id)
    return bool(latest and latest.get("status") == "approved"), latest


def _build_discovery_for_payload(
    *,
    sb,
    batch_id: str,
    payload: bytes,
    content_type: str | None,
    source_name: str | None,
) -> dict[str, Any]:
    parsed = parse_payload(content_type, payload, source_name=source_name)
    if parsed.workbook_sheets and len(parsed.workbook_sheets) > 0:
        sheets = parsed.workbook_sheets
    else:
        sheets = {"default": parsed.dataframe}
    contract = build_discovery_contract(source_format=parsed.source_format, sheets=sheets)
    stored = persist_discovery_contract(sb, batch_id=batch_id, contract=contract)
    batch_status = "mapping_review_required" if stored["review_required"] else "mapping_approved"
    update_import_batch_row(
        sb,
        batch_id,
        status=batch_status,
        mapping_rules={
            "discovery_contract": {
                "contract_id": stored["contract_id"],
                "contract_version": stored["contract_version"],
                "status": stored["status"],
                "overall_confidence": stored["overall_confidence"],
            }
        },
    )
    append_import_event(
        sb,
        batch_id=batch_id,
        phase="discovery",
        level="info",
        message="Discovery contract generated",
        payload=stored,
    )
    return {
        "batch_status": batch_status,
        "discovery": stored,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/ingest", dependencies=[Depends(verify_token)], response_model=IngestAccepted, status_code=202)
async def ingest(
    request: Request,
    _: BackgroundTasks,
    upload_file: UploadFile | None = File(default=None),
    x_idempotency_key: str | None = Header(default=None),
    organization_object_id: str = Query(..., min_length=1),
    organization_name: str | None = Query(default=None),
) -> IngestAccepted:
    batch_id = x_idempotency_key or str(uuid4())

    if batch_id in batch_registry:
        return IngestAccepted(
            batch_id=batch_id,
            status=batch_registry[batch_id].status,
            status_url=f"/api/v1/ingest/{batch_id}",
        )

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
        raise HTTPException(
            status_code=413,
            detail=f"Payload too large ({len(payload)} bytes > {MAX_INGEST_BYTES} bytes limit)",
        )

    selected_org_object_id = organization_object_id.strip()
    selected_org_name = (organization_name or "").strip() or None
    if not selected_org_object_id:
        raise HTTPException(status_code=400, detail="organization_object_id is required")

    sb = get_supabase()
    payload_sha = hash_payload(payload)
    if x_idempotency_key:
        existing_key = find_batch_by_key(sb, x_idempotency_key)
        key_eval = evaluate_idempotency_reuse(existing_key, payload_sha)
        if key_eval == "conflict":
            raise HTTPException(status_code=409, detail="x-idempotency-key already used with different payload")
        if key_eval == "replay":
            existing_status = BatchStatus(existing_key["status"])
            return IngestAccepted(
                batch_id=existing_key["batch_id"],
                status=existing_status,
                status_url=f"/api/v1/ingest/{existing_key['batch_id']}",
            )

    existing_sha = find_batch_by_idempotency(sb, payload_sha256=payload_sha)
    if existing_sha:
        existing_status = BatchStatus(existing_sha["status"])
        return IngestAccepted(
            batch_id=existing_sha["batch_id"],
            status=existing_status,
            status_url=f"/api/v1/ingest/{existing_sha['batch_id']}",
        )

    extension = detect_extension(content_type, filename)
    storage_path = store_raw_payload(sb, batch_id, payload, extension, source_name=filename)
    ensure_import_batch_row_extended(
        sb=sb,
        batch_id=batch_id,
        idempotency_key=x_idempotency_key,
        payload_sha256=payload_sha,
        metadata={
            "filename": filename,
            "content_type": content_type,
            "storage_path": storage_path,
            "payload_size": len(payload),
            "organization_object_id": selected_org_object_id,
            "organization_name": selected_org_name,
        },
    )
    append_import_event(
        sb,
        batch_id=batch_id,
        phase="ingest",
        level="info",
        message="Payload accepted and stored",
        payload={
            "content_type": content_type,
            "filename": filename,
            "storage_path": storage_path,
            "organization_object_id": selected_org_object_id,
            "organization_name": selected_org_name,
        },
    )

    update_import_batch_row(sb, batch_id, status="discovering")
    discovery_outcome = _build_discovery_for_payload(
        sb=sb,
        batch_id=batch_id,
        payload=payload,
        content_type=content_type,
        source_name=filename,
    )

    now = datetime.now(timezone.utc)
    mapped_status = BatchStatus(discovery_outcome["batch_status"])
    batch_registry[batch_id] = BatchRecord(
        batch_id=batch_id,
        status=mapped_status,
        created_at=now,
        updated_at=now,
        filename=filename,
        content_type=content_type,
        storage_path=storage_path,
    )
    return IngestAccepted(batch_id=batch_id, status=mapped_status, status_url=f"/api/v1/ingest/{batch_id}")


@app.get("/api/v1/ingest/{batch_id}")
def ingest_status(batch_id: str, _: None = Depends(verify_token)) -> JSONResponse:
    record = batch_registry.get(batch_id)
    if record is None:
        sb = get_supabase()
        record = _record_from_db(sb, batch_id)
    if record is None:
        return JSONResponse(status_code=404, content={"error": "batch_id not found"})
    sb = get_supabase()
    sheet_progress = _sheet_progress_from_db(sb, batch_id)
    latest_contract = _latest_mapping_contract(sb, batch_id)
    return JSONResponse(
        content={
            "batch_id": record.batch_id,
            "status": record.status.value,
            "created_at": record.created_at.isoformat(),
            "updated_at": record.updated_at.isoformat(),
            "filename": record.filename,
            "content_type": record.content_type,
            "storage_path": record.storage_path,
            "error": record.error,
            "sheet_progress": sheet_progress,
            "mapping_contract": latest_contract,
        }
    )


@app.post("/api/v1/ingest/discover", dependencies=[Depends(verify_token)], response_model=IngestAccepted, status_code=202)
async def ingest_discover(
    request: Request,
    background_tasks: BackgroundTasks,
    upload_file: UploadFile | None = File(default=None),
    x_idempotency_key: str | None = Header(default=None),
    organization_object_id: str = Query(..., min_length=1),
    organization_name: str | None = Query(default=None),
) -> IngestAccepted:
    return await ingest(
        request=request,
        _=background_tasks,
        upload_file=upload_file,
        x_idempotency_key=x_idempotency_key,
        organization_object_id=organization_object_id,
        organization_name=organization_name,
    )


@app.get("/api/v1/ingest/{batch_id}/discovery", dependencies=[Depends(verify_token)])
def get_discovery(batch_id: str) -> JSONResponse:
    sb = get_supabase()
    latest = _latest_mapping_contract(sb, batch_id)
    if not latest:
        return JSONResponse(status_code=404, content={"error": "No discovery contract found for batch"})
    fields = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("id,sheet_name,source_column,target_table,target_column,transform,confidence,rationale,status,reviewed_by,review_reason")
        .eq("contract_id", latest["id"])
        .order("sheet_name")
        .execute()
    )
    relations = (
        sb.schema("staging")
        .table("mapping_relation_hypothesis")
        .select("id,from_sheet,from_column,to_sheet,to_column,relation_type,confidence,rationale,status")
        .eq("contract_id", latest["id"])
        .execute()
    )
    return JSONResponse(
        content={
            "batch_id": batch_id,
            "contract": latest,
            "fields": fields.data or [],
            "relations": relations.data or [],
        }
    )


@app.post("/api/v1/ingest/{batch_id}/mapping/approve", dependencies=[Depends(verify_token)])
def approve_mapping(batch_id: str, reviewer: str = "mapping_reviewer", approve_all: bool = True) -> JSONResponse:
    sb = get_supabase()
    latest = _latest_mapping_contract(sb, batch_id)
    if not latest:
        return JSONResponse(status_code=404, content={"error": "No discovery contract found for batch"})
    contract_id = latest["id"]
    if approve_all:
        (
            sb.schema("staging")
            .table("mapping_contract_field")
            .update(
                {
                    "status": "approved",
                    "reviewed_by": reviewer,
                    "reviewed_at": datetime.now(timezone.utc).isoformat(),
                    "review_reason": "bulk_approved",
                }
            )
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
    rejected_fields = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("id")
        .eq("contract_id", contract_id)
        .eq("status", "rejected")
        .limit(1)
        .execute()
    )
    rejected_relations = (
        sb.schema("staging")
        .table("mapping_relation_hypothesis")
        .select("id")
        .eq("contract_id", contract_id)
        .eq("status", "rejected")
        .limit(1)
        .execute()
    )
    new_contract_status = "approved" if not (rejected_fields.data or rejected_relations.data) else "review_required"
    (
        sb.schema("staging")
        .table("mapping_contract")
        .update(
            {
                "status": new_contract_status,
                "approved_by": reviewer if new_contract_status == "approved" else None,
                "approved_at": datetime.now(timezone.utc).isoformat() if new_contract_status == "approved" else None,
                "is_immutable": new_contract_status == "approved",
            }
        )
        .eq("id", contract_id)
        .execute()
    )
    update_import_batch_row(sb, batch_id, status="mapping_approved" if new_contract_status == "approved" else "mapping_review_required")
    append_import_event(
        sb,
        batch_id=batch_id,
        phase="mapping_review",
        level="info",
        message="Mapping contract review updated",
        payload={"contract_id": contract_id, "status": new_contract_status, "reviewer": reviewer},
    )
    return JSONResponse(
        content={"batch_id": batch_id, "contract_id": contract_id, "status": new_contract_status}
    )


@app.post("/api/v1/ingest/{batch_id}/mapping/reject", dependencies=[Depends(verify_token)])
def reject_mapping(
    batch_id: str,
    reviewer: str = "mapping_reviewer",
    field_id: str | None = None,
    relation_id: str | None = None,
    reason: str = "manual_reject",
) -> JSONResponse:
    if not field_id and not relation_id:
        return JSONResponse(status_code=400, content={"error": "field_id or relation_id is required"})
    sb = get_supabase()
    latest = _latest_mapping_contract(sb, batch_id)
    if not latest:
        return JSONResponse(status_code=404, content={"error": "No discovery contract found for batch"})
    contract_id = latest["id"]
    if field_id:
        (
            sb.schema("staging")
            .table("mapping_contract_field")
            .update(
                {
                    "status": "rejected",
                    "reviewed_by": reviewer,
                    "reviewed_at": datetime.now(timezone.utc).isoformat(),
                    "review_reason": reason,
                }
            )
            .eq("id", field_id)
            .eq("contract_id", contract_id)
            .execute()
        )
    if relation_id:
        (
            sb.schema("staging")
            .table("mapping_relation_hypothesis")
            .update({"status": "rejected"})
            .eq("id", relation_id)
            .eq("contract_id", contract_id)
            .execute()
        )
    (
        sb.schema("staging")
        .table("mapping_contract")
        .update({"status": "review_required", "is_immutable": False})
        .eq("id", contract_id)
        .execute()
    )
    update_import_batch_row(sb, batch_id, status="mapping_review_required")
    append_import_event(
        sb,
        batch_id=batch_id,
        phase="mapping_review",
        level="warning",
        message="Mapping contract element rejected",
        payload={"contract_id": contract_id, "field_id": field_id, "relation_id": relation_id, "reviewer": reviewer},
    )
    return JSONResponse(content={"batch_id": batch_id, "contract_id": contract_id, "status": "review_required"})


@app.post("/api/v1/ingest/{batch_id}/mapping/review-field", dependencies=[Depends(verify_token)])
def review_mapping_field(
    batch_id: str,
    field_id: str,
    reviewer: str = "mapping_reviewer",
    decision: Literal["approve", "reject"] = "approve",
    reason: str = "manual_review",
    target_table: str | None = None,
    target_column: str | None = None,
    transform: str | None = None,
) -> JSONResponse:
    sb = get_supabase()
    latest = _latest_mapping_contract(sb, batch_id)
    if not latest:
        return JSONResponse(status_code=404, content={"error": "No discovery contract found for batch"})

    contract_id = latest["id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    update_payload: dict[str, Any] = {
        "status": "approved" if decision == "approve" else "rejected",
        "reviewed_by": reviewer,
        "reviewed_at": now_iso,
        "review_reason": reason,
    }

    cleaned_target_table = (target_table or "").strip()
    cleaned_target_column = (target_column or "").strip()
    cleaned_transform = (transform or "").strip()
    if cleaned_target_table:
        update_payload["target_table"] = cleaned_target_table
    if cleaned_target_column:
        update_payload["target_column"] = cleaned_target_column
    if cleaned_transform:
        update_payload["transform"] = cleaned_transform

    (
        sb.schema("staging")
        .table("mapping_contract_field")
        .update(update_payload)
        .eq("id", field_id)
        .eq("contract_id", contract_id)
        .execute()
    )

    rejected_fields = (
        sb.schema("staging")
        .table("mapping_contract_field")
        .select("id")
        .eq("contract_id", contract_id)
        .eq("status", "rejected")
        .limit(1)
        .execute()
    )
    rejected_relations = (
        sb.schema("staging")
        .table("mapping_relation_hypothesis")
        .select("id")
        .eq("contract_id", contract_id)
        .eq("status", "rejected")
        .limit(1)
        .execute()
    )
    new_contract_status = "approved" if not (rejected_fields.data or rejected_relations.data) else "review_required"

    (
        sb.schema("staging")
        .table("mapping_contract")
        .update(
            {
                "status": new_contract_status,
                "approved_by": reviewer if new_contract_status == "approved" else None,
                "approved_at": now_iso if new_contract_status == "approved" else None,
                "is_immutable": new_contract_status == "approved",
            }
        )
        .eq("id", contract_id)
        .execute()
    )
    update_import_batch_row(sb, batch_id, status="mapping_approved" if new_contract_status == "approved" else "mapping_review_required")
    append_import_event(
        sb,
        batch_id=batch_id,
        phase="mapping_review",
        level="info" if decision == "approve" else "warning",
        message="Mapping field reviewed inline",
        payload={
            "contract_id": contract_id,
            "field_id": field_id,
            "decision": decision,
            "reviewer": reviewer,
            "target_table": update_payload.get("target_table"),
            "target_column": update_payload.get("target_column"),
        },
    )
    return JSONResponse(content={"batch_id": batch_id, "contract_id": contract_id, "status": new_contract_status})


@app.post("/api/v1/ingest/{batch_id}/run-etl", dependencies=[Depends(verify_token)])
def run_etl(batch_id: str, background_tasks: BackgroundTasks) -> JSONResponse:
    sb = get_supabase()
    is_approved, latest = _ensure_mapping_approved(sb, batch_id)
    if not is_approved:
        return JSONResponse(
            status_code=409,
            content={"batch_id": batch_id, "error": "Mapping contract must be fully approved before ETL.", "contract": latest},
        )
    batch = find_batch_by_id(sb, batch_id)
    if not batch:
        return JSONResponse(status_code=404, content={"error": "batch_id not found"})
    metadata = batch.get("metadata") or {}
    default_org_object_id = (metadata.get("organization_object_id") or "").strip()
    default_org_name = metadata.get("organization_name")
    if not default_org_object_id:
        return JSONResponse(
            status_code=400,
            content={"error": "organization_object_id missing in batch metadata"},
        )
    storage_path = metadata.get("storage_path")
    if not storage_path:
        return JSONResponse(status_code=400, content={"error": "storage_path missing for batch payload"})
    payload = fetch_raw_payload(sb, storage_path)
    source_name = metadata.get("filename")
    content_type = metadata.get("content_type")
    background_tasks.add_task(
        _run_etl_task,
        batch_id,
        payload,
        content_type,
        source_name,
        default_org_object_id,
        default_org_name,
    )
    update_import_batch_row(sb, batch_id, status="profiling")
    return JSONResponse(content={"batch_id": batch_id, "status": "profiling", "message": "ETL task started"})


@app.get("/api/v1/ingest")
def list_batches(
    _: None = Depends(verify_token),
    limit: int = Query(default=settings.ingest_list_default_limit, ge=1),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    if limit > settings.ingest_list_max_limit:
        raise HTTPException(
            status_code=400,
            detail=f"limit must be <= {settings.ingest_list_max_limit}",
        )
    in_memory = [
        {
            "batch_id": record.batch_id,
            "status": record.status.value,
            "updated_at": record.updated_at.isoformat(),
            "filename": record.filename,
        }
        for record in sorted(batch_registry.values(), key=lambda r: r.updated_at, reverse=True)
    ]
    sb = get_supabase()
    persisted_fetch_limit = min(
        settings.ingest_list_max_limit,
        settings.ingest_list_default_limit + offset + limit,
    )
    persisted = (
        sb.schema("staging")
        .table("import_batches")
        .select("batch_id,status,updated_at,metadata")
        .order("updated_at", desc=True)
        .limit(persisted_fetch_limit)
        .execute()
    )
    persisted_rows = persisted.data or []
    seen = {r["batch_id"] for r in in_memory}
    for row in persisted_rows:
        if row["batch_id"] in seen:
            continue
        metadata = row.get("metadata") or {}
        in_memory.append(
            {
                "batch_id": row["batch_id"],
                "status": row["status"],
                "updated_at": row["updated_at"],
                "filename": metadata.get("filename"),
            }
        )
    in_memory.sort(key=lambda r: str(r.get("updated_at", "")), reverse=True)
    return in_memory[offset : offset + limit]


@app.get("/api/v1/ingest/{batch_id}/integrity", dependencies=[Depends(verify_token)])
def integrity_check(batch_id: str) -> JSONResponse:
    sb = get_supabase()
    result = sb.rpc("assert_staging_batch_integrity", {"p_batch_id": batch_id}).execute()
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})


@app.post("/api/v1/ingest/{batch_id}/deduplicate", dependencies=[Depends(verify_token)])
def deduplicate_batch(
    batch_id: str,
    distance_meters: int = 50,
    name_similarity: float = 0.45,
) -> JSONResponse:
    sb = get_supabase()
    is_approved, latest = _ensure_mapping_approved(sb, batch_id)
    if not is_approved:
        return JSONResponse(
            status_code=409,
            content={"batch_id": batch_id, "error": "Mapping approval required before deduplication.", "contract": latest},
        )
    result = sb.rpc(
        "run_staging_dedup",
        {
            "p_batch_id": batch_id,
            "p_distance_meters": distance_meters,
            "p_name_similarity": name_similarity,
        },
    ).execute()
    record = batch_registry.get(batch_id)
    if record is not None:
        record.status = BatchStatus.deduplicated
        record.updated_at = datetime.now(timezone.utc)
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})


@app.post("/api/v1/ingest/{batch_id}/resolve-dependencies", dependencies=[Depends(verify_token)])
def resolve_dependencies(batch_id: str) -> JSONResponse:
    sb = get_supabase()
    is_approved, latest = _ensure_mapping_approved(sb, batch_id)
    if not is_approved:
        return JSONResponse(
            status_code=409,
            content={"batch_id": batch_id, "error": "Mapping approval required before dependency resolution.", "contract": latest},
        )
    result = sb.rpc("resolve_staging_dependencies", {"p_batch_id": batch_id}).execute()
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})


@app.post("/api/v1/ingest/{batch_id}/commit", dependencies=[Depends(verify_token)])
def commit_batch(batch_id: str) -> JSONResponse:
    sb = get_supabase()
    is_approved, latest = _ensure_mapping_approved(sb, batch_id)
    if not is_approved:
        return JSONResponse(
            status_code=409,
            content={"batch_id": batch_id, "error": "Mapping contract must be approved before commit.", "contract": latest},
        )
    batch = find_batch_by_id(sb, batch_id)
    if not batch:
        return JSONResponse(status_code=404, content={"error": "batch_id not found"})
    if batch.get("status") == "committed" or bool(batch.get("is_immutable")):
        return JSONResponse(
            status_code=409,
            content={"batch_id": batch_id, "error": "Batch already committed; re-commit forbidden."},
        )
    dependency_report = sb.rpc("resolve_staging_dependencies", {"p_batch_id": batch_id}).execute().data
    report_payload = dependency_report[0] if isinstance(dependency_report, list) and dependency_report else dependency_report
    if isinstance(report_payload, dict) and report_payload.get("blocked", 0) > 0:
        return JSONResponse(
            status_code=409,
            content={
                "batch_id": batch_id,
                "error": "Blocked dependencies detected; resolve before commit.",
                "dependency_report": report_payload,
            },
        )
    result = sb.rpc("commit_staging_to_public", {"p_batch_id": batch_id}).execute()
    record = batch_registry.get(batch_id)
    if record is not None:
        record.status = BatchStatus.committed
        record.updated_at = datetime.now(timezone.utc)
    return JSONResponse(content={"batch_id": batch_id, "dependency_report": report_payload, "result": result.data})


@app.post("/api/v1/ingest/{batch_id}/media/process", dependencies=[Depends(verify_token)])
def process_media(batch_id: str, limit: int = Query(default=200, ge=1, le=1000)) -> JSONResponse:
    sb = get_supabase()
    is_approved, latest = _ensure_mapping_approved(sb, batch_id)
    if not is_approved:
        return JSONResponse(
            status_code=409,
            content={"batch_id": batch_id, "error": "Mapping approval required before media processing.", "contract": latest},
        )
    candidates = (
        sb.schema("staging")
        .table("media_temp")
        .select("import_media_id,source_url,staging_object_key,position")
        .eq("import_batch_id", batch_id)
        .in_("processing_status", ["pending_download", "download_failed"])
        .limit(limit)
        .execute()
    )
    rows = candidates.data or []
    processed = 0
    failed = 0
    review_required = 0
    for row in rows:
        import_media_id = row["import_media_id"]
        try:
            object_lookup = (
                sb.schema("staging")
                .table("object_temp")
                .select("resolved_object_id,matched_public_object_id")
                .eq("import_batch_id", batch_id)
                .eq("staging_object_key", row["staging_object_key"])
                .limit(1)
                .execute()
            )
            lookup_rows = object_lookup.data or []
            if not lookup_rows:
                raise ValueError("Cannot resolve target object for media row")
            resolved_object_id = lookup_rows[0].get("resolved_object_id") or lookup_rows[0].get("matched_public_object_id")
            if not resolved_object_id:
                raise ValueError("Target object unresolved for media row")
            blob, mime_type = download_media(row["source_url"])
            bucket_path, payload_sha = upload_media_bytes(
                sb,
                object_id=resolved_object_id,
                source_url=row["source_url"],
                payload=blob,
                content_type=mime_type,
            )
            governance = derive_media_governance(mime_type=mime_type, payload_sha=payload_sha)
            decision = governance["decision"]
            update_payload: dict[str, Any] = {
                "resolved_object_id": resolved_object_id,
                "bucket_path": bucket_path,
                "media_sha256": payload_sha,
                "mime_type": mime_type,
                "processing_status": "ready_for_commit" if decision == "auto_ready" else "review_required",
                "ai_confidence": governance["confidence"],
                "ai_decision": decision,
                "ai_model": governance["model"],
                "ai_prompt_version": governance["prompt_version"],
                "ai_schema_version": governance["schema_version"],
                "ai_features": governance["features"],
                "resolution_status": "resolved",
                "is_approved": decision == "auto_ready",
            }
            if decision != "auto_ready":
                review_required += 1
            (
                sb.schema("staging")
                .table("media_temp")
                .update(update_payload)
                .eq("import_media_id", import_media_id)
                .execute()
            )
            processed += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            (
                sb.schema("staging")
                .table("media_temp")
                .update({"processing_status": "download_failed", "error_message": str(exc)})
                .eq("import_media_id", import_media_id)
                .execute()
            )
    append_import_event(
        sb,
        batch_id=batch_id,
        phase="media_process",
        level="info",
        message="Media processing batch completed",
        payload={"processed": processed, "failed": failed, "review_required": review_required},
    )
    return JSONResponse(
        content={
            "batch_id": batch_id,
            "processed": processed,
            "failed": failed,
            "review_required": review_required,
        }
    )


@app.post("/api/v1/ingest/{batch_id}/media/{import_media_id}/review", dependencies=[Depends(verify_token)])
def review_media(batch_id: str, import_media_id: str, approve: bool, reviewer: str = "manual_reviewer") -> JSONResponse:
    sb = get_supabase()
    update_payload = {
        "is_approved": approve,
        "processing_status": "ready_for_commit" if approve else "blocked_low_confidence",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": reviewer,
        "review_reason": "manual_approval" if approve else "manual_reject",
    }
    (
        sb.schema("staging")
        .table("media_temp")
        .update(update_payload)
        .eq("import_batch_id", batch_id)
        .eq("import_media_id", import_media_id)
        .execute()
    )
    return JSONResponse(content={"batch_id": batch_id, "import_media_id": import_media_id, "approved": approve})


@app.post("/api/v1/ingest/{batch_id}/rollback", dependencies=[Depends(verify_token)])
def rollback_batch(batch_id: str, force: bool = False) -> JSONResponse:
    sb = get_supabase()
    result = sb.rpc("rollback_staging_batch_compensate", {"p_batch_id": batch_id, "p_force": force}).execute()
    record = batch_registry.get(batch_id)
    if record is not None:
        record.status = BatchStatus.staging_loaded
        record.updated_at = datetime.now(timezone.utc)
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})


@app.post("/api/v1/ingest/{batch_id}/purge", dependencies=[Depends(verify_token)])
def purge_batch(batch_id: str, force: bool = False) -> JSONResponse:
    sb = get_supabase()
    result = sb.rpc("purge_staging_batch", {"p_batch_id": batch_id, "p_force": force}).execute()
    batch_registry.pop(batch_id, None)
    return JSONResponse(content={"batch_id": batch_id, "result": result.data})


@app.get("/api/v1/metrics", dependencies=[Depends(verify_token)])
def metrics() -> JSONResponse:
    sb = get_supabase()
    try:
        result = sb.rpc("get_ingestor_metrics").execute()
        return JSONResponse(content={"metrics": result.data, "source": "rpc"})
    except Exception as exc:  # noqa: BLE001
        logger.exception("get_ingestor_metrics rpc failed: %s", exc)
        batches_resp = (
            sb.schema("staging")
            .table("import_batches")
            .select("status,updated_at")
            .order("updated_at", desc=True)
            .limit(1000)
            .execute()
        )
        events_resp = (
            sb.schema("staging")
            .table("import_events")
            .select("level,phase,created_at")
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        batch_rows = batches_resp.data or []
        event_rows = events_resp.data or []
        by_status: dict[str, int] = {}
        for row in batch_rows:
            status = row.get("status") or "unknown"
            by_status[status] = by_status.get(status, 0) + 1
        recent_errors = [row for row in event_rows if (row.get("level") or "").lower() == "error"]
        fallback_metrics = {
            "total_batches_seen": len(batch_rows),
            "status_counts": by_status,
            "recent_event_count": len(event_rows),
            "recent_error_count": len(recent_errors),
            "latest_batch_update": batch_rows[0].get("updated_at") if batch_rows else None,
        }
        return JSONResponse(
            content={
                "metrics": fallback_metrics,
                "source": "fallback",
                "warning": "get_ingestor_metrics RPC failed; using fallback metrics snapshot",
            }
        )


@app.get("/api/v1/ops/cron-health", dependencies=[Depends(verify_token)])
def cron_health() -> JSONResponse:
    sb = get_supabase()
    result = sb.rpc("get_ingestor_scheduler_health").execute()
    return JSONResponse(content={"scheduler": result.data})


@app.post("/api/v1/ops/media/retry-failed", dependencies=[Depends(verify_token)])
def retry_failed_media(limit: int = Query(default=200, ge=1, le=2000)) -> JSONResponse:
    sb = get_supabase()
    result = sb.rpc("retry_failed_media_downloads", {"p_limit": limit}).execute()
    return JSONResponse(content={"result": result.data})


@app.post("/api/v1/ops/watchdog/stale-batches", dependencies=[Depends(verify_token)])
def watchdog_stale_batches(
    stale_minutes: int = Query(default=30, ge=1, le=24 * 60),
    limit: int = Query(default=200, ge=1, le=2000),
) -> JSONResponse:
    sb = get_supabase()
    result = sb.rpc(
        "watchdog_mark_stale_batches",
        {"p_stale_minutes": stale_minutes, "p_limit": limit},
    ).execute()
    return JSONResponse(content={"result": result.data})
