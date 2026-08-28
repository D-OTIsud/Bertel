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
CREATE EXTENSION IF NOT EXISTS pg_trgm   WITH SCHEMA extensions;
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
\echo '== 8z2    migration_crm_directory_search.sql  (recherche acteurs de l annuaire CRM: p_search sur list_crm_directory (4->5 args, DROP de l arite 4 = ambiguite PostgREST); nom/prenom/nom de famille/etablissement rattache en sous-chaine + trigrammes pg_trgm seuil 0.45 calibre live, telephone/e-mail structures sans flou; classement pertinence puis recence; search_path etendu a `extensions` (pg_trgm) — depend de 8z) =='
\ir migration_crm_directory_search.sql
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

\echo '== 13f    migration_act_taxonomy_recategorization.sql  (§186 recatégorisation ACT: +7 nœuds taxonomy_act (wellness_massage/nature_discovery/motorized_excursion/caving/fishing/boat_excursion/craft_workshop, « Autre » -> 99) + 33 corrections object_taxonomy (heuristique d import 20260512 défaillante); data part no-op fresh; nodes aussi convergés par le taxo seed) =='
\ir migration_act_taxonomy_recategorization.sql

\echo '== 13g    migration_taxonomy_audit_lot_a.sql  (§187 lot A: 23 corrections intra-domaine RES/LOI/PRD/PSV/HLO issues de l audit tous domaines; data-only, no-op fresh) =='
\ir migration_taxonomy_audit_lot_a.sql

\echo '== 13h    migration_loi_type_boundary_retype.sql  (§187 lot B: 18 retypes LOI->ACT(11)/PRD(5)/PSV(2) methode 13d + nouveau noeud taxonomy_act guided_tour; ids gardent le prefixe LOIRUN; no-op fresh) =='
\ir migration_loi_type_boundary_retype.sql

\echo '== 13i    migration_taxonomy_catalog_hygiene.sql  (§187 lot D: desactivation des codes 0-usage — dupes RES table_d_hotes/chambre_d_hote, codes LOI prestation doublonnant ACT, HLO gite_d_etape/auberge, domaine taxonomy_org entier; fusion ZAMPONE artisanat->art_artisanat; garde 0-usage fail-closed; APRES 13g+13h) =='
\ir migration_taxonomy_catalog_hygiene.sql

\echo '== 13j    migration_taxonomy_audit_lot_c.sql  (§187 lot C: 20 arbitrages PO rendus en session — 8 recodages (NANA BARKET/Irise->traiteur, Bouillon->divertissement, 2 HLO recentes->gite_villa...), 3 archivages (Le Tinto FERME + 2 doublons HLO), terre/chambre desactives; data-only, no-op fresh) =='
\ir migration_taxonomy_audit_lot_c.sql

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

\echo '== 14e2   legal_documents_bucket.sql  (private legal/administrative documents; service-route access only) =='
\ir legal_documents_bucket.sql

\echo '== A-LEGAL migration_unblock_team_legal_access.sql  (dedicated legal permission + private-document metadata + role hardening) =='
\ir migration_unblock_team_legal_access.sql

\echo '== 8z3    actor prospects + private document library (after A-LEGAL creates ref_document.access_scope; optional establishment, default role, actor-documents bucket) =='
\ir ../supabase/migrations/20260807124408_actor_prospects_documents.sql

\echo '== A-LEGAL2 migration_fix_legal_workspace_permission.sql  (expose the object-scoped legal gate to the editor) =='
\ir migration_fix_legal_workspace_permission.sql

\echo '== A-LEGAL2-test workspace permission aggregate includes the dedicated legal gate =='
\ir tests/test_object_workspace_permissions_rpc.sql

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

\echo '== 14o    migration_opening_period_recurrence.sql  (§92 périodes récurrentes et fermetures prioritaires; DDL + fonctions non foldés) =='
\ir migration_opening_period_recurrence.sql

\echo '== 14x    migration_object_hard_delete.sql  (§108 suppression définitive admin-only + journal immuable; non foldé) =='
\ir migration_object_hard_delete.sql

\echo '== 14x-test garde transactionnelle de la suppression définitive =='
\ir tests/test_object_hard_delete.sql

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

\echo '== E1     migration_list_resolver_internal.sql  (§211 splits the dynamic-list resolver: internal.resolve_list_object_ids engine capped 2001, REVOKEd from anon/authenticated; api.resolve_list_object_ids becomes a pass-through re-capped at 200 — public contract, grants and behaviour unchanged. Needed by E2, which must resolve up to 2001 without widening an exposed DEFINER RPC. After L1) =='
\ir migration_list_resolver_internal.sql

-- E2 est appliquée APRÈS 16u (migration_actor_contacts_org_gate.sql) — tâche 7 / §208 :
-- api.list_selection_emails écrit (INSERT) dans public.actor_contact_export_log, table créée
-- par 16u.
-- ATTENTION à la JUSTIFICATION de cet ordre — mesuré sur PG 17.6, check_function_bodies=on :
-- un corps **plpgsql** dont une requête statique vise une relation ABSENTE, ou appelle une
-- fonction ABSENTE, se crée SANS AUCUNE ERREUR. Énoncé exact (ne pas le généraliser en
-- « seuls X et Y échouent », c'est cette généralisation qui a produit l'erreur d'origine) :
-- le validateur plpgsql NE RÉSOUT PAS les noms de relations ni de fonctions (résolution
-- différée à l'EXÉCUTION) ; il échoue en revanche sur la SYNTAXE et sur les TYPES (signature
-- et `DECLARE`). Un corps LANGUAGE sql, lui, est validé entièrement au CREATE (42P01 / 42883).
-- api.list_selection_emails EST plpgsql : appliquer E2 avant 16u ne ferait donc PAS rougir le
-- fresh-apply, la création réussirait en silence. Et il faut être précis sur la SUITE, sinon on
-- remplace une erreur par une autre : DANS UN FRESH-APPLY, aucune erreur ne sortirait NULLE
-- PART — 16u passe de toute façon plus loin dans le même run, donc la table existe bien avant
-- le moindre appel (les tests sont joués après le manifeste complet). Le 42P01 n'existe QUE sur
-- une base LIVE où 16u n'a pas été appliquée.
-- L'ordre E2-après-16u reste requis, mais pour une raison de DÉPENDANCE LOGIQUE et de
-- lisibilité du manifeste (une étape ne précède pas ce qu'elle utilise) — jamais parce que le
-- moteur l'imposerait. Voir E2 plus bas, après le bloc 16u.

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

\echo '== 16k    migration_label_filter_sections.sql  (§173 resultats sectionnes filtre Label: cle label_scheme_ranked_exact_only (restreint aux labellises rank-0, equivalents exclus) + tri label_rank prioritaire sous filtre label meme avec recherche + meta.label_rank_counts; APRES 16j = le plus recent, corps complet get_filtered_object_ids §157+§162+§173; since_fast intact keyset; CI = tests/test_label_filter_sections.sql) =='
\ir migration_label_filter_sections.sql

\echo '== 16k2   migration_explorer_fuzzy_search.sql  (§197 recherche tolerante aux fautes: object.search_document_text = MEME agregation que search_document mais en TEXTE BRUT normalise (un tsvector ne garde que des lexemes racinises, inexploitables par les trigrammes), remplie par le MEME CTE dans refresh_object_filter_caches; mv_filtered_objects porte search_document_text + city_normalized sinon le flou est muet sur le chemin publie; get_filtered_object_ids gagne un bras trigrammes EN REPLI (arme seulement si le plein texte ne trouve rien dans le corpus) + seuil dependant de la longueur 0.45 a 4 car. / 0.35 au-dela, calibre live; APRES 16k = le plus recent, corps complet get_filtered_object_ids §157+§162+§173+§197; signature inchangee donc pas de NOTIFY pgrst; CI = tests/test_global_search.sql) =='
\ir migration_explorer_fuzzy_search.sql

\echo '== 16k3   migration_explorer_phonetic_search.sql  (§199 bras PHONETIQUE du repli, confirme par trigramme: extension fuzzystrmatch dans `extensions` (gotcha §29) + api.phonetic_document = SOURCE UNIQUE de la transformation texte->codes dmetaphone (colonne ET requete) + object.search_document_phonetic (meme contenu, meme CTE `norm`: UNE normalisation, TROIS representations) + colonne dans mv_filtered_objects. Motif: `kafe`<->`cafe` = 0.400, soit EXACTEMENT le plancher de bruit des requetes de 4 caracteres (`bequ`<->`bebe` = 0.400) — changer la 1re lettre detruit 3 trigrammes sur 5, aucun seuil ne peut separer le vrai positif du bruit. Deux etages: prefiltre @@ sur le document phonetique (~1 ms vs ~145 ms pour un balayage trigramme) puis confirmation AU NIVEAU DU MOT (seuil 0.30, plateau mesure 0.25-0.35) — confirmer sur le document ENTIER laissait `bequ` a 18 fiches. Complementaire des trigrammes, pas concurrent (dmetaphone est anglophone: rate le g doux, `boulanjerie` reste rattrape par les trigrammes). APRES 16k2 = le plus recent, corps complet get_filtered_object_ids §157+§162+§173+§197+§199; signature inchangee; CI = tests/test_global_search.sql) =='
\ir migration_explorer_phonetic_search.sql

\echo '== 16l    migration_classification_regroup_network_labels.sql  (§175 reclasse gites_epics + clevacances_keys de official_classification vers quality_label: labels de reseau prives, pas des classements officiels Atout France; DONNEE de reference seule, aucun DDL/RPC; official/quality partagent le meme bras dans les RPC donc inerte pour filtrage/badge/cocarde/barre niveaux; folde dans seeds_data.sql; SUPERSEDE par 16m qui les place en graded_label) =='
\ir migration_classification_regroup_network_labels.sql

\echo '== 16m    migration_classification_graded_label_group.sql  (§176 groupe dedie graded_label « Labels notes »: gites_epics + clevacances_keys + logis = distinctions NOTEES de reseau prive (echelle numerique), ni classement officiel Etat ni label binaire; supersede le placement 16l; DONNEE de reference seule; inerte pour les RPC; folde dans seeds_data.sql => no-op sur base fraiche; CI = tests/test_classification_regroup_network_labels.sql assert graded_label) =='
\ir migration_classification_graded_label_group.sql

\echo '== 16n    migration_classification_scheme_applicability.sql  (applicabilité des distinctions par type; DDL + seed non foldés) =='
\ir migration_classification_scheme_applicability.sql

\echo '== 16n-test garde permanente de l applicabilité des distinctions =='
\ir tests/test_classification_scheme_applicability.sql

\echo '== 16o    migration_capacity_metric_bounds.sql  (bornes observées des capacités par type; vue security_invoker non foldée) =='
\ir migration_capacity_metric_bounds.sql

\echo '== 16q-logo migration_classification_scheme_logos.sql  (URLs des logos de distinctions; DML de référence non foldé) =='
\ir migration_classification_scheme_logos.sql

\echo '== SURF1  migration_activity_contract_fix.sql  (object_act.equipment_provided_details + CHECK detail only when boolean true; get_object_resource activity block unchanged shape) =='
\ir migration_activity_contract_fix.sql
\echo '== SURF2  migration_save_object_places_reconcile.sql  (save_object_places places arm: reconcile by id, preserve media unless explicit media key; zones arm unchanged) =='
\ir migration_save_object_places_reconcile.sql
\echo '== SURF3  migration_save_object_rooms.sql  (api.save_object_rooms atomic room reconcile; whitelist in moderation approve) =='
\ir migration_save_object_rooms.sql

\echo '== ORG1   migration_org_onboarding.sql  (création d ORG par superadmin: api.rpc_create_org — objet ORG published direct + org_config, superuser-only, voie UNIQUE de création d ORG car un draft ORG serait impubliable; api.rpc_list_orgs pour la console admin + le sélecteur /team; dépend de rls_policies.sql is_platform_superuser + schema_unified.sql org_config/triggers; non foldé) =='
\ir migration_org_onboarding.sql

\echo '== ORG2   migration_org_branding.sql  (branding par ORG: table org_branding_settings — surcharges nullables héritant champ par champ du singleton app_branding_settings; get_app_branding résout selon le membership actif (current_user_org_id), signature/forme inchangées + clé orgObjectId, markerStyles reste plateforme; RPCs get/upsert gated user_can_manage_org_branding (superuser OU org_admin rang>=30); écritures via RPC uniquement; dépend de ui_whitelabel_branding.sql + migration_org_onboarding.sql; non foldé) =='
\ir migration_org_branding.sql

-- Materialized views are created WITH DATA in schema_unified.sql; refresh
-- NON-concurrently here so this also works on a never-yet-populated MV.
-- (Production scheduling uses REFRESH ... CONCURRENTLY via pg_cron — see runbook.)
\echo '== TRAIL1  migration_trail_referential.sql  (§181 Référentiel sentiers de randonnée : trail_* autonome hors modèle objet, vocabulaire iti_open_status étendu de 3 codes (not_managed/unknown/archived) + partition trail_link_role, consolidation internal.recompute_trail_status, diff idempotent internal.trail_sync_apply, frontière service_role-only trail_sync_begin/apply_service/finalize, RPC lecture admin + publique restreinte §17, 6 RPC écriture superuser ; dépend de ref_commune (8l) + is_platform_superuser (rls_policies.sql) + ref_code_iti_open_status (15e) + object (schema_unified) ; auto-contenu, RLS deny-all-direct sur toutes les tables trail_*/ref_trail_*) =='
\ir migration_trail_referential.sql

\echo '== taxo   migration_taxonomy_trees_seed.sql  (versions the target taxonomy registry + trees: 19 domains / 226 nodes / 207 parent links, including §190 HLO nature/form + §191 HPA homestay camping; idempotent upsert + parent_id resolved by code) =='
\ir migration_taxonomy_trees_seed.sql

\echo '== taxo2  migration_taxonomy_nature_forme.sql  (§190 HLO: 7 nodes, 4 re-parentings, 5 relabels, live manifest recoding; fresh data part no-op; idempotent tri-state guards) =='
\ir migration_taxonomy_nature_forme.sql

\echo '== taxo2-test target assertions (fresh/live aware) =='
BEGIN;
\ir taxonomy_nature_forme_manifest_20260724.sql
\ir tests/test_taxonomy_nature_forme_target.sql
\ir tests/test_taxonomy_nature_forme_guard.sql
ROLLBACK;

\echo '== taxo3  migration_taxonomy_camp_hpa_homestay.sql  (§191 CAMP→HPA: Camping chez l habitant; creates taxonomy_hpa.homestay_camping, retypes the 2 live carriers when present, disables the legacy CAMP leaf; self-asserting and fresh-safe) =='
\ir migration_taxonomy_camp_hpa_homestay.sql
\echo '== taxo4  migration_taxonomy_accommodation_vocabulary.sql  (§192 canonical accommodation vocabulary; semantic axes, Berta aliases, no object reassignment; self-asserting and fresh-safe) =='
\ir migration_taxonomy_accommodation_vocabulary.sql

\echo '== taxo5  migration_taxonomy_accommodation_hierarchy_v2.sql  (§201 hiérarchie v2 : familles campings_terrains + aires_haltes_plein_air, plein_air retiree, 3 natures collectives HLO passees de sous_type a nature (libelles Auberge/Gite), declared_campground parent reel de farm_camping/homestay_camping, residential_leisure_park, bivouac_area, motorhome_night_stop, outdoor_glamping hors axe nature ; 2 reprises object_taxonomy gardees ; auto-assertive, idempotente et fresh-safe) =='
\ir migration_taxonomy_accommodation_hierarchy_v2.sql

\echo '== taxo4-test permanent §192 guards, après enrichissement taxo5 des nœuds déjà présents dans le snapshot cible (axes declared, family resolves, canonical labels held, alias indexing wired) =='
\ir tests/test_taxonomy_accommodation_vocabulary.sql

\echo '== taxo5-test garde permanente §201 (5 familles actives, sous-types = vrais enfants same-domain, closure depth=1, ET filtre parent NON VACANT via api.get_filtered_object_ids sur porteurs temoins) =='
\ir tests/test_taxonomy_accommodation_hierarchy_v2.sql

-- taxo6 DOIT rester APRES migration_explorer_phonetic_search.sql (l. 242) : les deux
-- redefinissent api.get_filtered_object_ids, et la derniere definition gagne. Le corps
-- embarque ici est celui de la version phonetique, patche aux trois points d ancrage.
\echo '== taxo6  migration_accommodation_unit_type.sql  (§201 lot 5A axe Type d unite MULTI-VALUE : partition ref_code_accommodation_unit_type (le domaine est garanti par la partition, pas par un CHECK) + 5 codes + table de liaison object_accommodation_unit_type (PK composite, FK indexee des deux cotes, RLS lecture §38 et ecriture PAR COMMANDE, GRANT explicites), reprise nominative des 7 unites historiques puis retraite des feuilles bulle/lodges/hebergement_insolite/outdoor_glamping, cle de filtre accommodation_unit_types_any ; auto-assertive, idempotente et fresh-safe) =='
\ir migration_accommodation_unit_type.sql

\echo '== taxo6-test garde permanente §201 lot 5 (multi-valeur, doublon refuse, personas anon/proprietaire/etranger sur les 4 commandes, GRANT anon borne a SELECT, cascade, filtre Explorer non vacant, reprise des 7 unites) =='
\ir tests/test_accommodation_unit_type.sql

\echo '== taxo6b migration_accommodation_unit_type_catalog_v2.sql (§201 lot 5B : 22 types de logement, Insolite court + Autre distinct, extraction maison/appartement/studio/bungalow/chalet/roulotte hors taxonomy_hlo) =='
\ir migration_accommodation_unit_type_catalog_v2.sql

\echo '== taxo6b-test garde permanente (catalogue exact, ancien libelle absent, anciennes formes HLO retirees, alias Gite rural preserve) =='
\ir tests/test_accommodation_unit_type_catalog_v2.sql

\echo '== taxo7  20260729114447_hotel_positioning_axis.sql  (axe Positionnement hôtelier multi-valué; après taxo6, avant les corps Explorer qui lisent object_hotel_positioning) =='
\ir ../supabase/migrations/20260729114447_hotel_positioning_axis.sql

\echo '== taxo8  migration_motorhome_service_amenities.sql  (§201 lot 6 : les 3 capacites camping-car (eau / vidange / electricite) creees DISTINCTES dans ref_amenity et non dans une taxonomie ; l aire de SERVICES reste taxonomy_spu.motorhome_services et ne prouve jamais la nuitee ; aucun code gratuit/payant, le prix vit dans object_price ; auto-assertive et idempotente) =='
\ir migration_motorhome_service_amenities.sql

\echo '== I4d    migration_interop_crosswalk_leafaware.sql  (§190 DATAtourisme: nearest mapped taxonomy ancestor depth ASC + type fallback; composite FK and paired-null check) =='
\ir migration_interop_crosswalk_leafaware.sql

\echo '== I4d-test leaf-aware interop assertions =='
\ir tests/test_interop_crosswalk_leafaware.sql

\echo '== I4e    migration_tourinsoft_reunion_export_v1.sql  (opt-in reunion-hebergement-v1: value crosswalks + set-based public projection + unit/batch serializers; legacy-v1 unchanged) =='
\ir migration_tourinsoft_reunion_export_v1.sql

\echo '== I4e-test Tourinsoft Reunion export assertions =='
\ir tests/test_tourinsoft_reunion_export_v1.sql

\echo '== I4f    migration_tourinsoft_reunion_regional_v1.sql  (opt-in reunion-regional-v1: six exact feed profiles, taxonomy-aware routing, canonical+extension serializer, legacy and accommodation contracts preserved) =='
\ir migration_tourinsoft_reunion_regional_v1.sql

\echo '== I4f-test Tourinsoft Reunion six-family regional export assertions =='
\ir tests/test_tourinsoft_reunion_regional_v1.sql

\echo '== I4f-compat-test legacy-v1 and reunion-hebergement-v1 after regional wrapper redefinition =='
\ir tests/test_tourinsoft_reunion_export_v1.sql

\echo '== pets1  migration_pet_policy_single_source.sql  (§197 « Animaux acceptés » source unique : retire l equipement doublon ref_amenity.pet_friendly, backfille object_pet_policy depuis l amenity + la revue manuelle des descriptions; auto-assertive et fresh-safe) =='
\ir migration_pet_policy_single_source.sql

\echo '== pets1-test garde permanente §197 (doublon absent, famille pets preservee, filtre pet_accepted non vacant) =='
\ir tests/test_pet_policy_single_source.sql

\echo '== 16p    migration_tags_purge_import_20260512.sql  (§203 tags : sauvegarde puis purge des 4529 liens tag_link portant extra.source = old_data_enrichment_20260512 + retrait des 15 tags du catalogue qui doublonnent un axe deja filtrable ; family/romantic conserves, desormais seedes par seeds_data.sql ; les 6 lignes de saisie editeur sont explicitement HORS purge ; no-op complet sur base fraiche) =='
\ir migration_tags_purge_import_20260512.sql

\echo '== 16q    migration_tags_curated_seed.sql  (§203 tags : catalogue reconstruit — 3 tags choisis (Vue mer, Cuisine au feu de bois, Case creole) appliques par regles a phrase specifique dont la precision a ete mesuree a la main sur echantillon lu ; 146 liens sur live, chacun portant extra.source + extra.rule donc revocable seul ; sur base fraiche seul le catalogue est cree, 0 lien) =='
\ir migration_tags_curated_seed.sql

\echo '== 16p/16q-test garde permanente §203 (A import parti / B aucun tag sortant / C les 5 tags attendus sont au catalogue / D aucun tag ne duplique le nom exact d un equipement, cadre ou noeud de taxonomie / E la sauvegarde ne contient QUE des lignes d import, donc la purge n a pas emporte de saisie editeur / F le RPC editeur stampe created_by et extra.source / G tout lien de regle porte sa regle et reste revocable seul) =='
\ir tests/test_tags_purge_catalog.sql

\echo '== 16r    migration_explorer_remplissage_filter.sql  (204 filtre Remplissage: internal.v_object_essentials devient la source UNIQUE du bundle des 8 essentiels visiteur, jusque-la recopie dans get_dashboard_completeness; booleens en colonnes SEPAREES car PostgreSQL elague les colonnes non consommees; helper DEFINER api.object_missing_essentials portant REVOKE FROM PUBLIC + gate editeur + auto-autorisation des ids, car list_object_resources_filtered_page est SECURITY INVOKER et ne peut pas lire le schema internal; deux cles missing_essentials_buckets/_any dans get_filtered_object_ids sous garde CASE avec sonde d autorisation PARESSEUSE; APRES taxo6 = corps complet de get_filtered_object_ids incluant 197/199/201; NOUVELLE fonction exposee donc NOTIFY pgrst requis) =='
\ir migration_explorer_remplissage_filter.sql

\echo '== 16r-test garde permanente 204 (A la vue voit les bons trous / C non-vacuite: paliers, selection non contigue, facette, OU interne, combinaison ET, cle vide = pas de filtre / D la carte porte missing_essentials, tableau vide != champ absent / B REVOKE anon par le catalogue, gate editeur ferme, cles d un non-editeur ignorees) =='
\ir tests/test_remplissage_filter.sql

\echo '== 16s    migration_remove_auberge_collective_scheme.sql  (§206 reunion 2026-07-17 : auberge collective = categorie DECLAREE L325-1, jamais classee en etoiles — retrait du schema auberge_collective_stars, de ses 5 valeurs et de son applicabilite ; fail-closed si une attribution existe ; retire AUSSI a la source dans seeds_data/14d/16n donc no-op complet sur base fraiche) =='
\ir migration_remove_auberge_collective_scheme.sql

\echo '== 16s-test garde permanente 206 + enrolement du test 14d, orphelin depuis sa creation (jamais joue en CI — la derive §176 logis→graded_label y etait invisible) : 4 classements officiels §71, absence de auberge_collective_stars, 6 labels qualite, 3 graded_label §176, valeurs presentes, QTIR 2 valeurs, logis multiple =='
\ir tests/test_classification_labels_expansion.sql

\echo '== 16t    migration_legal_document_catalog.sql  (209 catalogue des documents juridiques reellement demandes aux prestataires: renomme liability_insurance -> attestation_assurance et tourism_license -> immatriculation_atout_france en PRESERVANT l id donc les lignes object_legal rattachees, retire fail-closed les 8 types generiques inventes (echoue si l un porte encore une ligne), installe les 11 pieces manquantes de la liste OTI, is_required=false et is_public=false sur TOUS les documents; folde dans schema_unified.sql donc no-op sur base fraiche) =='
\ir migration_legal_document_catalog.sql

\echo '== 16t-test garde permanente 209 (A les 12 pieces OTI presentes sous le bon libelle / B+C les 8 generiques et les 2 anciens codes renommes sont partis, aucun object_legal orphelin / D aucun document obligatoire ni public / E les 5 codes d identite des champs plats du 18 intacts / F non-vacuite: une ligne temoin traverse la FK et ressort de api.get_object_legal_data avec libelle et visibilite) =='
\ir tests/test_legal_document_catalog.sql

\echo '== 16u    migration_actor_contacts_org_gate.sql  (§208 : garde api.can_read_actor_contacts — membre d une ORG publisher (api.current_user_crm_object_ids, 8z), JAMAIS auth.role() ; PII+canaux du leg actors de get_object_resource sous CASE paresseux + contacts_restricted ; render.actor_lines/contact_lines gates (classe §49 — fuyait des noms de personnes a anon sur 760 fiches publiees) ; journal immuable actor_contact_export_log SANS aucune valeur de coordonnee ; RPC export_actor_contacts authorize-once + journalise, finalite/format/plafond 500 valides serveur, authenticated seulement (jamais service_role : une cle de service n est pas une personne) ; preflight export_actor_capabilities ; durcit par ALTER FUNCTION le search_path (pg_temp en dernier) des 3 feuilles d autorisation dont dependent ces fonctions (current_user_crm_object_ids, current_user_extended_object_ids, current_user_readable_object_ids) ; REVOKE PUBLIC d hygiene sur get_object_resources_batch ; NOTIFY pgrst. Creneau : le plan §208 designait cette etape « 16t », deja pris par §209 (migration_legal_document_catalog.sql, commite avant) — 16u est le premier creneau 16x libre. Ordre requis : APRES api_views_functions.sql (5/13, leg actors patche) et APRES migration_cards_batch_authorize_definer.sql (8j, qui installe la 3e feuille non-STUB) — deja le cas, tres en amont dans ce manifeste) =='
\ir migration_actor_contacts_org_gate.sql

\echo '== 16u-test garde permanente §208 (4 personas par request.jwt.claims : membre ORG publisher / authentifie etranger / anon / service_role ; equivalence garde/forme ensembliste M2 sur 9 couples persona x fiche ; journal sans AUCUNE valeur de coordonnee ; verifie rouge par sabotage D2 (retrait du CASE du champ contacts) et J (usurpation de app_user_profile/user_org_membership par relation TEMP sans pg_temp en dernier)) =='
\ir tests/test_actor_contacts_org_gate.sql

\echo '== 16u-test2 §208/T13b garde permanente : api.save_object_relations (7, 8r) reporte actor_object_role.note depuis l instantane pre-DELETE (jamais efface) quand l appelant echoue api.can_read_actor_contacts, l ecrit quand il peut ; depend de 8r ET de 16u ; verifie rouge sans le report =='
\ir tests/test_actor_link_note_carryover.sql

\echo '== 16v    migration_explorer_name_relevance.sql  (spec 2026-08-26 : BONUS NOM dans api.get_filtered_object_ids + emission de relevance PAR CARTE dans api.list_object_resources_filtered_page. Mesure prod avant : la fiche nommee EXACTEMENT « Le Jardin Creole » scorait 2.2577 contre 2.2395 pour une fiche sans « jardin » ni « creole » dans son nom — un ecart de BRUIT, et le second homonyme tombait 5e ; ts_rank recompense la DENSITE des termes dans le document, jamais l EXACTITUDE du nom. Etages desormais etanches PAR CONSTRUCTION (bonus espaces de 1.0 entier ET ts_rank plafonne a 0.99 — non borne a 1 en theorie : mesure sur temoins, ts_rank SATURE a 1.0, donc sans plafond le nom exact ferait exactement 6.0 et sortirait de son etage) : nom exact [5,6) > prefixe [4,5) > contenu [3,4) > plein texte [2,3) > flou [0,1]. Le bonus ne s applique QU AU bras plein texte ; cout nul (liste SELECT evaluee APRES filtrage). Cote page : relevance suit le meme chemin d attache positionnelle que label_match et est TOUJOURS emis (0 sans terme ⇒ ordre alphabetique historique preserve) — sans cette cle le front recolle les pages de 7 buckets et retombe sur l alphabetique, annulant l ORDER BY serveur. CORPS COMPLET des deux fonctions derive de 16r (verifie IDENTIQUE au prosrc vif ligne a ligne avant derivation, §213). ⚠️ NE PAS deriver de api_views_functions.sql : ce fichier est reste PRE-§204 (0 occurrence de missing_essentials) et le deployer EFFACERAIT le filtre Remplissage. APRES 16r. Signatures inchangees ⇒ NOTIFY pgrst non requis. Prod apres : les 2 homonymes a 5.258/5.127, tout le reste <= 2.240 ; perf inchangee 113 ms a vide / 130 ms avec recherche) =='
\ir migration_explorer_name_relevance.sql

\echo '== 16v-test garde permanente spec 2026-08-26 (A etages de relevance etanches, le temoin « bruit » portant la saisie repetee 8x dans sa DESCRIPTION mais pas dans son nom = exactement le cas prod qui passait devant ; B la cle relevance est RENDUE par carte ; C neutralite sans terme). Temoin du bloc B PUBLIE et non draft : get_object_cards_batch est authorize-once (§36) et borne au perimetre lisible = publie ∪ etendu, or l etendu derive de l ADHESION ORG qu un temoin synthetique n a pas (verifie : meme en service_role, extended=0) ⇒ un temoin draft rendrait toujours une page vide et le bloc serait vacant =='
\ir tests/test_explorer_name_relevance.sql

\echo '== 16w    migration_search_objects_by_name.sql  (spec 2026-08-26 : RPC LEGER de concordance directe par nom — socle des « pre-resultats » de l Exploreur, consomme par le menu sous la barre de recherche, le bandeau en tete des resultats ET la palette Ctrl+K. CE N EST PAS UN FILTRE : il cherche tout le corpus visible INDEPENDAMMENT des filtres actifs — navigation (« je veux LA fiche »), pas filtrage ; les confondre ferait disparaitre la fiche cherchee des qu un filtre sans rapport serait actif. Pourquoi une fonction dediee : get_filtered_object_ids porte un socle de ~100 ms meme a vide (DEFINER non inlinee, tous ses predicats planifies a chaque appel, classe 204) paye UNE FOIS PAR BUCKET (7), et list_object_markers — que la palette utilisait — porte le meme socle ET ne rend que les fiches GEOLOCALISEES (limite ponytail de palette-search.ts) ; ici un seul acces indexe sur object.name_normalized, mesure ~20 ms. Perimetre AUTO-GARDE serveur (doctrine 205 transposee, le client ne choisit rien) : published pour tous ; + draft du perimetre etendu pour un editeur, sous COALESCE(current_user_can_edit_objects(), FALSE) OBLIGATOIRE car la sonde est a TROIS valeurs (204) ; archived/hidden JAMAIS. Sonde d autorisation appelee UNE FOIS dans le CTE params, pas par ligne. Echappement LIKE de la saisie avec le backslash EN PREMIER (sinon on re-echappe ce qu on vient de poser) : un % saisi ne doit pas ramener le corpus. REVOKE ALL FROM PUBLIC obligatoire (204). Fonction exposee NEUVE donc NOTIFY pgrst requis) =='
\ir migration_search_objects_by_name.sql

\echo '== 16w-test garde permanente spec 2026-08-26, NON VACANTE et verifiee rouge avant application (A anon = les 3 publies dans l ordre exact>prefixe>infixe, accents normalises ; B authentifie ETRANGER = strictement comme anon, le brouillon ne fuit pas ; C membre org_admin de l ORG publisher = les 3 publies + SON brouillon, l archive jamais — la garde se mesure des DEUX cotes ; D gardes d entree : moins de 2 caracteres, % echappe, p_limit borne ; E EXECUTE retire a PUBLIC). Le persona editeur porte un sub REEL avec adhesion active ET un role d ORG org_admin : une simple adhesion NE SUFFIT PAS (current_user_can_edit_objects exige superuser OU role d admin d ORG OU une des 4 permissions, dont il n existe encore AUCUN octroi — dette SP-2), et service_role sans sub a can_edit=TRUE mais un perimetre etendu VIDE (verifie) donc ne peut pas eprouver le bras brouillon. Chaque prealable est asserte AVANT usage pour que le bloc ne puisse pas passer a vide =='
\ir tests/test_search_objects_by_name.sql

\echo '== E2     migration_selection_emails.sql  (§211 api.list_selection_emails: editor-gated + publisher-scoped bulk email export for an Explorer selection or a saved list; operator-actor -> object-contact cascade; needs E1 internal resolver, api_views current_user_can_edit_objects, CRM current_user_crm_object_ids. MOVED AFTER 16u (tache 7, §208 alignment): p_reason now first/mandatory, VOLATILE, writes public.actor_contact_export_log (created by 16u) only when the actor arm emits, superuser arm aligned on api.can_read_actor_contacts (never is_platform_superuser), GRANT authenticated only) =='
\ir migration_selection_emails.sql

\echo '== 16x    migration_org_link_reconcile.sql  (214 api.save_object_relations : les branches org_links ET actors deviennent des RECONCILES non destructifs. Invariant : une ecriture ne doit jamais supprimer la ligne qui participe au predicat qui l autorise - la RLS est re-evaluee PAR LIGNE ECRITE, donc APRES la destruction. org_links (defaut VIF) : le delete-all detruisait le lien publisher que user_can_write_canonical probe, donc canonical_ins_object_org_link refusait la re-insertion en 42501 pour TOUT editeur - invisible pour un superuser qui passe par is_object_owner. Symptome : « impossible de rattacher un prestataire », 15/17/19 partageant le module relationships. actors (jumeau, 0 utilisateur concerne mesure le 2026-08-26, ferme sur demande PO) : actor_object_role porte is_object_owner (lien acteur PRIMAIRE a l e-mail de l appelant). Ordre impose des deux cotes : resoudre sans ecrire, demarquer le principal, UPSERT, supprimer le reliquat EN DERNIER. Le report de note 208/T13b est PRESERVE et simplifie (sans DELETE, reporter = ne pas ecrire la colonne). SECURITY INVOKER inchange, aucune policy touchee. Doit passer APRES 7, 8r, 8b, 8o et 16u) =='
\ir migration_org_link_reconcile.sql

\echo '== 16x-test garde permanente 214 (personas reels par request.jwt.claims + SET LOCAL ROLE. Temoin editeur ne portant QUE edit_canonical_when_publisher : B il enregistre le module relationships et le lien publisher SURVIT / B2 deux enregistrements de suite / C le superuser ecrit toujours / D un authentifie sans membership reste refuse 42501 / E un lien omis du payload est bien supprime / F la bascule du principal ne heurte pas uq_object_primary_org / G un doublon payload leve toujours 23505. Temoin proprietaire PAR LIEN ACTEUR (claim email -> user_actor_ids) : H il enregistre et le lien qui porte son droit survit. I le report de note 208/T13b survit au reconcile. Verifie ROUGE contre le corps delete-all, sur les DEUX tables : 42501 object_org_link (bloc B) et 42501 actor_object_role (bloc H)) =='
\ir tests/test_org_link_reconcile_editor.sql

\echo '== 16b    migration_ref_code_admin_rpcs.sql  (Phase 7.5 editeur de referentiels ref_code : api.ref_code_domain_is_editable + rpc_upsert/set_active/reorder/delete_ref_code + list_ref_code_domains + ref_code_usage_count(s). DOCUMENTEE au runbook depuis sa creation mais JAMAIS declaree ici : trou d integrite de deploiement preexistant, revele par la tache 5 de 211 dont l etape 16y delegue a ces fonctions et echouerait donc sur base fraiche. Depend de rls_policies.sql (is_platform_superuser) et de schema_unified.sql (ref_code, ref_code_domain_registry)) =='
\ir migration_ref_code_admin_rpcs.sql

\echo '== 16y    migration_ref_catalog_admin.sql  (211 administration generee des catalogues : vue d introspection internal.v_ref_catalog (32 tables ref_* + 71 domaines ref_code, forme et cle primaire SYNTHETISEES pour les domaines sans quoi ils seraient tous verrouilles en silence), registre editorial, helpers d acces DERIVES, 5 RPC DEFINER gated superuser dont trois en SQL dynamique dont la LISTE BLANCHE EST LA VUE) =='
\ir migration_ref_catalog_admin.sql

\echo '== 16y-test garde permanente 211 (compte exact des catalogues / domaines editables et identifiables / cible de FK normalisee en catalog_key / maitre et detail jamais divergents / balayage exhaustif de get_ref_catalog / compteur fusionnant DEUX FK entrantes distinctes / cycle creer-editer-refuser-supprimer sur cle uuid, naturelle et composite / delegation ref_code non inversee avec activation et reordonnancement / ASSERTION DE SECURITE : une ecriture visant object ou auth.users leve UNKNOWN_CATALOG) =='
\ir tests/test_ref_catalog_admin.sql

\echo '== 16z    migration_crm_task_multi_assignee_notifications.sql  (CRM kanban: provenance du createur + assignation MULTIPLE + notifications persistantes. crm_task.created_by immuable (pose a l INSERT, jamais reecrit par un payload d UPDATE ; PAS de backfill — l historique du createur n existe pas et une approximation dans une colonne de provenance devient un fait au premier lecteur suivant : les lignes anterieures restent NULL = « Createur inconnu »). Table de liaison crm_task_assignee (task_id,user_id) + index user_id en tete pour « mes taches » ; backfill depuis owner SANS provenance: assigned_by ET assigned_at restent NULL car owner est MODIFIABLE (created_at est la naissance de la TACHE) et updated_at = created_at ne prouve rien non plus (NOW() est constant sur la transaction, donc creation puis reassignation dans la meme transaction preserve l egalite). Regle portee par internal.crm_backfill_assignees_from_owner() -- fonction NOMMEE et non INSERT en ligne, seule forme que la garde puisse eprouver. crm_task.owner SURVIT comme valeur de compatibilite de deploiement = plus petit uuid de l ensemble. app_notification generique (kind fail-closed par CHECK) dont recipient_id EST la frontiere de securite ; payload ne contient AUCUN nom — tout libelle est JOINT a la lecture depuis app_user_profile, donc dans la portee de l effacement RGPD. save_crm_task: contrat assignee_ids, verrou FOR UPDATE de la tache (deux reconciles concurrents), diff calcule AVANT toute ecriture puis UPSERT et DELETE du reliquat EN DERNIER (non destructif — sinon assigned_at/assigned_by des inchanges sont reecrits et tout le monde redevient « nouveau », donc re-notifie), notification des SEULS entrants en excluant l auteur (IS DISTINCT FROM, jamais <> : auth.uid() est NULL hors contexte HTTP). list_crm_tasks + list_object_crm portent le MEME contrat assignees[]/created_by_id/created_by_name ([] jamais null). 3 RPCs de boite de reception, destinataire TOUJOURS auth.uid() jamais un parametre ; PAS de RPC de comptage separe car une cardinalite ne dit pas de QUOI la boite est faite (lire une ancienne pendant qu une neuve arrive laisse le compte identique) donc la pastille se lit dans unread_count de la liste. RLS + AUCUN grant anon/authenticated sur les deux tables neuves. APRES 8z. NOTIFY pgrst requis) =='
\ir migration_crm_task_multi_assignee_notifications.sql

\echo '== 16z-test garde permanente 16z (A structure + RLS + zero grant anon/authenticated + CHECK kind fail-closed / B ORDRE CRITIQUE: B0 verifie que CHAQUE tache avec owner porte une ligne POUR CET OWNER (identite, pas simple existence: une reprise vers un autre utilisateur valide passait au vert) AVANT que le test n appelle lui-meme la reprise (cet appel reparerait tout et masquerait une migration qui aurait oublie la sienne), B5 compare la LIGNE ENTIERE et non une colonne, puis backfill eprouve sur des TEMOINS fabriques passes a la fonction de la migration (jamais par deduction sur le corpus: une tache nee du trigger incident_report a legitimement created_by NULL APRES 16z, une garde qui en deduirait backfillee rougirait sur une donnee saine -- bloc B6): ni assigned_by ni assigned_at, colonne nullable, second passage ne reecrit rien, plus une assertion de completude sur le corpus reel / C auto-assignation + createur, deux assignes ordonnes PAR NOM alors que l ordre des uuid est INVERSE, doublons replies, owner de compatibilite deterministe / D refus 22023: hors ORG, ensemble vide, owner herite vide, non-tableau, non-uuid / E notifications: seuls les entrants, jamais soi-meme, ensemble constant = 0, statut seul = 0 et assignations intactes, retrait = 0, remise = 1 nouvelle, payload sans nom, assigned_at/assigned_by des inchanges survivent / F cloisonnement: boite de l appelant seule, marquer lu chez autrui rend 0 ET laisse non lu, id inconnu identique, tables illisibles en direct, anon = boite vide / G created_by immuable / H non-regression 66 + assignees=[] pour une tache nee sans assigne + terminer une tache ne cloture RIEN en SQL. Verifie ROUGE par 15 sabotages: reconcile destructif, notifier tout l ensemble, tri par uuid, created_by modifiable, self-notification, les DEUX redactions successives du backfill de date, assigned_by invente, colonne omise donc DEFAULT now(), backfill en DO UPDATE (des deux formes), RPC de comptage re-introduit, appel de la reprise retire de la migration, reprise vers un autre utilisateur valide, ligne surnumeraire) =='
\ir tests/test_crm_task_multi_assignee.sql

\echo '== I4f-final-test Tourinsoft regional contract after every downstream migration =='
\ir tests/test_tourinsoft_reunion_regional_v1.sql

\echo '== MV refresh (non-concurrent) =='
REFRESH MATERIALIZED VIEW internal.mv_ref_data_json;
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

\echo '== Fresh apply complete =='
