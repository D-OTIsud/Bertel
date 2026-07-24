-- Transactional body for §190 DATAtourisme leaf-aware crosswalk.
-- Caller owns the transaction. Requires the target HLO taxonomy nodes.

ALTER TABLE public.ref_interop_crosswalk
  ADD COLUMN IF NOT EXISTS taxonomy_domain TEXT,
  ADD COLUMN IF NOT EXISTS taxonomy_code TEXT;

ALTER TABLE public.ref_interop_crosswalk
  DROP CONSTRAINT IF EXISTS ref_interop_crosswalk_pkey;

DO $crosswalk_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ref_interop_crosswalk'::regclass
      AND conname = 'chk_ref_interop_crosswalk_taxonomy_pair'
  ) THEN
    ALTER TABLE public.ref_interop_crosswalk
      ADD CONSTRAINT chk_ref_interop_crosswalk_taxonomy_pair
      CHECK ((taxonomy_domain IS NULL) = (taxonomy_code IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ref_interop_crosswalk'::regclass
      AND conname = 'fk_ref_interop_crosswalk_taxonomy_code'
  ) THEN
    ALTER TABLE public.ref_interop_crosswalk
      ADD CONSTRAINT fk_ref_interop_crosswalk_taxonomy_code
      FOREIGN KEY (taxonomy_domain, taxonomy_code)
      REFERENCES public.ref_code(domain, code)
      ON DELETE RESTRICT;
  END IF;
END
$crosswalk_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_interop_crosswalk_type_default
  ON public.ref_interop_crosswalk(profile, object_type)
  WHERE taxonomy_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_interop_crosswalk_taxonomy
  ON public.ref_interop_crosswalk(profile, object_type, taxonomy_domain, taxonomy_code)
  WHERE taxonomy_code IS NOT NULL;

INSERT INTO public.ref_interop_crosswalk (
  profile, object_type, taxonomy_domain, taxonomy_code,
  target_class, context_url, is_active
) VALUES
  ('datatourisme', 'HLO', 'taxonomy_hlo', 'chambre_d_hotes',
   'Guesthouse', 'https://www.datatourisme.fr/ontology/core#', TRUE),
  ('datatourisme', 'HLO', 'taxonomy_hlo', 'location_saisonniere',
   'SelfCateringAccommodation', 'https://www.datatourisme.fr/ontology/core#', TRUE),
  ('datatourisme', 'HLO', 'taxonomy_hlo', 'hebergement_collectif',
   'GroupLodging', 'https://www.datatourisme.fr/ontology/core#', TRUE),
  ('datatourisme', 'HLO', 'taxonomy_hlo', 'gite_de_randonnee',
   'StopOverOrGroupLodge', 'https://www.datatourisme.fr/ontology/core#', TRUE)
ON CONFLICT (profile, object_type, taxonomy_domain, taxonomy_code)
  WHERE taxonomy_code IS NOT NULL
DO UPDATE SET
  target_class = EXCLUDED.target_class,
  context_url = EXCLUDED.context_url,
  is_active = TRUE;

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

  -- Nearest mapped taxonomy ancestor wins (depth 0 = assigned node itself),
  -- then the type-level row is the deterministic fallback.
  SELECT candidate.target_class, candidate.context_url INTO v_class, v_ctx
  FROM (
    SELECT x.target_class, x.context_url, 0 AS fallback_rank, cl.depth
    FROM public.ref_interop_crosswalk x
    JOIN object_taxonomy ot
      ON ot.object_id = p_object_id
     AND ot.domain = x.taxonomy_domain
    JOIN ref_code mapped
      ON mapped.domain = x.taxonomy_domain
     AND mapped.code = x.taxonomy_code
    JOIN ref_code_taxonomy_closure cl
      ON cl.domain = x.taxonomy_domain
     AND cl.descendant_id = ot.ref_code_id
     AND cl.ancestor_id = mapped.id
    WHERE x.profile = p_profile
      AND x.object_type = v_type
      AND x.taxonomy_code IS NOT NULL
      AND x.is_active

    UNION ALL

    SELECT x.target_class, x.context_url, 1 AS fallback_rank, 2147483647 AS depth
    FROM public.ref_interop_crosswalk x
    WHERE x.profile = p_profile
      AND x.object_type = v_type
      AND x.taxonomy_code IS NULL
      AND x.is_active
  ) candidate
  ORDER BY candidate.fallback_rank, candidate.depth ASC
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
  '(bespoke JSON) document for a PUBLISHED object; @type/class from the nearest mapped taxonomy ancestor '
  '(closure depth ASC), then the object_type fallback in ref_interop_crosswalk (table-driven), '
  'core via api.interop_object_core (public-only). service_role-only; unmapped/unpublished/unknown-profile => NULL. '
  'Core-fields subset — validate field-level conformance against the target importer before production sync.';

REVOKE ALL ON FUNCTION api.get_object_interop(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_object_interop(text, text) TO service_role;

