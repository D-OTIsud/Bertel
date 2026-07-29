-- =====================================================================================
-- test_tags_purge_catalog.sql — garde CI du manifest 16p
--
-- Design  : docs/superpowers/specs/2026-07-29-tags-doctrine-gouvernance-design.md
-- Journal : lot1_mapping_decisions.md §203
--
-- Ce que ce test protège :
--   A. La purge a eu lieu — aucun lien portant la source d'import ne subsiste.
--   B. Le catalogue est réduit — les 15 tags sortants sont absents.
--   C. La purge n'a pas débordé sur le catalogue — `family` / `romantic` sont là.
--   D. Doctrine R2-a exécutable — aucun tag ne porte le nom EXACT d'un équipement, d'un
--      code « cadre & environnement » ou d'un nœud de taxonomie (invariant §196).
--   E. La purge n'a pas débordé sur les DONNÉES — la sauvegarde ne contient QUE des
--      lignes d'import, donc aucune écriture éditeur n'a été emportée.
--   F. La provenance est écrite à la source — le RPC éditeur stampe `created_by` et
--      `extra.source`, sans quoi E redeviendrait indécidable pour l'avenir.
--
-- ⚠️ A ET E SONT COMPLÉMENTAIRES, PAS REDONDANTS. A prouve que l'import est parti ;
--    E prouve que RIEN D'AUTRE n'est parti. Une purge trop large passerait A.
--
-- NON VACUITÉ — mesurée sur live le 2026-07-29 AVANT application :
--   A échouait sur **4 529** liens ; B sur 15 slugs ; D sur 5 tags (Visite guidée =
--   taxonomy_loi, Patrimoine = taxonomy_pcu, Boutique = ref_amenity, Bien-être =
--   taxonomy_loi, Atelier = taxonomy_loi) ; F échouait avant la correction du RPC.
--   C est non vacant sur base fraîche depuis que `family`/`romantic` sont seedés.
--   E est structurellement vacant sur base fraîche (sauvegarde vide) et devient la garde
--   forte sur live — c'est assumé et dit ici plutôt que masqué.
--
-- POURQUOI D EST UNE ÉGALITÉ EXACTE ET NON UNE SIMILARITÉ :
--   Un seuil trigramme a été mesuré puis écarté. Il classe mal dans les deux sens : il
--   RATE la duplication conceptuelle (« Panorama » vs « Vue panoramique » = 0.412, alors
--   que le doublon est prouvé à 436/439 fiches) et il ATTRAPE un tag légitime
--   (« Romantique » vs `taxonomy_hot` « Hôtel romantique » = 0.647, au-dessus de
--   `jacuzzy`/`Jacuzzi` = 0.600). Aucun seuil ne sépare les deux. La similarité reste donc
--   ADVISORY, à sa place : la suggestion au moment de la création (lot 2). Une garde CI
--   doit être déterministe, sinon une dérive de scoring `pg_trgm` casse le build sans
--   qu'aucune donnée n'ait bougé.
-- =====================================================================================

DO $$
DECLARE
  -- ⚠️ Ce prédicat doit rester IDENTIQUE à celui de la migration. La première version du
  --    test utilisait `created_by IS NULL OR extra sans 'source'` — plus large que la
  --    purge — donc il échouait sur les lignes éditeur que la migration conserve
  --    délibérément. Un test dont le prédicat diverge de la migration ne teste rien.
  c_import_source constant text := 'old_data_enrichment_20260512';
  v_retired text[] := ARRAY[
    'accommodation','outdoor','food','panorama','volcano','wellness','beach','shopping',
    'heritage','local_products','farm','workshop','guided_tour','organic','jacuzzy'
  ];
  v_n     bigint;
  v_slugs text;
  v_def   text;
BEGIN
  -- ---------------------------------------------------------------------------------
  -- A. Aucun lien portant la source d'import ne subsiste.
  -- ---------------------------------------------------------------------------------
  SELECT count(*) INTO v_n
  FROM public.tag_link
  WHERE target_table = 'object'
    AND extra ->> 'source' = c_import_source;
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
  -- C. Le catalogue attendu est bien là (sinon « supprimer tout ref_tag » passerait A
  --    et B). `family`/`romantic` viennent de `seeds_data.sql`, les 3 tags choisis de la
  --    migration 16q ⇒ non vacant aussi sur base fraîche.
  --    ⚠️ PRÉSENCE des slugs uniquement, jamais les libellés/couleurs : le seed et 16q
  --    utilisent `ON CONFLICT DO NOTHING`, donc un admin peut recolorer ou renommer sans
  --    faire tomber le build (c'est son droit — cf. `api.set_tag_color`).
  -- ---------------------------------------------------------------------------------
  SELECT string_agg(s, ', ' ORDER BY s) INTO v_slugs
  FROM unnest(ARRAY['family','romantic','vue_mer','feu_de_bois','case_creole']) AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.ref_tag t WHERE t.slug = s);
  IF v_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'test 16p C : tag(s) attendu(s) absent(s) du catalogue : %', v_slugs;
  END IF;

  -- ---------------------------------------------------------------------------------
  -- D. Aucun tag ne duplique, au nom exact normalisé, un axe structuré. Vaut aussi pour
  --    tout tag AJOUTÉ plus tard : c'est la garde qui empêche le catalogue de redériver.
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

  -- ---------------------------------------------------------------------------------
  -- E. La sauvegarde ne contient QUE des lignes d'import. C'est la preuve exécutable
  --    qu'aucune écriture éditeur n'a été emportée par la purge — notamment les 6 lignes
  --    auditées (`extra = '{}'`, 2 fiches) que la migration conserve délibérément.
  -- ---------------------------------------------------------------------------------
  IF to_regclass('internal.tag_link_purge_backup_20260512') IS NULL THEN
    RAISE EXCEPTION 'test 16p E : table de sauvegarde absente — la migration 16p n''a pas été appliquée';
  END IF;

  SELECT count(*) INTO v_n
  FROM internal.tag_link_purge_backup_20260512
  WHERE target_table IS DISTINCT FROM 'object'
     OR extra ->> 'source' IS DISTINCT FROM c_import_source;
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'test 16p E : % ligne(s) sauvegardée(s) ne viennent PAS de l''import — la purge a débordé sur de la saisie éditeur. Détail : %',
      v_n,
      (SELECT string_agg(format('%s→%s (source=%s)', target_pk, tag_slug, COALESCE(extra->>'source','∅')), ', ')
         FROM internal.tag_link_purge_backup_20260512
        WHERE target_table IS DISTINCT FROM 'object'
           OR extra ->> 'source' IS DISTINCT FROM c_import_source);
  END IF;

  -- ---------------------------------------------------------------------------------
  -- F. La provenance est écrite à la source. Sans `created_by` + `extra.source` posés par
  --    le RPC éditeur, une écriture humaine est indiscernable d'un import — c'est le
  --    défaut qui a failli faire supprimer 6 lignes d'agent par la première version de la
  --    migration. Garde de non-régression : ré-appliquer l'ancien
  --    `object_workspace_gap_rpcs.sql` ferait tomber ce test.
  -- ---------------------------------------------------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'save_object_workspace_tags'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'test 16p F : api.save_object_workspace_tags introuvable';
  END IF;
  IF position('created_by' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'test 16p F : api.save_object_workspace_tags n''écrit pas created_by — une saisie éditeur serait indiscernable d''un import (§203)';
  END IF;
  IF position('''editor''' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'test 16p F : api.save_object_workspace_tags ne stampe pas extra.source = ''editor'' (§203)';
  END IF;

  -- ---------------------------------------------------------------------------------
  -- G (16q). Tout lien posé par les règles curées porte SA règle dans `extra.rule`, et
  --    pointe vers un des 3 tags choisis. C'est ce qui rend chaque tag révocable seul
  --    (rollback par règle) et ce qui interdit qu'une passe future repose des liens en
  --    masse sans se nommer — la faute exacte de l'import de mai.
  -- ---------------------------------------------------------------------------------
  SELECT count(*) INTO v_n
  FROM public.tag_link tl
  LEFT JOIN public.ref_tag t ON t.id = tl.tag_id
  WHERE tl.extra ->> 'source' = 'tag_rules_20260729'
    AND (tl.extra ->> 'rule' IS NULL
         OR t.slug IS DISTINCT FROM tl.extra ->> 'rule'
         OR t.slug NOT IN ('vue_mer','feu_de_bois','case_creole'));
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'test 16q G : % lien(s) de règle sans `extra.rule` cohérent — un lien non nommé n''est pas révocable seul (§203)', v_n;
  END IF;

  RAISE NOTICE 'test 16p : OK — catalogue = %, sauvegarde = % ligne(s)',
    (SELECT COALESCE(string_agg(slug, ', ' ORDER BY slug), '(vide)') FROM public.ref_tag),
    (SELECT count(*) FROM internal.tag_link_purge_backup_20260512);
END $$;
