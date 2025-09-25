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


__all__ = [
    "RawEstablishmentPayload",
    "RoutedFragment",
    "IngestionResponse",
    "AgentDescriptor",
    "AgentContext",
]
