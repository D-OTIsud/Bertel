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
    prompt = (
        "You are a data-mapping architect for a strict tourism CRM schema.\n"
        "Generate a mapping plan from sample input to target schema.\n"
        "Use stable transformations and avoid hallucinating columns."
    )
    plan = agent.invoke(
        [
            ("system", prompt),
            (
                "user",
                f"Source format: {state['source_format']}\n"
                f"Schema snapshot: {state['schema_snapshot']}\n"
                f"Sample rows: {state['sample_rows']}\n"
                "Return a precise mapping.",
            ),
        ]
    )
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
