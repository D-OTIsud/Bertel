from __future__ import annotations

import sys
import types

import pandas as pd
import pytest
from universal_ai_ingestor.core import discovery_engine as discovery_engine_module
from universal_ai_ingestor.core.discovery_engine import build_discovery_contract
from universal_ai_ingestor.core.schemas import MappingPlan, MappingTarget, RelationAnalysis, RelationHypothesisLLM


@pytest.mark.asyncio
async def test_discovery_contract_profiles_sheet_and_fields() -> None:
    sheets = {
        "ObjetLegacy": pd.DataFrame(
            [
                {"NomObjet": "Hotel A", "MailContact": "a@example.com", "Coord_Lat": 16.25, "Coord_Lon": -61.5},
                {"NomObjet": "Hotel B", "MailContact": "b@example.com", "Coord_Lat": 16.3, "Coord_Lon": -61.55},
            ]
        )
    }
    contract = await build_discovery_contract(source_format="xlsx", sheets=sheets)
    assert contract.sheets
    assert contract.fields
    assert contract.sheets[0].sheet_name == "ObjetLegacy"
    mapped_targets = {(f.target_table, f.target_column) for f in contract.fields}
    assert ("contact_channel_temp", "value") in mapped_targets


@pytest.mark.asyncio
async def test_discovery_detects_media_sheet_entity() -> None:
    sheets = {
        "galerie": pd.DataFrame(
            [{"photo_urls": "https://example.com/a.jpg", "object_id": "obj-1"}]
        )
    }
    contract = await build_discovery_contract(source_format="xlsx", sheets=sheets)
    assert contract.sheets[0].inferred_entity_type == "media"
    media_fields = [f for f in contract.fields if f.target_table == "media_temp"]
    assert media_fields


@pytest.mark.asyncio
async def test_custom_rules_are_forwarded_to_ai_graph(monkeypatch) -> None:
    captured: dict[str, str | None] = {"custom_rules": None}

    async def _fake_generate_mapping_plan(**kwargs):
        captured["custom_rules"] = kwargs.get("custom_rules")
        return (
            discovery_engine_module.MappingPlan(
                source_format="xlsx",
                confidence=0.9,
                targets=[
                    discovery_engine_module.MappingTarget(
                        table="object_temp",
                        column="name",
                        transform="identity",
                        source_key="id OTI",
                        source_sheet="ObjetLegacy",
                    )
                ],
            ),
            RelationAnalysis(
                relations=[
                    RelationHypothesisLLM(
                        from_sheet="ObjetLegacy",
                        from_column="prestataires",
                        separator=";",
                        target_entity_type="org",
                        is_join_table=False,
                        confidence=0.8,
                    )
                ]
            ),
            False,  # needs_human_review
        )

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_core = types.ModuleType("core")
    fake_ai_graph = types.ModuleType("core.ai_graph")
    fake_ai_graph.generate_mapping_plan = _fake_generate_mapping_plan
    fake_core.ai_graph = fake_ai_graph
    monkeypatch.setitem(sys.modules, "core", fake_core)
    monkeypatch.setitem(sys.modules, "core.ai_graph", fake_ai_graph)
    monkeypatch.setitem(sys.modules, "universal_ai_ingestor.core.ai_graph", fake_ai_graph)

    sheets = {
        "ObjetLegacy": pd.DataFrame(
            [
                {"id OTI": "OTI-1", "prestataires": "ORG001;ORG002"},
            ]
        )
    }

    custom_rules = "La colonne 'id OTI' va toujours vers external_id."
    contract = await build_discovery_contract(source_format="xlsx", sheets=sheets, custom_rules=custom_rules)

    assert captured["custom_rules"] == custom_rules
    assert any(r.from_column == "prestataires" and r.target_entity_type == "org" for r in contract.relations)


@pytest.mark.asyncio
async def test_ai_mapping_notes_and_assumptions_propagate(monkeypatch) -> None:
    async def _fake_enhance_with_ai_workbook(**kwargs):
        proposals = kwargs["proposals"]
        assumptions = kwargs["assumptions"]
        proposals[0] = discovery_engine_module.DiscoveryFieldProposal(
            sheet_name="ObjetLegacy",
            source_column="id OTI",
            target_table="object_temp",
            target_column="name",
            transform="identity",
            confidence=0.91,
            rationale="AI selected object_temp.name with transform=identity and confidence=91%. Close semantic candidates: object_temp.name (score=0.99, mode=vector_semantic)",
            status="proposed",
        )
        assumptions.extend([
            "ai_mode:llm_schema_semantic_mapping",
            "semantic_candidates:vector_semantic=1",
        ])
        return []

    monkeypatch.setattr(discovery_engine_module, "_enhance_with_ai_workbook", _fake_enhance_with_ai_workbook)

    sheets = {
        "ObjetLegacy": pd.DataFrame([{"id OTI": "OTI-1"}])
    }

    contract = await build_discovery_contract(source_format="xlsx", sheets=sheets)

    field = next(f for f in contract.fields if f.source_column == "id OTI")
    assert "AI selected object_temp.name" in field.rationale
    assert "ai_mode:llm_schema_semantic_mapping" in contract.assumptions
    assert any(item.startswith("semantic_candidates:") for item in contract.assumptions)


