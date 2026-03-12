"""Bertel Data Ingestor v2 -- 5-step wizard UI."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

import requests
import streamlit as st

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from core.target_schema import TARGET_SCHEMA_RULES
API_BASE = os.getenv("API_BASE_URL", "http://api:8000").rstrip("/")
TOKEN = os.getenv("API_BEARER_TOKEN", "")

TARGET_SCHEMA: dict[str, dict[str, Any]] = {
    table: {
        "columns": [column.column for column in rule.columns],
        "transforms": list(rule.allowed_transforms),
    }
    for table, rule in TARGET_SCHEMA_RULES.items()
}
ALL_TABLES = sorted(TARGET_SCHEMA.keys())

SKIP_PATTERNS: set[str] = {
    "source_sheet",
    "source_row_index",
    "formulaire",
    "row_number",
    "row_index",
    "index",
    "unnamed",
    "moderer",
    "moderateur",
    "moderator",
    "date_creation",
    "date_modification",
    "created_at",
    "updated_at",
    "user",
    "utilisateur",
    "auteur",
    "author",
    "date_saisie",
    "date_maj",
    "date_import",
}

DISCOVERY_PHASES = [
    ("discovery_entities", "Identification des entites"),
    ("discovery_profiling", "Profilage des colonnes"),
    ("discovery_relations", "Analyse des relations"),
    ("discovery_validation", "Validation du mapping"),
]

STATUS_LABELS = {
    "received": "Recu",
    "discovering": "Analyse IA",
    "mapping_review_required": "Mapping & correction",
    "mapping_approved": "Mapping valide",
    "profiling": "Validation & import",
    "transforming": "Validation & import",
    "staging_loaded": "Validation & import",
    "deduplicated": "Validation & import",
    "committed": "Importation reussie",
    "failed": "Echec",
    "failed_permanent": "Echec",
}


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def _api_get(path: str, params: dict[str, Any] | None = None, *, quiet: bool = False) -> dict[str, Any] | list[Any] | None:
    try:
        resp = requests.get(f"{API_BASE}{path}", headers=_headers(), params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        if not quiet:
            st.error(f"API error: {exc}")
        return None


def _api_post(path: str, *, params: dict[str, Any] | None = None, files: Any = None, quiet: bool = False) -> dict[str, Any] | None:
    try:
        resp = requests.post(f"{API_BASE}{path}", headers=_headers(), params=params, files=files, timeout=120)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        if not quiet:
            st.error(f"API error: {exc}")
        return None


def _api_patch(path: str, json_body: Any) -> dict[str, Any] | None:
    try:
        resp = requests.patch(f"{API_BASE}{path}", headers=_headers(), json=json_body, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        st.error(f"API error: {exc}")
        return None


def _check_health() -> bool:
    try:
        resp = requests.get(f"{API_BASE}/health", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def _reset_wizard() -> None:
    st.session_state.step = 1
    st.session_state.batch_id = None
    st.session_state.batch_data = None
    st.session_state.ai_correction = True


def _fetch_batch() -> dict[str, Any] | None:
    if not st.session_state.batch_id:
        return None
    data = _api_get(f"/api/v1/ingest/{st.session_state.batch_id}", quiet=True)
    if isinstance(data, dict):
        st.session_state.batch_data = data
        return data
    return None


def _render_stepper(step: int) -> None:
    labels = ["Import source", "Analyse IA", "Mapping & Correction", "Validation & Import"]
    parts: list[str] = ["<div class='stepper'>"]
    for idx, label in enumerate(labels, start=1):
        active = "step-active" if idx <= min(step, 4) else "step-inactive"
        parts.append(
            "<div class='step-item'>"
            f"<div class='step-circle {active}'>{idx}</div>"
            f"<div class='step-label'>{label}</div>"
            "</div>"
        )
    parts.append("</div>")
    st.markdown("".join(parts), unsafe_allow_html=True)


def _field_icon(target_table: str) -> str:
    if target_table == "object_location_temp":
        return "Location"
    if target_table in {"contact_channel_temp", "actor_channel_temp"}:
        return "Phone"
    return "Field"


TRANSFORM_LABELS = {
    "identity": "Conserver tel quel",
    "lowercase": "Mettre en minuscules",
    "split_list": "Decouper une liste",
    "split_gps": "Separer latitude / longitude",
}


def _transform_label(transform: str) -> str:
    return TRANSFORM_LABELS.get(transform, transform)


def _transform_hint(transform: str) -> str:
    hints = {
        "identity": "Aucune transformation de la valeur.",
        "lowercase": "Convertit le texte en minuscules.",
        "split_list": "Separe plusieurs valeurs dans une meme cellule.",
        "split_gps": "Separe des coordonnees GPS en latitude et longitude.",
    }
    return hints.get(transform, "")


st.set_page_config(page_title="Bertel Data Ingestor", page_icon="database", layout="wide")
st.markdown(
    """
<style>
    .block-container { max-width: 1200px; padding-top: 1.0rem; }
    .stepper { display: flex; justify-content: space-between; margin: 0.5rem 0 1.2rem 0; }
    .step-item { text-align: center; width: 24%; }
    .step-circle { width: 34px; height: 34px; border-radius: 50%; margin: 0 auto 0.4rem auto; line-height: 34px; font-weight: 700; border: 2px solid #d9d9d9; }
    .step-active { background: #5b5bd6; color: #fff; border-color: #5b5bd6; }
    .step-inactive { color: #777; }
    .step-label { font-size: 0.82rem; color: #6a6a6a; font-weight: 600; }
    .import-card { border: 1px solid #e6e6ee; border-radius: 12px; padding: 1.2rem; background: #fff; }
    .drop-hint { border: 1px dashed #c9c9d9; border-radius: 12px; padding: 1.0rem; text-align: center; color: #666; margin: 0.6rem 0; }
    .mapping-card { border: 1px solid #ececf4; border-radius: 10px; padding: 0.7rem; margin-bottom: 0.5rem; }
    .conf-high { color: #1e9d57; font-weight: 700; }
    .conf-mid { color: #c68712; font-weight: 700; }
    .conf-low { color: #ce4040; font-weight: 700; }
    .pill { border-radius: 10px; padding: 2px 8px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
    .pill-ok { background: #e8f8ee; color: #1e9d57; }
    .pill-warn { background: #fff7e4; color: #c68712; }
</style>
""",
    unsafe_allow_html=True,
)

if "step" not in st.session_state:
    st.session_state.step = 1
if "batch_id" not in st.session_state:
    st.session_state.batch_id = None
if "batch_data" not in st.session_state:
    st.session_state.batch_data = None
if "ai_correction" not in st.session_state:
    st.session_state.ai_correction = True

st.title("Bertel Data Ingestor")
healthy = _check_health()
st.caption("API online" if healthy else "API offline")
if not healthy:
    st.error("Cannot reach the API backend.")
    st.stop()
if not TOKEN:
    st.warning("API_BEARER_TOKEN is empty. Authentication may fail.")

_render_stepper(st.session_state.step)

# STEP 1
if st.session_state.step == 1:
    st.markdown("### Importez vos donnees brutes")
    st.caption("Glissez-deposez un fichier. L'IA lira la structure et adaptera le mapping.")
    orgs_data = _api_get("/api/v1/orgs", quiet=True)
    orgs = (orgs_data or {}).get("orgs", []) if isinstance(orgs_data, dict) else []
    options = {f"{o['name']} ({o['object_id'][:8]}...)": o["object_id"] for o in orgs}
    if options:
        selected_org_label = st.selectbox("Organisation", list(options.keys()))
        selected_org_id = options[selected_org_label]
        org_name_input = ""
    else:
        selected_org_id = st.text_input("Organisation ID", placeholder="UUID")
        org_name_input = st.text_input("Nom de l'organisation")
    st.markdown(
        "<div class='drop-hint'>Cliquez pour parcourir ou glissez un fichier<br>"
        "Excel (.xlsx), CSV, JSON ou XML supportes</div>",
        unsafe_allow_html=True,
    )
    uploaded_file = st.file_uploader("Fichier source", type=["csv", "xlsx", "xlsm", "json", "xml"], label_visibility="collapsed")
    custom_rules = st.text_area(
        "Regles metiers specifiques (optionnel)",
        placeholder=(
            "Ex: La colonne 'id OTI' correspond toujours a external_id.\n"
            "Les reseaux sociaux vont dans contact_channel_temp."
        ),
    )
    can_upload = bool(uploaded_file and selected_org_id)
    if st.button("Analyser avec l'IA", type="primary", use_container_width=True, disabled=not can_upload):
        files = {"upload_file": (uploaded_file.name, uploaded_file.getvalue(), uploaded_file.type)}
        params: dict[str, str] = {"organization_object_id": selected_org_id}
        if org_name_input:
            params["organization_name"] = org_name_input
        if custom_rules.strip():
            params["custom_rules"] = custom_rules.strip()
        result = _api_post("/api/v1/ingest", params=params, files=files)
        if result:
            st.session_state.batch_id = result["batch_id"]
            st.session_state.step = 2
            st.rerun()
    st.stop()

batch_data = _fetch_batch()
if not batch_data:
    st.error("Impossible de charger le batch courant.")
    st.stop()
status = batch_data.get("status", "received")

# STEP 2
if st.session_state.step == 2:
    st.markdown("### L'IA profile vos donnees...")
    with st.status("Analyse en cours...", expanded=True) as status_widget:
        while True:
            batch = _fetch_batch()
            if not batch:
                status_widget.update(label="Erreur", state="error")
                st.error("Impossible de charger le batch.")
                st.stop()
            cur_status = batch.get("status", "received")
            events = batch.get("events", [])
            phases_done = {e.get("phase") for e in events if e.get("phase")}
            total_cols = len(batch.get("fields", []))

            for phase_key, phase_label in DISCOVERY_PHASES:
                phase_events = [e for e in events if e.get("phase") == phase_key]
                if phase_events:
                    last_msg = phase_events[-1].get("message", "")
                    st.write(f"OK {phase_label}: {last_msg}")
                else:
                    st.write(f"... {phase_label}")

            if total_cols > 0:
                st.caption(f"{total_cols} colonnes detectees")

            if cur_status in {"mapping_review_required", "mapping_approved"}:
                status_widget.update(label="Analyse terminee", state="complete")
                time.sleep(0.5)
                st.session_state.step = 3
                st.rerun()
            if cur_status in {"failed", "failed_permanent"}:
                status_widget.update(label="Echec", state="error")
                st.error(batch.get("error") or "Echec lors de l'analyse.")
                st.stop()
            time.sleep(2.0)
            st.rerun()

# STEP 3
if st.session_state.step == 3:
    st.markdown("### Validation du Mapping IA")
    fields: list[dict[str, Any]] = batch_data.get("fields", [])
    relations: list[dict[str, Any]] = batch_data.get("relations", [])
    if not fields:
        st.warning("Aucun champ detecte.")
        if st.button("Rafraichir"):
            st.rerun()
        st.stop()
    visible_fields = [f for f in fields if f.get("field_id") is not None or f.get("id") is not None]
    perfect = sum(1 for f in visible_fields if float(f.get("confidence", 0)) >= 0.8)
    to_review = max(0, len(visible_fields) - perfect)
    c1, c2 = st.columns([1, 1])
    with c1:
        st.markdown(f"<span class='pill pill-ok'>{perfect} correspondances parfaites</span>", unsafe_allow_html=True)
    with c2:
        st.markdown(f"<span class='pill pill-warn'>{to_review} a verifier</span>", unsafe_allow_html=True)
    if relations:
        with st.expander(f"Relations detectees par l'IA ({len(relations)})", expanded=False):
            for rel in relations:
                from_sheet = str(rel.get("from_sheet", ""))
                from_col = str(rel.get("from_column", ""))
                target_entity = str(rel.get("target_entity_type", ""))
                target_table = str(rel.get("target_staging_table", ""))
                sep = str(rel.get("separator", ","))
                join_label = "join_table" if bool(rel.get("is_join_table")) else "relation"
                conf = float(rel.get("confidence", 0.0))
                st.markdown(
                    f"- `{from_sheet}.{from_col}` -> `{target_entity}` / `{target_table}` "
                    f"(sep=`{sep}`, {join_label}, conf={conf:.0%})"
                )

    corrections: list[dict[str, Any]] = []
    changed_any = False
    h_left, h_mid, h_right, h_chip, h_conf, h_skip = st.columns([2.2, 2.0, 2.0, 1.0, 0.8, 0.6])
    with h_left:
        st.caption("Champ source")
    with h_mid:
        st.caption("Table cible")
    with h_right:
        st.caption("Colonne cible")
    with h_chip:
        st.caption("Transformation")
    with h_conf:
        st.caption("Confiance")
    with h_skip:
        st.caption("Ignorer")

    for idx, field in enumerate(visible_fields):
        source_col = str(field.get("source_column", "?"))
        sheet_name = str(field.get("sheet_name", "default"))
        current_table = str(field.get("target_table", "object_temp"))
        current_column = str(field.get("target_column", "name"))
        current_transform = str(field.get("transform", "identity"))
        field_id = str(field.get("id", ""))
        confidence = float(field.get("confidence", 0.0))
        if confidence >= 0.8:
            conf_class = "conf-high"
        elif confidence >= 0.5:
            conf_class = "conf-mid"
        else:
            conf_class = "conf-low"
        st.markdown("<div class='mapping-card'>", unsafe_allow_html=True)
        left, mid, right, chip, conf, sk = st.columns([2.2, 2.0, 2.0, 1.0, 0.8, 0.6])
        with left:
            st.write(f"{_field_icon(current_table)} **{source_col}**")
            st.caption(f"Feuille: {sheet_name}")
        table_idx = ALL_TABLES.index(current_table) if current_table in ALL_TABLES else 0
        with mid:
            new_table = st.selectbox("Table cible", ALL_TABLES, index=table_idx, key=f"tbl_{idx}", label_visibility="collapsed")
        col_options = TARGET_SCHEMA.get(new_table, {}).get("columns", [])
        col_idx = col_options.index(current_column) if current_column in col_options else 0
        with right:
            new_column = st.selectbox("Colonne cible", col_options if col_options else [current_column], index=col_idx, key=f"col_{idx}", label_visibility="collapsed")
        tr_options = TARGET_SCHEMA.get(new_table, {}).get("transforms", ["identity"])
        tr_idx = tr_options.index(current_transform) if current_transform in tr_options else 0
        with chip:
            new_transform = st.selectbox(
                "Transformation",
                tr_options,
                index=tr_idx,
                key=f"tr_{idx}",
                format_func=_transform_label,
                label_visibility="collapsed",
            )
            st.caption(_transform_hint(new_transform))
        with conf:
            st.markdown(f"<div class='{conf_class}'>{confidence:.0%}</div>", unsafe_allow_html=True)
        with sk:
            default_skip = field.get("status") == "rejected"
            skip = st.checkbox("Ignorer", value=bool(default_skip), key=f"skip_{idx}", label_visibility="collapsed")
        st.markdown("</div>", unsafe_allow_html=True)
        changed = (
            new_table != current_table
            or new_column != current_column
            or new_transform != current_transform
            or skip != (field.get("status") == "rejected")
        )
        if changed:
            changed_any = True
        corrections.append(
            {
                "field_id": field_id,
                "target_table": new_table,
                "target_column": new_column,
                "transform": new_transform,
                "skip": skip,
            }
        )

    b1, b2 = st.columns([1, 1])
    with b1:
        if st.button("Enregistrer corrections", use_container_width=True):
            result = _api_patch(f"/api/v1/ingest/{st.session_state.batch_id}/mapping", {"corrections": corrections})
            if result:
                st.success(f"Corrections enregistrees: {result.get('updated', 0)}")
                if result.get("errors"):
                    for item in result.get("errors", []):
                        st.warning(item)
                time.sleep(0.6)
                st.rerun()
    with b2:
        if st.button("Continuer", type="primary", use_container_width=True):
            if changed_any:
                result = _api_patch(f"/api/v1/ingest/{st.session_state.batch_id}/mapping", {"corrections": corrections})
                if result and result.get("errors"):
                    st.error("Corrigez les erreurs avant de continuer.")
                    st.stop()
            st.session_state.step = 4
            st.rerun()
    st.stop()

# STEP 4
if st.session_state.step == 4:
    st.markdown("### Apercu avant Importation")
    st.session_state.ai_correction = st.toggle("Correction orthographique IA", value=bool(st.session_state.ai_correction))
    preview = _api_get(f"/api/v1/ingest/{st.session_state.batch_id}/preview")
    rows = (preview or {}).get("rows", []) if isinstance(preview, dict) else []
    if not rows:
        st.warning("Aucune ligne de previsualisation disponible.")
    for idx, row in enumerate(rows[:5], start=1):
        st.markdown(f"#### Ligne {idx}")
        c1, c2 = st.columns(2)
        with c1:
            st.caption("OBJECT")
            st.json(row.get("object") or {})
            st.caption("CONTACT_CHANNEL")
            st.json(row.get("contact_channel") or [])
        with c2:
            st.caption("OBJECT_LOCATION")
            st.json(row.get("object_location") or {})
            st.caption("OBJECT_DESCRIPTION")
            st.json(row.get("object_description") or {})
    c1, c2 = st.columns([1, 1])
    with c1:
        if st.button("Retour mapping", use_container_width=True):
            st.session_state.step = 3
            st.rerun()
    with c2:
        if st.button("Lancer l'importation", type="primary", use_container_width=True):
            result = _api_post(
                f"/api/v1/ingest/{st.session_state.batch_id}/execute",
                params={"use_cleaner": str(bool(st.session_state.ai_correction)).lower()},
            )
            if result:
                st.session_state.step = 5
                st.rerun()
    st.stop()

# STEP 5
if st.session_state.step == 5:
    st.markdown("### Importation reussie")
    batch = _fetch_batch() or {}
    status = batch.get("status", "unknown")
    if status in {"failed", "failed_permanent"}:
        st.error(batch.get("error") or "Le pipeline a echoue.")
    elif status != "committed":
        st.info(f"Import en cours: {STATUS_LABELS.get(status, status)}")
        events = batch.get("events", [])
        for event in events[:8]:
            st.caption(f"[{(event.get('created_at') or '')[:19]}] {event.get('phase', '?')}: {event.get('message', '')}")
        time.sleep(1.0)
        st.rerun()
    else:
        stats = (batch.get("metadata") or {}).get("sheet_progress", {})
        c1, c2 = st.columns(2)
        with c1:
            st.metric("Objets crees (object)", int(stats.get("rows_loaded", 0)))
            st.metric("Adresses liees", int(stats.get("locations", 0)))
        with c2:
            st.metric("Contacts lies", int(stats.get("contacts", 0)))
            st.metric("Fautes corrigees par l'IA", int(stats.get("ai_corrections", 0)))
        if st.button("Nouvelle importation", type="primary", use_container_width=True):
            _reset_wizard()
            st.rerun()
