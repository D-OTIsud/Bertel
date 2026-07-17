-- =============================================================================
-- migration_taxonomy_audit_lot_a.sql — §187 lot A : 23 corrections intra-domaine (2026-07-17)
-- Manifest step 13g. Idempotent — re-run = no-op. Après seeds (step 11) + 13f.
-- Audit source : docs/taxonomy-audit-all-domains-2026-07-17.md (§A).
-- Un objet ABSENT = no-op (base fraîche) ; un objet PRÉSENT au mauvais type = RAISE.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _lot_a (
  object_id text PRIMARY KEY,
  exp_type  text NOT NULL,
  domain    text NOT NULL,
  new_code  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _lot_a (object_id, exp_type, domain, new_code) VALUES
  -- RES
  ('RESRUN00000000XP','RES','taxonomy_res','table_d_hote'),      -- La Ferme du Kilimandjaro (était chambre_d_hote)
  ('RESRUN00000000X9','RES','taxonomy_res','table_d_hote'),      -- Le Caloupilé (était chambre_d_hote)
  ('RESRUN00000000OG','RES','taxonomy_res','restaurant'),        -- L'Orchidéa (était salle_de_reception)
  ('RESRUN000000019W','RES','taxonomy_res','table_d_hote'),      -- Fleur de Vanille (était auberge_de_campagne)
  ('RESRUN00000000SY','RES','taxonomy_res','restaurant'),        -- LABEL FOURCHETTE (était restauration_traditionnelle)
  ('RESRUN00000000WC','RES','taxonomy_res','bar_a_jus'),         -- Kaban'a Jus (était gato_pei)
  ('RESRUN00000001B1','RES','taxonomy_res','restaurant'),        -- Allon Manger (aucune)
  ('RESRUN00000001B6','RES','taxonomy_res','restaurant'),        -- Chez Mamie Poulette (aucune)
  -- LOI
  ('LOIRUN000000013W','LOI','taxonomy_loi','wellness'),          -- Mon Voyage Fleuri (était artisanat_bijoux)
  ('LOIRUN000000019H','LOI','taxonomy_loi','divertissement'),    -- GAMIKIT (était atelier)
  ('LOIRUN000000016S','LOI','taxonomy_loi','patrimoine_culturel'),-- Assoc. Tradition et Passions (était restauration_traditionnelle)
  ('LOIRUN00000001AY','LOI','taxonomy_loi','atelier'),           -- Bat'Karèv & Trois Petits Points (aucune)
  ('LOIRUN00000001B4','LOI','taxonomy_loi','art_artisanat'),     -- La Récup de TiCha (aucune)
  ('LOIRUN00000001AW','LOI','taxonomy_loi','wellness'),          -- Les Passerelles du Bien-Être (aucune)
  -- PRD
  ('LOIRUN00000001AJ','PRD','taxonomy_prd','apiculture'),        -- Apiculture Reunion (était agrotourisme)
  ('LOIRUN000000016Z','PRD','taxonomy_prd','apiculture'),        -- Le Rucher du Petit Piton (était exploitation_agricole)
  ('PRDRUN00000001AX','PRD','taxonomy_prd','apiculture'),        -- APIC974 (aucune)
  ('PRDRUN00000001B9','PRD','taxonomy_prd','produits_terroir'),  -- L'instant Philippine (aucune)
  -- PSV
  ('PSVRUN000000014A','PSV','taxonomy_psv','location_vehicule'), -- HGL Location (était vtc)
  -- HLO
  ('HLORUN00000001BH','HLO','taxonomy_hlo','bungalow_chalet'),   -- Fanjan (aucune)
  ('HLORUN00000001B5','HLO','taxonomy_hlo','gite_villa'),        -- L'Océan de Brilune (aucune)
  ('HLORUN00000001B3','HLO','taxonomy_hlo','gite_villa'),        -- Villa Evilou (aucune)
  ('HLORUN00000001BE','HLO','taxonomy_hlo','gite_villa');        -- Villa Les Margosiers (aucune)

-- Gardes fail-closed : type inattendu (objet présent) OU code cible inconnu ⇒ abort.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(m.object_id || '(' || o.object_type || ')', ', ') INTO v
  FROM _lot_a m JOIN object o ON o.id = m.object_id
  WHERE o.object_type::text <> m.exp_type;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot A: type inattendu (audit périmé ?): %', v;
  END IF;

  SELECT string_agg(DISTINCT m.domain || '/' || m.new_code, ', ') INTO v
  FROM _lot_a m
  LEFT JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
  WHERE rc.id IS NULL;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot A: codes cibles inconnus: %', v;
  END IF;
END $$;

-- Corrections des assignations existantes.
UPDATE object_taxonomy ot
SET ref_code_id = rc.id,
    source = 'taxonomy_audit_lot_a_20260717',
    note = 'Correction §187 lot A (audit tous domaines)',
    updated_at = NOW()
FROM _lot_a m
JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
WHERE ot.object_id = m.object_id
  AND ot.domain = m.domain
  AND ot.ref_code_id <> rc.id;

-- Fiches sans sous-catégorie (le JOIN object garantit le no-op sur base fraîche).
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT m.object_id, m.domain, rc.id,
       'taxonomy_audit_lot_a_20260717',
       'Correction §187 lot A — fiche sans sous-catégorie avant la passe'
FROM _lot_a m
JOIN object o ON o.id = m.object_id
JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
WHERE NOT EXISTS (
  SELECT 1 FROM object_taxonomy ot
  WHERE ot.object_id = m.object_id AND ot.domain = m.domain
)
ON CONFLICT (object_id, domain) DO NOTHING;

-- Caches de filtre par objet touché.
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN SELECT m.object_id FROM _lot_a m JOIN object o ON o.id = m.object_id
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
