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

    tables_desc = ""
    for t in schema.get("target_tables", []):
        cols = ", ".join(
            c["column"] + (" (REQUIRED)" if c.get("required") else "")
            for c in t.get("columns", [])
        )
        tables_desc += (
            f"\n### {t['table']}  (→ {t.get('production_table', '?')})\n"
            f"  {t.get('description', '')}\n"
            f"  Columns: [{cols}]\n"
            f"  Transforms: {t.get('allowed_transforms', [])}\n"
        )

    hints = "\n".join(f"  - {h}" for h in schema.get("relationship_hints", []))
    etl_order = "\n".join(f"  {s}" for s in schema.get("etl_execution_order", []))
    overview = schema.get("data_model_overview", "")
    obj_types = schema.get("known_object_types", {})
    obj_types_str = ", ".join(f"{k}={v}" for k, v in obj_types.items()) if obj_types else ""

    prompt = (
        "You are an expert data-mapping architect for the Bertel tourism CRM.\n\n"
        "## Data Model\n"
        f"{overview}\n\n"
        f"Object type codes: {obj_types_str}\n\n"
        "## ETL Execution Order\n"
        f"{etl_order}\n\n"
        "## 24 Staging Tables (exhaustive)\n"
        f"{tables_desc}\n"
        "## Relationship Rules\n"
        f"{hints}\n\n"
        "## Mapping Instructions\n"
        "1. Source data is often in FRENCH. Key translations:\n"
        "   Nom -> name | Adresse/Rue -> address1 | Ville -> city | CP -> postcode\n"
        "   Téléphone -> phone | Courriel -> email | Site web -> website\n"
        "   Latitude -> latitude | Type -> object_type | Identifiant -> external_id\n"
        "   Étoiles -> classification | Équipements -> amenities | Description -> description\n"
        "   Tarif/Prix -> price | Capacité -> capacity | Horaires -> opening hours\n"
        "   Contact/Interlocuteur (person) -> actor | SIRET/Licence -> legal\n\n"
        "2. Each source column -> EXACTLY ONE staging table.column.\n"
        "3. Address fields -> object_location_temp (NEVER object_temp).\n"
        "4. Descriptions -> object_description_temp (NEVER object_temp).\n"
        "5. Establishment contacts -> contact_channel_temp. Person contacts -> actor_channel_temp.\n"
        "6. Human names (director, contact person) -> actor_temp.\n"
        "7. Source system IDs -> object_external_id_temp. Source name -> object_origin_temp.\n"
        "8. SIRET/license/legal -> object_legal_temp.\n"
        "9. Pricing -> object_price_temp. Capacity -> object_capacity_temp.\n"
        "10. Opening hours -> opening_period_temp.\n"
        "11. Event dates -> object_fma_temp. Itinerary -> object_iti_temp. Rooms -> object_room_type_temp.\n"
        "12. Delimited lists (commas/pipes) -> use split_list transform.\n"
        "13. 'lat,lon' as single text -> use split_gps transform.\n"
        "14. Metadata (date_creation, user, moderator) -> OMIT.\n"
        "15. ONLY use table+column names from the schema above. Do NOT invent.\n"
        "16. Confidence 0.0-1.0: >0.8 clear match, <0.5 uncertain.\n"
    )

    incoming = schema.get("incoming_columns", [])
    sheet_name = schema.get("sheet_name", "unknown")
    samples = state["sample_rows"][:10]

    col_profiles = ""
    if samples:
        for col_name in incoming:
            vals = [str(row.get(col_name, "")) for row in samples if row.get(col_name) not in (None, "", "nan")]
            unique_vals = list(dict.fromkeys(vals))[:5]
            col_profiles += f"\n  - '{col_name}': {len(vals)}/{len(samples)} non-null, samples: {unique_vals}"

    user_msg = (
        f"Source format: {state['source_format']}\n"
        f"Sheet: '{sheet_name}'\n"
        f"Columns ({len(incoming)}): {incoming}\n\n"
        f"Column profiles (from {len(samples)} sample rows):{col_profiles}\n\n"
        f"Full sample rows:\n{samples[:3]}\n\n"
        "For EACH source column, return the target staging table and column. "
        "Omit metadata columns (date, user, moderator). "
        "Pay close attention to the sample values to determine the correct target."
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
