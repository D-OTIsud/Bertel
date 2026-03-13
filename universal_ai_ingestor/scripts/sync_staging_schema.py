from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
UNIFIED_SCHEMA_PATH = ROOT / "Base de donnée DLL et API" / "schema_unified.sql"
STAGING_SQL_PATHS = (
    ROOT / "universal_ai_ingestor" / "sql" / "staging_ingestor.sql",
    ROOT / "universal_ai_ingestor" / "sql" / "staging_v2_tables.sql",
    ROOT / "universal_ai_ingestor" / "sql" / "staging_v3_tables.sql",
)

_CREATE_TABLE_RE = re.compile(r"CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_\.]+)\s*\((.*?)\);", re.IGNORECASE | re.DOTALL)
_ALTER_TABLE_RE = re.compile(r"ALTER TABLE(?: IF EXISTS)?\s+([a-zA-Z0-9_\.]+)\s+(.*?);", re.IGNORECASE | re.DOTALL)
_COLUMN_LINE_RE = re.compile(r'^\s*"?([a-zA-Z0-9_]+)"?\s+(.+)$', re.IGNORECASE)
_ADD_COLUMN_RE = re.compile(
    r'ADD COLUMN IF NOT EXISTS\s+"?([a-zA-Z0-9_]+)"?\s+(.+?)(?=,\s*ADD COLUMN IF NOT EXISTS|$)',
    re.IGNORECASE | re.DOTALL,
)
_SKIP_COLUMN_NAMES = {"constraint", "primary", "foreign", "unique", "check"}


def _mapped_staging_definition(definition: str) -> str:
    normalized = definition.strip()
    if "references " in normalized.lower():
        normalized = re.split(r"REFERENCES", normalized, maxsplit=1, flags=re.IGNORECASE)[0].strip()
    if "generated always as" in normalized.lower():
        normalized = re.sub(r"GENERATED ALWAYS AS\s*\(.*", "", normalized, flags=re.IGNORECASE | re.DOTALL).strip()
    lower = normalized.lower()
    if re.search(r"(^|\s)(jsonb|json)(\s|$)", lower):
        return "JSONB"
    if re.search(r"(^|\s)boolean(\s|$)", lower):
        return "BOOLEAN"
    if re.search(r"(^|\s)smallint(\s|$)", lower):
        return "SMALLINT"
    if re.search(r"(^|\s)bigint(\s|$)", lower):
        return "BIGINT"
    if re.search(r"(^|\s)integer(\s|$)", lower):
        return "INTEGER"
    if re.search(r"(^|\s)(numeric|decimal)(\s|$)", lower):
        return "NUMERIC"
    if "double precision" in lower:
        return "DOUBLE PRECISION"
    if re.search(r"(^|\s)real(\s|$)", lower):
        return "REAL"
    if "timestamptz" in lower:
        return "TIMESTAMPTZ"
    if re.search(r"(^|\s)timestamp(\s|$)", lower):
        return "TIMESTAMP"
    if re.search(r"(^|\s)date(\s|$)", lower):
        return "DATE"
    if re.search(r"(^|\s)time(\s|$)", lower):
        return "TIME"
    return "TEXT"


def _extract_create_columns(content: str) -> dict[str, OrderedDict[str, str]]:
    tables: dict[str, OrderedDict[str, str]] = {}
    for match in _CREATE_TABLE_RE.finditer(content):
        block = match.group(2)
        ordered: OrderedDict[str, str] = OrderedDict()
        depth = 1
        for raw_line in block.splitlines():
            clean = raw_line.split("--", 1)[0].rstrip()
            stripped = clean.strip()
            if not stripped:
                depth += clean.count("(") - clean.count(")")
                continue
            if depth == 1:
                candidate = stripped.rstrip(",")
                column_match = _COLUMN_LINE_RE.match(candidate)
                if column_match:
                    name, definition = column_match.groups()
                    if name.lower() not in _SKIP_COLUMN_NAMES:
                        ordered.setdefault(name, _mapped_staging_definition(definition))
            depth += clean.count("(") - clean.count(")")
        tables[match.group(1)] = ordered
    return tables


def _apply_alter_add_columns(content: str, tables: dict[str, OrderedDict[str, str]]) -> None:
    for match in _ALTER_TABLE_RE.finditer(content):
        table = match.group(1)
        if table not in tables:
            continue
        for add_match in _ADD_COLUMN_RE.finditer(match.group(2)):
            name, definition = add_match.groups()
            tables[table][name] = _mapped_staging_definition(definition)


def load_unified_schema_columns() -> dict[str, OrderedDict[str, str]]:
    content = UNIFIED_SCHEMA_PATH.read_text(encoding="utf-8")
    tables = _extract_create_columns(content)
    _apply_alter_add_columns(content, tables)
    return tables


def load_staging_columns() -> dict[str, OrderedDict[str, str]]:
    tables: dict[str, OrderedDict[str, str]] = {}
    for path in STAGING_SQL_PATHS:
        content = path.read_text(encoding="utf-8")
        file_tables = _extract_create_columns(content)
        for table, columns in file_tables.items():
            if not table.startswith("staging."):
                continue
            temp_table = table.split(".", 1)[1]
            bucket = tables.setdefault(temp_table, OrderedDict())
            for name, definition in columns.items():
                bucket.setdefault(name, definition)
        prefixed = {f"staging.{table}": columns for table, columns in tables.items()}
        _apply_alter_add_columns(content, prefixed)
    return tables


def render_missing_staging_alters() -> str:
    unified_tables = load_unified_schema_columns()
    staging_tables = load_staging_columns()
    lines = [
        "-- =====================================================",
        "-- Staging V3 sync: columns mirrored from schema_unified.sql",
        "-- Generated by universal_ai_ingestor/scripts/sync_staging_schema.py",
        "-- =====================================================",
        "",
    ]
    for production_table, columns in sorted(unified_tables.items()):
        temp_table = production_table.replace(".", "_") + "_temp"
        existing = staging_tables.get(temp_table)
        if existing is None:
            continue
        missing = [(name, definition) for name, definition in columns.items() if name not in existing]
        if not missing:
            continue
        lines.append(f"-- {production_table} -> staging.{temp_table}")
        lines.append(f"ALTER TABLE IF EXISTS staging.{temp_table}")
        for index, (name, definition) in enumerate(missing):
            suffix = "," if index < len(missing) - 1 else ";"
            lines.append(f"  ADD COLUMN IF NOT EXISTS {name} {definition}{suffix}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


if __name__ == "__main__":
    print(render_missing_staging_alters(), end="")
