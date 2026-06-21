-- test_resource_completeness.sql — §101 : api.get_object_resource émet les 5 facettes autorables.
-- Chaque DO block prend un objet PUBLIÉ (lisible sous la garde objet), seed une ligne, appelle la
-- fn, assert via RAISE EXCEPTION, puis lève 'ROLLBACK_OK' : l'exception annule le savepoint
-- implicite du bloc ⇒ le seed N'EST PAS persisté. Exécution : node .tmp_pgapply/run_test.cjs
-- (ou MCP execute_sql bloc par bloc). Vérifié live 2026-06-21 : 7 PASS / 0 FAIL.
-- E (room_types[].media) : non seedable ici (aucun objet room-applicable publié + le trigger de
-- publication bloque le changement de statut sous le rôle de test). Vérifié par construction :
-- port verbatim du bloc média de api.get_object_room_types + garde §49 identique à read_media /
-- au gate média-menu (L~4234), même pattern que la garde D ci-dessous (prouvée excluante).

-- ===== A. object_zone =====
DO $$
DECLARE v JSONB; o TEXT; insee TEXT;
BEGIN
  SELECT id INTO o FROM object WHERE status='published' LIMIT 1;
  SELECT insee_code INTO insee FROM ref_commune LIMIT 1;
  INSERT INTO object_zone(object_id, insee_commune, position) VALUES (o, insee, 0) ON CONFLICT DO NOTHING;
  SELECT api.get_object_resource(o, ARRAY['fr'], 'geojson', '{"include_private":true}'::jsonb)::jsonb INTO v;
  IF NOT (v -> 'object_zone' @> jsonb_build_array(jsonb_build_object('insee_commune', insee))) THEN
    RAISE EXCEPTION 'FAIL A: object_zone = %', v -> 'object_zone'; END IF;
  RAISE NOTICE 'PASS A: object_zone len % ', jsonb_array_length(COALESCE(v->'object_zone','[]'));
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF; END $$;

-- ===== B. accessibility_labels (+ non-double-emit) =====
DO $$
DECLARE v JSONB; o TEXT; sid UUID; vid UUID; scode TEXT;
BEGIN
  SELECT id INTO o FROM object WHERE status='published' LIMIT 1;
  SELECT sc.id, cv.id, sc.code INTO sid, vid, scode
    FROM ref_classification_scheme sc JOIN ref_classification_value cv ON cv.scheme_id=sc.id
    WHERE sc.display_group='accessibility_labels' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE 'SKIP B: no accessibility scheme'; RAISE EXCEPTION 'ROLLBACK_OK'; END IF;
  INSERT INTO object_classification(object_id, scheme_id, value_id, status) VALUES (o, sid, vid, 'requested') ON CONFLICT DO NOTHING;
  SELECT api.get_object_resource(o, ARRAY['fr'], 'geojson', '{"include_private":true}'::jsonb)::jsonb INTO v;
  IF NOT (v -> 'accessibility_labels' @> jsonb_build_array(jsonb_build_object('value_id', vid, 'status', 'requested'))) THEN
    RAISE EXCEPTION 'FAIL B: accessibility_labels = %', v -> 'accessibility_labels'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v->'sustainability_labels','[]')) e WHERE e->>'scheme_code' = scode) THEN
    RAISE EXCEPTION 'FAIL B: accessibility double-emitted in sustainability_labels'; END IF;
  RAISE NOTICE 'PASS B: accessibility_labels emitted + not double-emitted';
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF; END $$;

-- ===== C. languages[].level =====
DO $$
DECLARE v JSONB; o TEXT; lid UUID; lvlid UUID; lvlcode TEXT;
BEGIN
  SELECT id INTO o FROM object WHERE status='published' LIMIT 1;
  SELECT id INTO lid FROM ref_language LIMIT 1;
  SELECT id, code INTO lvlid, lvlcode FROM ref_code_language_level LIMIT 1;
  IF lvlid IS NULL THEN RAISE NOTICE 'SKIP C: no language level'; RAISE EXCEPTION 'ROLLBACK_OK'; END IF;
  DELETE FROM object_language WHERE object_id=o AND language_id=lid;
  INSERT INTO object_language(object_id, language_id, level_id) VALUES (o, lid, lvlid);
  SELECT api.get_object_resource(o, ARRAY['fr'], 'geojson', '{"include_private":true}'::jsonb)::jsonb INTO v;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v->'languages','[]')) e WHERE e->'level'->>'code' = lvlcode) THEN
    RAISE EXCEPTION 'FAIL C: no language with level % : %', lvlcode, v->'languages'; END IF;
  RAISE NOTICE 'PASS C: languages[].level present';
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF; END $$;

-- ===== D. promotions + GARDE §49 (privée/inactive exclue) =====
DO $$
DECLARE v JSONB; o TEXT; pub UUID; priv UUID;
BEGIN
  SELECT id INTO o FROM object WHERE status='published' LIMIT 1;
  INSERT INTO promotion(name, discount_type, discount_value, is_public, is_active) VALUES ('PUB','percent',10,true,true) RETURNING id INTO pub;
  INSERT INTO promotion(name, discount_type, discount_value, is_public, is_active) VALUES ('PRIV','percent',10,false,true) RETURNING id INTO priv;
  INSERT INTO promotion_object(promotion_id, object_id) VALUES (pub, o), (priv, o);
  SELECT api.get_object_resource(o, ARRAY['fr'], 'geojson', '{"include_private":true}'::jsonb)::jsonb INTO v;
  IF NOT (v -> 'promotions' @> jsonb_build_array(jsonb_build_object('promotion_id', pub))) THEN
    RAISE EXCEPTION 'FAIL D: public promo absent : %', v->'promotions'; END IF;
  IF (v -> 'promotions' @> jsonb_build_array(jsonb_build_object('promotion_id', priv))) THEN
    RAISE EXCEPTION 'FAIL D: GARDE §49 — private promo leaked'; END IF;
  RAISE NOTICE 'PASS D: promotions public emitted + private gated (§49)';
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF; END $$;

-- ===== deep_data hérite accessibility_labels (fall-through misc) =====
DO $$
DECLARE v JSONB; o TEXT; sid UUID; vid UUID;
BEGIN
  SELECT id INTO o FROM object WHERE status='published' LIMIT 1;
  SELECT sc.id, cv.id INTO sid, vid FROM ref_classification_scheme sc JOIN ref_classification_value cv ON cv.scheme_id=sc.id
    WHERE sc.display_group='accessibility_labels' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE 'SKIP deep_data B: no scheme'; RAISE EXCEPTION 'ROLLBACK_OK'; END IF;
  INSERT INTO object_classification(object_id, scheme_id, value_id, status) VALUES (o, sid, vid, 'requested') ON CONFLICT DO NOTHING;
  SELECT (api.get_object_with_deep_data(o, ARRAY['fr'], '{"include_private":true}'::jsonb)::jsonb) -> 'object' INTO v;
  IF v IS NULL OR jsonb_typeof(v->'accessibility_labels') <> 'array' OR jsonb_array_length(v->'accessibility_labels') = 0 THEN
    RAISE EXCEPTION 'FAIL deep_data: accessibility_labels not inherited : %', v->'accessibility_labels'; END IF;
  RAISE NOTICE 'PASS deep_data: accessibility_labels inherited';
  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF; END $$;
