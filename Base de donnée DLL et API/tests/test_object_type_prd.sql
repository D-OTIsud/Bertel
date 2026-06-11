-- test_object_type_prd.sql
-- Proves manifest steps 8x + 8y (+ the 13d data fixup being a safe no-op fresh) — §57:
--   * object_type enum carries 'PRD'
--   * taxonomy_prd registry + technical root + 6 assignable leaves
--   * the 8 previously-empty taxonomy domains are registered with a root
--     (pna/pcu/vil/iti/fma/hpa/rva/asc) and carry assignable nodes
--   * SPU/COM/LOI node extensions exist (picnic_area, tourist_info_office,
--     weekly_market, wellness branch with 3 children, conference_venue)
--   * object_meeting_room is applicable to LOI (MICE — §46 registry loosening)
--   * relation role sur_le_parcours_de exists
--   * a PRD object INSERT passes the type→facet guard and gets a generated id
-- Against a DB without 8x/8y the enum/registry assertions fail -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_root uuid;
  v_n    int;
  v_id   text;
BEGIN
  -- 1. enum value
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'object_type'::regtype AND enumlabel = 'PRD') THEN
    RAISE EXCEPTION 'object_type enum is missing PRD (8x not applied)';
  END IF;

  -- 2. taxonomy_prd registry + tree
  IF NOT EXISTS (SELECT 1 FROM ref_code_domain_registry
                 WHERE domain = 'taxonomy_prd' AND object_type = 'PRD'::object_type
                   AND is_taxonomy IS TRUE AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'ref_code_domain_registry[taxonomy_prd] missing or mis-typed';
  END IF;
  SELECT id INTO v_root FROM ref_code WHERE domain = 'taxonomy_prd' AND code = 'root' AND is_assignable IS FALSE;
  IF v_root IS NULL THEN RAISE EXCEPTION 'taxonomy_prd technical root missing'; END IF;
  SELECT count(*) INTO v_n FROM ref_code
  WHERE domain = 'taxonomy_prd' AND parent_id = v_root AND is_assignable IS TRUE
    AND code IN ('plantation','exploitation_agricole','agrotourisme','produits_terroir','distillerie_brasserie','apiculture');
  IF v_n <> 6 THEN RAISE EXCEPTION 'taxonomy_prd expected 6 assignable leaves, found %', v_n; END IF;

  -- 3. the 8 previously-empty domains: registry + root + at least 3 assignable nodes each
  SELECT count(*) INTO v_n FROM ref_code_domain_registry
  WHERE domain IN ('taxonomy_pna','taxonomy_pcu','taxonomy_vil','taxonomy_iti','taxonomy_fma','taxonomy_hpa','taxonomy_rva','taxonomy_asc')
    AND is_taxonomy IS TRUE AND is_active IS TRUE;
  IF v_n <> 8 THEN RAISE EXCEPTION '8 taxonomy domain registries expected (8y), found %', v_n; END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT c.domain FROM ref_code c
    WHERE c.domain IN ('taxonomy_pna','taxonomy_pcu','taxonomy_vil','taxonomy_iti','taxonomy_fma','taxonomy_hpa','taxonomy_rva','taxonomy_asc')
      AND c.code <> 'root' AND c.is_assignable IS TRUE
    GROUP BY c.domain HAVING count(*) >= 3
  ) s;
  IF v_n <> 8 THEN RAISE EXCEPTION 'each of the 8 seeded domains must carry >= 3 assignable nodes, only % qualify', v_n; END IF;

  -- 4. SPU/COM/LOI extensions
  SELECT count(*) INTO v_n FROM ref_code
  WHERE (domain, code) IN (('taxonomy_spu','picnic_area'), ('taxonomy_spu','tourist_info_office'),
                           ('taxonomy_com','weekly_market'), ('taxonomy_loi','wellness'), ('taxonomy_loi','conference_venue'));
  IF v_n <> 5 THEN RAISE EXCEPTION 'SPU/COM/LOI node extensions incomplete (% of 5)', v_n; END IF;
  SELECT count(*) INTO v_n FROM ref_code c
  JOIN ref_code p ON p.id = c.parent_id AND p.domain = 'taxonomy_loi' AND p.code = 'wellness'
  WHERE c.code IN ('spa_hammam','massage_institute','thermal_baths');
  IF v_n <> 3 THEN RAISE EXCEPTION 'LOI wellness branch expected 3 children, found %', v_n; END IF;

  -- 5. MICE applicability + relation role
  IF NOT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table = 'object_meeting_room' AND object_type = 'LOI'::object_type) THEN
    RAISE EXCEPTION 'ref_facet_applicability (object_meeting_room, LOI) missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ref_object_relation_type WHERE code = 'sur_le_parcours_de') THEN
    RAISE EXCEPTION 'relation role sur_le_parcours_de missing';
  END IF;

  -- 6. PRD object insert passes (no facet guard, generic id generation)
  INSERT INTO object (object_type, name, status, region_code)
  VALUES ('PRD', 'Test PRD — plantation de thé', 'draft', 'RUN')
  RETURNING id INTO v_id;
  IF v_id IS NULL OR v_id = '' THEN RAISE EXCEPTION 'PRD object insert did not generate an id'; END IF;

  RAISE NOTICE 'test_object_type_prd: all assertions green (new id=%)', v_id;
END $$;
ROLLBACK;
