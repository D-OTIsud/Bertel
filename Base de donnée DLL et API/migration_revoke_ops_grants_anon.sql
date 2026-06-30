-- migration_revoke_ops_grants_anon.sql
-- Audit API 2026-06-30 — correctif Q1a (resserrage anon ciblé).
--
-- Les fonctions du schéma `api`/`public` héritent par défaut d'EXECUTE pour PUBLIC
-- (+ USAGE schéma `api` accordé à anon) ⇒ ~182 fonctions `api` étaient appelables
-- par `anon` en PostgREST direct. Ce correctif retire `anon` des fonctions
-- d'EXPLOITATION/MAINTENANCE qui n'ont aucune raison d'être appelées publiquement
-- (cron, triggers, ré-indexation de caches, création de partition). Sous-ensemble
-- SÛR : ces 7 fonctions ne sont référencées NULLE PART dans le front (vérifié) ;
-- `authenticated` + `service_role` CONSERVENT l'EXECUTE (cron/triggers + corps de
-- RPC INVOKER éventuels), donc aucun flux connecté n'est cassé.
--
-- Mécanique : un simple `REVOKE … FROM anon` serait inopérant (anon hérite via
-- PUBLIC) ; on REVOKE depuis PUBLIC (+ anon explicite) puis on re-GRANT aux rôles
-- à conserver. CREATE OR REPLACE FUNCTION préserve les privilèges ⇒ ré-appliquer
-- api_views_functions.sql ne défait PAS ce REVOKE sur une base existante ; sur une
-- base NEUVE en revanche les fonctions naissent avec PUBLIC EXECUTE, donc ce fichier
-- DOIT s'appliquer APRÈS api_views_functions.sql (cf. runbook). Idempotent.
--
-- Le durcissement COMPLET (allowlist anon = 14 RPC front + helpers RLS) est Q1b,
-- différé avec la passerelle partenaire /api/public/* (audit API — plan de fixes).

BEGIN;

REVOKE EXECUTE ON FUNCTION api.disable_cache_triggers()                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.disable_cache_triggers()                        TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION api.enable_cache_triggers()                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.enable_cache_triggers()                         TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION api.refresh_object_filter_caches(text)              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.refresh_object_filter_caches(text)              TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION api.refresh_object_taxonomy_cache_for_domain(text)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.refresh_object_taxonomy_cache_for_domain(text)  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION api.refresh_open_status()                           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.refresh_open_status()                           TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION api.refresh_ref_code_taxonomy_closure(text)         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.refresh_ref_code_taxonomy_closure(text)         TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_object_version_monthly_partition(timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_object_version_monthly_partition(timestamptz) TO authenticated, service_role;

COMMIT;
