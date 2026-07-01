-- tests/test_interop_profiles.sql
-- Pins the I4 §137 interop profiles (datatourisme / apidae / tourinsoft):
--   api.interop_object_core(text)          — shared gated core reader
--   api.get_object_interop(text, text)     — per-profile serializer dispatcher
-- Structural (functions exist, SECURITY INVOKER, service_role-only; 19 crosswalk rows per profile)
-- + behavioural (each profile's shape + type/class from the crosswalk, address/geo, public-only
-- contacts, published gate, unknown id / unknown profile -> NULL).
-- Self-cleaning: seeds a published + draft fixture in a sub-transaction always rolled back
-- (ROLLBACK_PROBE).
DO $$
DECLARE
  v_hot        text := 'HOTRUN9999990I70';
  v_draft      text := 'HOTRUN9999990I71';
  v_kind_phone uuid;
  v_kind_email uuid;
  v_kind_web   uuid;
  dt jsonb; ap jsonb; ti jsonb;
BEGIN
  -- 1. Functions exist, SECURITY INVOKER, service_role-only; crosswalk seeded for the 3 profiles.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='get_object_interop' AND NOT p.prosecdef) <> 1 THEN
    RAISE EXCEPTION 'api.get_object_interop missing or not SECURITY INVOKER';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='interop_object_core' AND NOT p.prosecdef) <> 1 THEN
    RAISE EXCEPTION 'api.interop_object_core missing or not SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon','api.get_object_interop(text,text)','EXECUTE')
     OR has_function_privilege('authenticated','api.get_object_interop(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_object_interop must be service_role-only';
  END IF;
  IF NOT has_function_privilege('service_role','api.get_object_interop(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_object_interop must be service_role-executable';
  END IF;
  IF (SELECT count(*) FROM public.ref_interop_crosswalk WHERE profile='datatourisme') <> 19
     OR (SELECT count(*) FROM public.ref_interop_crosswalk WHERE profile='apidae') <> 19
     OR (SELECT count(*) FROM public.ref_interop_crosswalk WHERE profile='tourinsoft') <> 19 THEN
    RAISE EXCEPTION 'expected 19 crosswalk rows per profile (datatourisme/apidae/tourinsoft)';
  END IF;

  -- ---------- Fixture ----------
  SELECT id INTO v_kind_phone FROM ref_code_contact_kind WHERE code='phone'   LIMIT 1;
  SELECT id INTO v_kind_email FROM ref_code_contact_kind WHERE code='email'   LIMIT 1;
  SELECT id INTO v_kind_web   FROM ref_code_contact_kind WHERE code='website' LIMIT 1;
  IF v_kind_phone IS NULL OR v_kind_email IS NULL OR v_kind_web IS NULL THEN
    RAISE EXCEPTION 'fixture: contact-kind seeds missing';
  END IF;

  INSERT INTO object (id, object_type, name, status, cached_main_image_url) VALUES
    (v_hot,   'HOT', 'Interop Hôtel', 'published', 'https://cdn.example.com/cover.jpg'),
    (v_draft, 'HOT', 'Interop Draft', 'draft',     NULL);
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, visibility) VALUES
    (v_hot, NULL, 'Plain fallback', '{"fr":"# Bienvenue **chez nous**"}'::jsonb, 'public');
  INSERT INTO object_location (object_id, address1, address2, postcode, city, latitude, longitude, is_main_location) VALUES
    (v_hot, '12 rue des Palmiers', 'Résidence Corail', '97410', 'Saint-Pierre', -21.34, 55.48, TRUE);
  INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary) VALUES
    (v_hot, v_kind_phone, '+262262000000',        TRUE,  TRUE),
    (v_hot, v_kind_phone, '+262262999999',        FALSE, FALSE),  -- private, must not surface
    (v_hot, v_kind_email, 'contact@example.re',   TRUE,  TRUE),
    (v_hot, v_kind_web,   'https://hotel.example.re', TRUE, TRUE);

  -- 2. DATAtourisme (JSON-LD).
  dt := api.get_object_interop(v_hot, 'datatourisme');
  IF dt->'@context'->>'@vocab' <> 'https://www.datatourisme.fr/ontology/core#' THEN
    RAISE EXCEPTION 'datatourisme @vocab wrong: %', dt->'@context'->>'@vocab'; END IF;
  IF NOT (dt->'@type' @> '["PointOfInterest","Accommodation"]'::jsonb) THEN
    RAISE EXCEPTION 'datatourisme @type wrong (HOT->Accommodation via crosswalk), got %', dt->'@type'; END IF;
  IF dt->>'@id' <> 'urn:bertel:object:'||v_hot THEN RAISE EXCEPTION 'datatourisme @id wrong'; END IF;
  IF dt->'rdfs:label'->0->>'@value' <> 'Interop Hôtel' THEN RAISE EXCEPTION 'datatourisme label wrong'; END IF;
  IF dt->'hasDescription'->0->'dc:description'->0->>'@value' <> 'Bienvenue chez nous' THEN
    RAISE EXCEPTION 'datatourisme description not stripped, got %', dt->'hasDescription'; END IF;
  IF dt->'isLocatedAt'->0->'schema:address'->>'schema:streetAddress' <> '12 rue des Palmiers, Résidence Corail' THEN
    RAISE EXCEPTION 'datatourisme address wrong, got %', dt->'isLocatedAt'->0->'schema:address'; END IF;
  IF (dt->'isLocatedAt'->0->'schema:geo'->>'schema:latitude')::numeric <> -21.34 THEN
    RAISE EXCEPTION 'datatourisme geo lat wrong'; END IF;
  IF dt->'hasContact'->0->>'schema:telephone' <> '+262262000000' THEN
    RAISE EXCEPTION 'datatourisme telephone must be PUBLIC, got %', dt->'hasContact'->0->>'schema:telephone'; END IF;

  -- 3. APIDAE (bespoke JSON).
  ap := api.get_object_interop(v_hot, 'apidae');
  IF ap->>'type' <> 'HOTELLERIE' THEN RAISE EXCEPTION 'apidae type wrong (HOT->HOTELLERIE), got %', ap->>'type'; END IF;
  IF ap->'nom'->>'libelleFr' <> 'Interop Hôtel' THEN RAISE EXCEPTION 'apidae nom wrong'; END IF;
  IF ap->'presentation'->'descriptifCourt'->>'libelleFr' <> 'Bienvenue chez nous' THEN
    RAISE EXCEPTION 'apidae presentation wrong, got %', ap->'presentation'; END IF;
  IF ap->'localisation'->'adresse'->'commune'->>'nom' <> 'Saint-Pierre' THEN
    RAISE EXCEPTION 'apidae commune wrong'; END IF;
  IF (ap->'localisation'->'geolocalisation'->'geoJson'->'coordinates'->>0)::numeric <> 55.48 THEN
    RAISE EXCEPTION 'apidae geoJson lng (coord[0]) wrong, got %', ap->'localisation'->'geolocalisation'->'geoJson'->'coordinates'; END IF;
  IF (ap->'localisation'->'geolocalisation'->'geoJson'->'coordinates'->>1)::numeric <> -21.34 THEN
    RAISE EXCEPTION 'apidae geoJson lat (coord[1]) wrong'; END IF;

  -- 4. Tourinsoft (fielded syndication JSON).
  ti := api.get_object_interop(v_hot, 'tourinsoft');
  IF ti->>'SyndObjectID' <> v_hot THEN RAISE EXCEPTION 'tourinsoft SyndObjectID wrong'; END IF;
  IF ti->>'type' <> 'HOT' THEN RAISE EXCEPTION 'tourinsoft type wrong (HOT->HOT), got %', ti->>'type'; END IF;
  IF ti->>'NomOffre' <> 'Interop Hôtel' THEN RAISE EXCEPTION 'tourinsoft NomOffre wrong'; END IF;
  IF (ti->>'Latitude')::numeric <> -21.34 THEN RAISE EXCEPTION 'tourinsoft Latitude wrong'; END IF;
  IF ti->>'Telephone' <> '+262262000000' THEN
    RAISE EXCEPTION 'tourinsoft Telephone must be PUBLIC, got %', ti->>'Telephone'; END IF;
  IF ti->>'Photo' <> 'https://cdn.example.com/cover.jpg' THEN RAISE EXCEPTION 'tourinsoft Photo wrong'; END IF;

  -- 5. Published gate + unknown id + unknown profile => NULL.
  IF api.get_object_interop(v_draft, 'apidae') IS NOT NULL THEN RAISE EXCEPTION 'draft must yield NULL'; END IF;
  IF api.get_object_interop('HOTRUN0000000XZZ', 'apidae') IS NOT NULL THEN RAISE EXCEPTION 'unknown id must yield NULL'; END IF;
  IF api.get_object_interop(v_hot, 'no_such_profile') IS NOT NULL THEN RAISE EXCEPTION 'unknown profile must yield NULL'; END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'test_interop_profiles.sql: OK'; END $$;
