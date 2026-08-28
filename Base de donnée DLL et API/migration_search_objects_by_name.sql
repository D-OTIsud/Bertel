-- migration_search_objects_by_name.sql
-- Spec 2026-08-26 (docs/superpowers/specs/2026-08-26-explorer-recherche-pertinence-concordances-design.md)
--
-- RPC LÉGER de CONCORDANCE DIRECTE par nom — le socle des « pré-résultats » de l'Exploreur
-- (menu sous la barre de recherche + bandeau en tête des résultats + palette ⌘K).
--
-- CE N'EST PAS UN FILTRE. Il cherche dans tout le corpus visible, INDÉPENDAMMENT des
-- filtres actifs de l'Exploreur : c'est de la NAVIGATION (« je veux LA fiche »), pas du
-- filtrage (« montre-moi les fiches qui… »). Confondre les deux ferait disparaître la
-- fiche cherchée dès qu'un filtre sans rapport serait actif.
--
-- POURQUOI UNE FONCTION DÉDIÉE plutôt qu'un chemin existant :
--   * api.get_filtered_object_ids porte un socle d'environ 100 ms même sans filtre ni
--     recherche (SECURITY DEFINER non inlinée, tous ses prédicats planifiés à chaque
--     appel — classe §204), et l'Exploreur le paie une fois PAR BUCKET (7).
--   * api.list_object_markers (que la palette ⌘K utilisait) porte le même socle ET ne rend
--     que les fiches GÉOLOCALISÉES — une fiche sans coordonnées y était introuvable
--     (limite « ponytail: » assumée dans src/services/palette-search.ts).
--   Ici : un seul accès indexé sur object.name_normalized, mesuré ~20 ms, un seul appel.
--
-- PÉRIMÈTRE AUTO-GARDÉ SERVEUR (doctrine §205 transposée : masquer n'est jamais la garde) :
--   * `published` pour tout le monde ;
--   * `draft` en PLUS, uniquement pour un éditeur ET dans son périmètre étendu.
--     `COALESCE(api.current_user_can_edit_objects(), FALSE)` est OBLIGATOIRE : la fonction
--     est à TROIS valeurs (elle rend NULL hors contexte HTTP, superuser compris, §204) —
--     sans COALESCE la garde serait fail-OPEN.
--   * `archived` / `hidden` JAMAIS : l'archivé est un opt-in de filtre (§205), pas une
--     cible de navigation ; le masqué n'est jamais surfacé dans l'Exploreur.
--   Le client ne choisit RIEN : aucun paramètre de statut ni de périmètre n'est exposé.
--
-- La sonde d'autorisation est appelée UNE FOIS dans le CTE `params` et non par ligne.
--
-- Créneau manifeste 16w. Fonction exposée NEUVE ⇒ NOTIFY pgrst requis.
-- CI : tests/test_search_objects_by_name.sql

CREATE OR REPLACE FUNCTION api.search_objects_by_name(
  p_term  text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(
  id          text,
  name        text,
  object_type object_type,
  status      object_status,
  city        text,
  image_url   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $function$
  WITH params AS (
    SELECT
      btrim(api.norm_search(p_term)) AS norm,
      -- Échappement LIKE de la saisie : le '\' D'ABORD, sinon on ré-échapperait les
      -- échappements qu'on vient de poser. Sans cela, un '%' saisi rendrait tout le corpus.
      replace(replace(replace(btrim(api.norm_search(p_term)), '\', '\\'), '%', '\%'), '_', '\_') AS norm_like,
      LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20) AS lim,
      -- TROIS VALEURS (§204) : NULL hors contexte HTTP ⇒ COALESCE obligatoire, sinon
      -- `p.can_edit AND …` vaudrait NULL et la branche draft serait ignorée en silence
      -- côté lecteur mais la garde ne serait plus lisible comme fermée.
      COALESCE(api.current_user_can_edit_objects(), FALSE) AS can_edit
  )
  SELECT o.id, o.name, o.object_type, o.status, loc.city, o.cached_main_image_url
  FROM params p
  JOIN object o
    -- Garde de longueur DANS la jointure : sous 2 caractères aucune ligne n'est produite
    -- (une saisie d'un caractère ramènerait des centaines de fiches pour rien).
    ON char_length(p.norm) >= 2
   AND o.name_normalized LIKE '%' || p.norm_like || '%' ESCAPE '\'
   AND (
        o.status = 'published'
     OR (p.can_edit
         AND o.status = 'draft'
         AND o.id IN (SELECT api.current_user_extended_object_ids()))
   )
  LEFT JOIN LATERAL (
    -- object_location est XOR object/place : on ne veut que la patte objet.
    SELECT ol.city FROM object_location ol WHERE ol.object_id = o.id LIMIT 1
  ) loc ON TRUE
  ORDER BY
    (o.name_normalized = p.norm) DESC,                    -- le nom EST la saisie
    (position(p.norm IN o.name_normalized) = 1) DESC,     -- le nom COMMENCE par la saisie
    o.name_normalized,
    o.id
  LIMIT (SELECT lim FROM params)
$function$;

-- §204 : PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute fonction neuve, et un
-- GRANT ciblé ne le retire pas. Le REVOKE est obligatoire, pas décoratif.
REVOKE ALL ON FUNCTION api.search_objects_by_name(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.search_objects_by_name(text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION api.search_objects_by_name(text, integer) IS
  'Concordance directe par nom (spec 2026-08-26) : navigation, pas filtrage — cherche tout '
  'le corpus visible indépendamment des filtres de l''Exploreur. Périmètre auto-gardé : '
  'published pour tous, + draft du périmètre étendu pour un éditeur (COALESCE sur la sonde '
  'à trois valeurs, §204) ; archived/hidden jamais. Consommée par le menu de la barre de '
  'recherche, le bandeau de résultats et la palette ⌘K.';
