-- ci_fresh_apply.sql
-- Executable form of the canonical fresh-install manifest documented in
-- docs/SQL_ROLLOUT_RUNBOOK.md ("Fresh Database — Complete Ordered Manifest").
-- Applies every schema file to a BLANK database in dependency order and ABORTS
-- on the first error (\set ON_ERROR_STOP on).
--
-- Used by .github/workflows/sql-fresh-apply.yml — the CI gate that enforces the
-- "Deploy integrity (no PROD-only DDL)" invariant in CLAUDE.md. Also runnable
-- locally against a `supabase start` database:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/ci_fresh_apply.sql"
--
-- REQUIRES a Supabase-flavoured Postgres: the files reference the `auth` and
-- `storage` schemas, auth.uid()/auth.role(), and the roles anon / authenticated
-- / service_role. A vanilla Postgres will fail at the RLS and media_bucket steps.
--
-- Paths use \ir (include relative to THIS file), so the current working
-- directory does not matter.

\set ON_ERROR_STOP on

-- 0. Extensions. pg_cron is intentionally OMITTED: schema_unified.sql references
--    it only in comments (freshness-strategy docs), never as executed DDL.
CREATE SCHEMA IF NOT EXISTS extensions;
-- Mirror the Supabase platform layout so a fresh DB matches live: PostGIS + pgcrypto live in the
-- `extensions` schema (as on prod), and `extensions` is on the search_path. This makes BOTH the
-- fully-qualified calls that match live — extensions.geometry / extensions.ST_* (get_object_resource
-- ITI block) and extensions.digest / extensions.gen_random_bytes (partner-key auth) — AND the
-- unqualified geometry/ST_*/etc. in schema_unified DDL resolve on the fresh CI DB. Without SCHEMA,
-- `CREATE EXTENSION postgis` lands in public and the qualified extensions.* refs fail at runtime
-- (found by the fresh-apply gate, 2026-07-01). search_path replicates live's default.
SET search_path TO "$user", public, extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto  WITH SCHEMA extensions;

\echo '== 1/13  schema_unified.sql =='
\ir schema_unified.sql
\echo '== 2/13  migration_sustainability_v5.sql  (prereq for V5 seeds) =='
\ir migration_sustainability_v5.sql
\echo '== 3/13  migration_room_type_ref.sql =='
\ir migration_room_type_ref.sql
\echo '== 4/13  migration_tag_link_position.sql =='
\ir migration_tag_link_position.sql
\echo '== 4b     migration_iti_duration_elevation.sql  (object_iti duration_min + elevation_loss; before api_views) =='
\ir migration_iti_duration_elevation.sql
\echo '== 4c     migration_open_status_timezone_perf.sql  (get_local_now_for_timezone: drop pg_timezone_names scan; folded into schema_unified, no-op fresh) =='
\ir migration_open_status_timezone_perf.sql
\echo '== 5/13  api_views_functions.sql =='
\ir api_views_functions.sql
\echo '== 6/13  rls_policies.sql  (defines api.is_object_owner) =='
\ir rls_policies.sql
\echo '== 7/13  object_workspace_safe_write_rpcs.sql  (schema internal + write gate) =='
\ir object_workspace_safe_write_rpcs.sql
\echo '== 8/13  object_workspace_gap_rpcs.sql =='
\ir object_workspace_gap_rpcs.sql
\echo '== 8b     migration_permission_write_paths.sql  (SP-1 canonical-write auth; after RLS + workspace RPCs) =='
\ir migration_permission_write_paths.sql
\echo '== 8c     migration_permission_write_paths_b.sql  (SP-1b — complete canonical-write coverage) =='
\ir migration_permission_write_paths_b.sql
\echo '== 8d     migration_rls_read_gate_p03.sql  (P0.3 — gate object-child reads behind can_read_object) =='
\ir migration_rls_read_gate_p03.sql
\echo '== 8e     migration_sp4_list_org_members.sql  (SP-4 roster read RPC) =='
\ir migration_sp4_list_org_members.sql
\echo '== 8f     migration_object_status_lifecycle.sql  (status state-machine RPC; after SP-1 guard) =='
\ir migration_object_status_lifecycle.sql
\echo '== 8g     migration_object_act_rls.sql  (gate object_act reads/writes; after P0.3 read gate) =='
\ir migration_object_act_rls.sql
\echo '== 8h     migration_rls_ref_and_bak_cleanup.sql  (RLS on 3 ref_* tables; drop *_bak backups) =='
\ir migration_rls_ref_and_bak_cleanup.sql
\echo '== 8i     migration_explorer_rls_setbased.sql  (Explorer timeout: set-based object read gate) =='
\ir migration_explorer_rls_setbased.sql
\echo '== 8j     migration_cards_batch_authorize_definer.sql  (cards-batch authorize-once + DEFINER; after 8i set fn) =='
\ir migration_cards_batch_authorize_definer.sql
\echo '== 8k     migration_rls_initplan_sweep.sql  (wrap auth.x() -> (select auth.x()) in 18 object-family policies; after rls_policies + SP fns) =='
\ir migration_rls_initplan_sweep.sql
\echo '== 8l     migration_ref_commune.sql  (ref_commune seed + RLS + object_zone FK; needs object_zone + is_platform_superuser) =='
\ir migration_ref_commune.sql
\echo '== 8m     migration_facet_applicability.sql  (type->facet registry + triggers + violations fn; needs facet tables + is_platform_superuser) =='
\ir migration_facet_applicability.sql
\echo '== 8n     migration_object_fma_write_policy.sql  (object_fma per-command canonical write triple; needs user_can_write_object_canonical) =='
\ir migration_object_fma_write_policy.sql
\echo '== 8o     migration_write_policy_percommand.sql  (collapse 93 FOR ALL -> per-command canonical/admin triples on 57 tables; after 8b/8c/8g/8n) =='
\ir migration_write_policy_percommand.sql
\echo '== 8p     migration_child_read_gate_setbased.sql  (25 flat child read gates -> set-based §38 form; after p03/8d + 8o) =='
\ir migration_child_read_gate_setbased.sql
\echo '== 8q     migration_object_act_asc_applicability.sql  (extend object_act applicability to ASC; after 8m) =='
\ir migration_object_act_asc_applicability.sql
\echo '== 8r     migration_actor_links_editor.sql  (actor_object_role per-command + actors branch + search_actors; after 8b/8q) =='
\ir migration_actor_links_editor.sql
\echo '== 8s     migration_contact_channel_read_gate.sql  (contact_channel read gate -> set-based §38 split form; folded into rls_policies, no-op fresh) =='
\ir migration_contact_channel_read_gate.sql
\echo '== 8t     migration_media_description_read_gate.sql  (media + object_description read gates -> §38 split form incl. media place leg; folded into rls_policies, no-op fresh) =='
\ir migration_media_description_read_gate.sql
\echo '== 8u     migration_object_type_spu.sql  (SPU « Service public » enum value + taxonomy_spu registry/root/3 sub-categories; no facet rows) =='
\ir migration_object_type_spu.sql
\echo '== 8v     migration_room_type_read_gate.sql  (object_room_type trio read gates -> §38 split form + 8o link-table write-binding repair; reads folded into rls_policies, no-op fresh) =='
\ir migration_room_type_read_gate.sql
\echo '== 8w     migration_object_review_read_gate.sql  (object_review read gate -> §38 split form; folded into rls_policies, no-op fresh) =='
\ir migration_object_review_read_gate.sql
\echo '== 8x     migration_object_type_prd.sql  (PRD « Producteur » enum value + taxonomy_prd registry/root/6 sub-categories; no facet rows) =='
\ir migration_object_type_prd.sql
\echo '== 8y     migration_taxonomy_seeds_coverage.sql  (8 empty taxonomy domains seeded + SPU/COM/LOI node extensions + object_meeting_room->LOI applicability + sur_le_parcours_de relation role) =='
\ir migration_taxonomy_seeds_coverage.sql
\echo '== 8z     migration_crm_module.sql  (CRM P2.2 acteur-centre: fusion sujets OTI -> demand_topic + domaine crm_sentiment + helpers/RPCs DEFINER authorize-once + RLS par commande; merge/backfills guarded no-op fresh) =='
\ir migration_crm_module.sql
\echo '== 9/13  ui_whitelabel_branding.sql  (defines api.is_platform_admin) =='
\ir ui_whitelabel_branding.sql
\echo '== 10/13 media_bucket.sql  (storage bucket + RESTRICTIVE write RLS) =='
\ir media_bucket.sql
\echo '== 11/13 seeds_data.sql  (needs ref_sustainability_action_group from step 2) =='
\ir seeds_data.sql
\echo '== 12/13 migration_legal_siret_canonical.sql  (data fixup; AFTER seeds) =='
\ir migration_legal_siret_canonical.sql
\echo '== 13/13 migration_object_location_address1_dedupe.sql  (post-import hygiene; no-op fresh) =='
\ir migration_object_location_address1_dedupe.sql

\echo '== 13b    migration_taxonomy_assignable_cleanup.sql  (taxonomy assignability + duplicate/misplaced node cleanup + cache refresh; idempotent, no-op where domains absent) =='
\ir migration_taxonomy_assignable_cleanup.sql

\echo '== 13c    migration_capacity_applicability_seed.sql  (seed ref_capacity_applicability metric->type; AFTER seeds_data ref_capacity_metric) =='
\ir migration_capacity_applicability_seed.sql

\echo '== 13d    migration_loi_prd_cleanup_retype.sql  (LOI/RES -> PRD/PCU/COM/SPU re-route + retype + emptied-node cleanup + cache refresh; no-op fresh) =='
\ir migration_loi_prd_cleanup_retype.sql

\echo '== 13e    migration_taxonomy_label_hygiene.sql  (remove junk taxonomy_loi/loi node + humanize 19 taxonomy_*/root labels; live remediation, no-op on fresh — the taxo seed asserts the final state) =='
\ir migration_taxonomy_label_hygiene.sql

\echo '== 14a    migration_media_visibility_gate.sql  (media.visibility composed into read_media published arm + cover-cache pick; folded into rls_policies/schema/maintenance, no-op fresh) =='
\ir migration_media_visibility_gate.sql

\echo '== 14b    migration_seed_drift_fix_legaltype_weekday.sql  (§68 raison_sociale live catch-up + weekday.dow_number backfill; no-op fresh) =='
\ir migration_seed_drift_fix_legaltype_weekday.sql

\echo '== 14c    migration_room_type_bed.sql  (§72 bed_type ref partition + seed/i18n + object_room_type_bed link table + §38 read / per-command write; folded into schema_unified/rls_policies/seeds_data, no-op fresh) =='
\ir migration_room_type_bed.sql

\echo '== 14d    migration_classification_labels_expansion.sql  (§71 §08 catalogue: 13 classements/labels manquants + valeur QTIR « de Charme »; folded into seeds_data, no-op fresh) =='
\ir migration_classification_labels_expansion.sql

\echo '== 14e    documents_bucket.sql  (§71 C: storage bucket `documents` for §08 justificatifs, PDF+image, service-role write; idempotent) =='
\ir documents_bucket.sql

\echo '== A1     avatars_bucket.sql  (user profile pictures: storage bucket `avatars`, image-only, service-role write via /api/avatar/upload; RESTRICTIVE anon/authenticated deny; idempotent) =='
\ir avatars_bucket.sql

\echo '== A2     branding_assets_bucket.sql  (white-label brand logo: storage bucket `branding-assets`, image-only, service-role write via /api/branding/logo/upload gated api.is_platform_admin; RESTRICTIVE anon/authenticated deny; idempotent) =='
\ir branding_assets_bucket.sql

\echo '== 14f    migration_amenity_popularity_order.sql  (§73 seed ref_amenity/ref_code_amenity_family.position from object_amenity usage; default « industry popularity » order for the room equipment picker; data fixup, usage-derived, after seeds) =='
\ir migration_amenity_popularity_order.sql

\echo '== 14g    migration_amenity_room_scope.sql  (§75 scope ~30 room-relevant amenities to ''both'' so the §06 room picker shows only them — hides establishment-level amenities; data fixup, code-list-derived so fresh==live, after seeds) =='
\ir migration_amenity_room_scope.sql

\echo '== 14i    migration_opening_period_type.sql  (§81 explicit opening-period type: ref_code_opening_period_type partition + 4 seeds + opening_period.period_type_id FK + save_object_openings/build_opening_period_json wiring; CREATE OR REPLACE after the function files) =='
\ir migration_opening_period_type.sql

\echo '== 14k    migration_object_stay_policy.sql  (§85 accommodation stay policy: object_stay_policy table — check-in/out times — mirroring object_pet_policy; §38 read gate + per-command canonical write + updated_at/audit triggers; surfaced in §06 for HEB; read/write via direct PostgREST, no RPC/get_object_resource change) =='
\ir migration_object_stay_policy.sql

\echo '== 14m    migration_object_web_channel.sql  (§90 object-scoped réseaux sociaux + distribution OTA: object_web_channel — composite FK (kind_id,kind_domain)->ref_code(id,domain) for social_network|distribution_channel; §49 split read gate + per-command canonical write + updated_at/audit triggers; get_object_resource web_channels key folded in api_views_functions.sql; editor §03 read/write via direct PostgREST; retires §20) =='
\ir migration_object_web_channel.sql

\echo '== 15e    migration_iti_section06_vocab.sql  (§111 Section 06 ITI editor vocab: ref_iti_assoc_role seed + iti_difficulty/iti_open_status/iti_stage_kind ref_code partitions + house RLS + seeds; idempotent, self-contained) =='
\ir migration_iti_section06_vocab.sql

\echo '== 16a    migration_ai_provider_config.sql  (AI provider config for §06 carte extraction: app_ai_provider_config table + Vault-backed key + super-admin RPCs upsert/list/set_active/delete + service_role-only get_active_ai_provider_secret; needs api.is_platform_superuser + supabase_vault; self-contained, CREATE TABLE IF NOT EXISTS idempotent) =='
\ir migration_ai_provider_config.sql

\echo '== 16c    migration_moderation_rpcs.sql  (P2.1 §120 Moderation: user_can_moderate_object + submit/list/approve/reject_pending_change DEFINER authorize-once; approve re-dispatches the whitelisted section writer (Option A); pending_change table already in schema_unified; needs rls_policies helpers + object_workspace_*_rpcs writers) =='
\ir migration_moderation_rpcs.sql

\echo '== I1     migration_reference_catalog_rpc.sql  (audit API Phase 1: api.public_catalog_domains/list_catalog/list_reference_bundle — anon-readable catalog over 59 public ref_code domains + 6 separate ref_* tables, i18n-resolved, whitelist default-deny; needs api.i18n_pick + ref tables + seeds) =='
\ir migration_reference_catalog_rpc.sql

\echo '== R1a    migration_partner_api_keys.sql  (partner API key auth foundation: internal.partner_api_key/_call + issue/revoke/list [superuser] + authenticate/log [service-role]; needs api.is_platform_superuser + pgcrypto digest/gen_random_bytes) =='
\ir migration_partner_api_keys.sql

\echo '== R2     migration_partner_rate_limit.sql  (partner gateway rate-limit: internal.partner_rate_bucket + api.partner_rate_check fixed-window, service-role-only; after partner_api_keys) =='
\ir migration_partner_rate_limit.sql

\echo '== L1     migration_object_list.sql  (Listes & templates d envoi: object_list/object_list_item tables + RLS lock (no direct PostgREST) + DEFINER authorize-once RPCs create/get/update/set_items/delete/share/list_my_lists + resolve_list_object_ids wrapper over api.get_filtered_object_ids (published-only, bounded) + anon get_public_list_by_token (published-only, no recipient PII); self-contained, needs object + api.get_filtered_object_ids/get_object_cards_batch + rls_policies helpers is_platform_superuser/current_user_org_id/current_user_admin_rank) =='
\ir migration_object_list.sql

\echo '== I4     migration_object_jsonld_schemaorg.sql  (audit API Phase 2: ref_interop_crosswalk table-driven object_type->schema.org class (profile-keyed) + api.get_object_jsonld service-role-only published-gated JSON-LD serializer; needs api.strip_markdown/i18n_pick from api_views + rls_policies is_platform_superuser) =='
\ir migration_object_jsonld_schemaorg.sql
\echo '== I4b    migration_interop_profiles.sql  (audit API Phase 2: datatourisme/apidae/tourinsoft crosswalk seeds + api.interop_object_core shared reader + api.get_object_interop dispatcher; needs I4 ref_interop_crosswalk + api_views strip_markdown/i18n_pick) =='
\ir migration_interop_profiles.sql
\echo '== I4c    migration_interop_batch.sql  (audit API Phase 2: api.get_objects_interop_batch — one-call per-page batch wrapping the I4/I4b serializers for the partner list ?format=; LANGUAGE sql so it MUST come after I4/I4b) =='
\ir migration_interop_batch.sql

\echo '== 16e    migration_partition_maintenance_hardening.sql  (§146 partitions born-gated: object_version + audit.audit_log creators re-assert RLS + wrapped policy at creation; ensure_object_version_partitions wired into audit.maintain_partitions (daily cron); repair pass re-gates existing partitions; re-homes stranded object_version_default rows into monthly partitions) =='
\ir migration_partition_maintenance_hardening.sql
\echo '== 16f    migration_ref_code_dup_policy_cleanup.sql  (§146 drops the 6 duplicate legacy policy pairs on ref_code partitions — the house pair pub_ref_code_read/admin_ref_code_write covers every partition via the rls_policies loop; asserts the house pair is present before finishing) =='
\ir migration_ref_code_dup_policy_cleanup.sql
\echo '== 16g    migration_fk_covering_indexes.sql  (§146 FK covering indexes on the worthwhile tables: object_taxonomy/object_web_channel composite ref_code-partition fan-out (53 constraint clones each) + object_relation.target_object_id + crm_interaction x8 + object_membership/object_menu_item/object_private_description x3; converges idx_crm_interaction_parent partial->full; drops the 3 staging idx_old_data_* duplicate twins, schema-guarded) =='
\ir migration_fk_covering_indexes.sql
\echo '== 16h    migration_rls_initplan_broad_sweep.sql  (§146 catalog-driven auth_rls_initplan sweep: rewrites every policy in public+audit whose USING/WITH CHECK carries an unwrapped auth.uid/role/jwt/email call to the (select auth.x()) InitPlan form via ALTER POLICY; self-asserts zero left; permanent CI guard = tests/test_rls_initplan_broad_sweep.sql) =='
\ir migration_rls_initplan_broad_sweep.sql

\echo '== 16i    migration_filters_open_at_event_dates.sql  (§157 filtre « ouvert a ... » + dates FMA: api.get_local_time_for_timezone(tz,at) parametre (get_local_now devient son delegue), internal.compute_open_status(at) = LE moteur ouverture (refresh_open_status devient son write-back « maintenant »), get_filtered_object_ids cles open_at (evalue UNE fois en CTE, jamais LATERAL/ligne §37; NULL tri-etat jamais matche §133) + event{from,to} (recouvrement object_fma; recurrence texte-libre non evaluee); CI = tests/test_filters_open_at_event.sql) =='
\ir migration_filters_open_at_event_dates.sql

\echo '== 16j    migration_filters_accessibility_label.sql  (§162 filtre PMR: cle accessibility_any DEDIEE (equipement famille accessibility OU label LBL_TOURISME_HANDICAP granted; amenity_families_any reste equipement-pur §159), bras label de disability_types_any (subvalue_ids vides = couverture inconnue => le label seul matche), accessibility_any exclu du use_mv (labels non caches). APRES 16i: les deux portent un corps complet de get_filtered_object_ids, 16j est le plus recent (§157+§162); CI = tests/test_accessibility_label_filter.sql) =='
\ir migration_filters_accessibility_label.sql

\echo '== ORG1   migration_org_onboarding.sql  (création d ORG par superadmin: api.rpc_create_org — objet ORG published direct + org_config, superuser-only, voie UNIQUE de création d ORG car un draft ORG serait impubliable; api.rpc_list_orgs pour la console admin + le sélecteur /team; dépend de rls_policies.sql is_platform_superuser + schema_unified.sql org_config/triggers; non foldé) =='
\ir migration_org_onboarding.sql

\echo '== ORG2   migration_org_branding.sql  (branding par ORG: table org_branding_settings — surcharges nullables héritant champ par champ du singleton app_branding_settings; get_app_branding résout selon le membership actif (current_user_org_id), signature/forme inchangées + clé orgObjectId, markerStyles reste plateforme; RPCs get/upsert gated user_can_manage_org_branding (superuser OU org_admin rang>=30); écritures via RPC uniquement; dépend de ui_whitelabel_branding.sql + migration_org_onboarding.sql; non foldé) =='
\ir migration_org_branding.sql

-- Materialized views are created WITH DATA in schema_unified.sql; refresh
-- NON-concurrently here so this also works on a never-yet-populated MV.
-- (Production scheduling uses REFRESH ... CONCURRENTLY via pg_cron — see runbook.)
\echo '== taxo   migration_taxonomy_trees_seed.sql  (versions the FULL live taxonomy trees: 211 nodes / 192 parent links across 19 taxonomy_* domains — previously live-only/unversioned; idempotent upsert + parent_id resolved by code. LAST, after every taxonomy migration + seeds, so it converges each domain to the live state; before the MV refresh so the MVs include it) =='
\ir migration_taxonomy_trees_seed.sql

\echo '== MV refresh (non-concurrent) =='
REFRESH MATERIALIZED VIEW internal.mv_ref_data_json;
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

\echo '== Fresh apply complete =='
