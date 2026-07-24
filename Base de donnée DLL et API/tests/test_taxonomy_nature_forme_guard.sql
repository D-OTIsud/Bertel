-- Permanent, replayable §190 live-data guard.
-- The two explicit PO sources are the only exemptions. NULL must fail closed.
DO $taxonomy_nature_forme_guard$
DECLARE
  v_bad TEXT;
BEGIN
  WITH mismatches AS (
    SELECT o.id, o.name, o.extra->>'source_category' AS berta, leaf.code AS leaf_code
    FROM object o
    JOIN object_taxonomy ot
      ON ot.object_id = o.id
     AND ot.domain = 'taxonomy_hlo'
     AND COALESCE(ot.source, '') NOT IN (
       'taxonomy_audit_lot_c_20260717',
       'taxonomy_nature_forme_arbitrage_20260724'
     )
    JOIN ref_code leaf ON leaf.id = ot.ref_code_id AND leaf.domain = ot.domain
    LEFT JOIN ref_code_taxonomy_closure cl
      ON cl.domain = 'taxonomy_hlo'
     AND cl.descendant_id = leaf.id
    LEFT JOIN ref_code nature
      ON nature.id = cl.ancestor_id
     AND nature.domain = cl.domain
     AND nature.code = CASE o.extra->>'source_category'
       WHEN 'Chambre d''hôtes' THEN 'chambre_d_hotes'
       WHEN 'Location saisonnière' THEN 'location_saisonniere'
       WHEN 'Gîte d''étape et de randonnée' THEN 'hebergement_collectif'
     END
    WHERE o.object_type = 'HLO'
      AND o.status = 'published'
      AND o.extra->>'source_category' IS NOT NULL
    GROUP BY o.id, o.name, o.extra->>'source_category', leaf.code
    HAVING count(nature.id) = 0
  )
  SELECT string_agg(id || ':' || leaf_code || '<>' || berta, ', ' ORDER BY id)
  INTO v_bad
  FROM mismatches;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy nature/forme guard failed: %', v_bad;
  END IF;
END
$taxonomy_nature_forme_guard$;

DO $$ BEGIN RAISE NOTICE 'test_taxonomy_nature_forme_guard.sql: OK'; END $$;
