# Openings Write Contract

## Scope

The openings module covers opening periods, schedules, weekdays, time periods, and time frames for an object. It is currently read-only in the shell and must stay blocked until the transactional contract exists.

## 2026-05-20 RPC Status

`api.save_object_openings(p_object_id text, p_payload jsonb)` is defined in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.

The RPC uses DB column names and covers `periods`, nested `schedules`, `time_periods`, `weekdays`, and `time_frames`. It replaces the submitted opening tree for the object in one transaction.

After the SQL was reported applied successfully, the drawer module was unlocked for the core schedule surface:
- opening periods.
- date range and all-year flag.
- weekday open/closed state.
- one or more time frames per open weekday.

Remaining UI gaps are tracked as contract-backed fields, not DB limitations.

## Editable Fields

- period label, start date, end date, source period id, all-year flag, name translations, extra metadata.
- schedule type, schedule label, notes, translations, extra metadata.
- weekday assignment.
- time period closed state and note.
- time frame start time, end time, and recurrence interval.

## Blocked Fields

- generated/import source metadata.
- audit fields.
- `source_period_id`, i18n maps, schedule notes, `extra`, and recurrence editing until the UI exposes those controls.

## Tables

- `opening_period`
- `opening_schedule`
- `opening_time_period`
- `opening_time_period_weekday`
- `opening_time_frame`

## RLS / Permission Requirements

- authenticated editor can select the target object and existing opening rows.
- authenticated editor can insert/update/delete only rows scoped to editable objects.
- update policies must have matching select policies.
- function must verify object ownership/edit permission before mutating.

## Save Strategy

Use one Postgres RPC, `api.save_object_openings(p_object_id text, p_payload jsonb)`.

The RPC should:
- validate the object is editable by the caller.
- validate dates and time ranges.
- upsert or replace nested rows in one transaction.
- delete rows omitted from the submitted payload.
- return standardized mutation results.

## Delete Behavior

Deleting a period deletes its schedules, weekdays, time periods, and time frames in the same transaction. Child deletes must be scoped to the submitted object id to avoid cross-object deletion.

## Ordering Behavior

The current opening tables do not expose persisted ordering columns. Ordering should follow payload order in the UI until the schema adds explicit position fields.

## Frontend Dirty / Save Behavior

`openings` is no longer in `READONLY_MODULES` for users allowed by the safe-write permission gate. Unsupported advanced fields should be explained through concise tooltips and tracked as UI gaps.

## Tests

- parser test for current and next-year periods.
- RPC create/update/delete/reorder tests.
- rollback test when one nested time frame is invalid.
- permission failure test.
- drawer test confirming the tooltip while read-only and savebar after unlock.
