-- migration_list_create_superuser_only.sql
-- Manifeste 17l — créer une liste est réservé au superuser plateforme (§227).
-- Arbitrage PO 2026-08-31, après 17k.
--
-- CE QUE FAIT CETTE MIGRATION
--   `api.create_list` ne portait AUCUNE garde d'autorisation : tout membre d'une ORG créait des
--   listes, Lecteur compris (2 des 12 listes en base sont d'un Lecteur). Elle exige désormais
--   `api.is_platform_superuser()`.
--
-- ═══ CE QUE CET ARBITRAGE COÛTE, EN CLAIR ═══
--
--   Lecture STRICTE de « super admin » : le rang d'administration d'ORG ne suffit pas.
--   Conséquence assumée et signalée au PO avant application : l'ORG `ORGRUN00000001C4` n'a
--   AUCUN superuser plateforme (`s.gaze@reunion.fr` est `org_admin` mais `tourism_agent` au
--   niveau plateforme). Elle ne peut donc plus créer de liste par elle-même — il faut passer
--   par un superuser. Si cette autonomie redevient nécessaire, la correction tient en une
--   ligne : `OR COALESCE(api.current_user_admin_rank(), 0) >= 30`.
--
-- ═══ CE QUI N'EST PAS TOUCHÉ ═══
--
--   Les 12 listes existantes restent à leurs créateurs, qui continuent de les éditer (17k :
--   « son créateur »). Seule la CRÉATION est fermée. Aucun transfert, aucune suppression :
--   l'arbitrage porte sur qui crée demain, pas sur ce qui a été fait hier.
--
-- ═══ POURQUOI `NO_ORG` DEVIENT INCONDITIONNEL ═══
--
--   L'ancien test était `v_org IS NULL AND NOT api.is_platform_superuser()` : un superuser sans
--   ORG créait donc une liste avec `org_object_id` NULL. Or `api.user_can_write_list` et
--   `user_can_read_list` comparent `l.org_object_id = api.current_user_org_id()` — une telle
--   liste serait invisible et inéditable POUR TOUT LE MONDE, son auteur compris. Tolérable tant
--   que les non-superusers créaient l'essentiel des listes ; absurde maintenant que le superuser
--   est le SEUL créateur. On refuse franchement plutôt que de fabriquer une liste fantôme.
--
-- Idempotent (CREATE OR REPLACE). NON foldé dans schema_unified.sql.

BEGIN;

CREATE OR REPLACE FUNCTION api.create_list(
  p_kind text,
  p_name text,
  p_from_object_ids text[] DEFAULT NULL::text[],
  p_filters jsonb DEFAULT NULL::jsonb,
  p_filters_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'auth'
AS $function$
DECLARE v_org text := api.current_user_org_id(); v_id uuid;
BEGIN
  -- 17l — la création de listes est réservée au superuser plateforme.
  -- `COALESCE` : hors contexte HTTP `is_platform_superuser()` rend NULL, et `IF NOT NULL THEN`
  -- ne déclenche PAS le RAISE — la garde serait fail-OPEN (même leçon que §204).
  IF NOT COALESCE(api.is_platform_superuser(), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN: la création de listes est réservée aux superusers plateforme'
      USING ERRCODE = '42501';
  END IF;

  -- Inconditionnel : une liste sans ORG est invisible et inéditable pour tout le monde.
  IF v_org IS NULL THEN RAISE EXCEPTION 'NO_ORG' USING ERRCODE = '42501'; END IF;

  IF p_kind NOT IN ('static','dynamic') THEN RAISE EXCEPTION 'BAD_KIND'; END IF;
  IF p_kind = 'dynamic' AND p_filters IS NULL THEN RAISE EXCEPTION 'DYNAMIC_REQUIRES_FILTERS'; END IF;
  INSERT INTO object_list(org_object_id, created_by, kind, name, filters, filters_url)
  VALUES (v_org, auth.uid(), p_kind, COALESCE(NULLIF(p_name,''),'Nouvelle liste'),
          CASE WHEN p_kind = 'dynamic' THEN p_filters ELSE NULL END,
          CASE WHEN p_kind = 'dynamic' THEN p_filters_url ELSE NULL END)
  RETURNING id INTO v_id;
  IF p_kind = 'static' AND p_from_object_ids IS NOT NULL THEN
    INSERT INTO object_list_item(list_id, object_id, position)
    SELECT v_id, x.oid, x.ord::int FROM unnest(p_from_object_ids) WITH ORDINALITY AS x(oid, ord)
    WHERE EXISTS (SELECT 1 FROM object o WHERE o.id = x.oid) ON CONFLICT (list_id, object_id) DO NOTHING;
  END IF;
  RETURN v_id;
END; $function$;

COMMENT ON FUNCTION api.create_list(text, text, text[], jsonb, text) IS
  'Création d''une liste : superuser plateforme UNIQUEMENT (17l, arbitrage PO 2026-08-31). '
  'Le rang d''administration d''ORG ne suffit pas.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS POST-APPLICATION (transaction ANNULÉE)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   (a) Éditeur + team_lead   ⇒ 42501 FORBIDDEN
--   (b) org_admin non superuser ⇒ 42501 FORBIDDEN  (c'est le point de l'arbitrage)
--   (c) superuser plateforme  ⇒ la liste est créée, `org_object_id` renseigné
--   (d) les 12 listes existantes sont intactes et toujours éditables par leurs créateurs
