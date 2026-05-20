# Object Workspace Safe Write RPCs

Last updated: 2026-05-20

## Source Of Truth

The database schema defines the write surface. UI forms can expose a smaller subset at first, but payloads sent to the safe-write layer use database column names and preserve DB-backed fields whenever the payload contains them.

The SQL implementation lives in:

- `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`

Apply it after `schema_unified.sql` and `rls_policies.sql`.

## Shared Pattern

Helpers live in the non-exposed `internal` schema:

- `internal.workspace_assert_can_write_object(p_object_id text)` rejects missing, unknown, or unauthorized objects.
- `internal.workspace_result(...)` returns a stable JSONB result.
- `internal.workspace_uuid(...)`, `internal.workspace_jsonb_array(...)`, and `internal.workspace_jsonb_object(...)` normalize RPC payload values.

Callable RPCs live in the exposed `api` schema. Every RPC accepts:

- `p_object_id text`
- `p_payload jsonb`

Every RPC returns:

```json
{
  "success": true,
  "changed_counts": {},
  "skipped_fields": [],
  "warnings": []
}
```

RPCs are `SECURITY INVOKER`; row-level security still applies to the caller. The internal authorization helper is `SECURITY DEFINER` only to centralize the object edit check.

## DB Rules Added Or Strengthened

- RLS is enabled for openings, commercial child tables, itinerary nested tables, relation tables, and place-scope tables.
- Owner-write policies include explicit `WITH CHECK` clauses for inserted or updated rows.
- Child-table policies validate ownership through the parent row where the child table does not carry `object_id`.
- Existing uniqueness intent is enforced or reused:
  - one primary place per object.
  - one primary organization link per object.
  - no duplicate object relation.
  - no duplicate stage media link.
  - no duplicate weekday per opening time period.
- Additional date validation constraints are added for price validity, discount validity, and place effective date ranges when they are missing.
- RPC validations cover:
  - missing or unknown object id.
  - unknown references.
  - date/time range checks through existing table constraints.
  - self-relations.
  - incoming relation ownership.
  - media/place cross-object scope.
  - primary place and primary organization conflicts.
  - geometry fields skipped until geometry validation is added.
  - actor/contact consent skipped until audit rules are added.

## RPC Matrix

| RPC | Tables covered | Writable payload roots | Skipped / blocked |
| --- | --- | --- | --- |
| `api.save_object_openings` | `opening_period`, `opening_schedule`, `opening_time_period`, `opening_time_period_weekday`, `opening_time_frame` | `periods`, nested `schedules`, `time_periods`, `weekdays`, `time_frames` | none in the current contract |
| `api.save_object_commercial` | `object_language`, `object_payment_method`, `object_environment_tag`, `object_amenity`, `object_capacity`, `object_group_policy`, `object_pet_policy`, `object_price`, `object_price_period`, `object_discount` | `languages`, `payment_methods`, `environment_tags`, `amenities`, `capacities`, `group_policy`, `pet_policy`, `prices`, `discounts` | `promotions` |
| `api.save_object_itinerary_nested` | `object_iti_info`, `object_iti_stage`, `object_iti_stage_media`, `object_iti_section`, `object_iti_profile`, `object_iti_associated_object` | `info`, `stages`, `sections`, `profiles`, `associated_objects` | `object_iti.geom`, `object_iti_stage.geom`, `object_iti_section.geom` |
| `api.save_object_relations` | `object_relation`, `object_org_link` | `object_relations`, `org_links` | `incoming_relations`, `actors` |
| `api.save_object_places` | `object_place`, place-scoped `object_location`, `object_place_description`, place-scoped `media`, `object_zone` | `places`, nested `locations`, `descriptions`, `media`, plus `zones` | zone geometry if added later without validation |

## Frontend Integration

The commercial module save path now calls `api.save_object_commercial` through `supabase.schema('api').rpc(...)`.

Mapped modules:

- characteristics: languages, payment methods, environment tags, amenities.
- capacity/policies: capacities, group policy, pet policy.
- pricing: prices, price periods, discounts.

Panels remain locked for live writing until the SQL script is applied to the target database and RPC/RLS tests pass. Unsupported visible controls must be labelled as a UI gap or blocked sub-contract, not as a database limitation.

## Required SQL Tests

For each RPC:

- create a full payload.
- update existing rows.
- delete omitted rows when the payload root is supplied.
- clear explicitly with empty arrays or `null` where supported.
- reorder records through `position` columns.
- repeat the same payload to confirm idempotence where uniqueness rules apply.
- fail and roll back on invalid references.
- fail and roll back on permission errors.

RLS scenarios:

- owner succeeds.
- non-owner fails.
- service role succeeds.

## Rollout Notes

- Openings and relations should stay read-only in the drawer until their edit panels are changed to produce the DB-first payloads.
- Itinerary basic fields can remain on the existing direct save until the schema mismatch around duration/elevation columns is resolved. Nested itinerary data should use `api.save_object_itinerary_nested`.
- Geometry remains read-only until a separate validation contract accepts and validates geometry payloads.
- Actor/contact consent remains read-only until an audit trail contract exists.
