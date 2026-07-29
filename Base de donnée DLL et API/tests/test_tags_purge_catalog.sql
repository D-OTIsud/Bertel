-- =====================================================================================
-- test_tags_purge_catalog.sql — garde CI du manifest 16p
--
-- Design  : docs/superpowers/specs/2026-07-29-tags-doctrine-gouvernance-design.md
-- Journal : lot1_mapping_decisions.md §203
--
-- Ce que ce test protège :
--   A. La purge a bien eu lieu (aucun lien de l'import 20260512 ne subsiste).
--   B. Le catalogue est réduit (les 15 tags sortants sont absents).
--   C. La purge n'a pas débordé (`family` et `romantic` sont TOUJOURS là).
--   D. Doctrine R2-a rendue exécutable : aucun tag ne porte le nom EXACT d'un équipement,
--      d'un code « cadre & environnement » ou d'un nœud de taxonomie. C'est la version
--      déterministe de « un concept filtrable n'a qu'UNE surface de saisie » (§196).
--
-- NON VACUITÉ — vérifiée sur live le 2026-07-29, AVANT la migration :
--   A échouait sur 4 535 liens ; B sur 15 slugs (dont 2 issus de `seeds_data.sql`, donc
--   le test est également non vacant sur une base FRAÎCHE) ; D échouait sur 5 tags —
--   Visite guidée = taxonomy_loi, Patrimoine = taxonomy_pcu, Boutique = ref_amenity,
--   Bien-être = taxonomy_loi, Atelier = taxonomy_loi.
--
-- POURQUOI D EST UNE ÉGALITÉ EXACTE ET NON UNE SIMILARITÉ :
--   Un seuil trigramme a été mesuré puis écarté ici. Il classe mal dans les deux sens :
--   il RATE la duplication conceptuelle (« Panorama » vs « Vue panoramique » = 0.412,
--   alors que c'est le même concept, doublon prouvé à 436/439 fiches) et il ATTRAPE un
--   tag légitime (« Romantique » vs le nœud `taxonomy_hot` « Hôtel romantique » = 0.647,
--   au-dessus de `jacuzzy`/`Jacuzzi` = 0.600 — aucun seuil ne sépare les deux).
--   La similarité reste donc un signal ADVISORY, à sa place : la suggestion au moment de
--   la création (lot 1, `api.suggest_similar_tags`), où un humain tranche. Une garde CI
--   doit être déterministe, sinon une dérive de scoring `pg_trgm` casse le build sans
--   qu'aucune donnée n'ait bougé.
-- =====================================================================================

DO $$
DECLARE
  v_retired text[] := ARRAY[
    'accommodation','outdoor','food','panorama','volcano','wellness','beach','shopping',
    'heritage','local_products','farm','workshop','guided_tour','organic','jacuzzy'
  ];
  v_n     bigint;
  v_slugs text;
BEGIN
  -- ---------------------------------------------------------------------------------
  -- A. Aucun lien issu de l'import « old_data_enrichment_20260512 » (ni des reliquats
  --    sans `source`) ne subsiste. Les liens humains (`created_by` non nul) sont hors
  --    périmètre : la migration les préserve délibérément.
  -- ---------------------------------------------------------------------------------
  SELECT count(*) INTO v_n
  FROM public.tag_link
  WHERE created_by IS NULL
    AND (extra ->> 'source' = 'old_data_enrichment_20260512'
         OR extra IS NULL
         OR NOT (extra ? 'source'));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'test 16p A : % lien(s) tag_link de l''import subsistent', v_n;
  END IF;

  -- ---------------------------------------------------------------------------------
  -- B. Les tags sortants sont absents du catalogue.
  -- ---------------------------------------------------------------------------------
  SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_slugs
  FROM public.ref_tag WHERE slug = ANY(v_retired);
  IF v_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'test 16p B : tag(s) sortant(s) encore au catalogue : %', v_slugs;
  END IF;

  -- ---------------------------------------------------------------------------------
  -- C. La purge n'a pas débordé : les deux tags sans doublon structuré sont conservés.
  --    (Sans cette assertion, « supprimer tout ref_tag » passerait A et B.)
  -- ---------------------------------------------------------------------------------
  SELECT string_agg(s, ', ' ORDER BY s) INTO v_slugs
  FROM unnest(ARRAY['family','romantic']) AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.ref_tag t WHERE t.slug = s);
  IF v_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'test 16p C : tag(s) à conserver absent(s) du catalogue : %', v_slugs;
  END IF;

  -- ---------------------------------------------------------------------------------
  -- D. Aucun tag ne duplique, au nom exact normalisé, un équipement / un code de cadre /
  --    un nœud de taxonomie. Vaut aussi pour tout tag AJOUTÉ plus tard : c'est la garde
  --    qui empêche le catalogue de redériver vers ce qui a produit 16p.
  -- ---------------------------------------------------------------------------------
  SELECT string_agg(DISTINCT format('%s (= %s « %s »)', t.name, v.src, v.name), ' ; ')
    INTO v_slugs
  FROM public.ref_tag t
  JOIN (
    SELECT a.name, 'équipement'::text AS src FROM public.ref_amenity a
    UNION ALL
    SELECT rc.name, 'cadre' FROM public.ref_code rc WHERE rc.domain = 'environment_tag'
    UNION ALL
    SELECT rc.name, 'taxonomie ' || rc.domain FROM public.ref_code rc WHERE rc.domain LIKE 'taxonomy%'
  ) v
    ON public.immutable_unaccent(lower(btrim(t.name)))
     = public.immutable_unaccent(lower(btrim(v.name)));
  IF v_slugs IS NOT NULL THEN
    RAISE EXCEPTION
      'test 16p D : un tag duplique un axe structuré (invariant §196 — un concept filtrable n''a qu''UNE surface de saisie) : %',
      v_slugs;
  END IF;

  RAISE NOTICE 'test 16p : OK — catalogue = %',
    (SELECT COALESCE(string_agg(slug, ', ' ORDER BY slug), '(vide)') FROM public.ref_tag);
END $$;
