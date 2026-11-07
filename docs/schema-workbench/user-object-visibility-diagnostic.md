# User object visibility diagnostic

Investigation target: `user_id = 44b43d4b-e5be-446d-aac0-0a5b43a4cdc2`
Observed symptom: only published objects show up in the Explorer.
Generated: 2026-05-19, read-only diagnosis. No DB writes, no schema changes, no code changes.

---

## 1. Tools available in this Cursor session

| Capability | Status | Notes |
| --- | --- | --- |
| Search the codebase | yes | Grep / Glob across the whole workspace. |
| Read files under `docs/schema-workbench/` | yes | Only `db-connection-check.md` and `schemaspy-output/` are present today. The `live-*.csv` and `mapping-vs-live-schema-gaps.md` files mentioned in the brief do **not** exist in the workbench. Diagnosis used SQL files + the live DB instead. |
| Terminal access | yes | PowerShell. |
| `.env.schemaspy` | yes | Loaded values (no secrets printed). |
| `psql` CLI | **no** | Not installed in the current shell (`Get-Command psql` returns nothing). |
| Read-only Postgres access | yes | Built a lightweight Python helper `.tools/sql_ro.py` using `psycopg2-binary`. It opens a connection in `READONLY` mode, sets `statement_timeout = 30s`, rejects write statements at the client, and never prints `PGPASSWORD` nor the DSN. |
| Supabase MCP | **no** | No `mcp` Supabase tool exposed in this session. All DB calls go through the read-only psycopg2 helper. |

Connection smoke test (no secrets): `db_user=postgres`, `db_name=postgres`, 170 tables in `public`. Matches the previously recorded `db-connection-check.md` (table count differs by 9 because of work since 2026-05-19 11:05).

---

## 2. UI query path

1. `bertel-tourism-ui/src/app/(main)/explorer/page.tsx` renders the Explorer.
2. Data comes from `useExplorerCardsQuery()` in `bertel-tourism-ui/src/hooks/useExplorerQueries.ts`.
3. That hook:
   - reads `canEditObjects` from `useSessionStore`,
   - calls `resolveExplorerStatuses(filters.common.statuses, canEditObjects)` (`bertel-tourism-ui/src/utils/facets.ts`),
   - hands the resolved status array to `listExplorerCards(...)` → `listExplorerPage(...)` in `bertel-tourism-ui/src/services/rpc.ts`,
   - which finally calls `supabase.schema('api').rpc('list_object_resources_filtered_page', { p_status, … })`.
4. `resolveExplorerStatuses`:
   ```
   configured.length > 0  → return configured
   else                   → canEditObjects ? ['published','draft'] : ['published']
   ```
5. `canEditObjects` is hydrated at boot by `useBootstrapSession.ts` → `fetchCanEditObjects()` → `supabase.schema('api').rpc('current_user_can_edit_objects')`. Errors silently fall back to `false`.

So the UI only restricts the user to "published" when:
- the explicit status filter is empty in the UI **and**
- `api.current_user_can_edit_objects()` resolved to `false`.

---

## 3. API/RPC path

The Explorer call:
```
api.list_object_resources_filtered_page(
  p_cursor, p_lang_prefs, p_page_size, p_filters,
  p_types, p_status, p_search,
  p_track_format, p_include_stages, p_stage_color, p_view
)
```
Internals (file: `Base de donnée DLL et API/api_views_functions.sql`):
- defaults `p_status` to `ARRAY['published']` when NULL (line 5047, 5119–5121),
- delegates filter selection to `api.get_filtered_object_ids(p_filters, p_types, p_status, p_search)` (line 899),
- joins the resulting IDs back to `object` and renders cards via `api.get_object_cards_batch(...)`.

`api.get_filtered_object_ids` is **SECURITY DEFINER** (bypasses RLS) and uses a hot-path materialized view as a source:
```sql
FROM internal.mv_filtered_objects m
CROSS JOIN params
WHERE params.use_mv
```
…or `object` directly when `use_mv = FALSE` (live path triggered only by certain filters: `city_any`, `amenities_all`, `meeting_room`, `itinerary`, etc.).

After selecting from the source, the status filter is applied:
```sql
AND (p_status IS NULL OR src.status = ANY(p_status))
```

Crucial detail — definition of `internal.mv_filtered_objects` (`schema_unified.sql:4093-4120`):
```sql
CREATE MATERIALIZED VIEW internal.mv_filtered_objects AS
SELECT … FROM object o … WHERE o.status = 'published';
```
**The materialized view only contains `published` rows.** Drafts are physically absent from the cache. So when `use_mv = TRUE` (the default for the no-filter Explorer screen), `src.status = ANY(p_status)` cannot match a draft no matter what `p_status` is.

---

## 4. RLS / roles / membership findings for the user

Resolved by impersonating the JWT (`SET LOCAL request.jwt.claims = '{"sub":"…","role":"authenticated","email":"…"}'`) and querying read-only.

| Check | Value |
| --- | --- |
| `auth.users` row exists | TRUE |
| `app_user_profile.id` | `44b43d4b-e5be-446d-aac0-0a5b43a4cdc2` |
| `app_user_profile.role` (global) | `super_admin` |
| Email | `d.philippe@otisud.com` |
| Active org membership | `ORGRUN000000000B` ("OTI du Sud", type `ORG`) |
| Active admin role | `org_admin` (rank `30`, `is_active=TRUE`) |
| Active business role | `editor` (`is_active=TRUE`) |
| Direct `user_permission` rows | none |
| `org_permission` rows for the org | none |
| `api.is_platform_superuser()` | **TRUE** |
| `api.current_user_org_id()` | `ORGRUN000000000B` |
| `api.current_user_admin_role_code()` | `org_admin` |
| `api.user_has_permission('publish_object')` | FALSE |
| `api.user_has_permission('edit_canonical_when_publisher')` | FALSE |
| `api.user_has_permission('edit_org_enrichment')` | FALSE |
| `api.user_has_permission('create_object')` | FALSE |
| **`api.current_user_can_edit_objects()`** | **TRUE** (via superuser + admin role paths) |

RLS on `object` (file `rls_policies.sql:844-847`):
- `public_objects_published` USING `status = 'published'`
- `extended_objects_org_actor` USING `api.can_read_extended(id)` — TRUE for this user on every draft because (a) `is_platform_superuser` ANDed paths inside `can_read_extended` don't even need to fire and (b) the `own_objects` path matches: there are 474 drafts linked to `ORGRUN000000000B` via `object_org_link`, and the user has an active membership on that ORG.

Confirmed at runtime under impersonation:
```
SELECT COUNT(*) FROM object             → 848   (474 draft + 374 published)
SELECT COUNT(*) FROM object WHERE status='draft' → 474
```
So **RLS gives this user full read access to all 474 drafts**.

---

## 5. Expected vs actual

| Layer | Expected | Actual | OK? |
| --- | --- | --- | --- |
| Auth / profile | `super_admin`, active org_admin of OTI du Sud | matches | yes |
| `api.current_user_can_edit_objects()` | TRUE | TRUE | yes |
| Frontend resolver | `['published','draft']` once canEditObjects resolves | confirmed by code | yes |
| RLS on `object` | TRUE for every draft of OTI du Sud (own_objects path) and for everything (superuser) | TRUE | yes |
| Object data | drafts exist (474 of them in `ORGRUN000000000B`) | TRUE | yes |
| `api.list_object_resources_filtered_page(..., ['published','draft'], ...)` | returns published + draft cards | **returns only the 374 published** | **NO** |
| `internal.mv_filtered_objects` | should contain all status values usable by the Explorer | `WHERE o.status = 'published'` only | **NO** |

Diagnostic SQL evidence (run under impersonation as the target user):
```
variant                total
published_only         374
published_draft        374    ← should be 848, drafts dropped
draft_only             0      ← should be 474
default_no_status      374
```

---

## 6. Root cause

**Backend (database).** The materialized view `internal.mv_filtered_objects`, used as the hot-path cache by `api.get_filtered_object_ids`, is built with a hard `WHERE o.status = 'published'` filter. The Explorer RPC then applies `src.status = ANY(p_status)` *on top of* this already-published-only source, so drafts are physically unreachable through the no-filter path no matter what `p_status` is requested and no matter how permissive the caller's RLS is.

Layers that are **not** the cause:
- Frontend filtering: the resolver correctly broadens the status set when `canEditObjects = TRUE`, which is the case here.
- API default: the function signature defaulting to `['published']` is bypassed by the frontend, which always passes a concrete array.
- RLS / role / membership: the user is `super_admin` *and* `org_admin` of the ORG that publishes all 474 drafts. RLS lets them read everything (verified directly).
- Missing object_org links: the 474 drafts are all linked to `ORGRUN000000000B`.
- Public Explorer endpoint vs admin endpoint: there is only one Explorer RPC; the discriminator is `canEditObjects`, which is correctly TRUE here.

This is a pure backend invariant violation: the published-only cache is incompatible with the "editors see drafts" behavior introduced when `current_user_can_edit_objects()` and the broadened `resolveExplorerStatuses` were added.

Side-effect to keep in mind: because `api.get_filtered_object_ids` is `SECURITY DEFINER` and reads from the MV (which is built once over `object`), it cannot rely on RLS to gate non-published rows. Any fix that broadens the MV must take that into account — drafts of another ORG must not leak to users whose `can_read_extended` would otherwise reject them.

---

## 7. Recommended fix options (not yet implemented)

Listed from most surgical to most invasive. Pick exactly one; do not implement before validating on staging and refreshing the MV.

**Option A — Bypass the MV for editor sessions (smallest blast radius).**
- In `api.get_filtered_object_ids`, set `use_mv := FALSE` whenever the requested `p_status` contains anything other than `'published'`, OR whenever `api.current_user_can_edit_objects()` returns TRUE.
- Pros: no schema change, no MV refresh required, drafts immediately visible to editors via RLS on the live `object` table.
- Cons: editors lose the hot-path cache (latency hit on the Explorer for them). Acceptable because editor sessions are a small fraction of traffic.
- Requirement: the live path filter set currently has bugs when a JSONB filter key is present with an empty array (e.g. `city_any: []` culls everything). Fix the empty-array branches before swapping the default code path — otherwise editors will see 0 results.

**Option B — Broaden the MV (`status IN ('published','draft')`).**
- Edit `schema_unified.sql:4093-4120` to drop the `WHERE o.status = 'published'` predicate (or relax it to include `draft`).
- Re-run `REFRESH MATERIALIZED VIEW … CONCURRENTLY` and add a row in the maintenance schedule.
- Add a status filter to every place where the MV was previously relied on as "published-only" (any view/function that joined `mv_filtered_objects` and skipped the status check).
- Critical: since `api.get_filtered_object_ids` is `SECURITY DEFINER`, **add an RLS-equivalent guard inline** before returning a draft, e.g. `AND (src.status = 'published' OR api.can_read_extended(src.object_id))`. Without this guard, drafts of any ORG would be returned to any authenticated user who happens to pass `p_status = ['draft']`.
- Pros: hot path stays hot for editors; only one place to change.
- Cons: bigger surface, requires audit of all consumers of the MV and a one-shot full refresh.

**Option C — Two-source UNION inside `get_filtered_object_ids`.**
- Keep the MV published-only.
- When `p_status` contains a non-published value, UNION the live `object` rows for those non-published statuses *and* check `api.can_read_extended(src.object_id)` inline.
- Pros: hot path unchanged for published-only queries (most traffic). Authorisation explicit.
- Cons: more code in the function; needs careful indexing on `object(status, …)` to keep the non-MV branch fast.

In all three options, also document in `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §11 (Explorer non-published visibility) that the MV must follow the editor visibility rule, and add a regression test that calls `api.list_object_resources_filtered_page(…, ARRAY['published','draft'], …)` as an editor and asserts a non-zero draft count.

---

## 8. Files inspected

Code:
- `bertel-tourism-ui/src/app/(main)/explorer/page.tsx`
- `bertel-tourism-ui/src/hooks/useExplorerQueries.ts`
- `bertel-tourism-ui/src/hooks/useBootstrapSession.ts`
- `bertel-tourism-ui/src/services/rpc.ts`
- `bertel-tourism-ui/src/store/session-store.ts`
- `bertel-tourism-ui/src/utils/facets.ts` (`resolveExplorerStatuses`)

SQL (Base de donnée DLL et API):
- `api_views_functions.sql` (`api.list_object_resources_filtered_page` line 5041, `api.get_filtered_object_ids` line 899, `api.get_object_cards_batch` line 1639)
- `rls_policies.sql` (`api.is_platform_superuser`, `api.current_user_org_id`, `api.current_user_can_edit_objects`, `api.user_has_permission`, `api.can_read_extended`, policies on `object`)
- `schema_unified.sql` (`internal.mv_filtered_objects` definition, line 4093)

Read-only SQL run (kept under `.tools/queries/`):
- `smoke.sql` – DB connectivity smoke.
- `user_visibility_diag.sql` – profile, memberships, admin/business roles, permissions for the target user.
- `impersonate_check.sql` – call every helper from `api.*` while impersonating the target JWT.
- `impersonate_explorer.sql` – call `api.list_object_resources_filtered_page` with different `p_status` arrays.
- `object_visibility_counts.sql` – global totals by status + reachable totals.
- `mv_check.sql` – row counts in `internal.mv_filtered_objects` vs `object`.
- `impersonate_rls.sql` – RLS check (sees 848 rows including 474 drafts), proves RLS is not the cause.

---

## 9. Exact next recommended fix

Implement **Option A** as the smallest, most reversible patch:

1. In `Base de donnée DLL et API/api_views_functions.sql`, inside `api.get_filtered_object_ids`, change the `use_mv` computation so that any `p_status` that is not exactly `ARRAY['published']` forces `use_mv := FALSE`. Concretely: add a clause like
   ```sql
   AND (p_status IS NULL OR p_status @> ARRAY['published']::object_status[] AND NOT (p_status && ARRAY['draft','archived']::object_status[]))
   ```
   to the existing `use_mv` boolean.
2. Before merging, fix the empty-array filter culls in the live path (`city_any`, `commercial_visibility_any`, `lieu_dit_any`, `payment_methods_any`, `environment_tags_any`, `languages_any`, `media_types_any`, `meeting_equipment_any`, `meeting_equipment_all`, `disability_types_any`, `label_disability_types_any`, `tags_any`, `classifications_any_codes`, `taxonomy_any_codes`, `iti_practices_any`) so an empty array is treated as "no filter" (i.e. `cardinality(arr) = 0 OR ...`).
3. Add a regression test that calls `api.list_object_resources_filtered_page(NULL, ARRAY['fr'], 5, '{}', NULL, ARRAY['published','draft']::object_status[], NULL, 'none', NULL, NULL, 'card')` as an editor and asserts `meta.total > <published_only_count>` and the data contains at least one `status = 'draft'` card.
4. Update `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §11 to record that the editor Explorer requires the live path; document the invariant "any p_status other than ['published'] must bypass `internal.mv_filtered_objects`".

No frontend change is needed.

---

## 10. Fix implemented in source

Applied on 2026-05-19 to the SQL source file only. The live database was
not touched and no migration was run.

### Exact function changed
`api.get_filtered_object_ids(jsonb, object_type[], object_status[], text)`
in `Base de donnée DLL et API/api_views_functions.sql` (function body
around line 899). Two surgical edits inside the `params` CTE; the rest of
the function (filter WHERE clauses, source UNION, label_rank logic) is
unchanged.

### Why the MV was unsafe for draft visibility
`internal.mv_filtered_objects` is defined `WHERE o.status = 'published'`.
The function is `SECURITY DEFINER` and reads the MV via `WHERE
params.use_mv`. The previous `use_mv` boolean only checked which filter
keys were present in `p_filters`; it ignored `p_status`. So whenever the
caller asked for `['published','draft']` and the filters happened to be
MV-compatible (the default Explorer view), the function read the
published-only MV first and then tried to filter by `status = ANY(p_status)`
on rows that did not include any draft. The drafts were physically absent
from the source and the resulting card list silently shrank to the
published count.

### Why the live path is required for editor / admin statuses
Editors and admins legitimately need to see drafts that belong to their
ORG. The live path joins `object` directly under the SECURITY DEFINER
boundary; status filtering is then applied against rows that actually
contain drafts. Per-row authorisation is still enforced **downstream** in
`api.get_object_cards_batch` (which is `STABLE` / `SECURITY INVOKER` and
therefore subject to the `extended_objects_org_actor` RLS policy on
`object`). No leak: a tourism_agent who passes `p_status = ['draft']` will
get draft IDs out of `get_filtered_object_ids`, but the subsequent card
fetch will drop any row their `api.can_read_extended()` rejects.

### Why this preserves public Explorer performance
Public Explorer calls send `p_status = ['published']`. The new clause
```sql
AND (p_status IS NULL OR p_status <@ ARRAY['published']::object_status[]) AS use_mv
```
keeps `use_mv = TRUE` for that case as long as no other live-only filter
is present, so the hot path is untouched. The MV indexes and refresh
schedule are unchanged. EXPLAIN of the live editor path confirms the
planner uses `idx_object_type_status` (bitmap scan) plus
`idx_object_location_object_id` (lateral lookup); see
`docs/schema-workbench/object-visibility-performance-notes.md`.

### Empty-array semantics fixed
The `params` CTE now wraps every `*_any` array parse in `NULLIF(ARRAY(…),
ARRAY[]::text[])`. Result:

| Key shape | Before | After |
| --- | --- | --- |
| key absent | NULL → no filter | NULL → no filter |
| key present, empty array | `ARRAY[]` → `= ANY(…)` / `&&` matched nothing → dropped every row | NULL → no filter |
| key present, non-empty array | filter applied | filter applied |

Filters covered: `commercial_visibility_any`, `amenities_any`,
`amenities_all`, `amenity_families_any`, `payment_methods_any`,
`environment_tags_any`, `languages_any`, `city_any`, `lieu_dit_any`,
`media_types_any`, `meeting_room.equipment_any`,
`meeting_room.equipment_all`, `tags_any`, `itinerary.practices_any`,
`classifications_any_codes`, `taxonomy_any_codes`, `disability_types_any`,
`label_disability_types_any`. WHERE clauses were not touched (they all
short-circuit on `IS NULL`), so the change is genuinely one-shot.

### Performance notes file created
`docs/schema-workbench/object-visibility-performance-notes.md` — routing
table, expected row counts, full index coverage of the live path, EXPLAIN
output, risks, and the rationale for **not** broadening the MV.

### Regression check added
`docs/schema-workbench/object-visibility-regression-check.sql` —
review-only script (single `BEGIN; … ROLLBACK;` envelope, statement
timeout, JWT impersonation). Asserts: use_mv routing, status counts,
empty-array filters no longer cull, editor sees at least one draft card,
published-only path preserves the count.

### Index risks found
None blocking. Live-path tables (`object`, `object_location`,
`object_org_link`, `object_amenity`, `object_classification`, `object_iti`,
`tag_link`, `object_meeting_room`, `meeting_room_equipment`) all have the
indexes the patched function relies on (status partial indexes, GIN on
`cached_*`, `idx_object_type_status`, `idx_object_location_object_id`,
covering `idx_location_main_covering`). Future concerns documented in the
performance notes file, none requiring action now.

### Remaining deployment step
The live database has not been modified. To roll the fix out, deploy the
patched `api.get_filtered_object_ids` from
`Base de donnée DLL et API/api_views_functions.sql` to the target
environment. The function uses `CREATE OR REPLACE` and keeps the same
signature, so no `DROP` is needed. Concrete next command (one of):

- via `supabase db push` if the schema is tracked there, **or**
- the deploy script that already runs `api_views_functions.sql` against
  the target.

After deploy, run
`docs/schema-workbench/object-visibility-regression-check.sql` in the
target environment to confirm the routing rule, the published-only count,
the draft visibility, and the empty-array semantics.
