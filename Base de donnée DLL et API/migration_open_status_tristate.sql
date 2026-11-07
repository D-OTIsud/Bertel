-- =====================================================================
-- migration_open_status_tristate.sql  (manifest step 4d; decision log §133)
-- Pastille « ouvert/fermé » de l'Explorer — passage en TRI-ÉTAT.
--
-- SYMPTÔME (PO, cf. capture Explorer) : des fiches SANS aucune donnée d'ouverture
--   (277/362 fiches publiées live) affichent une pastille « Fermé », et la pastille
--   n'existait que pour HEB/RES. Attendu : « ni période d'ouverture ni horaire » ⇒
--   AUCUNE pastille ; « période d'ouverture (même sans horaires) » ⇒ pastille, pour
--   TOUS les types.
--
-- CAUSE RACINE : object.cached_is_open_now est un booléen BINAIRE. Son FALSE
--   confond deux états distincts — (a) « a des horaires, actuellement fermé » et
--   (b) « aucune donnée d'ouverture ». La carte Explorer rendait Boolean(open_now)
--   ⇒ les fiches sans données ressortaient « Fermé ». (Le tiroir gérait déjà le
--   tri-état openNow === true/false/null ; seule la carte confondait.)
--
-- FIX : cached_is_open_now devient VRAIMENT tri-état à sa source UNIQUE
--   (api.refresh_open_status) —
--     * NULL  quand la fiche n'a AUCUN opening_period (⇒ pas de pastille) ;
--     * TRUE  quand ouverte (dont le cas « jour ouvert sans horaire » déjà couvert
--             par le 2ᵉ EXISTS, cf. §93) ;
--     * FALSE quand elle a des horaires mais est actuellement fermée.
--   Toute période (même une fermeture/saison) compte comme « donnée présente » ⇒
--   verdict TRUE/FALSE. La colonne est déjà BOOLEAN NULLABLE : aucun changement de
--   schéma. Toutes les voies d'exposition (get_object_cards_batch, list_object_markers)
--   lisent o.cached_is_open_now directement ⇒ elles héritent du tri-état sans autre
--   changement. Le filtre « Ouvert maintenant » (cached_is_open_now = TRUE) exclut
--   déjà NULL — comportement inchangé. Le front rend la pastille ssi open_now !== null,
--   pour tous les types (la porte HEB/RES est retirée).
--
-- PÉRIMÈTRE « période sans horaires » : une journée marquée ouverte SANS plage
--   horaire (éditeur §14, save_object_openings insère time_period + weekday sans
--   time_frame) ⇒ 2ᵉ EXISTS ⇒ TRUE le jour concerné. Un import futur créant des
--   périodes SANS jours ni horaires ressortirait FALSE (aucun weekday à matcher) :
--   cas différé (0 donnée live aujourd'hui — arm3 à ajouter avec de vraies données
--   pour calibrer la sémantique « toujours ouvert » vs saisonnière). Voir décision §133.
--
-- BLAST RADIUS : api.refresh_open_status (cron toutes les 15 min) uniquement.
--   Signature inchangée (pas de reload PostgREST : appelée par le cron, pas un RPC
--   directement exposé). Après application : exécuter `SELECT api.refresh_open_status();`
--   puis rafraîchir internal.mv_filtered_objects pour basculer les fiches sans données
--   de FALSE → NULL immédiatement (le cron le ferait au prochain tick).
-- IDEMPOTENT : CREATE OR REPLACE. FOLDED dans schema_unified.sql (fresh == live).
-- REVERSIBLE : restaurer l'expression `(arm1 OR arm2) AS new_is_open_now` sans le CASE.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION api.refresh_open_status()
RETURNS void
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  WITH open_state AS (
    SELECT
      o.id,
      CASE
        -- Aucune donnée d'ouverture (aucun opening_period) → NULL = « pas de pastille ».
        -- N'importe quel opening_period (même une fermeture/saison) compte comme donnée
        -- présente ⇒ on garde un verdict TRUE/FALSE ci-dessous.
        WHEN NOT EXISTS (
          SELECT 1 FROM opening_period p2 WHERE p2.object_id = o.id
        ) THEN NULL::boolean
        ELSE (
          -- arm 1 : période active aujourd'hui, jour de la semaine = aujourd'hui,
          --         et l'heure locale tombe dans une plage horaire.
          EXISTS (
            SELECT 1
            FROM opening_period p
            JOIN opening_schedule s ON s.period_id = p.id
            JOIN opening_time_period tp ON tp.schedule_id = s.id
            JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
            JOIN opening_time_frame tf ON tf.time_period_id = tp.id
            JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
            CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
            WHERE p.object_id = o.id
              AND tp.closed = FALSE
              AND api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, ln.local_date)
              AND COALESCE(
                wd.dow_number,
                CASE wd.code
                  WHEN 'monday' THEN 1
                  WHEN 'tuesday' THEN 2
                  WHEN 'wednesday' THEN 3
                  WHEN 'thursday' THEN 4
                  WHEN 'friday' THEN 5
                  WHEN 'saturday' THEN 6
                  WHEN 'sunday' THEN 7
                  ELSE NULL
                END
              ) = ln.local_isodow
              AND (tf.start_time IS NULL OR tf.start_time <= ln.local_time)
              AND (tf.end_time IS NULL OR tf.end_time > ln.local_time)
          )
          -- arm 2 : jour ouvert SANS plage horaire (§93, « ouvert sans horaire »).
          OR EXISTS (
            SELECT 1
            FROM opening_period p
            JOIN opening_schedule s ON s.period_id = p.id
            JOIN opening_time_period tp ON tp.schedule_id = s.id
            JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
            JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
            CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
            WHERE p.object_id = o.id
              AND tp.closed = FALSE
              AND api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, ln.local_date)
              AND COALESCE(
                wd.dow_number,
                CASE wd.code
                  WHEN 'monday' THEN 1
                  WHEN 'tuesday' THEN 2
                  WHEN 'wednesday' THEN 3
                  WHEN 'thursday' THEN 4
                  WHEN 'friday' THEN 5
                  WHEN 'saturday' THEN 6
                  WHEN 'sunday' THEN 7
                  ELSE NULL
                END
              ) = ln.local_isodow
              AND NOT EXISTS (SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id = tp.id)
          )
        )
      END AS new_is_open_now
    FROM object o
    WHERE o.status = 'published'
  )
  UPDATE object o
  SET cached_is_open_now = s.new_is_open_now
  FROM open_state s
  WHERE o.id = s.id
    AND o.cached_is_open_now IS DISTINCT FROM s.new_is_open_now;
END;
$$;

COMMIT;

-- Bascule immédiate des fiches sans données (FALSE → NULL) — sinon au prochain tick cron :
--   SELECT api.refresh_open_status();
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
-- Pas de `NOTIFY pgrst, 'reload schema'` : signature inchangée, pas un RPC exposé.
