"""Identity agent responsible for the canonical establishment record."""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

from ..ai import LLMClient
from ..schemas import AgentContext, IdentityRecord
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


OBJECT_ID_PATTERN = re.compile(r"^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$")


class IdentityAgent(AIEnabledAgent):
    name = "identity"
    description = "Creates or updates the canonical establishment entry."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = [
            "establishment_id",
            "establishment_name",
            "category",
            "subcategory",
            "description",
            "legacy_ids",
        ]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        record = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=IdentityRecord,
        )

        if record.object_id and not OBJECT_ID_PATTERN.match(record.object_id):
            self.telemetry.record(
                "agent.identity.object_id.reset",
                {
                    "context": context.model_dump(),
                    "provided_id": record.object_id,
                },
            )
            record.object_id = None
            context.object_id = None

        data = record.to_supabase()

        matched_existing = None
        latitude = longitude = None
        if not record.object_id:
            latitude, longitude = self._extract_coordinates(context.source_payload)
            matched_existing = await self.supabase.find_existing_object(
                name=record.name,
                latitude=latitude,
                longitude=longitude,
                category=record.category_code,
                subcategory=record.subcategory_code,
            )
            if matched_existing and matched_existing.get("id"):
                record.object_id = matched_existing["id"]
                data["id"] = matched_existing["id"]
                context.object_id = matched_existing["id"]
                context.duplicate_of = matched_existing["id"]

        self.telemetry.record(
            "agent.identity.transform",
            {"context": context.model_dump(), "payload": payload, "record": record.model_dump(), "data": data},
        )

        response = await self.supabase.upsert("object", data, on_conflict="id")
        object_id = record.object_id or self._extract_object_id(response)
        if object_id:
            record.object_id = object_id
            context.object_id = object_id

        organization_id = context.source_organization_id or self._extract_organization_id(
            context.source_payload
        )
        external_id_results = []
        if object_id and organization_id and record.legacy_ids:
            external_id_results = await self.supabase.record_external_ids(
                object_id=object_id,
                organization_id=organization_id,
                external_ids=record.legacy_ids,
            )

        if matched_existing:
            self.telemetry.record(
                "agent.identity.dedup",
                {
                    "context": context.model_dump(),
                    "matched": matched_existing,
                    "latitude": latitude,
                    "longitude": longitude,
                },
            )

        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object",
            "response": response,
            "object_id": object_id,
            "duplicate_of": matched_existing.get("id") if matched_existing else None,
            "external_ids": external_id_results,
        }

    def _extract_object_id(self, response: Dict[str, Any]) -> Optional[str]:
        if not isinstance(response, dict):
            return None
        data = response.get("data")
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict) and first.get("id"):
                return str(first["id"])
        if response.get("id"):
            return str(response["id"])
        return None

    def _extract_coordinates(self, payload: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
        latitude: Optional[float] = None
        longitude: Optional[float] = None

        if not payload:
            return None, None

        def coerce(value: Any) -> Optional[float]:
            if value is None:
                return None
            try:
                text = str(value).strip().replace(",", ".")
                if not text:
                    return None
                return float(text)
            except (TypeError, ValueError):
                return None

        def parse_string(key: str, value: str) -> None:
            nonlocal latitude, longitude
            key_lower = key.lower()
            if not any(token in key_lower for token in ("lat", "lon", "lng", "coord", "gps")):
                return
            matches = re.findall(r"-?\d+(?:[\.,]\d+)?", value)
            if len(matches) >= 2:
                if latitude is None:
                    latitude = coerce(matches[0])
                if longitude is None:
                    longitude = coerce(matches[1])

        def visit(obj: Any, key: str = "") -> None:
            nonlocal latitude, longitude
            if latitude is not None and longitude is not None:
                return
            if isinstance(obj, dict):
                for child_key, child_value in obj.items():
                    visit(child_value, child_key)
            elif isinstance(obj, (list, tuple)):
                for item in obj:
                    visit(item, key)
            elif isinstance(obj, str):
                parse_string(key, obj)
                if latitude is None or longitude is None:
                    if "," in obj or ";" in obj:
                        parts = re.split(r"[,;]", obj)
                        if len(parts) >= 2:
                            lat_candidate = coerce(parts[0])
                            lon_candidate = coerce(parts[1])
                            latitude = latitude or lat_candidate
                            longitude = longitude or lon_candidate
            else:
                key_lower = key.lower()
                value = coerce(obj)
                if value is not None:
                    if "lat" in key_lower and latitude is None:
                        latitude = value
                    elif any(token in key_lower for token in ("lon", "lng", "long")) and longitude is None:
                        longitude = value

        visit(payload)
        return latitude, longitude

    def _extract_organization_id(self, payload: Dict[str, Any]) -> Optional[str]:
        candidate_keys = (
            "organization_id",
            "organization_object_id",
            "source_organization_id",
            "dataprovidingorg",
            "provider_id",
            "provider_organization_id",
            "owner_id",
        )

        def visit(obj: Any) -> Optional[str]:
            if isinstance(obj, dict):
                for key, value in obj.items():
                    key_lower = key.lower()
                    if any(candidate in key_lower for candidate in candidate_keys):
                        if isinstance(value, (str, int)):
                            text = str(value).strip()
                            if text:
                                return text
                    result = visit(value)
                    if result:
                        return result
            elif isinstance(obj, (list, tuple)):
                for item in obj:
                    result = visit(item)
                    if result:
                        return result
            return None

        return visit(payload or {})


__all__ = ["IdentityAgent"]
