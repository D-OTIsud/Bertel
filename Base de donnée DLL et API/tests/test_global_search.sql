-- test_global_search.sql
-- Proves §109 (global Explorer search via object.search_document):
--   * search_mode='global' matches child-sourced content (amenities, menu dishes,
--     dietary tags, descriptions) — not just name/city.
--   * the default ('name') mode is NOT broadened (editor pickers stay name-only).
--   * relevance ranking: a name match outranks an amenity-only match.
--   * menu visibility is honored (a private menu's dish does NOT surface the object).
--   * the maintenance triggers populate search_document on child INSERT (no manual refresh).
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Fixtures are draft ⇒ get_filtered_object_ids reads the LIVE object table (use_mv = FALSE),
-- which exercises the full search_document path without an MV refresh.
-- NOTE: object_menu is only facet-applicable to menu-bearing types (e.g. RES), so both
-- dish-bearing fixtures are RES. The search itself is type-agnostic — any object that
-- carries the content surfaces.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_res   text := 'RESRUN9999999801';  -- restaurant: amenity jacuzzi + dish "Salade de palmiste" + vegan dish
  v_res2  text := 'RESRUN9999999802';  -- second restaurant: dish "Salade de palmiste"
  v_desc  text := 'RESRUN9999999803';  -- object: "palmiste" only in the canonical description
  v_priv  text := 'RESRUN9999999804';  -- object with a PRIVATE menu dish "Bredes mafane"
  v_named text := 'HLORUN9999999805';  -- object literally named with "jacuzzi"
  v_amen_jacuzzi uuid;
  v_dietary_vegan uuid;
  v_menu_res uuid; v_menu_res2 uuid; v_menu_priv uuid; v_item_res uuid;
  v_rel_named real; v_rel_res real;
BEGIN
  -- ---------- Resolve reference rows (must exist) ----------
  SELECT id INTO v_amen_jacuzzi FROM ref_amenity
    WHERE immutable_unaccent(lower(name)) LIKE '%jacuzzi%' ORDER BY name LIMIT 1;
  ASSERT v_amen_jacuzzi IS NOT NULL, 'seed missing: a ref_amenity whose name contains "jacuzzi"';

  SELECT id INTO v_dietary_vegan FROM ref_code_dietary_tag
    WHERE immutable_unaccent(lower(name)) LIKE '%vegan%' ORDER BY name LIMIT 1;
  ASSERT v_dietary_vegan IS NOT NULL, 'seed missing: a ref_code_dietary_tag whose name contains "vegan/végan"';

  -- ---------- Structural assertions ----------
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='object' AND column_name='search_document'),
         'object.search_document column is missing';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_refresh_object_filter_caches_object_menu_item'),
         'menu-item maintenance trigger is missing';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_refresh_object_filter_caches_tag_link'),
         'tag_link maintenance trigger is missing';

  -- ---------- Fixtures (superuser; RLS bypassed). Triggers populate search_document. ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_res,   'RES', 'Table du Sud',       'draft'),
    (v_res2,  'RES', 'Case Creole',        'draft'),
    (v_desc,  'RES', 'Le Bon Coin',        'draft'),
    (v_priv,  'RES', 'Le Discret',         'draft'),
    (v_named, 'HLO', 'Villa Jacuzzi Plus', 'draft');

  INSERT INTO object_amenity (object_id, amenity_id) VALUES (v_res, v_amen_jacuzzi);

  INSERT INTO object_menu (id, object_id, name, is_active, visibility)
    VALUES (gen_random_uuid(), v_res, 'Carte', TRUE, 'public') RETURNING id INTO v_menu_res;
  INSERT INTO object_menu (id, object_id, name, is_active, visibility)
    VALUES (gen_random_uuid(), v_res2, 'Table d hote', TRUE, NULL) RETURNING id INTO v_menu_res2;

  INSERT INTO object_menu_item (id, menu_id, name, description)
    VALUES (gen_random_uuid(), v_menu_res, 'Salade de palmiste', 'fraicheur du jour')
    RETURNING id INTO v_item_res;
  INSERT INTO object_menu_item (menu_id, name) VALUES (v_menu_res2, 'Salade de palmiste');

  INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id)
    VALUES (v_item_res, v_dietary_vegan);

  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_desc, NULL, 'Specialite locale a base de palmiste cuisine maison.', 'public');

  INSERT INTO object_menu (id, object_id, name, is_active, visibility)
    VALUES (gen_random_uuid(), v_priv, 'Carte secrete', TRUE, 'private') RETURNING id INTO v_menu_priv;
  INSERT INTO object_menu_item (menu_id, name) VALUES (v_menu_priv, 'Bredes mafane maison');

  -- ---------- GLOBAL mode: child content surfaces ----------
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res),
         'global: amenity jacuzzi must surface the restaurant';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'salade de palmiste') f WHERE f.object_id=v_res),
         'global: dish must surface restaurant 1';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'salade de palmiste') f WHERE f.object_id=v_res2),
         'global: dish must surface restaurant 2';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'vegan') f WHERE f.object_id=v_res),
         'global: vegan dietary tag must surface the restaurant';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'palmiste') f WHERE f.object_id=v_desc),
         'global: description word must surface the object';

  -- ---------- Visibility: a private menu dish must NOT surface the object ----------
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'mafane') f WHERE f.object_id=v_priv),
         'global: a PRIVATE menu dish must NOT surface the object';

  -- ---------- Name mode is NOT broadened (editor pickers stay name-only) ----------
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res),
         'name mode: must NOT match the amenity (no broadening)';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_named),
         'name mode: a name match must still work';

  -- ---------- Ranking: a name match outranks an amenity-only match ----------
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_named
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_named;
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_res
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res;
  ASSERT v_rel_named > v_rel_res,
         format('ranking: object named "...Jacuzzi..." (%s) must outrank one that merely has the amenity (%s)', v_rel_named, v_rel_res);

  RAISE NOTICE 'test_global_search: all assertions passed (named_rel=% amenity_rel=%)', v_rel_named, v_rel_res;
END $$;

ROLLBACK;
