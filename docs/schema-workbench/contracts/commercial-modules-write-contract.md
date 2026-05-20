# Commercial Modules Write Contract

## Scope

This contract covers characteristics, capacity/policies, and pricing. These modules have save functions but live permissions currently block them outside demo mode.

## 2026-05-20 RPC Status

`api.save_object_commercial(p_object_id text, p_payload jsonb)` is defined in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.

The frontend save functions for characteristics, capacity/policies, and pricing now call this RPC with DB column names. Live drawer permissions remain locked until the SQL is applied to the target DB and RLS/rollback tests pass.

## Editable Fields

Characteristics:
- languages and levels.
- payment methods.
- environment tags.
- amenities.

Capacity/policies:
- capacity metric rows.
- group policy.
- pet policy.

Pricing:
- prices.
- price periods.
- discounts.

## Blocked Fields

- promotions until ownership and publication rules are explicit.
- generated commercial visibility values.
- imported source metadata.

## Tables

- language/reference and object language link tables.
- payment/environment/amenity link tables.
- capacity metric and policy tables.
- `object_price`, price period tables, discount tables, promotion tables.

## RLS / Permission Requirements

- each child link table must allow select/insert/delete for rows scoped to editable objects.
- pricing update/delete must be transactional because price periods depend on parent price rows.
- update policies must have matching select policies.

## Save Strategy

Use `api.save_object_commercial` for characteristics, capacity/policies, and pricing. The RPC replaces the submitted collection roots for the object and returns standardized changed counts, skipped fields, and warnings. Promotions remain outside this RPC until ownership and publication rules are explicit.

## Delete Behavior

Replace-all saves delete omitted child links/rows only inside the current object and module family. Promotions are not deleted by the pricing editor until a promotion contract exists.

## Ordering Behavior

Prices and periods use explicit positions when available. If a table lacks ordering, preserve current read order and do not invent a persisted position.

## Frontend Dirty / Save Behavior

Keep live write disabled until tests prove the contract. Disabled modules should show tooltip-backed reasons. After unlock, dirty state and savebar should behave exactly like general info and localization.

## Tests

- characteristics add/remove link tests.
- capacity metric create/update/delete tests.
- group/pet policy tests.
- pricing price/period/discount rollback tests.
- permission failure tests for each module.
