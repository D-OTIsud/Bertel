"""Pydantic models shared across the application."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Sequence

from pydantic import BaseModel, Field, model_validator


class RawEstablishmentPayload(BaseModel):
    """Envelope received from external systems."""

    establishment_name: str = Field(..., alias="name")
    establishment_category: Optional[str] = Field(None, alias="category")
    establishment_subcategory: Optional[str] = Field(None, alias="subcategory")
    source_organization_id: Optional[str] = Field(None, alias="dataProvidingOrg")
    legacy_ids: Optional[List[str]] = None
    data: Dict[str, Any] = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }

    @model_validator(mode="before")
    @classmethod
    def _coerce_payload(cls, value: Any) -> Any:
        """Normalise legacy list-based payloads into a dictionary."""

        raw_text: Optional[str] = None

        if isinstance(value, (bytes, bytearray)):
            try:
                value = value.decode("utf-8")
            except UnicodeDecodeError:
                value = value.decode("latin-1", errors="ignore")

        if isinstance(value, str):
            raw_text = value
            parsed = cls._parse_string_payload(value)
            value = parsed

        if isinstance(value, list):
            pass
        elif not isinstance(value, dict):
            value = {"data": {}}

        def _as_list(obj: Any) -> List[Dict[str, Any]]:
            if isinstance(obj, list):
                return [item for item in obj if isinstance(item, dict)]
            if isinstance(obj, dict):
                return [obj]
            return []

        def _split_values(raw: Optional[str]) -> List[str]:
            if not raw:
                return []
            if isinstance(raw, str):
                parts = [item.strip() for item in re.split(r"[,;/]", raw) if item.strip()]
                return parts
            if isinstance(raw, (list, tuple)):
                return [str(item).strip() for item in raw if str(item).strip()]
            return []

        def _coerce_float(raw_value: Any) -> Optional[float]:
            if raw_value is None:
                return None
            try:
                text = str(raw_value).strip().replace(",", ".")
                if not text:
                    return None
                return float(text)
            except (TypeError, ValueError):
                return None

        def _parse_coordinates(raw: Optional[str]) -> tuple[Optional[float], Optional[float]]:
            if not raw:
                return None, None
            try:
                parts = re.findall(r"-?\d+(?:[\.,]\d+)?", str(raw))
                if len(parts) >= 2:
                    lat = float(parts[0].replace(",", "."))
                    lon = float(parts[1].replace(",", "."))
                    return lat, lon
            except (TypeError, ValueError):
                return None, None
            return None, None

        raw_blocks: List[Dict[str, Any]] = []

        if isinstance(value, list):
            if not value:
                return {}
            raw_batch = value
            primary = value[0]
            extras = value[1:]
            if isinstance(primary, dict):
                value = dict(primary)
                value.setdefault("data", {})
                if not isinstance(value["data"], dict):
                    value["data"] = {}
                value["data"].setdefault("raw_batch", raw_batch)
                raw_blocks = _as_list(raw_batch)
            else:
                value = {"data": {}}
            if extras:
                value.setdefault("data", {})
                value["data"]["additional_batches"] = extras

        if not isinstance(value, dict):
            return value

        if "data" in value and not isinstance(value["data"], dict):
            value["data"] = {}

        if raw_text:
            value.setdefault("data", {})
            if isinstance(value["data"], dict) and "raw_payload" not in value["data"]:
                value["data"]["raw_payload"] = raw_text

        payload_data = value.get("data")
        queue: List[Dict[str, Any]] = list(raw_blocks) if raw_blocks else _as_list(payload_data)
        if isinstance(value, dict):
            top_level = {
                key: entry
                for key, entry in value.items()
                if key not in {"data", "legacy_ids"}
            }
            if top_level:
                queue.insert(0, top_level)
        main_record: Dict[str, Any] = {}
        additional_sections: Dict[str, Any] = {}

        while queue:
            block = queue.pop(0)
            if not isinstance(block, dict):
                continue
            if "data" in block and isinstance(block["data"], list):
                additional_sections.setdefault("raw_blocks", []).append(block["data"])
                queue.extend(_as_list(block["data"]))
                continue
            if "Presta ID" in block:
                additional_sections.setdefault("providers", []).append(block)
                continue
            if "Horaires_id" in block:
                additional_sections.setdefault("schedule", []).append(block)
                continue
            if "id_multimedia" in block:
                media_item = {
                    "url": block.get("lien") or block.get("url"),
                    "description": block.get("description"),
                    "title": block.get("description"),
                    "is_main": block.get("principale"),
                    "media_type": (block.get("type") or "").split("/")[0],
                    "metadata": block,
                }
                additional_sections.setdefault("media", []).append(media_item)
                continue
            if "Id_Tarifs" in block:
                additional_sections.setdefault("tariffs", []).append(block)
                continue
            if "Type_R_S" in block:
                social_item = {
                    "network": block.get("Type_R_S"),
                    "url": block.get("URL"),
                }
                additional_sections.setdefault("socials", []).append(social_item)
                continue
            main_record.update(block)

        value.setdefault("legacy_ids", [])
        legacy_candidates = []
        for key in ("id OTI", "ID_IRT", "Num taxe de séjour", "temp_ID_Presta"):
            candidate = main_record.get(key)
            if candidate:
                legacy_candidates.append(str(candidate))
        existing_legacy = cls._ensure_sequence(value.get("legacy_ids"))
        value["legacy_ids"] = list(dict.fromkeys([*existing_legacy, *legacy_candidates]))

        if main_record:
            value["name"] = value.get("name") or main_record.get("Nom_OTI") or main_record.get("Nom") or main_record.get("Nom établissement")
            value["category"] = value.get("category") or main_record.get("Nom catégorie") or main_record.get("Groupe catégorie")
            value["subcategory"] = value.get("subcategory") or main_record.get("Nom sous catégorie")

            address_parts = [str(main_record.get("Numéro")) if main_record.get("Numéro") else None, main_record.get("rue")]
            address_line1 = " ".join(part for part in address_parts if part).strip() or None
            latitude, longitude = _parse_coordinates(main_record.get("Coordonnées GPS"))
            latitude = latitude if latitude is not None else _coerce_float(main_record.get("latitude"))
            longitude = longitude if longitude is not None else _coerce_float(main_record.get("longitude"))

            description = main_record.get("Descriptif OTI") or main_record.get("Descriptif du plan d'accès")
            summary = main_record.get("Accroche OTI")

            structured = {
                "address_line1": address_line1,
                "address_line2": main_record.get("Lieux-dits"),
                "postcode": str(main_record.get("Code Postal")) if main_record.get("Code Postal") else None,
                "city": main_record.get("ville"),
                "latitude": latitude,
                "longitude": longitude,
                "description": description,
                "summary": summary,
                "status": main_record.get("Status"),
                "amenities": _split_values(main_record.get("Prestations sur place")),
                "nearby_services": _split_values(main_record.get("Prestations à proximité")),
                "payment_methods": _split_values(main_record.get("Mode de paiement")),
                "languages": _split_values(main_record.get("Langues")),
                "email": main_record.get("E-Mail"),
                "phone": [
                    phone
                    for phone in [
                        main_record.get("Contact principale"),
                        main_record.get("Autre téléphone"),
                    ]
                    if phone
                ],
                "website": main_record.get("Web"),
                "raw_main_record": main_record,
                "main_media": main_record.get("Main_Img"),
                "accessibility": main_record.get("Handicap"),
                "pets_allowed": main_record.get("Animaux"),
                "source_status": main_record.get("SIT"),
            }

            value.setdefault("data", {})
            for key, entry in structured.items():
                if entry not in (None, [], ""):
                    value["data"][key] = entry

        if additional_sections:
            value.setdefault("data", {})
            for key, entry in additional_sections.items():
                value["data"][key] = entry

        return value

    @staticmethod
    def _parse_string_payload(raw: str) -> Any:
        stripped = raw.strip()
        if not stripped:
            return {"data": {"raw_payload": raw}}

        # JSON payloads
        try:
            parsed = json.loads(stripped)
            return parsed
        except (json.JSONDecodeError, TypeError):
            pass

        # XML payloads
        try:
            root = ET.fromstring(stripped)
        except ET.ParseError:
            root = None

        if root is not None:
            parsed_xml = RawEstablishmentPayload._collapse_single_key(
                RawEstablishmentPayload._etree_to_object(root)
            )
            if isinstance(parsed_xml, dict):
                parsed_xml.setdefault("data", {})
                if isinstance(parsed_xml["data"], dict):
                    parsed_xml["data"].setdefault("raw_xml_tag", root.tag)
                return parsed_xml
            return {"data": {"raw_payload": raw, "raw_xml_tag": root.tag}}

        # Key-value style text payloads
        kv_pairs: Dict[str, Any] = {}
        for line in re.split(r"[\r\n;]+", stripped):
            if not line.strip():
                continue
            if ":" in line:
                key, value = line.split(":", 1)
            elif "=" in line:
                key, value = line.split("=", 1)
            else:
                continue
            key = key.strip()
            value = value.strip()
            if key:
                kv_pairs[key] = value

        if kv_pairs:
            return kv_pairs

        return {"data": {"raw_payload": raw}}

    @staticmethod
    def _etree_to_object(element: ET.Element) -> Dict[str, Any]:
        def convert(node: ET.Element) -> Any:
            children = list(node)
            attribs = {f"@{k}": v for k, v in node.attrib.items()}
            text = (node.text or "").strip()

            if not children:
                if attribs and text:
                    attribs["#text"] = text
                    return attribs
                if attribs:
                    return attribs
                return text or None

            result: Dict[str, Any] = dict(attribs)
            for child in children:
                child_value = convert(child)
                if child.tag in result:
                    existing = result[child.tag]
                    if not isinstance(existing, list):
                        result[child.tag] = [existing]
                    result[child.tag].append(child_value)
                else:
                    result[child.tag] = child_value
            if text:
                result.setdefault("#text", text)
            return result

        return {element.tag: convert(element)}

    @staticmethod
    def _collapse_single_key(value: Any) -> Any:
        if isinstance(value, dict) and len(value) == 1:
            inner_value = next(iter(value.values()))
            if isinstance(inner_value, dict):
                return RawEstablishmentPayload._collapse_single_key(inner_value)
            return inner_value
        return value

    @staticmethod
    def _ensure_sequence(value: Any) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, (list, tuple, set)):
            return [str(item) for item in value if str(item).strip()]
        if isinstance(value, dict):
            collected: List[str] = []
            for item in value.values():
                if isinstance(item, (list, tuple, set)):
                    collected.extend(str(child) for child in item if str(child).strip())
                elif isinstance(item, dict):
                    collected.extend(RawEstablishmentPayload._ensure_sequence(item))
                else:
                    text = str(item).strip()
                    if text:
                        collected.append(text)
            return collected
        if isinstance(value, Sequence):
            return [str(item) for item in value if str(item).strip()]
        text = str(value).strip()
        return [text] if text else []


class RoutedFragment(BaseModel):
    """Fragment routed to a specialised agent."""

    agent: str
    status: str
    message: Optional[str] = None
    payload: Dict[str, Any]


class IngestionResponse(BaseModel):
    """Response returned to the caller of the ingestion endpoint."""

    establishment_name: str
    routed_fragments: List[RoutedFragment]
    unresolved_fragments: Dict[str, Any]


class AgentDescriptor(BaseModel):
    """Describe an agent for the dashboard."""

    name: str
    description: str
    expected_fields: List[str]


class AgentContext(BaseModel):
    """Context shared with agents while processing a payload."""

    coordinator_id: str
    source_payload: Dict[str, Any]
    object_id: Optional[str] = None
    duplicate_of: Optional[str] = None
    source_organization_id: Optional[str] = None


class FieldAssignment(BaseModel):
    """Assignment produced by the semantic router."""

    field_name: str
    agent: str
    target_attribute: Optional[str] = None
    reasoning: Optional[str] = None


class FieldRoutingDecision(BaseModel):
    """Decision payload returned by the LLM router."""

    assignments: List[FieldAssignment]
    leftovers: Dict[str, Any] = Field(default_factory=dict)
    sections: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class IdentityRecord(BaseModel):
    """Structured representation of the `object` table."""

    object_id: Optional[str] = None
    object_type: str
    name: str
    description: Optional[str] = None
    status: str = "draft"
    category_code: Optional[str] = None
    subcategory_code: Optional[str] = None
    legacy_ids: List[str] = Field(default_factory=list)
    region_code: Optional[str] = None
    source_extra: Dict[str, Any] = Field(default_factory=dict)

    def to_supabase(self) -> Dict[str, Any]:
        extra: Dict[str, Any] = {
            "category": self.category_code,
            "subcategory": self.subcategory_code,
        }
        if self.legacy_ids:
            extra["legacy_ids"] = self.legacy_ids
        if self.description:
            extra.setdefault("descriptions", {})["default"] = self.description
        if self.source_extra:
            extra["source_payload"] = self.source_extra

        payload = {
            "object_type": self.object_type,
            "name": self.name,
            "status": self.status,
        }
        if self.object_id:
            payload["id"] = self.object_id
        if self.region_code:
            payload["region_code"] = self.region_code
        cleaned_extra = {k: v for k, v in extra.items() if v not in (None, [], {}, "")}
        if cleaned_extra:
            payload["extra"] = cleaned_extra
        return payload


class LocationRecord(BaseModel):
    """Structured representation of `object_location`."""

    object_id: Optional[str]
    address1: Optional[str] = None
    address2: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    code_insee: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_main_location: bool = True

    def to_supabase(self) -> Dict[str, Any]:
        return {
            "object_id": self.object_id,
            "address1": self.address1,
            "address2": self.address2,
            "postcode": self.postcode,
            "city": self.city,
            "code_insee": self.code_insee,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "is_main_location": self.is_main_location,
        }


class LocationTransformation(BaseModel):
    locations: List[LocationRecord]


class ContactChannelRecord(BaseModel):
    """Representation of `contact_channel`."""

    object_id: Optional[str]
    value: str
    kind_code: str
    role_code: Optional[str] = None
    is_primary: Optional[bool] = None

    def to_supabase(self, *, kind_id: Optional[str], role_id: Optional[str]) -> Dict[str, Any]:
        payload = {
            "object_id": self.object_id,
            "value": self.value,
            "is_primary": self.is_primary,
        }
        if kind_id:
            payload["kind_id"] = kind_id
        if role_id:
            payload["role_id"] = role_id
        metadata: Dict[str, Any] = {"kind_code": self.kind_code}
        if self.role_code:
            metadata["role_code"] = self.role_code
        if metadata:
            payload.setdefault("extra", {})
            payload["extra"].update(metadata)
        return payload


class ContactTransformation(BaseModel):
    channels: List[ContactChannelRecord]


class AmenityLinkRecord(BaseModel):
    """Representation of the `object_amenity` relation."""

    object_id: Optional[str]
    amenity_code: str
    amenity_name: Optional[str] = None
    amenity_family_code: Optional[str] = None
    raw_label: Optional[str] = None

    def to_supabase(self, *, amenity_id: Optional[str]) -> Dict[str, Any]:
        payload = {
            "object_id": self.object_id,
            "amenity_id": amenity_id,
        }
        if self.raw_label:
            payload["extra"] = {"raw_label": self.raw_label}
        if not amenity_id:
            payload.setdefault("extra", {})
            payload["extra"]["amenity_code"] = self.amenity_code
            if self.amenity_name:
                payload["extra"]["amenity_name"] = self.amenity_name
        return payload


class AmenityTransformation(BaseModel):
    amenities: List[AmenityLinkRecord]


class MediaRecord(BaseModel):
    """Representation of the `media` table."""

    object_id: Optional[str]
    url: str
    media_type_code: str
    title: Optional[str] = None
    description: Optional[str] = None
    credit: Optional[str] = None
    is_main: Optional[bool] = None

    def to_supabase(self, *, media_type_id: Optional[str]) -> Dict[str, Any]:
        payload = {
            "object_id": self.object_id,
            "url": self.url,
            "media_type_id": media_type_id,
            "title": self.title,
            "description": self.description,
            "credit": self.credit,
            "is_main": self.is_main,
        }
        if not media_type_id:
            payload.setdefault("extra", {})
            payload["extra"]["media_type_code"] = self.media_type_code
        return payload


class MediaTransformation(BaseModel):
    media: List[MediaRecord]


class ProviderRecord(BaseModel):
    """Structured representation of a provider (prestataire)."""
    
    provider_id: Optional[str] = None
    last_name: str
    first_name: str
    gender: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    function: Optional[str] = None
    newsletter: bool = False
    address1: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    lieu_dit: Optional[str] = None
    date_of_birth: Optional[str] = None
    revenue: Optional[str] = None
    legacy_ids: List[str] = Field(default_factory=list)
    
    def to_supabase(self) -> Dict[str, Any]:
        return {
            "id": self.provider_id,
            "last_name": self.last_name,
            "first_name": self.first_name,
            "gender": self.gender,
            "email": self.email,
            "phone": self.phone,
            "function": self.function,
            "newsletter": self.newsletter,
            "address1": self.address1,
            "postcode": self.postcode,
            "city": self.city,
            "lieu_dit": self.lieu_dit,
            "date_of_birth": self.date_of_birth,
            "revenue": self.revenue,
            "legacy_ids": self.legacy_ids,
        }


class ProviderTransformation(BaseModel):
    """Transformation result for provider data."""
    
    providers: List[ProviderRecord]
    object_provider_links: List[Dict[str, str]] = Field(default_factory=list)  # [{"object_id": "...", "provider_id": "..."}]


class ScheduleRecord(BaseModel):
    """Structured representation of opening hours."""
    
    object_id: Optional[str] = None
    days: List[str] = Field(default_factory=list)  # ["monday", "tuesday", ...]
    am_start: Optional[str] = None  # "09:30"
    am_finish: Optional[str] = None  # "15:00"
    pm_start: Optional[str] = None
    pm_finish: Optional[str] = None
    reservation_required: bool = False
    schedule_type: str = "regular"  # "regular", "seasonal", "exception"
    
    def to_supabase(self) -> Dict[str, Any]:
        return {
            "object_id": self.object_id,
            "days": self.days,
            "am_start": self.am_start,
            "am_finish": self.am_finish,
            "pm_start": self.pm_start,
            "pm_finish": self.pm_finish,
            "reservation_required": self.reservation_required,
            "schedule_type": self.schedule_type,
        }


class ScheduleTransformation(BaseModel):
    """Transformation result for schedule data."""
    
    schedules: List[ScheduleRecord]


__all__ = [
    "RawEstablishmentPayload",
    "RoutedFragment",
    "IngestionResponse",
    "AgentDescriptor",
    "AgentContext",
    "FieldAssignment",
    "FieldRoutingDecision",
    "IdentityRecord",
    "LocationRecord",
    "LocationTransformation",
    "ContactChannelRecord",
    "ContactTransformation",
    "AmenityLinkRecord",
    "AmenityTransformation",
    "MediaRecord",
    "MediaTransformation",
    "ProviderRecord",
    "ProviderTransformation",
    "ScheduleRecord",
    "ScheduleTransformation",
]
