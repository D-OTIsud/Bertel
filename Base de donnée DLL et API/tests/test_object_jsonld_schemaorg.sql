-- tests/test_object_jsonld_schemaorg.sql
-- Pins the I4 schema.org JSON-LD serializer (audit API, Phase 2):
--   public.ref_interop_crosswalk           — table-driven object_type -> target class (profile-keyed)
--   api.get_object_jsonld(text, text)       — schema.org JSON-LD for a PUBLISHED object
-- Structural (table + RLS + 19 jsonld seed rows; RPC exists, SECURITY INVOKER, service_role-only)
-- + behavioural (crosswalk @type/@context, urn @id, plain-text description, PostalAddress + geo,
-- public-only contacts/website/sameAs, published gate, unknown id, unmapped profile -> NULL).
-- Self-cleaning: seeds a published + draft fixture in a sub-transaction always rolled back
-- (ROLLBACK_PROBE) — leaves NOTHING in object / object_description / object_location /
-- contact_channel / object_web_channel.
DO $$
DECLARE
  v_hot        text := 'HOTRUN9999990I40';  -- published, fully populated
  v_draft      text := 'HOTRUN9999990I41';  -- draft (must yield NULL)
  v_kind_phone uuid;
  v_kind_email uuid;
  v_kind_web   uuid;
  v_fb_id      uuid;
  j            jsonb;
BEGIN
  -- 1. Table exists + RLS enabled + profile 'jsonld' seeded for all 19 object_type.
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='ref_interop_crosswalk' AND c.relrowsecurity) <> 1 THEN
    RAISE EXCEPTION 'ref_interop_crosswalk missing or RLS disabled';
  END IF;
  IF (SELECT count(*) FROM public.ref_interop_crosswalk WHERE profile='jsonld') <> 19 THEN
    RAISE EXCEPTION 'expected 19 jsonld crosswalk rows, got %',
      (SELECT count(*) FROM public.ref_interop_crosswalk WHERE profile='jsonld');
  END IF;

  -- 2. RPC exists, is SECURITY INVOKER (least privilege), service_role-ONLY.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='get_object_jsonld' AND NOT p.prosecdef) <> 1 THEN
    RAISE EXCEPTION 'api.get_object_jsonld missing or not SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon','api.get_object_jsonld(text,text)','EXECUTE')
     OR has_function_privilege('authenticated','api.get_object_jsonld(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_object_jsonld must be service_role-only (anon/authenticated denied)';
  END IF;
  IF NOT has_function_privilege('service_role','api.get_object_jsonld(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_object_jsonld must be EXECUTE-able by service_role';
  END IF;

  -- ---------- Fixture ----------
  SELECT id INTO v_kind_phone FROM ref_code_contact_kind WHERE code='phone'   LIMIT 1;
  SELECT id INTO v_kind_email FROM ref_code_contact_kind WHERE code='email'   LIMIT 1;
  SELECT id INTO v_kind_web   FROM ref_code_contact_kind WHERE code='website' LIMIT 1;
  SELECT id INTO v_fb_id      FROM ref_code WHERE domain='social_network' AND code='facebook' LIMIT 1;
  IF v_kind_phone IS NULL OR v_kind_email IS NULL OR v_kind_web IS NULL OR v_fb_id IS NULL THEN
    RAISE EXCEPTION 'fixture: contact-kind / social_network seeds missing (seeds not applied)';
  END IF;

  INSERT INTO object (id, object_type, name, status, cached_main_image_url) VALUES
    (v_hot,   'HOT', 'JSON-LD Hôtel', 'published', 'https://cdn.example.com/cover.jpg'),
    (v_draft, 'HOT', 'JSON-LD Draft', 'draft',     NULL);

  -- Canonical public description in Markdown (must be emitted as plain text).
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, visibility) VALUES
    (v_hot, NULL, 'Plain fallback', '{"fr":"# Bienvenue **chez nous**"}'::jsonb, 'public');

  INSERT INTO object_location (object_id, address1, address2, postcode, city, latitude, longitude, is_main_location) VALUES
    (v_hot, '12 rue des Palmiers', 'Résidence Corail', '97410', 'Saint-Pierre', -21.34, 55.48, TRUE);

  -- Public phone + PRIVATE phone (must NOT surface) + public email + public https website.
  INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary) VALUES
    (v_hot, v_kind_phone, '+262262000000',        TRUE,  TRUE),
    (v_hot, v_kind_phone, '+262262999999',        FALSE, FALSE),
    (v_hot, v_kind_email, 'contact@example.re',   TRUE,  TRUE),
    (v_hot, v_kind_web,   'https://hotel.example.re', TRUE, TRUE);

  -- Public web channel (-> sameAs) + PRIVATE one (must NOT surface). Unique on (object_id,kind_id,value).
  INSERT INTO object_web_channel (object_id, kind_id, kind_domain, value, is_public) VALUES
    (v_hot, v_fb_id, 'social_network', 'https://facebook.com/hotel',  TRUE),
    (v_hot, v_fb_id, 'social_network', 'https://facebook.com/secret', FALSE);

  -- 3. BEHAVIOURAL — the full schema.org document (default profile 'jsonld').
  j := api.get_object_jsonld(v_hot);

  IF j->>'@context' <> 'https://schema.org' THEN RAISE EXCEPTION '@context wrong: %', j->>'@context'; END IF;
  IF j->>'@type' <> 'Hotel' THEN RAISE EXCEPTION 'HOT should map to Hotel via crosswalk, got %', j->>'@type'; END IF;
  IF j->>'@id' <> 'urn:bertel:object:'||v_hot THEN RAISE EXCEPTION '@id wrong: %', j->>'@id'; END IF;
  IF j->>'identifier' <> v_hot THEN RAISE EXCEPTION 'identifier wrong: %', j->>'identifier'; END IF;
  IF j->>'name' <> 'JSON-LD Hôtel' THEN RAISE EXCEPTION 'name wrong: %', j->>'name'; END IF;
  IF j->>'description' <> 'Bienvenue chez nous' THEN RAISE EXCEPTION 'description not stripped, got %', j->>'description'; END IF;
  IF j->>'image' <> 'https://cdn.example.com/cover.jpg' THEN RAISE EXCEPTION 'image wrong: %', j->>'image'; END IF;
  IF j->>'telephone' <> '+262262000000' THEN RAISE EXCEPTION 'telephone must be the PUBLIC phone, got %', j->>'telephone'; END IF;
  IF j->>'email' <> 'contact@example.re' THEN RAISE EXCEPTION 'email wrong: %', j->>'email'; END IF;
  IF j->>'url' <> 'https://hotel.example.re' THEN RAISE EXCEPTION 'url must be public https website, got %', j->>'url'; END IF;

  -- address (PostalAddress) — streetAddress joins address1..3.
  IF j->'address'->>'@type' <> 'PostalAddress' THEN RAISE EXCEPTION 'address @type wrong'; END IF;
  IF j->'address'->>'streetAddress' <> '12 rue des Palmiers, Résidence Corail' THEN
    RAISE EXCEPTION 'streetAddress wrong, got %', j->'address'->>'streetAddress'; END IF;
  IF j->'address'->>'postalCode' <> '97410' THEN RAISE EXCEPTION 'postalCode wrong'; END IF;
  IF j->'address'->>'addressLocality' <> 'Saint-Pierre' THEN RAISE EXCEPTION 'addressLocality wrong'; END IF;
  IF j->'address'->>'addressCountry' <> 'FR' THEN RAISE EXCEPTION 'addressCountry wrong'; END IF;

  -- geo (GeoCoordinates).
  IF (j->'geo'->>'latitude')::numeric <> -21.34 THEN RAISE EXCEPTION 'geo latitude wrong, got %', j->'geo'->>'latitude'; END IF;
  IF (j->'geo'->>'longitude')::numeric <> 55.48 THEN RAISE EXCEPTION 'geo longitude wrong, got %', j->'geo'->>'longitude'; END IF;

  -- sameAs: only the PUBLIC web channel.
  IF NOT (j->'sameAs' @> '["https://facebook.com/hotel"]'::jsonb) THEN
    RAISE EXCEPTION 'sameAs missing public channel, got %', j->'sameAs'; END IF;
  IF (j->'sameAs' @> '["https://facebook.com/secret"]'::jsonb) THEN
    RAISE EXCEPTION 'private web channel leaked into sameAs, got %', j->'sameAs'; END IF;

  -- 4. Published gate: a DRAFT object => NULL.
  IF api.get_object_jsonld(v_draft) IS NOT NULL THEN RAISE EXCEPTION 'draft object must yield NULL'; END IF;
  -- 5. Unknown id => NULL.
  IF api.get_object_jsonld('HOTRUN0000000XZZ') IS NOT NULL THEN RAISE EXCEPTION 'unknown id must yield NULL'; END IF;
  -- 6. Unmapped profile => NULL (crosswalk is table-driven; no hardcoded fallback).
  IF api.get_object_jsonld(v_hot, 'no_such_profile') IS NOT NULL THEN RAISE EXCEPTION 'unmapped profile must yield NULL'; END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE'; -- leave no fixture rows behind
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'test_object_jsonld_schemaorg.sql: OK'; END $$;
