"""Supabase wrapper that degrades gracefully when credentials are missing."""

from __future__ import annotations

import asyncio
import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from supabase import Client, create_client

from .telemetry import EventLog


class SupabaseService:
    """Facade encapsulating Supabase interactions."""

    def __init__(self, url: Optional[str], key: Optional[str], telemetry: EventLog):
        self.telemetry = telemetry
        self._client: Optional[Client] = None
        self._lookup_cache: Dict[Tuple[str, str, str], Optional[str]] = {}
        if url and key:
            self._client = create_client(url, key)
            self.telemetry.record(
                "supabase.connected",
                {"url": url},
            )
        else:
            self.telemetry.record(
                "supabase.disabled",
                {"reason": "missing credentials"},
            )

    @property
    def client(self) -> Optional[Client]:
        return self._client

    async def upsert(
        self,
        table: str,
        data: Union[Dict[str, Any], Sequence[Dict[str, Any]]],
        *,
        on_conflict: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upsert data into a given table."""

        if not self._client:
            payload = {
                "table": table,
                "data": data,
                "on_conflict": on_conflict,
            }
            self.telemetry.record("supabase.skipped", payload)
            return {"status": "skipped", "reason": "no credentials", "payload": payload}

        def _execute() -> Dict[str, Any]:
            query = self._client.table(table).upsert(data)
            if on_conflict:
                query = query.on_conflict(on_conflict)
            response = query.execute()
            return getattr(response, "model_dump", lambda: response.__dict__)()

        try:
            result = await asyncio.to_thread(_execute)
            self.telemetry.record(
                "supabase.upsert",
                {"table": table, "data": data, "on_conflict": on_conflict, "response": result},
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive logging
            self.telemetry.record(
                "supabase.error",
                {"table": table, "data": data, "error": str(exc)},
            )
            raise

    async def lookup(self, table: str, *, code: str, code_field: str = "code") -> Optional[str]:
        """Resolve a reference code to its primary key."""

        normalized_code = self.normalize_code(code) if code_field == "code" else str(code)
        cache_key = (table, code_field, normalized_code)
        if cache_key in self._lookup_cache:
            return self._lookup_cache[cache_key]

        if not normalized_code:
            self._lookup_cache[cache_key] = None
            return None

        if not self._client:
            self._lookup_cache[cache_key] = None
            self.telemetry.record(
                "supabase.lookup.skipped",
                {"table": table, "code": code, "reason": "no credentials"},
            )
            return None

        def _execute() -> Optional[str]:
            response = (
                self._client.table(table)
                .select("id")
                .eq(code_field, normalized_code)
                .limit(1)
                .execute()
            )
            data: Optional[List[Dict[str, Any]]] = None
            if hasattr(response, "data"):
                data = response.data  # type: ignore[assignment]
            elif isinstance(response, dict):
                data = response.get("data")  # type: ignore[assignment]
            else:
                data = getattr(response, "__dict__", {}).get("data")
            if data:
                first = data[0]
                if isinstance(first, dict):
                    return str(first.get("id")) if first.get("id") else None
            return None

        identifier = await asyncio.to_thread(_execute)
        self._lookup_cache[cache_key] = identifier
        self.telemetry.record(
            "supabase.lookup",
            {
                "table": table,
                "code": normalized_code,
                "code_field": code_field,
                "resolved_id": identifier,
            },
        )
        return identifier

    def normalize_code(self, code: str) -> str:
        """Normalise a label/code into the DLL slug format."""

        text = unicodedata.normalize("NFKD", str(code))
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        text = re.sub(r"[^a-z0-9]+", "_", text.lower())
        return text.strip("_")

    async def ensure_code(
        self,
        *,
        domain: str,
        code: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        """Ensure a ref_code entry exists and return its identifier."""

        normalized_code = self.normalize_code(code)
        existing = await self.lookup(f"ref_code_{domain}", code=normalized_code)
        if existing:
            return existing

        payload = {
            "domain": domain,
            "code": normalized_code,
            "name": name or code.title(),
        }
        if description:
            payload["description"] = description
        if metadata:
            payload["metadata"] = metadata

        await self.upsert("ref_code", payload, on_conflict="domain,code")
        cache_key = (f"ref_code_{domain}", "code", normalized_code)
        self._lookup_cache.pop(cache_key, None)
        return await self.lookup(f"ref_code_{domain}", code=normalized_code)

    async def ensure_amenity(
        self,
        *,
        code: str,
        name: Optional[str],
        family_code: Optional[str] = None,
    ) -> Optional[str]:
        """Ensure an amenity exists in the reference table."""

        normalized_code = self.normalize_code(code)
        existing = await self.lookup("ref_amenity", code=normalized_code)
        if existing:
            return existing

        family_slug = self.normalize_code(family_code) if family_code else "services"
        family_id = await self.ensure_code(domain="amenity_family", code=family_slug, name=family_code or "Services")

        payload = {
            "code": normalized_code,
            "name": name or normalized_code.replace("_", " ").title(),
            "family_id": family_id,
            "scope": "object",
        }

        response = await self.upsert("ref_amenity", payload, on_conflict="code")
        data = response.get("data") if isinstance(response, dict) else None
        if isinstance(data, list) and data:
            identifier = data[0].get("id")
            return str(identifier) if identifier else await self.lookup("ref_amenity", code=normalized_code)
        cache_key = ("ref_amenity", "code", normalized_code)
        self._lookup_cache.pop(cache_key, None)
        return await self.lookup("ref_amenity", code=normalized_code)

    async def ensure_language(self, *, code: str, name: Optional[str] = None) -> Optional[str]:
        """Ensure a language exists in the reference table."""

        normalized_code = str(code).strip().lower()
        if not normalized_code:
            return None
        existing = await self.lookup("ref_language", code=normalized_code)
        if existing:
            return existing

        payload = {
            "code": normalized_code,
            "name": name or normalized_code.upper(),
        }

        await self.upsert("ref_language", payload, on_conflict="code")
        cache_key = ("ref_language", "code", normalized_code)
        self._lookup_cache.pop(cache_key, None)
        return await self.lookup("ref_language", code=normalized_code)

    async def find_existing_object(
        self,
        *,
        name: Optional[str],
        latitude: Optional[float],
        longitude: Optional[float],
        category: Optional[str],
        subcategory: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Find an existing object matching the provided identity features."""

        if not self._client:
            self.telemetry.record(
                "supabase.dedup.skipped",
                {
                    "reason": "no credentials",
                    "name": name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "category": category,
                    "subcategory": subcategory,
                },
            )
            return None

        def _extract_data(response: Any) -> List[Dict[str, Any]]:
            if hasattr(response, "data"):
                return getattr(response, "data") or []  # type: ignore[return-value]
            if isinstance(response, dict):
                data = response.get("data")
                if isinstance(data, list):
                    return data
            return getattr(response, "__dict__", {}).get("data", []) or []

        def _matches_category(candidate: Dict[str, Any]) -> bool:
            extra = candidate.get("extra") or {}
            candidate_category = (extra.get("category") or "").lower() if isinstance(extra, dict) else None
            candidate_subcategory = (extra.get("subcategory") or "").lower() if isinstance(extra, dict) else None

            def _normalize(value: Optional[str]) -> Optional[str]:
                return value.lower() if isinstance(value, str) else None

            category_match = not category or not candidate_category or _normalize(category) == candidate_category
            subcategory_match = not subcategory or not candidate_subcategory or _normalize(subcategory) == candidate_subcategory
            return category_match and subcategory_match

        def _fetch_objects(object_ids: Iterable[str]) -> List[Dict[str, Any]]:
            unique_ids: List[str] = [oid for oid in dict.fromkeys(object_ids) if oid]
            if not unique_ids:
                return []
            response = (
                self._client.table("object")
                .select("id,name,object_type,extra")
                .in_("id", unique_ids)
                .execute()
            )
            return _extract_data(response)

        def _execute() -> Optional[Dict[str, Any]]:
            coordinate_candidates: List[Dict[str, Any]] = []
            if latitude is not None and longitude is not None:
                location_response = (
                    self._client.table("object_location")
                    .select("object_id,latitude,longitude")
                    .eq("latitude", latitude)
                    .eq("longitude", longitude)
                    .execute()
                )
                coordinate_ids = [row.get("object_id") for row in _extract_data(location_response) if isinstance(row, dict)]
                coordinate_candidates = _fetch_objects(oid for oid in coordinate_ids if oid)

            for candidate in coordinate_candidates:
                if not isinstance(candidate, dict):
                    continue
                if _matches_category(candidate):
                    candidate["match_reason"] = "coordinates"
                    return candidate

            name_candidates: List[Dict[str, Any]] = []
            if name:
                query = self._client.table("object").select("id,name,object_type,extra")
                ilike_method = getattr(query, "ilike", None)
                if callable(ilike_method):
                    query = ilike_method("name", name)
                else:
                    query = query.eq("name", name)
                name_response = query.execute()
                name_candidates = _extract_data(name_response)

            for candidate in name_candidates:
                if not isinstance(candidate, dict):
                    continue
                if _matches_category(candidate):
                    candidate["match_reason"] = "name"
                    return candidate
            return None

        try:
            match = await asyncio.to_thread(_execute)
            self.telemetry.record(
                "supabase.dedup.lookup",
                {
                    "name": name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "category": category,
                    "subcategory": subcategory,
                    "match": match,
                },
            )
            return match
        except Exception as exc:  # pragma: no cover - defensive logging
            self.telemetry.record(
                "supabase.dedup.error",
                {
                    "name": name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "category": category,
                    "subcategory": subcategory,
                    "error": str(exc),
                },
            )
            return None

    async def record_external_ids(
        self,
        *,
        object_id: str,
        organization_id: str,
        external_ids: Sequence[str],
    ) -> List[Dict[str, Any]]:
        """Persist external identifiers linked to an object."""

        normalized_ids = [str(identifier) for identifier in dict.fromkeys(external_ids) if identifier]
        if not normalized_ids or not object_id or not organization_id:
            return []

        payload = [
            {
                "object_id": object_id,
                "organization_object_id": organization_id,
                "external_id": identifier,
            }
            for identifier in normalized_ids
        ]

        if not self._client:
            self.telemetry.record(
                "supabase.external_ids.skipped",
                {
                    "reason": "no credentials",
                    "object_id": object_id,
                    "organization_id": organization_id,
                    "external_ids": normalized_ids,
                },
            )
            return []

        def _execute() -> Dict[str, Any]:
            response = (
                self._client.table("object_external_id")
                .upsert(payload)
                .on_conflict("organization_object_id,external_id")
                .execute()
            )
            return getattr(response, "model_dump", lambda: response.__dict__)()

        try:
            result = await asyncio.to_thread(_execute)
            self.telemetry.record(
                "supabase.external_ids.upsert",
                {
                    "object_id": object_id,
                    "organization_id": organization_id,
                    "external_ids": normalized_ids,
                    "response": result,
                },
            )
            data = result.get("data") if isinstance(result, dict) else None
            return data if isinstance(data, list) else []
        except Exception as exc:  # pragma: no cover - defensive logging
            self.telemetry.record(
                "supabase.external_ids.error",
                {
                    "object_id": object_id,
                    "organization_id": organization_id,
                    "external_ids": normalized_ids,
                    "error": str(exc),
                },
            )
            return []


__all__ = ["SupabaseService"]
