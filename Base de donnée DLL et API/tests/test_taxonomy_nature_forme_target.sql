-- Assertions for the §190 target state. Caller owns the transaction.
DO $target_test$
DECLARE
  v_published INTEGER;
  v_bad TEXT;
  v_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER INTO v_published
  FROM object WHERE object_type = 'HLO' AND status = 'published';

  IF v_published NOT IN (0, 476) THEN
    RAISE EXCEPTION 'T0 target: unexpected published HLO count %', v_published;
  END IF;

  WITH expected(code) AS (VALUES
    ('hebergement_locatif'), ('cdh_maison'), ('cdh_bungalow'),
    ('bungalow'), ('chalet'), ('hebergement_collectif'), ('auberge_collective')
  )
  SELECT string_agg(e.code, ', ' ORDER BY e.code) INTO v_bad
  FROM expected e
  LEFT JOIN ref_code rc
    ON rc.domain = 'taxonomy_hlo' AND rc.code = e.code
   AND rc.is_active AND rc.is_assignable
  WHERE rc.id IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T1 target: missing/inactive target nodes: %', v_bad;
  END IF;

  WITH expected(child_code, parent_code) AS (VALUES
    ('chambre_d_hotes', 'hebergement_locatif'),
    ('location_saisonniere', 'hebergement_locatif'),
    ('gite_de_groupe', 'hebergement_collectif'),
    ('gite_de_randonnee', 'hebergement_collectif')
  )
  SELECT string_agg(e.child_code || '->' || COALESCE(p.code, '<missing>'), ', ' ORDER BY e.child_code)
  INTO v_bad
  FROM expected e
  LEFT JOIN ref_code c ON c.domain = 'taxonomy_hlo' AND c.code = e.child_code
  LEFT JOIN ref_code p ON p.id = c.parent_id AND p.domain = c.domain
  WHERE p.code IS DISTINCT FROM e.parent_code;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T1 target: wrong parents: %', v_bad;
  END IF;

  -- ⚠️ CE TEST N'EST PLUS LIVE-AWARE POUR UN LIBELLÉ (audit §192, 2026-07-27).
  -- `location_saisonniere` attend ici le libellé posé par §190. C'est correct DANS
  -- LE MANIFEST — le test s'exécute juste après taxo2, avant que taxo4 (§192) ne
  -- renomme le nœud en « Meublé de tourisme » (« gîte » = appellation commerciale,
  -- pas une catégorie réglementaire — DGCCRF). Mais rejoué SEUL contre le live
  -- post-§192, il échouera sur cette ligne, et l'échec sera trompeur : le live est
  -- correct, c'est l'attente qui est dépassée.
  -- Le libellé courant est gardé par `tests/test_taxonomy_accommodation_vocabulary.sql`.
  -- Ne pas « corriger » cette valeur ici : elle assert l'état intermédiaire de §190.
  WITH expected(code, name) AS (VALUES
    ('lodges', 'Lodge'),
    ('hebergement_insolite', 'Autre hébergement insolite'),
    ('location_saisonniere', 'Meublé de tourisme / gîte'),
    ('maison', 'Maison / villa'),
    ('gite_de_randonnee', 'Refuge et gîte d''étape')
  )
  SELECT string_agg(e.code, ', ' ORDER BY e.code) INTO v_bad
  FROM expected e
  LEFT JOIN ref_code rc ON rc.domain = 'taxonomy_hlo' AND rc.code = e.code
  WHERE rc.name IS DISTINCT FROM e.name
     OR rc.description IS DISTINCT FROM e.name
     OR rc.name_i18n->>'fr' IS DISTINCT FROM e.name
     OR rc.description_i18n->>'fr' IS DISTINCT FROM e.name;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T1 target: wrong labels: %', v_bad;
  END IF;

  SELECT string_agg(rc.code, ', ' ORDER BY rc.code) INTO v_bad
  FROM ref_code rc
  WHERE rc.domain = 'taxonomy_hlo'
    AND rc.code IN ('gite_villa','bungalow_chalet','cottage','rez_de_chaussee_d_une_maison')
    AND (rc.is_active OR rc.is_assignable OR EXISTS (
      SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id
    ));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T1 target: legacy/folded nodes still active, assignable or carried: %', v_bad;
  END IF;

  SELECT count(*) INTO v_count
  FROM object_taxonomy ot
  JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
  WHERE ot.domain = 'taxonomy_hlo' AND rc.code IN ('gite_villa','bungalow_chalet');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T2 target: legacy carrier count %, expected 0', v_count;
  END IF;

  IF v_published = 476 THEN
    SELECT string_agg(m.object_id, ', ' ORDER BY m.object_id) INTO v_bad
    FROM _taxonomy_nature_forme_manifest m
    LEFT JOIN object_taxonomy ot ON ot.object_id = m.object_id AND ot.domain = 'taxonomy_hlo'
    LEFT JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
    WHERE rc.code IS DISTINCT FROM m.target_code
       OR ot.source IS DISTINCT FROM m.source
       OR ot.note IS DISTINCT FROM m.motif;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'T2 target: manifest mismatch: %', v_bad;
    END IF;

    SELECT string_agg(DISTINCT ot.object_id, ', ' ORDER BY ot.object_id) INTO v_bad
    FROM object_taxonomy ot
    JOIN object o ON o.id = ot.object_id AND o.object_type = 'HLO'
    JOIN ref_code_taxonomy_closure cl
      ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
    JOIN ref_code anc
      ON anc.id = cl.ancestor_id AND anc.domain = cl.domain AND anc.is_assignable
    WHERE ot.domain = 'taxonomy_hlo'
      AND NOT (COALESCE(o.cached_taxonomy_codes, '{}'::TEXT[]) @> ARRAY[ot.domain || ':' || anc.code]);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'T2 target: stale cached taxonomy ancestors for objects: %', v_bad;
    END IF;
  END IF;
END
$target_test$;
