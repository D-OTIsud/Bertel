"""Unit tests for Semantic Critic node and confidence routing."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from universal_ai_ingestor.core.ai_graph import (
    SemanticReview,
    _check_confidence_node,
    _profile_columns_node,
    _semantic_critic_node,
    build_mapping_graph,
)
from universal_ai_ingestor.core.schemas import (
    ColumnSelection,
    EntityIdentification,
    MappingPlan,
    MappingTarget,
    RelationAnalysis,
    SheetEntity,
)


@pytest.fixture
def base_state():
    """Minimal state for critic/confidence nodes."""
    return {
        "schema_snapshot": {
            "sheets_summary": [
                {"sheet_name": "Hotels", "columns": ["Nom", "GPS"], "sample_rows": [], "column_stats": {}}
            ]
        },
        "sample_rows": [],
        "source_format": "xlsx",
        "identified_entities": None,
        "selected_columns": ColumnSelection(per_sheet={}),
        "analysed_relations": RelationAnalysis(relations=[]),
        "mapping_plan": MappingPlan(
            source_format="xlsx",
            confidence=0.7,
            targets=[
                MappingTarget(
                    table="object_temp",
                    column="name",
                    transform="identity",
                    source_key="Nom",
                    source_sheet="Hotels",
                ),
            ],
        ),
        "custom_rules": None,
        "validation_errors": [],
        "reflection_count": 0,
        "emit_event": None,
        "needs_human_review": False,
        "per_sheet_confidence": {},
        "low_confidence_sheets": {},
        "review_reasons": [],
    }


@pytest.mark.asyncio
async def test_semantic_critic_appends_errors_when_llm_finds_issues(base_state) -> None:
    """When LLM returns issues, they are appended to validation_errors."""
    mock_review = SemanticReview(issues=["Column 'GPS' should use split_gps, not identity"])

    with patch("universal_ai_ingestor.core.ai_graph._get_llm") as mock_llm:
        mock_chain = MagicMock()
        mock_agent = MagicMock()
        mock_agent.ainvoke = AsyncMock(return_value=mock_review)
        mock_chain.with_structured_output.return_value = mock_agent
        mock_llm.return_value = mock_chain

        result = await _semantic_critic_node(base_state)
        assert "validation_errors" in result
        assert len(result["validation_errors"]) >= 1
        assert "split_gps" in result["validation_errors"][0] or "GPS" in result["validation_errors"][0]


@pytest.mark.asyncio
async def test_semantic_critic_no_errors_when_llm_approves(base_state) -> None:
    """When LLM returns empty issues, validation_errors stays empty."""
    mock_review = SemanticReview(issues=[])

    with patch("universal_ai_ingestor.core.ai_graph._get_llm") as mock_llm:
        mock_chain = MagicMock()
        mock_agent = MagicMock()
        mock_agent.ainvoke = AsyncMock(return_value=mock_review)
        mock_chain.with_structured_output.return_value = mock_agent
        mock_llm.return_value = mock_chain

        result = await _semantic_critic_node(base_state)
        assert result.get("validation_errors", []) == []
@pytest.mark.asyncio
async def test_semantic_prompts_include_structured_schema_guidance(base_state) -> None:
    captured: dict[str, str] = {}
    base_state["identified_entities"] = EntityIdentification(
        sheets=[SheetEntity(sheet_name="Hotels", inferred_object_type="HOT", confidence=0.95, rationale="hotel sheet")]
    )
    base_state["schema_snapshot"] = {
        "data_model_overview": "Bertel objects are central and satellites carry specialized data.",
        "required_columns_by_table": {"object_amenity_temp": ["amenity_code"]},
        "relationship_hints": ["Delimited amenities -> object_amenity_temp."],
        "target_tables": [
            {
                "table": "object_amenity_temp",
                "entity": "amenity",
                "production_table": "object_amenity",
                "description": "Amenity link table.",
                "allowed_transforms": ["identity", "lowercase", "split_list"],
                "columns": [
                    {
                        "column": "amenity_code",
                        "aliases": ["amenity_code", "equipements", "amenities"],
                        "required": True,
                        "default_transform": "identity",
                    }
                ],
            },
            {
                "table": "object_temp",
                "entity": "object",
                "production_table": "object",
                "description": "Main object row.",
                "allowed_transforms": ["identity", "lowercase"],
                "columns": [
                    {
                        "column": "name",
                        "aliases": ["name", "nom"],
                        "required": True,
                        "default_transform": "identity",
                    }
                ],
            },
        ],
        "sheets_summary": [
            {
                "sheet_name": "Hotels",
                "columns": ["Equipements"],
                "sample_rows": [{"Equipements": "Wi-Fi;Parking"}],
                "column_stats": {
                    "Equipements": {
                        "semantic_type_hint": "amenity",
                        "multi_value_ratio": 1.0,
                        "dominant_delimiter": ";",
                    }
                },
            }
        ],
    }

    async def _capture(messages):
        captured["system"] = messages[0][1]
        return ColumnSelection(per_sheet={"Hotels": []})

    with patch("universal_ai_ingestor.core.ai_graph._get_llm") as mock_llm:
        mock_chain = MagicMock()
        mock_agent = MagicMock()
        mock_agent.ainvoke = AsyncMock(side_effect=_capture)
        mock_chain.with_structured_output.return_value = mock_agent
        mock_llm.return_value = mock_chain

        await _profile_columns_node(base_state)

    prompt = captured["system"]
    assert "Focused schema cross-check" in prompt
    assert "required_columns: amenity_code" in prompt
    assert "allowed_transforms: identity, lowercase, split_list" in prompt
    assert "Delimited amenities -> object_amenity_temp." in prompt
    assert "aliases=equipements, amenities" in prompt


@pytest.mark.asyncio
async def test_semantic_critic_prompt_includes_schema_cross_checks(base_state) -> None:
    captured: dict[str, str] = {}
    base_state["mapping_plan"] = MappingPlan(
        source_format="xlsx",
        confidence=0.8,
        targets=[
            MappingTarget(
                table="object_amenity_temp",
                column="amenity_code",
                transform="split_list",
                source_key="Equipements",
                source_sheet="Hotels",
            )
        ],
    )
    base_state["schema_snapshot"] = {
        "required_columns_by_table": {"object_amenity_temp": ["amenity_code"]},
        "relationship_hints": ["Delimited amenities -> object_amenity_temp."],
        "target_tables": [
            {
                "table": "object_amenity_temp",
                "entity": "amenity",
                "production_table": "object_amenity",
                "description": "Amenity link table.",
                "allowed_transforms": ["identity", "lowercase", "split_list"],
                "columns": [
                    {
                        "column": "amenity_code",
                        "aliases": ["amenity_code", "equipements"],
                        "required": True,
                        "default_transform": "identity",
                    }
                ],
            }
        ],
        "sheets_summary": [
            {
                "sheet_name": "Hotels",
                "columns": ["Equipements"],
                "sample_rows": [{"Equipements": "Wi-Fi;Parking"}],
                "column_stats": {"Equipements": {"semantic_type_hint": "amenity"}},
            }
        ],
    }

    async def _capture(messages):
        captured["system"] = messages[0][1]
        return SemanticReview(issues=[])

    with patch("universal_ai_ingestor.core.ai_graph._get_llm") as mock_llm:
        mock_chain = MagicMock()
        mock_agent = MagicMock()
        mock_agent.ainvoke = AsyncMock(side_effect=_capture)
        mock_chain.with_structured_output.return_value = mock_agent
        mock_llm.return_value = mock_chain

        await _semantic_critic_node(base_state)

    prompt = captured["system"]
    assert "focused schema" in prompt.lower()
    assert "required_columns: amenity_code" in prompt
    assert "Delimited amenities -> object_amenity_temp." in prompt
    assert "Choosing a transform that is not allowed for the target table" in prompt


@pytest.mark.asyncio
async def test_check_confidence_sets_needs_human_review_when_low(base_state) -> None:
    """When plan confidence < threshold, needs_human_review is True."""
    base_state["mapping_plan"] = MappingPlan(
        source_format="xlsx", confidence=0.3, targets=[],
    )
    with patch("universal_ai_ingestor.core.ai_graph.settings") as mock_settings:
        mock_settings.min_confidence_threshold = 0.5
        mock_settings.min_sheet_confidence_threshold = 0.5
        result = await _check_confidence_node(base_state)
        assert result["needs_human_review"] is True
        assert "overall_confidence" in result["review_reasons"][0]


@pytest.mark.asyncio
async def test_check_confidence_flags_low_sheet_even_when_average_is_high(base_state) -> None:
    """A single weak sheet should trigger review even if workbook average is healthy."""
    base_state["mapping_plan"] = MappingPlan(source_format="xlsx", confidence=0.82, targets=[])
    base_state["per_sheet_confidence"] = {"Hotels": 0.92, "Amenities": 0.34}
    with patch("universal_ai_ingestor.core.ai_graph.settings") as mock_settings:
        mock_settings.min_confidence_threshold = 0.5
        mock_settings.min_sheet_confidence_threshold = 0.5
        result = await _check_confidence_node(base_state)
        assert result["needs_human_review"] is True
        assert result["low_confidence_sheets"] == {"Amenities": 0.34}
        assert any("Amenities" in reason for reason in result["review_reasons"])


@pytest.mark.asyncio
async def test_check_confidence_clears_needs_human_review_when_above_threshold(base_state) -> None:
    """When plan confidence >= threshold, needs_human_review is False."""
    base_state["mapping_plan"] = MappingPlan(
        source_format="xlsx", confidence=0.8, targets=[],
    )
    base_state["per_sheet_confidence"] = {"Hotels": 0.8}
    with patch("universal_ai_ingestor.core.ai_graph.settings") as mock_settings:
        mock_settings.min_confidence_threshold = 0.5
        mock_settings.min_sheet_confidence_threshold = 0.5
        result = await _check_confidence_node(base_state)
        assert result["needs_human_review"] is False
        assert result["review_reasons"] == []


def test_build_mapping_graph_includes_semantic_critic_and_check_confidence() -> None:
    """Graph includes semantic_critic and check_confidence nodes."""
    graph = build_mapping_graph()
    assert graph is not None
    assert callable(getattr(graph, "ainvoke", None)) or hasattr(graph, "get_graph")


