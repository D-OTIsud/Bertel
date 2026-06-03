# P0.3 — Close the anon draft-read leak on object-child tables (RLS read gate)

**Date:** 2026-06-03
**Author:** d.philippe@otisud.com (with Claude)
**Status:** design — approved (scope: broad sweep)
**Roadmap:** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §24, item P0.3 (was scoped S1 = coordinates; **this spec corrects and broadens it**)
**Depends on:** `rls_policies.sql` (defines `api.can_read_extended`), `schema_unified.sql`. Independent of SP‑1/SP‑1b but grouped after them in the apply order.

---

## 1. Problem & corrected finding

`api.can_read_extended(p_object_id)` already gates row-level read for the *sensitive* object-child tables via the two-policy pattern (`object`, `media`, `contact_channel`, `object_description`, `object_legal`, `object_discount`, `object_group_policy`): a **public** policy keyed on publication state OR an **extended** policy via `can_read_extended`.

But **40 other object-child tables ship a permissive `FOR SELECT USING (true)` policy**, and `anon` holds `SELECT` on every one of them (verified on live PROD — Supabase's blanket default privileges are in effect; the explicit grant block at `rls_policies.sql:3251` is redundant belt-and-suspenders). The `object` table itself only exposes `published` rows to `anon`, but `anon` can hit PostgREST directly —
`GET /rest/v1/object_location`, `/object_price`, `/opening_period`, `/object_menu`, `/object_relation`, `/object_org_link`, `/object_capacity`, `/object_fma_occurrence`, … — and read **draft/hidden objects' coordinates, pricing, opening hours, menus, relations, owning-ORG, and capacity**. The child object_ids returned then re-identify the unpublished parent objects. The whole child data model for unpublished objects is world-readable.

**Correction to §24 / S1.** The blocker entry described the leak as *coordinates only* (`object_location`/`object_place`) and cited `rls_policies.sql:876-877` — but those lines are the **already-gated `object`** policies. The real `USING(true)` surface is line 887 onward across 40 tables. Severity is higher and the fix is **M**, not the logged **S**. This spec is the explicit change request that reopens and broadens P0.3.

### Why a broad RLS fix is low-risk (verified)
- The **public/anon app reads through `SECURITY DEFINER` RPCs** (`list_object_resources_filtered_page`, `get_object_with_deep_data`, `get_object_resource`) which bypass RLS and filter visibility internally. Tightening base-table RLS does not touch this path.
- The **editor's direct `client.from('object_*')` reads run as `authenticated`** ([object-workspace.ts](../../../bertel-tourism-ui/src/services/object-workspace.ts)) and the editor holds `can_read_extended` on its own ORG's objects — so gated reads still succeed.
- `service_role` and `SECURITY DEFINER` owners bypass RLS — unaffected.

So the fix only closes the **direct-PostgREST `anon`** (and authenticated cross-ORG) hole. It is the READ-side mirror of SP‑1b (writes).

## 2. Goal / Non-goals

**Goal.** Every leaking object-child table becomes readable under the same rule as its parent object: **`published` → anyone (incl. `anon`); `draft`/`hidden`/`archived` → only `can_read_extended` (own-ORG actor/member, scope, or superuser).**

**Non-goals.**
- No change to write policies (SP‑1/SP‑1b own those).
- No change to publication semantics or `object.status` flow.
- Not broadening any *already-gated* child (see §6). P0.3 only **closes leaks**, never **opens** access.
- No app/frontend change (the editor and RPC paths are unaffected by construction).

## 3. Design

### 3.1 Single source of truth — `api.can_read_object`
```sql
CREATE OR REPLACE FUNCTION api.can_read_object(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT EXISTS (SELECT 1 FROM object o WHERE o.id = p_object_id AND o.status = 'published')
      OR api.can_read_extended(p_object_id);
$$;
GRANT EXECUTE ON FUNCTION api.can_read_object(text) TO anon, authenticated, service_role;
```
- `SECURITY DEFINER` so the published-check sees the true `object.status` (bypassing the caller's RLS on `object`) and the inner `can_read_extended` runs as owner (anon has no direct EXECUTE on it).
- Semantics by caller:
  - `anon` + published object → `true` (published child stays public); + draft → `false` (**leak closed**).
  - `authenticated` editor + own-ORG draft → `can_read_extended` `true` → `true`.
  - `authenticated` other-ORG user + someone's draft → `false`.
  - `service_role` → bypasses RLS entirely.
- Symmetric to SP‑1's `api.user_can_write_object_canonical`.

### 3.2 Per-table policies (replace, don't add)
RLS permissive policies are OR'd, so a `USING(true)` policy must be **dropped and replaced** (unlike SP‑1b, which *added* companions to predicate-gated policies). For each of the 40 tables: `DROP POLICY IF EXISTS "<exact current policy name>"` then `CREATE POLICY "read_<table>" ... FOR SELECT USING (api.can_read_object(<path>))`.

> **Correctness lynchpin:** dropping the *exact current* policy is mandatory — a permissive `true` policy left in place keeps the leak open (`true OR x = true`). Current names come straight from the live catalog query (e.g. `object_location` → `"Lecture publique des localisations"`, `object_price` → `"pub_price_read"`, `object_place` → `"Lecture publique des places"`), and the §7.1 coverage test fails if any `true` qual survives on the 40 tables. The new policy may instead **reuse** the prior name (drop + recreate same name with the gated qual); naming is finalized in the plan.

**Family A — direct object key (24 tables).** `USING (api.can_read_object(<col>))`:

| Table | key column |
|---|---|
| object_place, object_price, object_capacity, object_zone, object_org_link, object_origin, object_fma_occurrence, object_pet_policy, object_menu, object_meeting_room, object_iti_practice, object_iti_stage, object_iti_info, object_iti_associated_object, object_iti_profile, opening_period, object_classification, object_amenity, object_environment_tag, object_language, object_payment_method, promotion_object | `object_id` |
| object_relation | `source_object_id` |
| object_iti_section | `parent_object_id` |

**Family B — `object_location` (nullable object key, 1 table).** A row may be place-scoped (`object_id` NULL, `place_id` set):
```sql
USING (api.can_read_object(
  COALESCE(object_location.object_id,
           (SELECT op.object_id FROM object_place op WHERE op.id = object_location.place_id))))
```

**Family C — parent EXISTS (nested, 13 tables).** `USING (EXISTS (… AND api.can_read_object(<parent>.object_id)))`:

| Table | path to object |
|---|---|
| object_price_period | `price_id` → object_price.object_id |
| object_menu_item | `menu_id` → object_menu.object_id |
| object_menu_item_dietary_tag, object_menu_item_allergen, object_menu_item_cuisine_type, object_menu_item_media | `menu_item_id` → object_menu_item.menu_id → object_menu.object_id |
| meeting_room_equipment | `room_id` → object_meeting_room.object_id |
| object_iti_stage_media | `stage_id` → object_iti_stage.object_id |
| object_place_description | `place_id` → object_place.object_id |
| opening_schedule | `period_id` → opening_period.object_id |
| opening_time_period | `schedule_id` → opening_schedule.period_id → opening_period.object_id |
| opening_time_period_weekday | `time_period_id` → opening_time_period → opening_schedule → opening_period.object_id |
| opening_time_frame | `time_period_id` → opening_time_period → opening_schedule → opening_period.object_id |

(Nested join shapes copied verbatim from SP‑1/SP‑1b's proven write policies — `migration_permission_write_paths.sql` §6 and `migration_permission_write_paths_b.sql` Family A.3.)

**Family D — polymorphic `tag_link` (1 table).** Gate only object-targeted tags; leave non-object targets (media/actor/etc.) untouched:
```sql
USING ((target_table = 'object' AND api.can_read_object(target_pk)) OR target_table <> 'object')
```

**Family E — media-scoped `media_tag` (1 table).** Mirror `media`'s own gate (media visibility keys off `media.is_published`, not object status):
```sql
USING (EXISTS (SELECT 1 FROM media m
               WHERE m.id = media_tag.media_id
                 AND (m.is_published IS TRUE OR api.can_read_extended(m.object_id))))
```

**Total: 40 tables** (24 + 1 + 13 + 1 + 1). List verified against the live catalog (permissive SELECT/ALL policy with `qual = true` AND `anon` has SELECT), excluding intentionally-public `ref_*`/`i18n_translation` vocabulary.

## 4. Edge cases
- **Orphan child rows** (`object_id` NULL with no resolvable parent) become invisible to non-`service_role`. Acceptable: orphans shouldn't exist; migrations/`service_role` still see them. Cascade FKs (`ON DELETE CASCADE`) make true orphans unlikely.
- **Per-row cost on direct reads.** `can_read_object` runs per row only for *direct PostgREST* reads (the app uses RPCs). The `published` EXISTS short-circuits the OR for published rows; for `anon` the `can_read_extended` branch collapses to empty CTE scans. `can_read_extended` is already used per-row in existing RLS (`object`, `media`, `contact_channel`) — same accepted pattern.
- **Published child of a draft media** (`media_tag`): handled by Family E referencing `media.is_published` rather than object status.

## 5. Packaging
- New file `Base de donnée DLL et API/migration_rls_read_gate_p03.sql` — `BEGIN; … COMMIT;`, idempotent (`DROP POLICY IF EXISTS` + `CREATE`), reversible (re-`CREATE … USING (true)` to revert; documented in the file header).
- Manifest slot: **after** `migration_permission_write_paths_b.sql` (only needs `can_read_extended` from `rls_policies.sql`; grouped with the permission migrations). Update `Base de donnée DLL et API/ci_fresh_apply.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`, root `README.md` + `Base de donnée DLL et API/README.md` quick-starts.

## 6. Explicitly out of scope (logged, not fixed)
- **Already-gated children** — `object_taxonomy`, `object_sustainability_action`, `object_room_type(+_amenity/_media)`, `object_sustainability_action_label`, `object_discount`, `object_group_policy`: not `USING(true)` on live, so not leaking. Left as-is. (`object_taxonomy`/`object_sustainability_action` are anon-*granted* but RLS-gated — confirmed no `true` qual.)
- **Under-exposure inconsistency** — some already-gated children are *extended-only* (a published object's room-types aren't `anon`-readable directly), unlike the now-`published-OR-extended` set. That's missing access, not a leak; broadening is a **separate** future decision, not P0.3.
- **Redundant `anon` grant block** (`rls_policies.sql:3251-3257`) — harmless duplication; optional cleanup later.
- Archetype detail tables (`object_act`/`object_iti`/`object_heb`/`object_res`/`object_fma`) — not `USING(true)`, not leaking.

## 7. Verification (CI gate)
Two SQL tests added to `ci_fresh_apply.sql`, mirroring `tests/test_sp1b_canonical_coverage.sql` + `tests/test_sp2_permission_behavior.sql`:

1. **`tests/test_p03_read_gate_coverage.sql` (regression guard).** Assert that none of the 40 listed object-child tables still has a permissive SELECT/ALL policy with `qual = 'true'`, AND each has a SELECT policy whose qual references `can_read_object` (or, for `media_tag`, `can_read_extended`). Fails loudly if a future table reintroduces `USING(true)`.
2. **`tests/test_p03_read_gate_behavior.sql` (behavioral proof).** Seed one `published` + one `draft` object, each with an `object_location`, `object_price`, and a nested `object_price_period` / `opening_*` row. Then:
   - as `anon`: assert the published rows are visible and the draft rows are **not**;
   - as an other-ORG `authenticated` user (no `can_read_extended`): assert the draft rows are **not** visible;
   - as `service_role`: assert all rows visible.
   Covers Family A, B (nullable), C (nested), and the helper.

## 8. Definition of done
1. Migration + 2 tests written; manifest + runbook + READMEs updated.
2. **CI gate green** (fresh-apply reproduces + both P0.3 tests pass) on the feature branch.
3. Merge to `master`.
4. **Apply to live PROD** via Supabase MCP migration (documented ⇒ not PROD-only drift, per the deploy-integrity invariant) — *re-confirm with the user before applying* (outward-facing). Read-back verify: `api.can_read_object` exists; the 40 tables carry a `can_read_object`/`can_read_extended` SELECT policy and no `true` qual; spot-check that `anon` cannot read a known draft object's `object_location`.
5. Update §24 (correct S1, mark P0.3 done) + refresh MEMORY.

## 9. Risks
- **Missed a leaking table.** Mitigated: list derived from the live catalog, not the SQL file; coverage test enforces it ongoing.
- **A direct anon read path exists that I didn't find.** Mitigated: grep shows all direct `from('object_*')` reads are authenticated editor paths; public reads go via SECURITY DEFINER RPCs. If a published-only direct anon read exists, the `published` branch preserves it.
- **Nested path typo.** Mitigated: join shapes copied verbatim from the merged, CI-green SP‑1/SP‑1b write policies; behavioral test exercises a nested table.
