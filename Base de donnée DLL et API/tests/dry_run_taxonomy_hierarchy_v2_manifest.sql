-- =============================================================================
-- dry_run_taxonomy_hierarchy_v2_manifest.sql
-- §200 — mesure du RAYON D'ACTION réel du déploiement (plan §14).
--
-- Ce n'est pas un test de correction : c'est la mesure que le plan exige AVANT
-- d'écrire en production. `api.refresh_object_filter_caches` réécrit
-- `search_document`, `search_document_text` et `search_document_phonetic`, trois
-- colonnes qui ne figurent PAS dans les listes ignorées des trois triggers
-- « changement métier » de `object`. Elles font donc bouger `updated_at` et
-- `current_version` — or `updated_at` est LE signal de reprise des
-- synchronisations partenaires (CLAUDE.md §197).
--
-- On ne SUPPOSE pas que N = le nombre de lignes rafraîchies : on le MESURE, on
-- vérifie qu'aucun objet hors manifeste n'a bougé, et la liste obtenue devient
-- l'assertion de production.
--
-- À jouer via `.tmp_pgapply/_v2_dryrun.cjs`, enchaîné après les migrations.
-- Ne persiste rien.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _taxonomy_refresh_manifest(object_id TEXT PRIMARY KEY, reason TEXT NOT NULL);
INSERT INTO _taxonomy_refresh_manifest VALUES
  ('HLORUN00000000ZV', 'porteur gite_de_groupe — libellé/axe modifié'),
  ('HLORUN000000011E', 'porteur gite_de_groupe — libellé/axe modifié'),
  ('HLORUN000000012H', 'porteur gite_de_groupe — libellé/axe modifié'),
  ('HLORUN000000017A', 'correction de nature Gîte Hydrangea'),
  ('CAMRUN000000013J', 'porteur homestay_camping + reprise D2 vers farm_camping'),
  ('CAMRUN00000000PH', 'porteur homestay_camping re-parenté + reprise Type d''unité'),
  ('CAMRUN000000013G', 'porteur CAMP — libellé/axe modifié + reprise Type d''unité'),
  ('HLORUN000000015Q', 'reprise Type d''unité'),
  ('HLORUN000000013Y', 'reprise Type d''unité'),
  ('HLORUN000000017V', 'reprise Type d''unité'),
  ('HLORUN00000000UW', 'reprise Type d''unité'),
  ('HLORUN000000018Q', 'reprise Type d''unité');

-- Témoin de TOUT le corpus, pas seulement du manifeste : c'est le seul moyen de
-- détecter un effet de bord du script sur une fiche qu'il n'était pas censé toucher.
CREATE TEMP TABLE _object_before AS
SELECT id, updated_at, current_version FROM object;

-- Le rafraîchissement BORNÉ, exactement celui de la production.
SELECT api.refresh_object_filter_caches(o.id)
  FROM object o
  JOIN _taxonomy_refresh_manifest m ON m.object_id = o.id;

DO $measure$
DECLARE
  v_moved      TEXT;
  v_moved_n    INT;
  v_outside    TEXT;
  v_missing    INT;
BEGIN
  -- Le manifeste doit être intégralement présent en base, sinon la mesure porte
  -- sur moins de fiches que la production.
  SELECT count(*) INTO v_missing
    FROM _taxonomy_refresh_manifest m
   WHERE NOT EXISTS (SELECT 1 FROM object o WHERE o.id = m.object_id);
  IF v_missing > 0 THEN
    RAISE NOTICE '§200 dry-run: % identifiant(s) du manifeste absents de cette base — mesure partielle', v_missing;
  END IF;

  SELECT string_agg(o.id || ' (v' || b.current_version || '→v' || o.current_version || ')', ', ' ORDER BY o.id),
         count(*)
    INTO v_moved, v_moved_n
    FROM object o
    JOIN _object_before b ON b.id = o.id
   WHERE o.updated_at IS DISTINCT FROM b.updated_at
      OR o.current_version IS DISTINCT FROM b.current_version;

  RAISE NOTICE '§200 dry-run: % fiche(s) dont updated_at ou current_version a bougé', COALESCE(v_moved_n, 0);
  RAISE NOTICE '§200 dry-run: %', COALESCE(v_moved, '(aucune)');

  -- LE contrôle qui compte : rien en dehors du manifeste.
  SELECT string_agg(o.id, ', ' ORDER BY o.id) INTO v_outside
    FROM object o
    JOIN _object_before b ON b.id = o.id
   WHERE (o.updated_at IS DISTINCT FROM b.updated_at
          OR o.current_version IS DISTINCT FROM b.current_version)
     AND NOT EXISTS (SELECT 1 FROM _taxonomy_refresh_manifest m WHERE m.object_id = o.id);

  IF v_outside IS NOT NULL THEN
    RAISE EXCEPTION
      '§200 dry-run: fiche(s) HORS manifeste modifiée(s) par le script — les synchronisations partenaires les reprendraient sans raison: %',
      v_outside;
  END IF;

  RAISE NOTICE '§200 dry-run: aucun objet hors manifeste modifié';
END
$measure$;

ROLLBACK;
