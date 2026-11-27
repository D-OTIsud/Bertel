-- Concordances de noms : le filtre Statut précède la limite des suggestions.
-- Le chemin historique à deux paramètres reste disponible pour les clients déjà
-- déployés et la palette de navigation. La surcharge à trois paramètres n'a
-- AUCUN paramètre par défaut : PostgREST peut distinguer les deux signatures.
-- Aucun droit de lecture supplémentaire : published + périmètre étendu d'un
-- éditeur, dans le même realm que l'Explorer. NULL / {} = tous ces statuts.

DO $guard$
BEGIN
  IF to_regprocedure('api.search_objects_by_name(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'search_objects_by_name(text,integer) doit exister avant cette migration';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION api.search_objects_by_name(
  p_term text,
  p_limit integer,
  p_status public.object_status[]
)
RETURNS TABLE(
  id text,
  name text,
  object_type public.object_type,
  status public.object_status,
  city text,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $function$
  WITH normalized AS MATERIALIZED (
    -- Le lower final abaisse aussi les lettres ASCII produites par unaccent
    -- lorsque le cluster local utilise une locale C (par exemple É -> E).
    SELECT regexp_replace(btrim(lower(api.norm_search(p_term))), '[[:space:]]+', ' ', 'g') AS norm
  ),
  params AS MATERIALIZED (
    SELECT
      n.norm,
      -- Une saisie contenant %, _ ou \ reste une recherche littérale.
      replace(replace(replace(n.norm, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') AS norm_like,
      LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20) AS lim,
      COALESCE(api.current_user_can_edit_objects(), FALSE) AS can_edit,
      api.current_user_test_realm() AS test_realm
    FROM normalized n
  )
  SELECT o.id, o.name, o.object_type, o.status, loc.city, o.cached_main_image_url
  FROM params p
  JOIN public.object o
    ON char_length(p.norm) >= 2
   AND o.name_normalized ILIKE '%' || p.norm_like || '%' ESCAPE E'\\'
   AND o.is_test = p.test_realm
   AND (
     o.status = 'published'
     OR (
       p.can_edit
       AND o.status IN ('draft', 'hidden', 'archived')
       AND o.id IN (SELECT api.current_user_extended_object_ids())
     )
   )
   AND (
     -- Un lecteur reste sur published, même avec un statut privé forgé.
     NOT p.can_edit
     OR p_status IS NULL
     OR cardinality(p_status) = 0
     OR o.status = ANY(p_status)
   )
  LEFT JOIN LATERAL (
    SELECT ol.city FROM public.object_location ol WHERE ol.object_id = o.id LIMIT 1
  ) loc ON TRUE
  ORDER BY
    (lower(o.name_normalized) = p.norm) DESC,
    (position(p.norm IN lower(o.name_normalized)) = 1) DESC,
    lower(o.name_normalized),
    o.id
  LIMIT (SELECT lim FROM params)
$function$;

REVOKE ALL ON FUNCTION api.search_objects_by_name(text, integer, public.object_status[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.search_objects_by_name(text, integer, public.object_status[])
  TO anon, authenticated, service_role;

-- CREATE OR REPLACE conserve le propriétaire et les ACL de l'entrée historique.
-- Son défaut p_limit=8, sa stabilité et son contexte d'exécution restent identiques.
CREATE OR REPLACE FUNCTION api.search_objects_by_name(
  p_term text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(
  id text,
  name text,
  object_type public.object_type,
  status public.object_status,
  city text,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $function$
  SELECT r.id, r.name, r.object_type, r.status, r.city, r.image_url
  FROM api.search_objects_by_name(p_term, p_limit, NULL::public.object_status[]) r
$function$;

DO $owner$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_get_userbyid(p.proowner) INTO STRICT v_owner
  FROM pg_proc p
  WHERE p.oid = 'api.search_objects_by_name(text,integer)'::regprocedure;
  EXECUTE format(
    'ALTER FUNCTION api.search_objects_by_name(text,integer,public.object_status[]) OWNER TO %I',
    v_owner
  );
END
$owner$;

COMMENT ON FUNCTION api.search_objects_by_name(text, integer, public.object_status[]) IS
  'Concordances de noms partiels (2 caractères minimum), insensibles aux accents/casse, espaces de saisie normalisés. '
  'Statuts filtrés avant LIMIT : NULL/{} = tous les statuts accessibles ; lecteurs published seul ; '
  'éditeurs published + draft/hidden/archived de leur périmètre étendu. Realm réel/test conservé. '
  'Surcharge sans DEFAULT pour lever toute ambiguïté PostgREST avec la signature historique.';

COMMENT ON FUNCTION api.search_objects_by_name(text, integer) IS
  'Concordances de noms partielles pour les clients historiques et la navigation globale. '
  'Délègue à la surcharge à trois paramètres sans filtre de statut, dans le périmètre autorisé du lecteur.';

NOTIFY pgrst, 'reload schema';
