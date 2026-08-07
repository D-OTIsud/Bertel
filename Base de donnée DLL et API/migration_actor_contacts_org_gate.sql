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

BEGIN;

-- ---------------------------------------------------------------------
-- 1. La garde : l'appelant est-il membre d'une ORG éditrice de la fiche ?
--    Périmètre RÉUTILISÉ : api.current_user_crm_object_ids() (8z) = objets
--    dont une ORG du membership actif est publisher. Bras superuser par
--    app_user_profile.role — PAS api.is_platform_superuser() (son premier
--    bras est auth.role() IN ('service_role','admin')).
--    auth.uid() est NULL hors contexte HTTP ET en service-role ⇒ le CASE
--    court-circuite AVANT toute lecture (sonde paresseuse, §204).
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

-- ---------------------------------------------------------------------
-- 1bis. Préflight des capacités acteur (R2) : la modale d'export demande au
--    SERVEUR si la sélection donne accès à l'identité / aux coordonnées des
--    acteurs — l'offre de colonnes suit la consultation réelle, pas un proxy
--    « membre d'une ORG ». Booléens AGRÉGÉS sur la sélection (∃ une fiche
--    accessible ⇒ true : les fiches refusées resteront vides, sélection mixte
--    assumée). ERGONOMIE seulement : export_actor_contacts refait les contrôles
--    fiche par fiche — ce préflight n'est jamais une garde.
--    Mêmes prédicats que les gates réels : identité ⇔ extended OU lien public
--    (l'arm du leg actors) ; coordonnées ⇔ can_read_actor_contacts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.export_actor_capabilities(p_object_ids text[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp   -- R2.1 : pg_temp EN DERNIER
AS $$
  WITH ids AS (
    SELECT DISTINCT btrim(t.id) AS id
      FROM unnest(p_object_ids) AS t(id)
     WHERE btrim(coalesce(t.id, '')) <> ''
  ),
  super AS (
    SELECT EXISTS (SELECT 1 FROM public.app_user_profile p
                    WHERE p.id = (SELECT auth.uid())
                      AND p.role IN ('owner','super_admin')) AS ok
  )
  SELECT jsonb_build_object(
    'actor_identity_available',
      COALESCE((SELECT ok FROM super), FALSE)
      OR EXISTS (
        SELECT 1 FROM ids i
         WHERE i.id IN (SELECT api.current_user_extended_object_ids())
            OR EXISTS (SELECT 1 FROM public.actor_object_role aor
                        WHERE aor.object_id = i.id AND aor.visibility = 'public')),
    'actor_contacts_available',
      COALESCE((SELECT ok FROM super), FALSE)
      OR EXISTS (
        SELECT 1 FROM ids i
         WHERE i.id IN (SELECT api.current_user_crm_object_ids()))
  );
$$;

REVOKE ALL     ON FUNCTION api.export_actor_capabilities(text[]) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION api.export_actor_capabilities(text[]) TO   authenticated;

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

-- ---------------------------------------------------------------------
-- 2. Journal IMMUABLE des exports de coordonnées (modèle : object_deletion_log).
--    Pas de FK vers object ni actor : la ligne survit à rpc_delete_object et à
--    l'effacement RGPD art. 17. AUCUNE VALEUR de coordonnée n'y entre jamais —
--    qui, quand, combien, quels ids, quels TYPES de canaux. Pas les valeurs.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actor_contact_export_log (
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
  channel_count   INT  NOT NULL DEFAULT 0,
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

COMMENT ON TABLE actor_contact_export_log IS
  'Journal immuable des exports de coordonnées d''acteur (§208). Écrit uniquement par api.export_actor_contacts ; aucune valeur de coordonnée n''y figure ; survit à la suppression des objets/acteurs (pas de FK). export_run_id relie les lots d''un même export ; org_object_ids/org_attributions disent quelle ORG publisher a autorisé quoi (multi-ORG).';

CREATE INDEX IF NOT EXISTS idx_acel_at    ON actor_contact_export_log (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acel_by    ON actor_contact_export_log (performed_by, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acel_run   ON actor_contact_export_log (export_run_id);
CREATE INDEX IF NOT EXISTS idx_acel_actor ON actor_contact_export_log USING GIN (actor_ids);

ALTER TABLE actor_contact_export_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS actor_contact_export_log_read ON actor_contact_export_log;
-- R1 : l'admin d'ORG lit les exports où SON ORG a autorisé au moins une fiche
-- (org_object_ids), pas seulement ceux dont l'exportateur avait son ORG active —
-- sans quoi la politique serait ambiguë à plusieurs ORG.
-- §39 : les appels d'autorisation sont wrappés en (select …) ⇒ un seul InitPlan.
-- §55 : la colonne EXTERNE est table-qualifiée (une colonne nue se relierait au
-- plus interne au prochain CREATE si une table sondée gagnait un homonyme).
CREATE POLICY actor_contact_export_log_read ON actor_contact_export_log
  FOR SELECT TO authenticated USING (
    (SELECT api.is_platform_superuser())
    OR ((SELECT api.current_user_admin_rank()) IS NOT NULL
        AND (SELECT api.current_user_org_id()) = ANY(actor_contact_export_log.org_object_ids))
  );
-- Pas de policy INSERT/UPDATE/DELETE : seul le RPC DEFINER écrit ; par commande,
-- jamais une policy toutes-commandes (celle-ci s'appliquerait aussi au SELECT).
REVOKE ALL    ON actor_contact_export_log FROM PUBLIC, anon;
GRANT  SELECT ON actor_contact_export_log TO authenticated, service_role;

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
  v_channels  bigint;
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

  SELECT COALESCE(jsonb_agg(r.line ORDER BY r.object_id, r.is_primary DESC, r.display_name), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT r.actor_id), '{}'::uuid[]),
         COALESCE(sum(r.n_channels), 0)
    INTO v_rows, v_actors, v_channels
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
    object_count, actor_count, channel_count,
    object_ids, denied_object_ids, actor_ids, channel_kinds, identity_fields,
    org_object_ids, org_attributions, report)
  VALUES (
    v_log_id, v_run_id, p_batch_index, p_batch_count,
    v_caller, v_org, btrim(p_reason), lower(p_format),
    coalesce(array_length(v_scope, 1), 0), coalesce(array_length(v_actors, 1), 0), v_channels,
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
    'channel_count',         v_channels,
    'rows',                  v_rows);
END;
$$;

-- R1 : REVOKE explicite de service_role EN PLUS de PUBLIC/anon — un export de PII
-- est imputable à une personne, jamais à une clé.
REVOKE ALL     ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION api.export_actor_contacts(text[], text, text, uuid, int, int) TO   authenticated;

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
--   DROP POLICY   IF EXISTS actor_contact_export_log_read ON actor_contact_export_log;
--   -- ⚠ Le journal est une trace RGPD : ne le supprimer que si l'on assume la
--   --   perte de la preuve des exports déjà réalisés.
--   -- DROP TABLE IF EXISTS actor_contact_export_log;
--   -- Étape 1ter (search_path) : revenir à la forme faible n'a aucun intérêt de
--   --   sécurité ; si un besoin d'iso-état l'exige :
--   --   ALTER FUNCTION api.current_user_crm_object_ids()      SET search_path = public, api, auth;
--   --   ALTER FUNCTION api.current_user_extended_object_ids() SET search_path = public, api, auth;
--   -- Étape 4 (hygiène batch) : GRANT EXECUTE ON FUNCTION
--   --   api.get_object_resources_batch(text[], text[], text, jsonb) TO PUBLIC;
--   NOTIFY pgrst, 'reload schema';
