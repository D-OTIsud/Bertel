"""Dedicated pgvector-backed storage for dynamic few-shot examples and schema-semantic candidates."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
from collections import defaultdict
from typing import Any, Iterable, Sequence

import asyncpg
from langchain_openai import OpenAIEmbeddings

from core.config import settings

logger = logging.getLogger("ingestor.vector_store")

_EMBEDDING_MODEL = "text-embedding-3-small"
_EMBEDDING_DIMENSION = 1536
_SYNCED_SCHEMA_SIGNATURES: set[str] = set()
_SCHEMA_SYNC_LOCK = asyncio.Lock()


def _is_configured() -> bool:
    return bool(getattr(settings, "vector_db_url", "") or "")


def _get_embeddings() -> OpenAIEmbeddings:
    if not settings.openai_api_key.strip():
        raise RuntimeError("OPENAI_API_KEY is required to generate vector embeddings.")
    return OpenAIEmbeddings(model=_EMBEDDING_MODEL, api_key=settings.openai_api_key)


def _normalize_columns(column_names: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw_name in column_names:
        name = str(raw_name).strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(name)
    return normalized


def _column_signature(column_names: Sequence[str]) -> str:
    canonical = "|".join(name.lower() for name in _normalize_columns(column_names))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _embedding_input(sheet_name: str, column_names: Sequence[str]) -> str:
    columns = "\n".join(f"- {name}" for name in _normalize_columns(column_names))
    return f"sheet={sheet_name}\ncolumns:\n{columns}"


def _schema_signature(schema_context: dict[str, Any]) -> str:
    tables = []
    for table in schema_context.get("target_tables", []):
        table_name = str(table.get("table", "")).strip()
        if not table_name:
            continue
        tables.append(
            {
                "table": table_name,
                "entity": str(table.get("entity", "")).strip(),
                "production_table": str(table.get("production_table", "")).strip(),
                "description": str(table.get("description", "")).strip(),
                "allowed_transforms": list(table.get("allowed_transforms", [])),
                "columns": [
                    {
                        "column": str(column.get("column", "")).strip(),
                        "aliases": list(column.get("aliases", [])),
                        "required": bool(column.get("required", False)),
                        "default_transform": str(column.get("default_transform", "identity") or "identity"),
                    }
                    for column in table.get("columns", [])
                    if str(column.get("column", "")).strip()
                ],
            }
        )
    payload = json.dumps(sorted(tables, key=lambda item: item["table"]), ensure_ascii=True, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _target_column_embedding_input(table: dict[str, Any], column: dict[str, Any]) -> str:
    aliases = ", ".join(str(alias) for alias in column.get("aliases", []) if str(alias).strip()) or "-"
    transforms = ", ".join(str(item) for item in table.get("allowed_transforms", []) if str(item).strip()) or "identity"
    return (
        f"table={table.get('table', '')}\n"
        f"column={column.get('column', '')}\n"
        f"entity={table.get('entity', '')}\n"
        f"production_table={table.get('production_table', '')}\n"
        f"description={table.get('description', '')}\n"
        f"aliases={aliases}\n"
        f"default_transform={column.get('default_transform', 'identity')}\n"
        f"allowed_transforms={transforms}\n"
        f"required={bool(column.get('required', False))}"
    )


def _source_column_embedding_input(
    *,
    sheet_name: str,
    source_column: str,
    sample_values: Sequence[str],
    column_stats: dict[str, Any] | None,
    entity_type: str = "",
) -> str:
    stats = column_stats or {}
    stat_parts = [
        f"semantic_type_hint={stats.get('semantic_type_hint', 'text')}",
        f"numeric_ratio={stats.get('numeric_ratio', 0.0):.2f}",
        f"date_ratio={stats.get('date_ratio', 0.0):.2f}",
        f"email_ratio={stats.get('email_ratio', 0.0):.2f}",
        f"url_ratio={stats.get('url_ratio', 0.0):.2f}",
        f"gps_ratio={stats.get('gps_ratio', 0.0):.2f}",
        f"id_like_ratio={stats.get('id_like_ratio', 0.0):.2f}",
        f"multi_value_ratio={stats.get('multi_value_ratio', 0.0):.2f}",
    ]
    if stats.get("dominant_delimiter"):
        stat_parts.append(f"dominant_delimiter={stats.get('dominant_delimiter')}")
    samples = "\n".join(f"- {value}" for value in sample_values if str(value).strip()) or "-"
    return (
        f"sheet={sheet_name}\n"
        f"source_column={source_column}\n"
        f"entity_type={entity_type}\n"
        f"stats={'; '.join(stat_parts)}\n"
        f"sample_values:\n{samples}"
    )


def _vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.10f}" for value in values) + "]"


async def _embed_sheet_signature(sheet_name: str, column_names: Sequence[str]) -> list[float]:
    embeddings = _get_embeddings()
    return await embeddings.aembed_query(_embedding_input(sheet_name, column_names))


async def _embed_texts(texts: Sequence[str]) -> list[list[float]]:
    embeddings = _get_embeddings()
    return await embeddings.aembed_documents(list(texts))


async def _get_connection() -> asyncpg.Connection:
    return await asyncpg.connect(settings.vector_db_url)


async def _ensure_schema(conn: asyncpg.Connection) -> None:
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    await conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS rag_mapping_examples (
            id BIGSERIAL PRIMARY KEY,
            sheet_name TEXT NOT NULL,
            column_signature TEXT NOT NULL,
            column_names JSONB NOT NULL DEFAULT '[]'::jsonb,
            example_mapping TEXT NOT NULL,
            embedding vector({_EMBEDDING_DIMENSION}) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (sheet_name, column_signature, example_mapping)
        )
        """
    )
    await conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS rag_target_columns (
            id BIGSERIAL PRIMARY KEY,
            schema_signature TEXT NOT NULL,
            target_table TEXT NOT NULL,
            target_column TEXT NOT NULL,
            entity TEXT NOT NULL DEFAULT '',
            production_table TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
            allowed_transforms JSONB NOT NULL DEFAULT '[]'::jsonb,
            default_transform TEXT NOT NULL DEFAULT 'identity',
            embedding vector({_EMBEDDING_DIMENSION}) NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (schema_signature, target_table, target_column)
        )
        """
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_rag_target_columns_schema ON rag_target_columns(schema_signature)"
    )


def _format_example_mapping(field_rows: Sequence[dict[str, Any]]) -> str:
    lines: list[str] = []
    for row in sorted(field_rows, key=lambda item: str(item.get("source_column") or "").lower()):
        source_column = str(row.get("source_column") or "").strip()
        target_table = str(row.get("target_table") or "").strip()
        target_column = str(row.get("target_column") or "").strip()
        transform = str(row.get("transform") or "identity").strip()
        if not source_column or not target_table or not target_column:
            continue
        lines.append(
            f"- Column '{source_column}' -> target_table: '{target_table}', "
            f"target_column: '{target_column}', transform: '{transform}'"
        )
    return "\n".join(lines)


async def save_approved_mapping(
    *,
    sheet_name: str,
    column_names: list[str],
    example_mapping: str,
) -> None:
    if not _is_configured():
        return
    if not example_mapping.strip():
        return
    normalized_columns = _normalize_columns(column_names)
    if not normalized_columns:
        return
    conn: asyncpg.Connection | None = None
    try:
        conn = await _get_connection()
        await _ensure_schema(conn)
        embedding = await _embed_sheet_signature(sheet_name, normalized_columns)
        await conn.execute(
            """
            INSERT INTO rag_mapping_examples (
                sheet_name,
                column_signature,
                column_names,
                example_mapping,
                embedding
            )
            VALUES ($1, $2, $3::jsonb, $4, $5::vector)
            ON CONFLICT (sheet_name, column_signature, example_mapping)
            DO UPDATE SET
                column_names = EXCLUDED.column_names,
                embedding = EXCLUDED.embedding,
                updated_at = NOW()
            """,
            sheet_name,
            _column_signature(normalized_columns),
            json.dumps(normalized_columns),
            example_mapping,
            _vector_literal(embedding),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vector store save failed: %s", exc)
    finally:
        if conn is not None:
            await conn.close()


async def query_similar_few_shots(
    *,
    sheet_name: str,
    column_names: list[str],
    top_k: int = 5,
) -> list[str]:
    if not _is_configured():
        return []
    normalized_columns = _normalize_columns(column_names)
    if not normalized_columns:
        return []
    conn: asyncpg.Connection | None = None
    try:
        conn = await _get_connection()
        await _ensure_schema(conn)
        embedding = await _embed_sheet_signature(sheet_name, normalized_columns)
        rows = await conn.fetch(
            """
            SELECT example_mapping
            FROM rag_mapping_examples
            WHERE example_mapping <> ''
            ORDER BY embedding <=> $1::vector
            LIMIT $2
            """,
            _vector_literal(embedding),
            int(top_k),
        )
        return [str(row["example_mapping"]) for row in rows if row.get("example_mapping")]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vector store query failed: %s", exc)
        return []
    finally:
        if conn is not None:
            await conn.close()


async def save_approved_field_examples(field_rows: Sequence[dict[str, Any]]) -> None:
    """Save one few-shot example per sheet from approved mapping rows."""
    approved_by_sheet: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in field_rows:
        status = str(row.get("status") or "approved").strip().lower()
        if status != "approved":
            continue
        sheet_name = str(row.get("sheet_name") or "").strip()
        if not sheet_name:
            continue
        approved_by_sheet[sheet_name].append(row)

    for sheet_name, rows in approved_by_sheet.items():
        example_mapping = _format_example_mapping(rows)
        column_names = [str(row.get("source_column") or "").strip() for row in rows]
        await save_approved_mapping(
            sheet_name=sheet_name,
            column_names=column_names,
            example_mapping=example_mapping,
        )


def save_approved_field_examples_sync(field_rows: Sequence[dict[str, Any]]) -> None:
    """Sync wrapper for saving approved mappings from API/persistence code."""
    if not _is_configured():
        return
    try:
        asyncio.run(save_approved_field_examples(field_rows))
    except RuntimeError:
        logger.warning("Skipping sync vector-store save because an event loop is already running.")


def _semantic_tokens(*parts: str) -> set[str]:
    tokens: set[str] = set()
    for part in parts:
        for token in str(part or "").lower().replace("-", " ").replace("/", " ").replace("_", " ").split():
            cleaned = "".join(char for char in token if char.isalnum())
            if len(cleaned) >= 2:
                tokens.add(cleaned)
    return tokens


def _semantic_overlap_score(source_column: str, sample_values: Sequence[str], column_stats: dict[str, Any] | None, candidate: dict[str, Any]) -> float:
    stats = column_stats or {}
    source_tokens = _semantic_tokens(source_column, stats.get("semantic_type_hint", ""), *sample_values[:5])
    candidate_tokens = _semantic_tokens(
        candidate.get("target_table", ""),
        candidate.get("target_column", ""),
        candidate.get("entity", ""),
        candidate.get("description", ""),
        *(candidate.get("aliases", []) or []),
    )
    overlap = len(source_tokens & candidate_tokens)
    score = float(overlap)
    semantic_hint = str(stats.get("semantic_type_hint", "")).strip().lower()
    target_column = str(candidate.get("target_column", "")).lower()
    target_table = str(candidate.get("target_table", "")).lower()
    if semantic_hint and semantic_hint in _semantic_tokens(target_column, target_table, candidate.get("entity", "")):
        score += 3.0
    if stats.get("multi_value_ratio", 0.0) >= 0.5 and "split_list" in (candidate.get("allowed_transforms", []) or []):
        score += 1.0
    if stats.get("gps_ratio", 0.0) >= 0.5 and target_column in {"latitude", "longitude"}:
        score += 2.0
    if stats.get("email_ratio", 0.0) >= 0.5 and ("email" in target_column or "courriel" in target_column):
        score += 2.0
    if stats.get("url_ratio", 0.0) >= 0.5 and ("url" in target_column or "website" in target_column or "site" in target_column):
        score += 2.0
    return score


def _fallback_target_column_candidates(
    *,
    schema_context: dict[str, Any],
    source_column: str,
    sample_values: Sequence[str],
    column_stats: dict[str, Any] | None,
    top_k: int,
) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for table in schema_context.get("target_tables", []):
        target_table = str(table.get("table", "")).strip()
        if not target_table:
            continue
        allowed_transforms = [str(item) for item in table.get("allowed_transforms", []) if str(item).strip()]
        for column in table.get("columns", []):
            target_column = str(column.get("column", "")).strip()
            if not target_column:
                continue
            candidate = {
                "target_table": target_table,
                "target_column": target_column,
                "entity": str(table.get("entity", "")).strip(),
                "production_table": str(table.get("production_table", "")).strip(),
                "description": str(table.get("description", "")).strip(),
                "aliases": [str(alias) for alias in column.get("aliases", []) if str(alias).strip()],
                "allowed_transforms": allowed_transforms,
                "default_transform": str(column.get("default_transform", "identity") or "identity"),
            }
            candidate["similarity"] = round(_semantic_overlap_score(source_column, sample_values, column_stats, candidate), 4)
            ranked.append(candidate)
    ranked.sort(key=lambda item: (-float(item.get("similarity", 0.0)), item["target_table"], item["target_column"]))
    return ranked[:top_k]


async def _sync_target_schema_candidates(conn: asyncpg.Connection, schema_context: dict[str, Any]) -> str:
    signature = _schema_signature(schema_context)
    if signature in _SYNCED_SCHEMA_SIGNATURES:
        return signature
    async with _SCHEMA_SYNC_LOCK:
        if signature in _SYNCED_SCHEMA_SIGNATURES:
            return signature
        payloads: list[tuple[str, str, str, str, str, list[str], list[str], str]] = []
        texts: list[str] = []
        for table in schema_context.get("target_tables", []):
            target_table = str(table.get("table", "")).strip()
            if not target_table:
                continue
            allowed_transforms = [str(item) for item in table.get("allowed_transforms", []) if str(item).strip()]
            for column in table.get("columns", []):
                target_column = str(column.get("column", "")).strip()
                if not target_column:
                    continue
                aliases = [str(alias) for alias in column.get("aliases", []) if str(alias).strip()]
                payloads.append(
                    (
                        target_table,
                        target_column,
                        str(table.get("entity", "")).strip(),
                        str(table.get("production_table", "")).strip(),
                        str(table.get("description", "")).strip(),
                        aliases,
                        allowed_transforms,
                        str(column.get("default_transform", "identity") or "identity"),
                    )
                )
                texts.append(_target_column_embedding_input(table, column))

        if payloads:
            embeddings = await _embed_texts(texts)
            for payload, embedding in zip(payloads, embeddings, strict=False):
                await conn.execute(
                    """
                    INSERT INTO rag_target_columns (
                        schema_signature,
                        target_table,
                        target_column,
                        entity,
                        production_table,
                        description,
                        aliases,
                        allowed_transforms,
                        default_transform,
                        embedding,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::vector, NOW())
                    ON CONFLICT (schema_signature, target_table, target_column)
                    DO UPDATE SET
                        entity = EXCLUDED.entity,
                        production_table = EXCLUDED.production_table,
                        description = EXCLUDED.description,
                        aliases = EXCLUDED.aliases,
                        allowed_transforms = EXCLUDED.allowed_transforms,
                        default_transform = EXCLUDED.default_transform,
                        embedding = EXCLUDED.embedding,
                        updated_at = NOW()
                    """,
                    signature,
                    payload[0],
                    payload[1],
                    payload[2],
                    payload[3],
                    payload[4],
                    json.dumps(payload[5]),
                    json.dumps(payload[6]),
                    payload[7],
                    _vector_literal(embedding),
                )
        _SYNCED_SCHEMA_SIGNATURES.add(signature)
        return signature


async def query_target_column_candidates(
    *,
    schema_context: dict[str, Any],
    sheet_name: str,
    source_column: str,
    sample_values: Sequence[str],
    column_stats: dict[str, Any] | None = None,
    entity_type: str = "",
    top_k: int = 5,
) -> list[dict[str, Any]]:
    if not str(source_column).strip():
        return []
    if not _is_configured():
        return _fallback_target_column_candidates(
            schema_context=schema_context,
            source_column=source_column,
            sample_values=sample_values,
            column_stats=column_stats,
            top_k=top_k,
        )

    conn: asyncpg.Connection | None = None
    try:
        conn = await _get_connection()
        await _ensure_schema(conn)
        schema_signature = await _sync_target_schema_candidates(conn, schema_context)
        query_embedding = await _get_embeddings().aembed_query(
            _source_column_embedding_input(
                sheet_name=sheet_name,
                source_column=source_column,
                sample_values=sample_values,
                column_stats=column_stats,
                entity_type=entity_type,
            )
        )
        rows = await conn.fetch(
            """
            SELECT
                target_table,
                target_column,
                entity,
                production_table,
                description,
                aliases,
                allowed_transforms,
                default_transform,
                1 - (embedding <=> $2::vector) AS similarity
            FROM rag_target_columns
            WHERE schema_signature = $1
            ORDER BY embedding <=> $2::vector
            LIMIT $3
            """,
            schema_signature,
            _vector_literal(query_embedding),
            int(top_k),
        )
        candidates: list[dict[str, Any]] = []
        for row in rows:
            candidates.append(
                {
                    "target_table": str(row["target_table"]),
                    "target_column": str(row["target_column"]),
                    "entity": str(row["entity"] or ""),
                    "production_table": str(row["production_table"] or ""),
                    "description": str(row["description"] or ""),
                    "aliases": [str(alias) for alias in (row["aliases"] or [])],
                    "allowed_transforms": [str(item) for item in (row["allowed_transforms"] or [])],
                    "default_transform": str(row["default_transform"] or "identity"),
                    "similarity": round(float(row["similarity"] or 0.0), 4),
                }
            )
        return candidates
    except Exception as exc:  # noqa: BLE001
        logger.warning("Target-column semantic query failed, using fallback ranking: %s", exc)
        return _fallback_target_column_candidates(
            schema_context=schema_context,
            source_column=source_column,
            sample_values=sample_values,
            column_stats=column_stats,
            top_k=top_k,
        )
    finally:
        if conn is not None:
            await conn.close()


async def query_target_column_candidates_for_sheet(
    *,
    schema_context: dict[str, Any],
    sheet_name: str,
    columns: Sequence[dict[str, Any]],
    entity_type: str = "",
    top_k: int = 5,
) -> dict[str, list[dict[str, Any]]]:
    candidates_by_column: dict[str, list[dict[str, Any]]] = {}
    for column in columns:
        source_column = str(column.get("source_column", "")).strip()
        if not source_column:
            continue
        candidates_by_column[source_column] = await query_target_column_candidates(
            schema_context=schema_context,
            sheet_name=sheet_name,
            source_column=source_column,
            sample_values=[str(value) for value in column.get("sample_values", []) if str(value).strip()],
            column_stats=column.get("column_stats") or {},
            entity_type=entity_type,
            top_k=top_k,
        )
    return candidates_by_column

async def prewarm_target_schema(schema_context: dict[str, Any]) -> bool:
    """Ensure target-schema semantic candidates are indexed in the vector store."""
    if not _is_configured():
        return False
    conn: asyncpg.Connection | None = None
    try:
        conn = await _get_connection()
        await _ensure_schema(conn)
        await _sync_target_schema_candidates(conn, schema_context)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Target-schema prewarm failed: %s", exc)
        return False
    finally:
        if conn is not None:
            await conn.close()


def prewarm_target_schema_sync(schema_context: dict[str, Any]) -> bool:
    """Sync wrapper for deployment hooks/startup code."""
    if not _is_configured():
        return False
    try:
        return asyncio.run(prewarm_target_schema(schema_context))
    except RuntimeError:
        logger.warning("Skipping sync target-schema prewarm because an event loop is already running.")
        return False

