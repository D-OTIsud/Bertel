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
        "label": "Object (main entity)",
        "columns": ["name", "object_type", "external_id", "source_org_object_id", "org_name", "email", "phone", "latitude", "longitude"],
        "transforms": ["identity", "lowercase"],
    },
    "object_location_temp": {
        "label": "Location (address / GPS)",
        "columns": ["latitude", "longitude", "address1", "city", "postcode"],
        "transforms": ["identity", "split_gps"],
    },
    "contact_channel_temp": {
        "label": "Contact channel (email, phone...)",
        "columns": ["value", "kind_code"],
        "transforms": ["identity", "lowercase"],
    },
    "org_temp": {
        "label": "Organization",
        "columns": ["name", "source_org_object_id", "external_id"],
        "transforms": ["identity", "lowercase"],
    },
    "object_org_link_temp": {
        "label": "Object-Org link (ownership)",
        "columns": ["role_code", "is_primary", "note"],
        "transforms": ["identity", "lowercase"],
    },
    "object_classification_temp": {
        "label": "Classification (scheme+value)",
        "columns": ["scheme_code", "value_code"],
        "transforms": ["identity", "lowercase"],
    },
    "media_temp": {
        "label": "Media (images, URLs)",
        "columns": ["source_url"],
        "transforms": ["identity", "split_list"],
    },
    "object_amenity_temp": {
        "label": "Amenities / equipment",
        "columns": ["amenity_code"],
        "transforms": ["identity", "split_list"],
    },
    "object_payment_method_temp": {
        "label": "Payment methods",
        "columns": ["payment_code"],
        "transforms": ["identity", "split_list"],
    },
}

ALL_TABLES = list(TARGET_SCHEMA.keys())
TABLE_LABELS = {k: v["label"] for k, v in TARGET_SCHEMA.items()}

SKIP_COLUMNS = {
    "source_sheet", "source_row_index", "formulaire", "source_row",
    "row_number", "row_index", "index", "unnamed",
}

TRANSFORM_HELP = {
    "identity": "Keep value as-is",
    "lowercase": "Convert to lowercase",
    "split_gps": "Split 'lat,lon' string into two fields",
    "split_list": "Split delimited list (comma, pipe, semicolon) into rows",
}


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
    .block-container { max-width: 1100px; padding-top: 1.5rem; }
    .confidence-high { color: #4caf50; font-weight: 700; }
    .confidence-mid  { color: #ff9800; font-weight: 700; }
    .confidence-low  { color: #f44336; font-weight: 700; }
    .mapping-header  { font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
                       letter-spacing: 0.05em; opacity: 0.6; padding-bottom: 4px; }
    .field-source    { font-weight: 600; font-size: 0.95rem; }
    .field-sheet     { font-size: 0.75rem; opacity: 0.5; }
    hr { margin: 0.5rem 0; }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# Header with inline health
# ---------------------------------------------------------------------------

col_title, col_health = st.columns([5, 1])
with col_title:
    st.markdown("# Bertel Data Ingestor")
with col_health:
    healthy = _check_health()
    st.markdown(
        f"<div style='text-align:right;padding-top:12px;'>"
        f"{'🟢 API online' if healthy else '🔴 API offline'}</div>",
        unsafe_allow_html=True,
    )

if not healthy:
    st.error("Cannot reach the API backend. Check that the API service is running.")
    st.stop()

# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

if "batch_id" not in st.session_state:
    st.session_state.batch_id = None
if "batch_data" not in st.session_state:
    st.session_state.batch_data = None

# ---------------------------------------------------------------------------
# Step 1: Organization + File Upload
# ---------------------------------------------------------------------------

step1_disabled = st.session_state.batch_id is not None

st.markdown("---")
st.markdown("### Step 1 -- Select organization and upload data")

orgs_data = _api_get("/api/v1/orgs")
org_list: list[dict] = (orgs_data or {}).get("orgs", []) if isinstance(orgs_data, dict) else []
org_options = {f"{o['name']}  ({o['object_id'][:8]}...)": o["object_id"] for o in org_list}

col_org, col_file = st.columns([1, 2])

with col_org:
    if org_options:
        org_choice = st.selectbox("Organization", options=[""] + list(org_options.keys()), disabled=step1_disabled)
        selected_org_id = org_options.get(org_choice, "")
        org_name_input = ""
    else:
        st.caption("No organizations found -- enter ID manually")
        org_id_input = st.text_input("Organization ID", disabled=step1_disabled, placeholder="paste-org-uuid-here")
        org_name_input = st.text_input("Organization name", disabled=step1_disabled)
        selected_org_id = org_id_input.strip()

with col_file:
    uploaded_file = st.file_uploader(
        "Data file (CSV, Excel, JSON, XML)",
        type=["csv", "xlsx", "xlsm", "json", "xml"],
        disabled=step1_disabled,
    )

col_btn1, col_btn2 = st.columns([1, 1])
with col_btn1:
    if st.button(
        "Upload and analyze",
        disabled=step1_disabled or not uploaded_file or not selected_org_id,
        type="primary",
        use_container_width=True,
    ):
        with st.spinner("Uploading and running discovery..."):
            files = {"upload_file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)}
            params: dict[str, str] = {"organization_object_id": selected_org_id}
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

with col_btn2:
    if st.session_state.batch_id and st.button("Start new import", use_container_width=True):
        st.session_state.batch_id = None
        st.session_state.batch_data = None
        st.rerun()

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
fields: list[dict] = batch_data.get("fields", [])

STATUS_LABELS = {
    "mapping_review_required": "Mapping review",
    "mapping_approved": "Mapping approved",
    "discovering": "Discovering...",
    "profiling": "Pipeline running...",
    "transforming": "Transforming...",
    "staging_loaded": "Staged",
    "deduplicated": "Deduplicated",
    "committed": "Committed",
    "failed": "Failed",
    "failed_permanent": "Failed (permanent)",
}

# ---------------------------------------------------------------------------
# Step 2: Mapping review
# ---------------------------------------------------------------------------

st.markdown("---")
st.markdown("### Step 2 -- Review and correct mapping")

filename = (batch_data.get("metadata") or {}).get("filename", "?")
st.caption(
    f"Batch `{st.session_state.batch_id[:12]}...`  |  "
    f"Status: **{STATUS_LABELS.get(batch_status_val, batch_status_val)}**  |  "
    f"File: {filename}"
)

if batch_status_val == "committed":
    st.success("This batch has been committed to production.")
    st.stop()
elif batch_status_val in ("failed", "failed_permanent"):
    st.error(f"Pipeline failed: {batch_data.get('error', 'unknown error')}")
elif batch_status_val in ("profiling", "transforming"):
    st.info("Pipeline is running... Click below to refresh.")
    if st.button("Refresh status"):
        st.rerun()

# ---------------------------------------------------------------------------
# Mapping table
# ---------------------------------------------------------------------------

if fields and batch_status_val not in ("committed", "profiling", "transforming"):
    visible_fields = [
        f for f in fields
        if not (f.get("status") == "rejected" and (f.get("review_reason") or "").startswith("auto_invalid"))
    ]

    # Column headers
    hdr = st.columns([2.5, 2, 2, 1.5, 0.6, 0.5])
    with hdr[0]:
        st.markdown("<div class='mapping-header'>Source field</div>", unsafe_allow_html=True)
    with hdr[1]:
        st.markdown("<div class='mapping-header'>Target table</div>", unsafe_allow_html=True)
    with hdr[2]:
        st.markdown("<div class='mapping-header'>Target column</div>", unsafe_allow_html=True)
    with hdr[3]:
        st.markdown("<div class='mapping-header'>Transform</div>", unsafe_allow_html=True)
    with hdr[4]:
        st.markdown("<div class='mapping-header'>Confidence</div>", unsafe_allow_html=True)
    with hdr[5]:
        st.markdown("<div class='mapping-header'>Skip</div>", unsafe_allow_html=True)

    corrections_made = False
    correction_payload: list[dict] = []

    for i, field in enumerate(visible_fields):
        source_col = field.get("source_column", "?")
        sheet_name = field.get("sheet_name", "default")
        current_table = field.get("target_table", "object_temp")
        current_column = field.get("target_column", source_col)
        current_transform = field.get("transform", "identity")
        confidence = float(field.get("confidence", 0))
        field_id = field.get("id", "")
        field_status = field.get("status", "proposed")

        auto_skip = (
            field_status == "rejected"
            or source_col.lower().strip().replace(" ", "_") in SKIP_COLUMNS
            or source_col.lower().startswith("unnamed")
        )

        if confidence >= 0.8:
            conf_html = f"<span class='confidence-high'>{confidence:.0%}</span>"
        elif confidence >= 0.5:
            conf_html = f"<span class='confidence-mid'>{confidence:.0%}</span>"
        else:
            conf_html = f"<span class='confidence-low'>{confidence:.0%}</span>"

        cols = st.columns([2.5, 2, 2, 1.5, 0.6, 0.5])

        with cols[0]:
            st.markdown(f"<span class='field-source'>{source_col}</span><br><span class='field-sheet'>{sheet_name}</span>", unsafe_allow_html=True)

        table_display = [TABLE_LABELS.get(t, t) for t in ALL_TABLES]
        current_table_idx = ALL_TABLES.index(current_table) if current_table in ALL_TABLES else 0
        with cols[1]:
            sel_label = st.selectbox(
                "tbl", options=table_display, index=current_table_idx,
                key=f"tbl_{i}", label_visibility="collapsed",
            )
            new_table = ALL_TABLES[table_display.index(sel_label)]

        col_options = TARGET_SCHEMA.get(new_table, {}).get("columns", [])
        current_col_idx = col_options.index(current_column) if current_column in col_options else 0
        with cols[2]:
            new_column = st.selectbox(
                "col", options=col_options if col_options else [current_column],
                index=min(current_col_idx, max(0, len(col_options) - 1)),
                key=f"col_{i}", label_visibility="collapsed",
            )

        transform_options = TARGET_SCHEMA.get(new_table, {}).get("transforms", ["identity"])
        current_tr_idx = transform_options.index(current_transform) if current_transform in transform_options else 0
        with cols[3]:
            new_transform = st.selectbox(
                "tr", options=transform_options,
                index=min(current_tr_idx, max(0, len(transform_options) - 1)),
                key=f"tr_{i}", label_visibility="collapsed",
            )

        with cols[4]:
            st.markdown(conf_html, unsafe_allow_html=True)

        with cols[5]:
            skip = st.checkbox("x", key=f"skip_{i}", value=auto_skip, label_visibility="collapsed")

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

    st.markdown("---")

    st.caption(
        "**Transforms:** "
        + " | ".join(f"`{k}` = {v}" for k, v in TRANSFORM_HELP.items())
    )

    col_save, col_run = st.columns(2)
    can_run = batch_status_val not in ("committed", "profiling", "transforming", "failed_permanent")

    with col_save:
        if corrections_made and st.button("Save corrections", use_container_width=True):
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
        if st.button("Start Import", type="primary", use_container_width=True, disabled=not can_run):
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
                st.success("Pipeline started. Refreshing...")
                time.sleep(1.5)
                st.rerun()

elif not fields and batch_status_val not in ("committed", "profiling", "transforming"):
    st.warning("No mapping fields found. Discovery may have failed.")


# ---------------------------------------------------------------------------
# Pipeline progress / events
# ---------------------------------------------------------------------------

if batch_status_val in ("profiling", "transforming", "staging_loaded", "deduplicated", "committed", "failed", "failed_permanent"):
    st.markdown("---")
    st.markdown("### Pipeline progress")

    events: list[dict] = batch_data.get("events", [])
    if events:
        with st.expander("Event log", expanded=batch_status_val in ("failed", "failed_permanent")):
            for ev in events:
                level = ev.get("level", "info")
                ts = (ev.get("created_at") or "")[:19]
                phase = ev.get("phase", "?")
                msg = ev.get("message", "")
                if level == "error":
                    st.error(f"**[{ts}]** `{phase}` -- {msg}")
                elif level == "warning":
                    st.warning(f"**[{ts}]** `{phase}` -- {msg}")
                else:
                    st.info(f"**[{ts}]** `{phase}` -- {msg}")

    if batch_status_val in ("profiling", "transforming"):
        if st.button("Refresh", key="refresh_progress"):
            st.rerun()


# ---------------------------------------------------------------------------
# Advanced panel
# ---------------------------------------------------------------------------

with st.expander("Advanced", expanded=False):
    adv1, adv2 = st.columns(2)
    with adv1:
        if st.button("Rollback batch", use_container_width=True):
            result = _api_post(f"/api/v1/ingest/{st.session_state.batch_id}/rollback?force=true")
            if result:
                st.success("Rollback complete.")
                time.sleep(1)
                st.rerun()
    with adv2:
        if st.button("Purge batch", use_container_width=True):
            result = _api_post(f"/api/v1/ingest/{st.session_state.batch_id}/purge?force=true")
            if result:
                st.success("Purge complete.")
                st.session_state.batch_id = None
                st.session_state.batch_data = None
                time.sleep(1)
                st.rerun()

    st.markdown("#### Raw batch data")
    st.json(batch_data)
