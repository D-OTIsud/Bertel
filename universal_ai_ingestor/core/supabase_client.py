from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from supabase import Client, create_client

from core.config import settings


def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_key)


def store_raw_payload(
    sb: Client,
    batch_id: str,
    payload: bytes,
    extension: str,
    source_name: str | None = None,
) -> str:
    safe_name = (source_name or "payload").replace("/", "_").replace("\\", "_")
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    object_path = f"{ts}_{batch_id}_{safe_name}.{extension}"
    sb.storage.from_(settings.raw_import_bucket).upload(
        path=object_path,
        file=payload,
        file_options={"content-type": "application/octet-stream", "upsert": "false"},
    )
    return object_path


def fetch_raw_payload(sb: Client, storage_path: str) -> bytes:
    return sb.storage.from_(settings.raw_import_bucket).download(storage_path)


def ensure_import_batch_row(sb: Client, batch_id: str, metadata: dict[str, Any]) -> None:
    payload = {
        "batch_id": batch_id,
        "status": "received",
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    sb.schema("staging").table("import_batches").upsert(payload).execute()


def ensure_import_batch_row_extended(
    sb: Client,
    *,
    batch_id: str,
    idempotency_key: str | None,
    payload_sha256: str,
    metadata: dict[str, Any],
) -> None:
    payload = {
        "batch_id": batch_id,
        "idempotency_key": idempotency_key,
        "payload_sha256": payload_sha256,
        "status": "received",
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "attempt_count": 0,
        "is_immutable": False,
    }
    sb.schema("staging").table("import_batches").upsert(payload).execute()


def hash_payload(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def find_batch_by_idempotency(
    sb: Client, *, idempotency_key: str | None = None, payload_sha256: str | None = None
) -> dict[str, Any] | None:
    if idempotency_key:
        resp = (
            sb.schema("staging")
            .table("import_batches")
            .select("batch_id,status,idempotency_key,payload_sha256,metadata,error_message")
            .eq("idempotency_key", idempotency_key)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]
    if payload_sha256:
        resp = (
            sb.schema("staging")
            .table("import_batches")
            .select("batch_id,status,idempotency_key,payload_sha256,metadata,error_message")
            .eq("payload_sha256", payload_sha256)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]
    return None


def find_batch_by_key(sb: Client, idempotency_key: str) -> dict[str, Any] | None:
    resp = (
        sb.schema("staging")
        .table("import_batches")
        .select("batch_id,status,idempotency_key,payload_sha256,metadata,error_message,is_immutable")
        .eq("idempotency_key", idempotency_key)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def find_batch_by_id(sb: Client, batch_id: str) -> dict[str, Any] | None:
    resp = (
        sb.schema("staging")
        .table("import_batches")
        .select("batch_id,status,idempotency_key,payload_sha256,metadata,error_message,is_immutable")
        .eq("batch_id", batch_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def update_import_batch_row(
    sb: Client,
    batch_id: str,
    *,
    status: str | None = None,
    mapping_rules: dict[str, Any] | None = None,
    error_message: str | None = None,
    error_class: str | None = None,
    attempt_delta: int = 0,
) -> None:
    payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if status is not None:
        payload["status"] = status
    if mapping_rules is not None:
        payload["mapping_rules"] = mapping_rules
    if error_message is not None:
        payload["error_message"] = error_message
        payload["failed_at"] = datetime.now(timezone.utc).isoformat()
    if error_class is not None:
        payload["error_class"] = error_class
    if attempt_delta:
        current = (
            sb.schema("staging")
            .table("import_batches")
            .select("attempt_count")
            .eq("batch_id", batch_id)
            .limit(1)
            .execute()
        )
        rows = current.data or []
        prev = int(rows[0]["attempt_count"]) if rows else 0
        payload["attempt_count"] = prev + attempt_delta
    sb.schema("staging").table("import_batches").update(payload).eq("batch_id", batch_id).execute()


def append_import_event(
    sb: Client, *, batch_id: str, phase: str, level: str, message: str, payload: dict[str, Any] | None = None
) -> None:
    sb.schema("staging").table("import_events").insert(
        {
            "import_batch_id": batch_id,
            "phase": phase,
            "level": level,
            "message": message,
            "payload": payload or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def insert_staging_rows(sb: Client, batch_id: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    enriched = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for r in rows:
        enriched.append(
            {
                "import_row_id": str(uuid4()),
                "import_batch_id": batch_id,
                "raw_source_data": r.get("raw_source_data", {}),
                "object_type": r.get("object_type"),
                "name": r.get("name"),
                "external_id": r.get("external_id"),
                "source_org_object_id": r.get("source_org_object_id"),
                "deduplication_status": r.get("deduplication_status", "pending"),
                "matched_public_object_id": r.get("matched_public_object_id"),
                "ai_merge_proposal": r.get("ai_merge_proposal"),
                "is_approved": bool(r.get("is_approved", False)),
                "created_at": now_iso,
                "updated_at": now_iso,
            }
        )
    sb.schema("staging").table("object_temp").insert(enriched).execute()


def insert_staging_table_rows(
    sb: Client,
    table_name: str,
    rows: list[dict[str, Any]],
    *,
    upsert: bool = False,
    on_conflict: str | None = None,
) -> None:
    if not rows:
        return
    query = sb.schema("staging").table(table_name)
    if upsert:
        query.upsert(rows, on_conflict=on_conflict).execute()
        return
    query.insert(rows).execute()

