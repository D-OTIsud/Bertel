# SQL Rollout Runbook (Bertel3.0)

## Scope

This runbook covers two paths:
- **Fresh install** — build a new database from scratch. Follow the *complete ordered manifest* below; it is the authoritative apply order.
- **Incremental update** — push SQL changes to an already-deployed database (perf/policy/function refresh). Follow *Incremental Update Order* further down.

Top-level SQL file inventory (in `Base de donnée DLL et API/`):
- **Fresh-install core:** `schema_unified.sql`; `migration_sustainability_v5.sql`, `migration_room_type_ref.sql`, `migration_tag_link_position.sql`; `api_views_functions.sql`; `rls_policies.sql`; `object_workspace_safe_write_rpcs.sql`; `object_workspace_gap_rpcs.sql`; `ui_whitelabel_branding.sql`; `media_bucket.sql`; `seeds_data.sql`.
- **Post-seed / post-import fixups:** `migration_legal_siret_canonical.sql`, `migration_object_location_address1_dedupe.sql`.
- **Maintenance and benchmarks:** `maintenance.sql`, `test_performance.sql`.
- **Upgrade-only patch:** `branding_admin_profile_role_patch.sql` for databases that ran an older branding migration; not part of a fresh install.
- **Local / pilot-only inserts:** `lot1_pilot_inserts.sql` is marked `LOCAL ONLY`; use only for the Lot 1 pilot data path after prerequisites are applied.

## Pre-Deployment Checklist

1. Confirm backup/restore path is valid for the target Supabase project.
2. Confirm migration window and rollback owner.
3. Confirm expected API compatibility (no signature or JSON shape breaks).
4. Confirm required extensions are enabled (`postgis`, `pgcrypto`, `uuid-ossp`, `pg_trgm`, `btree_gist`, `unaccent`, `pg_cron` if used).

## Fresh Database — Complete Ordered Manifest (authoritative)

A fresh database MUST be built in this exact order; each step depends on the previous. Verified 2026-06-02 against live PROD (every object below exists there) — see `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §24 (P0.1). Skipping the migrations/RPCs/bucket (as the old order did) leaves a fresh DB that **cannot save tags or room-types and errors on the V5 sustainability seeds**.

0. **Extensions:** `uuid-ossp`, `postgis`, `unaccent` (schema `extensions`), `pg_trgm`, `btree_gist`, `pgcrypto`; `pg_cron` optional.
1. `schema_unified.sql`
2. `migration_sustainability_v5.sql` — DDL; **prerequisite for the V5 sections of `seeds_data.sql`** (creates `ref_sustainability_action_group` + equivalence tables/views).
3. `migration_room_type_ref.sql` — DDL; adds `object_room_type.room_type_id`.
4. `migration_tag_link_position.sql` — DDL; adds `tag_link.position` (required at runtime by `api.save_object_workspace_tags`).
4b. `migration_iti_duration_elevation.sql` — DDL; greenfield ITI retype `object_iti.duration_hours` → `duration_min INTEGER` + adds `elevation_loss INTEGER`. **Before** `api_views_functions.sql` (its `get_object_resource` / `get_filtered_object_ids` / `get_itinerary_track_geojson` reference `duration_min`). Idempotent (`schema_unified.sql` already ships the new shape, so this is a no-op on a fresh DB). ⚠️ BREAKING for live — apply in lockstep with the frontend build that reads `duration_min`/`elevation_loss`.
5. `api_views_functions.sql`
6. `rls_policies.sql` — defines `api.is_object_owner` (needed by step 7).
7. `object_workspace_safe_write_rpcs.sql` — creates schema `internal` + the write gate `internal.workspace_assert_can_write_object`.
8. `object_workspace_gap_rpcs.sql` — depends on step 7 and on the columns from steps 2 & 4.
8b. `migration_permission_write_paths.sql` — **SP-1 canonical-write authorization**: additive `api.user_can_write_object_canonical` substituted into the workspace gate + 23 write policies, plus the `object.status` guard trigger. After the workspace RPCs (depends on `rls_policies.sql` helpers + the gate); before branding.
8c. `migration_permission_write_paths_b.sql` — **SP-1b**: additive companion `canonical_write_*` policies completing canonical coverage for ~25 more editor-write tables (incl. `object_taxonomy`/`object_classification`, which had no write policy at all). After 8b.
8d. `migration_rls_read_gate_p03.sql` — **P0.3 RLS read gate**: replaces the `USING(true)` SELECT policy on 40 object-child tables with `api.can_read_object(...)` (= parent object `published` OR `api.can_read_extended`), closing the anon draft-read leak; adds 2 missing FK indexes (`object_price_period.price_id`, `object_place_description.place_id`). After 8c (only needs `api.can_read_extended` from `rls_policies.sql`).
8e. `migration_sp4_list_org_members.sql` — **SP-4 — roster read RPC `api.rpc_list_org_members`** (member identities for the Team admin page): `SECURITY DEFINER` function bridging `auth.users.email` (not client-readable) to an ORG admin's team view; gated to platform superuser or an active admin of the requested ORG. After 8d (needs `api.is_platform_superuser` from `rls_policies.sql`).
8f. `migration_object_status_lifecycle.sql` — **Object status state-machine RPC `api.rpc_set_object_status`** (publish / unpublish / archive / restore) + `api.rpc_publish_object` rewritten as a thin wrapper over it. Gated by `api.user_can_publish_object`; the transition is re-checked by `trg_guard_object_status_change`. After 8b (needs `api.user_can_publish_object` from `rls_policies.sql` + the status guard trigger from `migration_permission_write_paths.sql`).
8g. `migration_object_act_rls.sql` — **object_act RLS security fix**: `object_act` (the ACT type-extension) shipped with RLS off + 0 policies while anon/authenticated held full table grants, so it was directly readable/writable via PostgREST, bypassing the publication gate. Enables RLS + `read_object_act` (`api.can_read_object`) + `canonical_write_object_act` (`api.user_can_write_object_canonical`), and re-asserts anon/authenticated EXECUTE on the write predicate (P0.3 gotcha). After 8d (needs `api.can_read_object`).
8h. `migration_rls_ref_and_bak_cleanup.sql` — housekeeping from the 2026-06-04 audit: enables RLS (pub-read / admin-write) on 3 `ref_*` tables that shipped RLS-off (`ref_classification_equivalent_action`, `ref_classification_equivalent_group`, `ref_sustainability_action_group`) and drops 5 leftover `*_bak_20260519_082607z` backup tables (no-op on a fresh DB). After step 6 (needs `api.is_platform_superuser`) and step 2 (the 3 ref tables).
8i. `migration_explorer_rls_setbased.sql` — **Explorer `statement_timeout` fix**: replaces the per-row `api.can_read_extended(id)` in the `object` SELECT policy `extended_objects_org_actor` with a hashed-set membership test (`id IN (SELECT api.current_user_extended_object_ids())`), so the read predicate is hoisted to a single InitPlan instead of being evaluated once per draft row (the editor Explorer requests `['published','draft']`, bypasses the published-only MV, and scans the full `object` table). Adds the SECURITY DEFINER set fn (`anon`/`authenticated`/`service_role` EXECUTE; the object policy — role `public` — references it) and re-points `api.can_read_extended` to delegate to it. Visibility unchanged (byte-equivalent to the 4 paths; live equivalence-verified). After 8d (needs `api.can_read_extended`). Folded into `rls_policies.sql` ⇒ idempotent no-op on a fresh build.
8j. `migration_cards_batch_authorize_definer.sql` — **Explorer cards-batch perf fix (§36)**: the residual after 8i. `api.get_object_cards_batch` was `SECURITY INVOKER`, so its child-table reads ran under the caller's RLS — and those tables' SELECT is the per-row OR of three `SECURITY DEFINER` predicates (read policy + the two `FOR ALL` write policies that also apply to SELECT), with `is_object_owner` short-circuiting first for the editor (a platform superuser), so a set-based read-policy rewrite would not help. This makes cards_batch `SECURITY DEFINER` and **authorize-once**: it filters `p_ids` to the caller's readable set (`published ∪ api.current_user_extended_object_ids()` = the `object` table's own SELECT visibility, via the new `api.current_user_readable_object_ids()` set fn — one InitPlan) and reads child data RLS-free for only those ids. Self-authorization is mandatory because the function is PUBLIC-executable. Measured live: 1290 ms → 74 ms (cards_batch); the editor list RPC `list_object_resources_filtered_page` 1.37 s → 168 ms. Visible set byte-identical per persona (live equivalence-verified: editor hash unchanged; anon = published only). Also re-applies the `object_description.visibility` field-level gate the DEFINER body bypasses. Advisors flag it under `0028/0029_*_security_definer_function_executable` — **intentional** (a public read RPC that self-authorizes, like the existing `can_read_*` family). After 8i (needs `api.current_user_extended_object_ids`). NOT folded into `api_views_functions.sql` (step 5 cannot forward-reference the step-8i helper); that file keeps the `SECURITY INVOKER` baseline, overridden here.
9. `ui_whitelabel_branding.sql` — defines `api.is_platform_admin` (a fresh install uses this full file, not the patch).
10. `media_bucket.sql` — `media` storage bucket + RESTRICTIVE anon/authenticated write-deny.
11. `seeds_data.sql` — depends on `ref_sustainability_action_group` from step 2.
12. `migration_legal_siret_canonical.sql` — **data fixup; run AFTER seeds** (updates seeded `ref_legal_type` rows; safe no-op on `object_legal` when empty).
13. `migration_object_location_address1_dedupe.sql` — post-import data hygiene (no-op on a fresh DB; re-run after each bulk import).
14. `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;` then `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;`
15. Smoke tests (see Verification below).

**Upgrade-only — NOT part of a fresh install:** `branding_admin_profile_role_patch.sql` (only for databases that ran an older `ui_whitelabel_branding.sql` before its admin guard checked `app_user_profile.role`).

Fresh-install migrations and post-seed fixups use idempotent DDL/data patterns and are transaction-wrapped where the files contain `BEGIN`/`COMMIT`. RPC scripts are idempotent through `CREATE OR REPLACE` plus grants/revokes; review local/pilot-only scripts before reapplying.

### CI enforcement (deploy integrity)
A GitHub Actions gate, `.github/workflows/sql-fresh-apply.yml`, executes this manifest against a fresh Supabase local database on every change to `Base de donnée DLL et API/*.sql`, via the executable driver `Base de donnée DLL et API/ci_fresh_apply.sql` (which mirrors the manifest exactly, with `ON_ERROR_STOP`). If a migration is ever applied only to live PROD and never folded into the manifest/files, a fresh apply diverges and the gate goes red. Run it on demand from the Actions tab (**Run workflow** / `workflow_dispatch`). The driver is also the recommended way to bootstrap a local dev DB: `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/ci_fresh_apply.sql"`.

## Incremental Update Order

> For routine SQL **updates** to an already-deployed database. A **fresh** install must follow the complete manifest above. For incremental updates, apply every changed DDL/RPC/storage file in the same dependency order as the fresh manifest before verification.

1. Apply changed schema/DDL/storage files in manifest order: `schema_unified.sql`, changed `migration_*.sql`, and `media_bucket.sql` if bucket or storage RLS changed.
2. Apply changed API, RLS, and RPC files in dependency order: `api_views_functions.sql`, `rls_policies.sql`, `object_workspace_safe_write_rpcs.sql`, `object_workspace_gap_rpcs.sql`, `ui_whitelabel_branding.sql`.
3. Apply changed post-seed/post-import fixups only when their preconditions match the target database.
4. Reload the PostgREST schema cache after function, grant, or exposed-schema changes: `NOTIFY pgrst, 'reload schema';`
5. Refresh materialized views introduced or affected by the update:
   - `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;`
   - `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;`
6. Smoke tests on key endpoints.

## Verification (Before/After)

Run on staging and compare before/after metrics:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_object_resources_since_fast(
  p_since := NOW() - INTERVAL '7 days',
  p_limit := 100,
  p_status := ARRAY['published']::object_status[]
);
```

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_object_resources_filtered_since_fast(
  p_since := NOW() - INTERVAL '7 days',
  p_limit := 100,
  p_filters := '{"bbox":[2.0,48.5,3.0,49.0]}'::jsonb
);
```

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_objects_with_validated_changes_since(
  NOW() - INTERVAL '30 days'
);
```

Also run the curated benchmark script:

```sql
\i 'Base de donnée DLL et API/test_performance.sql'
```

When using the new filtered MV path, run one direct plan check:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT object_id
FROM api.get_filtered_object_ids(
  p_filters := '{"within_radius":{"lat":48.8566,"lon":2.3522,"radius_m":5000},"amenities_any":["wifi"]}'::jsonb,
  p_types := ARRAY['RES','HOT']::object_type[],
  p_status := ARRAY['published']::object_status[],
  p_search := 'restaurant'
)
LIMIT 100;
```

## Success Criteria

- API responses remain contract-compatible for existing clients.
- Key endpoints show stable or improved execution time.
- No permission regressions on protected data paths.
- No migration rerun failures for policy creation.

## Rollback Plan

1. Re-deploy previous SQL revisions for modified files.
2. If index operations were introduced and need removal, drop newly added indexes:
   - `idx_pending_change_validated_effective_ts`
   - `idx_object_updated_at_id`
   - `idx_object_updated_at_source_id`
   - `idx_object_published_updated_at_id`
   - `idx_object_published_updated_at_source_id`
3. Re-run smoke tests and confirm endpoint behavior matches pre-deploy baseline.

## Post-Deployment Monitoring (24h)

- Track P95/P99 latency of list/filter endpoints.
- Track database CPU and buffer/cache pressure during peak periods.
- Check for permission-denied errors on RPC calls.
- Confirm no unexpected policy drift after reruns.
- Confirm `mv_filtered_objects` freshness remains within target SLA (5-15 minutes).
- Alert if refresh fails repeatedly or row-count drifts unexpectedly from published main-location baseline.

## MV Refresh Scheduling (Supabase pg_cron)

Use a cadence aligned with your accepted staleness budget:

```sql
SELECT cron.schedule(
  'refresh-mv-filtered-objects',
  '*/10 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;$$
);
```

Health checks:

```sql
SELECT COUNT(*) AS mv_rows FROM internal.mv_filtered_objects;
SELECT COUNT(*) AS baseline_rows
FROM object o
JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location IS TRUE
WHERE o.status = 'published';
```

## Other Scheduled Jobs (pg_cron)

`api.refresh_open_status()` recomputes `object.cached_is_open_now` for published objects. It is **heavy** (~18–22s/run on ~373 objects: correlated EXISTS over the `opening_*` chain + per-object timezone LATERAL). To avoid periodic instance saturation that amplified the Explorer timeout, it runs **every 15 min, staggered** off the `*/5` MV refresh:

```sql
SELECT cron.alter_job(job_id := <id>, schedule := '3,18,33,48 * * * *');  -- refresh-open-status
```

"Open now" staleness budget: ≤15 min. A set-based rewrite (sub-second) is a tracked follow-up (`lot1_mapping_decisions.md` §35).
