-- migration_crm_lifecycle.sql
-- Manifeste 17g — cycle de vie des demandes CRM (tranche A2, indivisible).
-- Spec : docs/superpowers/specs/2026-08-31-onglet-activite-cycle-vie-crm-design.md (§6)
-- Plan : docs/superpowers/plans/2026-08-31-onglet-activite-cycle-vie-crm.md
--
-- CE QUE FAIT CETTE MIGRATION
--   Le type `crm_status` passe de ('planned','done','canceled') à six valeurs
--   ('new','in_progress','awaiting_provider','resolved','closed','canceled'), par RECRÉATION
--   (PostgreSQL ne sait pas retirer une valeur d'un enum ; ajouter les cinq neuves laisserait
--   un type à huit valeurs dont trois mortes, et rien ne signalerait un prédicat oublié).
--   Remappage : planned→new, done→resolved, canceled→canceled.
--   Elle installe aussi le JOURNAL DE TRANSITIONS qui rend calculable le temps de traitement
--   NET — l'attente du prestataire déduite, parce qu'un indicateur ne doit mesurer que ce que
--   l'équipe maîtrise.
--
-- ═══ LES TROIS PANNES SILENCIEUSES QUE CETTE MIGRATION FERME ═══
--
-- Trois prédicats comparaient le statut EN TEXTE (`status::text <> 'done'`,
-- `p_payload->>'status'`). Le cast en texte DÉSARME LE TYPAGE : après renommage, aucune
-- erreur ne se produit — le prédicat se réduit simplement à `resolved_at IS NULL`.
--
--   1. `api.capture_metric_snapshots` (KPI `crm_backlog`, cron quotidien 03:00). Mesuré sur la
--      base vive le 31/08 : le compteur passait de 170 à 1 891 — onze fois plus — parce que
--      1 721 lignes `done` importées (`import_berta2_commentaire`) portent `resolved_at NULL`
--      (invariant §218, 17b a refusé de leur inventer une date). Le cron aurait écrit cette
--      valeur dans une série historique de 73 jours ; la rupture ressemble à un événement
--      métier réel et personne ne l'aurait lue comme un bug.
--   2. `api.get_dashboard_crm_open` (carte d'attention du bandeau) : même prédicat, même
--      dérive — la carte aurait affiché 1 891.
--   3. `api.save_crm_interaction`, bras UPDATE : `CASE (p_payload->>'status') WHEN 'done' …
--      WHEN 'planned' … ELSE resolved_at END`. Après renommage, aucun bras ne matche, on tombe
--      dans le ELSE et `resolved_at` N'EST PLUS JAMAIS POSÉ. Marquer une demande traitée
--      cesserait silencieusement de la dater — et `resolved_at` est justement ce sur quoi
--      reposent les deux prédicats ci-dessus.
--
-- ⚠ CE QUE LA GARDE `prosrc` DE FIN DE FICHIER (section (9), volets 1a/1b) COUVRE RÉELLEMENT
-- PARMI CES TROIS PANNES : UNE SEULE, PAS LES TROIS. Le volet 1b balaie les fonctions qui
-- touchent `crm_interaction` SANS toucher `crm_task` — (1) `capture_metric_snapshots` y entre
-- (elle ne mentionne pas `crm_task`) et EST donc gardée par `prosrc`. (2)
-- `get_dashboard_crm_open` EN EST EXCLUE : son CTE `tasks` lit `crm_task`, ce qui écarte TOUTE
-- la fonction du volet. (3) `save_crm_interaction` EN EST EXCLUE NOMINALEMENT, des volets 1a
-- ET 1b, par `TOLERANCE-17g`. Ce sont les blocs (B) et (D)/(E) de `tests/test_crm_lifecycle.sql`
-- qui gardent (2) et (3) — PAS cette migration. NE RETIREZ JAMAIS le bloc (B) du test en
-- croyant que la garde `prosrc` ci-dessous suffit : elle ne couvre qu'une panne sur trois.
--
-- Les cinq autres fonctions du rayon échouent BRUYAMMENT, mais AU PREMIER APPEL, pas au
-- déploiement : PL/pgSQL ne valide pas les littéraux de son corps à la création, et
-- `DROP TYPE` ne cascade PAS sur un `'planned'::crm_status` écrit dans un corps de fonction
-- (la dépendance n'est tracée que pour les signatures et les types de colonne). Un DDL vert
-- ne vaut donc PAS validation. C'EST LA GARDE `prosrc` DE FIN DE FICHIER QUI PROTÈGE, PAS LE
-- SYSTÈME DE TYPES.
--
-- ⚠ AUCUN CHIFFRE EN DUR DANS LE SQL. 170 / 1 891 / 1 721 / 3 144 / 57 datent d'un relevé du
-- 31/08 et bougeront. La migration compte DYNAMIQUEMENT et ses gardes portent sur des
-- invariants RELATIFS (avant == après), jamais sur des constantes.
--
-- ═══ CÉSURE ASSUMÉE : `audit.audit_log` N'EST PAS RÉÉCRIT ═══
--
-- Le trigger d'audit sérialise le libellé de l'enum en JSON. `audit.audit_log` contient déjà
-- 4 216 occurrences de "status":"done" et 342 de "planned" (relevé 31/08) ; les lignes neuves
-- porteront "resolved" / "new". LA PISTE D'AUDIT EST DONC COUPÉE EN DEUX VOCABULAIRES, et
-- c'est délibéré : un journal d'audit se lit, il ne se corrige pas. Remapper son JSON
-- falsifierait l'historique et créerait un doute pire que l'incohérence. LA TRADUCTION VIT
-- DANS LE LECTEUR — c'est-à-dire dans le rejeu de la section (6), qui traduit explicitement.
--
-- ═══ RGPD — vérifié sur pièces AVANT d'écrire la table (spec §10.5, arbitrage plan n°5) ═══
--
-- `crm_interaction_status_event.changed_by` est une ATTRIBUTION D'ÉQUIPE (`auth.uid()`),
-- de même classe de rétention que `audit.audit_log.changed_by` et `object_version.created_by`.
-- `api.rpc_gdpr_erase_subject` opère sur les ACTEURS (tiers externes) et les déclarants
-- d'incident : le journal est hors de son périmètre, aucun câblage n'est nécessaire, et cette
-- passe ne crée donc AUCUNE rétention nouvelle. La colonne référence `auth.users` par le
-- FK ON DELETE SET NULL de fait (voir le commentaire de la table) : une suppression de compte
-- ne laisse pas de pointeur pendouillant.
--
-- ═══ TOLÉRANCE TRANSITOIRE — SON IDENTIFIANT DE RETRAIT EST POSÉ DÈS LE PREMIER JOUR ═══
--
--   TOLERANCE-17g — à retirer par une migration dédiée quand plus aucun front n'envoie
--   done/planned.
--
-- Le déploiement n'est pas atomique (le SQL s'applique à la main, le frontend arrive par un
-- build Coolify depuis master). Sans tolérance, « Marquer traitée » serait MORT le temps du
-- build : les sites d'écriture du front envoient encore 'done'/'planned', que
-- `save_crm_interaction` rejetterait en 22P02. La tolérance vit DANS `save_crm_interaction`
-- ET NULLE PART AILLEURS. Le volet 1c de la garde finale échoue si quelqu'un la retire sans
-- retirer aussi les exclusions des volets 1a/1b — sinon la tolérance deviendrait elle-même
-- une panne muette permanente.
--
-- ═══ RÈGLE D'ÉDITION — TROIS VOCABULAIRES COEXISTENT (spec §9) ═══
--
--   `crm_status`      → new, in_progress, awaiting_provider, resolved, closed, canceled → DEMANDES
--   `crm_task_status` → todo, in_progress, done, canceled, blocked                      → TÂCHES
--   adhésions (TEXT)  → prospect, invoiced, paid, canceled, lapsed                      → ADHÉSIONS
--
-- Ils partagent `canceled` et — à partir de ce chantier — `in_progress`. AUCUN REMPLACEMENT
-- GLOBAL SUR UNE CHAÎNE DE STATUT N'EST ADMISSIBLE : la seule ancre est le CONTEXTE
-- (`crm_interaction`, `crm_status`, `saveCrmInteraction`), jamais la valeur seule.
-- Dans `api.create_crm_artifacts_from_incident` ci-dessous, le 'resolved' de l'INSERT
-- INTERACTION et le 'todo' de l'INSERT TÂCHE sont à dix-neuf lignes d'écart : le second ne
-- bouge PAS.
--
-- ═══ ORDRE ET IDEMPOTENCE ═══
--
-- Au manifeste, 17g se place APRÈS tous les fichiers qui redéfinissent un corps lisant le
-- statut : `schema_unified.sql`, `api_views_functions.sql`, 8z (`migration_crm_module.sql`),
-- 8z2 (`migration_crm_directory_search.sql`), le renommage
-- `supabase/migrations/20260807124408_actor_prospects_documents.sql`, 16z, 17b, 17e, 17f.
-- Placée AVANT l'un d'eux, son corps corrigé serait ÉCRASÉ par la version ancienne rejouée
-- ensuite (convention deploy-integrity : la DERNIÈRE définition du manifeste fait foi).
--
-- Idempotente : la bascule du type est gardée par la présence de 'planned' dans `pg_enum`
-- (base fraîche ou rejeu ⇒ sautée), tout le reste est `CREATE OR REPLACE` / `IF NOT EXISTS`,
-- et le rejeu d'audit porte son propre `NOT EXISTS`.
--
-- ⚠ ATTENTION AU REJEU (même classe que le `crm_body_deploy.tmp.sql` signalé par 17b) :
-- `Base de donnée DLL et API/migration_metric_snapshot.sql` porte encore l'ANCIEN prédicat
-- `status::text <> 'done'` de `api.capture_metric_snapshots`. Ce fichier n'est PAS au
-- manifeste ; un rejeu manuel depuis lui réintroduirait silencieusement la panne n°1.
--
-- ⚠ FENÊTRE D'APPLICATION (spec §10.7) : le cron `capture-metric-snapshots` écrit
-- `crm_backlog` à 03:00. Appliquer pendant cette écriture produirait une journée hybride dans
-- `metric_snapshot`. Appliquer hors de ce créneau.
--
-- Fonction exposée neuve (`api.list_crm_status_events`) ⇒ `NOTIFY pgrst, 'reload schema';`
-- en fin de fichier.

\set ON_ERROR_STOP on
BEGIN;

-- =====================================================================================
-- (1) + (2) + (3) — GARDE D'IDEMPOTENCE, BASCULE DU TYPE, COMPTAGES DE CONTRÔLE
-- =====================================================================================
-- La bascule est enveloppée dans un DO gardé par la présence de 'planned' : sur une base
-- FRAÎCHE (schema_unified crée déjà les six valeurs) ou lors d'un REJEU, elle est sautée.
-- La DDL passe par EXECUTE parce qu'elle vit dans un corps plpgsql.
DO $lifecycle$
DECLARE
  v_before_planned  bigint;
  v_before_done     bigint;
  v_before_canceled bigint;
  v_before_total    bigint;
  v_after_new       bigint;
  v_after_resolved  bigint;
  v_after_canceled  bigint;
  v_after_total     bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'crm_status' AND e.enumlabel = 'planned'
  ) THEN
    RAISE NOTICE 'crm_status parle déjà le nouveau vocabulaire — bascule sautée (base fraîche ou rejeu).';
  ELSE
    -- ----- (3a) Comptage AVANT, par statut. Aucune constante : on relève ce qui est là. -----
    EXECUTE $q$
      SELECT count(*) FILTER (WHERE status::text = 'planned'),
             count(*) FILTER (WHERE status::text = 'done'),
             count(*) FILTER (WHERE status::text = 'canceled'),
             count(*)
      FROM public.crm_interaction
    $q$ INTO v_before_planned, v_before_done, v_before_canceled, v_before_total;

    -- ----- (2) La bascule -----
    -- Le CASE est EXHAUSTIF SANS ELSE : une valeur imprévue rendrait NULL et la colonne
    -- NOT NULL ferait échouer fort — c'est VOULU, on refuse de deviner.
    --
    -- `ALTER COLUMN … TYPE` réécrit la table SANS DÉCLENCHER LES TRIGGERS DE LIGNE
    -- (comportement PostgreSQL documenté) : ni le trigger d'audit, ni le trigger de sujet
    -- automatique, ni le journal installé plus bas ne voient passer ces lignes.
    -- ⚠ TOUTE VARIANTE « BACKFILL PAR UPDATE » EST INTERDITE : elle déclencherait le trigger
    -- d'audit sur CHAQUE ligne du corpus et polluerait la piste d'audit d'un faux événement
    -- métier par demande.
    EXECUTE $ddl$
      CREATE TYPE crm_status_v2 AS ENUM
        ('new','in_progress','awaiting_provider','resolved','closed','canceled')
    $ddl$;

    -- Idempotent, sans effet si aucun DEFAULT n'existe (17b l'a déjà supprimé en production) :
    -- retire tout DEFAULT résiduel qui ferait échouer la bascule ci-dessous
    -- (« default for column "status" cannot be cast automatically to type crm_status_v2 »).
    EXECUTE $ddl$ALTER TABLE public.crm_interaction ALTER COLUMN status DROP DEFAULT$ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.crm_interaction
        ALTER COLUMN status TYPE crm_status_v2
        USING (CASE status::text
                 WHEN 'planned'  THEN 'new'
                 WHEN 'done'     THEN 'resolved'
                 WHEN 'canceled' THEN 'canceled'
               END)::crm_status_v2
    $ddl$;

    EXECUTE $ddl$DROP TYPE crm_status$ddl$;
    EXECUTE $ddl$ALTER TYPE crm_status_v2 RENAME TO crm_status$ddl$;

    -- ----- (3b) Comptage APRÈS + gardes RELATIVES -----
    -- `RAISE EXCEPTION` et non `ASSERT` : `plpgsql.check_asserts` peut être mis à `off` par
    -- une GUC de session, et une garde de migration ne doit pas être désactivable.
    EXECUTE $q$
      SELECT count(*) FILTER (WHERE status::text = 'new'),
             count(*) FILTER (WHERE status::text = 'resolved'),
             count(*) FILTER (WHERE status::text = 'canceled'),
             count(*)
      FROM public.crm_interaction
    $q$ INTO v_after_new, v_after_resolved, v_after_canceled, v_after_total;

    IF v_after_total <> v_before_total THEN
      RAISE EXCEPTION 'Bascule crm_status : total change (% avant, % apres) — la traduction a perdu ou cree des lignes.',
        v_before_total, v_after_total;
    END IF;
    IF v_after_new <> v_before_planned THEN
      RAISE EXCEPTION 'Bascule crm_status : planned(%) doit devenir new(%).', v_before_planned, v_after_new;
    END IF;
    IF v_after_resolved <> v_before_done THEN
      RAISE EXCEPTION 'Bascule crm_status : done(%) doit devenir resolved(%).', v_before_done, v_after_resolved;
    END IF;
    IF v_after_canceled <> v_before_canceled THEN
      RAISE EXCEPTION 'Bascule crm_status : canceled(%) doit rester canceled(%).', v_before_canceled, v_after_canceled;
    END IF;

    RAISE NOTICE 'Bascule crm_status OK : % lignes traduites (planned→new %, done→resolved %, canceled %).',
      v_after_total, v_after_new, v_after_resolved, v_after_canceled;
  END IF;
END
$lifecycle$;

-- Le commentaire de colonne posé par 17b décrivait l'ancien vocabulaire ; il devient faux ici.
COMMENT ON COLUMN public.crm_interaction.status IS
  'Cycle de vie §6.1 (manifeste 17g) — OUVERTS : new (reçue, pas encore prise en main) | in_progress (un agent la traite) | awaiting_provider (on attend un retour du prestataire ; ce temps est DÉDUIT du temps de traitement net). FERMÉS : resolved (traitée) | closed (clôturée sans traitement actif) | canceled (annulée). AUCUN DEFAULT depuis le 2026-08-28 (manifeste 17b) : la naissance du statut est une décision métier portée par api.save_crm_interaction (dérivée du sujet) ou par l''appelant, jamais par la colonne. Tout passage à un statut fermé pose resolved_at ; tout retour à un statut ouvert le remet à NULL.';

-- =====================================================================================
-- (4) LE JOURNAL DE TRANSITIONS
-- =====================================================================================
-- Pourquoi une table dédiée alors que `audit.audit_log` trace déjà tout : sur 4 595 lignes
-- d'audit CRM, 57 seulement sont de vrais changements de statut (1,2 %). Calculer un KPI en
-- balayant un journal générique en JSONB, qui grossit à chaque édition de champ, n'est pas
-- tenable sur un chemin d'affichage.
CREATE TABLE IF NOT EXISTS public.crm_interaction_status_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.crm_interaction(id) ON DELETE CASCADE,
  from_status    crm_status,          -- NULL = création
  to_status      crm_status NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  -- Attribution d'ÉQUIPE (auth.uid()), même classe de rétention que audit_log.changed_by ;
  -- hors périmètre de rpc_gdpr_erase_subject (acteurs/déclarants), décision spec §10.5.
  changed_by     uuid
);

CREATE INDEX IF NOT EXISTS idx_crm_status_event_interaction
  ON public.crm_interaction_status_event (interaction_id, changed_at);

-- Doctrine §61 : RLS ON, ZÉRO POLICY, AUCUN GRANT applicatif — la lecture passe uniquement
-- par le RPC DEFINER `api.list_crm_status_events`, jamais par PostgREST en direct. Le REVOKE
-- ferme la porte AVANT même la RLS.
ALTER TABLE public.crm_interaction_status_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_interaction_status_event FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.crm_interaction_status_event IS
  'Journal des transitions de statut d''une demande CRM (manifeste 17g). Alimenté par le trigger trg_crm_interaction_status_event. Rend calculable le temps de traitement NET : l''attente du prestataire (awaiting_provider) est déduite, parce qu''un indicateur ne doit mesurer que ce que l''équipe maîtrise. RLS ON, zéro policy, zéro grant applicatif — lecture par api.list_crm_status_events uniquement (doctrine §61). changed_by = attribution d''ÉQUIPE, même classe de rétention que audit.audit_log.changed_by, hors périmètre de api.rpc_gdpr_erase_subject (spec §10.5).';

-- =====================================================================================
-- (5) LE TRIGGER
-- =====================================================================================
-- SECURITY DEFINER : le trigger écrit dans une table à RLS activée et sans policy ; sans
-- DEFINER, toute écriture depuis un rôle applicatif serait refusée et le journal serait
-- silencieusement vide.
CREATE OR REPLACE FUNCTION api.log_crm_interaction_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION api.log_crm_interaction_status_event() IS
  'Trigger AFTER INSERT OR UPDATE OF status sur crm_interaction : écrit une ligne de crm_interaction_status_event par transition RÉELLE (un UPDATE qui ne touche pas au statut n''écrit rien). from_status NULL = création. Manifeste 17g.';

DROP TRIGGER IF EXISTS trg_crm_interaction_status_event ON public.crm_interaction;
CREATE TRIGGER trg_crm_interaction_status_event
  AFTER INSERT OR UPDATE OF status ON public.crm_interaction
  FOR EACH ROW EXECUTE FUNCTION api.log_crm_interaction_status_event();

-- =====================================================================================
-- (6) AMORÇAGE — REJEU TRADUISANT DES TRANSITIONS D'AUDIT
-- =====================================================================================
-- Les transitions déjà présentes dans `audit.audit_log` sont rejouées UNE FOIS dans le
-- journal, qui n'est donc pas vide au premier jour. C'est un backfill de FAIT AVÉRÉ — chaque
-- ligne d'audit porte son `changed_at` et son `changed_by` réels — et non une reconstitution
-- (invariant §218 : une colonne de provenance ne se remplit QUE si la ligne le prouve).
--
-- C'EST LE LECTEUR QUI TRADUIT, JAMAIS `audit_log` QU'ON RÉÉCRIT (voir la césure en en-tête).
--
-- Idempotent : le NOT EXISTS empêche un second passage de dupliquer. Les deux gardes
-- `IS NOT NULL` sur le statut avant/après ne changent RIEN sur les données réelles
-- (`before_data`/`after_data` sont `to_jsonb(OLD)`/`to_jsonb(NEW)` d'une colonne NOT NULL)
-- mais rendent la clause de non-duplication SOUNDE : une ligne insérée avec `from_status`
-- NULL échapperait au NOT EXISTS et serait re-insérée à chaque rejeu.
INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_at, changed_by)
SELECT (a.row_pk->>'id')::uuid,
       (CASE a.before_data->>'status' WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
             ELSE a.before_data->>'status' END)::crm_status,
       (CASE a.after_data->>'status'  WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
             ELSE a.after_data->>'status'  END)::crm_status,
       a.changed_at,
       CASE WHEN a.changed_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN a.changed_by::uuid ELSE NULL END   -- audit stocke email OU sub ; seul un uuid se mappe
FROM audit.audit_log a
JOIN public.crm_interaction ci ON ci.id = (a.row_pk->>'id')::uuid
WHERE a.table_name = 'crm_interaction' AND a.operation = 'UPDATE'
  AND (a.before_data->>'status') IS NOT NULL
  AND (a.after_data->>'status')  IS NOT NULL
  AND (a.before_data->>'status') IS DISTINCT FROM (a.after_data->>'status')
  AND NOT EXISTS (SELECT 1 FROM public.crm_interaction_status_event e
                  WHERE e.interaction_id = (a.row_pk->>'id')::uuid
                    AND e.changed_at = a.changed_at AND e.from_status IS NOT NULL);

-- =====================================================================================
-- (7) LES SEPT FONCTIONS REDÉPLOYÉES
-- =====================================================================================
-- Chaque corps est COPIÉ depuis sa source canonique (la dernière définition du manifeste fait
-- foi) puis traduit par les substitutions listées au plan — jamais réécrit de mémoire :
--   api.capture_metric_snapshots            ← api_views_functions.sql
--   api.get_dashboard_crm_open              ← migration_dashboard_crm_open.sql (17f)
--   api.save_crm_interaction                ← migration_crm_interaction_default_status.sql (17b)
--   api.list_crm_timeline                   ← migration_crm_module.sql (8z)
--   api.list_crm_directory_linked           ← migration_crm_directory_search.sql (8z2, corps
--                                             renommé par supabase/migrations/20260807124408)
--   api.create_crm_artifacts_from_incident  ← schema_unified.sql
--   api.log_publication_proof_interaction   ← schema_unified.sql

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.1  api.capture_metric_snapshots — KPI historisé `crm_backlog`
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.capture_metric_snapshots(p_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  v_comp jsonb;
  v_rows integer;
BEGIN
  -- 1. Complétude (pool publié) — contrat figé api.get_dashboard_completeness
  v_comp := api.get_dashboard_completeness(NULL, ARRAY['published']::object_status[],
                                           '{}'::jsonb, NULL, NULL, 0);

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',r->>'type','completeness_avg',(r->>'avg_score')::numeric,(r->>'total')::int
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',r->>'type','completeness_complete_pct',(r->>'complete_pct')::numeric,(r->>'total')::int
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  -- moyenne globale pondérée par le nombre de fiches
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','completeness_avg',
         ROUND(SUM((r->>'avg_score')::numeric*(r->>'total')::numeric)
               / NULLIF(SUM((r->>'total')::numeric),0),1),
         SUM((r->>'total')::int)
  FROM jsonb_array_elements(v_comp->'rows') r
  HAVING SUM((r->>'total')::numeric) > 0   -- empty corpus ⇒ no rows to average ⇒ value would be NULL (NOT NULL); skip (fresh-apply gate 2026-07-01)
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  -- 2. Corpus net (tous statuts, hors ORG) : global / type / statut
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','corpus_count',count(*),NULL FROM object WHERE object_type<>'ORG'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',object_type::text,'corpus_count',count(*),NULL
  FROM object WHERE object_type<>'ORG' GROUP BY object_type
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'status',status::text,'corpus_count',count(*),NULL
  FROM object WHERE object_type<>'ORG' GROUP BY status
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 3. Classés (granted) : global + par commune
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','classified_count',count(DISTINCT object_id),NULL
  FROM object_classification WHERE status='granted'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'commune',COALESCE(NULLIF(btrim(ol.city),''),'(inconnu)'),'classified_count',
         count(DISTINCT oc.object_id),NULL
  FROM object_classification oc
  JOIN object_location ol ON ol.object_id=oc.object_id AND ol.is_main_location=true
  WHERE oc.status='granted' GROUP BY 3
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 4. Couverture : durabilité / accessibilité
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','sustainability_count',count(DISTINCT object_id),NULL
  FROM object_sustainability_action
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','accessibility_count',count(DISTINCT oa.object_id),NULL
  FROM object_amenity oa
  JOIN ref_amenity ra ON ra.id=oa.amenity_id
  JOIN ref_code_amenity_family f ON f.id=ra.family_id
  WHERE f.code='accessibility'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 5. Backlog CRM — liste positive TYPÉE des statuts ouverts (cycle de vie §6.1). Identique
  --    MOT POUR MOT au prédicat de get_dashboard_crm_open : la carte et la courbe comptent la
  --    même chose. L'INDENTATION FAIT PARTIE DE L'IDENTITÉ — le test 17g compare les deux
  --    `prosrc` sur ce bloc EXACT ; ne pas ré-indenter d'un côté sans l'autre.
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','crm_backlog',count(*),NULL
  FROM crm_interaction
  WHERE resolved_at IS NULL
    AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  SELECT count(*) INTO v_rows FROM public.metric_snapshot WHERE snapshot_date=p_date;
  RETURN v_rows;
END$fn$;

COMMENT ON FUNCTION api.capture_metric_snapshots(date) IS
'Brique 2: fige le panel de KPIs dashboard pour p_date dans metric_snapshot (upsert idempotent).
Complétude via api.get_dashboard_completeness (pool publié), corpus net (tous statuts), classés
(granted, global+commune), couverture durable/accessibilité, backlog CRM.
crm_backlog = liste positive TYPÉE des statuts ouverts (new, in_progress, awaiting_provider) et
resolved_at IS NULL — prédicat identique MOT POUR MOT à celui de api.get_dashboard_crm_open, sans
quoi la carte du bandeau et la courbe de l''onglet Activité afficheraient deux chiffres pour la
même réalité. Une comparaison EN TEXTE y serait une panne muette : elle survivrait à tout
renommage du vocabulaire en se réduisant à resolved_at IS NULL (manifeste 17g).
Exécutée par le cron quotidien capture-metric-snapshots.';

REVOKE ALL ON FUNCTION api.capture_metric_snapshots(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.capture_metric_snapshots(date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.2  api.get_dashboard_crm_open — carte d'attention du bandeau
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_dashboard_crm_open()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH interactions AS (
    SELECT count(*)::int AS n
  -- ⚠ Bloc reproduit MOT POUR MOT — INDENTATION COMPRISE — depuis le point 5 de
  -- api.capture_metric_snapshots. L'indentation « plate » au milieu du CTE est DÉLIBÉRÉE :
  -- c'est ce qui rend l'identité des deux prédicats vérifiable par comparaison littérale des
  -- deux `prosrc` (test 17g, bloc B). Ne pas « ré-aligner ».
  FROM crm_interaction
  WHERE resolved_at IS NULL
    AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  tasks AS (
    -- ⚠ VOCABULAIRE DES TÂCHES (crm_task_status), PAS celui des demandes. Ces cinq lignes ne
    -- bougent PAS avec le cycle de vie des demandes : `in_progress` est ici un statut de TÂCHE.
    SELECT count(*)::int AS n
    FROM   crm_task
    WHERE  status::text IN ('todo', 'in_progress', 'blocked')
  )
  SELECT jsonb_build_object(
    'open_interactions', i.n,
    'open_tasks',        t.n,
    'total',             i.n + t.n
  )
  FROM interactions i, tasks t;
$$;

COMMENT ON FUNCTION api.get_dashboard_crm_open IS
'Dashboard §1 : compteur GLOBAL des éléments CRM ouverts pour la carte d''attention du bandeau.
open_interactions reprend le prédicat exact de crm_backlog (api.capture_metric_snapshots) : la
liste positive TYPÉE des statuts ouverts (new, in_progress, awaiting_provider) et resolved_at
IS NULL. open_tasks = crm_task en todo/in_progress/blocked (les statuts terminaux de TÂCHE sont
exclus — une tâche annulée n''est pas du travail en attente ; vocabulaire crm_task_status,
distinct de celui des demandes). GLOBAL par décision produit (2026-08-30) : la carte est un
signal stable « ce qui m''attend aujourd''hui », elle n''obéit pas au panneau de filtres.
N''émet aucune PII (trois entiers). Manifeste 17g.';

-- §204 — EXECUTE est accordé à PUBLIC par défaut sur toute fonction neuve ; un GRANT ciblé
-- ne le retire pas. Le REVOKE est obligatoire, dans cet ordre.
REVOKE EXECUTE ON FUNCTION api.get_dashboard_crm_open() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_crm_open() TO   authenticated, service_role;

-- Garde dure : un ré-apply par un rôle non-propriétaire ne rend qu'un WARNING sur le REVOKE,
-- que ON_ERROR_STOP ne rattrape pas. On échoue fort plutôt que de déployer une fonction ouverte.
DO $$
BEGIN
  IF has_function_privilege('public', 'api.get_dashboard_crm_open()', 'EXECUTE')
     OR has_function_privilege('anon', 'api.get_dashboard_crm_open()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.get_dashboard_crm_open — fonction ouverte, arrêt.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.3  api.save_crm_interaction — corps 17b traduit + TOLERANCE-17g
-- ─────────────────────────────────────────────────────────────────────────────────────
-- Le discriminant PAR SUJET (§220) est CONSERVÉ, TRADUIT : il se traduit, il ne se réinvente
-- pas. La pose de `resolved_at` suit désormais TROIS statuts terminaux au lieu d'un.
-- Le `search_path` restreint est celui du corps canonique 17b — il n'est PAS élargi ici :
-- cette passe traduit un vocabulaire, elle ne change pas la résolution de noms d'une fonction
-- vive (toute modification y serait un second changement non gardé par ce test).
CREATE OR REPLACE FUNCTION api.save_crm_interaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  v_existing_object text;
  v_existing_actor uuid;
  v_topic_id uuid;
  v_sentiment_id uuid;
  -- Fil de réponses (§66) : parent fourni à l'INSERT ⇒ la nouvelle interaction est une réponse.
  v_parent_id uuid := NULLIF(p_payload->>'parent_interaction_id','')::uuid;
  v_root_id uuid;          -- racine normalisée (réponse-à-réponse → racine)
  v_root_parent uuid;      -- parent du parent (NULL si le parent EST la racine)
  v_root_object text;      -- contexte objet hérité de la racine
  v_root_actor uuid;       -- contexte acteur hérité de la racine
  -- Statut effectivement inséré (chantier 2026-08-28, manifeste 17b) : résolu AVANT l'INSERT
  -- parce qu'il pilote AUSSI `resolved_at`. Voir le commentaire de la branche RACINE.
  v_new_status crm_status;
  -- Statut du payload APRÈS traduction de tolérance (manifeste 17g). Reste du TEXTE : il est
  -- comparé littéralement pour décider de `resolved_at`, et casté au dernier moment.
  v_status_raw text;
BEGIN
  -- TOLERANCE-17g (transitoire — retirer par migration dédiée, identifiant au manifeste) :
  -- le front d'avant la bascule envoie encore 'done'/'planned'. Traduits ICI et seulement ici.
  v_status_raw := NULLIF(p_payload->>'status', '');
  v_status_raw := CASE v_status_raw WHEN 'done' THEN 'resolved' WHEN 'planned' THEN 'new'
                       ELSE v_status_raw END;

  IF NULLIF(p_payload->>'topic_code','') IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic
    WHERE code = p_payload->>'topic_code' AND is_active;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_payload->>'topic_code' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NULLIF(p_payload->>'sentiment_code','') IS NOT NULL THEN
    SELECT id INTO v_sentiment_id FROM ref_code_crm_sentiment
    WHERE code = p_payload->>'sentiment_code' AND is_active;
    IF v_sentiment_id IS NULL THEN
      RAISE EXCEPTION 'sentiment_code inconnu: %', p_payload->>'sentiment_code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    -- object_id est nullable (interaction acteur-seul) ⇒ existence testée par FOUND,
    -- jamais par v_existing_object IS NULL.
    SELECT object_id, actor_id INTO v_existing_object, v_existing_actor
    FROM crm_interaction WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'crm_interaction inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    -- Autorisation par l'ancrage existant : arme objet si contexte présent, sinon arme acteur.
    IF v_existing_object IS NOT NULL THEN
      IF NOT api.user_can_write_crm(v_existing_object) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    ELSIF v_existing_actor IS NULL OR NOT api.user_can_write_crm_actor(v_existing_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- Refus explicite plutôt qu'object_id accepté-puis-ignoré (contrairement à save_crm_task,
    -- le déplacement d'une interaction n'est pas un cas métier supporté). En revanche AJOUTER
    -- un contexte objet là où il n'y en avait pas (NULL → valeur) est permis — le contexte est
    -- optionnel par design — sous réserve du droit d'écriture CRM sur la cible.
    IF v_object_id IS NOT NULL AND v_existing_object IS NOT NULL
       AND v_object_id <> v_existing_object THEN
      RAISE EXCEPTION 'Re-parentage d''une interaction non supporté' USING ERRCODE = '22023';
    END IF;
    IF v_object_id IS NOT NULL AND v_existing_object IS NULL
       AND NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;

    UPDATE crm_interaction SET
      -- COALESCE(object_id, v_object_id) : conserve le contexte existant, n'accepte une valeur
      -- entrante que pour COMBLER un contexte absent (le retrait de contexte n'est pas supporté).
      object_id            = COALESCE(object_id, v_object_id),
      interaction_type     = CASE WHEN p_payload ? 'interaction_type' THEN (p_payload->>'interaction_type')::crm_interaction_type ELSE interaction_type END,
      direction            = CASE WHEN p_payload ? 'direction' THEN (p_payload->>'direction')::crm_direction ELSE direction END,
      status               = CASE WHEN p_payload ? 'status' THEN (v_status_raw)::crm_status ELSE status END,
      -- Cycle « marquer traitée / rouvrir » (§66, traduit par 17g) : quand status est posé,
      -- resolved_at suit — un statut TERMINAL (resolved, closed, canceled) ⇒ now() (COALESCE,
      -- ne réécrase pas une résolution antérieure) ; un statut OUVERT ⇒ NULL (réouverture).
      -- Le re-parentage (parent_interaction_id) est volontairement IGNORÉ sur UPDATE : les fils
      -- ne se déplacent pas.
      resolved_at          = CASE WHEN p_payload ? 'status'
                                  THEN (CASE WHEN v_status_raw IN ('resolved','closed','canceled')
                                             THEN COALESCE(resolved_at, NOW())
                                             ELSE NULL END)   -- statut ouvert ⇒ réouverte, date effacée
                                  ELSE resolved_at END,
      subject              = CASE WHEN p_payload ? 'subject' THEN NULLIF(p_payload->>'subject','') ELSE subject END,
      body                 = CASE WHEN p_payload ? 'body' THEN NULLIF(p_payload->>'body','') ELSE body END,
      occurred_at          = CASE WHEN p_payload ? 'occurred_at' THEN NULLIF(p_payload->>'occurred_at','')::timestamptz ELSE occurred_at END,
      actor_id             = CASE WHEN p_payload ? 'actor_id' THEN v_actor_id ELSE actor_id END,
      demand_topic_id      = CASE WHEN p_payload ? 'topic_code' THEN v_topic_id ELSE demand_topic_id END,
      request_sentiment_id = CASE WHEN p_payload ? 'sentiment_code' THEN v_sentiment_id ELSE request_sentiment_id END,
      updated_at           = NOW()
    WHERE id = v_id;
    -- Un effacement d'actor_id sur une interaction sans contexte objet viole
    -- chk_crm_interaction_anchor (23514) — garde-fou DB, pas de reset silencieux.
    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- INSERT — RÉPONSE (§66) : parent fourni ⇒ interaction enfant rattachée à la demande RACINE.
  IF v_parent_id IS NOT NULL THEN
    -- Le contexte du fil EST celui du parent : on récupère la racine et son contexte, en
    -- NORMALISANT vers la racine (réponse-à-réponse → racine, 1 niveau).
    SELECT parent_interaction_id, actor_id, object_id
    INTO v_root_parent, v_existing_actor, v_existing_object
    FROM crm_interaction WHERE id = v_parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'interaction parente inconnue: %', v_parent_id USING ERRCODE = 'P0002';
    END IF;
    -- v_root_parent NULL ⇒ le parent EST la racine ; sinon la racine est son parent.
    IF v_root_parent IS NULL THEN
      v_root_id     := v_parent_id;
      v_root_actor  := v_existing_actor;
      v_root_object := v_existing_object;
    ELSE
      v_root_id := v_root_parent;
      SELECT actor_id, object_id INTO v_root_actor, v_root_object
      FROM crm_interaction WHERE id = v_root_id;
    END IF;
    -- Autorisation sur le contexte HÉRITÉ de la racine (jamais sur le payload) : arme objet si
    -- contexte objet présent, sinon arme acteur.
    IF v_root_object IS NOT NULL THEN
      IF NOT api.user_can_write_crm(v_root_object) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    ELSIF v_root_actor IS NULL OR NOT api.user_can_write_crm_actor(v_root_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;

    v_id := gen_random_uuid();
    -- Une réponse hérite acteur+contexte de la racine (payload actor_id/object_id ignoré) ;
    -- statut « traitée » par défaut — une réponse n'est pas une demande en attente (décision
    -- §66, INCHANGÉE par le chantier 2026-08-28, TRADUITE par 17g : resolved) ;
    -- topic NULL sauf topic_code fourni ; owner = auteur de la réponse.
    v_new_status := COALESCE(v_status_raw::crm_status, 'resolved'::crm_status);
    INSERT INTO crm_interaction (id, parent_interaction_id, object_id, actor_id,
                                 interaction_type, direction, status, resolved_at,
                                 subject, body, occurred_at,
                                 demand_topic_id, request_sentiment_id, owner, source)
    VALUES (v_id, v_root_id, v_root_object, v_root_actor,
            COALESCE(NULLIF(p_payload->>'interaction_type',''),'note')::crm_interaction_type,
            COALESCE(NULLIF(p_payload->>'direction',''),'internal')::crm_direction,
            v_new_status,
            -- Cohérence : une ligne qui NAÎT dans un statut TERMINAL porte sa date de
            -- résolution. Sans cela elle reste dans un état (terminal, resolved_at NULL) que le
            -- cycle §66 ne produit JAMAIS — c'est exactement l'état des lignes d'import héritées.
            CASE WHEN v_new_status IN ('resolved','closed','canceled') THEN NOW() ELSE NULL END,
            NULLIF(p_payload->>'subject',''),
            NULLIF(p_payload->>'body',''),
            COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, NOW()),
            v_topic_id, v_sentiment_id,
            auth.uid(), 'bertel_ui');
    -- La racine est marquée « répondue » (premier accusé de réponse ; COALESCE = ne réécrase pas).
    UPDATE crm_interaction
       SET first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW()
     WHERE id = v_root_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- INSERT — RACINE : au moins un ancrage (acteur OU objet).
  IF v_object_id IS NULL AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'objet ou acteur requis' USING ERRCODE = '22023';
  END IF;
  IF v_object_id IS NOT NULL THEN
    IF NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT api.user_can_write_crm_actor(v_actor_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  -- Statut de naissance d'une RACINE (chantier 2026-08-28, manifeste 17b ; vocabulaire traduit
  -- par 17g — LA RÈGLE NE CHANGE PAS, seuls ses libellés changent).
  --
  -- AVANT 17b : le COALESCE retombait sur le statut « traitée ». La même modale crée les
  -- DEMANDES et les NOTES internes, et le front n'envoyait jamais `status` : toute demande
  -- naissait donc « traitée », invisible du chip « Actives ». Mesuré en production : les 3
  -- seules interactions créées par l'UI ont été rebasculées à la main dans les secondes
  -- suivantes (18 s, 15 s avec 5 allers-retours, 5 s) — 100 % de reprise manuelle.
  --
  -- APRÈS : le client fournit `status` explicitement (le sélecteur à six états, §6.6). CE
  -- DÉFAUT RESTE LE FILET pour tout autre appelant — un front tiers, un futur appel RPC — et il
  -- doit dire la MÊME chose que le sélecteur : un sujet de demande renseigné ⇒ c'est une
  -- DEMANDE, elle naît « new » (en attente de traitement) ; sans sujet, c'est une note interne
  -- (compte rendu d'un échange déjà clos), elle naît « resolved ».
  -- Sans ce discriminant, basculer le défaut sur un statut ouvert aurait transformé toutes les
  -- notes en demandes en attente — l'erreur symétrique de celle qu'on corrige.
  --
  -- v_topic_id est résolu en tête de fonction (avant les 3 branches), donc lisible ici.
  v_new_status := COALESCE(
    v_status_raw::crm_status,
    CASE WHEN v_topic_id IS NOT NULL THEN 'new'::crm_status ELSE 'resolved'::crm_status END);

  v_id := gen_random_uuid();
  INSERT INTO crm_interaction (id, object_id, interaction_type, direction, status, resolved_at,
                               subject, body, occurred_at, actor_id,
                               demand_topic_id, request_sentiment_id, owner, source)
  VALUES (v_id, v_object_id,
          COALESCE(NULLIF(p_payload->>'interaction_type',''),'note')::crm_interaction_type,
          COALESCE(NULLIF(p_payload->>'direction',''),'internal')::crm_direction,
          v_new_status,
          -- Cohérence : une ligne qui naît dans un statut TERMINAL porte sa date de résolution.
          -- Le bras UPDATE (cycle « marquer traitée / rouvrir », §66) la pose déjà ; l'INSERT ne
          -- le faisait pas, d'où des lignes (terminal, resolved_at NULL) que le cycle ne produit
          -- jamais.
          CASE WHEN v_new_status IN ('resolved','closed','canceled') THEN NOW() ELSE NULL END,
          NULLIF(p_payload->>'subject',''),
          NULLIF(p_payload->>'body',''),
          COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, NOW()),
          v_actor_id,
          v_topic_id, v_sentiment_id,
          auth.uid(), 'bertel_ui');
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.4  api.list_crm_timeline — corps 8z traduit : un filtre devient une FAMILLE
-- ─────────────────────────────────────────────────────────────────────────────────────
-- Le contrat EXTERNE de `p_status` NE CHANGE PAS : il reste `active | done`, c'est le
-- vocabulaire de l'INTERFACE (les deux chips « Actives » / « Traitées »), pas celui du type.
-- Ce qui change, c'est ce à quoi il se traduit : une VALEUR devient une FAMILLE.
CREATE OR REPLACE FUNCTION api.list_crm_timeline(
  p_object_id text DEFAULT NULL,
  p_topic_code text DEFAULT NULL,
  p_interaction_type text DEFAULT NULL,
  p_sentiment_code text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_scope text[];
  v_actor_scope uuid[];
  v_statuses crm_status[];
  v_items jsonb;
  v_has_more boolean;
BEGIN
  -- Statut (vocabulaire d'INTERFACE, identique à list_crm_directory_linked) : « Actives » =
  -- la famille OUVERTE, « Traitées » = la famille FERMÉE (arbitrage plan n°8). Validé AVANT le
  -- périmètre (le contrat 22023 vaut même à périmètre vide).
  IF p_status IS NOT NULL THEN
    IF p_status = 'active' THEN v_statuses := ARRAY['new','in_progress','awaiting_provider']::crm_status[];
    ELSIF p_status = 'done' THEN v_statuses := ARRAY['resolved','closed','canceled']::crm_status[];
    ELSE
      RAISE EXCEPTION 'p_status invalide: % (attendu: active | done)', p_status USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Authorize once : superuser ⇒ pas de restriction (v_scope/v_actor_scope restent NULL).
  -- Les interactions SANS contexte objet (acteur-seul) passent par l'arme acteur.
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    v_actor_scope := ARRAY(SELECT api.current_user_crm_actor_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0
       AND COALESCE(array_length(v_actor_scope, 1), 0) = 0 THEN
      RETURN jsonb_build_object('items', '[]'::jsonb, 'has_more', false);
    END IF;
    IF p_object_id IS NOT NULL AND NOT (p_object_id = ANY(v_scope)) THEN
      RAISE EXCEPTION 'CRM non autorisé pour cet objet' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Une seule requête (pas de second probe à dériver) : v_limit + 1 lignes, la ligne
  -- excédentaire signale has_more puis est retranchée.
  -- §66 : RACINES uniquement (parent_interaction_id IS NULL) — la pagination keyset pagine sur
  -- les racines ; les réponses sont imbriquées dans 'replies' (occurred_at ASC) + interlocutor_email
  -- + resolved_at (mêmes ajouts additifs que list_object_crm / list_actor_crm).
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'object_id', ci.object_id, 'object_name', o.name,
      'interaction_type', ci.interaction_type, 'direction', ci.direction,
      'status', ci.status, 'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at, 'resolved_at', ci.resolved_at,
      'actor_id', ci.actor_id, 'actor_name', a.display_name,
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source,
      'interlocutor_email', ci.extra->>'interlocuteur_email',
      'replies', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'interaction_type', r.interaction_type, 'body', r.body,
          'occurred_at', r.occurred_at, 'created_at', r.created_at,
          'sentiment_code', rs.code, 'sentiment_name', rs.name,
          'owner_name', rp.display_name, 'interlocutor_email', r.extra->>'interlocuteur_email',
          'source', r.source
        ) ORDER BY r.occurred_at ASC NULLS LAST, r.id ASC)
        FROM crm_interaction r
        LEFT JOIN ref_code_crm_sentiment rs ON rs.id = r.request_sentiment_id
        LEFT JOIN app_user_profile rp ON rp.id = r.owner
        WHERE r.parent_interaction_id = ci.id
      ), '[]'::jsonb)
    ) AS item
    FROM crm_interaction ci
    LEFT JOIN object o ON o.id = ci.object_id -- object_id nullable (acteur-seul) ⇒ LEFT JOIN
    LEFT JOIN actor a ON a.id = ci.actor_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE ci.parent_interaction_id IS NULL
      AND (v_scope IS NULL
           OR ci.object_id = ANY(v_scope)
           OR (ci.object_id IS NULL AND ci.actor_id = ANY(v_actor_scope)))
      AND (p_object_id IS NULL OR ci.object_id = p_object_id)
      AND (p_topic_code IS NULL OR t.code = p_topic_code)
      AND (p_interaction_type IS NULL OR ci.interaction_type::text = p_interaction_type)
      AND (p_sentiment_code IS NULL OR s.code = p_sentiment_code)
      -- Filtres sujet/statut/période (onglet Timeline, alignés sur list_crm_directory_linked).
      AND (v_statuses IS NULL OR ci.status = ANY (v_statuses))
      AND (p_from IS NULL OR ci.occurred_at >= p_from)
      -- Curseur row-wise (aligné sur idx_crm_interaction_occurred) ; sans p_before_id le
      -- fallback uuid-zéro dégrade vers l'ancien occurred_at < p_before (id < zéro jamais vrai).
      AND (p_before IS NULL
           OR (ci.occurred_at, ci.id) < (p_before, COALESCE(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
    LIMIT v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(v_items) > v_limit;
  IF v_has_more THEN
    v_items := (
      SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(value, ord)
      WHERE ord <= v_limit
    );
  END IF;

  RETURN jsonb_build_object('items', v_items, 'has_more', v_has_more);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.5  api.list_crm_directory_linked — corps 8z2 traduit (4 occurrences du filtre)
-- ─────────────────────────────────────────────────────────────────────────────────────
-- ⚠ NOM : le corps canonique est celui d'`api.list_crm_directory` dans
-- `migration_crm_directory_search.sql` (8z2) ; il a été RENOMMÉ en `list_crm_directory_linked`
-- par `supabase/migrations/20260807124408_actor_prospects_documents.sql` (manifeste, ligne 172),
-- qui a créé au-dessus un WRAPPER `api.list_crm_directory` ajoutant les acteurs « projet » non
-- rattachés. Le wrapper ne connaît pas `crm_status` : seul le corps renommé est traduit ici.
DO $guard$
BEGIN
  IF to_regprocedure('api.list_crm_directory_linked(text,text,timestamp with time zone,timestamp with time zone,text)') IS NULL THEN
    RAISE EXCEPTION 'api.list_crm_directory_linked absente : le renommage 20260807124408_actor_prospects_documents.sql doit avoir ete applique AVANT 17g (sinon ce fichier creerait une fonction orpheline que le wrapper list_crm_directory n appellerait pas dans les memes conditions de droits).';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION api.list_crm_directory_linked(
  p_topic_code text DEFAULT NULL,
  p_status     text DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_search     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
-- `extensions` en fin de liste : pg_trgm (word_similarity) y vit — cf. GOTCHA §29 de 8z2.
SET search_path = public, api, auth, extensions
AS $$
DECLARE
  v_scope text[];        -- objets du périmètre (NULL = superuser, sans restriction)
  v_actor_scope uuid[];  -- acteurs du périmètre (NULL = superuser)
  v_items jsonb;
  v_topic_id uuid;
  v_statuses crm_status[];
  v_filtered boolean := (p_topic_code IS NOT NULL OR p_status IS NOT NULL
                         OR p_from IS NOT NULL OR p_to IS NOT NULL);
  -- Recherche : NULL = aucun filtre de recherche (contrat < 2 caractères).
  v_text    text;        -- saisie normalisée (unaccent+lower) — argument gauche du flou
  v_pattern text;        -- v_text échappé pour LIKE, encadré de %
  v_digits  text;        -- chiffres de la saisie (branche téléphone)
  v_fuzzy   boolean := false;  -- flou actif : >= 3 caractères
  v_threshold real := 0.45;    -- calibré live 2026-07-27, cf. en-tête 8z2
BEGIN
  -- Validation des filtres AVANT le périmètre (le contrat 22023 vaut même à périmètre vide).
  IF p_topic_code IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic WHERE code = p_topic_code;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_topic_code USING ERRCODE = '22023';
    END IF;
  END IF;
  -- Vocabulaire d'INTERFACE (inchangé) : « Actives » = famille OUVERTE, « Traitées » = famille
  -- FERMÉE (arbitrage plan n°8). Un filtre porte désormais une FAMILLE, plus une valeur.
  IF p_status IS NOT NULL THEN
    IF p_status = 'active' THEN v_statuses := ARRAY['new','in_progress','awaiting_provider']::crm_status[];
    ELSIF p_status = 'done' THEN v_statuses := ARRAY['resolved','closed','canceled']::crm_status[];
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
          -- 3. Canaux — STRUCTURÉ, aucun flou (cf. en-tête 8z2). E-mail : sous-chaîne.
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
                          AND (v_statuses IS NULL OR cf.status = ANY (v_statuses))
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
        AND (v_statuses IS NULL OR ci.status = ANY (v_statuses))
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
        AND (v_statuses IS NULL OR ci2.status = ANY (v_statuses))
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
          AND (v_statuses IS NULL OR ci3.status = ANY (v_statuses))
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

-- Droits ré-affirmés à l'identique de 20260807124408 : ce corps est un HELPER INTERNE appelé
-- par le wrapper `api.list_crm_directory` (SECURITY DEFINER) — il n'est PAS exposé à
-- `authenticated`. `CREATE OR REPLACE` préserve les grants ; ce REVOKE est une garde, pas un
-- changement.
REVOKE ALL ON FUNCTION api.list_crm_directory_linked(text, text, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.6  api.create_crm_artifacts_from_incident — corps schema_unified traduit
-- ─────────────────────────────────────────────────────────────────────────────────────
-- ⚠ CETTE FONCTION ÉCRIT DANS LES DEUX VOCABULAIRES. L'INSERT INTERACTION passe de 'done' à
-- 'resolved' (la note d'incident EST écrite) ; l'INSERT TÂCHE dix-neuf lignes plus bas garde
-- 'todo' — c'est un `crm_task_status`, il n'a RIEN à voir avec le cycle de vie des demandes.
CREATE OR REPLACE FUNCTION api.create_crm_artifacts_from_incident()
RETURNS TRIGGER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_interaction_id UUID;
  v_task_id UUID;
  v_priority crm_task_priority;
BEGIN
  v_priority := CASE NEW.severity
    WHEN 'critical' THEN 'urgent'::crm_task_priority
    WHEN 'medium' THEN 'high'::crm_task_priority
    ELSE 'medium'::crm_task_priority
  END;

  INSERT INTO crm_interaction (
    object_id,
    interaction_type,
    direction,
    status,
    subject,
    body,
    source,
    occurred_at,
    is_actionable,
    extra
  ) VALUES (
    NEW.object_id,
    'note',
    'internal',
    'resolved',                    -- DEMANDE (crm_status) : la note de journal EST écrite.
    'Incident report received',
    COALESCE(NEW.description, 'No details provided'),
    'incident_report',
    NOW(),
    TRUE,
    jsonb_build_object(
      'incident_id', NEW.id,
      'severity', NEW.severity,
      'category_id', NEW.category_id
    )
  )
  RETURNING id INTO v_interaction_id;

  INSERT INTO crm_task (
    object_id,
    title,
    description,
    status,
    priority,
    related_interaction_id,
    extra
  ) VALUES (
    NEW.object_id,
    'Maintenance incident to review',
    COALESCE(NEW.description, 'No details provided'),
    'todo',                        -- TÂCHE (crm_task_status) : INTOUCHÉ par 17g.
    v_priority,
    v_interaction_id,
    jsonb_build_object(
      'incident_id', NEW.id,
      'severity', NEW.severity
    )
  )
  RETURNING id INTO v_task_id;

  UPDATE incident_report
  SET crm_task_id = v_task_id,
      crm_interaction_id = v_interaction_id
  WHERE id = NEW.id;

  IF NEW.severity = 'critical' THEN
    UPDATE object_iti
    SET open_status = 'warning',
        status_note = COALESCE(status_note, 'Critical incident reported'),
        status_updated_at = NOW()
    WHERE object_id = NEW.object_id
      AND COALESCE(open_status, 'open') <> 'closed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 7.7  api.log_publication_proof_interaction — corps schema_unified traduit
-- ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.log_publication_proof_interaction()
RETURNS TRIGGER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.workflow_status = 'proof_sent' AND (OLD.workflow_status IS DISTINCT FROM 'proof_sent') THEN
    INSERT INTO crm_interaction (
      object_id,
      interaction_type,
      direction,
      status,
      subject,
      body,
      source,
      occurred_at,
      is_actionable,
      extra
    ) VALUES (
      NEW.object_id,
      'email',
      'outbound',
      'resolved',                  -- le BAT EST parti : rien n'est en attente côté équipe.
      'Proof sent for publication',
      'A PDF proof was sent for publication workflow.',
      'publication_workflow',
      NOW(),
      TRUE,
      jsonb_build_object(
        'publication_id', NEW.publication_id,
        'workflow_status', NEW.workflow_status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- (8) api.list_crm_status_events — lecture du journal (encart « depuis quand »)
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.list_crm_status_events(p_interaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_object text;
  v_actor  uuid;
  v_ok     boolean;
BEGIN
  SELECT ci.object_id, ci.actor_id INTO v_object, v_actor
  FROM crm_interaction ci WHERE ci.id = p_interaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interaction introuvable' USING ERRCODE = '22023'; END IF;

  -- Périmètre §61 : le journal suit la lisibilité de SON interaction. COALESCE(…, FALSE)
  -- obligatoire (§204) : les sondes passent par auth.*(), NULL hors contexte HTTP.
  v_ok := COALESCE(CASE
            WHEN v_object IS NOT NULL THEN api.user_can_read_crm(v_object)
            WHEN v_actor  IS NOT NULL THEN api.user_can_read_crm_actor(v_actor)
            ELSE api.current_user_can_write_crm_notes()
          END, FALSE);
  IF NOT v_ok THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;

  RETURN jsonb_build_object('events', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'from_status', e.from_status,
             'to_status',   e.to_status,
             'changed_at',  e.changed_at,
             'changed_by_label', api.crm_user_label(e.changed_by, p.display_name)
           ) ORDER BY e.changed_at ASC)
    FROM crm_interaction_status_event e
    LEFT JOIN app_user_profile p ON p.id = e.changed_by
    WHERE e.interaction_id = p_interaction_id
  ), '[]'::jsonb));
END $$;

COMMENT ON FUNCTION api.list_crm_status_events(uuid) IS
  'Journal des transitions de statut d''une demande CRM, ordonné du plus ancien au plus récent (manifeste 17g). Alimente l''encart « depuis quand » du sélecteur de statut. Périmètre §61 : la lisibilité du journal SUIT celle de son interaction (arme objet, à défaut arme acteur, à défaut la sonde d''écriture de notes). N''émet aucune coordonnée — seulement un libellé d''utilisateur via api.crm_user_label.';

REVOKE ALL ON FUNCTION api.list_crm_status_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_status_events(uuid) TO authenticated, service_role;

-- Garde dure : un ré-apply par un rôle non-propriétaire ne rend qu'un WARNING sur le REVOKE,
-- que ON_ERROR_STOP ne rattrape pas.
DO $$
BEGIN
  IF has_function_privilege('public', 'api.list_crm_status_events(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'api.list_crm_status_events(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.list_crm_status_events — fonction ouverte, arrêt.';
  END IF;
END $$;

-- =====================================================================================
-- (9) LA GARDE 3 VOLETS — c'est ELLE qui protège, pas le système de types
-- =====================================================================================
DO $$
DECLARE v_bad text; v_n int;
BEGIN
  -- Volet 1a — 'planned' n'appartient à AUCUN autre vocabulaire : zéro tolérance,
  -- sauf save_crm_interaction (TOLERANCE-17g documentée).
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('api','public','crm')
    AND p.prosrc ~ '''planned'''
    AND p.proname <> 'save_crm_interaction';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Vocabulaire mort ''planned'' encore référencé par : % — corriger avant de continuer.', v_bad;
  END IF;

  -- Volet 1b — 'done' est partagé avec crm_task_status : on ne contrôle que les fonctions
  -- qui touchent crm_interaction SANS toucher crm_task. RÉSIDU ASSUMÉ : une fonction
  -- touchant les deux tables échappe à ce volet — couverte par le volet 3 (garde CI front)
  -- et par le fait que toutes les fonctions mixtes actuelles sont redéployées ici même.
  --
  -- ⚠ NEUTRALISATION EXPLICITE DU CONTRAT EXTERNE DE FILTRE. `p_status = 'done'` n'est PAS le
  -- vocabulaire du type : c'est le vocabulaire d'INTERFACE des deux chips « Actives » /
  -- « Traitées », que le front continue légitimement d'envoyer et que list_crm_timeline /
  -- list_crm_directory_linked traduisent en FAMILLE. Sans ce retrait ciblé, le volet rougirait
  -- sur ces deux fonctions le jour même de son installation, quelqu'un ajouterait une
  -- exclusion PAR NOM, et cette exclusion masquerait le lendemain un vrai oubli. On retire la
  -- construction exacte, pas la fonction.
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('api','public','crm')
    AND p.prosrc ILIKE '%crm_interaction%' AND p.prosrc NOT ILIKE '%crm_task%'
    AND regexp_replace(p.prosrc, 'p_status\s*=\s*''done''', '', 'g') ~ '''done'''
    AND p.proname <> 'save_crm_interaction';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Vocabulaire mort ''done'' (contexte interaction) encore référencé par : %', v_bad;
  END IF;

  -- Volet 1c — la tolérance existe tant que l'exclusion existe : si quelqu'un retire
  -- TOLERANCE-17g de save_crm_interaction sans retirer ces exclusions, on échoue ICI.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'save_crm_interaction'
    AND p.prosrc LIKE '%TOLERANCE-17g%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TOLERANCE-17g absente de save_crm_interaction : retirer AUSSI les exclusions des volets 1a/1b.';
  END IF;

  -- Volet 2 — les COMMENT ON FUNCTION (pg_description, invisibles de prosrc) : les deux
  -- commentaires qui citaient le prédicat mort doivent avoir été réécrits.
  -- `classoid` est qualifié : pg_description est clé par (objoid, classoid, objsubid) et une
  -- jointure sur le seul oid pourrait ramener la description d'un objet d'un AUTRE catalogue.
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_description d ON d.objoid = p.oid AND d.classoid = 'pg_proc'::regclass
  WHERE n.nspname IN ('api','public','crm')
    AND p.prosrc ILIKE '%crm_interaction%'
    AND d.description ~ '''(planned|done)''';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'COMMENT citant le vocabulaire mort sur : %', v_bad;
  END IF;
END $$;

COMMIT;

-- Fonction exposée neuve (api.list_crm_status_events) ⇒ PostgREST doit relire son schéma.
NOTIFY pgrst, 'reload schema';
