-- migration_revoke_anon_q1b_denylist.sql
-- Audit API Phase 1 — Q1b (resserrage anon, approche DENYLIST vérifiée — suite de Q1a).
--
-- CONTEXTE : 180 fonctions `api` étaient anon-exécutables (EXECUTE hérité via PUBLIC).
-- La recon (2026-07-01) a montré que le gros de ces 180 est NÉCESSAIRE : les 15 helpers
-- référencés par les policies RLS (évaluabilité, gotcha P0.3) + les RPC de lecture publics
-- + leur FERMETURE TRANSITIVE de helpers INVOKER (resource_block_*, i18n_pick, strip_markdown,
-- render_*, opening_*, cursor_*, lecteurs ITI/légal publics…). Un « REVOKE ALL + allowlist »
-- exigerait de figer cette fermeture au prix près (une omission casse l'explorer public).
-- On applique donc une DENYLIST de fonctions PROUVÉES inutiles à anon.
--
-- CE FICHIER RETIRE `anon` de 57 fonctions, en 2 classes sûres :
--   CLASSE 1 (31) — fonctions de TRIGGER (`RETURNS trigger`) : PostgreSQL INTERDIT leur appel
--     direct et NE VÉRIFIE PAS EXECUTE au déclenchement d'un trigger ⇒ anon n'en a jamais besoin.
--     REVOKE FROM PUBLIC, anon SANS re-grant (le trigger se déclenche indépendamment des grants).
--   CLASSE 2 (26) — ÉCRITURES / ADMIN / DASHBOARD : appelées UNIQUEMENT depuis les zones
--     authentifiées (vérifié par grep front) ou pas appelées du tout par le front ; une écriture
--     n'est jamais dans un chemin de lecture. REVOKE FROM PUBLIC, anon + re-GRANT authenticated,
--     service_role (l'éditeur/admin/routes serveur les conservent).
--
-- GARDE-FOUS (vérifiés) : aucune des 57 n'est un des 15 helpers de policy (noms disjoints) ;
-- aucune n'est appelée par la surface publique/anon. On ne touche QUE PUBLIC/anon — les
-- fonctionnalités authentifiées et service_role sont INCHANGÉES.
--
-- MÉCANIQUE (cf. Q1a) : REVOKE depuis PUBLIC (anon hérite via PUBLIC). CREATE OR REPLACE FUNCTION
-- préserve les privilèges ⇒ ré-appliquer api_views_functions.sql ne défait PAS ce REVOKE sur une
-- base existante. Sur une base NEUVE, les fonctions naissent avec PUBLIC EXECUTE ⇒ ce fichier DOIT
-- s'appliquer APRÈS tous les fichiers qui (re)créent ces fonctions (cf. runbook). Idempotent.
--
-- HORS GATE FRESH-APPLY (comme Q1a) : les grants ne sont pas couverts par le gate DDL
-- (CLAUDE.md « le gate ne détecte pas un grant ») ⇒ non foldé, non \ir dans ci_fresh_apply.
-- Vérifié par `tests/test_revoke_anon_q1b.sql` exécuté EN LIVE (MCP). Plan : docs/api-audit/2026-06-30-api-fix-plan.md (Q1b).

BEGIN;

-- ============================================================================
-- CLASSE 1 — 31 fonctions de trigger (REVOKE only ; EXECUTE non requis pour un trigger)
-- ============================================================================
REVOKE EXECUTE ON FUNCTION api.assert_facet_applicable()                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.assert_object_type_change_consistent()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.auto_attach_object_to_creator_org()              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.auto_populate_interaction_subject()              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.before_insert_object_generate_id()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.check_membership_org_type()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.check_org_config_org_type()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.check_org_permission_org_type()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.create_crm_artifacts_from_incident()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.enforce_actor_channel_email_shape()              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.enforce_app_user_profile_role_change()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.enforce_contact_email_shape()                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.enforce_single_active_org_membership()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.handle_auth_user_profile_created()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.handle_membership_status_transition()            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.lock_object_private_description_system_fields()   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.log_publication_proof_interaction()              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.manage_object_published_at()                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.prevent_duplicate_actor_email()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.recompute_audit_session_score()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.set_publication_workflow_timestamps()            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.sync_classification_from_audit_session()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.trg_refresh_caches_from_menu_item_link()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.trg_refresh_caches_from_object_menu_item()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.trg_refresh_caches_from_tag_link()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.trg_refresh_object_filter_caches_from_child()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.trg_refresh_ref_code_taxonomy_closure()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.validate_audit_result_points()                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.validate_object_business_timezone()              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.validate_object_taxonomy_assignment()            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION api.validate_ref_code_taxonomy_hierarchy()           FROM PUBLIC, anon;

-- ============================================================================
-- CLASSE 2 — 26 écritures / admin / dashboard (REVOKE PUBLIC,anon + re-GRANT authenticated,service_role)
-- ============================================================================
-- Légal (écritures + ops)
REVOKE EXECUTE ON FUNCTION api.add_legal_record(text, text, jsonb, uuid, date, date, legal_validity_mode, text, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.add_legal_record(text, text, jsonb, uuid, date, date, legal_validity_mode, text, timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.update_legal_record(uuid, jsonb, uuid, date, date, legal_validity_mode, text, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.update_legal_record(uuid, jsonb, uuid, date, date, legal_validity_mode, text, timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.deliver_legal_document(uuid, uuid, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.deliver_legal_document(uuid, uuid, timestamp with time zone, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.request_legal_document(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.request_legal_document(uuid, timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.audit_legal_compliance(text[], boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.audit_legal_compliance(text[], boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.generate_legal_expiry_notifications(integer, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.generate_legal_expiry_notifications(integer, text[]) TO authenticated, service_role;

-- Référentiels admin (super-admin gated ; appelés par ref-codes.ts en authentifié)
REVOKE EXECUTE ON FUNCTION api.rpc_upsert_ref_code(text, text, uuid, text, jsonb, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_upsert_ref_code(text, text, uuid, text, jsonb, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.rpc_delete_ref_code(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_delete_ref_code(text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.rpc_set_ref_code_active(uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_set_ref_code_active(uuid, text, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.rpc_reorder_ref_code(text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_reorder_ref_code(text, uuid[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.list_ref_code_domains() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.list_ref_code_domains() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.ref_code_domain_is_editable(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.ref_code_domain_is_editable(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.ref_code_usage_count(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.ref_code_usage_count(text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.ref_code_usage_counts(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.ref_code_usage_counts(text) TO authenticated, service_role;

-- Dashboard (authentifié ; dashboard-rpc.ts)
REVOKE EXECUTE ON FUNCTION api.get_dashboard_actualisation(object_type[], object_status[], jsonb, date, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_actualisation(object_type[], object_status[], jsonb, date, date, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.get_dashboard_city_distribution(object_type[], object_status[], jsonb, date, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_city_distribution(object_type[], object_status[], jsonb, date, date, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.get_dashboard_completeness(object_type[], object_status[], jsonb, date, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_completeness(object_type[], object_status[], jsonb, date, date, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.get_dashboard_distinction_overview(object_type[], object_status[], jsonb, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_distinction_overview(object_type[], object_status[], jsonb, date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.get_dashboard_scorecards(object_type[], object_status[], jsonb, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_scorecards(object_type[], object_status[], jsonb, date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.get_dashboard_type_breakdown(object_type[], object_status[], jsonb, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_type_breakdown(object_type[], object_status[], jsonb, date, date) TO authenticated, service_role;

-- Divers écritures / admin / exports
REVOKE EXECUTE ON FUNCTION api.upsert_app_branding(text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.upsert_app_branding(text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.sync_app_user_profile_from_auth_user(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.sync_app_user_profile_from_auth_user(uuid, text, jsonb, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.set_itinerary_track(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.set_itinerary_track(text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.export_publication_indesign(uuid, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.export_publication_indesign(uuid, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.export_itineraries_gpx_batch(text[], boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.export_itineraries_gpx_batch(text[], boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.list_objects_with_validated_changes_since(timestamp with time zone) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.list_objects_with_validated_changes_since(timestamp with time zone) TO authenticated, service_role;

COMMIT;
