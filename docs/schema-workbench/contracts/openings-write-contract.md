# Openings Write Contract

## Scope

The openings module covers opening periods, schedules, weekdays, time periods, and time frames for an object. It is currently read-only in the shell and must stay blocked until the transactional contract exists.

## 2026-05-20 RPC Status

`api.save_object_openings(p_object_id text, p_payload jsonb)` is defined in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.

The RPC uses DB column names and covers `periods`, nested `schedules`, `time_periods`, `weekdays`, and `time_frames`. It replaces the submitted opening tree for the object in one transaction. The drawer module remains read-only until this SQL is applied to the target DB, tested under RLS, and the edit panel is upgraded to submit the DB-first payload.

## Editable Fields

- period label, start date, end date, source period id, all-year flag, name translations, extra metadata.
- schedule type, schedule label, notes, translations, extra metadata.
- weekday assignment.
- time period closed state and note.
- time frame start time, end time, and recurrence interval.

## Blocked Fields

- generated/import source metadata.
- audit fields.
- any exceptional closure model not represented by the current C6 tables.

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

Keep `openings` in `READONLY_MODULES` until this RPC and tests land. The UI should keep disabled inputs and expose the reason through a tooltip, not an inline paragraph.

## Tests

- parser test for current and next-year periods.
- RPC create/update/delete/reorder tests.
- rollback test when one nested time frame is invalid.
- permission failure test.
- drawer test confirming the tooltip while read-only and savebar after unlock.
