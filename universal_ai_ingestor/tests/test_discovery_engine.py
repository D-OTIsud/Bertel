from __future__ import annotations

import pandas as pd

from universal_ai_ingestor.core.discovery_engine import build_discovery_contract


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
    assert ("contact_channel_temp", "value") in mapped_targets


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
