from __future__ import annotations

import sys
import types

import pandas as pd

from universal_ai_ingestor.core.discovery_engine import build_discovery_contract
from universal_ai_ingestor.core.schemas import MappingPlan, MappingTarget, RelationAnalysis, RelationHypothesisLLM


def test_discovery_contract_profiles_sheet_and_fields() -> None:
    sheets = {
        "ObjetLegacy": pd.DataFrame(
            [
                {"NomObjet": "Hotel A", "MailContact": "a@example.com", "Coord_Lat": 16.25, "Coord_Lon": -61.5},
                {"NomObjet": "Hotel B", "MailContact": "b@example.com", "Coord_Lat": 16.3, "Coord_Lon": -61.55},
            ]
        )
    }
    contract = build_discovery_contract(source_format="xlsx", sheets=sheets)
    assert contract.sheets
    assert contract.fields
    assert contract.sheets[0].sheet_name == "ObjetLegacy"
    mapped_targets = {(f.target_table, f.target_column) for f in contract.fields}
    assert ("object_temp", "email") in mapped_targets


def test_discovery_detects_media_sheet_entity() -> None:
    sheets = {
        "galerie": pd.DataFrame(
            [{"photo_urls": "https://example.com/a.jpg", "object_id": "obj-1"}]
        )
    }
    contract = build_discovery_contract(source_format="xlsx", sheets=sheets)
    assert contract.sheets[0].inferred_entity_type == "media"
    media_fields = [f for f in contract.fields if f.target_table == "media_temp"]
    assert media_fields


def test_custom_rules_are_forwarded_to_ai_graph(monkeypatch) -> None:
    captured: dict[str, str | None] = {"custom_rules": None}

    def _fake_generate_mapping_plan(**kwargs):
        captured["custom_rules"] = kwargs.get("custom_rules")
        return (
            MappingPlan(
                source_format="xlsx",
                confidence=0.9,
                targets=[
                    MappingTarget(
                        table="object_temp",
                        column="external_id",
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
        )

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_core = types.ModuleType("core")
    fake_ai_graph = types.ModuleType("core.ai_graph")
    fake_ai_graph.generate_mapping_plan = _fake_generate_mapping_plan
    fake_core.ai_graph = fake_ai_graph
    monkeypatch.setitem(sys.modules, "core", fake_core)
    monkeypatch.setitem(sys.modules, "core.ai_graph", fake_ai_graph)

    sheets = {
        "ObjetLegacy": pd.DataFrame(
            [
                {"id OTI": "OTI-1", "prestataires": "ORG001;ORG002"},
            ]
        )
    }

    custom_rules = "La colonne 'id OTI' va toujours vers external_id."
    contract = build_discovery_contract(source_format="xlsx", sheets=sheets, custom_rules=custom_rules)

    assert captured["custom_rules"] == custom_rules
    assert any(r.from_column == "prestataires" and r.target_entity_type == "org" for r in contract.relations)
