-- =====================================================================================
-- migration_crm_directory_search.sql — Recherche d'acteurs dans l'annuaire CRM
-- =====================================================================================
-- Contexte (demande PO 2026-07-27) : sur /crm, le champ de recherche du header était inerte
-- (il alimente le store Explorer). Il devient la recherche ACTEURS de l'annuaire, avec un
-- périmètre demandé : nom de l'établissement rattaché · nom · prénom · téléphone · e-mail.
--
-- Téléphone et e-mail vivent dans actor_channel : ils ne sont PAS dans le payload de
-- l'annuaire et ne doivent pas y entrer (1 353 valeurs PII expédiées sur une vue liste).
-- La recherche est donc SERVEUR : la PII sert de PRÉDICAT, elle n'est jamais émise.
--
-- Ce que fait cette migration : ajoute `p_search` à api.list_crm_directory (4 → 5 args).
--
--   1. Identité (display_name / first_name / last_name) et nom d'établissement rattaché :
--      sous-chaîne exacte (LIKE, insensible casse+accents via les colonnes générées
--      *_normalized) OU approchante (trigrammes pg_trgm) à partir de 3 caractères.
--   2. Téléphone / e-mail : STRUCTURÉ, jamais de flou — un fuzzy sur un numéro retourne
--      surtout la mauvaise personne. Téléphone comparé en chiffres normalisés des deux
--      côtés (la base mélange '0692123456' et '06 92 12 34 56' : un ILIKE raterait la
--      moitié des saisies).
--   3. Classement par pertinence (`rank`) : exact identité > exact établissement > flou ;
--      un match canal vaut un exact (signal non ambigu).
--
-- INVARIANTS PRÉSERVÉS
--   * Périmètre : le prédicat s'applique À L'INTÉRIEUR du périmètre CRM déjà calculé
--     (v_actor_scope / v_scope). Aucun acteur hors périmètre ne devient trouvable, aucune
--     valeur de canal n'est ajoutée au JSON ⇒ pas de nouvelle classe d'exposition PII.
--     (Prouvé par le test persona : un SECURITY DEFINER contourne la RLS des tables lues.)
--   * v_filtered reste (topic|status|from|to) : la recherche N'EXIGE PAS d'interaction —
--     un acteur « lien seul » doit rester trouvable par son nom ou son téléphone.
--   * Ordre par défaut INCHANGÉ : `rank` vaut 0 partout hors recherche, donc
--     `ORDER BY rank DESC, last_at DESC NULLS LAST` dégénère exactement en l'ordre actuel.
--
-- COMPORTEMENT ATTENDU, constaté en test : une saisie qui RESSEMBLE à une adresse e-mail peut
-- retrouver l'acteur par la branche IDENTITÉ et non par la branche canal — « aline.hoareau@… »
-- contient littéralement le nom de la personne (word_similarity vs display_name = 0.560). Ce
-- n'est pas une fuite du flou dans les canaux : les canaux, eux, restent en comparaison stricte
-- (le test isole la branche canal sur un acteur dont l'adresse n'a aucun rapport avec son nom).
--
-- GOTCHA §29 (search_path restreint) : pg_trgm est installé dans `extensions`, et la
-- fonction avait `SET search_path = public, api, auth`. Sans `extensions`, word_similarity()
-- est INTROUVABLE À L'EXÉCUTION (même classe de panne que uuid_generate_v4()). D'où l'ajout
-- d'`extensions` en FIN de search_path (pas de shadowing de public/api).
--
-- SEUIL 0.45 — calibré sur les données live le 2026-07-27, pas choisi au doigt mouillé :
--     plus faible vrai positif : rivere→Rivière 0.500 · dimtile→Dimitile 0.545
--                                grondain→Grondin 0.556 · payette→Payet 0.625
--                                hoareu→Hoareau 0.714 · coccinele→Coccinelle 0.800
--     plancher de bruit        : bequ → 38 acteurs à 0.400 (Beaudemoulin, Benoit, Behari…)
--     falaise haute            : à 0.55, `rivere` ne rend plus AUCUN résultat
--   0.45 est le milieu de [0.40 ; 0.50]. Les valeurs ci-dessus sont assertées en CI.
--
-- ponytail: seuil comparé littéralement (word_similarity(...) >= 0.45) plutôt que via
-- l'opérateur `<%` + la GUC pg_trgm.word_similarity_threshold. Plafond assumé : la forme
-- littérale n'est PAS accélérée par les index GIN trgm existants. Sans objet à cette échelle
-- (696 acteurs / ~850 objets ⇒ quelques ms, et seulement pendant une recherche) et le seuil
-- reste lisible dans le SQL, immune à un réglage d'instance. Bascule sur `<%` + GUC figée au
-- niveau fonction si le corpus dépasse ~10^4 acteurs.
--
-- Idempotence : DROP de l'arité 4 (celle en production — sinon les deux surcharges coexistent
-- et PostgREST devient ambigu, leçon list_crm_timeline) + CREATE OR REPLACE de l'arité 5
-- (rejouable). Manifest : voir ci_fresh_apply.sql et docs/SQL_ROLLOUT_RUNBOOK.md.
-- =====================================================================================

BEGIN;

DROP FUNCTION IF EXISTS api.list_crm_directory(text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION api.list_crm_directory(
  p_topic_code text DEFAULT NULL,
  p_status     text DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_search     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
-- `extensions` en fin de liste : pg_trgm (word_similarity) y vit — cf. GOTCHA §29 en en-tête.
SET search_path = public, api, auth, extensions
AS $$
DECLARE
  v_scope text[];        -- objets du périmètre (NULL = superuser, sans restriction)
  v_actor_scope uuid[];  -- acteurs du périmètre (NULL = superuser)
  v_items jsonb;
  v_topic_id uuid;
  v_status crm_status;
  v_filtered boolean := (p_topic_code IS NOT NULL OR p_status IS NOT NULL
                         OR p_from IS NOT NULL OR p_to IS NOT NULL);
  -- Recherche : NULL = aucun filtre de recherche (contrat < 2 caractères).
  v_text    text;        -- saisie normalisée (unaccent+lower) — argument gauche du flou
  v_pattern text;        -- v_text échappé pour LIKE, encadré de %
  v_digits  text;        -- chiffres de la saisie (branche téléphone)
  v_fuzzy   boolean := false;  -- flou actif : >= 3 caractères
  v_threshold real := 0.45;    -- calibré live 2026-07-27, cf. en-tête
BEGIN
  -- Validation des filtres AVANT le périmètre (le contrat 22023 vaut même à périmètre vide).
  IF p_topic_code IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic WHERE code = p_topic_code;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_topic_code USING ERRCODE = '22023';
    END IF;
  END IF;
  -- Actives = planned (à traiter), Traitées = done — vocabulaire PO.
  IF p_status IS NOT NULL THEN
    IF p_status = 'active' THEN v_status := 'planned';
    ELSIF p_status = 'done' THEN v_status := 'done';
    ELSE
      RAISE EXCEPTION 'p_status invalide: % (attendu: active | done)', p_status USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Recherche : sous 2 caractères utiles ⇒ traitée comme absente (ni filtre, ni erreur).
  -- Le front ne DOIT pas envoyer moins, mais la fonction est PostgREST-exécutable : garde ici.
  IF p_search IS NOT NULL AND length(btrim(p_search)) >= 2 THEN
    v_text := immutable_unaccent(lower(btrim(p_search)));
    -- Échappement LIKE (repris de api.search_actors) : un '%_' saisi ne doit pas énumérer.
    v_pattern := '%' || replace(replace(replace(v_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_fuzzy := (length(v_text) >= 3);  -- < 3 : sous-chaîne exacte seule (trigrammes sans objet)
    v_digits := regexp_replace(btrim(p_search), '\D', '', 'g');
    -- Moins de 4 chiffres : un « 06 » isolé matcherait presque tous les numéros.
    IF length(v_digits) < 4 THEN v_digits := NULL; END IF;
  END IF;

  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    v_actor_scope := ARRAY(SELECT api.current_user_crm_actor_ids());
    IF COALESCE(array_length(v_actor_scope, 1), 0) = 0 THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  -- Tri : pertinence PUIS récence. Hors recherche, rank = 0 pour tous ⇒ l'ordre dégénère
  -- exactement en `last_at DESC NULLS LAST` (l'ordre historique de l'annuaire, non régressé).
  SELECT COALESCE(jsonb_agg(item ORDER BY rank DESC, last_at DESC NULLS LAST), '[]'::jsonb) INTO v_items
  FROM (
    SELECT agg.last_at, base.rank,
      jsonb_build_object(
        'actor_id', a.id, 'display_name', a.display_name, 'photo_url', a.photo_url,
        'objects', COALESCE(links.objects, '[]'::jsonb),
        'object_count', COALESCE(links.n, 0),
        'interaction_count', COALESCE(agg.n_total, 0),
        'interactions_12m', COALESCE(agg.n_12m, 0),
        'last_interaction_at', agg.last_at,
        'last_interaction_type', last_i.itype,
        'last_interaction_subject', last_i.subject,
        'last_interaction_object_name', last_i.object_name,
        'top_topics', COALESCE(topics.names, '[]'::jsonb)
      ) AS item
    FROM (
      -- base = acteurs du périmètre : non-superuser ⇒ v_actor_scope (déjà « lié OU
      -- interagissant ») ; superuser ⇒ tous les acteurs ayant ≥1 lien OU ≥1 interaction.
      -- Sous filtre (v_filtered) : ≥1 interaction CORRESPONDANTE exigée en plus — les
      -- acteurs « lien seul » disparaissent (règle d'inclusion PO, cf. en-tête fonction).
      -- §66 : compteurs annuaire = interactions RACINES seulement (les réponses §66 ne
      -- gonflent pas les volumes). Inclusion sous filtre = ≥1 RACINE correspondante (une
      -- réponse exige une racine du même acteur/contexte ⇒ aucun acteur ne disparaît).
      SELECT a0.id AS actor_id, COALESCE(sc.rank, 0::real) AS rank
      FROM actor a0
      -- Score de recherche. Le `WHERE v_text IS NOT NULL` sans FROM devient un One-Time
      -- Filter: false hors recherche ⇒ AUCUNE des sous-requêtes ci-dessous n'est évaluée
      -- (le chemin par défaut de l'annuaire reste strictement celui d'avant).
      LEFT JOIN LATERAL (
        SELECT GREATEST(
          -- 1. Identité — exact (2.0) puis flou (score brut, donc toujours < 1.0 < exact).
          CASE WHEN a0.display_name_normalized LIKE v_pattern ESCAPE '\' THEN 2.0::real
               WHEN v_fuzzy AND word_similarity(v_text, a0.display_name_normalized) >= v_threshold
                 THEN word_similarity(v_text, a0.display_name_normalized)
               ELSE 0::real END,
          CASE WHEN a0.last_name_normalized LIKE v_pattern ESCAPE '\' THEN 2.0::real
               WHEN v_fuzzy AND word_similarity(v_text, a0.last_name_normalized) >= v_threshold
                 THEN word_similarity(v_text, a0.last_name_normalized)
               ELSE 0::real END,
          CASE WHEN a0.first_name_normalized LIKE v_pattern ESCAPE '\' THEN 2.0::real
               WHEN v_fuzzy AND word_similarity(v_text, a0.first_name_normalized) >= v_threshold
                 THEN word_similarity(v_text, a0.first_name_normalized)
               ELSE 0::real END,
          -- 2. Nom d'établissement rattaché, DANS le périmètre. Exact = 1.8 (sous l'identité),
          -- flou pondéré 0.9 (un établissement approché est un signal plus faible qu'un nom).
          -- o.name_normalized est la colonne GÉNÉRÉE (indexée) : ne jamais recalculer
          -- immutable_unaccent(lower(o.name)) ici, cela défait l'index et duplique la règle.
          COALESCE((
            SELECT max(CASE WHEN o.name_normalized LIKE v_pattern ESCAPE '\' THEN 1.8::real
                            WHEN v_fuzzy AND word_similarity(v_text, o.name_normalized) >= v_threshold
                              THEN (0.9 * word_similarity(v_text, o.name_normalized))::real
                            ELSE 0::real END)
            FROM actor_object_role ar1
            JOIN object o ON o.id = ar1.object_id
            WHERE ar1.actor_id = a0.id
              AND (v_scope IS NULL OR ar1.object_id = ANY(v_scope))
          ), 0::real),
          -- 3. Canaux — STRUCTURÉ, aucun flou (cf. en-tête). E-mail : sous-chaîne.
          -- Téléphone : chiffres contre chiffres (la base mélange les formats d'espacement).
          CASE WHEN EXISTS (
            SELECT 1 FROM actor_channel ac
            JOIN ref_code_contact_kind k ON k.id = ac.kind_id
            WHERE ac.actor_id = a0.id
              AND (
                (lower(k.code) = 'email' AND lower(ac.value) LIKE v_pattern ESCAPE '\')
                OR (v_digits IS NOT NULL
                    AND lower(k.code) IN ('phone', 'mobile', 'sms', 'whatsapp')
                    AND regexp_replace(ac.value, '\D', '', 'g') LIKE '%' || v_digits || '%')
              )
          ) THEN 2.0::real ELSE 0::real END
        ) AS rank
        WHERE v_text IS NOT NULL
      ) sc ON TRUE
      WHERE (a0.id = ANY(v_actor_scope)
             OR (v_actor_scope IS NULL
                 AND (EXISTS (SELECT 1 FROM actor_object_role ar0 WHERE ar0.actor_id = a0.id)
                      OR EXISTS (SELECT 1 FROM crm_interaction ci0 WHERE ci0.actor_id = a0.id))))
        AND (NOT v_filtered
             OR EXISTS (SELECT 1 FROM crm_interaction cf
                        WHERE cf.actor_id = a0.id
                          AND cf.parent_interaction_id IS NULL
                          AND (v_scope IS NULL OR cf.object_id IS NULL OR cf.object_id = ANY(v_scope))
                          AND (v_topic_id IS NULL OR cf.demand_topic_id = v_topic_id)
                          AND (v_status IS NULL OR cf.status = v_status)
                          AND (p_from IS NULL OR cf.occurred_at >= p_from)
                          AND (p_to IS NULL OR cf.occurred_at < p_to)))
        -- Recherche : prédicat INDÉPENDANT de v_filtered (un acteur sans interaction reste
        -- trouvable). Hors recherche, sc.rank est NULL et l'arme gauche court-circuite.
        AND (v_text IS NULL OR sc.rank > 0)
    ) base
    JOIN actor a ON a.id = base.actor_id
    -- Objets liés du périmètre (TOUS les liens vers des objets en périmètre, primaire d'abord).
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
               'object_id', ar.object_id, 'object_name', o.name, 'object_type', o.object_type,
               'role_name', r.name, 'is_primary', ar.is_primary)
             ORDER BY ar.is_primary DESC NULLS LAST, o.name) AS objects,
             count(*) AS n
      FROM actor_object_role ar
      JOIN object o ON o.id = ar.object_id
      JOIN ref_actor_role r ON r.id = ar.role_id
      WHERE ar.actor_id = base.actor_id
        AND (v_scope IS NULL OR ar.object_id = ANY(v_scope))
    ) links ON TRUE
    -- Volumes sur les interactions FILTRÉES de l'acteur en périmètre (contexte objet du
    -- périmètre OU interaction générale sans contexte) — interactions_12m = fenêtre 12 mois
    -- intersectée avec la période demandée.
    LEFT JOIN LATERAL (
      SELECT count(*) AS n_total,
             count(*) FILTER (WHERE ci.occurred_at >= NOW() - interval '12 months') AS n_12m,
             max(ci.occurred_at) AS last_at
      FROM crm_interaction ci
      WHERE ci.actor_id = base.actor_id
        AND ci.parent_interaction_id IS NULL  -- §66 : racines seulement (réponses exclues)
        AND (v_scope IS NULL OR ci.object_id IS NULL OR ci.object_id = ANY(v_scope))
        AND (v_topic_id IS NULL OR ci.demand_topic_id = v_topic_id)
        AND (v_status IS NULL OR ci.status = v_status)
        AND (p_from IS NULL OR ci.occurred_at >= p_from)
        AND (p_to IS NULL OR ci.occurred_at < p_to)
    ) agg ON TRUE
    LEFT JOIN LATERAL (
      SELECT ci2.interaction_type::text AS itype, ci2.subject, o2.name AS object_name
      FROM crm_interaction ci2
      LEFT JOIN object o2 ON o2.id = ci2.object_id
      WHERE ci2.actor_id = base.actor_id
        AND ci2.parent_interaction_id IS NULL  -- §66 : la dernière interaction = dernière RACINE
        AND (v_scope IS NULL OR ci2.object_id IS NULL OR ci2.object_id = ANY(v_scope))
        AND (v_topic_id IS NULL OR ci2.demand_topic_id = v_topic_id)
        AND (v_status IS NULL OR ci2.status = v_status)
        AND (p_from IS NULL OR ci2.occurred_at >= p_from)
        AND (p_to IS NULL OR ci2.occurred_at < p_to)
      ORDER BY ci2.occurred_at DESC NULLS LAST, ci2.id DESC
      LIMIT 1
    ) last_i ON TRUE
    -- top_topics : objets {code, name} (et non plus de simples noms) — la teinte des pastilles
    -- sujet côté UI est dérivée d'un hash de la valeur ; la fiche acteur clé par code, l'annuaire
    -- aussi désormais ⇒ teintes cohérentes entre vues (mirroir de list_actor_crm.topics). §65.
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name) ORDER BY x.n DESC) AS names
      FROM (
        SELECT rt.code, rt.name, count(*) AS n
        FROM crm_interaction ci3
        JOIN ref_code_demand_topic rt ON rt.id = ci3.demand_topic_id
        WHERE ci3.actor_id = base.actor_id
          AND (v_scope IS NULL OR ci3.object_id IS NULL OR ci3.object_id = ANY(v_scope))
          AND (v_topic_id IS NULL OR ci3.demand_topic_id = v_topic_id)
          AND (v_status IS NULL OR ci3.status = v_status)
          AND (p_from IS NULL OR ci3.occurred_at >= p_from)
          AND (p_to IS NULL OR ci3.occurred_at < p_to)
        GROUP BY rt.code, rt.name
        ORDER BY count(*) DESC
        LIMIT 2
      ) x
    ) topics ON TRUE
  ) q;

  RETURN v_items;
END;
$$;

REVOKE ALL ON FUNCTION api.list_crm_directory(text, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_directory(text, text, timestamptz, timestamptz, text) TO authenticated, service_role;

-- Auto-assertions de déploiement (fail-closed) : l'arité 4 ne doit plus exister (ambiguïté
-- PostgREST), l'arité 5 doit exister, et son search_path doit porter `extensions` (§29).
DO $assert$
DECLARE
  v_n int;
  v_cfg text[];
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'list_crm_directory';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'list_crm_directory: % surcharges (attendu 1 — ambiguite PostgREST)', v_n;
  END IF;

  SELECT p.proconfig INTO v_cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'list_crm_directory';
  IF NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%extensions%') THEN
    RAISE EXCEPTION 'list_crm_directory: search_path sans `extensions` — word_similarity introuvable a l execution (gotcha CLAUDE.md sec.29)';
  END IF;
END;
$assert$;

COMMIT;
