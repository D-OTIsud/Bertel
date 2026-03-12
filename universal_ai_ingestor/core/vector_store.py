"""Dedicated pgvector-backed storage for dynamic few-shot examples."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections import defaultdict
from typing import Any, Iterable, Sequence

import asyncpg
from langchain_openai import OpenAIEmbeddings

from core.config import settings

logger = logging.getLogger("ingestor.vector_store")

_EMBEDDING_MODEL = "text-embedding-3-small"
_EMBEDDING_DIMENSION = 1536


def _is_configured() -> bool:
    return bool(getattr(settings, "vector_db_url", "") or "")


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


def _vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.10f}" for value in values) + "]"


async def _embed_sheet_signature(sheet_name: str, column_names: Sequence[str]) -> list[float]:
    if not settings.openai_api_key.strip():
        raise RuntimeError("OPENAI_API_KEY is required to generate vector embeddings.")
    embeddings = OpenAIEmbeddings(model=_EMBEDDING_MODEL, api_key=settings.openai_api_key)
    return await embeddings.aembed_query(_embedding_input(sheet_name, column_names))


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


