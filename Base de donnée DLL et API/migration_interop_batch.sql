-- migration_interop_batch.sql
-- Audit API — Phase 2, chantier I4 (suite §153) : sortie pivot PAR LOTS pour la liste partenaire.
--
-- PROBLÈME : les 4 profils d'interop (§136 schema.org, §137 datatourisme/apidae/tourinsoft) ne
-- sont servis que par le DÉTAIL `GET /api/public/objects/{id}?format=…`. Un partenaire qui
-- synchronise le corpus (liste paginée par curseur) devrait rappeler le détail N fois par page.
--
-- SOLUTION : UN RPC batch mince qui wrappe les sérialiseurs EXISTANTS (DRY — aucun nouveau
-- sérialiseur, aucune duplication de forme) :
--   api.get_objects_interop_batch(p_object_ids text[], p_profile text) → jsonb {"<id>": {doc}, …}
-- La route liste extrait les ids de la page (curseur/page_size inchangés) et fait UN appel batch,
-- puis fusionne chaque document sous la clé additive `item.<profil>` (miroir du détail).
--
-- PERF (mesurée live 2026-07-01, garde-fou §125) : 200 fiches publiées × get_object_interop
-- ('datatourisme') = **88 ms** (~0,44 ms/fiche — chaque appel = index lookups simples sur
-- object/object_description/object_location/contact_channel/object_web_channel). Le per-row est
-- borné par le clamp 200 (= page_size max de la liste) ; rien à voir avec la classe ~240 ms/item
-- de l'anti-pattern §125 (fonctions taxonomy lourdes).
--
-- AUTORISATION : INVOKER + EXECUTE service_role-only (mirror des sérialiseurs — la passerelle
-- appelle service-role). Le batch filtre published UNE fois (authorize-once §36) ; chaque
-- sérialiseur re-gate published par objet (défense en profondeur). Un id non-publié / inconnu /
-- non-mappé au profil est simplement ABSENT de la map (jamais d'erreur, jamais de fallback).
--
-- LANGUAGE sql (corps validé à la CREATE — §135b) : get_object_jsonld (I4) et get_object_interop
-- (I4b) existent aux étapes précédentes du manifest ⇒ pas de stub forward-decl nécessaire.
--
-- PRÉREQUIS : migration_object_jsonld_schemaorg.sql (I4) + migration_interop_profiles.sql (I4b).
--   APPLIQUER APRÈS I4b — manifest step I4c (ci_fresh_apply.sql).
-- IDEMPOTENT : CREATE OR REPLACE + grants. REVERSIBLE : DROP FUNCTION.
-- Voir docs/api-audit/2026-06-30-api-fix-plan.md (I4) + lot1_mapping_decisions.md §153.

BEGIN;

CREATE OR REPLACE FUNCTION api.get_objects_interop_batch(p_object_ids text[], p_profile text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $fn$
  -- Clamp to 200 ids (the partner list page_size ceiling), dedup, published-only (authorize-once);
  -- each serializer re-gates per object (defense in depth). Unmapped/unpublished ids are absent.
  SELECT COALESCE(jsonb_object_agg(d.id, d.doc), '{}'::jsonb)
  FROM (
    SELECT o.id,
           CASE WHEN p_profile = 'jsonld'
                THEN api.get_object_jsonld(o.id, 'jsonld')
                ELSE api.get_object_interop(o.id, p_profile)
           END AS doc
    FROM (SELECT DISTINCT u.id FROM unnest(p_object_ids[1:200]) AS u(id)) ids
    JOIN object o ON o.id = ids.id AND o.status = 'published'
  ) d
  WHERE d.doc IS NOT NULL;
$fn$;

COMMENT ON FUNCTION api.get_objects_interop_batch(text[], text) IS
  'Partner batch interop serializer (audit API I4 §153): {"<object_id>": <profile document>} for up to '
  '200 PUBLISHED ids, wrapping get_object_jsonld (profile ''jsonld'') / get_object_interop (datatourisme/'
  'apidae/tourinsoft). Unpublished/unknown/unmapped ids are absent. service_role-only. Measured 200 docs = 88 ms.';

REVOKE ALL ON FUNCTION api.get_objects_interop_batch(text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_objects_interop_batch(text[], text) TO service_role;

COMMIT;
