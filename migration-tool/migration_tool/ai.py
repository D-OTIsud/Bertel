"""Lightweight AI abstractions for field classification and transformation."""

from __future__ import annotations

import abc
import json
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

from pydantic import BaseModel

from .schemas import (
    AgentDescriptor,
    AmenityLinkRecord,
    AmenityTransformation,
    ContactChannelRecord,
    ContactTransformation,
    FieldAssignment,
    FieldRoutingDecision,
    IdentityRecord,
    LocationRecord,
    LocationTransformation,
    MediaRecord,
    MediaTransformation,
)

try:  # pragma: no cover - optional dependency
    from openai import AsyncOpenAI
except Exception:  # pragma: no cover - optional dependency
    AsyncOpenAI = None  # type: ignore


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


class LLMClient(abc.ABC):
    """Abstract interface for semantic helpers."""

    name: str

    @abc.abstractmethod
    async def classify_fields(
        self,
        *,
        payload: Dict[str, Any],
        agent_descriptors: Sequence[AgentDescriptor],
    ) -> FieldRoutingDecision:
        """Return routing information for payload fields."""

    @abc.abstractmethod
    async def transform_fragment(
        self,
        *,
        agent_name: str,
        payload: Dict[str, Any],
        response_model: type[BaseModel],
    ) -> BaseModel:
        """Return a structured representation for a fragment."""


class RuleBasedLLM(LLMClient):
    """Heuristic backed fallback when no external model is configured."""

    name = "rule-based"

    FIELD_KEYWORDS: Dict[str, Iterable[str]] = {
        "identity": ("name", "title", "category", "sub_category", "legacy", "description", "type"),
        "location": ("address", "postal", "zip", "city", "country", "latitude", "longitude", "gps", "insee"),
        "contact": ("phone", "email", "website", "url", "booking", "contact", "social"),
        "amenities": ("amenitie", "equipment", "service", "facility"),
        "media": ("photo", "image", "video", "media", "picture", "logo"),
    }

    CATEGORY_TO_OBJECT_TYPE: Dict[str, str] = {
        "hotel": "HOT",
        "hébergement": "HLO",
        "lodging": "HLO",
        "restaurant": "RES",
        "food": "RES",
        "activity": "ASC",
        "visite": "LOI",
        "event": "FMA",
        "événement": "FMA",
        "shop": "COM",
        "commerce": "COM",
        "itinéraire": "ITI",
        "itinerary": "ITI",
        "organization": "ORG",
        "office": "ORG",
    }

    CONTACT_KIND_DEFAULTS: Dict[str, str] = {
        "phone": "phone",
        "mobile": "phone",
        "téléphone": "phone",
        "email": "email",
        "mail": "email",
        "website": "website",
        "site": "website",
        "booking": "booking",
        "reservation": "booking",
        "facebook": "facebook",
        "instagram": "instagram",
        "twitter": "twitter",
        "x": "twitter",
        "tiktok": "tiktok",
        "youtube": "youtube",
        "whatsapp": "whatsapp",
    }

    MEDIA_TYPE_DEFAULTS: Dict[str, str] = {
        "image": "image",
        "photo": "image",
        "picture": "image",
        "logo": "logo",
        "video": "video",
    }

    async def classify_fields(
        self,
        *,
        payload: Dict[str, Any],
        agent_descriptors: Sequence[AgentDescriptor],
    ) -> FieldRoutingDecision:
        assignments: List[FieldAssignment] = []
        leftovers: Dict[str, Any] = {}

        available_agents = {descriptor.name for descriptor in agent_descriptors}

        for key, value in payload.items():
            agent_name = self._guess_agent(key, value, available_agents)
            if agent_name is None:
                leftovers[key] = value
                continue

            target_attribute = self._normalize_attribute(agent_name, key)
            reasoning = f"Matched keyword for {agent_name}"
            assignments.append(
                FieldAssignment(
                    field_name=key,
                    agent=agent_name,
                    target_attribute=target_attribute,
                    reasoning=reasoning,
                )
            )

        return FieldRoutingDecision(assignments=assignments, leftovers=leftovers)

    async def transform_fragment(
        self,
        *,
        agent_name: str,
        payload: Dict[str, Any],
        response_model: type[BaseModel],
    ) -> BaseModel:
        if agent_name == "identity":
            data = self._transform_identity(payload)
        elif agent_name == "location":
            data = self._transform_location(payload)
        elif agent_name == "contact":
            data = self._transform_contact(payload)
        elif agent_name == "amenities":
            data = self._transform_amenities(payload)
        elif agent_name == "media":
            data = self._transform_media(payload)
        else:
            raise ValueError(f"Unknown agent '{agent_name}' for rule based transformation")

        if isinstance(data, response_model):
            return data
        return response_model.model_validate(data)

    def _guess_agent(
        self,
        key: str,
        value: Any,
        available_agents: Iterable[str],
    ) -> Optional[str]:
        lowered = key.lower()
        for agent_name, keywords in self.FIELD_KEYWORDS.items():
            if agent_name not in available_agents:
                continue
            if any(keyword in lowered for keyword in keywords):
                return agent_name

        # fallbacks based on value shape
        if isinstance(value, dict) and "contact" in available_agents:
            return "contact"
        if isinstance(value, (list, tuple)):
            if value and isinstance(value[0], dict):
                if "media" in available_agents:
                    return "media"
                if "amenities" in available_agents:
                    return "amenities"
        return None

    def _normalize_attribute(self, agent_name: str, field: str) -> str:
        mapping = {
            "identity": {
                "establishment_name": "name",
                "legacy_ids": "legacy_ids",
                "establishment_id": "object_id",
            },
            "location": {
                "address_line1": "address1",
                "address_line2": "address2",
                "postal_code": "postcode",
                "zip": "postcode",
            },
        }
        if agent_name in mapping and field in mapping[agent_name]:
            return mapping[agent_name][field]
        return _normalize(field)

    def _transform_identity(self, payload: Dict[str, Any]) -> IdentityRecord:
        name = payload.get("establishment_name") or payload.get("name")
        if not name:
            raise ValueError("Identity payload is missing a name")

        category = payload.get("category") or payload.get("establishment_category")
        subcategory = payload.get("subcategory") or payload.get("establishment_subcategory")
        object_type = self._guess_object_type(category or "")
        legacy_ids = payload.get("legacy_ids") or []
        if isinstance(legacy_ids, str):
            legacy_ids = [legacy_ids]

        description = payload.get("description") or payload.get("summary")

        record = IdentityRecord(
            object_id=payload.get("establishment_id") or payload.get("object_id"),
            object_type=object_type,
            name=name,
            description=description,
            category_code=self._normalize_category(category),
            subcategory_code=self._normalize_category(subcategory),
            legacy_ids=legacy_ids,
            source_extra={key: value for key, value in payload.items() if key not in {"establishment_name", "description"}},
        )
        return record

    def _transform_location(self, payload: Dict[str, Any]) -> LocationTransformation:
        latitude = self._coerce_float(payload.get("latitude"))
        longitude = self._coerce_float(payload.get("longitude"))
        coordinates = payload.get("coordinates")
        if coordinates and (latitude is None or longitude is None):
            if isinstance(coordinates, dict):
                latitude = latitude or self._coerce_float(coordinates.get("lat"))
                longitude = longitude or self._coerce_float(coordinates.get("lon") or coordinates.get("lng"))
            elif isinstance(coordinates, (list, tuple)) and len(coordinates) >= 2:
                latitude = latitude or self._coerce_float(coordinates[0])
                longitude = longitude or self._coerce_float(coordinates[1])

        record = LocationRecord(
            object_id=payload.get("establishment_id") or payload.get("object_id") or payload.get("legacy_id"),
            address1=payload.get("address1") or payload.get("address_line1"),
            address2=payload.get("address2") or payload.get("address_line2"),
            postcode=payload.get("postcode") or payload.get("postal_code") or payload.get("zip"),
            city=payload.get("city"),
            code_insee=payload.get("code_insee"),
            latitude=latitude,
            longitude=longitude,
            is_main_location=True,
        )
        return LocationTransformation(locations=[record])

    def _transform_contact(self, payload: Dict[str, Any]) -> ContactTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        channels: List[ContactChannelRecord] = []

        for key, value in payload.items():
            normalized_key = key.lower()
            if isinstance(value, dict):
                for nested_key, nested_value in value.items():
                    channels.extend(self._create_contact_channels(object_id, nested_key, nested_value))
            else:
                channels.extend(self._create_contact_channels(object_id, normalized_key, value))

        return ContactTransformation(channels=channels)

    def _transform_amenities(self, payload: Dict[str, Any]) -> AmenityTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        amenities = payload.get("amenities") or payload.get("equipment") or payload.get("services") or []
        if isinstance(amenities, str):
            amenities = re.split(r",|;|/", amenities)
        links = []
        for amenity in amenities:
            if not amenity:
                continue
            code = _normalize(str(amenity))
            links.append(
                AmenityLinkRecord(object_id=object_id, amenity_code=code, raw_label=str(amenity).strip())
            )
        return AmenityTransformation(amenities=links)

    def _transform_media(self, payload: Dict[str, Any]) -> MediaTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        media_items = payload.get("media") or payload.get("photos") or payload.get("videos") or []
        records: List[MediaRecord] = []
        for item in media_items:
            if isinstance(item, str):
                media_type = self._infer_media_type(item)
                records.append(
                    MediaRecord(object_id=object_id, url=item, media_type_code=media_type)
                )
            elif isinstance(item, dict):
                url = item.get("url") or item.get("link")
                if not url:
                    continue
                media_type = item.get("media_type") or self._infer_media_type(url)
                records.append(
                    MediaRecord(
                        object_id=object_id,
                        url=url,
                        media_type_code=media_type,
                        title=item.get("title"),
                        description=item.get("description"),
                        credit=item.get("credit"),
                        is_main=item.get("is_main"),
                    )
                )
        return MediaTransformation(media=records)

    def _guess_object_type(self, category: str) -> str:
        if not category:
            return "ORG"
        lowered = category.lower()
        for key, value in self.CATEGORY_TO_OBJECT_TYPE.items():
            if key in lowered:
                return value
        return "ORG"

    def _normalize_category(self, category: Optional[str]) -> Optional[str]:
        if not category:
            return None
        return _normalize(category)

    def _coerce_float(self, value: Any) -> Optional[float]:
        if value in (None, "", []) or isinstance(value, dict):
            return None
        try:
            return float(value)
        except (ValueError, TypeError):  # pragma: no cover - defensive
            return None

    def _create_contact_channels(
        self,
        object_id: Optional[str],
        key: str,
        value: Any,
    ) -> List[ContactChannelRecord]:
        entries: List[ContactChannelRecord] = []
        if value in (None, ""):
            return entries

        kind_code = self._infer_contact_kind(key)
        if isinstance(value, (list, tuple)):
            for item in value:
                if item:
                    entries.append(ContactChannelRecord(object_id=object_id, value=str(item), kind_code=kind_code))
            return entries

        entries.append(ContactChannelRecord(object_id=object_id, value=str(value), kind_code=kind_code))
        return entries

    def _infer_contact_kind(self, key: str) -> str:
        lowered = key.lower()
        for keyword, code in self.CONTACT_KIND_DEFAULTS.items():
            if keyword in lowered:
                return code
        return "other"

    def _infer_media_type(self, value: str) -> str:
        lowered = value.lower()
        for keyword, code in self.MEDIA_TYPE_DEFAULTS.items():
            if keyword in lowered:
                return code
        if any(lowered.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp")):
            return "image"
        if any(lowered.endswith(ext) for ext in (".mp4", ".mov", ".avi", ".mkv")):
            return "video"
        return "image"


class OpenAILLM(LLMClient):  # pragma: no cover - network dependency
    """LLM client backed by OpenAI Responses API."""

    def __init__(self, *, api_key: str, model: str, temperature: float = 0.0):
        if AsyncOpenAI is None:
            raise RuntimeError("The 'openai' package is required for the OpenAI provider.")
        self._client = AsyncOpenAI(api_key=api_key)
        self.model = model
        self.temperature = temperature
        self.name = "openai"

    async def classify_fields(
        self,
        *,
        payload: Dict[str, Any],
        agent_descriptors: Sequence[AgentDescriptor],
    ) -> FieldRoutingDecision:
        system_prompt = (
            "You classify establishment payload keys into specialised agents that prepare data for the DLL schema."
            " Output a JSON object strictly matching the provided schema."
        )
        agents_description = ", ".join(
            f"{descriptor.name}: {descriptor.description}" for descriptor in agent_descriptors
        )
        user_prompt = (
            "Agents available: "
            f"{agents_description}.\nPayload keys: "
            f"{json.dumps(payload, ensure_ascii=False)}"
        )
        return await self._structured_response(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=FieldRoutingDecision,
        )

    async def transform_fragment(
        self,
        *,
        agent_name: str,
        payload: Dict[str, Any],
        response_model: type[BaseModel],
    ) -> BaseModel:
        system_prompt = (
            "You are an ingestion agent that converts noisy establishment information into the Supabase DLL structure."
            " Follow the schema strictly and avoid fabricating values."
        )
        user_prompt = (
            f"Agent: {agent_name}. Payload: {json.dumps(payload, ensure_ascii=False)}."
            " Return only JSON that matches the expected schema."
        )
        return await self._structured_response(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=response_model,
        )

    async def _structured_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_model: type[BaseModel],
    ) -> BaseModel:
        schema = response_model.model_json_schema()
        response = await self._client.responses.create(
            model=self.model,
            temperature=self.temperature,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": response_model.__name__, "schema": schema},
            },
        )

        text = self._extract_text(response)
        data = json.loads(text)
        return response_model.model_validate(data)

    def _extract_text(self, response: Any) -> str:
        if hasattr(response, "output"):
            for item in response.output:
                content = getattr(item, "content", None)
                if not content:
                    continue
                for block in content:
                    text = getattr(block, "text", None)
                    if text:
                        return text
        if hasattr(response, "output_text"):
            return response.output_text  # type: ignore[attr-defined]
        if hasattr(response, "choices"):
            choice = response.choices[0]
            message = getattr(choice, "message", None)
            if message and getattr(message, "content", None):
                return message.content  # type: ignore[return-value]
        raise RuntimeError("Unable to extract response text from OpenAI result")


def build_llm(
    *,
    provider: str,
    api_key: Optional[str],
    model: str,
    temperature: float,
) -> LLMClient:
    provider = provider.lower()
    if provider == "openai":  # pragma: no cover - requires network access
        if not api_key:
            raise RuntimeError("OpenAI provider selected but no API key was provided.")
        return OpenAILLM(api_key=api_key, model=model, temperature=temperature)

    if provider in {"auto", "default"}:
        if api_key:
            try:
                return OpenAILLM(api_key=api_key, model=model, temperature=temperature)
            except Exception:  # pragma: no cover - fallback if OpenAI not available
                pass
        return RuleBasedLLM()

    if provider == "rule" or provider == "rule-based":
        return RuleBasedLLM()

    raise ValueError(f"Unknown AI provider '{provider}'")


class FieldRouter:
    """Semantic router that delegates routing to an LLM client."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def route(
        self,
        *,
        payload: Dict[str, Any],
        agent_descriptors: Sequence[AgentDescriptor],
    ) -> FieldRoutingDecision:
        decision = await self.llm.classify_fields(payload=payload, agent_descriptors=agent_descriptors)

        # Enrich sections for convenience
        sections: Dict[str, Dict[str, Any]] = {descriptor.name: {} for descriptor in agent_descriptors}
        leftovers = dict(decision.leftovers)

        for assignment in decision.assignments:
            value = payload.get(assignment.field_name)
            if value is None:
                continue
            sections.setdefault(assignment.agent, {})[assignment.target_attribute or assignment.field_name] = value
            leftovers.pop(assignment.field_name, None)

        decision.sections = sections
        decision.leftovers = leftovers
        return decision


__all__ = [
    "LLMClient",
    "RuleBasedLLM",
    "OpenAILLM",
    "build_llm",
    "FieldRouter",
]

