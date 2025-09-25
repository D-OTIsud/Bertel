"""Pydantic models shared across the application."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RawEstablishmentPayload(BaseModel):
    """Envelope received from external systems."""

    establishment_name: str = Field(..., alias="name")
    establishment_category: Optional[str] = Field(None, alias="category")
    establishment_subcategory: Optional[str] = Field(None, alias="subcategory")
    legacy_ids: Optional[List[str]] = None
    data: Dict[str, Any] = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }


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
            "id": self.object_id,
            "object_type": self.object_type,
            "name": self.name,
            "status": self.status,
        }
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
]
