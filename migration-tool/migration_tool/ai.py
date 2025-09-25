"""Lightweight AI abstractions for field classification and transformation."""

from __future__ import annotations

import abc
import json
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

from pydantic import BaseModel

import unicodedata

from .schemas import (
    AgentDescriptor,
    AmenityLinkRecord,
    AmenityTransformation,
    ContactChannelRecord,
    ContactTransformation,
    EnvironmentTagRecord,
    EnvironmentTagTransformation,
    FieldAssignment,
    FieldRoutingDecision,
    IdentityRecord,
    LanguageLinkRecord,
    LanguageTransformation,
    LocationRecord,
    LocationTransformation,
    MediaRecord,
    MediaTransformation,
    PaymentMethodRecord,
    PaymentMethodTransformation,
    PetPolicyRecord,
    PetPolicyTransformation,
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
        "identity": (
            "name",
            "nom",
            "title",
            "category",
            "categorie",
            "sub_category",
            "sous_categorie",
            "legacy",
            "description",
            "type",
            "status",
        ),
        "location": (
            "address",
            "adresse",
            "postal",
            "code_postal",
            "zip",
            "city",
            "ville",
            "country",
            "latitude",
            "longitude",
            "gps",
            "insee",
        ),
        "contact": (
            "phone",
            "telephone",
            "tel",
            "mobile",
            "email",
            "mail",
            "website",
            "site",
            "url",
            "booking",
            "reservation",
            "contact",
            "social",
        ),
        "amenities": ("amenitie", "amenity", "equipment", "service", "facility", "prestations", "equipement"),
        "media": ("photo", "image", "video", "media", "picture", "logo", "galerie"),
        "providers": (
            "prestataire",
            "providers",
            "provider",
            "presta",
            "nom",
            "prenom",
            "gerant",
            "fonction",
        ),
        "schedule": ("horaires", "schedule", "jours", "ouverture", "fermeture", "reservation"),
        "languages": ("langue", "language", "spoken_language", "idiome"),
        "payments": ("paiement", "payment", "carte", "cheque", "espèce", "cb", "mode_de_paiement"),
        "environment": ("environnement", "environment", "localisation", "milieu", "quartier", "village"),
        "pet_policy": ("animal", "pet", "animaux", "chiens", "chats"),
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
        "portable": "phone",
        "téléphone": "phone",
        "telephone": "phone",
        "numero": "phone",
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

    LANGUAGE_ALIASES: Dict[str, str] = {
        "fr": "fr",
        "francais": "fr",
        "français": "fr",
        "french": "fr",
        "en": "en",
        "anglais": "en",
        "english": "en",
        "es": "es",
        "espagnol": "es",
        "spanish": "es",
        "de": "de",
        "allemand": "de",
        "german": "de",
        "it": "it",
        "italien": "it",
        "italian": "it",
        "pt": "pt",
        "portugais": "pt",
        "portuguese": "pt",
        "nl": "nl",
        "neerlandais": "nl",
        "dutch": "nl",
        "zh": "zh",
        "chinois": "zh",
        "mandarin": "zh",
        "ru": "ru",
        "russe": "ru",
        "ar": "ar",
        "arabe": "ar",
        "cr": "cr",
        "creole": "cr",
        "créole": "cr",
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
        elif agent_name == "languages":
            data = self._transform_languages(payload)
        elif agent_name == "payments":
            data = self._transform_payments(payload)
        elif agent_name == "environment":
            data = self._transform_environment(payload)
        elif agent_name == "pet_policy":
            data = self._transform_pet_policy(payload)
        elif agent_name == "providers":
            data = self._transform_providers(payload)
        elif agent_name == "schedule":
            data = self._transform_schedule(payload)
        else:
            raise ValueError(f"Unknown agent '{agent_name}' for rule based transformation")

        if isinstance(data, response_model):
            return data
        return response_model.model_validate(data)

    def _strip_accents(self, value: str) -> str:
        return "".join(ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch))

    def _guess_agent(
        self,
        key: str,
        value: Any,
        available_agents: Iterable[str],
    ) -> Optional[str]:
        lowered = self._strip_accents(key).lower()
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
            normalized_key = self._strip_accents(key).lower()
            if isinstance(value, dict):
                for nested_key, nested_value in value.items():
                    nested_normalized = self._strip_accents(str(nested_key)).lower()
                    channels.extend(
                        self._create_contact_channels(object_id, nested_normalized, nested_value)
                    )
            else:
                channels.extend(self._create_contact_channels(object_id, normalized_key, value))

        return ContactTransformation(channels=channels)

    def _transform_amenities(self, payload: Dict[str, Any]) -> AmenityTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        amenities = (
            payload.get("amenities")
            or payload.get("equipment")
            or payload.get("services")
            or payload.get("prestations")
            or []
        )
        if isinstance(amenities, str):
            amenities = re.split(r",|;|/", amenities)
        links = []
        for amenity in amenities:
            if not amenity:
                continue
            label = str(amenity).strip()
            code = _normalize(label)
            links.append(
                AmenityLinkRecord(
                    object_id=object_id,
                    amenity_code=code,
                    amenity_name=label or None,
                    raw_label=label or None,
                )
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

    def _transform_languages(self, payload: Dict[str, Any]) -> LanguageTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        languages_raw = payload.get("languages") or payload.get("langues") or []
        if isinstance(languages_raw, dict):
            languages_iterable = languages_raw.values()
        else:
            languages_iterable = self._split_items(languages_raw)

        records = []
        for language in languages_iterable:
            label = str(language).strip()
            if not label:
                continue
            code = self._guess_language_code(label)
            records.append(
                LanguageLinkRecord(
                    object_id=object_id,
                    language_code=code,
                    language_name=label,
                )
            )
        return LanguageTransformation(languages=records)

    def _guess_language_code(self, label: str) -> str:
        normalized = self._strip_accents(label).lower().strip()
        normalized = normalized.replace("-", "_").replace(" ", "_")
        if normalized in self.LANGUAGE_ALIASES:
            return self.LANGUAGE_ALIASES[normalized]
        if len(normalized) == 2 and normalized.isalpha():
            return normalized
        if "_" in normalized:
            prefix = normalized.split("_", 1)[0]
            if len(prefix) == 2 and prefix.isalpha():
                return prefix
        if len(normalized) >= 3 and normalized[:2].isalpha():
            return normalized[:2]
        return normalized or "und"

    def _transform_payments(self, payload: Dict[str, Any]) -> PaymentMethodTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        payments_raw = payload.get("payment_methods") or payload.get("mode_de_paiement") or []
        records = []
        for item in self._split_items(payments_raw):
            label = str(item).strip()
            if not label:
                continue
            code = _normalize(label)
            records.append(
                PaymentMethodRecord(
                    object_id=object_id,
                    payment_code=code,
                    payment_name=label,
                )
            )
        return PaymentMethodTransformation(payment_methods=records)

    def _transform_environment(self, payload: Dict[str, Any]) -> EnvironmentTagTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        environment_raw = (
            payload.get("environment_tags")
            or payload.get("localisations")
            or payload.get("environment")
            or []
        )
        records = []
        for item in self._split_items(environment_raw):
            label = str(item).strip()
            if not label:
                continue
            code = _normalize(label)
            records.append(
                EnvironmentTagRecord(
                    object_id=object_id,
                    environment_code=code,
                    environment_name=label,
                )
            )
        return EnvironmentTagTransformation(environment_tags=records)

    def _transform_pet_policy(self, payload: Dict[str, Any]) -> PetPolicyTransformation:
        object_id = payload.get("establishment_id") or payload.get("object_id")
        pet_payload = payload.get("pet_policy") if isinstance(payload.get("pet_policy"), dict) else {}
        accepted_raw = pet_payload.get("accepted")
        if accepted_raw is None:
            accepted_raw = payload.get("pets_allowed")
        if accepted_raw is None:
            accepted_raw = payload.get("animaux")
        conditions = pet_payload.get("conditions") or payload.get("pet_policy_notes")
        accepted = self._coerce_bool(accepted_raw)
        if accepted is None and conditions is None:
            return PetPolicyTransformation(pet_policy=None)
        record = PetPolicyRecord(
            object_id=object_id,
            accepted=accepted,
            conditions=conditions,
        )
        return PetPolicyTransformation(pet_policy=record)

    def _split_items(self, value: Any) -> List[Any]:
        if value in (None, "", []):
            return []
        if isinstance(value, list):
            return [item for item in value if item not in (None, "")]
        if isinstance(value, tuple):
            return [item for item in value if item not in (None, "")]
        if isinstance(value, set):
            return [item for item in value if item not in (None, "")]
        if isinstance(value, dict):
            return [item for item in value.values() if item not in (None, "")]
        if isinstance(value, str):
            parts = re.split(r"[,;/|]", value)
            return [part.strip() for part in parts if part.strip()]
        return [value]

    def _coerce_bool(self, value: Any) -> Optional[bool]:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            if value == 1:
                return True
            if value == 0:
                return False
        if isinstance(value, str):
            normalized = self._strip_accents(value).strip().lower()
            if normalized in {"oui", "yes", "true", "1", "allowed", "autorise"}:
                return True
            if normalized in {"non", "no", "false", "0", "forbidden", "interdit"}:
                return False
        return None

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
        if isinstance(value, str):
            trimmed = value.strip()
            if "@" in trimmed and not trimmed.startswith("http"):
                kind_code = "email"
            elif re.search(r"\d{2}", trimmed):
                kind_code = "phone" if kind_code == "other" else kind_code
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

    def _transform_providers(self, payload: Dict[str, Any]) -> "ProviderTransformation":
        """Transform provider data."""
        from .schemas import ProviderTransformation, ProviderRecord
        
        establishment_id = payload.get("establishment_id") or payload.get("object_id")
        providers_data = payload.get("prestataires") or payload.get("providers") or []
        
        # Handle nested data structure
        if isinstance(providers_data, list) and len(providers_data) > 0:
            if isinstance(providers_data[0], dict) and "data" in providers_data[0]:
                providers_data = providers_data[0]["data"]
        
        if isinstance(providers_data, dict):
            providers_data = [providers_data]
        
        providers = []
        object_provider_links = []

        for provider_data in providers_data:
            if not isinstance(provider_data, dict):
                continue

            postcode_raw = provider_data.get("Code Postal") or provider_data.get("postcode")
            postcode_value = str(postcode_raw) if postcode_raw not in (None, "") else None

            provider_record = ProviderRecord(
                provider_id=provider_data.get("Presta ID") or provider_data.get("provider_id"),
                last_name=provider_data.get("Nom") or provider_data.get("last_name") or "",
                first_name=provider_data.get("Prénom") or provider_data.get("first_name") or "",
                gender=provider_data.get("Genre") or provider_data.get("gender"),
                email=provider_data.get("Email") or provider_data.get("email"),
                phone=provider_data.get("Numéro de telephone") or provider_data.get("phone"),
                function=provider_data.get("Fonction") or provider_data.get("function"),
                newsletter=provider_data.get("Newsletter", False),
                address1=provider_data.get("rue") or provider_data.get("address1"),
                postcode=postcode_value,
                city=provider_data.get("ville") or provider_data.get("city"),
                lieu_dit=provider_data.get("Lieux-dits") or provider_data.get("lieu_dit"),
                date_of_birth=provider_data.get("DOB") or provider_data.get("date_of_birth"),
                revenue=provider_data.get("Revenus") or provider_data.get("revenue"),
                legacy_ids=[provider_data.get("Presta ID")] if provider_data.get("Presta ID") else [],
            )
            
            if provider_record.last_name and provider_record.first_name:
                providers.append(provider_record)
                if establishment_id and provider_record.provider_id:
                    object_provider_links.append({
                        "object_id": establishment_id,
                        "provider_id": provider_record.provider_id,
                    })
        
        return ProviderTransformation(providers=providers, object_provider_links=object_provider_links)

    def _transform_schedule(self, payload: Dict[str, Any]) -> "ScheduleTransformation":
        """Transform schedule data."""
        from .schemas import ScheduleTransformation, ScheduleRecord
        
        establishment_id = payload.get("establishment_id") or payload.get("object_id")
        schedule_data = payload.get("horaires") or payload.get("schedule") or []
        
        # Handle nested data structure
        if isinstance(schedule_data, list) and len(schedule_data) > 0:
            if isinstance(schedule_data[0], dict) and "data" in schedule_data[0]:
                schedule_data = schedule_data[0]["data"]
        
        if isinstance(schedule_data, dict):
            schedule_data = [schedule_data]
        
        schedules = []
        
        for schedule_item in schedule_data:
            if not isinstance(schedule_item, dict):
                continue
                
            jours_str = schedule_item.get("jours") or ""
            days = self._parse_schedule_days(jours_str)
            
            if not days:
                continue
                
            schedule_record = ScheduleRecord(
                object_id=establishment_id,
                days=days,
                am_start=schedule_item.get("AM_Start") or schedule_item.get("am_start"),
                am_finish=schedule_item.get("AM_Finish") or schedule_item.get("am_finish"),
                pm_start=schedule_item.get("PM_Start") or schedule_item.get("pm_start"),
                pm_finish=schedule_item.get("PM_Finish") or schedule_item.get("pm_finish"),
                reservation_required=schedule_item.get("Révervation") or schedule_item.get("reservation_required") or False,
                schedule_type="regular",
            )
            
            schedules.append(schedule_record)
        
        return ScheduleTransformation(schedules=schedules)

    def _parse_schedule_days(self, jours_str: str) -> List[str]:
        """Parse French day names to English day codes."""
        if not jours_str:
            return []

        day_mapping = {
            "lundi": "monday",
            "mardi": "tuesday", 
            "mercredi": "wednesday",
            "jeudi": "thursday",
            "vendredi": "friday",
            "samedi": "saturday",
            "dimanche": "sunday",
        }

        days = []
        for day_part in jours_str.split(","):
            day_clean = day_part.strip().lower()
            if day_clean in day_mapping:
                days.append(day_mapping[day_clean])
        
        return days


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

