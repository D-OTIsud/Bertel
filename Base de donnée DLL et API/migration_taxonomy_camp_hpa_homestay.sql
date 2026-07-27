-- =============================================================================
-- migration_taxonomy_camp_hpa_homestay.sql
-- §191 — « Camping chez l'habitant » rejoint l'hébergement de plein air (HPA)
-- Manifest : taxo3 (après taxo. migration_taxonomy_trees_seed.sql)
-- Live : appliquée le 2026-07-27 à 08:59 RUN, contrôles verts.
-- =============================================================================
--
-- POURQUOI
--   §190 a relibellé CAMP « Camping classé » (terrain relevant du classement
--   officiel) et HPA « Hébergement de plein air » (offre de plein air NON
--   classée : aire naturelle, camping à la ferme, aire camping-car, insolite).
--   La clarification est restée UI-only : le nœud `taxonomy_camp.camping_chez_
--   l_habitant` — un camping chez un particulier, par nature hors classement —
--   est resté du côté « classé ». Même lot d'import fautif que les régressions
--   HLO de §190 (`old_data_enrichment_20260512`).
--
--   Invariant appliqué (CLAUDE.md, « la nature précède la forme ») : la nature
--   réglementaire (classé / non classé) choisit la branche ; « chez l'habitant »
--   est une FORME de plein air non classé, sœur de `farm_camping`.
--
-- PORTÉE (live 2026-07-27 : 3 CAMP publiés, 0 HPA)
--   - CAMRUN000000013J « Le Verger de la Chapelle »   (portait camping_chez_l_habitant)
--   - CAMRUN00000000PH « L'Eden du Randonneur (camping) » (portait `camping`,
--     aucun classement enregistré ; arbitrage PO 2026-07-27 : chez l'habitant)
--   - CAMRUN000000013G « Camping Pré-Vert Entre 2 Songes » : NON touché (reste CAMP)
--
-- NEUTRE POUR LES PARTENAIRES : CAMP et HPA mappent sur les mêmes classes cibles
--   sur les 4 profils (`ref_interop_crosswalk` : Apidae HOTELLERIE_PLEIN_AIR,
--   DATAtourisme Accommodation, schema.org Campground, Tourinsoft HPA).
--   Seul `updated_at` bouge ⇒ resynchronisation incrémentale automatique.
--
-- ORDRE IMPOSÉ par `trg_validate_object_taxonomy_assignment` :
--   le domaine `taxonomy_hpa` n'accepte que des objets `object_type='HPA'` et un
--   nœud `is_assignable` ⇒ créer le nœud, PUIS retyper l'objet, PUIS insérer la
--   ligne `object_taxonomy`. `trg_guard_object_type_change` est satisfait :
--   CAMP et HPA ont des `ref_facet_applicability` identiques (room_type + meeting_room).
--
-- IDEMPOTENT et re-jouable ; NO-OP sur une base fraîche (les UPDATE/DELETE sont
--   gardés sur la présence de l'objet AU BON type — §186 : un objet absent ne
--   doit pas faire échouer le gate CI fresh-apply).
--
-- APRÈS COMMIT (hors transaction, cf. bas de fichier) : rafraîchir les caches
--   objet puis les 2 MV.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Nouveau nœud `taxonomy_hpa.homestay_camping` (feuille, sœur de farm_camping)
-- -----------------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position, is_assignable,
                      name_i18n, description_i18n)
VALUES ('taxonomy_hpa', 'homestay_camping', 'Camping chez l''habitant',
        'Emplacements de camping chez un particulier, hors classement officiel',
        5, TRUE,
        '{"fr": "Camping chez l''habitant"}'::jsonb,
        '{"fr": "Emplacements de camping chez un particulier, hors classement officiel"}'::jsonb)
ON CONFLICT (domain, code) DO UPDATE
  SET name             = EXCLUDED.name,
      description      = EXCLUDED.description,
      position         = EXCLUDED.position,
      is_assignable    = EXCLUDED.is_assignable,
      name_i18n        = EXCLUDED.name_i18n,
      description_i18n = EXCLUDED.description_i18n;

-- Rattachement à la racine technique (closure reconstruite par trigger).
UPDATE ref_code c
   SET parent_id = p.id
  FROM ref_code p
 WHERE c.domain = 'taxonomy_hpa' AND c.code = 'homestay_camping'
   AND p.domain = 'taxonomy_hpa' AND p.code = 'root'
   AND c.parent_id IS DISTINCT FROM p.id;

-- -----------------------------------------------------------------------------
-- 2. Manifeste gelé des 2 porteurs → retype CAMP → HPA
--    (le DELETE de la ligne taxonomy_camp passe d'abord : le domaine camp
--     n'accepterait plus l'objet une fois retypé.)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _camp_hpa_manifest (object_id TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _camp_hpa_manifest (object_id)
VALUES ('CAMRUN000000013J'),   -- Le Verger de la Chapelle
       ('CAMRUN00000000PH');   -- L'Eden du Randonneur (camping)

DELETE FROM object_taxonomy ot
 USING _camp_hpa_manifest m, object o
 WHERE ot.object_id = m.object_id
   AND ot.object_id = o.id
   AND o.object_type = 'CAMP'          -- garde : ne rien faire si déjà migré
   AND ot.domain = 'taxonomy_camp';

UPDATE object o
   SET object_type = 'HPA',
       updated_at  = now()             -- explicite : les partenaires resynchronisent
  FROM _camp_hpa_manifest m
 WHERE o.id = m.object_id
   AND o.object_type = 'CAMP';

INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source)
SELECT o.id, 'taxonomy_hpa', rc.id, 'taxonomy_camp_hpa_20260727'
  FROM _camp_hpa_manifest m
  JOIN object o ON o.id = m.object_id AND o.object_type = 'HPA'
  JOIN ref_code rc ON rc.domain = 'taxonomy_hpa' AND rc.code = 'homestay_camping'
ON CONFLICT (object_id, domain) DO UPDATE
  SET ref_code_id = EXCLUDED.ref_code_id,
      source      = EXCLUDED.source;

-- -----------------------------------------------------------------------------
-- 3. Retrait du nœud de la branche « classé »
--    Désactivation (pas de DELETE) : conserve la closure et l'historique d'audit.
--    GOTCHA §187 : le même flip doit être reporté dans le snapshot
--    `migration_taxonomy_trees_seed.sql`, qui converge en FIN de manifest —
--    sinon le nœud est ré-armé assignable sur une base fraîche.
-- -----------------------------------------------------------------------------
UPDATE ref_code
   SET is_assignable = FALSE
 WHERE domain = 'taxonomy_camp'
   AND code = 'camping_chez_l_habitant'
   AND is_assignable IS DISTINCT FROM FALSE;

-- -----------------------------------------------------------------------------
-- 4. Asserts fail-closed (silencieux si OK)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_orphan   INT;
  v_hpa_node INT;
BEGIN
  -- 4a. Plus aucun porteur du nœud retiré, quel que soit son type.
  SELECT count(*) INTO v_orphan
    FROM object_taxonomy ot
    JOIN ref_code rc ON rc.id = ot.ref_code_id
   WHERE rc.domain = 'taxonomy_camp' AND rc.code = 'camping_chez_l_habitant';
  IF v_orphan > 0 THEN
    RAISE EXCEPTION '§191: % objet(s) portent encore taxonomy_camp.camping_chez_l_habitant', v_orphan;
  END IF;

  -- 4b. Le nœud cible existe, est assignable et rattaché à la racine HPA.
  SELECT count(*) INTO v_hpa_node
    FROM ref_code c
    JOIN ref_code p ON p.id = c.parent_id
   WHERE c.domain = 'taxonomy_hpa' AND c.code = 'homestay_camping'
     AND c.is_assignable AND p.domain = 'taxonomy_hpa' AND p.code = 'root';
  IF v_hpa_node <> 1 THEN
    RAISE EXCEPTION '§191: taxonomy_hpa.homestay_camping absent ou mal rattaché (%)', v_hpa_node;
  END IF;

  -- 4c. Les objets du manifeste PRÉSENTS sont bien HPA + classés chez l'habitant.
  --     (compte 0 sur une base fraîche : garde no-op, pas d'échec.)
  IF EXISTS (
    SELECT 1
      FROM _camp_hpa_manifest m
      JOIN object o ON o.id = m.object_id
     WHERE o.object_type <> 'HPA'
        OR NOT EXISTS (
             SELECT 1 FROM object_taxonomy ot
               JOIN ref_code rc ON rc.id = ot.ref_code_id
              WHERE ot.object_id = o.id
                AND rc.domain = 'taxonomy_hpa'
                AND rc.code = 'homestay_camping')
  ) THEN
    RAISE EXCEPTION '§191: un porteur du manifeste n''est pas HPA/homestay_camping';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- APRÈS COMMIT — à exécuter séparément (REFRESH ... CONCURRENTLY interdit en
-- bloc transactionnel). Le trigger sur `object_taxonomy` a déjà rafraîchi les
-- caches des 2 objets ; l'appel explicite est une ceinture-bretelles, les MV ne
-- sont PAS couvertes par le trigger.
--
--   SELECT api.refresh_object_filter_caches(id)
--     FROM object WHERE id IN ('CAMRUN000000013J','CAMRUN00000000PH');
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   NOTIFY pgrst, 'reload schema';
-- =============================================================================
