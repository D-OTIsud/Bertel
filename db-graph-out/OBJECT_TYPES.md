# Object types — the type map

_One section per `object_type` enum value. Label + editor archetype mirror `bertel-tourism-ui/src/features/object-editor/archetypes.ts`; facet applicability and the table sets are computed live from the graph. ‘Common tables’ apply to **every** type; only the type-specific facet tables are gated by `ref_facet_applicability` (enforced by `trg_assert_facet_applicable`)._

## Summary

| Code | Label | Archetype | Type-specific facet tables |
|------|-------|-----------|----------------------------|
| `RES` | Restaurant | Restaurant | `object_menu` |
| `PCU` | Patrimoine | Site & visite | _(none — generic modules only)_ |
| `PNA` | Site naturel | Site & visite | _(none — generic modules only)_ |
| `ORG` | Organisation | — (unsupported in editor) | _(none — generic modules only)_ |
| `ITI` | Itineraire | Itinéraire | `object_iti`, `object_iti_associated_object`, `object_iti_info`, `object_iti_practice`, `object_iti_profile`, `object_iti_section`, `object_iti_stage` |
| `VIL` | Ville | Service & commerce | _(none — generic modules only)_ |
| `HPA` | Hebergement plein air | Hébergement | `object_meeting_room`, `object_room_type` |
| `ASC` | Activite | Activité sportive & culturelle | `object_act` |
| `COM` | Commerce | Service & commerce | _(none — generic modules only)_ |
| `HOT` | Hotel | Hébergement | `object_meeting_room`, `object_room_type` |
| `HLO` | Hebergement loisir | Hébergement | `object_meeting_room`, `object_room_type` |
| `LOI` | Loisir | Site & visite | `object_meeting_room` |
| `FMA` | Fete / manifestation | Fête & manifestation | `object_fma`, `object_fma_occurrence` |
| `CAMP` | Camping | Hébergement | `object_meeting_room`, `object_room_type` |
| `PSV` | Prestataire | Service & commerce | _(none — generic modules only)_ |
| `RVA` | Residence vacances | Hébergement | `object_meeting_room`, `object_room_type` |
| `ACT` | Activite encadree | Activité sportive & culturelle | `object_act` |
| `SPU` | Service public | Service & commerce | _(none — generic modules only)_ |
| `PRD` | Producteur | Site & visite | _(none — generic modules only)_ |

## Common object-attached tables (every type carries these)

_Direct FK children of `object` that are **not** type-specific facets — the shared object model, **not gated** by `ref_facet_applicability`. Grouped by domain. Note: a few are semantically type-leaning but NOT DB-enforced (e.g. `object_stay_policy` ≈ HEB check-in/out, `object_cuisine_type` ≈ RES, `object_group_policy`/`object_pet_policy` ≈ HEB) — any type may legally carry a row. The list also includes structural object-keyed rows that are not editor content (CRM, promotion, publication, audit, org membership)._

- **actor-org**: `actor_object_role`, `object_membership`, `object_org_link`, `org_config`, `org_permission`
- **media**: `media`
- **object-core**: `object_amenity`, `object_classification`, `object_cuisine_type`, `object_description`, `object_document`, `object_environment_tag`, `object_external_id`, `object_group_policy`, `object_language`, `object_legal`, `object_list`, `object_list_item`, `object_location`, `object_origin`, `object_payment_method`, `object_pet_policy`, `object_place`, `object_private_description`, `object_relation`, `object_review`, `object_stay_policy`, `object_taxonomy`, `object_version`, `object_version_2026_03`, `object_version_2026_04`, `object_version_2026_05`, `object_version_2026_06`, `object_version_2026_07`, `object_version_2026_08`, `object_version_2026_09`, `object_version_default`, `object_web_channel`, `object_zone`
- **opening**: `opening_period`
- **other**: `audit_session`, `contact_channel`, `crm_interaction`, `crm_task`, `incident_report`, `pending_change`, `promotion`, `promotion_object`, `promotion_usage`, `publication_object`
- **pricing**: `object_capacity`, `object_discount`, `object_price`
- **rbac**: `user_org_membership`
- **sustainability**: `object_sustainability_action`
- **place-keyed** (sub-place `object_place` children, present when an object has sub-places): `media`, `object_location`, `object_place_description`

## Per-type detail

### `RES` — Restaurant
- **Editor archetype:** `RES` (Restaurant) — _Restauration · Bar · Snack_
- **Facet** `object_menu` → sub-tables: `object_menu_item`, `object_menu_item_allergen`, `object_menu_item_cuisine_type`, `object_menu_item_dietary_tag`, `object_menu_item_media`
- Inherits the 55 common object-attached tables listed above.

### `PCU` — Patrimoine
- **Editor archetype:** `VIS` (Site & visite) — _Patrimoine · Loisir · Site naturel · Producteur_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `PNA` — Site naturel
- **Editor archetype:** `VIS` (Site & visite) — _Patrimoine · Loisir · Site naturel · Producteur_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `ORG` — Organisation
- **Editor archetype:** none — ORG is deliberately unsupported in the object editor (managed via /team). Renders an explicit unsupported-type panel.
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `ITI` — Itineraire
- **Editor archetype:** `ITI` (Itinéraire) — _Randonnée · Trail · VTT · Boucle_
- **Facet** `object_iti`
- **Facet** `object_iti_associated_object`
- **Facet** `object_iti_info`
- **Facet** `object_iti_practice`
- **Facet** `object_iti_profile`
- **Facet** `object_iti_section`
- **Facet** `object_iti_stage` → sub-tables: `object_iti_stage_media`
- Inherits the 55 common object-attached tables listed above.

### `VIL` — Ville
- **Editor archetype:** `SRV` (Service & commerce) — _OT · Commerce · Service · Service public_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `HPA` — Hebergement plein air
- **Editor archetype:** `HEB` (Hébergement) — _Hôtel · Hébergement loisir · Camping · Résidence_
- **Facet** `object_meeting_room` → sub-tables: `meeting_room_equipment`
- **Facet** `object_room_type` → sub-tables: `object_room_type_amenity`, `object_room_type_bed`, `object_room_type_media`
- Inherits the 55 common object-attached tables listed above.

### `ASC` — Activite
- **Editor archetype:** `ASC` (Activité sportive & culturelle) — _Activité encadrée · Stage · Initiation_
- **Facet** `object_act`
- Inherits the 55 common object-attached tables listed above.

### `COM` — Commerce
- **Editor archetype:** `SRV` (Service & commerce) — _OT · Commerce · Service · Service public_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `HOT` — Hotel
- **Editor archetype:** `HEB` (Hébergement) — _Hôtel · Hébergement loisir · Camping · Résidence_
- **Facet** `object_meeting_room` → sub-tables: `meeting_room_equipment`
- **Facet** `object_room_type` → sub-tables: `object_room_type_amenity`, `object_room_type_bed`, `object_room_type_media`
- Inherits the 55 common object-attached tables listed above.

### `HLO` — Hebergement loisir
- **Editor archetype:** `HEB` (Hébergement) — _Hôtel · Hébergement loisir · Camping · Résidence_
- **Facet** `object_meeting_room` → sub-tables: `meeting_room_equipment`
- **Facet** `object_room_type` → sub-tables: `object_room_type_amenity`, `object_room_type_bed`, `object_room_type_media`
- Inherits the 55 common object-attached tables listed above.

### `LOI` — Loisir
- **Editor archetype:** `VIS` (Site & visite) — _Patrimoine · Loisir · Site naturel · Producteur_
- **Facet** `object_meeting_room` → sub-tables: `meeting_room_equipment`
- Inherits the 55 common object-attached tables listed above.

### `FMA` — Fete / manifestation
- **Editor archetype:** `FMA` (Fête & manifestation) — _Événement · Animation · Manifestation_
- **Facet** `object_fma`
- **Facet** `object_fma_occurrence`
- Inherits the 55 common object-attached tables listed above.

### `CAMP` — Camping
- **Editor archetype:** `HEB` (Hébergement) — _Hôtel · Hébergement loisir · Camping · Résidence_
- **Facet** `object_meeting_room` → sub-tables: `meeting_room_equipment`
- **Facet** `object_room_type` → sub-tables: `object_room_type_amenity`, `object_room_type_bed`, `object_room_type_media`
- Inherits the 55 common object-attached tables listed above.

### `PSV` — Prestataire
- **Editor archetype:** `SRV` (Service & commerce) — _OT · Commerce · Service · Service public_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `RVA` — Residence vacances
- **Editor archetype:** `HEB` (Hébergement) — _Hôtel · Hébergement loisir · Camping · Résidence_
- **Facet** `object_meeting_room` → sub-tables: `meeting_room_equipment`
- **Facet** `object_room_type` → sub-tables: `object_room_type_amenity`, `object_room_type_bed`, `object_room_type_media`
- Inherits the 55 common object-attached tables listed above.

### `ACT` — Activite encadree
- **Editor archetype:** `ASC` (Activité sportive & culturelle) — _Activité encadrée · Stage · Initiation_
- **Facet** `object_act`
- Inherits the 55 common object-attached tables listed above.

### `SPU` — Service public
- **Editor archetype:** `SRV` (Service & commerce) — _OT · Commerce · Service · Service public_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.

### `PRD` — Producteur
- **Editor archetype:** `VIS` (Site & visite) — _Patrimoine · Loisir · Site naturel · Producteur_
- **Facets:** none — uses only the common object model (generic modules).
- Inherits the 55 common object-attached tables listed above.
