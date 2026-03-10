from __future__ import annotations

import logging
from typing import Any, Callable, TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

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
    WorkbookPayload,
)

try:
    from core.target_schema import TARGET_SCHEMA_RULES, KNOWN_OBJECT_TYPES, validate_mapping_target
except ModuleNotFoundError:
    from universal_ai_ingestor.core.target_schema import (  # type: ignore
        TARGET_SCHEMA_RULES,
        KNOWN_OBJECT_TYPES,
        validate_mapping_target,
    )

logger = logging.getLogger("ingestor.ai_graph")


class MappingState(TypedDict):
    schema_snapshot: dict[str, Any]
    sample_rows: list[dict[str, Any]]
    source_format: str
    identified_entities: EntityIdentification | None
    selected_columns: ColumnSelection | None
    analysed_relations: RelationAnalysis | None
    mapping_plan: MappingPlan
    emit_event: Callable[[str, str], None] | None


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(model=settings.llm_model, temperature=0.0, api_key=settings.openai_api_key)


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


# ---------------------------------------------------------------------------
# Node 1: Entity Discovery
# ---------------------------------------------------------------------------

def _discover_entities_node(state: MappingState) -> MappingState:
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
        "If a sheet contains media/photo URLs, mark it as 'MEDIA'.\n"
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
        result: EntityIdentification = agent.invoke([("system", prompt), ("user", user_msg)])
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

def _profile_columns_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_profiling", "Profilage des colonnes en cours...")
    schema = state["schema_snapshot"]
    entities = state.get("identified_entities") or EntityIdentification()
    entity_map = {s.sheet_name: s.inferred_object_type for s in entities.sheets}

    tables_desc = _tables_summary()
    prompt = (
        "You are a data mapping expert for the Bertel tourism CRM.\n"
        "Source data is in FRENCH. Key translations:\n"
        "  Nom->name, Adresse->address1, Ville->city, CP->postcode,\n"
        "  Telephone->phone, Courriel->email, Site web->website,\n"
        "  Latitude->latitude, Type->object_type, Identifiant->external_id,\n"
        "  Etoiles->classification, Equipements->amenities, Description->description,\n"
        "  Tarif->price, Capacite->capacity, Horaires->opening hours,\n"
        "  Contact/Interlocuteur (person)->actor, SIRET->legal\n\n"
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
    )

    sheets_info: list[dict[str, Any]] = schema.get("sheets_summary", [])
    if not sheets_info:
        incoming = schema.get("incoming_columns", [])
        sheet_name = schema.get("sheet_name", "default")
        samples = state["sample_rows"][:5]
        sheets_info = [{"sheet_name": sheet_name, "columns": incoming, "sample_rows": samples}]

    all_verdicts: dict[str, list[ColumnVerdict]] = {}
    agent = _get_llm().with_structured_output(ColumnSelection)

    for info in sheets_info:
        sheet_name = info["sheet_name"]
        cols = info.get("columns", [])
        samples = info.get("sample_rows", [])[:5]
        entity_type = entity_map.get(sheet_name, "UNKNOWN")

        col_profiles = ""
        for col_name in cols:
            vals = [str(r.get(col_name, "")) for r in samples if r.get(col_name) not in (None, "", "nan")]
            unique_vals = list(dict.fromkeys(vals))[:4]
            col_profiles += f"\n  - '{col_name}': samples={unique_vals}"

        user_msg = (
            f"Sheet: '{sheet_name}' (entity type: {entity_type})\n"
            f"Columns ({len(cols)}):{col_profiles}\n\n"
            "For EACH column, decide: keep (true/false), target_table, target_column, transform, confidence.\n"
            "Return results in per_sheet with key=sheet name."
        )
        try:
            result: ColumnSelection = agent.invoke([("system", prompt), ("user", user_msg)])
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

def _analyse_relations_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_relations", "Analyse des relations en cours...")
    schema = state["schema_snapshot"]
    entities = state.get("identified_entities") or EntityIdentification()
    columns = state.get("selected_columns") or ColumnSelection()

    prompt = (
        "You are a data relationship analyst for the Bertel tourism CRM.\n"
        "Identify cross-sheet foreign key relationships, delimiter-separated multi-value columns, "
        "and pure junction tables.\n\n"
        "Business vocabulary:\n"
        "  Prestataire/Proprietaire/Gerant/Gestionnaire -> ORG entity\n"
        "  Comma/pipe/semicolon-separated values in a column -> One-to-Many relation\n"
        "  A sheet with only 2-3 ID columns -> junction table\n\n"
        "target_entity_type must be one of: org, amenity, payment, media, language, environment_tag, "
        "or empty string if unknown.\n"
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
        result: RelationAnalysis = agent.invoke([("system", prompt), ("user", user_msg)])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Relation analysis LLM failed: %s", exc)
        result = RelationAnalysis(relations=[])

    state["analysed_relations"] = result
    _emit(state, "discovery_relations", f"Relations detectees: {len(result.relations)}")
    return state


# ---------------------------------------------------------------------------
# Node 4: Validation (pure Python, no LLM)
# ---------------------------------------------------------------------------

def _validate_plan_node(state: MappingState) -> MappingState:
    _emit(state, "discovery_validation", "Validation du mapping en cours...")
    columns = state.get("selected_columns") or ColumnSelection()
    source_format = state["source_format"]

    per_sheet_plans: dict[str, MappingPlan] = {}
    for sheet_name, verdicts in columns.per_sheet.items():
        targets: list[MappingTarget] = []
        confidences: list[float] = []
        for v in verdicts:
            if not v.keep:
                continue
            ok, _ = validate_mapping_target(v.target_table, v.target_column, v.transform)
            if not ok:
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

    if len(per_sheet_plans) == 1:
        plan = next(iter(per_sheet_plans.values()))
        state["mapping_plan"] = plan
    else:
        all_confs = [p.confidence for p in per_sheet_plans.values()]
        state["mapping_plan"] = MappingPlan(
            source_format=source_format,
            confidence=sum(all_confs) / len(all_confs) if all_confs else 0.0,
            targets=[t for p in per_sheet_plans.values() for t in p.targets],
        )

    total_targets = len(state["mapping_plan"].targets)
    _emit(state, "discovery_validation", f"Validation terminee: {total_targets} mappings valides")
    return state


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

def build_mapping_graph():
    graph = StateGraph(MappingState)
    graph.add_node("discover_entities", _discover_entities_node)
    graph.add_node("profile_columns", _profile_columns_node)
    graph.add_node("analyse_relations", _analyse_relations_node)
    graph.add_node("validate_plan", _validate_plan_node)
    graph.add_edge(START, "discover_entities")
    graph.add_edge("discover_entities", "profile_columns")
    graph.add_edge("profile_columns", "analyse_relations")
    graph.add_edge("analyse_relations", "validate_plan")
    graph.add_edge("validate_plan", END)
    return graph.compile()


# ---------------------------------------------------------------------------
# Public API (signature unchanged for callers)
# ---------------------------------------------------------------------------

def generate_mapping_plan(
    *,
    schema_snapshot: dict[str, Any],
    sample_rows: list[dict[str, Any]],
    source_format: str,
    workbook_payload: WorkbookPayload | None = None,
    event_callback: Callable[[str, str], None] | None = None,
) -> MappingPlan | MultiSheetMappingPlan:
    sheets_summary: list[dict[str, Any]] = []
    if workbook_payload and workbook_payload.sheets:
        for sheet in workbook_payload.sheets:
            sheets_summary.append({
                "sheet_name": sheet.sheet_name,
                "columns": sheet.incoming_columns,
                "sample_rows": sheet.sample_rows[:5],
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
        "emit_event": event_callback,
    }

    compiled = build_mapping_graph()
    final_state = compiled.invoke(initial_state)
    plan = final_state["mapping_plan"]

    if workbook_payload and workbook_payload.sheets and len(workbook_payload.sheets) > 1:
        columns_result = final_state.get("selected_columns") or ColumnSelection()
        per_sheet: dict[str, MappingPlan] = {}
        for sheet in workbook_payload.sheets:
            sheet_targets = [t for t in plan.targets if t.source_sheet == sheet.sheet_name]
            confs = [
                v.confidence
                for v in columns_result.per_sheet.get(sheet.sheet_name, [])
                if v.keep
            ]
            per_sheet[sheet.sheet_name] = MappingPlan(
                source_format=source_format,
                confidence=sum(confs) / len(confs) if confs else 0.0,
                targets=sheet_targets,
            )
        return MultiSheetMappingPlan(
            source_format=source_format,
            confidence=plan.confidence,
            per_sheet=per_sheet,
        )

    return plan


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
