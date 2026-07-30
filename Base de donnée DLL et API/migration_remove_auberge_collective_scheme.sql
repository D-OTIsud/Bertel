-- =====================================================================
-- migration_remove_auberge_collective_scheme.sql — 16s (§206)
--
-- Réunion « Point V3 BERTEL » du 2026-07-17 (01:22:34) : une auberge
-- collective n'est PAS classable en étoiles — c'est une catégorie DÉCLARÉE
-- (art. L325-1 du Code du tourisme), sans référentiel Atout France, même
-- logique que les chambres d'hôtes. Le schéma `auberge_collective_stars`
-- venait d'un excès de périmètre de l'expansion §71 (14d).
--
-- Invariant §196 : le retrait se fait dans le CATALOGUE, à la source —
-- `seeds_data.sql`, `migration_classification_labels_expansion.sql` (14d)
-- et `migration_classification_scheme_applicability.sql` (16n) n'insèrent
-- plus ce schéma. Cette migration converge un live déjà seedé ; elle est
-- un no-op complet sur base fraîche. Aucun code frontend ne référence le
-- code (vérifié) : les surfaces sont pilotées par le catalogue.
--
-- Idempotent. Fail-closed : refuse si une attribution `object_classification`
-- existe (0 sur live au 2026-07-30 — un usage apparu depuis exige un
-- arbitrage, pas une suppression silencieuse).
-- =====================================================================

BEGIN;

DO $$
DECLARE v_usage int;
BEGIN
  SELECT count(*) INTO v_usage
  FROM object_classification oc
  JOIN ref_classification_scheme s ON s.id = oc.scheme_id
  WHERE s.code = 'auberge_collective_stars';
  IF v_usage > 0 THEN
    RAISE EXCEPTION 'auberge_collective_stars porte % attribution(s) — arbitrage requis avant retrait', v_usage;
  END IF;
END $$;

-- L'applicabilité (16n) est en ON DELETE CASCADE ; les DELETE explicites
-- documentent le périmètre et restent no-op si déjà partis.
DELETE FROM ref_classification_scheme_applicability a
USING ref_classification_scheme s
WHERE s.id = a.scheme_id AND s.code = 'auberge_collective_stars';

DELETE FROM ref_classification_value v
USING ref_classification_scheme s
WHERE s.id = v.scheme_id AND s.code = 'auberge_collective_stars';

DELETE FROM ref_classification_scheme WHERE code = 'auberge_collective_stars';

COMMIT;
