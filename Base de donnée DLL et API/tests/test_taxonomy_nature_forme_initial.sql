-- Assertions for the exact pre-§190 state after rollback. Caller owns transaction.
DO $initial_test$
DECLARE
  v_published INTEGER;
  v_bad TEXT;
  v_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER INTO v_published
  FROM object WHERE object_type = 'HLO' AND status = 'published';

  WITH expected(child_code, parent_code) AS (VALUES
    ('chambre_d_hotes', 'root'),
    ('location_saisonniere', 'root'),
    ('gite_de_groupe', 'gite_d_etape_et_de_randonnee'),
    ('gite_de_randonnee', 'gite_d_etape_et_de_randonnee')
  )
  SELECT string_agg(e.child_code || '->' || COALESCE(p.code, '<missing>'), ', ' ORDER BY e.child_code)
  INTO v_bad
  FROM expected e
  LEFT JOIN ref_code c ON c.domain = 'taxonomy_hlo' AND c.code = e.child_code
  LEFT JOIN ref_code p ON p.id = c.parent_id AND p.domain = c.domain
  WHERE p.code IS DISTINCT FROM e.parent_code;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'rollback T1: wrong restored parents: %', v_bad;
  END IF;

  WITH expected(code, name) AS (VALUES
    ('lodges', 'Lodges'),
    ('hebergement_insolite', 'Hébergement Insolite'),
    ('location_saisonniere', 'Location saisonnière'),
    ('maison', 'Maison'),
    ('gite_de_randonnee', 'Gîte de randonnée')
  )
  SELECT string_agg(e.code, ', ' ORDER BY e.code) INTO v_bad
  FROM expected e
  LEFT JOIN ref_code rc ON rc.domain = 'taxonomy_hlo' AND rc.code = e.code
  WHERE rc.name IS DISTINCT FROM e.name
     OR rc.description IS DISTINCT FROM e.name
     OR rc.name_i18n->>'fr' IS DISTINCT FROM e.name
     OR rc.description_i18n->>'fr' IS DISTINCT FROM e.name;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'rollback T1: wrong restored labels: %', v_bad;
  END IF;

  SELECT string_agg(rc.code, ', ' ORDER BY rc.code) INTO v_bad
  FROM ref_code rc
  WHERE rc.domain = 'taxonomy_hlo'
    AND rc.code IN (
      'hebergement_locatif','cdh_maison','cdh_bungalow','bungalow','chalet',
      'hebergement_collectif','auberge_collective'
    )
    AND (rc.is_active OR rc.is_assignable OR EXISTS (
      SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id
    ));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'rollback T1: created nodes active, assignable or carried: %', v_bad;
  END IF;

  SELECT string_agg(rc.code, ', ' ORDER BY rc.code) INTO v_bad
  FROM ref_code rc
  WHERE rc.domain = 'taxonomy_hlo'
    AND rc.code IN ('gite_villa','bungalow_chalet','cottage','rez_de_chaussee_d_une_maison')
    AND (NOT rc.is_active OR NOT rc.is_assignable);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'rollback T1: old destinations not active/assignable: %', v_bad;
  END IF;

  IF v_published = 476 THEN
    SELECT string_agg(b.object_id, ', ' ORDER BY b.object_id) INTO v_bad
    FROM _taxonomy_nature_forme_before_state b
    LEFT JOIN object_taxonomy ot ON ot.object_id = b.object_id AND ot.domain = b.domain
    LEFT JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
    WHERE rc.code IS DISTINCT FROM b.old_code
       OR ot.ref_code_id IS DISTINCT FROM b.old_ref_code_id
       OR ot.source IS DISTINCT FROM b.old_source
       OR ot.note IS DISTINCT FROM b.old_note;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'rollback T2: before-state mismatch: %', v_bad;
    END IF;

    SELECT count(*) INTO v_count
    FROM object_taxonomy ot
    JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
    WHERE ot.domain = 'taxonomy_hlo' AND rc.code IN ('gite_villa','bungalow_chalet');
    IF v_count <> 231 THEN
      RAISE EXCEPTION 'rollback T2: legacy carrier count %, expected 231', v_count;
    END IF;
  END IF;
END
$initial_test$;
