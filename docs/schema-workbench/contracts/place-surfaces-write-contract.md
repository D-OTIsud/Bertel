# Place-Level Surfaces Write Contract

## Scope

Place-level surfaces include place descriptions, place media, places, and zones. Object-level descriptions/media/location are partly writable today, but place scope remains limited.

## 2026-05-20 RPC Status

`api.save_object_places(p_object_id text, p_payload jsonb)` is defined in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.

The RPC covers `object_place`, place-scoped `object_location`, `object_place_description`, place-scoped `media`, and `object_zone`. It enforces object/place scope and the single primary place rule. The UI should still mark zones or future geometry controls as a UI/validation gap until a geometry contract exists.

## Editable Fields

Phase 1:
- place descriptions and translation maps.
- visibility.
- chapo/adapted/mobile/editorial text if supported by the table.

Phase 2:
- place media rows scoped by `place_id`.
- media title/description/visibility/order when the media belongs to the same object/place.

Phase 3:
- place name.
- primary flag.
- position.
- address/location fields scoped to the place.

## Blocked Fields

- zones and geometry.
- generated/import metadata.
- place deletion when it would orphan media, descriptions, contacts, or relations without an explicit cascade policy.

## Tables

- `object_place`
- place description tables.
- `media` with `place_id`.
- place location tables.
- zone/geometry tables.

## RLS / Permission Requirements

- editor can select object and target place.
- editor can mutate only places belonging to editable objects.
- media writes must verify object_id/place_id consistency.
- zones require a geometry validation contract before writes.

## Save Strategy

Use `api.save_object_places` for place CRUD, place descriptions, place media, place locations, and zones after the UI can submit the DB-first payload. Object-level location/media/description flows can remain on their proven paths until they are migrated.

## Delete Behavior

Descriptions and media can be deleted only within the selected place scope. Place deletion is blocked until cascade/orphan behavior is defined.

## Ordering Behavior

Place and media `position` fields are normalized per object/place. Only one primary place can remain after save.

## Frontend Dirty / Save Behavior

Keep place-specific disabled states visible with concise tooltips. Object-level controls remain enabled where already safe.

## Tests

- place description parser/save tests.
- place media scope isolation tests.
- place CRUD primary/ordering tests after RPC.
- zones read-only tooltip and geometry blocked tests.
