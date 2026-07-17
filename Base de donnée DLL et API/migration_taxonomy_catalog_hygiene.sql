-- =============================================================================
-- migration_taxonomy_catalog_hygiene.sql — §187 lot D : hygiène du catalogue (2026-07-17)
-- Manifest step 13i. Idempotent. APRÈS 13g + 13h (les désactivations supposent
-- que les porteurs ont été recodés/retypés). On DÉSACTIVE (is_active=false,
-- is_assignable=false), on ne supprime JAMAIS un code (FK potentielles + historique).
-- Garde fail-closed : un code à désactiver qui a encore des porteurs ⇒ abort.
-- Exclusions volontaires : taxonomy_loi/chocolatier (1 porteur archivé),
-- taxonomy_res/autre_type_de_restauration (fourre-tout conservé).
-- =============================================================================
BEGIN;

-- ZAMPONE : dernier porteur du quasi-doublon `artisanat` → `art_artisanat`.
UPDATE object_taxonomy ot
SET ref_code_id = rc2.id,
    source = 'taxonomy_hygiene_20260717',
    note = 'Fusion §187 lot D — artisanat → art_artisanat',
    updated_at = NOW()
FROM ref_code rc1, ref_code rc2
WHERE rc1.domain = 'taxonomy_loi' AND rc1.code = 'artisanat'
  AND rc2.domain = 'taxonomy_loi' AND rc2.code = 'art_artisanat'
  AND ot.object_id = 'LOIRUN00000000V1' AND ot.domain = 'taxonomy_loi'
  AND ot.ref_code_id = rc1.id;

CREATE TEMP TABLE _deact (domain text, code text, PRIMARY KEY (domain, code)) ON COMMIT DROP;
INSERT INTO _deact (domain, code) VALUES
  -- RES : doublon orthographique + concept d'hébergement
  ('taxonomy_res', 'table_d_hotes'),
  ('taxonomy_res', 'chambre_d_hote'),
  -- LOI : codes « prestation » qui doublonnent ACT/PSV (0 usage après lot B) + quasi-doublons
  ('taxonomy_loi', 'randonnee_pedestre'),
  ('taxonomy_loi', 'speleologie_tunnels_de_lave'),
  ('taxonomy_loi', 'guide_accompagnateur_touristique'),
  ('taxonomy_loi', 'v_t_t_autres_cycles'),
  ('taxonomy_loi', 'restauration_traditionnelle'),
  ('taxonomy_loi', 'terre'),
  ('taxonomy_loi', 'terroir'),
  ('taxonomy_loi', 'horticulture'),
  ('taxonomy_loi', 'art'),
  ('taxonomy_loi', 'artisanat'),
  ('taxonomy_loi', 'visite_guidee'),
  -- HLO : doublon + code orphelin
  ('taxonomy_hlo', 'gite_d_etape_et_de_randonnee'),
  ('taxonomy_hlo', 'auberge'),
  -- ORG : domaine hérité entier (une ORG ne porte pas de taxonomie métier)
  ('taxonomy_org', 'autocar_compagnie'),
  ('taxonomy_org', 'services'),
  ('taxonomy_org', 'excursion_touristique'),
  ('taxonomy_org', 'location_de_voiture_avec_chauffeur'),
  ('taxonomy_org', 'massage_bien_etre'),
  ('taxonomy_org', 'v_t_t_autres_cycles'),
  ('taxonomy_org', 'vtc');

-- AUTO-RETRAIT (codes qui peuvent encore porter des fiches légitimement) :
--  * visite_guidee : porteurs LÉGITIMES restants (lieux qui se visitent — Domaine
--    Archambaud, Entre 2 Songes, jardins…) ; ne se désactivera que si l'OTI les recode.
--  * terre : encore porté par Bouillon d'Aventure (LOIRUN00000000YR), en arbitrage
--    lot C (ASC sports_club vs LOI divertissement) ; se libérera après la réponse OTI.
-- Ces deux codes sortent du lot s'ils ont des porteurs, au lieu de faire échouer la garde.
DELETE FROM _deact d
USING ref_code rc
WHERE rc.domain = d.domain AND rc.code = d.code
  AND EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id)
  AND d.code IN ('visite_guidee', 'terre');

-- Garde fail-closed pour tout le reste : porteurs restants ⇒ abort.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(d.domain || '/' || d.code || '=' ||
         (SELECT count(*) FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id)::text, ', ') INTO v
  FROM _deact d
  JOIN ref_code rc ON rc.domain = d.domain AND rc.code = d.code
  WHERE EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot D: codes encore portés (lots A/B pas appliqués ?): %', v;
  END IF;
END $$;

UPDATE ref_code rc
SET is_active = FALSE, is_assignable = FALSE, updated_at = NOW()
FROM _deact d
WHERE rc.domain = d.domain AND rc.code = d.code
  AND (rc.is_active OR rc.is_assignable);

UPDATE ref_code_domain_registry
SET is_active = FALSE, updated_at = NOW()
WHERE domain = 'taxonomy_org' AND is_active;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
