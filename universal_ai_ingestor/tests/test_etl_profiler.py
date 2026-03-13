"""Unit tests for ETL profiler and semantic split-list normalization."""
from __future__ import annotations

import pandas as pd

from universal_ai_ingestor.core.etl_engine import (
    _build_semantic_split_rows,
    _calculate_column_stats,
    _canonicalize_reference_token,
    apply_mapping_by_table,
    workbook_payload_from_sheets,
)
from universal_ai_ingestor.core.schemas import MappingPlan, MappingTarget


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


def test_canonicalize_reference_token_folds_common_synonyms() -> None:
    assert _canonicalize_reference_token("amenity", "Wi-Fi") == "wifi"
    assert _canonicalize_reference_token("amenity", "free internet") == "wifi"
    assert _canonicalize_reference_token("amenity", "parking gratuit") == "parking"
    assert _canonicalize_reference_token("payment_method", "ANCV") == "cheque_vacances"
    assert _canonicalize_reference_token("payment_method", "cash") == "especes"


def test_build_semantic_split_rows_deduplicates_semantic_matches() -> None:
    table_df = pd.DataFrame(
        {
            "amenity_code": ["Wi-Fi;free internet;parking gratuit"],
            "source_sheet": ["Feuil1"],
        }
    )
    rows = _build_semantic_split_rows(
        batch_id="batch-1",
        table_name="object_amenity_temp",
        table_df=table_df,
        object_keys=["obj::1"],
        mapping_source_label="approved_contract",
    )
    assert rows == [
        {
            "import_batch_id": "batch-1",
            "staging_object_key": "obj::1",
            "amenity_code": "wifi",
            "source_sheet": "Feuil1",
            "raw_relation_token": "Wi-Fi",
            "raw_source_data": {
                "mapping_source": "approved_contract",
                "table": "object_amenity_temp",
                "source_value": "Wi-Fi;free internet;parking gratuit",
            },
            "resolution_status": "pending",
            "is_approved": True,
        },
        {
            "import_batch_id": "batch-1",
            "staging_object_key": "obj::1",
            "amenity_code": "parking",
            "source_sheet": "Feuil1",
            "raw_relation_token": "parking gratuit",
            "raw_source_data": {
                "mapping_source": "approved_contract",
                "table": "object_amenity_temp",
                "source_value": "Wi-Fi;free internet;parking gratuit",
            },
            "resolution_status": "pending",
            "is_approved": True,
        },
    ]


def test_apply_mapping_by_table_concat_text_recomposes_address() -> None:
    df = pd.DataFrame({
        "Numero": ["12", "8"],
        "TypeVoie": ["rue", "avenue"],
        "NomVoie": ["de la Paix", "Victor Hugo"],
        "Ville": ["Paris", "Lyon"],
    })
    plan = MappingPlan(
        source_format="xlsx",
        confidence=1.0,
        targets=[
            MappingTarget(table="object_location_temp", column="address1", transform="concat_text", source_key="Numero"),
            MappingTarget(table="object_location_temp", column="address1", transform="concat_text", source_key="TypeVoie"),
            MappingTarget(table="object_location_temp", column="address1", transform="concat_text", source_key="NomVoie"),
            MappingTarget(table="object_location_temp", column="city", transform="identity", source_key="Ville"),
        ],
    )
    table_outputs = apply_mapping_by_table(df, plan)
    location_df = table_outputs["object_location_temp"]
    assert location_df["address1"].tolist() == ["12 rue de la Paix", "8 avenue Victor Hugo"]
    assert location_df["city"].tolist() == ["Paris", "Lyon"]
