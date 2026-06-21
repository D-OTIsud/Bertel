-- test_markdown_descriptions_api.sql
-- Markdown descriptions Delivery 1: the read RPCs serve description fields plain (Markdown
-- stripped) on flat/card paths and add *_md (raw) on the rich path. Run via Supabase execute_sql.
-- Each block mutates a published object, asserts, then RAISE EXCEPTION 'sdd_rollback' to roll the
-- mutation back (PL/pgSQL BEGIN/EXCEPTION = implicit savepoint). Nothing persists.

-- 1) Flat readers (cards) strip Markdown — get_object_card + get_object_cards_batch.
DO $$
DECLARE
  v_id text;
  v_card jsonb;
  v_batch json;
BEGIN
  SELECT o.id INTO v_id FROM object o WHERE o.status='published'
    AND EXISTS (SELECT 1 FROM object_description d WHERE d.object_id=o.id AND d.org_object_id IS NULL)
    LIMIT 1;
  UPDATE object_description SET description_chapo = '## Titre **gras** [lien](https://x.re)'
    WHERE object_id = v_id AND org_object_id IS NULL;

  v_card := api.get_object_card(v_id, ARRAY['fr']);
  ASSERT (v_card->>'description') NOT LIKE '%**%', 'card: no bold marker';
  ASSERT (v_card->>'description') NOT LIKE '##%', 'card: no heading marker';
  ASSERT (v_card->>'description') NOT LIKE '%](%', 'card: no link syntax';
  ASSERT (v_card->>'description') LIKE '%gras%', 'card: keeps text';

  v_batch := api.get_object_cards_batch(ARRAY[v_id], ARRAY['fr']);
  ASSERT (v_batch->0->>'description') NOT LIKE '%**%', 'batch: no bold marker';
  ASSERT (v_batch->0->>'description') LIKE '%Titre%', 'batch: keeps text';

  RAISE NOTICE 'card+batch strip OK';
  RAISE EXCEPTION 'sdd_rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'sdd_rollback' THEN RAISE; END IF;
END $$;

-- 2) Map item strips Markdown — get_object_map_item.
DO $$
DECLARE
  v_id text;
BEGIN
  SELECT o.id INTO v_id
  FROM object o
  JOIN object_location ol ON ol.object_id=o.id AND ol.is_main_location IS TRUE
  WHERE o.status='published' AND ol.latitude IS NOT NULL AND ol.longitude IS NOT NULL
    AND EXISTS (SELECT 1 FROM object_description d WHERE d.object_id=o.id AND d.org_object_id IS NULL)
  LIMIT 1;
  UPDATE object_description SET description_chapo = '## Carte **md**'
    WHERE object_id = v_id AND org_object_id IS NULL;
  ASSERT (api.get_object_map_item(v_id, ARRAY['fr'])->>'description') NOT LIKE '%**%', 'map: no bold';
  RAISE NOTICE 'map strip OK';
  RAISE EXCEPTION 'sdd_rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'sdd_rollback' THEN RAISE; END IF;
END $$;

-- 3) Rich path serves plain + *_md — get_object_resource (+ get_object_with_deep_data inherits).
DO $$
DECLARE
  v_id text;
  v_res jsonb;
BEGIN
  SELECT o.id INTO v_id FROM object o WHERE o.status='published'
    AND EXISTS (SELECT 1 FROM object_description d WHERE d.object_id=o.id AND d.org_object_id IS NULL)
    LIMIT 1;
  UPDATE object_description SET description = E'## Intro\n\nUn **beau** lieu.'
    WHERE object_id = v_id AND org_object_id IS NULL;

  v_res := api.get_object_resource(v_id, ARRAY['fr'], 'none', '{}'::jsonb);
  ASSERT (v_res->>'description') NOT LIKE '%**%', 'resource: plain description stripped';
  ASSERT (v_res->>'description') NOT LIKE '##%', 'resource: plain no heading';
  ASSERT (v_res->>'description_md') LIKE '%**beau**%', 'resource: description_md raw';
  ASSERT ((api.get_object_with_deep_data(v_id, ARRAY['fr'], '{}'::jsonb)::jsonb->'object'->>'description_md')) LIKE '%**beau**%',
    'deep_data inherits _md';

  RAISE NOTICE 'resource plain+md OK';
  RAISE EXCEPTION 'sdd_rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'sdd_rollback' THEN RAISE; END IF;
END $$;
