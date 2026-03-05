from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from statistics import median
from typing import Any

import pandas as pd
import requests
import streamlit as st
from supabase import create_client

try:
    from core.eta_estimator import estimate_eta, format_seconds
except ModuleNotFoundError:
    def format_seconds(seconds: float | None) -> str:
        if seconds is None:
            return "n/a"
        total = int(max(0, round(seconds)))
        minutes, sec = divmod(total, 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            return f"{hours}h {minutes}m {sec}s"
        if minutes:
            return f"{minutes}m {sec}s"
        return f"{sec}s"

    def estimate_eta(
        *,
        status_payload: dict[str, Any] | None,
        events: list[dict[str, Any]],
        historical_durations: list[float],
    ) -> dict[str, Any]:
        status = str((status_payload or {}).get("status") or "").lower()
        latest_start: datetime | None = None
        now = datetime.now(timezone.utc)
        for event in events:
            if str(event.get("message") or "") != "ETL task started":
                continue
            created_at = str(event.get("created_at") or "")
            if not created_at:
                continue
            try:
                latest_start = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                break
            except ValueError:
                continue

        if status in {"staging_loaded", "committed"}:
            return {
                "phase": "completed",
                "elapsed_seconds": None,
                "remaining_seconds": 0.0,
                "eta_confidence": "high",
                "note": "ETL pipeline already completed for this batch.",
            }
        if status not in {"profiling", "mapping", "transforming", "deduplicated"} and latest_start is None:
            return {
                "phase": status or "unknown",
                "elapsed_seconds": None,
                "remaining_seconds": None,
                "eta_confidence": "low",
                "note": "No ETL execution signal yet.",
            }

        elapsed = (now - latest_start).total_seconds() if latest_start else None
        if not historical_durations:
            return {
                "phase": status or "running",
                "elapsed_seconds": elapsed,
                "remaining_seconds": None,
                "eta_confidence": "low",
                "note": "Learning ETA: not enough historical ETL runs yet.",
            }

        expected_total = median(historical_durations)
        remaining = max(0.0, expected_total - (elapsed or 0.0))
        sample_count = len(historical_durations)
        confidence = "high" if sample_count >= 5 else "medium" if sample_count >= 2 else "low"
        return {
            "phase": status or "running",
            "elapsed_seconds": elapsed,
            "remaining_seconds": remaining,
            "eta_confidence": confidence,
            "note": f"ETA based on median of {sample_count} previous ETL runs.",
        }


st.set_page_config(page_title="Universal AI Data Ingestor", layout="wide")
st.title("Universal AI Data Ingestor - Validation Console")

api_base_url = os.getenv("API_BASE_URL", "http://api:8000")
api_token = os.getenv("API_BEARER_TOKEN", "")
supabase_url = os.getenv("SUPABASE_URL", "")
supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY", "")

st.info(
    "Workflow: 1) Upload with organization -> 2) Discovery Review (approve mapping) -> "
    "3) Batches (dedup/resolve/ETL/commit) -> 4) Staging Review."
)

health_col_1, health_col_2, health_col_3, health_col_4 = st.columns(4)
health_col_1.metric("API base", api_base_url)
health_col_2.metric("API token", "loaded" if api_token else "missing")
health_col_3.metric("Supabase URL", "loaded" if supabase_url else "missing")
health_col_4.metric("Service key", "loaded" if supabase_service_key else "missing")


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {api_token}"}


def call_status(batch_id: str) -> dict[str, Any]:
    r = requests.get(f"{api_base_url}/api/v1/ingest/{batch_id}", headers=auth_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def trigger_dedup(batch_id: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/deduplicate",
        headers=auth_headers(),
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def trigger_commit(batch_id: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/commit",
        headers=auth_headers(),
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def trigger_run_etl(batch_id: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/run-etl",
        headers=auth_headers(),
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def trigger_media_process(batch_id: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/media/process",
        headers=auth_headers(),
        timeout=180,
    )
    r.raise_for_status()
    return r.json()


def trigger_rollback(batch_id: str, force: bool = False) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/rollback",
        headers=auth_headers(),
        params={"force": str(force).lower()},
        timeout=180,
    )
    r.raise_for_status()
    return r.json()


def review_media_row(batch_id: str, import_media_id: str, approve: bool, reviewer: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/media/{import_media_id}/review",
        headers=auth_headers(),
        params={"approve": str(approve).lower(), "reviewer": reviewer},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def fetch_discovery(batch_id: str) -> dict[str, Any]:
    r = requests.get(
        f"{api_base_url}/api/v1/ingest/{batch_id}/discovery",
        headers=auth_headers(),
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def approve_mapping_contract(batch_id: str, reviewer: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/mapping/approve",
        headers=auth_headers(),
        params={"reviewer": reviewer, "approve_all": "true"},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def reject_mapping_field(batch_id: str, field_id: str, reviewer: str, reason: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/mapping/reject",
        headers=auth_headers(),
        params={"field_id": field_id, "reviewer": reviewer, "reason": reason},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def review_mapping_field_row(
    batch_id: str,
    field_id: str,
    reviewer: str,
    decision: str,
    reason: str,
    target_table: str,
    target_column: str,
    transform: str,
) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/mapping/review-field",
        headers=auth_headers(),
        params={
            "field_id": field_id,
            "reviewer": reviewer,
            "decision": decision,
            "reason": reason,
            "target_table": target_table,
            "target_column": target_column,
            "transform": transform,
        },
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def trigger_resolve_dependencies(batch_id: str) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/resolve-dependencies",
        headers=auth_headers(),
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def fetch_metrics() -> dict[str, Any]:
    r = requests.get(f"{api_base_url}/api/v1/metrics", headers=auth_headers(), timeout=60)
    r.raise_for_status()
    return r.json()


def trigger_purge(batch_id: str, force: bool = False) -> dict[str, Any]:
    r = requests.post(
        f"{api_base_url}/api/v1/ingest/{batch_id}/purge",
        headers=auth_headers(),
        params={"force": str(force).lower()},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def upload_file_to_api(file_obj, organization_object_id: str, organization_name: str | None = None) -> dict[str, Any]:
    files = {"upload_file": (file_obj.name, file_obj.getvalue(), file_obj.type or "application/octet-stream")}
    params: dict[str, str] = {"organization_object_id": organization_object_id}
    if organization_name:
        params["organization_name"] = organization_name
    r = requests.post(
        f"{api_base_url}/api/v1/ingest",
        headers=auth_headers(),
        files=files,
        params=params,
        timeout=90,
    )
    r.raise_for_status()
    return r.json()


@st.cache_data(ttl=20, show_spinner=False)
def fetch_recent_batches(
    api_base_url_value: str,
    api_token_value: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    if not api_token_value:
        return []
    r = requests.get(
        f"{api_base_url_value}/api/v1/ingest",
        headers={"Authorization": f"Bearer {api_token_value}"},
        params={"limit": limit, "offset": 0},
        timeout=30,
    )
    r.raise_for_status()
    payload = r.json()
    return payload if isinstance(payload, list) else []


def choose_active_batch(context_key: str, title: str) -> str:
    st.markdown(f"#### {title}")
    col_picker, col_refresh = st.columns([4, 1])
    if col_refresh.button("Refresh list", key=f"{context_key}_refresh_batches"):
        fetch_recent_batches.clear()

    options_map: dict[str, str] = {}
    try:
        rows = fetch_recent_batches(api_base_url, api_token, limit=100)
    except Exception as exc:  # noqa: BLE001
        rows = []
        st.warning(f"Unable to fetch recent batches: {exc}")

    for row in rows:
        row_batch_id = str(row.get("batch_id") or "").strip()
        if not row_batch_id:
            continue
        status = row.get("status") or "unknown"
        filename = row.get("filename") or "-"
        label = f"{row_batch_id} | status={status} | file={filename}"
        options_map[label] = row_batch_id

    active_batch = (st.session_state.get("active_batch_id") or "").strip()
    if active_batch and all(v != active_batch for v in options_map.values()):
        options_map[f"{active_batch} | status=active_context"] = active_batch

    if options_map:
        labels = list(options_map.keys())
        default_index = 0
        if active_batch:
            for idx, label in enumerate(labels):
                if options_map[label] == active_batch:
                    default_index = idx
                    break
        selected_label = col_picker.selectbox(
            "Recent batches",
            options=labels,
            index=default_index,
            key=f"{context_key}_recent_batch",
        )
        selected_batch = options_map[selected_label]
        st.session_state["active_batch_id"] = selected_batch

    manual_batch = st.text_input(
        "Batch ID",
        value=(st.session_state.get("active_batch_id") or "").strip(),
        key=f"{context_key}_batch_input",
        placeholder="Paste batch id",
    ).strip()
    if manual_batch:
        st.session_state["active_batch_id"] = manual_batch
    return (st.session_state.get("active_batch_id") or "").strip()


def _sanitize_ilike_term(value: str) -> str:
    # Keep search simple/safe for PostgREST ilike filters.
    return value.replace("%", "").replace(",", " ").strip()


@st.cache_data(ttl=30, show_spinner=False)
def fetch_organizations(
    supabase_url_value: str,
    supabase_service_key_value: str,
    search_term: str,
    limit: int = 100,
) -> list[dict[str, Any]]:
    if not supabase_url_value or not supabase_service_key_value:
        return []
    sb = create_client(supabase_url_value, supabase_service_key_value)
    query = (
        sb.schema("public")
        .table("object")
        .select("id,name")
        .eq("object_type", "ORG")
    )
    normalized = _sanitize_ilike_term(search_term)
    if normalized:
        query = query.or_(f"name.ilike.%{normalized}%,id.ilike.%{normalized}%")
    response = query.order("name").limit(limit).execute()
    return response.data or []


@st.cache_data(ttl=6, show_spinner=False)
def fetch_batch_events(
    supabase_url_value: str,
    supabase_service_key_value: str,
    batch_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    if not supabase_url_value or not supabase_service_key_value or not batch_id:
        return []
    sb = create_client(supabase_url_value, supabase_service_key_value)
    response = (
        sb.schema("staging")
        .table("import_events")
        .select("created_at,phase,level,message,payload")
        .eq("import_batch_id", batch_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


@st.cache_data(ttl=30, show_spinner=False)
def fetch_historical_etl_durations_seconds(
    supabase_url_value: str,
    supabase_service_key_value: str,
    limit: int = 300,
) -> list[float]:
    if not supabase_url_value or not supabase_service_key_value:
        return []
    sb = create_client(supabase_url_value, supabase_service_key_value)
    response = (
        sb.schema("staging")
        .table("import_events")
        .select("import_batch_id,message,created_at,level,phase")
        .eq("phase", "etl")
        .in_("message", ["ETL task started", "ETL task completed"])
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    rows = response.data or []
    started_at_by_batch: dict[str, datetime] = {}
    durations: list[float] = []
    for row in rows:
        batch = str(row.get("import_batch_id") or "")
        message = str(row.get("message") or "")
        created_at = str(row.get("created_at") or "")
        if not batch or not created_at:
            continue
        try:
            ts = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if message == "ETL task started":
            started_at_by_batch[batch] = ts
        elif message == "ETL task completed" and batch in started_at_by_batch:
            durations.append((ts - started_at_by_batch[batch]).total_seconds())
    return [d for d in durations if d > 0]


def recommend_next_step(status_payload: dict[str, Any]) -> str:
    status = str(status_payload.get("status") or "").lower()
    contract_status = str((status_payload.get("mapping_contract") or {}).get("status") or "").lower()
    if status == "mapping_review_required" or contract_status in {"review_required", "proposed", ""}:
        return "Go to Step 2 (Discovery Review), approve mapping, then come back to Step 3."
    if status in {"mapping_approved", "discovering"}:
        return "Run pipeline now (dedup -> resolve dependencies -> ETL)."
    if status in {"profiling"}:
        return "ETL is running in background. Watch Live event log below, then Refresh status."
    if status in {"staging_loaded", "deduplicated"}:
        return "Run Resolve dependencies, review blockers in Step 4 if needed, then Commit approved."
    if status in {"failed_permanent"}:
        return "This batch failed. Start with Rollback batch, then rerun pipeline. Use Live event log for the root cause."
    if status in {"committed"}:
        return "Batch is committed. Review final rows in Step 4 or start a new upload."
    return "Fetch status and follow the next action guidance."


tab_upload, tab_discovery, tab_batches, tab_staging = st.tabs(
    [
        "1) Upload",
        "2) Discovery Review",
        "3) Batches",
        "4) Staging Review",
    ]
)

with tab_upload:
    st.subheader("Step 1 - Upload and assign organization")
    st.caption("Requires a valid `API_BEARER_TOKEN`.")
    organization_input_mode = st.radio(
        "Organization input mode",
        options=["Select from database", "Enter manually"],
        horizontal=True,
    )

    selected_org_id = ""
    selected_org_name = ""
    if organization_input_mode == "Select from database":
        if not supabase_url or not supabase_service_key:
            st.warning(
                "Database picker needs SUPABASE_URL and SUPABASE_SERVICE_KEY. "
                "Use manual mode if these variables are not configured."
            )
        else:
            org_search = st.text_input(
                "Search organization",
                placeholder="Type organization name or ID fragment",
            )
            try:
                org_rows = fetch_organizations(
                    supabase_url_value=supabase_url,
                    supabase_service_key_value=supabase_service_key,
                    search_term=org_search,
                    limit=100,
                )
            except Exception as exc:  # noqa: BLE001
                st.warning(f"Unable to load organizations from database: {exc}")
                org_rows = []

            if org_rows:
                labels = [f"{row.get('name') or '(no name)'} [{row.get('id')}]" for row in org_rows]
                selected_label = st.selectbox("Organization (from database)", options=labels)
                selected_row = org_rows[labels.index(selected_label)]
                selected_org_id = (selected_row.get("id") or "").strip()
                selected_org_name = (selected_row.get("name") or "").strip()
                st.caption(f"Selected organization ID: `{selected_org_id}`")
            else:
                st.info("No organizations found for this search. You can switch to manual mode.")

    if selected_org_id:
        organization_object_id = selected_org_id
        st.text_input("Organization object ID (required)", value=selected_org_id, disabled=True)
    else:
        organization_object_id = st.text_input("Organization object ID (required)", placeholder="ORG...")

    organization_name = st.text_input(
        "Organization name (optional)",
        value=selected_org_name,
        placeholder="My organization",
    )
    upload = st.file_uploader("Drop CSV / JSON / XML / XLSX", type=["csv", "json", "xml", "xlsx"])
    if st.button("Ingest file", disabled=upload is None):
        if not api_token:
            st.error("Missing API_BEARER_TOKEN in environment.")
        elif not organization_object_id.strip():
            st.warning("Please set Organization object ID before ingesting data.")
        elif upload is None:
            st.warning("Please choose a file.")
        else:
            try:
                response = upload_file_to_api(
                    upload,
                    organization_object_id=organization_object_id.strip(),
                    organization_name=organization_name.strip() or None,
                )
                accepted_batch_id = str(response.get("batch_id") or "").strip()
                if accepted_batch_id:
                    st.session_state["active_batch_id"] = accepted_batch_id
                    fetch_recent_batches.clear()
                st.success(f"Accepted batch: {accepted_batch_id}")
                st.json(response)
            except Exception as exc:  # noqa: BLE001
                st.error(f"Ingest failed: {exc}")

with tab_batches:
    st.subheader("Step 3 - Run batch pipeline")
    st.info("Use this tab as the control tower: guided action, pipeline progress, and live timeline.")
    st.caption(
        "Batches are persisted in Supabase (`staging.import_batches` / `staging.import_events`), "
        "not only in container memory."
    )
    batch_id = choose_active_batch(context_key="batches", title="Batch context")
    latest_status_payload: dict[str, Any] | None = None
    events: list[dict[str, Any]] = []
    current_status = ""
    contract_status = ""
    auto_refresh_enabled = st.checkbox("Auto-refresh status and events", value=True, key="batches_auto_refresh")
    refresh_interval_s = st.selectbox("Refresh interval", options=[5, 10, 15, 30], index=1, key="batches_refresh_interval")
    if auto_refresh_enabled and hasattr(st, "autorefresh"):
        st.autorefresh(interval=int(refresh_interval_s) * 1000, key="batches_auto_refresh_tick")
    if batch_id:
        try:
            latest_status_payload = call_status(batch_id)
            st.markdown("#### Current batch status")
            status_value = latest_status_payload.get("status")
            current_status = str(status_value or "").lower()
            contract_status = str((latest_status_payload.get("mapping_contract") or {}).get("status") or "").lower()
            st.write(f"Batch status: `{status_value}`")
            if contract_status:
                st.write(f"Mapping contract: `{contract_status}`")
            st.info(f"Next action: {recommend_next_step(latest_status_payload)}")
        except Exception as exc:  # noqa: BLE001
            st.warning(f"Could not auto-load batch status: {exc}")
    st.caption(f"Last refreshed: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")

    if batch_id and supabase_url and supabase_service_key:
        try:
            events = fetch_batch_events(
                supabase_url_value=supabase_url,
                supabase_service_key_value=supabase_service_key,
                batch_id=batch_id,
                limit=100,
            )
        except Exception as exc:  # noqa: BLE001
            st.warning(f"Unable to fetch batch events: {exc}")
            events = []

    pipeline_disabled = (not bool(batch_id)) or contract_status != "approved" or current_status in {
        "failed_permanent",
        "committed",
    }
    if current_status == "failed_permanent":
        st.warning("Batch is in `failed_permanent`. Use recovery action first.")

    primary_label = "Run pipeline now (dedup -> resolve -> ETL)"
    primary_action = "run"
    if current_status == "mapping_review_required":
        primary_label = "Go to Step 2: review mapping first"
        primary_action = "review"
    elif current_status == "failed_permanent":
        primary_label = "Recover failed batch (rollback -> dedup -> resolve -> ETL)"
        primary_action = "recover"
    elif current_status == "committed":
        primary_label = "Batch already committed"
        primary_action = "done"
    elif current_status in {"profiling", "mapping", "transforming"}:
        primary_label = "ETL in progress"
        primary_action = "running"

    primary_disabled = not bool(batch_id) or primary_action in {"review", "done", "running"}
    if st.button(primary_label, disabled=primary_disabled):
        try:
            current = latest_status_payload or call_status(batch_id)
            gate = (current.get("mapping_contract") or {}).get("status")
            if primary_action == "recover":
                recovery_report = {
                    "rollback": trigger_rollback(batch_id, force=False),
                    "dedup": trigger_dedup(batch_id),
                    "resolve_dependencies": trigger_resolve_dependencies(batch_id),
                    "run_etl": trigger_run_etl(batch_id),
                }
                st.success("Recovery pipeline launched.")
                st.json(recovery_report)
                fetch_batch_events.clear()
                fetch_recent_batches.clear()
            elif gate != "approved":
                st.error("Mapping contract is not approved yet. Go to Step 2 (Discovery Review) first.")
            elif str(current.get("status") or "").lower() in {"failed_permanent", "committed"}:
                st.error("Current batch status does not allow this action. Use recovery or start a new batch.")
            else:
                run_report = {
                    "dedup": trigger_dedup(batch_id),
                    "resolve_dependencies": trigger_resolve_dependencies(batch_id),
                    "run_etl": trigger_run_etl(batch_id),
                }
                st.success("Pipeline launched. ETL runs asynchronously; monitor Live event log below.")
                st.json(run_report)
                fetch_recent_batches.clear()
                fetch_batch_events.clear()
        except Exception as exc:  # noqa: BLE001
            st.error(f"Pipeline launch failed: {exc}")

    if events:
        latest_error = next((e for e in events if str(e.get("level") or "").lower() == "error"), None)
        if latest_error:
            st.error(
                f"Latest error ({latest_error.get('phase')}): {latest_error.get('message')}"
            )

    historical = []
    if supabase_url and supabase_service_key:
        try:
            historical = fetch_historical_etl_durations_seconds(
                supabase_url_value=supabase_url,
                supabase_service_key_value=supabase_service_key,
                limit=300,
            )
        except Exception:  # noqa: BLE001
            historical = []
    eta_payload = estimate_eta(status_payload=latest_status_payload, events=events, historical_durations=historical)
    eta_col_1, eta_col_2, eta_col_3 = st.columns(3)
    eta_col_1.metric("Current phase", str(eta_payload.get("phase") or "unknown"))
    eta_col_2.metric("Elapsed", format_seconds(eta_payload.get("elapsed_seconds")))
    eta_col_3.metric("ETA remaining", format_seconds(eta_payload.get("remaining_seconds")))
    st.caption(f"ETA confidence: `{eta_payload.get('eta_confidence')}` — {eta_payload.get('note')}")

    col_a, col_b, col_c, col_d, col_e, col_f, col_g, col_h = st.columns(8)
    if col_a.button("Fetch status", disabled=not bool(batch_id)):
        try:
            status_payload = call_status(batch_id)
            latest_status_payload = status_payload
            st.json(status_payload)
            sheet_progress = status_payload.get("sheet_progress") or {}
            if sheet_progress:
                st.markdown("#### Sheet progress")
                st.dataframe(
                    [
                        {
                            "sheet": sheet_name,
                            "rows": data.get("rows", 0),
                            "dedup_status": json.dumps(data.get("dedup_status", {}), ensure_ascii=True),
                            "resolution_status": json.dumps(data.get("resolution_status", {}), ensure_ascii=True),
                        }
                        for sheet_name, data in sheet_progress.items()
                    ],
                    use_container_width=True,
                )
        except Exception as exc:  # noqa: BLE001
            st.error(f"Unable to fetch status: {exc}")
    if col_b.button("Run dedup", disabled=not bool(batch_id) or contract_status != "approved"):
        try:
            st.json(trigger_dedup(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Dedup failed: {exc}")
    if col_c.button("Resolve dependencies", disabled=not bool(batch_id) or contract_status != "approved"):
        try:
            st.json(trigger_resolve_dependencies(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Dependency resolution failed: {exc}")
    if col_d.button("Commit approved", disabled=not bool(batch_id) or contract_status != "approved"):
        try:
            current = call_status(batch_id)
            gate = (current.get("mapping_contract") or {}).get("status")
            if gate != "approved":
                st.error("Mapping contract is not approved yet. Go to Discovery Review first.")
            else:
                st.json(trigger_commit(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Commit failed: {exc}")
    if col_e.button("Purge batch", disabled=not bool(batch_id)):
        try:
            st.json(trigger_purge(batch_id, force=False))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Purge failed: {exc}")
    if col_f.button("Process media", disabled=not bool(batch_id) or contract_status != "approved"):
        try:
            st.json(trigger_media_process(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Media process failed: {exc}")
    if col_g.button("Rollback batch", disabled=not bool(batch_id)):
        try:
            st.json(trigger_rollback(batch_id, force=False))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Rollback failed: {exc}")
    if col_h.button("Run ETL", disabled=not bool(batch_id) or contract_status != "approved"):
        try:
            etl_result = trigger_run_etl(batch_id)
            st.json(etl_result)
            st.info("ETL started in background. Use Live event log below to track progress and errors.")
            fetch_batch_events.clear()
        except Exception as exc:  # noqa: BLE001
            st.error(f"Run ETL failed: {exc}")

    if st.button("Refresh metrics"):
        try:
            metrics_payload = fetch_metrics()
            if metrics_payload.get("source") == "fallback":
                st.warning(metrics_payload.get("warning") or "Using fallback metrics.")
            st.json(metrics_payload)
        except Exception as exc:  # noqa: BLE001
            st.error(f"Metrics fetch failed: {exc}")

    st.markdown("#### Live event timeline")
    if not batch_id:
        st.info("Select or paste a batch ID to view event logs.")
    elif not supabase_url or not supabase_service_key:
        st.info("Set SUPABASE_URL and SUPABASE_SERVICE_KEY to view event logs.")
    else:
        try:
            if not events:
                st.info("No events yet for this batch.")
            else:
                timeline_rows = [
                    {
                        "time": event.get("created_at"),
                        "phase": event.get("phase"),
                        "level": event.get("level"),
                        "message": event.get("message"),
                    }
                    for event in events
                ]
                st.dataframe(timeline_rows, use_container_width=True, hide_index=True)
        except Exception as exc:  # noqa: BLE001
            st.warning(f"Unable to load batch events: {exc}")

with tab_staging:
    st.subheader("Step 4 - Staging review and manual corrections")
    if not supabase_url or not supabase_service_key:
        st.info("Set SUPABASE_URL and SUPABASE_SERVICE_KEY to browse/edit staging rows.")
    else:
        sb = create_client(supabase_url, supabase_service_key)
        limit = st.slider("Rows to display", min_value=20, max_value=500, value=100, step=20)
        active_batch = (st.session_state.get("active_batch_id") or "").strip()
        filter_active = st.checkbox(
            "Filter to active batch",
            value=bool(active_batch),
            disabled=not bool(active_batch),
            help="Uses current batch context from Upload/Discovery/Batches tabs.",
        )
        if active_batch:
            st.caption(f"Active batch context: `{active_batch}`")

        blocked_ref_query = (
            sb.schema("staging")
            .table("ref_code_temp")
            .select("domain,code,resolution_status,policy_action")
            .in_("resolution_status", ["blocked_policy", "review_required"])
        )
        blocked_org_query = (
            sb.schema("staging")
            .table("org_temp")
            .select("staging_org_key,name,resolution_status,policy_action")
            .in_("resolution_status", ["blocked_policy", "review_required"])
        )
        blocked_obj_query = (
            sb.schema("staging")
            .table("object_temp")
            .select("import_row_id,staging_object_key,name,resolution_status,staging_org_key")
            .eq("resolution_status", "blocked_missing_dependency")
        )
        media_review_query = (
            sb.schema("staging")
            .table("media_temp")
            .select("import_media_id,import_batch_id,source_url,bucket_path,processing_status,ai_confidence,ai_decision,is_approved,reviewed_by,review_reason")
            .in_("processing_status", ["review_required", "blocked_low_confidence", "download_failed"])
        )
        rows_query = (
            sb.schema("staging")
            .table("object_temp")
            .select("import_row_id,import_batch_id,staging_object_key,staging_org_key,name,object_type,email,phone,external_id,deduplication_status,resolution_status,matched_public_object_id,ai_merge_proposal,is_approved,raw_source_data")
        )

        if filter_active and active_batch:
            blocked_ref_query = blocked_ref_query.eq("import_batch_id", active_batch)
            blocked_org_query = blocked_org_query.eq("import_batch_id", active_batch)
            blocked_obj_query = blocked_obj_query.eq("import_batch_id", active_batch)
            media_review_query = media_review_query.eq("import_batch_id", active_batch)
            rows_query = rows_query.eq("import_batch_id", active_batch)

        blocked_ref_resp = blocked_ref_query.limit(limit).execute()
        blocked_org_resp = blocked_org_query.limit(limit).execute()
        blocked_obj_resp = blocked_obj_query.limit(limit).execute()
        media_review_resp = media_review_query.limit(limit).execute()
        rows_resp = rows_query.limit(limit).execute()
        rows = rows_resp.data or []
        blocked_ref = blocked_ref_resp.data or []
        blocked_org = blocked_org_resp.data or []
        blocked_obj = blocked_obj_resp.data or []
        media_review_rows = media_review_resp.data or []
        st.caption(f"{len(rows)} rows loaded")

        if blocked_ref or blocked_org or blocked_obj:
            st.warning("Dependencies require action before commit.")
            if blocked_ref:
                st.markdown("#### Ref blockers / review")
                st.dataframe(blocked_ref, use_container_width=True)
            if blocked_org:
                st.markdown("#### Organization blockers / review")
                st.dataframe(blocked_org, use_container_width=True)
            if blocked_obj:
                st.markdown("#### Object blockers")
                st.dataframe(blocked_obj, use_container_width=True)

        st.markdown("### New creations")
        for row in [r for r in rows if r.get("deduplication_status") == "new"]:
            with st.expander(f"{row.get('import_row_id')} - {row.get('name') or '(no name)'}"):
                st.write(f"Batch: `{row.get('import_batch_id')}`")
                st.write(f"Type: `{row.get('object_type')}` | Status: `{row.get('deduplication_status')}`")
                edited_name = st.text_input("Name", value=row.get("name") or "", key=f"name_new_{row['import_row_id']}")
                approved = st.checkbox("Approved", value=bool(row.get("is_approved")), key=f"approved_new_{row['import_row_id']}")
                st.code(json.dumps(row.get("raw_source_data") or {}, indent=2, ensure_ascii=True), language="json")
                if st.button("Save row", key=f"save_new_{row['import_row_id']}"):
                    (
                        sb.schema("staging")
                        .table("object_temp")
                        .update({"name": edited_name, "is_approved": approved, "deduplication_status": "resolved"})
                        .eq("import_row_id", row["import_row_id"])
                        .execute()
                    )
                    st.success("Row updated")

        st.markdown("### Exact updates")
        for row in [r for r in rows if r.get("deduplication_status") == "exact_update"]:
            with st.expander(f"{row.get('import_row_id')} - {row.get('name') or '(no name)'}"):
                st.write(f"Match object: `{row.get('matched_public_object_id')}`")
                edited_name = st.text_input("Name", value=row.get("name") or "", key=f"name_exact_{row['import_row_id']}")
                approved = st.checkbox("Approved", value=bool(row.get("is_approved")), key=f"approved_exact_{row['import_row_id']}")
                if st.button("Save row", key=f"save_exact_{row['import_row_id']}"):
                    (
                        sb.schema("staging")
                        .table("object_temp")
                        .update({"name": edited_name, "is_approved": approved, "deduplication_status": "resolved"})
                        .eq("import_row_id", row["import_row_id"])
                        .execute()
                    )
                    st.success("Row updated")

        st.markdown("### Conflicts to resolve")
        for row in [r for r in rows if r.get("deduplication_status") == "ai_conflict"]:
            with st.expander(f"{row.get('import_row_id')} - {row.get('name') or '(no name)'}"):
                st.write(f"Batch: `{row.get('import_batch_id')}`")
                st.write(f"Type: `{row.get('object_type')}` | Status: `{row.get('deduplication_status')}` | Match: `{row.get('matched_public_object_id')}`")
                edited_name = st.text_input(
                    "Name",
                    value=row.get("name") or "",
                    key=f"name_conflict_{row['import_row_id']}",
                )
                decision = st.selectbox(
                    "Decision",
                    options=["keep_new", "merge_into_match"],
                    key=f"decision_{row['import_row_id']}",
                )
                approved = st.checkbox(
                    "Approved",
                    value=bool(row.get("is_approved")),
                    key=f"approved_conflict_{row['import_row_id']}",
                )
                st.write("AI proposal")
                st.code(json.dumps(row.get("ai_merge_proposal") or {}, indent=2, ensure_ascii=True), language="json")
                st.code(json.dumps(row.get("raw_source_data") or {}, indent=2, ensure_ascii=True), language="json")

                if st.button("Save row", key=f"save_conflict_{row['import_row_id']}"):
                    dedup_status = "resolved"
                    if decision == "keep_new":
                        row["matched_public_object_id"] = None
                    (
                        sb.schema("staging")
                        .table("object_temp")
                        .update(
                            {
                                "name": edited_name,
                                "is_approved": approved,
                                "deduplication_status": dedup_status,
                                "matched_public_object_id": row.get("matched_public_object_id"),
                            }
                        )
                        .eq("import_row_id", row["import_row_id"])
                        .execute()
                    )
                    st.success("Row updated")

        st.markdown("### Media governance review")
        if not media_review_rows:
            st.info("No media rows currently requiring review.")
        for media_row in media_review_rows:
            with st.expander(f"{media_row.get('import_media_id')} - {media_row.get('processing_status')}"):
                st.write(f"Batch: `{media_row.get('import_batch_id')}`")
                st.write(f"URL: `{media_row.get('source_url')}`")
                st.write(f"Bucket path: `{media_row.get('bucket_path')}`")
                st.write(
                    f"AI: decision=`{media_row.get('ai_decision')}` confidence=`{media_row.get('ai_confidence')}` approved=`{media_row.get('is_approved')}`"
                )
                reviewer_name = st.text_input(
                    "Reviewer",
                    value="ui_reviewer",
                    key=f"media_reviewer_{media_row['import_media_id']}",
                )
                approve_choice = st.selectbox(
                    "Decision",
                    options=["approve", "reject"],
                    key=f"media_decision_{media_row['import_media_id']}",
                )
                if st.button("Save media decision", key=f"save_media_{media_row['import_media_id']}"):
                    approved = approve_choice == "approve"
                    review_media_row(
                        batch_id=media_row["import_batch_id"],
                        import_media_id=media_row["import_media_id"],
                        approve=approved,
                        reviewer=reviewer_name,
                    )
                    st.success("Media review saved")

with tab_discovery:
    st.subheader("Step 2 - Mapping contract review and approval")
    batch_id = choose_active_batch(context_key="discovery", title="Batch context")
    reviewer = st.text_input("Reviewer (for audit metadata)", value="mapping_reviewer", key="discovery_reviewer")
    col_a, col_b = st.columns(2)
    if col_a.button("Fetch discovery contract"):
        try:
            payload = fetch_discovery(batch_id)
            st.session_state["discovery_payload"] = payload
            st.json(payload.get("contract") or {})
        except Exception as exc:  # noqa: BLE001
            st.error(f"Fetch discovery failed: {exc}")
    if col_b.button("Approve all mapping"):
        try:
            st.json(approve_mapping_contract(batch_id, reviewer))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Approve mapping failed: {exc}")

    discovery_payload = st.session_state.get("discovery_payload") or {}
    fields = discovery_payload.get("fields") or []
    relations = discovery_payload.get("relations") or []

    st.markdown("### Field mappings")
    if not fields:
        st.info("No discovery fields loaded.")
    else:
        st.caption(
            "Inline review: edit target table/column/transform directly in rows, then set decision "
            "(`approve` or `reject`) and click Apply field decisions."
        )
        original_fields_by_id = {str(f.get("id")): f for f in fields if f.get("id")}
        editable_rows: list[dict[str, Any]] = []
        for f in fields:
            editable_rows.append(
                {
                    "id": f.get("id"),
                    "sheet_name": f.get("sheet_name"),
                    "source_column": f.get("source_column"),
                    "target_table": f.get("target_table"),
                    "target_column": f.get("target_column"),
                    "transform": f.get("transform"),
                    "confidence": f.get("confidence"),
                    "status": f.get("status"),
                    "review_reason": f.get("review_reason") or "",
                    "decision": "approve" if f.get("status") == "approved" else "keep",
                }
            )

        editor_df = pd.DataFrame(editable_rows)
        edited_df = st.data_editor(
            editor_df,
            use_container_width=True,
            hide_index=True,
            key="field_mapping_editor",
            column_config={
                "decision": st.column_config.SelectboxColumn(
                    "decision",
                    options=["keep", "approve", "reject"],
                    help="keep = no action, approve/reject = apply review decision",
                ),
                "review_reason": st.column_config.TextColumn(
                    "review_reason",
                    help="Used when decision is reject (or custom approve note).",
                ),
            },
            disabled=["id", "sheet_name", "source_column", "confidence", "status"],
        )

        if st.button("Apply field decisions"):
            if not batch_id:
                st.error("Batch ID is required.")
            else:
                applied = 0
                skipped = 0
                for row in edited_df.to_dict("records"):
                    row_id = str(row.get("id") or "").strip()
                    if not row_id:
                        skipped += 1
                        continue
                    decision = str(row.get("decision") or "keep").strip().lower()
                    if decision not in {"approve", "reject"}:
                        skipped += 1
                        continue
                    reason = str(row.get("review_reason") or "").strip() or (
                        "inline_approved" if decision == "approve" else "inline_rejected"
                    )
                    try:
                        review_mapping_field_row(
                            batch_id=batch_id,
                            field_id=row_id,
                            reviewer=reviewer,
                            decision=decision,
                            reason=reason,
                            target_table=str(row.get("target_table") or "").strip(),
                            target_column=str(row.get("target_column") or "").strip(),
                            transform=str(row.get("transform") or "").strip(),
                        )
                        applied += 1
                    except Exception as exc:  # noqa: BLE001
                        st.error(f"Failed to apply decision for field {row_id}: {exc}")

                if applied:
                    try:
                        payload = fetch_discovery(batch_id)
                        st.session_state["discovery_payload"] = payload
                        st.success(f"Applied {applied} field review decisions.")
                    except Exception as exc:  # noqa: BLE001
                        st.warning(f"Decisions applied but discovery refresh failed: {exc}")
                if skipped:
                    st.caption(f"Skipped {skipped} rows with decision=keep or missing id.")

    st.markdown("### Relation hypotheses")
    if not relations:
        st.info("No relation hypotheses loaded.")
    else:
        st.dataframe(relations, use_container_width=True)
