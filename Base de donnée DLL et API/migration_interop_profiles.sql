-- migration_interop_profiles.sql
-- Audit API — Phase 2, chantier I4 (suite) : les 3 profils d'interop restants
--   'datatourisme' (RDF/JSON-LD national), 'apidae' (JSON régional), 'tourinsoft' (syndication SIT).
--
-- CONTEXTE : §136 a livré le profil schema.org ('jsonld') via `ref_interop_crosswalk`
-- (mapping object_type -> classe cible, table-driven) + `api.get_object_jsonld`. INVARIANT §136 :
-- « un nouveau profil = un seed dans ref_interop_crosswalk + une branche de sérialisation ; le
-- crosswalk n'automatise QUE type->classe, pas la forme (les formats diffèrent réellement) ».
--
-- CETTE PASSE applique exactement cet invariant pour les 3 formats :
--   1. Seeds `ref_interop_crosswalk` pour les 3 profils (19 object_type chacun). Valeurs =
--      vocabulaire de TYPE de chaque standard (classes DATAtourisme / types APIDAE / bordereaux
--      Tourinsoft), PO-ajustables car en table. context_url = @vocab pour datatourisme (JSON-LD),
--      NULL pour apidae/tourinsoft (pas du JSON-LD).
--   2. `api.interop_object_core(text)` : helper PARTAGÉ (DRY) — lit UNE fois le cœur gaté d'une
--      fiche publiée (published + visibilité/is_public public), renvoie un jsonb plat
--      {type,name,description,image,street,postcode,city,lat,lng,phone,email,url,sameas}. Réutilise
--      strip_markdown (§106) et les mêmes filtres public-only que get_object_jsonld.
--   3. `api.get_object_interop(text, text)` : dispatcher — published-gate, lookup crosswalk
--      (unmapped -> NULL), core, puis CASE profile construit le document au format cible.
--      SECURITY INVOKER + service_role-only (la passerelle appelle service-role qui bypasse la RLS ;
--      self-gate published = défense en profondeur, comme get_object_jsonld/§136).
--
-- PÉRIMÈTRE HONNÊTE : ces sérialiseurs émettent la STRUCTURE DE TÊTE et le VOCABULAIRE DE TYPE
-- corrects de chaque standard, couvrant les champs CŒUR (type/classe, nom, description texte-propre,
-- adresse, géo, contacts publics, image, sameAs). La conformité FIELD-À-FIELD à l'importeur cible
-- (DATAtourisme / plateforme APIDAE / SIT Tourinsoft régional) doit être validée contre cet
-- importeur avant une synchro de production — chaque plateforme a des centaines de champs et des
-- conventions régionales (Tourinsoft surtout). C'est un socle interopérable, pas un export certifié.
--
-- get_object_jsonld (§136) N'EST PAS TOUCHÉE (Approche A, garde §103). La route ajoute
-- ?format=datatourisme|apidae|tourinsoft -> clé additive data.<format> (comme data.jsonld).
--
-- PRÉREQUIS : migration_object_jsonld_schemaorg.sql (I4 — table ref_interop_crosswalk) ;
--   api_views_functions.sql (api.strip_markdown/i18n_pick) ; schema_unified.sql (tables cœur).
--   APPLIQUER APRÈS I4 — manifest step I4b (ci_fresh_apply.sql).
-- IDEMPOTENT : seed ON CONFLICT DO UPDATE ; CREATE OR REPLACE FUNCTION.
-- REVERSIBLE : DROP FUNCTION api.get_object_interop(text,text), api.interop_object_core(text);
--   DELETE FROM public.ref_interop_crosswalk WHERE profile IN ('datatourisme','apidae','tourinsoft');
-- Voir docs/api-audit/2026-06-30-api-fix-plan.md (I4) + lot1_mapping_decisions.md §137.

BEGIN;

-- ─── 1. Crosswalk seeds : 3 profils × 19 object_type (type -> classe/type/bordereau cible) ───
INSERT INTO public.ref_interop_crosswalk (profile, object_type, target_class, context_url) VALUES
  -- DATAtourisme : classes de l'ontologie nationale (émises en @type ["PointOfInterest", <classe>]).
  ('datatourisme', 'HOT',  'Accommodation',         'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'HLO',  'Accommodation',         'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'HPA',  'Accommodation',         'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'CAMP', 'Accommodation',         'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'RVA',  'Accommodation',         'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'RES',  'FoodEstablishment',     'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'ASC',  'SportsAndLeisurePlace', 'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'ACT',  'SportsAndLeisurePlace', 'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'LOI',  'SportsAndLeisurePlace', 'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'PCU',  'CulturalSite',          'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'PNA',  'NaturalHeritage',       'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'VIL',  'PlaceOfInterest',       'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'ITI',  'Tour',                  'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'FMA',  'EntertainmentAndEvent', 'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'PRD',  'PlaceOfInterest',       'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'COM',  'Store',                 'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'PSV',  'PlaceOfInterest',       'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'SPU',  'PlaceOfInterest',       'https://www.datatourisme.fr/ontology/core#'),
  ('datatourisme', 'ORG',  'PlaceOfInterest',       'https://www.datatourisme.fr/ontology/core#'),
  -- APIDAE : types d'objet touristique de la plateforme régionale.
  ('apidae', 'HOT',  'HOTELLERIE',           NULL),
  ('apidae', 'HLO',  'HEBERGEMENT_LOCATIF',  NULL),
  ('apidae', 'HPA',  'HOTELLERIE_PLEIN_AIR', NULL),
  ('apidae', 'CAMP', 'HOTELLERIE_PLEIN_AIR', NULL),
  ('apidae', 'RVA',  'HEBERGEMENT_LOCATIF',  NULL),
  ('apidae', 'RES',  'RESTAURATION',         NULL),
  ('apidae', 'ASC',  'ACTIVITE',             NULL),
  ('apidae', 'ACT',  'ACTIVITE',             NULL),
  ('apidae', 'LOI',  'EQUIPEMENT',           NULL),
  ('apidae', 'PCU',  'PATRIMOINE_CULTUREL',  NULL),
  ('apidae', 'PNA',  'PATRIMOINE_NATUREL',   NULL),
  ('apidae', 'VIL',  'TERRITOIRE',           NULL),
  ('apidae', 'ITI',  'ACTIVITE',             NULL),
  ('apidae', 'FMA',  'FETE_ET_MANIFESTATION',NULL),
  ('apidae', 'PRD',  'DEGUSTATION',          NULL),
  ('apidae', 'COM',  'COMMERCE_ET_SERVICE',  NULL),
  ('apidae', 'PSV',  'COMMERCE_ET_SERVICE',  NULL),
  ('apidae', 'SPU',  'COMMERCE_ET_SERVICE',  NULL),
  ('apidae', 'ORG',  'STRUCTURE',            NULL),
  -- Tourinsoft : bordereaux SIT. Les codes Bertel SONT de lignée Tourinsoft ⇒ quasi-identité.
  ('tourinsoft', 'HOT',  'HOT', NULL),
  ('tourinsoft', 'HLO',  'HLO', NULL),
  ('tourinsoft', 'HPA',  'HPA', NULL),
  ('tourinsoft', 'CAMP', 'HPA', NULL),
  ('tourinsoft', 'RVA',  'HLO', NULL),
  ('tourinsoft', 'RES',  'RES', NULL),
  ('tourinsoft', 'ASC',  'ASC', NULL),
  ('tourinsoft', 'ACT',  'ASC', NULL),
  ('tourinsoft', 'LOI',  'ASC', NULL),
  ('tourinsoft', 'PCU',  'PCU', NULL),
  ('tourinsoft', 'PNA',  'PNA', NULL),
  ('tourinsoft', 'VIL',  'VIL', NULL),
  ('tourinsoft', 'ITI',  'ITI', NULL),
  ('tourinsoft', 'FMA',  'FMA', NULL),
  ('tourinsoft', 'PRD',  'DEG', NULL),
  ('tourinsoft', 'COM',  'COM', NULL),
  ('tourinsoft', 'PSV',  'COM', NULL),
  ('tourinsoft', 'SPU',  'COM', NULL),
  ('tourinsoft', 'ORG',  'ORG', NULL)
ON CONFLICT (profile, object_type) DO UPDATE
  SET target_class = EXCLUDED.target_class,
      context_url  = EXCLUDED.context_url,
      is_active    = true;

-- ─── 2. Shared core reader (published + public-gated), returned as a flat jsonb (DRY) ───
CREATE OR REPLACE FUNCTION api.interop_object_core(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_type   object_type;
  v_name   text;
  v_image  text;
  v_desc   text;
  v_street text;
  v_pc     text;
  v_city   text;
  v_lat    numeric;
  v_lng    numeric;
  v_phone  text;
  v_email  text;
  v_url    text;
  v_sameas jsonb;
BEGIN
  SELECT o.object_type, o.name, o.cached_main_image_url
    INTO v_type, v_name, v_image
  FROM object o
  WHERE o.id = p_object_id AND o.status = 'published';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(api.strip_markdown(api.i18n_pick(d.description_i18n, 'fr', 'fr')), d.description)
    INTO v_desc
  FROM object_description d
  WHERE d.object_id = p_object_id AND d.org_object_id IS NULL
    AND (d.visibility IS NULL OR d.visibility = 'public')
  ORDER BY d.created_at DESC, d.id
  LIMIT 1;

  SELECT NULLIF(btrim(concat_ws(', ', ol.address1, ol.address2, ol.address3)), ''),
         ol.postcode, ol.city, ol.latitude, ol.longitude
    INTO v_street, v_pc, v_city, v_lat, v_lng
  FROM object_location ol
  WHERE ol.object_id = p_object_id
  ORDER BY ol.is_main_location DESC NULLS LAST, ol.position NULLS LAST, ol.created_at
  LIMIT 1;

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

  SELECT c.value INTO v_url
  FROM contact_channel c JOIN ref_code_contact_kind ck ON ck.id = c.kind_id
  WHERE c.object_id = p_object_id AND c.is_public = TRUE AND lower(ck.code) = 'website'
    AND c.value ~* '^https?://'
  ORDER BY c.is_primary DESC, c.position NULLS LAST
  LIMIT 1;

  SELECT jsonb_agg(wc.value ORDER BY wc.position NULLS LAST, wc.created_at)
    INTO v_sameas
  FROM object_web_channel wc
  WHERE wc.object_id = p_object_id AND wc.is_public = TRUE AND wc.value ~* '^https?://';

  RETURN jsonb_build_object(
    'type', v_type, 'name', v_name, 'description', v_desc, 'image', v_image,
    'street', v_street, 'postcode', v_pc, 'city', v_city, 'lat', v_lat, 'lng', v_lng,
    'phone', v_phone, 'email', v_email, 'url', v_url, 'sameas', v_sameas
  );
END;
$$;

COMMENT ON FUNCTION api.interop_object_core(text) IS
  'Shared interop core reader (audit API I4): flat gated core of a PUBLISHED object '
  '(public-only contacts/media/web, strip_markdown description) for the profile serializers. §137.';

REVOKE ALL ON FUNCTION api.interop_object_core(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.interop_object_core(text) TO service_role;

-- ─── 3. Profile dispatcher : datatourisme (JSON-LD) / apidae / tourinsoft (bespoke JSON) ───
CREATE OR REPLACE FUNCTION api.get_object_interop(p_object_id text, p_profile text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_type  object_type;
  v_class text;
  v_ctx   text;
  c       jsonb;
  v_lat   numeric;
  v_lng   numeric;
BEGIN
  SELECT o.object_type INTO v_type
  FROM object o WHERE o.id = p_object_id AND o.status = 'published';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT x.target_class, x.context_url INTO v_class, v_ctx
  FROM public.ref_interop_crosswalk x
  WHERE x.profile = p_profile AND x.object_type = v_type AND x.is_active
  LIMIT 1;
  IF v_class IS NULL THEN
    RETURN NULL;                       -- unmapped (profile, type) => NULL, never a hardcoded fallback
  END IF;

  c := api.interop_object_core(p_object_id);
  IF c IS NULL THEN
    RETURN NULL;
  END IF;
  v_lat := (c->>'lat')::numeric;
  v_lng := (c->>'lng')::numeric;

  IF p_profile = 'datatourisme' THEN
    -- RDF/JSON-LD national. @type = ["PointOfInterest", <classe ontologie>].
    RETURN jsonb_strip_nulls(jsonb_build_object(
      '@context', jsonb_build_object(
        '@vocab', v_ctx,
        'rdfs',   'http://www.w3.org/2000/01/rdf-schema#',
        'schema', 'http://schema.org/',
        'dc',     'http://purl.org/dc/elements/1.1/',
        'foaf',   'http://xmlns.com/foaf/0.1/'),
      '@id',           'urn:bertel:object:' || p_object_id,
      'dc:identifier', p_object_id,
      '@type',         jsonb_build_array('PointOfInterest', v_class),
      'rdfs:label',    jsonb_build_array(jsonb_build_object('@language', 'fr', '@value', c->>'name')),
      'hasDescription', CASE WHEN c->>'description' IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
          '@type', 'Description',
          'dc:description', jsonb_build_array(jsonb_build_object('@language', 'fr', '@value', c->>'description')))) END,
      'isLocatedAt', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          '@type', 'schema:Place',
          'schema:address', CASE WHEN (c->>'street' IS NOT NULL OR c->>'city' IS NOT NULL OR c->>'postcode' IS NOT NULL)
             THEN jsonb_strip_nulls(jsonb_build_object(
                '@type', 'schema:PostalAddress',
                'schema:streetAddress',   c->>'street',
                'schema:postalCode',      c->>'postcode',
                'schema:addressLocality', c->>'city',
                'schema:addressCountry',  'FR')) END,
          'schema:geo', CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
             THEN jsonb_build_object('@type', 'schema:GeoCoordinates', 'schema:latitude', v_lat, 'schema:longitude', v_lng) END))),
      'hasContact', CASE WHEN (c->>'phone' IS NOT NULL OR c->>'email' IS NOT NULL OR c->>'url' IS NOT NULL)
         THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            '@type', 'schema:Organization',
            'schema:telephone', c->>'phone',
            'schema:email',     c->>'email',
            'foaf:homepage',    c->>'url'))) END,
      'hasMainRepresentation', CASE WHEN c->>'image' IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
            '@type', 'schema:ImageObject', 'schema:contentUrl', c->>'image')) END
    ));

  ELSIF p_profile = 'apidae' THEN
    -- JSON régional propriétaire.
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'identifier', p_object_id,
      'type',       v_class,
      'nom',        jsonb_build_object('libelleFr', c->>'name'),
      'presentation', CASE WHEN c->>'description' IS NOT NULL
         THEN jsonb_build_object('descriptifCourt', jsonb_build_object('libelleFr', c->>'description')) END,
      'localisation', jsonb_strip_nulls(jsonb_build_object(
          'adresse', CASE WHEN (c->>'street' IS NOT NULL OR c->>'city' IS NOT NULL OR c->>'postcode' IS NOT NULL)
             THEN jsonb_strip_nulls(jsonb_build_object(
                'adresse1',   c->>'street',
                'codePostal', c->>'postcode',
                'commune',    CASE WHEN c->>'city' IS NOT NULL THEN jsonb_build_object('nom', c->>'city') END)) END,
          'geolocalisation', CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
             THEN jsonb_build_object('valide', true, 'geoJson', jsonb_build_object(
                'type', 'Point', 'coordinates', jsonb_build_array(v_lng, v_lat))) END)),
      'informations', CASE WHEN (c->>'phone' IS NOT NULL OR c->>'email' IS NOT NULL OR c->>'url' IS NOT NULL)
         THEN jsonb_build_object('moyensCommunication', (
            SELECT jsonb_agg(m) FROM (
              SELECT jsonb_build_object('type', jsonb_build_object('libelleFr', 'Téléphone'),
                     'coordonnees', jsonb_build_object('fr', c->>'phone')) AS m WHERE c->>'phone' IS NOT NULL
              UNION ALL
              SELECT jsonb_build_object('type', jsonb_build_object('libelleFr', 'Mél'),
                     'coordonnees', jsonb_build_object('fr', c->>'email')) WHERE c->>'email' IS NOT NULL
              UNION ALL
              SELECT jsonb_build_object('type', jsonb_build_object('libelleFr', 'Site web'),
                     'coordonnees', jsonb_build_object('fr', c->>'url')) WHERE c->>'url' IS NOT NULL
            ) s)) END,
      'illustrations', CASE WHEN c->>'image' IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
          'traductionFichiers', jsonb_build_array(jsonb_build_object('url', c->>'image')))) END
    ));

  ELSIF p_profile = 'tourinsoft' THEN
    -- Enregistrement fielded de syndication SIT (Bertel.id = SyndObjectID de lignée Tourinsoft).
    RETURN jsonb_strip_nulls(jsonb_build_object(
      'SyndObjectID', p_object_id,
      'type',         v_class,
      'NomOffre',     c->>'name',
      'Descriptif',   c->>'description',
      'Adresse1',     c->>'street',
      'CodePostal',   c->>'postcode',
      'Commune',      c->>'city',
      'Latitude',     v_lat,
      'Longitude',    v_lng,
      'Telephone',    c->>'phone',
      'Mel',          c->>'email',
      'SiteWeb',      c->>'url',
      'Photo',        c->>'image'
    ));

  ELSE
    RETURN NULL;                        -- unknown/unsupported profile
  END IF;
END;
$$;

COMMENT ON FUNCTION api.get_object_interop(text, text) IS
  'Partner interop serializer (audit API I4 §137): datatourisme (JSON-LD) / apidae / tourinsoft '
  '(bespoke JSON) document for a PUBLISHED object; @type/class from ref_interop_crosswalk (table-driven), '
  'core via api.interop_object_core (public-only). service_role-only; unmapped/unpublished/unknown-profile => NULL. '
  'Core-fields subset — validate field-level conformance against the target importer before production sync.';

REVOKE ALL ON FUNCTION api.get_object_interop(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_object_interop(text, text) TO service_role;

COMMIT;
