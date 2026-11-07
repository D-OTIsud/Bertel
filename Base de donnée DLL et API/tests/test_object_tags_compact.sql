-- test_object_tags_compact.sql
-- §09 (manifest 14h): tag aggregates order by tag_link.position (per-object §09 priority),
-- NOT the global ref_tag.position. Run AFTER the manifest. Self-contained + transactional.
--
-- DEPLOY-INTEGRITY TRIPWIRE: the tag aggregate is inlined in THREE live sites
-- (get_object_tags_compact, get_object_cards_batch baseline, AND its SECURITY DEFINER
-- override in migration_cards_batch_authorize_definer.sql — the body serving the Explorer
-- grid). This test exercises the per-card fn AND get_object_cards_batch, so a fix that
-- misses the override goes RED on the cards_batch assertion.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj text := 'TAGTESTORDER0001';
  v_t_zebra uuid; v_t_alpha uuid;
  v_compact jsonb; v_cards json; v_card_tags jsonb;
BEGIN
  -- Fixture: published object + 2 tags whose ALPHA order is the OPPOSITE of position.
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ACT', 'tag order test', 'published');
  INSERT INTO ref_tag (id, slug, name, color) VALUES (gen_random_uuid(), 'order-zebra', 'Zebra', '#111111') RETURNING id INTO v_t_zebra;
  INSERT INTO ref_tag (id, slug, name, color) VALUES (gen_random_uuid(), 'order-alpha', 'Alpha', '#222222') RETURNING id INTO v_t_alpha;
  -- Zebra at position 0 (first), Alpha at position 1 — pure alpha sort would put Alpha first.
  INSERT INTO tag_link (tag_id, target_table, target_pk, position) VALUES
    (v_t_zebra, 'object', v_obj, 0),
    (v_t_alpha, 'object', v_obj, 1);

  -- (1) get_object_tags_compact orders by tag_link.position
  v_compact := api.get_object_tags_compact(v_obj);
  ASSERT v_compact->0->>'name' = 'Zebra', 'compact: position 0 (Zebra) must come first, NOT alpha';
  ASSERT v_compact->1->>'name' = 'Alpha', 'compact: position 1 (Alpha)';

  -- (2) get_object_cards_batch (the LIVE DEFINER override / Explorer grid) must ALSO honor position.
  v_cards := api.get_object_cards_batch(ARRAY[v_obj]);
  v_card_tags := (v_cards::jsonb)->0->'tags';
  ASSERT v_card_tags->0->>'name' = 'Zebra', 'cards_batch: tags ordered by tag_link.position (Zebra first)';
  ASSERT v_card_tags->0->>'color' = '#111111', 'cards_batch: per-tag hex color emitted';

  RAISE NOTICE 'tag order (compact + cards_batch) assertions passed.';
END$$;
ROLLBACK;
