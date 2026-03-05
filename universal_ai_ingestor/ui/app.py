from __future__ import annotations

import json
import os
from typing import Any

import pandas as pd
import requests
import streamlit as st
from supabase import create_client


st.set_page_config(page_title="Universal AI Data Ingestor", layout="wide")
st.title("Universal AI Data Ingestor - Validation Console")

api_base_url = os.getenv("API_BASE_URL", "http://api:8000")
api_bearer_token_env = os.getenv("API_BEARER_TOKEN", "")
api_operator_token_env = os.getenv("API_OPERATOR_TOKEN", "")
api_reviewer_token_env = os.getenv("API_REVIEWER_TOKEN", "")
api_admin_token_env = os.getenv("API_ADMIN_TOKEN", "")
supabase_url = os.getenv("SUPABASE_URL", "")
supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY", "")

st.info(
    "Workflow: 1) Upload with organization -> 2) Discovery Review (approve mapping) -> "
    "3) Batches (dedup/resolve/ETL/commit) -> 4) Staging Review."
)

with st.sidebar:
    st.markdown("### Connection and auth")
    st.caption("Values are loaded from runtime environment (Coolify/Docker).")
    st.code(
        "API_BASE_URL\nAPI_BEARER_TOKEN\nAPI_OPERATOR_TOKEN\nAPI_REVIEWER_TOKEN\nAPI_ADMIN_TOKEN\nSUPABASE_URL\nSUPABASE_SERVICE_KEY",
        language="text",
    )
    st.caption("Role model: operator=ingest/etl, reviewer=mapping/media review, admin=all.")
    auth_mode = st.radio(
        "API authentication mode",
        options=["Use environment role token", "Paste token manually"],
        key="auth_mode",
    )

    api_token = ""
    if auth_mode == "Use environment role token":
        env_role_options: list[tuple[str, str]] = []
        if api_admin_token_env:
            env_role_options.append(("admin (API_ADMIN_TOKEN)", api_admin_token_env))
        if api_reviewer_token_env:
            env_role_options.append(("reviewer (API_REVIEWER_TOKEN)", api_reviewer_token_env))
        if api_operator_token_env:
            env_role_options.append(("operator (API_OPERATOR_TOKEN)", api_operator_token_env))
        if api_bearer_token_env:
            env_role_options.append(("admin fallback (API_BEARER_TOKEN)", api_bearer_token_env))

        if env_role_options:
            selected_role_label = st.selectbox(
                "Select token profile",
                options=[label for label, _ in env_role_options],
                key="selected_token_profile",
            )
            api_token = next(token for label, token in env_role_options if label == selected_role_label)
            st.caption(f"Using: {selected_role_label}")
        else:
            st.error("No API token available in environment variables.")
    else:
        manual_token = st.text_input("Paste bearer token", type="password", key="manual_api_token")
        api_token = manual_token.strip()

    if api_token:
        st.success("API token loaded for requests")
    else:
        st.error("Missing API token for requests")

    if supabase_url:
        st.success("SUPABASE_URL loaded")
    else:
        st.warning("SUPABASE_URL not set")
    if supabase_service_key:
        st.success("SUPABASE_SERVICE_KEY loaded")
    else:
        st.warning("SUPABASE_SERVICE_KEY not set")


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
    st.caption("Required role: operator or admin.")
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
    st.info(
        "If batch status is mapping_review_required, go to Step 2 (Discovery Review) and "
        "approve mapping before Run ETL / Commit."
    )
    st.caption(
        "Batches are persisted in Supabase (`staging.import_batches` / `staging.import_events`), "
        "not only in container memory."
    )
    batch_id = choose_active_batch(context_key="batches", title="Batch context")
    col_a, col_b, col_c, col_d, col_e, col_f, col_g, col_h = st.columns(8)
    if col_a.button("Fetch status"):
        try:
            status_payload = call_status(batch_id)
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
    if col_b.button("Run dedup"):
        try:
            st.json(trigger_dedup(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Dedup failed: {exc}")
    if col_c.button("Resolve dependencies"):
        try:
            st.json(trigger_resolve_dependencies(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Dependency resolution failed: {exc}")
    if col_d.button("Commit approved"):
        try:
            current = call_status(batch_id)
            gate = (current.get("mapping_contract") or {}).get("status")
            if gate != "approved":
                st.error("Mapping contract is not approved yet. Go to Discovery Review first.")
            else:
                st.json(trigger_commit(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Commit failed: {exc}")
    if col_e.button("Purge batch"):
        try:
            st.json(trigger_purge(batch_id, force=False))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Purge failed: {exc}")
    if col_f.button("Process media"):
        try:
            st.json(trigger_media_process(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Media process failed: {exc}")
    if col_g.button("Rollback batch"):
        try:
            st.json(trigger_rollback(batch_id, force=False))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Rollback failed: {exc}")
    if col_h.button("Run ETL"):
        try:
            st.json(trigger_run_etl(batch_id))
        except Exception as exc:  # noqa: BLE001
            st.error(f"Run ETL failed: {exc}")

    if st.button("Refresh metrics"):
        try:
            st.json(fetch_metrics())
        except Exception as exc:  # noqa: BLE001
            st.error(f"Metrics fetch failed: {exc}")

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
    st.caption("Required role: reviewer or admin.")
    batch_id = choose_active_batch(context_key="discovery", title="Batch context")
    reviewer_profile = st.selectbox(
        "Reviewer profile",
        options=["mapping_reviewer", "qa_reviewer", "admin_reviewer", "custom"],
        key="discovery_reviewer_profile",
    )
    if reviewer_profile == "custom":
        reviewer = st.text_input("Reviewer", value="mapping_reviewer", key="discovery_reviewer_custom")
    else:
        reviewer = reviewer_profile
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
