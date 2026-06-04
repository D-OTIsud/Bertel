# Itinerary Write Contract

## Scope

The itinerary module is partially writable today. Basic `object_iti` fields and practices can be saved. Nested itinerary details need explicit contracts before unlock.

## 2026-05-20 RPC Status

`api.save_object_itinerary_nested(p_object_id text, p_payload jsonb)` is defined in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.

The RPC covers `object_iti_info`, stages, stage media, sections, profiles, and associated objects. Geometry keys are accepted only as skipped fields and return warnings until a geometry validation contract exists. Basic `object_iti` summary fields (distance, `duration_min`, difficulty, `elevation_gain`, `elevation_loss`, loop, open status, status note) stay on the direct `object_iti` upsert save path (`buildItineraryUpsertPayload`); the earlier duration/elevation column-name mismatch is **resolved** — greenfield retype to `duration_min` (minutes) + added `elevation_loss`.

## Editable Fields

Already safe:
- distance.
- duration — **resolved**: the DB column is now `duration_min` (minutes), matching the editor field; no conversion on read/write.
- difficulty.
- elevation gain (`elevation_gain`) and negative elevation (`elevation_loss`) — **resolved**: both columns exist; the editor maps elevationPositiveM → `elevation_gain` and elevationNegativeM → `elevation_loss`.
- loop flag.
- open status.
- status note.
- practices.

Phase 1:
- info blocks.
- stages: name, description, position.

Phase 2:
- stage media.
- sections.
- profiles.
- associated objects.

## Blocked Fields

- trace and geometry editing.
- generated profile data derived from geometry.
- imported geometry/source metadata.

## Tables

- `object_iti`
- itinerary practice link table.
- `object_iti_info`
- `object_iti_stage`
- `object_iti_stage_media`
- `object_iti_section`
- `object_iti_profile`
- `object_iti_associated_object`

## RLS / Permission Requirements

- editor can select and update the target itinerary object.
- editor can insert/update/delete nested rows scoped to that object.
- associated object links require select permission on the linked object.
- geometry writes require a separate validation and audit contract.

## Save Strategy

Keep the current direct save for simple `object_iti` fields and practices while it remains proven. Use `api.save_object_itinerary_nested` for nested payloads after the UI exposes those controls.

Trace/geometry remains read-only. Unsupported UI fields should be marked as UI mapping gaps when the DB has a related column, not as DB limitations.

## Delete Behavior

Nested rows omitted from the submitted phase payload are deleted only for that phase. Stage media is deleted when its owning stage is deleted.

## Ordering Behavior

Stages and sections use explicit `position` values. The RPC normalizes duplicates and returns warnings.

## Frontend Dirty / Save Behavior

One itinerary section can have mixed controls: basic fields enabled, geometry controls disabled with a tooltip, and nested fields disabled until their RPC phase lands.

## Tests

- parser tests for summary fields, practices, stages, sections, profile summary, and associated objects.
- current simple save tests.
- Phase 1 RPC tests for info/stages create/update/delete/reorder.
- geometry read-only tooltip test.
- rollback test for invalid stage payload.
