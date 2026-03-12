from __future__ import annotations

import logging
import os
from typing import Any, Callable, TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from core.config import settings
from core.schemas import (
    CleanerBatchOutput,
    ColumnSelection,
    ColumnVerdict,
    EntityIdentification,
    MappingPlan,
    MappingTarget,
    MultiSheetMappingPlan,
    RelationAnalysis,
    RelationTarget,
    WorkbookPayload,
)

from core.constants import ENTITY_TYPE_TO_STAGING

try:
    from core.target_schema import TARGET_SCHEMA_RULES, KNOWN_OBJECT_TYPES, validate_mapping_target
except ModuleNotFoundError:
    from universal_ai_ingestor.core.target_schema import (  # type: ignore
        TARGET_SCHEMA_RULES,
        KNOWN_OBJECT_TYPES,
        validate_mapping_target,
    )

try:
    from core.vector_store import query_similar_few_shots
except ModuleNotFoundError:
    from universal_ai_ingestor.core.vector_store import query_similar_few_shots  # type: ignore

logger = logging.getLogger("ingestor.ai_graph")


class SemanticReview(BaseModel):
    """Output of the semantic critic: list of issues or empty if plan is fine."""
    issues: list[str] = Field(default_factory=list, description="Semantic errors found, e.g. data type mismatch, wrong table for content. Empty if no issues.")


class MappingState(TypedDict):
    schema_snapshot: dict[str, Any]
    sample_rows: list[dict[str, Any]]
    source_format: str
    identified_entities: EntityIdentification | None
    selected_columns: ColumnSelection | None
    analysed_relations: RelationAnalysis | None
    mapping_plan: MappingPlan
    custom_rules: str | None
    validation_errors: list[str]
    reflection_count: int
    emit_event: Callable[[str, str], None] | None
    needs_human_review: bool
    per_sheet_confidence: dict[str, float]
    low_confidence_sheets: dict[str, float]
    review_reasons: list[str]


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(model=settings.llm_model, temperature=0.0, api_key=settings.openai_api_key)


def _load_glossary() -> str:
    path = os.path.join(os.path.dirname(__file__), "domain_glossary.md")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def _emit(state: MappingState, phase: str, message: str) -> None:
    cb = state.get("emit_event")
    if cb:
        try:
            cb(phase, message)
        except Exception:  # noqa: BLE001
            pass


def _tables_summary() -> str:
    lines: list[str] = []
    for r in TARGET_SCHEMA_RULES.values():
        cols = ", ".join(c.column for c in r.columns)
        lines.append(f"  {r.table}: {r.description[:80]}  columns=[{cols}]")
    return "\n".join(lines)


def _obj_types_str() -> str:
    return ", ".join(f"{k}={v}" for k, v in KNOWN_OBJECT_TYPES.items())


def _format_stats_for_prompt(col_stat: dict[str, Any]) -> str:
    if not col_stat:
        return ""
    segments = [
        f"nulls:{col_stat.get('null_percent', 100)}%",
        f"unique:{col_stat.get('unique_count', 0)}",
        f"min_len:{col_stat.get('min_length', 0)}",
        f"max_len:{col_stat.get('max_length', 0)}",
        f"type_hint:{col_stat.get('semantic_type_hint', 'text')}",
        f"numeric:{col_stat.get('numeric_ratio', 0.0):.2f}",
        f"date:{col_stat.get('date_ratio', 0.0):.2f}",
        f"email:{col_stat.get('email_ratio', 0.0):.2f}",
        f"url:{col_stat.get('url_ratio', 0.0):.2f}",
        f"gps:{col_stat.get('gps_ratio', 0.0):.2f}",
        f"id_like:{col_stat.get('id_like_ratio', 0.0):.2f}",
    ]
    if col_stat.get("dominant_delimiter"):
        segments.append(
            f"multi_value:{col_stat.get('dominant_delimiter')}@{col_stat.get('multi_value_ratio', 0.0):.2f}"
        )
    return " [" + ", ".join(segments) + "]"

async def _discover_entities_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_entities", "Identification des entites en cours...")
    schema = state["schema_snapshot"]
    sheets_info: list[dict[str, Any]] = schema.get("sheets_summary", [])
    if not sheets_info:
        incoming = schema.get("incoming_columns", [])
        sheet_name = schema.get("sheet_name", "default")
        samples = state["sample_rows"][:3]
        sheets_info = [{"sheet_name": sheet_name, "columns": incoming, "sample_rows": samples}]

    prompt = (
        "You are a tourism data analyst for the Bertel CRM.\n"
        f"Known entity types: {_obj_types_str()}\n\n"
        "For EACH sheet below, identify the main entity type.\n"
        "If a sheet only contains pairs of IDs (junction table), mark it as 'JUNCTION'.\n"
        "If a sheet contains media/photo URLs, mark it as 'MEDIA'.\n\n"
        "### FEW-SHOT EXAMPLES ###\n"
        "Example 1 -> Sheet 'Activites': Columns=[Nom, GPS, Prix] -> Entity: LOI\n"
        "Example 2 -> Sheet 'Hotels': Columns=[Nom, Etoiles, Chambres] -> Entity: HOT\n"
        "Example 3 -> Sheet 'Prestataires': Columns=[Raison Sociale, SIRET] -> Entity: ORG\n"
        "Example 4 -> Sheet 'Lien_Hotel_Presta': Columns=[ID_HOT, ID_ORG] -> Entity: JUNCTION\n"
    )
    user_parts: list[str] = []
    for info in sheets_info:
        cols = info.get("columns", [])
        samples = info.get("sample_rows", [])[:3]
        user_parts.append(
            f"Sheet '{info['sheet_name']}':\n"
            f"  Columns ({len(cols)}): {cols[:30]}\n"
            f"  Sample rows: {samples}\n"
        )
    user_msg = "\n".join(user_parts) + "\nIdentify the entity type for each sheet."

    agent = _get_llm().with_structured_output(EntityIdentification)
    try:
        result: EntityIdentification = await agent.ainvoke([("system", prompt), ("user", user_msg)])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Entity discovery LLM failed: %s", exc)
        result = EntityIdentification(
            sheets=[],
            assumptions=[f"entity_discovery_failed: {exc.__class__.__name__}"],
        )
    state["identified_entities"] = result
    _emit(state, "discovery_entities", f"Entites identifiees: {len(result.sheets)} feuilles analysees")
    return state


# ---------------------------------------------------------------------------
# Node 2: Column Profiling
# ---------------------------------------------------------------------------

async def _profile_columns_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_profiling", "Profilage des colonnes en cours...")
    schema = state["schema_snapshot"]
    entities = state.get("identified_entities") or EntityIdentification()
    entity_map = {s.sheet_name: s.inferred_object_type for s in entities.sheets}
    global_context = "\n".join(
        f"- Sheet '{sheet_name}' identified as: {entity_type}"
        for sheet_name, entity_type in sorted(entity_map.items())
    ) or "- No global workbook entity context available."
    user_rules = (state.get("custom_rules") or "").strip() or "No user business rules provided."
    validation_errors = state.get("validation_errors", [])
    
    reflection_context = ""
    if validation_errors:
        reflection_context = (
            "## PREVIOUS ATTEMPT FAILED. FIX THESE ERRORS:\n"
            + "\n".join(f"- {e}" for e in validation_errors)
            + "\n\nYou MUST NOT repeat these mistakes. Double-check your chosen target_table and target_column.\n\n"
        )

    tables_desc = _tables_summary()
    sheets_info: list[dict[str, Any]] = schema.get("sheets_summary", [])
    if not sheets_info:
        incoming = schema.get("incoming_columns", [])
        sheet_name = schema.get("sheet_name", "default")
        samples = state["sample_rows"][:5]
        sheets_info = [{"sheet_name": sheet_name, "columns": incoming, "sample_rows": samples}]
    rag_examples: list[str] = []
    try:
        first_sheet = sheets_info[0]
        rag_examples = await query_similar_few_shots(
            sheet_name=first_sheet["sheet_name"],
            column_names=first_sheet.get("columns", []),
            top_k=5,
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("RAG few-shot query failed: %s", exc)
    few_shot_block = (
        "\n".join(rag_examples)
        if rag_examples
        else (
            "- Column 'Id_Prestataire' -> target_table: 'object_temp', target_column: 'source_org_object_id'\n"
            "- Column 'Coordonnees_GPS' -> target_table: 'object_location_temp', target_column: 'latlon', transform: 'split_gps'\n"
            "- Column 'Equipements' -> target_table: 'object_amenity_temp', target_column: 'name', transform: 'split_list'\n"
            "- Column 'Date_Import_Tech' -> keep: false"
        )
    )
    prompt = (
        "You are a data mapping expert for the Bertel tourism CRM.\n"
        f"{reflection_context}"
        "Source data is in FRENCH. Key translations:\n"
        "  Nom->name, Adresse->address1, Ville->city, CP->postcode,\n"
        "  Telephone->phone, Courriel->email, Site web->website,\n"
        "  Latitude->latitude, Type->object_type, Identifiant->external_id,\n"
        "  Etoiles->classification, Equipements->amenities, Description->description,\n"
        "  Tarif->price, Capacite->capacity, Horaires->opening hours,\n"
        "  Contact/Interlocuteur (person)->actor, SIRET->legal\n\n"
        "## Domain Glossary:\n"
        f"{_load_glossary()}\n\n"
        "## Staging tables:\n"
        f"{tables_desc}\n\n"
        "## Rules:\n"
        "- Address/GPS -> object_location_temp (NEVER object_temp)\n"
        "- Descriptions -> object_description_temp\n"
        "- Establishment contacts -> contact_channel_temp\n"
        "- Person contacts -> actor_channel_temp\n"
        "- Human names -> actor_temp\n"
        "- Metadata columns (date_creation, user, moderator) -> keep=false\n"
        "- Delimited lists -> transform=split_list\n"
        "- 'lat,lon' text -> transform=split_gps\n"
        "- ONLY use table+column names from the schema. Do NOT invent.\n"
        "- Confidence 0-1: >0.8 clear, <0.5 uncertain.\n"
        "## Global workbook context (critical for foreign keys and join tables):\n"
        f"{global_context}\n\n"
        "## STRICT USER BUSINESS RULES (priority):\n"
        f"{user_rules}\n\n"
        "Apply valid user rules with priority.\n"
        "If a user rule points to a table/column not in schema, ignore that invalid part and continue with best valid mapping.\n\n"
        "### FEW-SHOT EXAMPLES ###\n"
        f"{few_shot_block}\n"
    )

    all_verdicts: dict[str, list[ColumnVerdict]] = {}
    agent = _get_llm().with_structured_output(ColumnSelection)

    for info in sheets_info:
        sheet_name = info["sheet_name"]
        cols = info.get("columns", [])
        samples = info.get("sample_rows", [])[:5]
        entity_type = entity_map.get(sheet_name, "UNKNOWN")

        col_profiles = ""
        stats = info.get("column_stats", {})
        for col_name in cols:
            vals = [str(r.get(col_name, "")) for r in samples if r.get(col_name) not in (None, "", "nan")]
            unique_vals = list(dict.fromkeys(vals))[:4]
            col_stat = stats.get(col_name, {})
            stat_str = _format_stats_for_prompt(col_stat)
            col_profiles += f"\n  - '{col_name}'{stat_str}: samples={unique_vals}"

        user_msg = (
            f"Sheet: '{sheet_name}' (entity type: {entity_type})\n"
            f"Columns ({len(cols)}):{col_profiles}\n\n"
            "For EACH column, decide: keep (true/false), target_table, target_column, transform, confidence.\n"
            "Return results in per_sheet with key=sheet name."
        )
        try:
            result: ColumnSelection = await agent.ainvoke([("system", prompt), ("user", user_msg)])
            verdicts = result.per_sheet.get(sheet_name, [])
            if not verdicts:
                verdicts = next(iter(result.per_sheet.values()), [])
            all_verdicts[sheet_name] = verdicts
        except Exception as exc:  # noqa: BLE001
            logger.warning("Column profiling failed for sheet %s: %s", sheet_name, exc)
            all_verdicts[sheet_name] = []

    state["selected_columns"] = ColumnSelection(per_sheet=all_verdicts)
    total = sum(len(v) for v in all_verdicts.values())
    _emit(state, "discovery_profiling", f"Profilage termine: {total} colonnes analysees")
    return state


# ---------------------------------------------------------------------------
# Node 3: Relation Analysis
# ---------------------------------------------------------------------------

async def _analyse_relations_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_relations", "Analyse des relations en cours...")
    schema = state["schema_snapshot"]
    entities = state.get("identified_entities") or EntityIdentification()
    columns = state.get("selected_columns") or ColumnSelection()

    all_cols = [
        v.source_column
        for e in entities.sheets
        for v in columns.per_sheet.get(e.sheet_name, [])
        if v.keep
    ]
    sheet_name = entities.sheets[0].sheet_name if entities.sheets else "default"
    rag_relations: list[str] = []
    try:
        rag_relations = await query_similar_few_shots(
            sheet_name=sheet_name,
            column_names=all_cols[:30],
            top_k=5,
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("RAG relations few-shot query failed: %s", exc)
    rel_few_shot_block = (
        "\n".join(rag_relations)
        if rag_relations
        else (
            "- Sheet A has column 'ID Proprietaire' -> creates relation to entity type 'org'\n"
            "- Sheet 'Lien_Equipements' has 'Id_Objet' and 'Id_Equip' -> is_join_table=true, target_entity_type='amenity'\n"
            "- Column 'Langues Parlees' with value 'FR;EN;ES' -> separator=';', target_entity_type='language'"
        )
    )
    prompt = (
        "You are a data relationship analyst for the Bertel tourism CRM.\n"
        "Identify cross-sheet foreign key relationships, delimiter-separated multi-value columns, "
        "and pure junction tables.\n\n"
        "Business vocabulary:\n"
        "  Prestataire/Proprietaire/Gerant/Gestionnaire -> ORG entity\n"
        "  Comma/pipe/semicolon-separated values in a column -> One-to-Many relation\n"
        "  A sheet with only 2-3 ID columns -> junction table\n\n"
        "target_entity_type must be one of: org, amenity, payment, media, language, environment_tag, "
        "or empty string if unknown.\n\n"
        "## Domain Glossary:\n"
        f"{_load_glossary()}\n\n"
        "### FEW-SHOT EXAMPLES ###\n"
        f"{rel_few_shot_block}\n"
    )

    sheets_summary: list[str] = []
    for entity in entities.sheets:
        sheet_cols = columns.per_sheet.get(entity.sheet_name, [])
        kept_cols = [v.source_column for v in sheet_cols if v.keep]
        sheets_summary.append(
            f"Sheet '{entity.sheet_name}' (type={entity.inferred_object_type}): "
            f"kept columns={kept_cols[:20]}"
        )

    sheets_info: list[dict[str, Any]] = schema.get("sheets_summary", [])
    for info in sheets_info:
        name = info["sheet_name"]
        if not any(name == e.sheet_name for e in entities.sheets):
            sheets_summary.append(
                f"Sheet '{name}': columns={info.get('columns', [])[:15]}"
            )

    user_msg = (
        "Sheets in this workbook:\n"
        + "\n".join(sheets_summary)
        + "\n\nIdentify all relationships."
    )

    agent = _get_llm().with_structured_output(RelationAnalysis)
    try:
        result: RelationAnalysis = await agent.ainvoke([("system", prompt), ("user", user_msg)])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Relation analysis LLM failed: %s", exc)
        result = RelationAnalysis(relations=[])

    state["analysed_relations"] = result
    _emit(state, "discovery_relations", f"Relations detectees: {len(result.relations)}")
    return state


# ---------------------------------------------------------------------------
# Node 4: Validation (pure Python, no LLM)
# ---------------------------------------------------------------------------

async def _validate_plan_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_validation", "Validation du mapping en cours...")
    columns = state.get("selected_columns") or ColumnSelection()
    relations = state.get("analysed_relations") or RelationAnalysis(relations=[])
    source_format = state["source_format"]
    
    state["validation_errors"] = []
    current_errors: list[str] = []

    per_sheet_plans: dict[str, MappingPlan] = {}
    for sheet_name, verdicts in columns.per_sheet.items():
        targets: list[MappingTarget] = []
        confidences: list[float] = []
        for v in verdicts:
            if not v.keep:
                continue
            ok, err_msg = validate_mapping_target(v.target_table, v.target_column, v.transform)
            if not ok:
                current_errors.append(f"Sheet '{sheet_name}' column '{v.source_column}': {err_msg}")
                continue
            targets.append(MappingTarget(
                table=v.target_table,
                column=v.target_column,
                transform=v.transform,
                source_key=v.source_column,
                source_sheet=sheet_name,
            ))
            confidences.append(v.confidence)
        conf = sum(confidences) / len(confidences) if confidences else 0.0
        per_sheet_plans[sheet_name] = MappingPlan(
            source_format=source_format,
            confidence=conf,
            targets=targets,
        )

    state["per_sheet_confidence"] = {
        sheet_name: plan.confidence
        for sheet_name, plan in per_sheet_plans.items()
    }

    seen_rel_keys: set[tuple[str, str, str, str, str, bool]] = set()
    for rel in relations.relations:
        from_sheet = str(rel.from_sheet or "").strip()
        from_column = str(rel.from_column or "").strip()
        if not from_sheet or not from_column:
            continue
        target_entity_type = str(rel.target_entity_type or "").strip().lower()
        rel_key = (
            from_sheet,
            from_column,
            str(rel.to_sheet or "").strip(),
            str(rel.separator or ","),
            target_entity_type,
            bool(rel.is_join_table),
        )
        if rel_key in seen_rel_keys:
            continue
        seen_rel_keys.add(rel_key)
        relation_target = RelationTarget(
            from_sheet=from_sheet,
            from_column=from_column,
            to_sheet=str(rel.to_sheet or "").strip(),
            separator=str(rel.separator or ","),
            target_entity_type=target_entity_type,
            target_staging_table=ENTITY_TYPE_TO_STAGING.get(target_entity_type, ""),
            is_join_table=bool(rel.is_join_table),
            confidence=float(rel.confidence),
            rationale="AI relation hypothesis validated for mapping output.",
        )
        if from_sheet not in per_sheet_plans:
            per_sheet_plans[from_sheet] = MappingPlan(
                source_format=source_format,
                confidence=0.0,
                targets=[],
            )
        per_sheet_plans[from_sheet].relation_targets.append(relation_target)

    if len(per_sheet_plans) == 1:
        plan = next(iter(per_sheet_plans.values()))
        state["mapping_plan"] = plan
    else:
        all_confs = [p.confidence for p in per_sheet_plans.values()]
        state["mapping_plan"] = MappingPlan(
            source_format=source_format,
            confidence=sum(all_confs) / len(all_confs) if all_confs else 0.0,
            targets=[t for p in per_sheet_plans.values() for t in p.targets],
            relation_targets=[r for p in per_sheet_plans.values() for r in p.relation_targets],
        )

    total_targets = len(state["mapping_plan"].targets)
    total_relations = len(state["mapping_plan"].relation_targets)
    
    if current_errors:
        state["validation_errors"] = current_errors
        state["reflection_count"] = state.get("reflection_count", 0) + 1
        _emit(state, "discovery_validation", f"Validation a echoue ({len(current_errors)} erreurs). Tentative de correction...")
    else:
        _emit(state, "discovery_validation", f"Validation terminee: {total_targets} mappings et {total_relations} relations valides")
    return state


# ---------------------------------------------------------------------------
# Node 5: Semantic Critic
# ---------------------------------------------------------------------------

async def _semantic_critic_node(state: MappingState) -> MappingState:
    """Review the proposed MappingPlan for semantic errors (e.g. data type mismatches)."""
    _emit(state, "discovery_critic", "Verification semantique du mapping...")
    plan = state["mapping_plan"]
    schema = state["schema_snapshot"]
    sheets_info: list[dict[str, Any]] = schema.get("sheets_summary", [])

    if not plan.targets:
        return state

    targets_desc = "\n".join(
        f"- '{t.source_key}' -> {t.table}.{t.column} (transform={t.transform})"
        for t in plan.targets[:30]
    )
    sample_summary: list[str] = []
    for info in sheets_info:
        cols = info.get("columns", [])
        samples = info.get("sample_rows", [])[:3]
        stats = info.get("column_stats", {})
        for col in cols[:15]:
            s = stats.get(col, {})
            sample_vals = [str(r.get(col, ""))[:50] for r in samples if col in r][:3]
            sample_summary.append(f"  '{col}'{_format_stats_for_prompt(s)}: samples={sample_vals}")

    prompt = (
        "You are a semantic validator for data mapping in the Bertel tourism CRM.\n"
        "Review the proposed column mappings against the source data samples and stats.\n"
        "Flag ONLY clear semantic errors, e.g.:\n"
        "- Mapping a numeric column to 'name' (text expected)\n"
        "- Mapping 'Equipements' (list of amenities) to object_temp instead of object_amenity_temp\n"
        "- Using identity for GPS when values look like '45.1, -1.2' (should use split_gps)\n"
        "- Mapping an ID column to 'description' or 'email'\n"
        "Do NOT flag: correct mappings, uncertain cases, or minor naming variations.\n"
        "Return an empty issues list if the plan looks semantically sound.\n"
    )
    user_msg = (
        f"Proposed mappings:\n{targets_desc}\n\n"
        f"Source column stats & samples:\n" + "\n".join(sample_summary)
    )

    try:
        agent = _get_llm().with_structured_output(SemanticReview)
        result: SemanticReview = await agent.ainvoke([("system", prompt), ("user", user_msg)])
        if result.issues:
            state["validation_errors"] = state.get("validation_errors", []) + result.issues
            state["reflection_count"] = state.get("reflection_count", 0) + 1
            _emit(state, "discovery_critic", f"Erreurs semantiques detectees: {len(result.issues)}")
        else:
            _emit(state, "discovery_critic", "Verification semantique OK")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Semantic critic LLM failed: %s", exc)

    return state


# ---------------------------------------------------------------------------
# Node 6: Confidence Check
# ---------------------------------------------------------------------------

async def _check_confidence_node(state: MappingState) -> MappingState:
    """Flag batch for human review if global or per-sheet confidence is below threshold."""
    plan = state["mapping_plan"]
    threshold = getattr(settings, "min_confidence_threshold", 0.0)
    sheet_threshold = getattr(settings, "min_sheet_confidence_threshold", threshold)
    avg_conf = plan.confidence
    per_sheet_confidence = state.get("per_sheet_confidence", {})
    low_confidence_sheets = {
        sheet_name: confidence
        for sheet_name, confidence in per_sheet_confidence.items()
        if sheet_threshold > 0 and confidence < sheet_threshold
    }

    review_reasons: list[str] = []
    if avg_conf < threshold and threshold > 0:
        review_reasons.append(f"overall_confidence:{avg_conf:.2f}<{threshold:.2f}")
    if low_confidence_sheets:
        review_reasons.extend(
            f"sheet_confidence:{sheet_name}:{confidence:.2f}<{sheet_threshold:.2f}"
            for sheet_name, confidence in sorted(low_confidence_sheets.items())
        )

    state["low_confidence_sheets"] = low_confidence_sheets
    state["review_reasons"] = review_reasons
    state["needs_human_review"] = bool(review_reasons)

    if review_reasons:
        existing_assumptions = list(plan.assumptions)
        for reason in review_reasons:
            if reason not in existing_assumptions:
                existing_assumptions.append(reason)
        plan.assumptions = existing_assumptions
        _emit(
            state,
            "discovery_confidence",
            "NEEDS_HUMAN_REVIEW: " + "; ".join(review_reasons),
        )
    else:
        _emit(state, "discovery_confidence", f"Confidence OK: overall={avg_conf:.2f}")

    return state

# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def _route_post_validation(state: MappingState) -> str:
    errors = state.get("validation_errors", [])
    count = state.get("reflection_count", 0)
    if errors and count < 3:
        return "profile_columns"
    return "semantic_critic"


def _route_post_semantic_critic(state: MappingState) -> str:
    errors = state.get("validation_errors", [])
    count = state.get("reflection_count", 0)
    if errors and count < 3:
        return "profile_columns"
    return "check_confidence"


def build_mapping_graph():
    graph = StateGraph(MappingState)
    graph.add_node("discover_entities", _discover_entities_node)
    graph.add_node("profile_columns", _profile_columns_node)
    graph.add_node("analyse_relations", _analyse_relations_node)
    graph.add_node("validate_plan", _validate_plan_node)
    graph.add_node("semantic_critic", _semantic_critic_node)
    graph.add_node("check_confidence", _check_confidence_node)
    graph.add_edge(START, "discover_entities")
    graph.add_edge("discover_entities", "profile_columns")
    graph.add_edge("profile_columns", "analyse_relations")
    graph.add_edge("analyse_relations", "validate_plan")
    graph.add_conditional_edges("validate_plan", _route_post_validation, {"profile_columns": "profile_columns", "semantic_critic": "semantic_critic"})
    graph.add_conditional_edges("semantic_critic", _route_post_semantic_critic, {"profile_columns": "profile_columns", "check_confidence": "check_confidence"})
    graph.add_edge("check_confidence", END)
    return graph.compile()


# ---------------------------------------------------------------------------
# Public API (signature unchanged for callers)
# ---------------------------------------------------------------------------

async def generate_mapping_plan(
    *,
    schema_snapshot: dict[str, Any],
    sample_rows: list[dict[str, Any]],
    source_format: str,
    workbook_payload: WorkbookPayload | None = None,
    custom_rules: str | None = None,
    event_callback: Callable[[str, str], None] | None = None,
) -> tuple[MappingPlan | MultiSheetMappingPlan, RelationAnalysis | None, bool]:
    sheets_summary: list[dict[str, Any]] = []
    if workbook_payload and workbook_payload.sheets:
        for sheet in workbook_payload.sheets:
            sheets_summary.append({
                "sheet_name": sheet.sheet_name,
                "columns": sheet.incoming_columns,
                "sample_rows": sheet.sample_rows[:5],
                "column_stats": sheet.column_stats,
            })

    enriched_snapshot = {
        **schema_snapshot,
        "sheets_summary": sheets_summary,
    }

    initial_state: MappingState = {
        "schema_snapshot": enriched_snapshot,
        "sample_rows": sample_rows,
        "source_format": source_format,
        "identified_entities": None,
        "selected_columns": None,
        "analysed_relations": None,
        "mapping_plan": MappingPlan(source_format=source_format, confidence=0.0, targets=[]),
        "custom_rules": custom_rules,
        "validation_errors": [],
        "reflection_count": 0,
        "emit_event": event_callback,
        "needs_human_review": False,
        "per_sheet_confidence": {},
        "low_confidence_sheets": {},
        "review_reasons": [],
    }

    compiled = build_mapping_graph()
    final_state = await compiled.ainvoke(initial_state)
    plan = final_state["mapping_plan"]
    analysed_relations = final_state.get("analysed_relations")
    needs_human_review = final_state.get("needs_human_review", False)

    if workbook_payload and workbook_payload.sheets and len(workbook_payload.sheets) > 1:
        columns_result = final_state.get("selected_columns") or ColumnSelection()
        per_sheet_confidence = final_state.get("per_sheet_confidence", {})
        low_confidence_sheets = final_state.get("low_confidence_sheets", {})
        per_sheet: dict[str, MappingPlan] = {}
        for sheet in workbook_payload.sheets:
            sheet_targets = [t for t in plan.targets if t.source_sheet == sheet.sheet_name]
            confs = [
                v.confidence
                for v in columns_result.per_sheet.get(sheet.sheet_name, [])
                if v.keep
            ]
            assumptions = []
            if sheet.sheet_name in low_confidence_sheets:
                assumptions.append(f"sheet_confidence:{sheet.sheet_name}:{low_confidence_sheets[sheet.sheet_name]:.2f}")
            per_sheet[sheet.sheet_name] = MappingPlan(
                source_format=source_format,
                confidence=per_sheet_confidence.get(sheet.sheet_name, sum(confs) / len(confs) if confs else 0.0),
                targets=sheet_targets,
                relation_targets=[r for r in plan.relation_targets if r.from_sheet == sheet.sheet_name],
                assumptions=assumptions,
            )
        return (
            MultiSheetMappingPlan(
                source_format=source_format,
                confidence=plan.confidence,
                per_sheet=per_sheet,
                assumptions=list(plan.assumptions),
            ),
            analysed_relations,
            needs_human_review,
        )

    return plan, analysed_relations, needs_human_review


async def run_cleaner_batch(unstructured_values: list[str]) -> CleanerBatchOutput:
    llm = ChatOpenAI(model=settings.llm_model, temperature=0.0, api_key=settings.openai_api_key)
    cleaner = llm.with_structured_output(CleanerBatchOutput)
    few_shot = (
        "Normalize tourism opening-hours free text into structured JSON.\n"
        "If unknown, keep best effort and lower quality_score.\n"
    )
    result = await cleaner.ainvoke(
        [
            ("system", few_shot),
            ("user", f"Normalize these values: {unstructured_values}"),
        ]
    )
    return result






