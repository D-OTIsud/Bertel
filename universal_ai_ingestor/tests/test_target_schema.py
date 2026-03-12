from __future__ import annotations

import re
from pathlib import Path

from universal_ai_ingestor.core.target_schema import _STAGING_TABLE_COLUMNS, TARGET_SCHEMA_RULES, find_best_target, validate_mapping_target

ROOT = Path(__file__).resolve().parents[2]
UNIFIED_SCHEMA_PATH = ROOT / 'Base de donnée DLL et API' / 'schema_unified.sql'
STAGING_SQL_PATHS = (
    ROOT / 'universal_ai_ingestor' / 'sql' / 'staging_ingestor.sql',
    ROOT / 'universal_ai_ingestor' / 'sql' / 'staging_v2_tables.sql',
    ROOT / 'universal_ai_ingestor' / 'sql' / 'staging_v3_tables.sql',
)


def _unified_schema_tables() -> set[str]:
    content = UNIFIED_SCHEMA_PATH.read_text(encoding='utf-8')
    return {
        match.group(1)
        for match in re.finditer(r'CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_\.]+)\s*\(', content)
    }


def _expected_temp_name(production_table: str) -> str:
    return production_table.replace('.', '_') + '_temp'


def _staging_temp_tables() -> set[str]:
    tables: set[str] = set()
    for path in STAGING_SQL_PATHS:
        content = path.read_text(encoding='utf-8')
        tables.update(
            match.group(1)
            for match in re.finditer(r'CREATE TABLE IF NOT EXISTS staging\.([a-z0-9_]+_temp)', content)
        )
    return tables


def test_find_best_target_prefers_schema_alias() -> None:
    table, column, transform, confidence, rationale = find_best_target('organization_name')
    assert table == 'object_temp'
    assert column == 'org_name'
    assert transform == 'identity'
    assert confidence >= 0.8
    assert 'alias match' in rationale.lower()


def test_validate_mapping_target_rejects_invalid_table_column_combo() -> None:
    ok, reason = validate_mapping_target('object_temp', 'source_url', 'identity')
    assert not ok
    assert 'Unknown column' in reason or 'Unsupported target_column' in reason


def test_validate_mapping_target_accepts_supported_mapping() -> None:
    ok, reason = validate_mapping_target('media_temp', 'source_url', 'split_list')
    assert ok
    assert reason == 'ok'


def test_unified_schema_tables_have_staging_temp_tables() -> None:
    expected_temp_tables = {_expected_temp_name(table) for table in _unified_schema_tables()}
    missing = sorted(expected_temp_tables - _staging_temp_tables())
    assert missing == []


def test_unified_schema_tables_have_mapping_rules() -> None:
    expected_temp_tables = {_expected_temp_name(table) for table in _unified_schema_tables()}
    missing = sorted(expected_temp_tables - set(TARGET_SCHEMA_RULES))
    assert missing == []


def test_target_schema_rules_expose_all_staging_columns() -> None:
    missing_by_table: dict[str, list[str]] = {}
    for table, staging_columns in _STAGING_TABLE_COLUMNS.items():
        if table not in TARGET_SCHEMA_RULES:
            continue
        mapped_columns = {column.column for column in TARGET_SCHEMA_RULES[table].columns}
        missing = sorted(column for column in staging_columns if column not in mapped_columns)
        if missing:
            missing_by_table[table] = missing
    assert missing_by_table == {}


def test_target_schema_rules_do_not_expose_non_staging_columns() -> None:
    extra_by_table: dict[str, list[str]] = {}
    for table, rule in TARGET_SCHEMA_RULES.items():
        staging_columns = set(_STAGING_TABLE_COLUMNS.get(table, ()))
        extras = sorted(column.column for column in rule.columns if column.column not in staging_columns)
        if extras:
            extra_by_table[table] = extras
    assert extra_by_table == {}

def test_object_pet_policy_available_for_manual_mapping() -> None:
    rule = TARGET_SCHEMA_RULES['object_pet_policy_temp']
    assert {column.column for column in rule.columns} >= {'accepted', 'conditions'}

def test_staging_v3_sql_has_no_broken_generated_unique_lines() -> None:
    content = (ROOT / 'universal_ai_ingestor' / 'sql' / 'staging_v3_tables.sql').read_text(encoding='utf-8')
    assert re.search(r'^\s*UNIQUE\([^)]*,\s*TEXT,$', content, re.MULTILINE) is None


def test_generated_schema_catalog_has_no_constraint_artifacts() -> None:
    content = (ROOT / 'universal_ai_ingestor' / 'core' / 'generated_schema_catalog.py').read_text(encoding='utf-8')
    assert re.search(r'^\s*\("UNIQUE\(', content, re.MULTILINE) is None
    assert re.search(r"^\s*\(\"'[^\n]*", content, re.MULTILINE) is None


def test_staging_v3_sql_has_no_comment_artifact_columns() -> None:
    content = (ROOT / 'universal_ai_ingestor' / 'sql' / 'staging_v3_tables.sql').read_text(encoding='utf-8')
    assert re.search(r"^\s*'[^\n]*'\s+[A-Z]+", content, re.MULTILINE) is None
    assert re.search(r'^\s*how\s+[A-Z]+', content, re.MULTILINE) is None




