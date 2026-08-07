-- migration_list_resolver_internal.sql
-- §211 — Scinde le résolveur de listes dynamiques en DEUX fonctions.
--
-- POURQUOI. api.resolve_list_object_ids est SECURITY DEFINER, exposée en RPC
-- PostgREST et GRANT EXECUTE … TO authenticated. Elle délègue à
-- api.get_filtered_object_ids, dont le chemin vif lit `FROM object o` SANS
-- intersection avec l'ensemble lisible : un utilisateur authentifié peut donc
-- l'appeler en direct avec p_published_only = false et obtenir des ids d'objets
-- hors de son périmètre. Cette exposition est PRÉ-EXISTANTE et plafonnée à 200
-- (cf. différé « resolve_list_object_ids non borné au lisible »). L'export
-- d'e-mails a besoin de résoudre jusqu'à 2 001 ids : relever le plafond du RPC
-- public multiplierait cette exposition par dix.
--
-- COMMENT. Le moteur passe en `internal` (plafond 2001, non joignable par
-- PostgREST) ; le RPC `api` devient un mince passe-plat qui REPLAFONNE à 200 —
-- signature, grants et comportement strictement inchangés pour les appelants
-- existants (api.list_effective_object_ids passe le littéral 200, donc get_list
-- et list_my_lists ne bougent pas).
--
-- Idempotent (CREATE OR REPLACE + CREATE SCHEMA IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS internal;

-- ---------- 1. Le moteur (interne, plafond 2001) ----------
-- Corps repris tel quel de api.resolve_list_object_ids (migration_object_list.sql
-- §4), à l'unique différence du plafond.
CREATE OR REPLACE FUNCTION internal.resolve_list_object_ids(
  p_buckets jsonb,
  p_published_only boolean DEFAULT true,
  p_limit int DEFAULT 200
) RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api AS $$
DECLARE
  v_arr jsonb := CASE
                   WHEN p_buckets IS NULL THEN '[]'::jsonb
                   WHEN jsonb_typeof(p_buckets) = 'array' THEN p_buckets
                   WHEN p_buckets ? 'buckets' THEN p_buckets->'buckets'
                   ELSE '[]'::jsonb
                 END;
  v_status object_status[] := CASE WHEN p_published_only
                                   THEN ARRAY['published']::object_status[]
                                   ELSE NULL END;
  -- ponytail: plafond 2001 = 2000 + 1, pour distinguer « exactement 2000 » de
  -- « plus de 2000 » chez l'appelant. Upgrade = pagination.
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 2001);
BEGIN
  RETURN QUERY
  WITH ids AS (
    SELECT g.object_id, g.relevance, g.label_rank
    FROM jsonb_array_elements(v_arr) AS b(elem)
    CROSS JOIN LATERAL api.get_filtered_object_ids(
      COALESCE(b.elem->'filters', '{}'::jsonb),
      CASE WHEN b.elem ? 'types' AND jsonb_typeof(b.elem->'types') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(b.elem->'types'))::object_type[]
           ELSE NULL END,
      v_status,
      NULLIF(b.elem->>'search','')
    ) g
  ),
  dedup AS (
    SELECT DISTINCT ON (object_id) object_id, relevance, label_rank
    FROM ids
    ORDER BY object_id, relevance DESC, label_rank
  )
  SELECT object_id FROM dedup
  ORDER BY relevance DESC, label_rank, object_id
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION internal.resolve_list_object_ids(jsonb, boolean, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.resolve_list_object_ids(jsonb, boolean, int)
  TO service_role;

COMMENT ON FUNCTION internal.resolve_list_object_ids(jsonb, boolean, int) IS
  'Moteur de résolution des listes dynamiques (plafond 2001). NON exposé : '
  'joignable uniquement depuis un SECURITY DEFINER qui a déjà appliqué sa propre '
  'garde. Le contrat public api.resolve_list_object_ids reste plafonné à 200. §211';

-- ---------- 2. Le contrat public (passe-plat, plafond 200 inchangé) ----------
-- Signature, grants et comportement identiques à avant : SEULE l'implémentation
-- change. NE PAS relever ce plafond (cf. bloc POURQUOI).
CREATE OR REPLACE FUNCTION api.resolve_list_object_ids(
  p_buckets jsonb,
  p_published_only boolean DEFAULT true,
  p_limit int DEFAULT 200
) RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal AS $$
  SELECT internal.resolve_list_object_ids(
    p_buckets,
    p_published_only,
    LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200)   -- ponytail: plafond public 200
  );
$$;

REVOKE ALL ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int)
  TO authenticated, service_role;
