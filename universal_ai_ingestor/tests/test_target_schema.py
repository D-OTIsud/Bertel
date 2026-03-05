from __future__ import annotations

from universal_ai_ingestor.core.target_schema import find_best_target, validate_mapping_target


def test_find_best_target_prefers_schema_alias() -> None:
    table, column, transform, confidence, rationale = find_best_target("organization_name")
    assert table == "object_temp"
    assert column == "org_name"
    assert transform == "identity"
    assert confidence >= 0.8
    assert "Schema" in rationale


def test_validate_mapping_target_rejects_invalid_table_column_combo() -> None:
    ok, reason = validate_mapping_target("object_temp", "source_url", "identity")
    assert not ok
    assert "Unsupported target_column" in reason


def test_validate_mapping_target_accepts_supported_mapping() -> None:
    ok, reason = validate_mapping_target("media_temp", "source_url", "split_list")
    assert ok
    assert reason == "ok"
