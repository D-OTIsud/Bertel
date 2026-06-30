-- migration_reference_catalog_rpc.sql
-- Audit API — Phase 1, chantier I1 (endpoint catalogue de référentiels).
--
-- PROBLÈME : aujourd'hui, pour mapper un code (« wifi » → son code interne, un label,
-- une cuisine, une commune…), un consommateur doit (a) découvrir la liste des `domain`
-- et (b) taper des tables `ref_*` brutes hétérogènes en PostgREST direct (couplage au
-- schéma physique, i18n non résolu). Aucune surface API stable de découverte.
--
-- SOLUTION : 2 RPC anon-callable, SECURITY INVOKER (les `ref_*` sont déjà lisibles anon
-- via USING(true)), i18n résolu côté serveur, forme uniforme :
--   { code, name, icon_url, parent_code, domain }
--   * api.list_catalog(p_domain, p_lang)            → tableau JSONB d'un référentiel
--   * api.list_reference_bundle(p_domains, p_lang)  → objet JSONB { domain: [...] }
--   * api.public_catalog_domains()                  → liste des domaines publics (découverte)
--
-- WHITELIST (default-deny) : seuls les vocabulaires PUBLICS descriptifs d'objet sont
-- exposés. Les domaines `ref_code` internes/CRM (crm_sentiment, demand_topic, mood,
-- feedback_type, booking_status, membership_*, distribution_channel, client_type) sont
-- VOLONTAIREMENT exclus — un nouveau domaine n'est pas exposé tant qu'il n'est pas
-- ajouté ici. (Note : anon peut déjà lire ces tables en direct ; la whitelist sert la
-- propreté du contrat public et le futur verrouillage des lectures directes — Q1b.)
--
-- COUVERTURE : 59 domaines `ref_code` (19 taxonomies + 40 vocabulaires plats) + 6 tables
-- `ref_*` séparées à forme propre (amenity, classification_scheme = labels/distinctions,
-- language, commune, sustainability_action, sustainability_category).
-- DIFFÉRÉ (I1b, ajout trivial à la demande) : classification_value (couplé au schéma),
-- capacity_metric, tag, legal_type.
--
-- SECURITY INVOKER + STABLE + search_path figé. Idempotent (CREATE OR REPLACE).

BEGIN;

-- ── Whitelist des domaines publics (source unique) ──────────────────────────────
-- IMMUTABLE : constante. Exposée (anon) pour permettre la découverte des catalogues.
CREATE OR REPLACE FUNCTION api.public_catalog_domains()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = api, public, extensions
AS $$
  SELECT ARRAY[
    -- ── 40 vocabulaires plats descriptifs (ref_code) ──
    'accommodation_type','activity_type','allergen','amenity_family','assistance_type',
    'bed_type','contact_kind','cuisine_type','destination_type','dietary_tag',
    'document_type','environment_tag','event_type','insurance_type','iti_difficulty',
    'iti_open_status','iti_practice','iti_stage_kind','language_level','media_tag',
    'media_type','meeting_equipment','menu_category','opening_period_type',
    'opening_schedule_type','package_type','partnership_type','payment_method',
    'price_kind','price_type','price_unit','promotion_type','room_type','season_type',
    'service_type','social_network','tourism_type','transport_type','view_type','weekday',
    -- ── 19 taxonomies hiérarchiques (ref_code) ──
    'taxonomy_act','taxonomy_asc','taxonomy_camp','taxonomy_com','taxonomy_fma',
    'taxonomy_hlo','taxonomy_hot','taxonomy_hpa','taxonomy_iti','taxonomy_loi',
    'taxonomy_org','taxonomy_pcu','taxonomy_pna','taxonomy_prd','taxonomy_psv',
    'taxonomy_res','taxonomy_rva','taxonomy_spu','taxonomy_vil',
    -- ── 6 tables ref_* séparées (forme propre, gérées en branches) ──
    'amenity','classification_scheme','language','commune',
    'sustainability_action','sustainability_category'
  ]::text[];
$$;

COMMENT ON FUNCTION api.public_catalog_domains() IS
  'Liste des domaines de référentiel exposés publiquement par api.list_catalog (whitelist default-deny). Audit API I1.';

-- ── Un référentiel, forme uniforme {code,name,icon_url,parent_code,domain} ───────
CREATE OR REPLACE FUNCTION api.list_catalog(p_domain text, p_lang text DEFAULT 'fr')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_domain IS NULL THEN
    RAISE EXCEPTION 'p_domain is required' USING ERRCODE = '22023';
  END IF;

  IF p_domain = 'amenity' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', a.code,
             'name', COALESCE(api.i18n_pick(a.name_i18n, p_lang, 'fr'), a.name),
             'icon_url', a.icon_url,
             'parent_code', f.code,          -- famille (ref_code domaine amenity_family)
             'domain', 'amenity'
           ) ORDER BY a.position NULLS LAST, a.code), '[]'::jsonb)
    INTO v_result
    FROM ref_amenity a
    LEFT JOIN ref_code f ON f.id = a.family_id;

  ELSIF p_domain = 'classification_scheme' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', s.code,
             'name', COALESCE(api.i18n_pick(s.name_i18n, p_lang, 'fr'), s.name),
             'icon_url', s.icon_url,
             'parent_code', NULL,
             'domain', 'classification_scheme'
           ) ORDER BY s.position NULLS LAST, s.code), '[]'::jsonb)
    INTO v_result
    FROM ref_classification_scheme s;

  ELSIF p_domain = 'language' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', l.code,
             'name', l.name,                 -- pas de colonne i18n
             'icon_url', l.icon_url,
             'parent_code', NULL,
             'domain', 'language'
           ) ORDER BY l.position NULLS LAST, l.code), '[]'::jsonb)
    INTO v_result
    FROM ref_language l;

  ELSIF p_domain = 'commune' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', c.insee_code,
             'name', c.name,
             'icon_url', NULL,
             'parent_code', NULL,
             'domain', 'commune'
           ) ORDER BY c.position NULLS LAST, c.name), '[]'::jsonb)
    INTO v_result
    FROM ref_commune c
    WHERE c.is_active;

  ELSIF p_domain = 'sustainability_action' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', a.code,
             'name', COALESCE(api.i18n_pick(a.label_i18n, p_lang, 'fr'), a.label),  -- colonne 'label'
             'icon_url', a.icon_url,
             'parent_code', cat.code,        -- catégorie de durabilité
             'domain', 'sustainability_action'
           ) ORDER BY a.position NULLS LAST, a.code), '[]'::jsonb)
    INTO v_result
    FROM ref_sustainability_action a
    LEFT JOIN ref_sustainability_action_category cat ON cat.id = a.category_id;

  ELSIF p_domain = 'sustainability_category' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', c.code,
             'name', COALESCE(api.i18n_pick(c.name_i18n, p_lang, 'fr'), c.name),
             'icon_url', c.icon_url,
             'parent_code', NULL,
             'domain', 'sustainability_category'
           ) ORDER BY c.position NULLS LAST, c.code), '[]'::jsonb)
    INTO v_result
    FROM ref_sustainability_action_category c;

  ELSIF p_domain = ANY(api.public_catalog_domains()) THEN
    -- Chemin uniforme ref_code (domaines plats + taxonomies). Les 6 spéciaux sont
    -- déjà capturés ci-dessus, donc ici p_domain est forcément un domaine ref_code.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', c.code,
             'name', COALESCE(api.i18n_pick(c.name_i18n, p_lang, 'fr'), c.name),
             'icon_url', c.icon_url,
             'parent_code', par.code,        -- parent hiérarchique (taxonomies)
             'domain', c.domain
           ) ORDER BY c.position NULLS LAST, c.code), '[]'::jsonb)
    INTO v_result
    FROM ref_code c
    LEFT JOIN ref_code par ON par.id = c.parent_id
    WHERE c.domain = p_domain
      AND c.is_active
      AND (c.valid_from IS NULL OR c.valid_from <= current_date)
      AND (c.valid_to   IS NULL OR c.valid_to   >= current_date);

  ELSE
    RAISE EXCEPTION 'Unknown or non-public catalog domain: %', p_domain
      USING ERRCODE = '22023',
            HINT = 'Call api.public_catalog_domains() for the list of exposed catalogs.';
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION api.list_catalog(text, text) IS
  'Un référentiel public résolu i18n, forme {code,name,icon_url,parent_code,domain}. Audit API I1.';

-- ── Plusieurs référentiels d'un coup → objet { domain: [...] } ───────────────────
-- p_domains NULL ⇒ tous les domaines publics. Les domaines inconnus/non-publics sont
-- silencieusement ignorés (un bundle est une commodité ; list_catalog reste strict).
CREATE OR REPLACE FUNCTION api.list_reference_bundle(p_domains text[] DEFAULT NULL, p_lang text DEFAULT 'fr')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_domains text[];
  v_domain  text;
  v_result  jsonb := '{}'::jsonb;
BEGIN
  IF p_domains IS NULL THEN
    v_domains := api.public_catalog_domains();
  ELSE
    -- intersection avec la whitelist (ignore les domaines inconnus / non-publics)
    SELECT array_agg(d) INTO v_domains
    FROM unnest(p_domains) d
    WHERE d = ANY(api.public_catalog_domains());
  END IF;

  IF v_domains IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  FOREACH v_domain IN ARRAY v_domains LOOP
    v_result := v_result || jsonb_build_object(v_domain, api.list_catalog(v_domain, p_lang));
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION api.list_reference_bundle(text[], text) IS
  'Plusieurs référentiels publics en un appel → { domain: [...] }. p_domains NULL = tous. Audit API I1.';

-- ── Grants : surface publique de lecture ────────────────────────────────────────
GRANT EXECUTE ON FUNCTION api.public_catalog_domains()              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_catalog(text, text)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_reference_bundle(text[], text)  TO anon, authenticated, service_role;

COMMIT;
