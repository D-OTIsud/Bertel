"""Bertel Data Ingestor v2 -- Streamlit UI.

Single-page, two-step workflow:
  Step 1: Pick org + upload file  ->  auto-discovery
  Step 2: Review / correct mapping  ->  one-click pipeline execution
"""
from __future__ import annotations

import os
import time
from typing import Any

import requests
import streamlit as st

API_BASE = os.getenv("API_BASE_URL", "http://api:8000").rstrip("/")
TOKEN = os.getenv("API_BEARER_TOKEN", "")

TARGET_SCHEMA: dict[str, dict[str, Any]] = {
    "object_temp": {
        "columns": ["name", "object_type", "external_id", "source_org_object_id", "org_name", "email", "phone", "latitude", "longitude"],
        "transforms": ["identity", "lowercase"],
    },
    "object_location_temp": {
        "columns": ["latitude", "longitude", "address1", "city", "postcode"],
        "transforms": ["identity", "split_gps"],
    },
    "contact_channel_temp": {
        "columns": ["value", "kind_code"],
        "transforms": ["identity", "lowercase"],
    },
    "media_temp": {
        "columns": ["source_url"],
        "transforms": ["identity", "split_list"],
    },
    "object_amenity_temp": {
        "columns": ["amenity_code"],
        "transforms": ["identity", "split_list"],
    },
    "object_payment_method_temp": {
        "columns": ["payment_code"],
        "transforms": ["identity", "split_list"],
    },
}

ALL_TABLES = sorted(TARGET_SCHEMA.keys())


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def _api_get(path: str, params: dict | None = None) -> dict | list | None:
    try:
        r = requests.get(f"{API_BASE}{path}", headers=_headers(), params=params, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        st.error(f"API error: {exc}")
        return None


def _api_post(path: str, **kwargs) -> dict | None:
    try:
        r = requests.post(f"{API_BASE}{path}", headers=_headers(), timeout=60, **kwargs)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        st.error(f"API error: {exc}")
        return None


def _api_patch(path: str, json_body: Any) -> dict | None:
    try:
        r = requests.patch(f"{API_BASE}{path}", headers=_headers(), json=json_body, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        st.error(f"API error: {exc}")
        return None


def _check_health() -> bool:
    try:
        r = requests.get(f"{API_BASE}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(page_title="Bertel Data Ingestor", page_icon="database", layout="wide")

st.markdown("""
<style>
    .block-container { max-width: 960px; padding-top: 2rem; }
    div[data-testid="stMetric"] { background: #f8f9fa; border-radius: 8px; padding: 12px; }
    .step-card { background: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .confidence-high { color: #2e7d32; font-weight: 600; }
    .confidence-mid { color: #f57f17; font-weight: 600; }
    .confidence-low { color: #c62828; font-weight: 600; }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

col_title, col_status = st.columns([4, 1])
with col_title:
    st.title("Bertel Data Ingestor")
with col_status:
    healthy = _check_health()
    if healthy:
        st.success("API connected")
    else:
        st.error("API offline")

if not healthy:
    st.warning("Cannot reach the API backend. Check that the API service is running.")
    st.stop()

# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

if "batch_id" not in st.session_state:
    st.session_state.batch_id = None
if "batch_data" not in st.session_state:
    st.session_state.batch_data = None
if "pipeline_running" not in st.session_state:
    st.session_state.pipeline_running = False

# ---------------------------------------------------------------------------
# Step 1: Organization + File Upload
# ---------------------------------------------------------------------------

st.markdown("### Step 1 -- Select organization and upload data")

upload_disabled = st.session_state.batch_id is not None

orgs_data = _api_get("/api/v1/orgs")
org_list: list[dict] = (orgs_data or {}).get("orgs", []) if isinstance(orgs_data, dict) else []
org_options = {f"{o['name']}  ({o['object_id'][:8]}...)": o["object_id"] for o in org_list}

if not org_options:
    st.info("No organizations found in the database. Enter an org ID manually.")
    org_id_input = st.text_input("Organization ID", disabled=upload_disabled, placeholder="paste-org-uuid-here")
    org_name_input = st.text_input("Organization name (optional)", disabled=upload_disabled)
    selected_org_id = org_id_input.strip()
else:
    org_choice = st.selectbox(
        "Organization",
        options=[""] + list(org_options.keys()),
        disabled=upload_disabled,
        index=0,
    )
    selected_org_id = org_options.get(org_choice, "")
    org_name_input = ""

uploaded_file = st.file_uploader(
    "Upload data file (CSV, Excel, JSON, XML)",
    type=["csv", "xlsx", "xlsm", "json", "xml"],
    disabled=upload_disabled,
)

col_upload, col_reset = st.columns([1, 1])
with col_upload:
    if st.button("Upload and analyze", disabled=upload_disabled or not uploaded_file or not selected_org_id, type="primary", use_container_width=True):
        with st.spinner("Uploading and running discovery..."):
            files = {"upload_file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)}
            params = {"organization_object_id": selected_org_id}
            if org_name_input:
                params["organization_name"] = org_name_input
            try:
                r = requests.post(
                    f"{API_BASE}/api/v1/ingest",
                    headers=_headers(),
                    files=files,
                    params=params,
                    timeout=120,
                )
                r.raise_for_status()
                result = r.json()
                st.session_state.batch_id = result["batch_id"]
                st.rerun()
            except Exception as exc:
                st.error(f"Upload failed: {exc}")

with col_reset:
    if st.session_state.batch_id and st.button("Start new import", use_container_width=True):
        st.session_state.batch_id = None
        st.session_state.batch_data = None
        st.session_state.pipeline_running = False
        st.rerun()

# ---------------------------------------------------------------------------
# Stop here if no batch yet
# ---------------------------------------------------------------------------

if not st.session_state.batch_id:
    st.stop()

# ---------------------------------------------------------------------------
# Fetch batch data
# ---------------------------------------------------------------------------

batch_data = _api_get(f"/api/v1/ingest/{st.session_state.batch_id}")
if not batch_data:
    st.error("Could not load batch data.")
    st.stop()
st.session_state.batch_data = batch_data

batch_status_val = batch_data.get("status", "unknown")

# ---------------------------------------------------------------------------
# Step 2: Mapping review
# ---------------------------------------------------------------------------

st.markdown("---")
st.markdown("### Step 2 -- Review and correct mapping")

status_label = {
    "mapping_review_required": "Review required",
    "mapping_approved": "Approved",
    "discovering": "Discovering...",
    "profiling": "Running pipeline...",
    "transforming": "Transforming...",
    "staging_loaded": "Staged",
    "deduplicated": "Deduplicated",
    "committed": "Committed",
    "failed": "Failed",
    "failed_permanent": "Failed (permanent)",
}

col_s1, col_s2, col_s3 = st.columns(3)
with col_s1:
    st.metric("Batch ID", st.session_state.batch_id[:12] + "...")
with col_s2:
    st.metric("Status", status_label.get(batch_status_val, batch_status_val))
with col_s3:
    filename = (batch_data.get("metadata") or {}).get("filename", "?")
    st.metric("File", filename[:30] if filename else "?")

fields: list[dict] = batch_data.get("fields", [])

if batch_status_val in ("committed",):
    st.success("This batch has been committed to production successfully.")
elif batch_status_val in ("failed", "failed_permanent"):
    st.error(f"Pipeline failed: {batch_data.get('error', 'unknown error')}")
elif batch_status_val in ("profiling", "transforming", "staging_loaded", "deduplicated", "mapping_approved"):
    if batch_status_val in ("profiling", "transforming"):
        st.info("Pipeline is running... Refresh to see latest status.")
        if st.button("Refresh status"):
            st.rerun()
    elif batch_status_val == "committed":
        st.success("Committed.")
    else:
        st.info(f"Current status: **{status_label.get(batch_status_val, batch_status_val)}**")

# ---------------------------------------------------------------------------
# Mapping table with correction dropdowns
# ---------------------------------------------------------------------------

if fields and batch_status_val not in ("committed", "profiling", "transforming"):
    corrections_made = False
    correction_payload: list[dict] = []

    for i, field in enumerate(fields):
        if field.get("status") == "rejected" and field.get("review_reason", "").startswith("auto_invalid"):
            continue

        source_col = field.get("source_column", "?")
        current_table = field.get("target_table", "object_temp")
        current_column = field.get("target_column", source_col)
        current_transform = field.get("transform", "identity")
        confidence = float(field.get("confidence", 0))
        field_id = field.get("id", "")
        field_status = field.get("status", "proposed")

        if confidence >= 0.8:
            conf_class = "confidence-high"
            conf_icon = "+"
        elif confidence >= 0.5:
            conf_class = "confidence-mid"
            conf_icon = "~"
        else:
            conf_class = "confidence-low"
            conf_icon = "-"

        with st.container():
            cols = st.columns([2, 2, 2, 1.5, 0.8, 0.7])

            with cols[0]:
                st.markdown(f"**{source_col}**")
                st.caption(f"Sheet: {field.get('sheet_name', 'default')}")

            table_options = ALL_TABLES
            current_table_idx = table_options.index(current_table) if current_table in table_options else 0
            with cols[1]:
                new_table = st.selectbox(
                    "Table",
                    options=table_options,
                    index=current_table_idx,
                    key=f"table_{i}",
                    label_visibility="collapsed",
                )

            col_options = TARGET_SCHEMA.get(new_table, {}).get("columns", [])
            current_col_idx = col_options.index(current_column) if current_column in col_options else 0
            with cols[2]:
                new_column = st.selectbox(
                    "Column",
                    options=col_options if col_options else [current_column],
                    index=min(current_col_idx, max(0, len(col_options) - 1)),
                    key=f"col_{i}",
                    label_visibility="collapsed",
                )

            transform_options = TARGET_SCHEMA.get(new_table, {}).get("transforms", ["identity"])
            current_tr_idx = transform_options.index(current_transform) if current_transform in transform_options else 0
            with cols[3]:
                new_transform = st.selectbox(
                    "Transform",
                    options=transform_options,
                    index=min(current_tr_idx, max(0, len(transform_options) - 1)),
                    key=f"tr_{i}",
                    label_visibility="collapsed",
                )

            with cols[4]:
                st.markdown(f"<span class='{conf_class}'>{conf_icon} {confidence:.0%}</span>", unsafe_allow_html=True)

            with cols[5]:
                skip = st.checkbox("Skip", key=f"skip_{i}", value=(field_status == "rejected"))

            changed = (
                new_table != current_table
                or new_column != current_column
                or new_transform != current_transform
                or skip != (field_status == "rejected")
            )
            if changed:
                corrections_made = True
            correction_payload.append({
                "field_id": field_id,
                "target_table": new_table,
                "target_column": new_column,
                "transform": new_transform,
                "skip": skip,
            })

    # Column headers (shown above the first row via markdown)
    st.markdown("---")

    col_save, col_run = st.columns(2)
    pipeline_can_run = batch_status_val not in ("committed", "profiling", "transforming", "failed_permanent")

    with col_save:
        if corrections_made and st.button("Save mapping corrections", use_container_width=True):
            result = _api_patch(
                f"/api/v1/ingest/{st.session_state.batch_id}/mapping",
                {"corrections": correction_payload},
            )
            if result:
                st.success(f"Saved {result.get('updated', 0)} corrections.")
                if result.get("errors"):
                    for err in result["errors"]:
                        st.warning(err)
                time.sleep(0.5)
                st.rerun()

    with col_run:
        if st.button(
            "Start Import",
            type="primary",
            use_container_width=True,
            disabled=not pipeline_can_run,
        ):
            if corrections_made:
                save_result = _api_patch(
                    f"/api/v1/ingest/{st.session_state.batch_id}/mapping",
                    {"corrections": correction_payload},
                )
                if save_result and save_result.get("errors"):
                    st.error("Fix mapping errors before running pipeline.")
                    st.stop()

            result = _api_post(f"/api/v1/ingest/{st.session_state.batch_id}/execute")
            if result:
                st.session_state.pipeline_running = True
                st.success("Pipeline started. Refreshing...")
                time.sleep(1.5)
                st.rerun()

elif not fields and batch_status_val not in ("committed", "profiling", "transforming"):
    st.warning("No mapping fields found. The discovery may have failed.")


# ---------------------------------------------------------------------------
# Progress / Events
# ---------------------------------------------------------------------------

if batch_status_val in ("profiling", "transforming", "staging_loaded", "deduplicated", "committed", "failed", "failed_permanent"):
    st.markdown("---")
    st.markdown("### Pipeline progress")

    phase_order = ["ingest", "discovery", "pipeline", "etl", "dedup", "resolve", "commit"]
    events: list[dict] = batch_data.get("events", [])

    if events:
        completed_phases = {e.get("phase") for e in events if e.get("level") != "error"}
        for phase in phase_order:
            if phase in completed_phases:
                st.markdown(f"  {phase}")
            elif any(e.get("phase") == phase and e.get("level") == "error" for e in events):
                st.markdown(f"  {phase}")
            else:
                st.markdown(f"  {phase}")

        with st.expander("Event log", expanded=False):
            for ev in events:
                level = ev.get("level", "info")
                icon = {"info": "info", "warning": "warning", "error": "error"}.get(level, "info")
                ts = (ev.get("created_at") or "")[:19]
                st.markdown(f"**[{ts}]** `{ev.get('phase')}`  {ev.get('message', '')}")

    if batch_status_val in ("profiling", "transforming"):
        st.info("Pipeline is still running. Click refresh to update.")
        if st.button("Refresh", key="refresh_progress"):
            st.rerun()


# ---------------------------------------------------------------------------
# Advanced panel
# ---------------------------------------------------------------------------

with st.expander("Advanced", expanded=False):
    st.markdown("#### Batch actions")
    adv_col1, adv_col2 = st.columns(2)
    with adv_col1:
        if st.button("Rollback batch", use_container_width=True):
            result = _api_post(f"/api/v1/ingest/{st.session_state.batch_id}/rollback?force=true")
            if result:
                st.success("Rollback complete.")
                time.sleep(1)
                st.rerun()
    with adv_col2:
        if st.button("Purge batch", use_container_width=True):
            result = _api_post(f"/api/v1/ingest/{st.session_state.batch_id}/purge?force=true")
            if result:
                st.success("Purge complete.")
                st.session_state.batch_id = None
                st.session_state.batch_data = None
                time.sleep(1)
                st.rerun()

    st.markdown("#### Recent batches")
    batches_data = _api_get("/api/v1/ingest/{batch_id}".replace("{batch_id}", st.session_state.batch_id))
    if batches_data:
        st.json(batches_data)

    st.markdown("#### Raw batch JSON")
    st.json(batch_data)
