"""Unit tests for ETL profiler and column stats."""
from __future__ import annotations

import pandas as pd

from universal_ai_ingestor.core.etl_engine import (
    _calculate_column_stats,
    workbook_payload_from_sheets,
)


def test_calculate_column_stats_empty_dataframe() -> None:
    """Empty DataFrame returns empty stats."""
    df = pd.DataFrame()
    stats = _calculate_column_stats(df)
    assert stats == {}


def test_calculate_column_stats_basic() -> None:
    """Computes null_percent, unique_count, min_length, max_length for each column."""
    df = pd.DataFrame({
        "A": [1, 2, 3, None, 5],
        "B": ["short", "longertext", "x", "y", "z"],
        "C": ["a", "a", "b", "b", "b"],
    })
    stats = _calculate_column_stats(df)
    assert "A" in stats
    assert "B" in stats
    assert "C" in stats
    assert stats["A"]["null_percent"] == 20.0
    assert stats["A"]["unique_count"] == 4
    assert stats["A"]["min_length"] == 1
    assert stats["A"]["max_length"] == 1
    assert stats["A"]["numeric_ratio"] == 0.8
    assert stats["B"]["min_length"] == 1
    assert stats["B"]["max_length"] == 10
    assert stats["C"]["unique_count"] == 2


def test_calculate_column_stats_detects_patterns() -> None:
    """Profiler should expose semantic hints for common column patterns."""
    df = pd.DataFrame({
        "Email": ["a@example.com", "b@example.com", None],
        "Website": ["https://a.com", "https://b.com", "www.c.com"],
        "GPS": ["45.123, -1.456", "46.000, -2.000", "47.5, -3.1"],
        "Codes": ["A1;B2", "C3;D4", "E5;F6"],
        "Ref": ["HOT_001", "HOT_002", "HOT_003"],
    })
    stats = _calculate_column_stats(df)
    assert stats["Email"]["email_ratio"] >= 0.66
    assert stats["Email"]["semantic_type_hint"] == "email"
    assert stats["Website"]["url_ratio"] == 1.0
    assert stats["GPS"]["gps_ratio"] == 1.0
    assert stats["Codes"]["dominant_delimiter"] == ";"
    assert stats["Codes"]["multi_value_ratio"] == 1.0
    assert stats["Ref"]["id_like_ratio"] == 1.0


def test_workbook_payload_includes_column_stats() -> None:
    """workbook_payload_from_sheets attaches column_stats to SheetSample."""
    sheets = {
        "Sheet1": pd.DataFrame({"Nom": ["A", "B"], "Age": [25, 30]}),
    }
    payload = workbook_payload_from_sheets(sheets)
    assert len(payload.sheets) == 1
    assert payload.sheets[0].column_stats
    assert "Nom" in payload.sheets[0].column_stats
    assert "Age" in payload.sheets[0].column_stats
    assert payload.sheets[0].column_stats["Nom"]["null_percent"] == 0.0
    assert payload.sheets[0].column_stats["Nom"]["unique_count"] == 2
    assert payload.sheets[0].column_stats["Nom"]["min_length"] == 1
