from __future__ import annotations

from typing import Any, TypedDict

from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from core.config import settings
from core.schemas import CleanerBatchOutput, MappingPlan, MultiSheetMappingPlan, WorkbookPayload


class MappingState(TypedDict):
    schema_snapshot: dict[str, Any]
    sample_rows: list[dict[str, Any]]
    source_format: str
    mapping_plan: MappingPlan


def _build_mapping_agent() -> Any:
    llm = ChatOpenAI(model=settings.llm_model, temperature=0.0, api_key=settings.openai_api_key)
    return llm.with_structured_output(MappingPlan)


def _mapping_node(state: MappingState) -> MappingState:
    agent = _build_mapping_agent()
    schema = state["schema_snapshot"]

    # Build structured table descriptions for the prompt
    tables_desc = ""
    for t in schema.get("target_tables", []):
        cols = ", ".join(
            c["column"] + (" (REQUIRED)" if c.get("required") else "")
            for c in t.get("columns", [])
        )
        tables_desc += (
            f"\n### {t['table']}\n"
            f"  {t.get('description', '')}\n"
            f"  Columns: [{cols}]\n"
            f"  Transforms: {t.get('allowed_transforms', [])}\n"
        )

    hints = "\n".join(f"  - {h}" for h in schema.get("relationship_hints", []))
    model_overview = schema.get("data_model_overview", "")
    obj_types = schema.get("known_object_types", {})
    obj_types_str = ", ".join(f"{k}={v}" for k, v in obj_types.items()) if obj_types else ""

    prompt = (
        "You are an expert data-mapping architect for the Bertel tourism CRM.\n\n"
        "## Data Model\n"
        f"{model_overview}\n\n"
        f"Known object_type codes: {obj_types_str}\n\n"
        "## Available Staging Tables\n"
        f"{tables_desc}\n"
        "## Relationship Rules\n"
        f"{hints}\n\n"
        "## Mapping Instructions\n"
        "1. Source data is often in FRENCH. Common translations:\n"
        "   Nom/Raison sociale -> name | Adresse/Rue -> address1 | Ville/Commune -> city\n"
        "   Code postal/CP -> postcode | Téléphone/Tel -> phone | Courriel/Mail -> email\n"
        "   Site web/URL -> website | Latitude/Lat -> latitude | Longitude/Lon -> longitude\n"
        "   Type/Catégorie -> object_type | Identifiant/Référence -> external_id\n"
        "   Étoiles/Classement -> classification | Équipements -> amenities\n"
        "   Description/Présentation -> descriptive text (no staging column)\n\n"
        "2. Each source column maps to EXACTLY ONE target table.column.\n"
        "3. Address fields (street, city, postcode) -> object_location_temp (NOT object_temp).\n"
        "4. Establishment contacts (email, phone, website, social) -> contact_channel_temp.\n"
        "5. If source has 'lat,lon' as single text -> use split_gps transform.\n"
        "6. If source has delimited lists (commas/pipes/semicolons) -> use split_list transform.\n"
        "7. Metadata columns (date_creation, user, moderator, formulaire, row index) -> OMIT (do not map).\n"
        "8. Descriptive text (description, presentation, opening hours text) -> OMIT (stored in raw_source_data).\n"
        "9. Actor/human data (contact person name, director, guide) -> OMIT (no staging table).\n"
        "10. external_id is CRITICAL: always map source IDs (identifiant, ref, SIRET, code) to external_id.\n"
        "11. ONLY use table and column names from the schema above. Do NOT invent columns.\n"
        "12. Set confidence 0.0-1.0 reflecting certainty. Use >0.8 for clear matches, <0.5 for uncertain.\n"
    )

    incoming = schema.get("incoming_columns", [])
    sheet_name = schema.get("sheet_name", "unknown")
    samples = state["sample_rows"][:5]

    user_msg = (
        f"Source format: {state['source_format']}\n"
        f"Sheet: '{sheet_name}'\n"
        f"Columns: {incoming}\n\n"
        f"Sample rows:\n{samples}\n\n"
        "Map each source column to the best target table.column. "
        "Omit columns that should be skipped (metadata, descriptions, actor data)."
    )

    plan = agent.invoke([("system", prompt), ("user", user_msg)])
    state["mapping_plan"] = plan
    return state


def build_mapping_graph():
    graph = StateGraph(MappingState)
    graph.add_node("map", _mapping_node)
    graph.add_edge(START, "map")
    graph.add_edge("map", END)
    return graph.compile()


def generate_mapping_plan(
    *,
    schema_snapshot: dict[str, Any],
    sample_rows: list[dict[str, Any]],
    source_format: str,
    workbook_payload: WorkbookPayload | None = None,
) -> MappingPlan | MultiSheetMappingPlan:
    # Keep single-sheet behavior unchanged.
    if workbook_payload is None or not workbook_payload.sheets:
        state: MappingState = {
            "schema_snapshot": schema_snapshot,
            "sample_rows": sample_rows,
            "source_format": source_format,
            "mapping_plan": MappingPlan(source_format=source_format, confidence=0.0, targets=[]),
        }
        return _mapping_node(state)["mapping_plan"]

    per_sheet: dict[str, MappingPlan] = {}
    confidence_scores: list[float] = []
    assumptions: list[str] = []

    for sheet in workbook_payload.sheets:
        try:
            sheet_state: MappingState = {
                "schema_snapshot": {
                    **schema_snapshot,
                    "incoming_columns": sheet.incoming_columns,
                    "sheet_name": sheet.sheet_name,
                },
                "sample_rows": sheet.sample_rows,
                "source_format": source_format,
                "mapping_plan": MappingPlan(source_format=source_format, confidence=0.0, targets=[]),
            }
            plan = _mapping_node(sheet_state)["mapping_plan"]
        except Exception:  # noqa: BLE001
            # Deterministic no-LLM fallback for one failing sheet must not fail the full workbook.
            plan = MappingPlan(
                source_format=source_format,
                confidence=0.0,
                targets=[],
                assumptions=[f"llm_fallback_for_sheet:{sheet.sheet_name}"],
            )
        per_sheet[sheet.sheet_name] = plan
        confidence_scores.append(plan.confidence)
        assumptions.extend(plan.assumptions)

    aggregate_conf = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
    return MultiSheetMappingPlan(
        source_format=source_format,
        confidence=aggregate_conf,
        per_sheet=per_sheet,
        assumptions=assumptions,
    )


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
