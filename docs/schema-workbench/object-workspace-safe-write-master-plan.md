# Object Workspace Safe Write Master Plan

Last updated: 2026-05-20

## Purpose

This roadmap defines how the object edit workspace becomes safely writable module by module. A module is only unlocked for live editing after its table contract, RLS/permission behavior, mutation strategy, delete semantics, ordering semantics, UI dirty/save behavior, and tests are explicit.

The shared backend assumptions are aligned with current Supabase guidance: exposed tables require RLS policies, updates also need a matching select policy, and nested multi-table changes should be grouped behind Postgres functions called with `supabase.rpc`.

References:
- Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase RPC docs: https://supabase.com/docs/reference/javascript/rpc

## 2026-05-20 Checkpoint

Implemented now:
- master roadmap and per-module write contract docs.
- DB-first safe-write RPC script in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.
- standardized RPC result shape: `success`, `changed_counts`, `skipped_fields`, `warnings`.
- owner-write RLS policies with `WITH CHECK` for the new safe-write surface.
- commercial modules now map frontend saves to `api.save_object_commercial` instead of direct multi-table writes.
- restaurant menu item multi-media support with ordered `mediaIds`.
- legacy compatibility: first selected media is still written to `object_menu_item.media_id`.
- parser coverage for legacy `media_id` plus `object_menu_item_media`.

Still locked intentionally:
- openings until the transactional RPC is applied to the DB, tested, and the edit panel produces DB-first payloads.
- relationships until object relation and organization link RPCs are applied, tested, and actor consent remains safely separated.
- itinerary nested data beyond basic fields/practices.
- commercial modules until live permissions and RPC/RLS tests are verified against the target DB.
- place-level place CRUD/zones until scope and geometry contracts are verified.

## Shared Safe Write Pattern

Use transactional Postgres RPCs when a save touches nested child tables, deletes/reinserts children, geometry, consent, ordering, or multiple ownership scopes. Keep direct Supabase writes only for simple single-table modules or modules that already have proven delete/reinsert behavior under current RLS.

Every mutation result should return:
- `success`: boolean.
- `changed_counts`: object keyed by table or logical child collection.
- `skipped_fields`: list of fields the contract intentionally ignored.
- `warnings`: non-fatal data or permission warnings.

Every UI module should preserve:
- dirty state by section.
- savebar state by section.
- disabled controls when write permission is missing.
- read-only tooltip explaining the missing contract.
- unsaved-navigation protection.
- demo-mode no-op behavior.

## Module Matrix

| Module | Current UI state | Current permission state | Source tables | Missing write contract | Target write strategy | Rollout order | Test evidence required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Openings | Visible but shell read-only via `READONLY_MODULES`. | `canDirectWrite=false`; live C6 writing not exposed. | `opening_period`, `opening_schedule`, `opening_time_period`, `opening_time_period_weekday`, `opening_time_frame`. | Transaction boundaries, nested delete/reorder, weekday/timeframe validation. | Postgres RPC for full period payload, returning changed counts and warnings. | 1 | RPC tests for create/update/delete/reorder, drawer savebar test, read-only tooltip removal test. |
| Relationships / rattachements | Visible but shell read-only. | `canDirectWrite=false`; write paths not locked. | object relation tables, org link tables, actor/contact tables, consent/audit tables. | Relation direction validation, duplicate prevention, consent audit trail, role ownership. | RPC by relation family; object relations first, org links second, actor consent later. | 4 | Duplicate prevention, direction validation, permission failure, unsaved navigation tests. |
| Provider follow-up | Visible but shell read-only. | Shell read-only. | private notes/follow-up tables. | Author/audience permissions and audit behavior. | Separate note contract after object workspace contracts. | Later | Note create/edit/delete audit tests. |
| Sync identifiers | Visible but shell read-only. | Shell read-only. | external identifier and origin tables. | Source-system authority and conflict rules. | Keep read-only unless import tooling owns writes. | Later | Read-only tooltip and hidden write controls tests. |
| Characteristics | Editable in demo; live blocked. | `canDirectWrite=session.demoMode`; live C1 not exposed. | language, payment, environment, amenity link tables and references. | Complete live RLS and idempotent child link save confirmation. | Harden existing direct save or replace with small RPC. | 3 | Idempotent save, add/remove links, unknown code failure, permission failure. |
| Capacity/policies | Editable in demo; live blocked. | `canDirectWrite=session.demoMode`; complete C4 save not exposed. | capacity metrics, group policies, pet policies. | Complete live RLS, child delete/reinsert safety. | RPC if deleting/reinserting child rows remains necessary. | 3 | create/update/delete policy and metric rows, permission failure, no orphan rows. |
| Pricing | Editable in demo; live blocked. | `canDirectWrite=session.demoMode`; transactional C5 save not exposed. | `object_price`, price periods, discounts, promotions. | Transactional price+period+discount behavior and promotion ownership. | RPC for prices/periods/discounts; promotions read-only until separate contract. | 3 | price period reorder, discount delete, rollback on invalid reference. |
| Menus | Writable; dish media was single legacy `media_id`. | Direct write enabled when session allows direct modules. | `object_menu`, `object_menu_item`, dietary/allergen/cuisine links, `object_menu_item_media`, `media`. | Multi-media dish/menu links and compatibility with legacy first media. | Direct save using existing menu delete/reinsert pattern; preserve `object_menu_item.media_id` as first media. | 2 | Parser multi-media, add/remove/reorder media links, legacy first-media compatibility. |
| Itinerary | Partly writable. | Basic `object_iti` fields and practices writable; nested/geometry blocked. | `object_iti`, practice links, `object_iti_info`, `object_iti_stage`, `object_iti_stage_media`, `object_iti_section`, `object_iti_profile`, `object_iti_associated_object`. | Nested stage/info/section/profile saves; geometry validation. | RPC for stages/info/sections/profile/associated objects; geometry separate later. | 3 | nested payload parser, stage/info save, rollback, geometry read-only tooltip. |
| Place descriptions/media/places/zones | Object-level descriptions/media/location partly writable; place-level surfaces limited. | Place descriptions/media partly blocked; places/zones blocked or limited. | `place`, place descriptions, `media` with `place_id`, zones/geometry tables. | Place ownership, ordering, explicit scope, geometry validation. | Direct save for place descriptions/media after scope rules; RPC for place CRUD; zones remain geometry-gated. | 5 | scope isolation, place media link, place CRUD ordering, zones read-only tooltip. |

## Current Code Blockers To Preserve Until Contracted

- `openings`, `relationships`, `provider-follow-up`, and `sync-identifiers` are shell read-only in `ObjectDrawerShell.tsx`.
- `characteristics`, `capacity-policies`, and `pricing` are demo-only for live writes in `object-workspace.ts`.
- itinerary only safely writes basic `object_iti` fields and practices; trace/geometry and deeper nested records remain blocked.
- restaurant menu media only supported one media reference before this roadmap.
- place-level descriptions/media/places/zones are partially blocked.

## Rollout

1. Document all write contracts and keep blocked modules disabled.
2. Implement restaurant menu media because the join table already exists and the current save pattern is known.
3. Implement openings via a transactional RPC, then remove `openings` from shell read-only.
4. Harden and unlock commercial modules after live RLS and rollback tests pass.
5. Implement itinerary stages/info, then sections/profile/associated objects. Geometry remains blocked.
6. Implement object relations, then organization links. Actor/contact consent remains read-only until audited.
7. Implement place descriptions, then place media, then place CRUD. Zones remain blocked until geometry validation exists.

## Required Evidence Before Unlocking A Module

- Parser test for every accepted payload shape.
- Mutation or RPC test for create, update, delete, reorder, idempotent save, and permission failure.
- Drawer interaction test for dirty state, savebar, disabled state, tooltip copy, and unsaved navigation.
- `npm run typecheck`.
- `npm run test:run -- --runInBand` or a documented narrower command while the full suite is too expensive.
