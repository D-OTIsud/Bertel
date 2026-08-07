-- =====================================================================
-- §208 — garde serveur des coordonnées d'ACTEUR + journal d'export
-- =====================================================================
-- Manifest : le plan §208 désigne cette étape « 16t », MAIS 16t est déjà pris
--   par §209 (migration_legal_document_catalog.sql, déjà commité) : le premier
--   créneau 16x libre est 16u. Le numéro définitif est arbitré par la tâche qui
--   câble ci_fresh_apply.sql / SQL_ROLLOUT_RUNBOOK.md — ce fichier ne câble rien.
-- Apply order : APRÈS rls_policies.sql (api.is_platform_superuser,
--   api.current_user_org_id, api.current_user_admin_rank,
--   api.current_user_extended_object_ids), APRÈS api_views_functions.sql
--   (api.get_object_resources_batch) et APRÈS migration_crm_module.sql / 8z
--   (api.current_user_crm_object_ids).
--
-- Contexte (décision log §208, spec 2026-07-31-explorer-export-excel-design.md §4.5) :
--   actor_channel n'a NI is_public NI visibility ; la seule garde est portée par
--   le LIEN (actor_object_role.visibility, DEFAULT 'public'), en tout-ou-rien.
--   api.get_object_resource est SECURITY DEFINER : il contourne la RLS
--   d'actor_channel, et render.actor_lines fuit des noms de personnes à anon
--   (mesuré : 760 objets publiés). Classe §49 : un drapeau de champ COMPOSE,
--   il ne se substitue jamais.
-- Arbitrage PO : coordonnées d'acteur complètes RÉSERVÉES aux membres de l'ORG
--   éditrice (publisher), export JOURNALISÉ avec finalité.
-- Pièges honorés : pas de bras auth.role()='service_role' (les routes partenaires
--   appellent en service-role — une clé de service n'est pas une personne) ;
--   COALESCE(…, FALSE) (sondes à trois valeurs, §204) ; gen_random_uuid()
--   (search_path restreint : la v4 d'uuid-ossp vit sous `extensions`, donc
--   irrésoluble ici — §29) ; tableau EN VALEUR (= ANY(v_scope), jamais la forme
--   sous-requête de ANY — 42883) ; REVOKE FROM PUBLIC sur toute fonction neuve.
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Recette de retour arrière : voir le bloc en fin de fichier.
-- Limites ASSUMÉES et écrites là où elles portent (ne pas les redécouvrir en audit) :
--   · journal « immuable » — voir §2, bloc REVOKE : les privilèges de table ferment
--     authenticated ET service_role, mais AUCUN trigger append-only ne protège du
--     propriétaire de la table ni d'un superuser PostgreSQL ;
--   · export_run_id / batch_index / batch_count sont des ASSERTIONS DE L'APPELANT
--     (COMMENT ON COLUMN §2) — corrélation, jamais preuve ;
--   · une tentative INTÉGRALEMENT refusée ne laisse AUCUNE ligne — voir §3, bloc
--     FORBIDDEN.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. La garde : l'appelant est-il membre d'une ORG éditrice de la fiche ?
--    Périmètre RÉUTILISÉ : api.current_user_crm_object_ids() (8z) = objets
--    dont une ORG du membership actif est publisher. Bras superuser par
--    app_user_profile.role — PAS api.is_platform_superuser() (son premier
--    bras est auth.role() IN ('service_role','admin')).
--    auth.uid() est NULL hors contexte HTTP ET en service-role ⇒ le CASE
--    court-circuite AVANT toute lecture (sonde paresseuse, §204).
--
--    ⚠ SOURCE AUTORITAIRE de la règle « qui voit les coordonnées d'un acteur ».
--    Elle porte le NOM de la règle ; tout consommateur PAR FICHE l'appelle
--    (le préflight §1bis, la tâche 13). Une SEULE autre formulation existe dans
--    tout le dépôt : la forme ENSEMBLISTE du périmètre dans api.export_actor_contacts
--    (§3, bras `ELSE`). Ce n'est PAS un miroir libre, c'est une duplication
--    DÉLIBÉRÉE et bornée, justifiée par §204 : l'export réduit jusqu'à 500 ids et
--    un scalaire SECURITY DEFINER par ligne y est un coût réel, alors que la forme
--    ensembliste ne planifie/exécute le périmètre qu'une fois (InitPlan).
--    ⇒ Toute évolution de la règle se fait ICI D'ABORD, puis dans cette unique
--      forme ensembliste. Le test permanent (tâche 14) doit asserter que les deux
--      s'accordent sur les mêmes personas — sans cette assertion, la divergence ne
--      lève aucune erreur : elle donne juste une réponse fausse.
--    ⚠ ÉNONCÉ EXACT de l'équivalence à asserter (M2) — les deux ne sont PAS égaux
--      partout : ils le sont **sur les ids qui EXISTENT dans `object`**, la forme
--      ensembliste exigeant EN PLUS l'existence (son bras superuser porte
--      `WHERE EXISTS (SELECT 1 FROM public.object o WHERE o.id = t.id)`, que cette
--      garde n'a pas — elle rend TRUE à un superuser sur n'importe quelle chaîne).
--      L'écart est du côté FAIL-CLOSED : c'est la forme qui laisse RÉELLEMENT sortir
--      la PII qui est la plus stricte. NE PAS « corriger » la garde en lui ajoutant
--      un contrôle d'existence : elle n'a pas à le porter (elle répond « cette règle
--      autorise-t-elle ? », pas « cette fiche existe-t-elle ? »), et une assertion
--      d'égalité NON BORNÉE enverrait la tâche 14 au rouge pour cette seule raison.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.can_read_actor_contacts(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
-- R2.1 — search_path SÛR pour une fonction DEFINER : `pg_temp` EXPLICITEMENT EN
-- DERNIER. Sans lui, PostgreSQL cherche le schéma temporaire EN PREMIER pour les
-- relations (doc CREATE FUNCTION §Security), donc un `CREATE TEMP TABLE
-- app_user_profile` par n'importe quel `authenticated` masquerait la table qui
-- décide ici du statut superuser. Les relations sont EN PLUS schéma-qualifiées :
-- ceinture (search_path) + bretelles (qualification).
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN FALSE
    ELSE COALESCE(
           EXISTS (SELECT 1 FROM public.app_user_profile p
                    WHERE p.id = (SELECT auth.uid())
                      AND p.role IN ('owner','super_admin'))
        OR p_object_id IN (SELECT api.current_user_crm_object_ids()),
         FALSE)
  END;
$$;

REVOKE ALL     ON FUNCTION api.can_read_actor_contacts(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.can_read_actor_contacts(text) TO   authenticated, service_role;
-- service_role a EXECUTE (les legs DEFINER/INVOKER l'évaluent sous ce rôle)
-- mais la fonction lui répond FALSE (auth.uid() NULL) — c'est le comportement voulu.

COMMENT ON FUNCTION api.can_read_actor_contacts(text) IS
  'SOURCE AUTORITAIRE (§208) de la règle « qui voit les coordonnées complètes d''un acteur » : superuser plateforme (lu dans app_user_profile.role — délibérément PAS api.is_platform_superuser(), dont le premier bras dirait TRUE à une clé service_role) OU membre d''une ORG publisher de la fiche (api.current_user_crm_object_ids). FALSE hors contexte HTTP et en service-role (auth.uid() NULL) : un export de PII est imputable à une personne. Forme PAR FICHE, appelée par api.export_actor_capabilities et par l''éditeur. UNE seule autre formulation existe : la forme ensembliste du périmètre dans api.export_actor_contacts (duplication délibérée §204) — faire évoluer les deux ensemble.';

-- ---------------------------------------------------------------------
-- 1bis. Préflight des capacités acteur (R2) : la modale d'export demande au
--    SERVEUR si la sélection donne accès à l'identité / aux coordonnées des
--    acteurs — l'offre de colonnes suit la consultation réelle, pas un proxy
--    « membre d'une ORG ». Booléens AGRÉGÉS sur la sélection (∃ une fiche
--    accessible ⇒ true : les fiches refusées resteront vides, sélection mixte
--    assumée). ERGONOMIE seulement : export_actor_contacts refait les contrôles
--    fiche par fiche — ce préflight n'est jamais une garde.
--    Les deux prédicats sont APPELÉS, jamais retranscrits :
--      · coordonnées  = api.can_read_actor_contacts(id) — la source autoritaire (§1) ;
--      · identité     = le leg `actors` de la lecture de fiche, c.-à-d. périmètre
--        étendu OU lien acteur public — ce dernier bras UNIQUEMENT sur une fiche que
--        l'appelant peut réellement lire.
--    ⚠ §36 — TOUTE entrée est intersectée avec le périmètre de l'appelant. Sans la
--    conjonction `IN (SELECT api.current_user_readable_object_ids())`, le bras
--    « lien public » serait la seule sonde du fichier à répondre sur un id NON lu :
--    la fonction est PostgREST-exécutable par tout `authenticated` et les ids sont
--    structurés donc devinables ⇒ un appel à un id fabriqué rendrait un booléen
--    révélant l'existence d'un lien acteur public sur une fiche draft/hidden/archived.
--    C'est en outre ce que fait le vrai leg : il ne s'exécute QUE sur une fiche déjà
--    atteinte (published ∪ extended) ; sans la conjonction, l'offre serait plus large
--    que la garde qu'elle prétend refléter et les colonnes reviendraient vides.
--
--    ⚠ M5 (à épingler par les tâches 13/14) : le prédicat d'IDENTITÉ ci-dessous reste une
--    RETRANSCRIPTION à la main du leg `actors` de la lecture de fiche — contrairement au
--    prédicat de coordonnées, ce leg n'a AUCUNE source appelable (il est inliné dans
--    api.get_object_resource). La tâche 13 réécrit précisément ce leg : les deux DOIVENT
--    être modifiés dans la même passe, et la tâche 14 doit asserter leur égalité sur les
--    mêmes personas — sinon l'offre de colonnes diverge de ce que la fiche laisse voir
--    sans qu'aucune erreur ne se lève. Le jour où ce leg devient appelable, l'APPELER ici
--    (comme on appelle déjà api.can_read_actor_contacts) et supprimer la transcription.
--    ► ÉTAT APRÈS LA TÂCHE 13 (2026-08-07) — la transcription reste EXACTE, et voici
--      pourquoi, précisément : la tâche 13 n'a PAS touché à la garde de LIGNE du leg. Elle
--      a ajouté un gate de CHAMP (PII + canaux sous api.can_read_actor_contacts) À
--      L'INTÉRIEUR de lignes dont le prédicat de sélection est resté
--      `WHERE aor.object_id = obj.id AND (v_can_read_extended OR aor.visibility = 'public')`,
--      octet pour octet. Or c'est CE prédicat, et lui seul, que la clé
--      `actor_identity_available` retranscrit ⇒ aucune divergence introduite.
--      Le prédicat de COORDONNÉES, lui, est désormais littéralement le même appel des deux
--      côtés (le leg appelle api.can_read_actor_contacts, comme cette clé).
--      ⚠ CE QUI RESTE À SURVEILLER : « identité » veut dire, dans le leg patché,
--      `id + display_name + rôle + dates + visibility` — PAS `first_name`/`last_name`/
--      `gender`/`note`, qui sont passés du côté COORDONNÉES. Un consommateur qui offrirait
--      une colonne « prénom » sur la foi de `actor_identity_available` offrirait du vide :
--      ces quatre champs suivent `actor_contacts_available`. La tâche 14 doit asserter
--      l'égalité SUR LE PÉRIMÈTRE AINSI DÉFINI, pas sur le mot « identité ».
--
--    COÛT — pourquoi le PLAFOND, et pourquoi le seul ordre des bras ne suffit pas (§204) :
--    api.can_read_actor_contacts est SECURITY DEFINER, donc NON INLINABLE — chaque appel
--    ré-exécute api.current_user_crm_object_ids() et l'EXISTS sur app_user_profile. Chaque
--    id peut en coûter DEUX (un par clé). L'`EXISTS` s'arrête au premier TRUE, donc le PIRE
--    cas est la sélection INTÉGRALEMENT REFUSÉE — exactement le cas d'un appelant hostile —
--    et le dédoublonnage ne borne rien : N ids fabriqués sont N ids distincts (aucun
--    contrôle d'existence). La fonction est PostgREST-exécutable par tout `authenticated`
--    ⇒ un seul appel pourrait brûler jusqu'au statement_timeout, en boucle. Classe §210
--    (fan-out par élément sur un point d'entrée piloté par l'appelant, 500 déguisé en
--    timeout). Le commentaire « ensembles d'abord, sonde par fiche en dernier » ci-dessous
--    décrit une INTENTION que SQL ne garantit pas — l'ordre d'évaluation des bras d'un `OR`
--    est un choix de coût du planificateur, jamais une promesse. Ce qui rend la borne
--    RÉELLE est le PLAFOND DUR de 500 ids, identique (forme du message ET SQLSTATE) à celui
--    de api.export_actor_contacts (§3) : les deux entrées du même chantier refusent la même
--    taille de la même façon.
--    LANGUAGE plpgsql (et non sql) uniquement pour pouvoir LEVER ce plafond.
--
--    CONTRAT D'APPEL — ce n'est PAS un appel « one-shot » (ce que ce commentaire affirmait
--    à tort jusqu'à la revue 3e vague, alors que le plafond venait d'être posé) : au-delà
--    de 500 ids, c'est à l'APPELANT de DÉCOUPER et de réduire les deux booléens par `OR`
--    entre lots. C'est légitime et exact, pas une approximation : les deux clés sont des
--    `EXISTS` sur l'ensemble reçu, et `EXISTS(A ∪ B) = EXISTS(A) OR EXISTS(B)` — le
--    découpage rend donc EXACTEMENT ce qu'un appel unique non plafonné aurait rendu.
--    Un « tout sélectionner » sur le corpus publié (~840 fiches) en pose deux ; l'appelant
--    de référence (modale d'export, `fetchActorExportCapabilities`) découpe avec la MÊME
--    constante que l'export lui-même (ACTOR_EXPORT_BATCH = 500), séquentiellement, et
--    referme TOUT si un seul lot échoue. L'appel reste hors chemin chaud (à l'ouverture de
--    la modale, jamais par ligne). Un appelant qui envoie la sélection entière SANS
--    découper ne « voit » pas d'erreur utile : il reçoit 22023 et referme ses capacités —
--    les colonnes acteur disparaissent SANS SIGNAL. C'est la panne qui a été corrigée.
--    CORRIGÉ REVUE 4E VAGUE — cette dernière phrase ÉNONÇAIT le contrat sans que le code
--    l'implémente : le RPC ct-serveur ne rejette jamais côté client (PostgREST rend un
--    objet `{error}`, jamais un rejet), et le premier découpage réduisait par OR MÊME sur
--    un lot en échec — un lot mort contribuait silencieusement `false` puis un lot suivant
--    accordé rouvrait l'offre en un agrégat PARTIEL, jamais fermé. Le fix ajoute une
--    variante bas niveau côté service (`getExportActorCapabilitiesResult`, rpc.ts) qui rend
--    un résultat DISCRIMINÉ (`{ok:false}` sur toute erreur vs `{ok:true,caps}` sur un
--    verdict réel) ; c'est ce champ `ok`, et non une promesse rejetée, que le découpage lit
--    pour abandonner la boucle SANS OR-er les lots déjà accordés. Le contrat ci-dessus est
--    désormais RÉELLEMENT tenu, pas seulement documenté.
--
--    ⚠ FORME AMONT, non retenue dans cette passe (à reprendre quand ce chantier rouvrira) :
--    la vraie sortie est une forme ENSEMBLISTE autoritaire —
--    `api.can_read_actor_contacts_ids(text[]) RETURNS SETOF text` — appelée À LA FOIS par
--    ce préflight et par le bloc « autorise-une-fois » de api.export_actor_contacts. Elle
--    donnerait un seul InitPlan au lieu d'un fan-out par id : plus de plafond, donc plus de
--    découpage côté appelant, et surtout plus de RETRANSCRIPTION à la main (M5 ci-dessus) —
--    l'égalité garde↔export deviendrait une TAUTOLOGIE au lieu d'une paire que la tâche 14
--    doit asserter sur des personas. Non faite ici parce qu'elle réécrit le corps du RPC
--    d'export de PII (déjà revu, journalisé, et hors du périmètre d'un correctif de revue) :
--    c'est sa propre passe, avec ses propres tests de non-régression.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.export_actor_capabilities(p_object_ids text[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp   -- R2.1 : pg_temp EN DERNIER
AS $$
DECLARE
  v_ids    text[];
  v_result jsonb;
BEGIN
  -- Dédoublonnage / nettoyage serveur, IDENTIQUE à celui de api.export_actor_contacts.
  SELECT COALESCE(array_agg(DISTINCT btrim(t.id)), '{}') INTO v_ids
    FROM unnest(p_object_ids) AS t(id)
   WHERE btrim(coalesce(t.id, '')) <> '';

  -- PLAFOND DUR — même message et même SQLSTATE que api.export_actor_contacts (§3).
  -- C'est LUI, et non l'ordre des bras du `OR`, qui borne le fan-out 2N décrit ci-dessus.
  IF coalesce(array_length(v_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE: 500 max apres dedoublonnage (recu %)', array_length(v_ids, 1)
      USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'actor_identity_available',
      EXISTS (
        SELECT 1 FROM unnest(v_ids) AS i(id)
         -- Ensembles d'abord, sonde par fiche en dernier : une INDICATION de lecture, pas
         -- une garantie d'exécution (cf. l'entête — le plafond est la vraie borne).
         WHERE i.id IN (SELECT api.current_user_extended_object_ids())
            OR (i.id IN (SELECT api.current_user_readable_object_ids())
                AND EXISTS (SELECT 1 FROM public.actor_object_role aor
                             WHERE aor.object_id = i.id AND aor.visibility = 'public'))
            -- qui voit les coordonnées voit a fortiori l'identité (couvre le superuser)
            OR COALESCE(api.can_read_actor_contacts(i.id), FALSE)),
    'actor_contacts_available',
      EXISTS (
        SELECT 1 FROM unnest(v_ids) AS i(id)
         WHERE COALESCE(api.can_read_actor_contacts(i.id), FALSE))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL     ON FUNCTION api.export_actor_capabilities(text[]) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION api.export_actor_capabilities(text[]) TO   authenticated;

COMMENT ON FUNCTION api.export_actor_capabilities(text[]) IS
  'Préflight ERGONOMIQUE (§208 R2) de la modale d''export : deux booléens agrégés sur la sélection réelle — l''offre de colonnes acteur suit la consultation effective, pas un proxy « membre d''une ORG ». N''est JAMAIS une garde : api.export_actor_contacts refait tous les contrôles fiche par fiche et c''est lui seul qui journalise. Appelle api.can_read_actor_contacts (source autoritaire) plutôt que de la retranscrire ; chaque bras est intersecté avec le périmètre lisible de l''appelant (§36) — aucun oracle d''existence sur un id non lu. PLAFOND DUR de 500 ids après dédoublonnage (BATCH_TOO_LARGE, SQLSTATE 22023), identique à celui de api.export_actor_contacts : la garde appelée est SECURITY DEFINER donc non inlinable, et le pire cas (sélection intégralement refusée, le cas d''un appelant hostile) coûte 2 évaluations par id — le plafond est ce qui borne réellement ce fan-out, pas l''ordre des bras du OR.';

-- ---------------------------------------------------------------------
-- 1ter. R2.1 — durcissement du search_path des feuilles d'autorisation dont
--    dépendent les fonctions de ce fichier. ALTER FUNCTION ne touche PAS le
--    corps (aucun risque de transcription) : il ne fait que placer `pg_temp`
--    explicitement EN DERNIER, là où PostgreSQL le cherchait EN PREMIER pour
--    les relations. Iso-fonctionnel pour tout usage légitime.
--    ⚠ Ces deux fonctions sont consommées par de nombreuses policies RLS —
--    ne PAS les recréer ici, seulement les altérer.
--    Les SOURCES sont corrigées en parallèle (rls_policies.sql,
--    migration_explorer_rls_setbased.sql qui recrée la même fonction en 8i,
--    migration_crm_module.sql) pour qu'une base fraîche naisse durcie.
-- ---------------------------------------------------------------------
ALTER FUNCTION api.current_user_crm_object_ids()
  SET search_path = pg_catalog, public, api, auth, pg_temp;
ALTER FUNCTION api.current_user_extended_object_ids()
  SET search_path = pg_catalog, public, api, auth, pg_temp;
-- 3ᵉ feuille, ajoutée avec la conjonction §36 du préflight ci-dessus : son corps lit
-- `object` SANS qualification, donc sous la forme faible (`public, api, auth`) un
-- `CREATE TEMP TABLE object` par n'importe quel `authenticated` injecterait des ids
-- arbitraires dans l'ensemble « lisible » — exactement l'oracle que la conjonction
-- ferme. Sa SOURCE (migration_cards_batch_authorize_definer.sql, étape 8j) est corrigée
-- DANS LA MÊME PASSE (M4) : les trois feuilles d'autorisation sont désormais durcies à
-- la source ET par cet ALTER, sans asymétrie. L'ALTER reste néanmoins nécessaire pour
-- converger une base DÉJÀ déployée avec l'ancienne forme de 8j.
ALTER FUNCTION api.current_user_readable_object_ids()
  SET search_path = pg_catalog, public, api, auth, pg_temp;

-- ⚠ CAVEAT DE REJEU — à reprendre VERBATIM au runbook (tâche 15).
--    Le risque n'est PAS l'étape 8j (sa source est durcie depuis M4 : la rejouer
--    recrée déjà la bonne forme). Le risque est l'étape 5, `api_views_functions.sql` :
--    elle porte, vers la ligne 7613, une DÉCLARATION ANTICIPÉE de
--    api.current_user_readable_object_ids() sous forme de STUB —
--    `AS $stub$ SELECT NULL::text WHERE false $stub$`, sans SECURITY DEFINER et sans
--    search_path (elle n'existe que pour que le corps SQL de api.list_object_markers
--    valide au CREATE, la vraie définition arrivant en 8j).
--    Conséquence sur une base VIVE : re-déployer api_views_functions.sql ne « dé-durcit »
--    pas la feuille, il la REMPLACE par une fonction qui rend l'ENSEMBLE VIDE — et vide
--    donc silencieusement api.list_object_markers (la carte de l'Exploreur perd tous ses
--    pins) en plus de fermer le bras « lien public » de ce préflight.
--    ⇒ ORDRE OBLIGATOIRE après tout re-déploiement de `api_views_functions.sql` sur une
--      base vive : rejouer d'ABORD `migration_cards_batch_authorize_definer.sql` (8j,
--      qui réinstalle le vrai corps DEFINER durci), PUIS les `ALTER FUNCTION` de ce
--      fichier (§1ter, pour converger les deux autres feuilles si elles ont aussi été
--      re-créées par une re-application de rls_policies.sql / 8i / migration_crm_module.sql).
--    Une base FRAÎCHE n'est pas concernée : le manifeste applique 5 → 8j → ce fichier.

-- ---------------------------------------------------------------------
-- 2. Journal des exports de coordonnées (modèle : object_deletion_log).
--    Pas de FK vers object ni actor : la ligne survit à rpc_delete_object et à
--    l'effacement RGPD art. 17. AUCUNE VALEUR de coordonnée n'y entre jamais —
--    qui, quand, combien, quels ids, quels TYPES de canaux. Pas les valeurs.
--    Relations SCHÉMA-QUALIFIÉES ici aussi : ce fichier ne pose aucun search_path
--    de session, donc une DDL nue atterrirait dans le premier schéma de la session
--    qui l'applique — alors que le corps du RPC écrit, lui, dans
--    `public.actor_contact_export_log`. Ceinture + bretelles, y compris sur l'objet
--    que ce fichier crée lui-même.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.actor_contact_export_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- R1 : tous les LOTS d'un même export logique partagent export_run_id (fourni
  -- par le client, sinon généré) ; batch_index/batch_count situent le lot.
  export_run_id   UUID NOT NULL,
  batch_index     INT  NOT NULL DEFAULT 1,
  batch_count     INT  NOT NULL DEFAULT 1,
  performed_by    UUID,
  performed_org   TEXT,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT NOT NULL,
  format          TEXT,
  object_count    INT  NOT NULL DEFAULT 0,
  actor_count     INT  NOT NULL DEFAULT 0,
  -- Nommée d'après CE qu'elle compte (cf. COMMENT ON COLUMN) : une LIGNE de la même
  -- table ne doit pas porter deux conventions de comptage. object_count/actor_count
  -- sont des comptages DISTINCTS ; celle-ci compte les coordonnées ÉMISES.
  emitted_contact_count INT NOT NULL DEFAULT 0,
  object_ids      TEXT[] NOT NULL DEFAULT '{}',
  denied_object_ids TEXT[] NOT NULL DEFAULT '{}',
  actor_ids       UUID[] NOT NULL DEFAULT '{}',
  channel_kinds   TEXT[] NOT NULL DEFAULT '{}',
  identity_fields TEXT[] NOT NULL DEFAULT '{}',
  -- R1 multi-ORG : QUELLES ORG publisher ont permis l'accès (bras RLS de lecture)
  -- + l'attribution détaillée objet↔ORG. current_user_crm_object_ids() ne le dit pas.
  org_object_ids  TEXT[] NOT NULL DEFAULT '{}',
  org_attributions JSONB NOT NULL DEFAULT '[]',
  report          JSONB
);

-- Convergence : une base ayant appliqué une version ANTÉRIEURE de ce fichier porte
-- encore l'ancien nom `channel_count` — que `CREATE TABLE IF NOT EXISTS` ne corrigerait
-- jamais (il ne fait rien sur une table existante). Renommage guardé ⇒ le fichier reste
-- réellement idempotent, y compris contre lui-même.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
              WHERE a.attrelid = 'public.actor_contact_export_log'::regclass
                AND a.attname = 'channel_count' AND NOT a.attisdropped)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
              WHERE a.attrelid = 'public.actor_contact_export_log'::regclass
                AND a.attname = 'emitted_contact_count' AND NOT a.attisdropped)
  THEN
    ALTER TABLE public.actor_contact_export_log
      RENAME COLUMN channel_count TO emitted_contact_count;
  END IF;
END$$;

COMMENT ON TABLE public.actor_contact_export_log IS
  'Journal des exports de coordonnées d''acteur (§208). Écrit uniquement par api.export_actor_contacts ; aucune valeur de coordonnée n''y figure ; survit à la suppression des objets/acteurs (pas de FK). export_run_id relie les lots d''un même export ; org_object_ids/org_attributions disent quelle ORG publisher a autorisé quoi (multi-ORG). IMMUABILITÉ — portée exacte : ni PUBLIC, ni anon, ni authenticated, ni service_role ne peuvent écrire (privilèges de table retirés ; ils ne sont PAS contournés par le BYPASSRLS de service_role). AUCUN trigger append-only : le propriétaire de la table et un superuser PostgreSQL peuvent encore modifier ou supprimer une ligne. FIDÉLITÉ — performed_by / performed_at / object_ids / denied_object_ids / org_object_ids sont dérivés du SERVEUR et font foi ; export_run_id / batch_index / batch_count sont des assertions de l''appelant (corrélation seulement). Une tentative INTÉGRALEMENT refusée ne laisse aucune ligne (cf. api.export_actor_contacts).';

COMMENT ON COLUMN public.actor_contact_export_log.export_run_id IS
  'ASSERTION DE L''APPELANT, non vérifiée : sert à recoller les lots d''un même export logique. Un appelant peut fournir l''identifiant d''une autre campagne. Non évidentiel — l''imputabilité repose sur performed_by/performed_at/object_ids, dérivés du serveur.';
COMMENT ON COLUMN public.actor_contact_export_log.batch_index IS
  'ASSERTION DE L''APPELANT, non vérifiée (seule la cohérence 1 <= index <= count est contrôlée). Cinquante appels déclarant chacun batch_index=1/batch_count=1 se reconstruisent en cinquante exports d''un lot, pas en un balayage. Non évidentiel.';
COMMENT ON COLUMN public.actor_contact_export_log.batch_count IS
  'ASSERTION DE L''APPELANT, non vérifiée — cf. batch_index. Non évidentiel.';
COMMENT ON COLUMN public.actor_contact_export_log.emitted_contact_count IS
  'Nombre de coordonnées ÉMISES dans le fichier — donc une par ligne rendue : les canaux d''un acteur sont recomptés pour CHAQUE lien acteur↔objet (la PK de actor_object_role est (actor_id, object_id, role_id), deux rôles sur une même fiche produisent deux lignes). Ce n''est PAS un nombre de canaux distincts, à la différence de object_count/actor_count qui sont des comptages DISTINCTS. Le nom dit la convention : ne pas le lire comme une métrique de volumétrie de canaux.';

CREATE INDEX IF NOT EXISTS idx_acel_at    ON public.actor_contact_export_log (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acel_by    ON public.actor_contact_export_log (performed_by, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acel_run   ON public.actor_contact_export_log (export_run_id);
CREATE INDEX IF NOT EXISTS idx_acel_actor ON public.actor_contact_export_log USING GIN (actor_ids);

ALTER TABLE public.actor_contact_export_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS actor_contact_export_log_read ON public.actor_contact_export_log;
-- R1 : l'admin d'ORG lit les exports où SON ORG a autorisé au moins une fiche
-- (org_object_ids), pas seulement ceux dont l'exportateur avait son ORG active —
-- sans quoi la politique serait ambiguë à plusieurs ORG.
-- §39 : les appels d'autorisation sont wrappés en (select …) ⇒ un seul InitPlan.
-- §55 : la colonne EXTERNE est table-qualifiée (une colonne nue se relierait au
-- plus interne au prochain CREATE si une table sondée gagnait un homonyme).
CREATE POLICY actor_contact_export_log_read ON public.actor_contact_export_log
  FOR SELECT TO authenticated USING (
    (SELECT api.is_platform_superuser())
    OR ((SELECT api.current_user_admin_rank()) IS NOT NULL
        AND (SELECT api.current_user_org_id()) = ANY(actor_contact_export_log.org_object_ids))
  );
-- Pas de policy INSERT/UPDATE/DELETE : seul le RPC DEFINER écrit ; par commande,
-- jamais une policy toutes-commandes (celle-ci s'appliquerait aussi au SELECT).
--
-- « Immuable » doit être APPLIQUÉ, pas seulement affirmé. L'absence de policy
-- d'écriture est un refus correct pour `authenticated` — mais `service_role` porte
-- BYPASSRLS : la RLS ne lui oppose rien. Les privilèges de TABLE, eux, ne sont PAS
-- contournés par BYPASSRLS ⇒ on retire explicitement l'écriture aux deux rôles
-- clients (les privilèges par défaut de Supabase les accordent sur toute table neuve
-- de `public`, donc le REVOKE FROM PUBLIC, anon ci-dessous ne suffit pas).
-- REVOKE ALL plutôt qu'une ÉNUMÉRATION de verbes : énumérer INSERT/UPDATE/DELETE/TRUNCATE
-- laissait derrière TRIGGER et REFERENCES, que les privilèges par défaut de Supabase
-- accordent aussi sur toute table neuve de `public` (REFERENCES permet d'ancrer une FK sur
-- le journal — donc d'en contraindre la suppression ; TRIGGER d'y poser du code). On retire
-- TOUT aux quatre destinataires, puis on re-GRANT le SELECT, seul privilège voulu.
-- C'est plus court, complet, et conforme à la doctrine « ceinture + bretelles » du fichier.
-- Le RPC est SECURITY DEFINER et insère donc en tant que PROPRIÉTAIRE de la table
-- (le rôle qui applique ce fichier) : REVOKE … FROM <rôles> ne nomme PAS le propriétaire,
-- dont les privilèges sont IMPLICITES (l'ACL d'une table neuve est `proprio=arwdDxt/proprio`,
-- ou NULL = « tout au propriétaire ») — REVOKE ALL les laisse donc intacts. Et le
-- propriétaire n'est pas soumis à la RLS de sa table (pas de FORCE ROW LEVEL SECURITY).
-- LIMITE ASSUMÉE : aucun trigger append-only. Ce propriétaire, et tout superuser
-- PostgreSQL, peuvent encore modifier ou supprimer une ligne. Le journal est
-- inviolable POUR LES RÔLES CLIENTS, pas contre un accès administrateur à la base.
REVOKE ALL    ON public.actor_contact_export_log FROM PUBLIC, anon, authenticated, service_role;
-- M6 — service_role garde le SELECT alors qu'il se voit délibérément REFUSER l'export
-- (§3 : « un export de PII est imputable à une personne »). Asymétrie ASSUMÉE mais
-- inconfortable : porteur de BYPASSRLS, service_role lit le journal ENTIER, la policy de
-- lecture ne lui opposant rien. Recherche faite le 2026-08-07 sur tout le dépôt
-- (`grep -rn "actor_contact_export_log"`) : AUCUN consommateur — ni route serveur, ni
-- service front, ni tâche cron ; les seules occurrences sont ce fichier et les documents
-- de plan/spec §208. Le GRANT n'est donc PAS retiré dans cette passe (le retirer serait un
-- changement de surface sans besoin établi, et il faudrait le rendre si une future route
-- d'administration lit le journal), mais il est à ARBITRER : si aucun consommateur
-- n'apparaît d'ici la mise en service, `REVOKE SELECT … FROM service_role` referme
-- l'asymétrie sans rien casser.
GRANT  SELECT ON public.actor_contact_export_log TO authenticated, service_role;

-- ⚠ GARDE D'APPLICATION (revue 3e vague) — « immuable » doit ÉCHOUER FORT, jamais
-- s'éteindre en avertissement. Sur un REJEU, le `CREATE TABLE IF NOT EXISTS` ci-dessus
-- est un NO-OP : le rôle qui applique peut alors n'être NI propriétaire de la table NI
-- porteur du grant option, et PostgreSQL répond au REVOKE par un simple
-- `WARNING: no privileges could be revoked` — que `ON_ERROR_STOP=1` NE RATTRAPE PAS.
-- Le déploiement serait déclaré VERT avec un journal encore INSCRIPTIBLE par
-- `authenticated`/`service_role` : exactement la panne silencieuse que ce bloc REVOKE
-- existe pour empêcher. On asserte donc l'EFFET (et non un proxy comme la propriété :
-- l'effet couvre aussi toute autre cause, et reste vrai si un passage antérieur avait
-- déjà révoqué). Lecture par `aclexplode(relacl)` et non par information_schema :
-- ce dernier ne montre que les privilèges dont le rôle courant est grantor/grantee,
-- donc il pourrait RATER la fuite qu'on cherche précisément à voir.
DO $$
DECLARE
  v_owner name;
  v_leak  text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO v_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'actor_contact_export_log';

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'public.actor_contact_export_log introuvable : le REVOKE d''immuabilite n''a pas pu etre applique';
  END IF;

  SELECT string_agg(DISTINCT format('%s=%s',
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
           a.privilege_type), ', ')
    INTO v_leak
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) AS a
   WHERE n.nspname = 'public'
     AND c.relname = 'actor_contact_export_log'
     AND (a.grantee = 0
          OR pg_catalog.pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'service_role'))
     AND a.privilege_type <> 'SELECT';

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'journal actor_contact_export_log ENCORE inscriptible par un role client (%) — le REVOKE n''a PAS pris', v_leak
      USING HINT = format('Appliquer ce fichier en tant que proprietaire de la table (%s), ou lui redonner le grant option.', v_owner);
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 3. L'export : autorise-une-fois (§36 — la liste d'ids du client n'est jamais
--    de confiance) + journalisation DANS LA MÊME TRANSACTION que la lecture.
--    Plafond dur 500 : aspirer le corpus produit N lignes de journal, pas une.
--    PAS de GRANT à service_role : un export doit être imputable à une personne.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.export_actor_contacts(
  p_object_ids    text[],
  p_reason        text,
  p_format        text DEFAULT 'xlsx',
  p_export_run_id uuid DEFAULT NULL,   -- R1 : partagé entre les lots d'un même export ; NULL = généré
  p_batch_index   int  DEFAULT 1,
  p_batch_count   int  DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp   -- R2.1 : pg_temp EN DERNIER
AS $$
DECLARE
  v_caller    uuid := (SELECT auth.uid());
  v_super     boolean;
  v_org       text;
  v_ids       text[];
  v_scope     text[];
  v_denied    text[];
  v_rows      jsonb;
  v_actors    uuid[];
  v_emitted   bigint;   -- coordonnées ÉMISES (une par ligne rendue), pas canaux distincts
  v_kinds     text[];
  v_org_ids   text[];
  v_org_attr  jsonb;
  v_run_id    uuid := COALESCE(p_export_run_id, gen_random_uuid());
  v_log_id    uuid := gen_random_uuid();  -- search_path restreint : jamais la v4 d'uuid-ossp (§29)
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT' USING ERRCODE = '42501';
  END IF;
  -- R1 : la finalité est validée SERVEUR (la modale seule n'est pas une protection).
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: finalite de 5 caracteres minimum' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'REASON_TOO_LONG: 500 caracteres maximum' USING ERRCODE = '22023';
  END IF;
  IF lower(coalesce(p_format, '')) NOT IN ('xlsx', 'csv') THEN
    RAISE EXCEPTION 'FORMAT_INVALID: xlsx ou csv' USING ERRCODE = '22023';
  END IF;
  IF p_batch_index < 1 OR p_batch_count < 1 OR p_batch_index > p_batch_count THEN
    RAISE EXCEPTION 'BATCH_META_INVALID' USING ERRCODE = '22023';
  END IF;

  -- R1 : dédoublonnage et nettoyage CÔTÉ SERVEUR, plafond appliqué APRÈS.
  SELECT COALESCE(array_agg(DISTINCT btrim(t.id)), '{}') INTO v_ids
    FROM unnest(p_object_ids) AS t(id)
   WHERE btrim(coalesce(t.id, '')) <> '';
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'EMPTY_SELECTION' USING ERRCODE = '22023';
  END IF;
  IF array_length(v_ids, 1) > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE: 500 max apres dedoublonnage (recu %)', array_length(v_ids, 1)
      USING ERRCODE = '22023';
  END IF;

  -- R2.1 : relations schéma-qualifiées (pg_temp ne peut plus masquer la table
  -- qui décide du statut superuser, ni celles du périmètre).
  v_super := EXISTS (SELECT 1 FROM public.app_user_profile p
                      WHERE p.id = v_caller AND p.role IN ('owner','super_admin'));
  v_org := api.current_user_org_id();

  -- Autorise-une-fois : on réduit la demande au périmètre de l'appelant, PAR FICHE.
  -- ⚠ Ce bloc est la forme ENSEMBLISTE de api.can_read_actor_contacts (§1), qui reste
  -- la définition AUTORITAIRE de la règle. La duplication est délibérée et bornée à
  -- ces deux endroits : §204 — la simple présence d'un scalaire SECURITY DEFINER
  -- évalué par ligne sur jusqu'à 500 ids est un coût réel, alors qu'ici le périmètre
  -- n'est calculé qu'une fois (InitPlan). Ce n'est PAS « un miroir » libre de dériver :
  -- ajouter un bras à la garde SANS l'ajouter ici change ce que le préflight offre et
  -- ce que la tâche 13 autorise, sans changer ce que l'export laisse réellement sortir
  -- — aucune erreur ne se lève, la réponse est simplement fausse.
  -- ⚠ ÉNONCÉ EXACT de l'équivalence (M2) : les deux formes s'accordent **sur les ids qui
  -- EXISTENT dans `object`**. Le bras superuser ci-dessous exige EN PLUS l'existence
  -- (`EXISTS (SELECT 1 FROM public.object …)`), que api.can_read_actor_contacts n'a pas —
  -- elle rend TRUE à un superuser sur n'importe quelle chaîne. Écart DÉLIBÉRÉ et
  -- fail-closed : c'est ce bras-ci, celui qui laisse réellement sortir la PII, qui est le
  -- plus strict. La tâche 14 doit asserter l'accord des deux formes SUR CE PÉRIMÈTRE, et
  -- surtout ne pas « réparer » la garde en lui ajoutant un contrôle d'existence.
  IF v_super THEN
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_scope
      FROM unnest(v_ids) AS t(id)
     WHERE EXISTS (SELECT 1 FROM public.object o WHERE o.id = t.id);
  ELSE
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_scope
      FROM unnest(v_ids) AS t(id)
     WHERE t.id IN (SELECT api.current_user_crm_object_ids());
  END IF;

  -- R1 : sélection MIXTE = on sert l'autorisé et on NOMME le refusé (le fichier
  -- n'échoue pas) ; tout-refusé = FORBIDDEN.
  SELECT COALESCE(array_agg(t.id), '{}') INTO v_denied
    FROM unnest(v_ids) AS t(id)
   WHERE NOT (t.id = ANY(v_scope));
  -- LIMITE ASSUMÉE (journal) : ce RAISE précède l'INSERT et le fait donc annuler avec
  -- la transaction ⇒ une tentative INTÉGRALEMENT refusée ne laisse AUCUNE trace. Un
  -- balayage d'énumération sur des fiches qu'on ne possède pas est invisible ; seules
  -- les sélections MIXTES sont journalisées (avec denied_object_ids). Pour un journal
  -- d'accès, « tenté et refusé » est souvent la ligne la plus intéressante — la
  -- consigner exigerait d'écrire hors transaction (dblink / autonomous / trigger sur un
  -- log d'échec), mécanisme volontairement NON introduit ici. Décision explicite, pas
  -- un oubli : à rouvrir si l'exigence d'audit le demande.
  IF coalesce(array_length(v_scope, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- R1 multi-ORG : QUELLE ORG publisher autorise chaque fiche du périmètre.
  -- Pour un superuser sans membership, l'attribution retombe sur la/les ORG
  -- publisher de la fiche (granted_via = 'superuser' dans report).
  SELECT COALESCE(array_agg(DISTINCT ool.org_object_id), '{}'),
         COALESCE(jsonb_agg(DISTINCT jsonb_build_object('object_id', ool.object_id, 'org_object_id', ool.org_object_id)), '[]')
    INTO v_org_ids, v_org_attr
    FROM public.object_org_link ool
    JOIN public.ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
   WHERE ool.object_id = ANY(v_scope)
     AND (v_super OR ool.org_object_id IN (
           SELECT uom.org_object_id FROM public.user_org_membership uom
            WHERE uom.user_id = v_caller AND uom.is_active = TRUE));

  -- n_channels = tous les canaux de l'acteur, répétés sur CHAQUE ligne (une par lien
  -- acteur↔objet↔rôle) : leur somme est donc exactement le nombre de coordonnées
  -- ÉMISES dans le fichier. C'est la convention que porte le nom de la colonne —
  -- object_count/actor_count, eux, sont DISTINCTS.
  SELECT COALESCE(jsonb_agg(r.line ORDER BY r.object_id, r.is_primary DESC, r.display_name), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT r.actor_id), '{}'::uuid[]),
         COALESCE(sum(r.n_channels), 0)
    INTO v_rows, v_actors, v_emitted
    FROM (
      SELECT aor.object_id, a.id AS actor_id, a.display_name, aor.is_primary,
             COALESCE(ch.n, 0) AS n_channels,
             jsonb_build_object(
               'object_id',    aor.object_id,
               'object_name',  o.name,
               'actor_id',     a.id,
               'display_name', a.display_name,
               'first_name',   a.first_name,
               'last_name',    a.last_name,
               'role_code',    rar.code,
               'role_name',    rar.name,
               'is_primary',   aor.is_primary,
               'note',         aor.note,
               'valid_from',   aor.valid_from,
               'valid_to',     aor.valid_to,
               'contacts',     COALESCE(ch.items, '[]'::jsonb)
             ) AS line
        FROM public.actor_object_role aor
        JOIN public.object o ON o.id = aor.object_id
        JOIN public.actor  a ON a.id = aor.actor_id
        LEFT JOIN public.ref_actor_role rar ON rar.id = aor.role_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'kind_code',  rck.code,
                   'kind_name',  rck.name,
                   'value',      ac.value,
                   'is_primary', ac.is_primary,
                   'role_code',  rcr.code
                 ) ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at) AS items,
                 count(*) AS n
            FROM public.actor_channel ac
            JOIN public.ref_code_contact_kind rck ON rck.id = ac.kind_id
            LEFT JOIN public.ref_contact_role rcr ON rcr.id = ac.role_id
           WHERE ac.actor_id = a.id
        ) ch ON TRUE
       WHERE aor.object_id = ANY(v_scope)   -- valeur tableau, jamais la forme sous-requête de ANY : 42883
    ) r;

  SELECT COALESCE(array_agg(DISTINCT rck.code), '{}') INTO v_kinds
    FROM public.actor_object_role aor
    JOIN public.actor_channel ac          ON ac.actor_id = aor.actor_id
    JOIN public.ref_code_contact_kind rck ON rck.id = ac.kind_id
   WHERE aor.object_id = ANY(v_scope);

  INSERT INTO public.actor_contact_export_log(
    id, export_run_id, batch_index, batch_count,
    performed_by, performed_org, reason, format,
    object_count, actor_count, emitted_contact_count,
    object_ids, denied_object_ids, actor_ids, channel_kinds, identity_fields,
    org_object_ids, org_attributions, report)
  VALUES (
    v_log_id, v_run_id, p_batch_index, p_batch_count,
    v_caller, v_org, btrim(p_reason), lower(p_format),
    coalesce(array_length(v_scope, 1), 0), coalesce(array_length(v_actors, 1), 0), v_emitted,
    v_scope, v_denied, v_actors, v_kinds,
    ARRAY['display_name','first_name','last_name','role','note','validity'],
    v_org_ids, v_org_attr,
    jsonb_build_object(
      'requested_count', array_length(v_ids, 1),
      'granted_count',   array_length(v_scope, 1),
      'denied_count',    coalesce(array_length(v_denied, 1), 0),
      'granted_via',     CASE WHEN v_super THEN 'superuser' ELSE 'org_membership' END));

  RETURN jsonb_build_object(
    'log_id',                v_log_id,
    'export_run_id',         v_run_id,
    'batch_index',           p_batch_index,
    'batch_count',           p_batch_count,
    'exported_at',           now(),
    'authorized_object_ids', to_jsonb(v_scope),
    'denied_object_ids',     to_jsonb(v_denied),
    'object_count',          coalesce(array_length(v_scope, 1), 0),
    'actor_count',           coalesce(array_length(v_actors, 1), 0),
    -- même convention que la colonne du journal : coordonnées ÉMISES, pas canaux distincts
    'emitted_contact_count', v_emitted,
    'rows',                  v_rows);
END;
$$;

-- R1 : REVOKE explicite de service_role EN PLUS de PUBLIC/anon — un export de PII
-- est imputable à une personne, jamais à une clé.
REVOKE ALL     ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) TO   authenticated;

COMMENT ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) IS
  'Export JOURNALISÉ des coordonnées d''acteur (§208), seule voie autorisée : autorise-une-fois (§36 — la liste d''ids du client n''est jamais de confiance, elle est réduite fiche par fiche au périmètre de l''appelant), finalité validée serveur (5–500 car.), format xlsx|csv, dédoublonnage serveur, plafond dur de 500 ids par appel, puis écriture d''une ligne dans public.actor_contact_export_log DANS LA MÊME TRANSACTION que la lecture. Sélection mixte : sert l''autorisé et NOMME le refusé (denied_object_ids) ; tout-refusé ⇒ FORBIDDEN (42501) et — limite assumée — aucune ligne de journal. Pas de GRANT à service_role : un export de PII est imputable à une personne. Le bras de périmètre est la forme ensembliste de api.can_read_actor_contacts (duplication délibérée §204) : faire évoluer les deux ensemble.';

-- ---------------------------------------------------------------------
-- 4. Hygiène §208 : l'EXECUTE de get_object_resources_batch n'était porté que
--    par le PUBLIC implicite (proacl NULL). Iso-fonctionnel pour l'app
--    (authenticated), retiré à anon (0 consommateur documenté, 0 appelant).
--    ⚠ Ne JAMAIS reproduire ce REVOKE sur api.get_object_resource sans
--    re-GRANT explicite à anon ET service_role (routes partenaires).
-- ---------------------------------------------------------------------
REVOKE ALL     ON FUNCTION api.get_object_resources_batch(text[], text[], text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.get_object_resources_batch(text[], text[], text, jsonb) TO authenticated, service_role;

COMMIT;

-- Trois fonctions api neuves exposées PostgREST (can_read_actor_contacts,
-- export_actor_capabilities, export_actor_contacts) :
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- Retour arrière (recette explicite — à jouer dans une seule transaction)
-- =====================================================================
--   DROP FUNCTION IF EXISTS api.export_actor_contacts(text[], text, text, uuid, int, int);
--   DROP FUNCTION IF EXISTS api.export_actor_capabilities(text[]);
--   DROP FUNCTION IF EXISTS api.can_read_actor_contacts(text);
--   DROP POLICY   IF EXISTS actor_contact_export_log_read ON public.actor_contact_export_log;
--   -- ⚠ Le journal est une trace RGPD : ne le supprimer que si l'on assume la
--   --   perte de la preuve des exports déjà réalisés.
--   -- DROP TABLE IF EXISTS public.actor_contact_export_log;
--   -- Si la table est CONSERVÉE alors que le RPC est retiré, les privilèges retirés
--   --   (REVOKE ALL à PUBLIC/anon/authenticated/service_role, seul SELECT re-GRANTé)
--   --   le restent : c'est l'état voulu (personne ne doit écrire sans passer par le
--   --   RPC). Pour revenir strictement à l'état antérieur des privilèges par défaut
--   --   Supabase (les 7 verbes, TRIGGER et REFERENCES compris) :
--   --   GRANT ALL ON public.actor_contact_export_log TO authenticated, service_role;
--   --     -- ⚠ rouvre l'écriture du journal
--   -- Le renommage channel_count -> emitted_contact_count :
--   --   ALTER TABLE public.actor_contact_export_log
--   --     RENAME COLUMN emitted_contact_count TO channel_count;   -- ⚠ nom trompeur
--   -- Étape 1ter (search_path) : revenir à la forme faible n'a aucun intérêt de
--   --   sécurité ; si un besoin d'iso-état l'exige :
--   --   ALTER FUNCTION api.current_user_crm_object_ids()      SET search_path = public, api, auth;
--   --   ALTER FUNCTION api.current_user_extended_object_ids() SET search_path = public, api, auth;
--   --   ALTER FUNCTION api.current_user_readable_object_ids() SET search_path = public, api, auth;
--   -- Étape 4 (hygiène batch) : GRANT EXECUTE ON FUNCTION
--   --   api.get_object_resources_batch(text[], text[], text, jsonb) TO PUBLIC;
--   NOTIFY pgrst, 'reload schema';
