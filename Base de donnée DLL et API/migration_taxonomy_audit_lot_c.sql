-- =============================================================================
-- migration_taxonomy_audit_lot_c.sql — §187 lot C : arbitrages PO appliqués (2026-07-17)
-- Manifest step 13j. Idempotent — re-run = no-op. Après 13g/13h/13i.
-- Les 20 arbitrages du handoff docs/taxonomy-audit-lot-c-oti-handoff-2026-07-17.md
-- ont été rendus EN SESSION par le PO (OTI du Sud) le 2026-07-17 :
--   * 8 recodages (dont NANA BARKET & Irise → traiteur, Bouillon d'Aventure →
--     divertissement, les 2 HLO récentes → gite_villa) ;
--   * 3 archivages : Le Tinto (ÉTABLISSEMENT FERMÉ), doublon Auberge de campagne
--     Les 4 Saisons (19T, fiche vide), doublon La Caverne des Hirondelles (PX) ;
--   * 9 fiches confirmées inchangées (Ti Macaron, pizzerias ×2, Dolly La Fêe,
--     Crins de Bel Air, Aster Lontan, Sucette péï, Austral Taxis, Ti Kaz Misouk) ;
--   * La Rose du Sud ×2 = deux unités légitimes (pas un doublon).
-- Libérations de codes : `terre` (LOI) et `chambre` (HLO) tombent à 0 usage ⇒
-- désactivés ici (complète le lot D qui les avait auto-retirés).
-- Un objet ABSENT = no-op (base fraîche) ; PRÉSENT au mauvais type = RAISE.
-- =============================================================================
BEGIN;

-- Le trigger guard_object_status_change exige service_role/superuser pour les
-- archivages ; sur une base fraîche l'UPDATE ne matche rien et le trigger ne
-- se déclenche pas (SET LOCAL sans effet de bord).
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
SET LOCAL "request.jwt.claim.role" = 'service_role';

-- ---------------------------------------------------------------------------
-- 1. Recodages / assignations (arbitrages PO)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _lot_c (
  object_id text PRIMARY KEY,
  exp_type  text NOT NULL,
  domain    text NOT NULL,
  new_code  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _lot_c (object_id, exp_type, domain, new_code) VALUES
  ('RESRUN00000000SH','RES','taxonomy_res','traiteur'),                    -- NANA BARKET & FASTFOOD (était service_de_livraison) — « traiteur qui fait de la livraison »
  ('RESRUN00000000PO','RES','taxonomy_res','traiteur'),                    -- Irise Traiteur (était restaurant)
  ('RESRUN00000000PW','RES','taxonomy_res','snack_bar'),                   -- Snack Le Boi Zoly (était restaurant)
  ('ORGRUN000000014S','PSV','taxonomy_psv','tourist_excursion_transport'), -- Couleurs du Sud Sauvage - EXCURSIONS (était private_driver)
  ('HLORUN00000000NU','HLO','taxonomy_hlo','chambre_d_hotes'),             -- Zévi sur Mer (était chambre — code vague, dernier usage)
  ('LOIRUN00000000YR','LOI','taxonomy_loi','divertissement'),              -- Bouillon d'Aventure (était terre — code désactivable ensuite)
  ('HLORUN00000001B8','HLO','taxonomy_hlo','gite_villa'),                  -- L'Or du Temps (aucune)
  ('HLORUN00000001BF','HLO','taxonomy_hlo','gite_villa');                  -- La Kaz Bon Dimanche (aucune)

DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(m.object_id || '(' || o.object_type || ')', ', ') INTO v
  FROM _lot_c m JOIN object o ON o.id = m.object_id
  WHERE o.object_type::text <> m.exp_type;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot C: type inattendu: %', v;
  END IF;

  SELECT string_agg(DISTINCT m.domain || '/' || m.new_code, ', ') INTO v
  FROM _lot_c m
  JOIN object o ON o.id = m.object_id
  LEFT JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
  WHERE rc.id IS NULL;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot C: codes cibles inconnus: %', v;
  END IF;
END $$;

UPDATE object_taxonomy ot
SET ref_code_id = rc.id,
    source = 'taxonomy_audit_lot_c_20260717',
    note = 'Arbitrage PO §187 lot C (2026-07-17)',
    updated_at = NOW()
FROM _lot_c m
JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
WHERE ot.object_id = m.object_id
  AND ot.domain = m.domain
  AND ot.ref_code_id <> rc.id;

INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT m.object_id, m.domain, rc.id,
       'taxonomy_audit_lot_c_20260717',
       'Arbitrage PO §187 lot C — fiche sans sous-catégorie'
FROM _lot_c m
JOIN object o ON o.id = m.object_id
JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
WHERE NOT EXISTS (
  SELECT 1 FROM object_taxonomy ot
  WHERE ot.object_id = m.object_id AND ot.domain = m.domain
)
ON CONFLICT (object_id, domain) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Archivages (jamais de DELETE — §108)
--    Le Tinto = établissement FERMÉ ; 19T et PX = doublons confirmés par le PO.
-- ---------------------------------------------------------------------------
UPDATE object
SET status = 'archived', updated_at = NOW()
WHERE id IN (
  'RESRUN00000000PR',  -- Le Tinto — fermé (arbitrage PO 2026-07-17)
  'HLORUN000000019T',  -- Auberge de campagne Les 4 Saisons — doublon vide de HLORUN00000000WW
  'HLORUN00000000PX'   -- La Caverne des Hirondelles — doublon de HLORUN00000000PD
)
AND status <> 'archived';

-- ---------------------------------------------------------------------------
-- 3. Codes libérés par cette passe → désactivation (garde 0-usage fail-closed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(rc.domain || '/' || rc.code, ', ') INTO v
  FROM ref_code rc
  WHERE (rc.domain, rc.code) IN (('taxonomy_loi','terre'), ('taxonomy_hlo','chambre'))
    AND EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot C: codes encore portés, désactivation refusée: %', v;
  END IF;
END $$;

UPDATE ref_code
SET is_active = FALSE, is_assignable = FALSE, updated_at = NOW()
WHERE (domain, code) IN (('taxonomy_loi','terre'), ('taxonomy_hlo','chambre'))
  AND (is_active OR is_assignable);

-- ---------------------------------------------------------------------------
-- 4. Caches par objet touché (recodages + archivages)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN
    SELECT m.object_id FROM _lot_c m JOIN object o ON o.id = m.object_id
    UNION
    SELECT x.id FROM (VALUES ('RESRUN00000000PR'),('HLORUN000000019T'),('HLORUN00000000PX')) AS x(id)
    JOIN object o ON o.id = x.id
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
