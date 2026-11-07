-- migration_partner_i18n_all.sql
-- Audit API — Phase 1, chantier C-5 (i18n multi-langue « all »).
--
-- PROBLÈME : un prestataire tiers qui synchronise du contenu ne peut récupérer, par
-- appel à `get_object_resource`, qu'UNE langue résolue (lang_prefs → fallback FR). Pour
-- toutes les langues il devrait rappeler la RPC N fois. Les colonnes `*_i18n` sont pourtant
-- déjà en ligne.
--
-- SOLUTION (Approche A — get_object_resource N'EST PAS TOUCHÉE) : une RPC dédiée renvoie un
-- bloc multi-langue, fusionné par la passerelle sur `?lang=all`. Le défaut de
-- get_object_resource reste inchangé byte-à-byte (garde §103).
--   api.strip_markdown_i18n(jsonb)  -> {lang: markdown} → {lang: texte propre}
--   api.get_object_i18n_all(text)   -> { field: {lang: texte propre}, … }
--
-- CONTRAT MARKDOWN (§106/§112) : émission PLATE PAR LANGUE (strip_markdown appliqué à chaque
-- valeur) — un contrat tiers reçoit du texte propre, JAMAIS de `*_i18n` brut non-strippé sur
-- une voie publique. Projette UNIQUEMENT les maps `*_i18n` (un champ FR-only sans map est
-- absent du bloc ; son FR reste servi par la clé `description` de base).
--
-- PÉRIMÈTRE (Tier 1) : famille de prose publique `object_description` (7 champs). La prose
-- type-spécifique (room/menu/place/iti/direction, §112) est un élargissement différé.
--
-- AUTORISATION : get_object_i18n_all = SECURITY INVOKER + EXECUTE réservé à service_role
-- (la passerelle appelle en service-role, qui bypasse la RLS) + self-gate `status='published'`
-- (défense en profondeur : un mis-call ne peut jamais exposer un brouillon) + visibilité
-- 'public' uniquement (pas de contexte utilisateur ⇒ jamais d'overlay privé/NULL). La primitive
-- strip_markdown_i18n est pure (aucun accès données) : grants alignés sur api.strip_markdown.
--
-- Idempotent (CREATE OR REPLACE). Dépend UNIQUEMENT de tables cœur (object, object_description,
-- object_org_link) + api.strip_markdown — toutes présentes dans schema_unified/api_views_functions.
-- Foldé dans api_views_functions.sql (source de vérité, couvre le gate fresh-apply) ; cette
-- migration sert les bases live existantes. Voir docs/api-audit/2026-06-30-api-fix-plan.md (C-5).

BEGIN;

-- {lang: markdown} -> {lang: plain text}. Empty/whitespace values dropped, keys lowercased,
-- NULL / '{}' / all-empty -> NULL (jsonb_strip_nulls-friendly). Reuses api.strip_markdown.
CREATE OR REPLACE FUNCTION api.strip_markdown_i18n(p_i18n jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE
    WHEN p_i18n IS NULL OR p_i18n = '{}'::jsonb THEN NULL
    ELSE NULLIF(
      (SELECT jsonb_object_agg(lower(e.key), api.strip_markdown(e.value))
       FROM jsonb_each_text(p_i18n) e
       WHERE e.value IS NOT NULL AND btrim(e.value) <> ''),
      '{}'::jsonb)
  END;
$fn$;

REVOKE ALL ON FUNCTION api.strip_markdown_i18n(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.strip_markdown_i18n(jsonb) TO anon, authenticated, service_role;

-- Partner-facing multi-language block for a PUBLISHED object (object_description family, §106 D1).
CREATE OR REPLACE FUNCTION api.get_object_i18n_all(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_prefer_org text;
  v_block      jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object o WHERE o.id = p_object_id AND o.status = 'published') THEN
    RETURN NULL;
  END IF;

  SELECT ool.org_object_id INTO v_prefer_org
  FROM object_org_link ool
  WHERE ool.object_id = p_object_id AND ool.is_primary IS TRUE
  ORDER BY ool.updated_at DESC
  LIMIT 1;

  WITH org_desc AS (
    SELECT d.* FROM object_description d
    WHERE d.object_id = p_object_id
      AND v_prefer_org IS NOT NULL
      AND d.org_object_id IS NOT DISTINCT FROM v_prefer_org
      AND (d.visibility IS NULL OR d.visibility = 'public')
    ORDER BY d.created_at DESC, d.id
    LIMIT 1
  ),
  canonical_desc AS (
    SELECT d.* FROM object_description d
    WHERE d.object_id = p_object_id
      AND d.org_object_id IS NULL
      AND (d.visibility IS NULL OR d.visibility = 'public')
    ORDER BY d.created_at DESC, d.id
    LIMIT 1
  )
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'description',                 api.strip_markdown_i18n(d.description_i18n),
    'description_chapo',           api.strip_markdown_i18n(d.description_chapo_i18n),
    'description_mobile',          api.strip_markdown_i18n(d.description_mobile_i18n),
    'description_edition',         api.strip_markdown_i18n(d.description_edition_i18n),
    'description_adapted',         api.strip_markdown_i18n(d.description_adapted_i18n),
    'description_offre_hors_zone', api.strip_markdown_i18n(d.description_offre_hors_zone_i18n),
    'sanitary_measures',           api.strip_markdown_i18n(d.sanitary_measures_i18n)
  ))
  INTO v_block
  FROM (
    SELECT * FROM org_desc
    UNION ALL
    SELECT * FROM canonical_desc WHERE NOT EXISTS (SELECT 1 FROM org_desc)
  ) d
  LIMIT 1;

  RETURN COALESCE(v_block, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION api.get_object_i18n_all(text) IS
  'Partner i18n=all block (audit API C-5): object_description free-text family as {field:{lang:plain text}} '
  '(strip_markdown per language, public-visibility only, published-gated). service_role-only.';

REVOKE ALL ON FUNCTION api.get_object_i18n_all(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_object_i18n_all(text) TO service_role;

COMMIT;
