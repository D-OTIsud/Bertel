-- migration_object_jsonld_schemaorg.sql
-- Audit API — Phase 2, chantier I4 (sortie multi-standards, PROFIL schema.org d'abord).
--
-- PROBLÈME : le contrat tiers `/api/public/*` ne sert que le modèle Bertel « brut ». Un
-- intégrateur SEO / annuaire attend un format PIVOT (schema.org, DATAtourisme, APIDAE,
-- Tourinsoft). Le PO a acté « les 4 » ; cette passe livre schema.org (JSON-LD) bout-en-bout.
--
-- SOLUTION (Approche A — get_object_resource N'EST PAS TOUCHÉE, garde §103/§130) :
--   1. ref_interop_crosswalk(profile, object_type, target_class, context_url) : le mapping
--      object_type -> classe cible est piloté par TABLE, jamais hardcodé en UI/RPC (invariant I4).
--      Clé (profile, object_type) => « un 2e profil = un seed de plus » (aucune DDL). context_url
--      dénormalisé par profil (schema.org constant) pour que le RPC ne porte AUCUNE connaissance
--      de profil en dur (ni CASE) : il lit classe + @context depuis la table.
--   2. api.get_object_jsonld(object_id, profile='jsonld') : RPC dédiée, SECURITY INVOKER,
--      service_role-only (la passerelle appelle en service-role, qui bypasse la RLS), self-gate
--      status='published' + visibilité 'public' (défense en profondeur : un mis-call n'expose
--      jamais un brouillon). Émet un objet JSON-LD schema.org dans une CLÉ SÉPARÉE (la passerelle
--      la fusionne sous data.jsonld sur ?format=jsonld — clé additive, défaut inchangé byte-à-byte).
--
-- CONTRAT MARKDOWN (§106/§112) : la description publique est émise en TEXTE PROPRE
-- (api.strip_markdown) — jamais de Markdown/`*_i18n` brut sur une voie tierce.
--
-- PÉRIMÈTRE (Phase 2, passe 1) : profil 'jsonld' = schema.org, les 19 object_type. Les 3 autres
-- profils (datatourisme/apidae/tourinsoft) = passes suivantes = seed du profil + branche de
-- sérialisation dans le RPC (les formats diffèrent réellement : RDF vs JSON régionaux).
--
-- VALEURS DU CROSSWALK : choix métier/SEO AJUSTABLES par le PO (données en table, pas du code).
-- Baseline plan I4 + archétypes éditeur (archetypes.ts) : HOT->Hotel, HLO/RVA->LodgingBusiness,
-- HPA/CAMP->Campground, RES->Restaurant, ASC/ACT/LOI/PCU/PNA->TouristAttraction, ITI->TouristTrip,
-- FMA->Event, PRD/PSV->LocalBusiness, VIL->TouristDestination, COM->Store, SPU->CivicStructure,
-- ORG->Organization. Tous des types schema.org valides.
--
-- PRÉREQUIS : schema_unified.sql (object/object_location/contact_channel/media/object_web_channel/
--   object_description) ; api_views_functions.sql (api.strip_markdown, api.i18n_pick) ;
--   rls_policies.sql (api.is_platform_superuser). APPLIQUER APRÈS ces fichiers — manifest step I4
--   (ci_fresh_apply.sql), après api_views (5) + rls_policies (6).
-- IDEMPOTENT : CREATE TABLE IF NOT EXISTS ; seed ON CONFLICT DO UPDATE ; DROP POLICY IF EXISTS +
--   CREATE ; CREATE OR REPLACE FUNCTION. Re-runnable ; no-op sur une DB qui l'a déjà.
-- REVERSIBLE : DROP FUNCTION api.get_object_jsonld(text,text); DROP TABLE public.ref_interop_crosswalk;
-- Voir docs/api-audit/2026-06-30-api-fix-plan.md (I4) + lot1_mapping_decisions.md §136.

BEGIN;

-- ─── 1. Crosswalk table (profile-keyed, table-driven — the I4 « no hardcode » invariant) ───
CREATE TABLE IF NOT EXISTS public.ref_interop_crosswalk (
  profile      TEXT        NOT NULL,      -- 'jsonld' (schema.org) | future 'datatourisme'|'apidae'|'tourinsoft'
  object_type  object_type NOT NULL,
  target_class TEXT        NOT NULL,      -- target vocabulary class, e.g. schema.org 'Hotel'
  context_url  TEXT,                      -- profile @context (schema.org: 'https://schema.org'); NULL for non-JSON-LD profiles
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  PRIMARY KEY (profile, object_type)
);

COMMENT ON TABLE public.ref_interop_crosswalk IS
  'Interop crosswalk (audit API I4): object_type -> target vocabulary class per export profile. '
  'Table-driven so a new type mapping / a new profile is a seed, never a code change. Consumed by '
  'api.get_object_jsonld. Values are PO-tunable business/SEO choices. See lot1_mapping_decisions.md §136.';

-- Seed BEFORE enabling RLS (so the seed is not gated). Profile 'jsonld' = schema.org, 19 types.
INSERT INTO public.ref_interop_crosswalk (profile, object_type, target_class, context_url) VALUES
  ('jsonld', 'HOT',  'Hotel',              'https://schema.org'),
  ('jsonld', 'HLO',  'LodgingBusiness',    'https://schema.org'),
  ('jsonld', 'HPA',  'Campground',         'https://schema.org'),
  ('jsonld', 'CAMP', 'Campground',         'https://schema.org'),
  ('jsonld', 'RVA',  'LodgingBusiness',    'https://schema.org'),
  ('jsonld', 'RES',  'Restaurant',         'https://schema.org'),
  ('jsonld', 'ASC',  'TouristAttraction',  'https://schema.org'),
  ('jsonld', 'ACT',  'TouristAttraction',  'https://schema.org'),
  ('jsonld', 'ITI',  'TouristTrip',        'https://schema.org'),
  ('jsonld', 'FMA',  'Event',              'https://schema.org'),
  ('jsonld', 'LOI',  'TouristAttraction',  'https://schema.org'),
  ('jsonld', 'PCU',  'TouristAttraction',  'https://schema.org'),
  ('jsonld', 'PNA',  'TouristAttraction',  'https://schema.org'),
  ('jsonld', 'PRD',  'LocalBusiness',      'https://schema.org'),
  ('jsonld', 'PSV',  'LocalBusiness',      'https://schema.org'),
  ('jsonld', 'VIL',  'TouristDestination', 'https://schema.org'),
  ('jsonld', 'COM',  'Store',              'https://schema.org'),
  ('jsonld', 'SPU',  'CivicStructure',     'https://schema.org'),
  ('jsonld', 'ORG',  'Organization',       'https://schema.org')
ON CONFLICT (profile, object_type) DO UPDATE
  SET target_class = EXCLUDED.target_class,
      context_url  = EXCLUDED.context_url,
      is_active    = true;

-- RLS: house ref_* pair (pub-read + admin/superuser write). The USING(true) read short-circuits
-- the permissive OR, so anon SELECT never evaluates the admin predicate (no P0.3 EXECUTE grant on
-- api.is_platform_superuser needed). auth.role() wrapped as (select …) per §39.
ALTER TABLE public.ref_interop_crosswalk ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_interop_crosswalk_read" ON public.ref_interop_crosswalk;
CREATE POLICY "pub_ref_interop_crosswalk_read" ON public.ref_interop_crosswalk
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_interop_crosswalk" ON public.ref_interop_crosswalk;
CREATE POLICY "admin_write_ref_interop_crosswalk" ON public.ref_interop_crosswalk
  FOR ALL USING (
    (select auth.role()) = 'service_role'
    OR (select auth.role()) = 'admin'
    OR api.is_platform_superuser()
  );

-- ─── 2. schema.org JSON-LD serializer (published-gated, public-only, service-role-only) ───
CREATE OR REPLACE FUNCTION api.get_object_jsonld(p_object_id text, p_profile text DEFAULT 'jsonld')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_type    object_type;
  v_name    text;
  v_image   text;
  v_class   text;
  v_context text;
  v_desc    text;
  v_addr    jsonb;
  v_geo     jsonb;
  v_phone   text;
  v_email   text;
  v_url     text;
  v_sameas  jsonb;
BEGIN
  -- Published gate (defense in depth: the gateway runs service-role, which bypasses RLS).
  SELECT o.object_type, o.name, o.cached_main_image_url
    INTO v_type, v_name, v_image
  FROM object o
  WHERE o.id = p_object_id AND o.status = 'published';
  IF NOT FOUND THEN
    RETURN NULL;                        -- unknown OR unpublished => indistinguishable NULL
  END IF;

  -- Crosswalk is TABLE-DRIVEN. Unmapped (profile, type) => NULL (never a hardcoded fallback).
  SELECT x.target_class, x.context_url
    INTO v_class, v_context
  FROM public.ref_interop_crosswalk x
  WHERE x.profile = p_profile AND x.object_type = v_type AND x.is_active
  LIMIT 1;
  IF v_class IS NULL THEN
    RETURN NULL;
  END IF;

  -- Canonical public description, plain text (strip Markdown per §106). FR at launch (FR-fallback).
  SELECT COALESCE(api.strip_markdown(api.i18n_pick(d.description_i18n, 'fr', 'fr')), d.description)
    INTO v_desc
  FROM object_description d
  WHERE d.object_id = p_object_id
    AND d.org_object_id IS NULL
    AND (d.visibility IS NULL OR d.visibility = 'public')
  ORDER BY d.created_at DESC, d.id
  LIMIT 1;

  -- Main location -> schema.org PostalAddress + GeoCoordinates.
  -- ponytail: addressRegion/addressCountry are the platform scope (OTI Sud = La Réunion / France),
  -- a documented business fact, not the crosswalk. Ceiling: single-region; upgrade path = derive
  -- from code_insee/region_code if the SIT ever spans more than La Réunion.
  SELECT
    CASE WHEN (ol.address1 IS NOT NULL OR ol.city IS NOT NULL OR ol.postcode IS NOT NULL) THEN
      jsonb_strip_nulls(jsonb_build_object(
        '@type',           'PostalAddress',
        'streetAddress',   NULLIF(btrim(concat_ws(', ', ol.address1, ol.address2, ol.address3)), ''),
        'postalCode',      ol.postcode,
        'addressLocality', ol.city,
        'addressRegion',   'La Réunion',
        'addressCountry',  'FR'
      ))
    END,
    CASE WHEN (ol.latitude IS NOT NULL AND ol.longitude IS NOT NULL) THEN
      jsonb_build_object('@type', 'GeoCoordinates', 'latitude', ol.latitude, 'longitude', ol.longitude)
    END
    INTO v_addr, v_geo
  FROM object_location ol
  WHERE ol.object_id = p_object_id
  ORDER BY ol.is_main_location DESC NULLS LAST, ol.position NULLS LAST, ol.created_at
  LIMIT 1;

  -- Public contacts (is_public only). telephone: phone, fallback mobile.
  SELECT c.value INTO v_phone
  FROM contact_channel c JOIN ref_code_contact_kind ck ON ck.id = c.kind_id
  WHERE c.object_id = p_object_id AND c.is_public = TRUE AND lower(ck.code) IN ('phone', 'mobile')
  ORDER BY (lower(ck.code) = 'phone') DESC, c.is_primary DESC, c.position NULLS LAST
  LIMIT 1;

  SELECT c.value INTO v_email
  FROM contact_channel c JOIN ref_code_contact_kind ck ON ck.id = c.kind_id
  WHERE c.object_id = p_object_id AND c.is_public = TRUE AND lower(ck.code) = 'email'
  ORDER BY c.is_primary DESC, c.position NULLS LAST
  LIMIT 1;

  -- url = official website (http/https only — SEC-7 allowlist spirit; schemeless entries dropped).
  SELECT c.value INTO v_url
  FROM contact_channel c JOIN ref_code_contact_kind ck ON ck.id = c.kind_id
  WHERE c.object_id = p_object_id AND c.is_public = TRUE AND lower(ck.code) = 'website'
    AND c.value ~* '^https?://'
  ORDER BY c.is_primary DESC, c.position NULLS LAST
  LIMIT 1;

  -- sameAs: public web channels (social + OTA) as an http/https URL array.
  SELECT jsonb_agg(wc.value ORDER BY wc.position NULLS LAST, wc.created_at)
    INTO v_sameas
  FROM object_web_channel wc
  WHERE wc.object_id = p_object_id AND wc.is_public = TRUE AND wc.value ~* '^https?://';

  RETURN jsonb_strip_nulls(jsonb_build_object(
    '@context',    v_context,
    '@type',       v_class,
    '@id',         'urn:bertel:object:' || p_object_id,
    'identifier',  p_object_id,
    'name',        v_name,
    'description', v_desc,
    'image',       v_image,
    'url',         v_url,
    'telephone',   v_phone,
    'email',       v_email,
    'address',     v_addr,
    'geo',         v_geo,
    'sameAs',      v_sameas
  ));
END;
$$;

COMMENT ON FUNCTION api.get_object_jsonld(text, text) IS
  'Partner JSON-LD serializer (audit API I4): schema.org output for a PUBLISHED object, @type from '
  'ref_interop_crosswalk (table-driven), public-only contacts/media/web-channels, plain-text '
  'description (strip_markdown). service_role-only; unmapped/unpublished => NULL. §136.';

REVOKE ALL ON FUNCTION api.get_object_jsonld(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_object_jsonld(text, text) TO service_role;

COMMIT;
