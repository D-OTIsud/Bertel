-- test_crm_lifecycle.sql
-- Garde permanente du manifeste 17g — cycle de vie des demandes CRM.
-- Prouve `migration_crm_lifecycle.sql` :
--   (A) VOCABULAIRE — `crm_status` porte exactement les six valeurs, dans cet ordre, et plus
--       AUCUNE ligne ne parle l'ancien vocabulaire.
--   (B) INVARIANT CARTE ↔ COURBE, PAR EXÉCUTION — `api.capture_metric_snapshots` est réellement
--       APPELÉE, puis on relit ce qu'elle a écrit. Recopier son prédicat ici ne pourrait JAMAIS
--       échouer (ce serait le même texte évalué deux fois) ; seule l'exécution prouve que la
--       carte et la courbe restent alignées si l'une des deux définitions dérive un jour.
--       (B3) ajoute la preuve LITTÉRALE : le même bloc de prédicat, indentation comprise, doit
--       se trouver dans les DEUX `prosrc`. C'est ce qui attrape une dérive AVANT qu'elle ne
--       produise deux chiffres — l'exécution ne la verrait que sur un corpus qui la révèle.
--   (I) REJEU D'AUDIT IDEMPOTENT — voir la note d'ORDRE ci-dessous.
--   (C) TRIGGER — une transition RÉELLE écrit exactement une ligne (from/to/changed_by exacts) ;
--       un UPDATE qui ne touche pas au statut n'écrit RIEN.
--   (D) `resolved_at` SUR LES TROIS TERMINAUX — resolved / closed / canceled posent la date,
--       tout retour à un statut ouvert l'efface (arbitrage plan n°2).
--   (E) TOLERANCE-17g — 'done' entrant écrit `resolved`, 'planned' entrant écrit `new`.
--   (F) TEMPS DE TRAITEMENT NET sur un cycle simulé : 14 jours écoulés − 7 jours d'attente
--       prestataire = 7 jours nets. La requête de référence est écrite ICI EN PREMIER : c'est
--       celle que consommera la RPC de l'onglet Activité.
--   (G) FILTRES TRADUITS — « Actives » ne rend que des statuts ouverts, « Traitées » que la
--       famille fermée. Les deux assertions sont NON VACANTES (un témoin de chaque côté).
--   (H) §204 / doctrine §61 — EXECUTE révoqué de PUBLIC/anon et accordé aux rôles applicatifs ;
--       RLS activée sur le journal, ZÉRO policy, ZÉRO grant applicatif.
--
-- ⚠ ORDRE D'EXÉCUTION : le bloc (I) est joué APRÈS (B) et AVANT toute fixture. Le rejeu lit
--   `audit.audit_log`, et les transitions que ce test provoque lui-même y écrivent des lignes
--   (trigger `trg_audit_crm_interaction`). Le mesurer après (F) — qui recule artificiellement
--   les `changed_at` du journal, et casse donc la clause de non-duplication du rejeu — le ferait
--   rougir pour une raison ÉTRANGÈRE à ce qu'il teste (§218).
--
-- PERSONA : les blocs (D), (E) et (G) écrivent/lisent par `api.save_crm_interaction` et
-- `api.list_crm_timeline`, dont la garde est `write_crm_notes` OU rang admin d'ORG OU superuser.
-- Ils s'exécutent donc en tant que le persona le MOINS privilégié qui doit passer — un membre
-- d'ORG portant la seule permission `write_crm_notes` — jamais en superuser (§214).
-- Le bloc (C), lui, éprouve le TRIGGER et non le RPC : il écrit en direct (superuser, la RLS
-- des tables crm_* est admin-only) MAIS avec `request.jwt.claims` posé, sans `SET LOCAL ROLE` —
-- c'est ce qui donne un `auth.uid()` RÉEL à asserter sur `changed_by` tout en gardant l'accès
-- direct à la table.
--
-- ⚠ AUCUN CHIFFRE EN DUR sur le corpus. Les seules constantes du fichier sont celles du CYCLE
-- FABRIQUÉ par (F) (J0/J2/J5/J12/J14 ⇒ 7 jours nets) : elles décrivent la fixture, pas la base.
--
-- Run AFTER the full manifest. Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Plage de fixtures dédiée 11xx (08xx = test_crm_module, 09xx = test_crm_directory_search,
-- 10xx = test_crm_interaction_status).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org    text := 'ORGRUN9999991101';
  v_obj    text := 'HOTRUN9999991111';
  v_user   uuid := '00000000-0000-4000-a000-000000001101';
  v_actor  uuid := '00000000-0000-4000-a000-000000001121';
  v_pub_role   uuid;
  v_actor_role uuid;
  v_perm_id    uuid;

  v_labels     text[];
  v_legacy     bigint;
  v_card       jsonb;
  v_backlog    numeric;
  v_pred       text;
  v_src_cap    text;
  v_src_card   text;

  v_replay_before bigint;
  v_replay_after  bigint;
  v_replay_after2 bigint;

  v_obj_i      text := 'HOTRUN9999991102';  -- (I) micro-fixture dediee, avant la fixture complete
  v_id_witness uuid := gen_random_uuid();   -- (I) temoin du rejeu d audit

  v_id_trigger uuid := gen_random_uuid();   -- (C) le témoin du trigger
  v_id_cycle   uuid := gen_random_uuid();   -- (F) le cycle simulé
  v_id_tol_d   uuid;                        -- (E) tolérance 'done'
  v_id_tol_p   uuid;                        -- (E) tolérance 'planned'

  v_events     jsonb;
  v_n          bigint;
  v_status     text;
  v_to_status  text;
  v_resolved   timestamptz;
  v_changed_by uuid;
  v_t0         timestamptz;
  v_net        numeric;
  v_elapsed    numeric;
  v_rows       int;
  v_open_n     int;
  v_closed_n   int;
BEGIN
  -- ═══════════════════════ (A) LE VOCABULAIRE ═══════════════════════
  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO v_labels
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'crm_status';
  ASSERT v_labels = ARRAY['new','in_progress','awaiting_provider','resolved','closed','canceled'],
         format('A1 : crm_status doit porter exactement les six valeurs du cycle de vie, dans cet ordre ; obtenu %s', v_labels);

  -- Le remappage a bien eu lieu : plus une seule ligne ne parle l'ancien vocabulaire. La
  -- comparaison passe par ::text A DESSEIN — un littéral 'planned' ne se caste plus.
  SELECT count(*) INTO v_legacy
  FROM crm_interaction WHERE status::text IN ('planned','done');
  ASSERT v_legacy = 0,
         format('A2 : aucune interaction ne doit rester dans l ancien vocabulaire ; %s trouvee(s)', v_legacy);

  -- ═════════════ (B) INVARIANT CARTE ↔ COURBE, PAR EXÉCUTION ═════════════
  -- Joué AVANT toute fixture : il porte sur le corpus RÉEL.
  PERFORM api.capture_metric_snapshots(current_date);
  SELECT value INTO v_backlog
  FROM   public.metric_snapshot
  WHERE  metric_key = 'crm_backlog' AND scope = 'global' AND scope_key = ''
    AND  snapshot_date = current_date;
  ASSERT v_backlog IS NOT NULL,
         'B1 : capture_metric_snapshots doit ecrire une ligne crm_backlog (global) pour aujourd hui';

  v_card := api.get_dashboard_crm_open();
  ASSERT (v_card->>'open_interactions')::numeric = v_backlog,
         format('B2 : la carte du bandeau (open_interactions=%s) et le KPI historise crm_backlog de la courbe Activite (%s) doivent afficher le MEME chiffre — sinon la carte et la courbe se contredisent pour la meme realite',
                v_card->>'open_interactions', v_backlog);

  -- (B3) L'identité LITTÉRALE des deux prédicats. Un test d'exécution ne voit une divergence
  -- que si le corpus la révèle ; celui-ci la voit tout de suite. L'indentation fait partie de
  -- l'identité : les deux fichiers portent volontairement le MÊME bloc de trois lignes.
  v_pred := E'  FROM crm_interaction\n  WHERE resolved_at IS NULL\n    AND status = ANY (ARRAY[''new'',''in_progress'',''awaiting_provider'']::crm_status[])';
  SELECT p.prosrc INTO v_src_cap  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api' AND p.proname = 'capture_metric_snapshots';
  SELECT p.prosrc INTO v_src_card FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api' AND p.proname = 'get_dashboard_crm_open';
  ASSERT position(v_pred IN v_src_cap) > 0,
         'B3a : api.capture_metric_snapshots doit porter le bloc de predicat canonique (liste positive TYPEE des statuts ouverts) MOT POUR MOT';
  ASSERT position(v_pred IN v_src_card) > 0,
         'B3b : api.get_dashboard_crm_open doit porter le MEME bloc de predicat, indentation comprise — c est cette identite litterale qui interdit a la carte et a la courbe de diverger';

  -- Non-vacuité de (B3) : la comparaison porterait sur du vide si l un des corps manquait.
  ASSERT v_src_cap IS NOT NULL AND v_src_card IS NOT NULL,
         'B3c : les deux corps doivent exister (sans quoi B3a/B3b passeraient a vide)';

  -- ═══════════ (I) LE REJEU D'AUDIT EST IDEMPOTENT ═══════════
  -- Joué ICI, avant toute fixture — voir la note d'ORDRE en en-tête.
  --
  -- Sur une base fraîche, audit.audit_log ne porte AUCUNE transition de statut : sans matière,
  -- le compteur avant vaut 0, le rejeu insère 0 ligne, le compteur après vaut 0, l'assertion
  -- passe — la garde ne peut alors RIEN rougir là où elle s'exécute en intégration continue,
  -- précisément le bloc censé garder l'idempotence d'un backfill. On fabrique donc la matière
  -- ICI, dans la transaction annulée : un objet + une interaction TÉMOIN (seuls nécessaires —
  -- le rejeu JOINT sur crm_interaction, il lui faut une ligne réelle), puis une ligne
  -- audit.audit_log FABRIQUÉE directement, hors trigger (le trigger d'audit n'écrit que sur
  -- UPDATE/DELETE, jamais sur la création elle-même), simulant une transition HISTORIQUE
  -- préexistante à 17g dans l'ANCIEN vocabulaire — before/after 'planned'/'done' — pour que le
  -- rejeu prouve à la fois qu'il insère (I1) ET qu'il traduit (comme le bloc (E) le fait déjà
  -- pour le chemin RPC).
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_obj_i, 'HOT', 'Objet temoin (I) rejeu audit', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO crm_interaction (id, object_id, status, body, occurred_at)
    VALUES (v_id_witness, v_obj_i, 'new', 'Temoin du rejeu audit idempotent', NOW());

  INSERT INTO audit.audit_log (table_name, operation, row_pk, before_data, after_data, changed_at, changed_by)
  VALUES ('crm_interaction', 'UPDATE',
          jsonb_build_object('id', v_id_witness),
          jsonb_build_object('status','planned'),
          jsonb_build_object('status','done'),
          NOW(), '00000000-0000-4000-a000-000000001199');

  SELECT count(*) INTO v_replay_before
  FROM crm_interaction_status_event WHERE from_status IS NOT NULL;

  -- Bloc (6) de la migration, recopié VERBATIM : c'est son idempotence qu'on éprouve.
  -- PREMIER PASSAGE — doit insérer AU MOINS la transition fabriquée ci-dessus.
  INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_at, changed_by)
  SELECT (a.row_pk->>'id')::uuid,
         (CASE a.before_data->>'status' WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
               ELSE a.before_data->>'status' END)::crm_status,
         (CASE a.after_data->>'status'  WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
               ELSE a.after_data->>'status'  END)::crm_status,
         a.changed_at,
         CASE WHEN a.changed_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN a.changed_by::uuid ELSE NULL END
  FROM audit.audit_log a
  JOIN public.crm_interaction ci ON ci.id = (a.row_pk->>'id')::uuid
  WHERE a.table_name = 'crm_interaction' AND a.operation = 'UPDATE'
    AND (a.before_data->>'status') IS NOT NULL
    AND (a.after_data->>'status')  IS NOT NULL
    AND (a.before_data->>'status') IS DISTINCT FROM (a.after_data->>'status')
    AND NOT EXISTS (SELECT 1 FROM public.crm_interaction_status_event e
                    WHERE e.interaction_id = (a.row_pk->>'id')::uuid
                      AND e.changed_at = a.changed_at AND e.from_status IS NOT NULL);

  SELECT count(*) INTO v_replay_after
  FROM crm_interaction_status_event WHERE from_status IS NOT NULL;
  ASSERT v_replay_after >= v_replay_before + 1,
         format('I1 : le PREMIER passage du rejeu doit inserer AU MOINS la transition fabriquee ci-dessus (%s avant, %s apres) — sinon la garde d idempotence ne teste jamais rien sur une base fraiche',
                v_replay_before, v_replay_after);
  ASSERT EXISTS (SELECT 1 FROM crm_interaction_status_event e
                 WHERE e.interaction_id = v_id_witness
                   AND e.from_status = 'new' AND e.to_status = 'resolved'),
         'I1b : la transition fabriquee doit avoir ete TRADUITE (planned/done, ancien vocabulaire, vers new/resolved) — sinon (I1) ne prouve que l insertion, pas la lecture du bloc (6)';

  -- SECOND PASSAGE — la ligne fabriquee porte desormais son evenement (meme interaction_id,
  -- meme changed_at) : la clause NOT EXISTS doit l exclure et RIEN inserer de plus.
  INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_at, changed_by)
  SELECT (a.row_pk->>'id')::uuid,
         (CASE a.before_data->>'status' WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
               ELSE a.before_data->>'status' END)::crm_status,
         (CASE a.after_data->>'status'  WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
               ELSE a.after_data->>'status'  END)::crm_status,
         a.changed_at,
         CASE WHEN a.changed_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN a.changed_by::uuid ELSE NULL END
  FROM audit.audit_log a
  JOIN public.crm_interaction ci ON ci.id = (a.row_pk->>'id')::uuid
  WHERE a.table_name = 'crm_interaction' AND a.operation = 'UPDATE'
    AND (a.before_data->>'status') IS NOT NULL
    AND (a.after_data->>'status')  IS NOT NULL
    AND (a.before_data->>'status') IS DISTINCT FROM (a.after_data->>'status')
    AND NOT EXISTS (SELECT 1 FROM public.crm_interaction_status_event e
                    WHERE e.interaction_id = (a.row_pk->>'id')::uuid
                      AND e.changed_at = a.changed_at AND e.from_status IS NOT NULL);

  SELECT count(*) INTO v_replay_after2
  FROM crm_interaction_status_event WHERE from_status IS NOT NULL;
  ASSERT v_replay_after2 = v_replay_after,
         format('I2 : un SECOND passage du rejeu d audit ne doit RIEN inserer de plus (%s apres le 1er passage, %s apres le 2e) — sinon chaque re-application de 17g dupliquerait l historique',
                v_replay_after, v_replay_after2);

  -- ═══════════════════════ FIXTURE (superuser, RLS bypass) ═══════════════════════
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant (seeds non appliques)'; END IF;
  SELECT id INTO v_actor_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  IF v_actor_role IS NULL THEN
    v_actor_role := gen_random_uuid();
    INSERT INTO ref_actor_role (id, code, name) VALUES (v_actor_role,'operator','Exploitant');
  END IF;
  SELECT id INTO v_perm_id FROM ref_permission WHERE code='write_crm_notes' AND is_active LIMIT 1;
  IF v_perm_id IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant (seeds non appliques)'; END IF;

  INSERT INTO auth.users (id, email) VALUES (v_user,'crm_lifecycle@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES (v_user,'tourism_agent','Agent cycle de vie')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org,'ORG','ORG cycle de vie CRM','published'),
    (v_obj,'HOT','Hotel cycle de vie CRM','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj,v_org,v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO actor (id, display_name) VALUES (v_actor,'Exploitant cycle de vie') ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary)
    VALUES (v_actor,v_obj,v_actor_role,TRUE) ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_user,v_org,TRUE)
    ON CONFLICT DO NOTHING;
  -- Le persona porte UNIQUEMENT write_crm_notes : ni rôle d'admin d'ORG, ni superuser.
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES (v_user,v_perm_id,TRUE)
    ON CONFLICT DO NOTHING;

  -- ═══════════════════════ (C) LE TRIGGER ═══════════════════════
  -- Claims posés SANS `SET LOCAL ROLE` : on reste superuser (accès direct aux tables crm_*,
  -- dont la RLS est admin-only) mais `auth.uid()` rend un utilisateur RÉEL — c'est ce qui rend
  -- l'assertion sur `changed_by` non vacante.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);

  INSERT INTO crm_interaction (id, object_id, actor_id, interaction_type, direction, status, body, occurred_at)
  VALUES (v_id_trigger, v_obj, v_actor, 'call', 'inbound', 'new', 'Temoin du journal de transitions', NOW());

  SELECT count(*) INTO v_n FROM crm_interaction_status_event WHERE interaction_id = v_id_trigger;
  ASSERT v_n = 1, format('C1 : la creation doit ecrire exactement 1 evenement ; obtenu %s', v_n);
  SELECT e.from_status::text, e.to_status::text, e.changed_by
    INTO v_status, v_to_status, v_changed_by
  FROM crm_interaction_status_event e WHERE e.interaction_id = v_id_trigger;
  ASSERT v_status IS NULL,
         format('C2a : l evenement de CREATION porte from_status NULL ; obtenu %s', v_status);
  ASSERT v_to_status = 'new',
         format('C2b : l evenement de CREATION porte le statut de naissance ; obtenu %s', v_to_status);
  ASSERT v_changed_by = v_user,
         'C3 : changed_by doit porter l utilisateur REEL (auth.uid()), pas NULL — sinon le journal ne dit pas QUI';

  UPDATE crm_interaction SET status = 'awaiting_provider' WHERE id = v_id_trigger;
  UPDATE crm_interaction SET status = 'resolved'          WHERE id = v_id_trigger;

  SELECT count(*) INTO v_n FROM crm_interaction_status_event WHERE interaction_id = v_id_trigger;
  ASSERT v_n = 3, format('C4 : deux transitions supplementaires ⇒ 3 evenements ; obtenu %s', v_n);

  -- Le CONTENU exact des trois transitions. On assert les COUPLES et non un tableau ordonné par
  -- `changed_at` : `now()` est FIGÉ sur toute la transaction, donc les trois événements portent
  -- la même date et aucun tri par `changed_at` ne les départagerait ici (le tri est éprouvé en
  -- (G7), sur le cycle de (F) dont les dates sont fabriquées). Les trois couples S'ENCHAÎNENT —
  -- chaque `to_status` est le `from_status` du suivant — donc, joints au compte exact de (C4),
  -- ils déterminent la séquence sans ambiguïté.
  ASSERT EXISTS (SELECT 1 FROM crm_interaction_status_event e
                 WHERE e.interaction_id = v_id_trigger
                   AND e.from_status IS NULL AND e.to_status = 'new'),
         'C5a : transition de creation ∅→new absente';
  ASSERT EXISTS (SELECT 1 FROM crm_interaction_status_event e
                 WHERE e.interaction_id = v_id_trigger
                   AND e.from_status = 'new' AND e.to_status = 'awaiting_provider'),
         'C5b : transition new→awaiting_provider absente ou mal datee en from_status';
  ASSERT EXISTS (SELECT 1 FROM crm_interaction_status_event e
                 WHERE e.interaction_id = v_id_trigger
                   AND e.from_status = 'awaiting_provider' AND e.to_status = 'resolved'),
         'C5c : transition awaiting_provider→resolved absente — le from_status doit etre l ANCIEN statut, pas le nouveau';

  -- Un UPDATE qui ne touche PAS au statut n'écrit RIEN. Sans cette assertion, un trigger
  -- `AFTER UPDATE` sans clause `OF status` (ou sans le IS DISTINCT FROM) passerait au vert.
  UPDATE crm_interaction SET body = 'Corps modifie sans changement de statut' WHERE id = v_id_trigger;
  SELECT count(*) INTO v_n FROM crm_interaction_status_event WHERE interaction_id = v_id_trigger;
  ASSERT v_n = 3, format('C6 : un UPDATE sans changement de statut ne doit RIEN journaliser ; obtenu %s evenements', v_n);

  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ═══════════ (D) `resolved_at` SUR LES TROIS STATUTS TERMINAUX ═══════════
  -- Par le VRAI chemin d'écriture (`api.save_crm_interaction`) et sous le persona minimal.
  --
  -- Prémisse D0 posée AVANT D1 : le bloc (C) n'a écrit que par UPDATE DIRECT (il éprouve le
  -- trigger, pas le RPC), et aucun trigger ne pose resolved_at — à la sortie de (C), la colonne
  -- est donc déjà NULL. Sans cette pose explicite, D1 ne prouverait que l'ÉTAT (déjà NULL avant
  -- son propre appel), jamais l'EFFACEMENT par api.save_crm_interaction.
  UPDATE crm_interaction SET resolved_at = NOW() WHERE id = v_id_trigger;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Préalable asserté AVANT usage : sans lui, tous les blocs suivants leveraient 42501 et le
    -- test n'assert erait rien du tout.
    ASSERT api.user_can_write_crm(v_obj),
           'prealable : le persona (write_crm_notes + membre de l ORG publisher) doit pouvoir ecrire';

    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_trigger::text, 'status','in_progress'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_trigger;
  ASSERT v_status = 'in_progress' AND v_resolved IS NULL,
         format('D1 : rouvrir en « in_progress » doit effacer resolved_at ; obtenu (%s, %s)', v_status, v_resolved);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_trigger::text, 'status','resolved'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT resolved_at INTO v_resolved FROM crm_interaction WHERE id = v_id_trigger;
  ASSERT v_resolved IS NOT NULL, 'D2 : « resolved » doit poser resolved_at';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_trigger::text, 'status','new'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT resolved_at INTO v_resolved FROM crm_interaction WHERE id = v_id_trigger;
  ASSERT v_resolved IS NULL, 'D3 : revenir a « new » doit remettre resolved_at a NULL';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_trigger::text, 'status','closed'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT resolved_at INTO v_resolved FROM crm_interaction WHERE id = v_id_trigger;
  ASSERT v_resolved IS NOT NULL, 'D4 : « closed » est TERMINAL — il doit poser resolved_at, comme resolved';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_trigger::text, 'status','awaiting_provider'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  -- État INTERMÉDIAIRE lu et asserté : sans lui, D5b ne prouverait que « canceled pose la date »
  -- (vrai de toute façon, il est TERMINAL), jamais que « awaiting_provider » l'a réellement
  -- effacée entre les deux — le message de D5 promettait cette transition, pas seulement le
  -- résultat final.
  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_trigger;
  ASSERT v_status = 'awaiting_provider' AND v_resolved IS NULL,
         format('D5a : « awaiting_provider » (ouvert) doit effacer resolved_at ; obtenu (%s, %s)', v_status, v_resolved);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_trigger::text, 'status','canceled'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_trigger;
  ASSERT v_status = 'canceled' AND v_resolved IS NOT NULL,
         'D5b : « canceled » (terminal) repose resolved_at APRES qu il ait ete efface par « awaiting_provider » (D5a) — la preuve porte sur la TRANSITION, pas seulement sur un resultat final que canceled aurait pose de toute facon';

  -- ═══════════════════ (E) LA TOLÉRANCE TRANSITOIRE (TOLERANCE-17g) ═══════════════════
  -- Le front d'avant la bascule envoie encore l'ancien vocabulaire : il doit être TRADUIT,
  -- jamais rejeté (22P02) — sinon « Marquer traitée » meurt le temps du build Coolify.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_id_tol_d := (api.save_crm_interaction(jsonb_build_object(
      'object_id', v_obj, 'actor_id', v_actor, 'interaction_type','note',
      'body','Ancien vocabulaire entrant : done', 'status','done'))->>'id')::uuid;
    v_id_tol_p := (api.save_crm_interaction(jsonb_build_object(
      'object_id', v_obj, 'actor_id', v_actor, 'interaction_type','note',
      'body','Ancien vocabulaire entrant : planned', 'status','planned'))->>'id')::uuid;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_tol_d;
  ASSERT v_status = 'resolved',
         format('E1 : un statut entrant « done » doit etre TRADUIT en resolved ; obtenu %s', v_status);
  ASSERT v_resolved IS NOT NULL,
         'E1b : traduit en statut TERMINAL, il doit porter sa date de resolution des l INSERT';
  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_tol_p;
  ASSERT v_status = 'new',
         format('E2 : un statut entrant « planned » doit etre TRADUIT en new ; obtenu %s', v_status);
  ASSERT v_resolved IS NULL, 'E2b : traduit en statut OUVERT, il ne porte pas de date de resolution';

  -- La tolérance est MARQUÉE dans le corps : c'est ce marqueur que la garde 1c de la migration
  -- lie aux exclusions des volets 1a/1b. Le retirer sans retirer les exclusions ferait de la
  -- tolérance une panne muette permanente.
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='api' AND p.proname='save_crm_interaction'
            AND p.prosrc LIKE '%TOLERANCE-17g%') = 1,
         'E3 : le marqueur TOLERANCE-17g doit vivre dans save_crm_interaction (identifiant de retrait au manifeste)';

  -- ═══════════════════ (F) LE TEMPS DE TRAITEMENT NET ═══════════════════
  -- Cycle FABRIQUÉ : new(J0) → in_progress(J2) → awaiting_provider(J5) → in_progress(J12)
  -- → resolved(J14). 14 jours écoulés, 7 jours d'attente prestataire ⇒ 7 jours NETS.
  --
  -- Les décalages sont exprimés en HEURES (48 = J2, 120 = J5, 288 = J12, 336 = J14) et non en
  -- jours : sur un `timestamptz`, `+ interval '14 days'` traverse un changement d'heure dans
  -- les fuseaux qui en ont, et l'écoulé vaudrait 14 jours ± 1 heure — soit 0,04 jour d'écart,
  -- quarante fois la tolérance de F2. En heures, l'arithmétique est exacte partout.
  v_t0 := date_trunc('day', NOW()) - interval '720 hours';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  INSERT INTO crm_interaction (id, object_id, actor_id, interaction_type, direction, status, body, occurred_at)
  VALUES (v_id_cycle, v_obj, v_actor, 'email', 'inbound', 'new', 'Cycle simule pour le temps net', v_t0);
  UPDATE crm_interaction SET status = 'in_progress'       WHERE id = v_id_cycle;
  UPDATE crm_interaction SET status = 'awaiting_provider' WHERE id = v_id_cycle;
  UPDATE crm_interaction SET status = 'in_progress'       WHERE id = v_id_cycle;
  UPDATE crm_interaction SET status = 'resolved'          WHERE id = v_id_cycle;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Les cinq couples (from_status, to_status) du cycle sont UNIQUES : chacun désigne
  -- sans ambiguïté son événement, sans dépendre d'un ordre d'insertion physique.
  UPDATE crm_interaction_status_event SET changed_at = v_t0
   WHERE interaction_id = v_id_cycle AND from_status IS NULL AND to_status = 'new';
  GET DIAGNOSTICS v_rows = ROW_COUNT;  ASSERT v_rows = 1, 'F0a : evenement ∅→new introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '48 hours'   -- J2
   WHERE interaction_id = v_id_cycle AND from_status = 'new' AND to_status = 'in_progress';
  GET DIAGNOSTICS v_rows = ROW_COUNT;  ASSERT v_rows = 1, 'F0b : evenement new→in_progress introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '120 hours'  -- J5
   WHERE interaction_id = v_id_cycle AND from_status = 'in_progress' AND to_status = 'awaiting_provider';
  GET DIAGNOSTICS v_rows = ROW_COUNT;  ASSERT v_rows = 1, 'F0c : evenement in_progress→awaiting_provider introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '288 hours'  -- J12
   WHERE interaction_id = v_id_cycle AND from_status = 'awaiting_provider' AND to_status = 'in_progress';
  GET DIAGNOSTICS v_rows = ROW_COUNT;  ASSERT v_rows = 1, 'F0d : evenement awaiting_provider→in_progress introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '336 hours'  -- J14
   WHERE interaction_id = v_id_cycle AND from_status = 'in_progress' AND to_status = 'resolved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;  ASSERT v_rows = 1, 'F0e : evenement in_progress→resolved introuvable ou duplique';

  UPDATE crm_interaction
     SET occurred_at = v_t0, resolved_at = v_t0 + interval '336 hours'   -- J0 → J14
   WHERE id = v_id_cycle;

  -- LA REQUÊTE DE RÉFÉRENCE — celle que consommera la RPC de l'onglet Activité.
  -- DEUX niveaux obligatoires : la fenêtre LEAD se calcule AVANT tout filtre et tout agrégat
  -- (un SUM par-dessus un LEAD au même niveau est une ERREUR PostgreSQL, et fenêtrer après un
  -- WHERE to_status='awaiting_provider' perdrait la borne de fin du séjour — l'événement
  -- suivant, quel que soit son statut).
  WITH events AS (
    SELECT e.interaction_id, e.to_status, e.changed_at,
           LEAD(e.changed_at) OVER (PARTITION BY e.interaction_id ORDER BY e.changed_at) AS next_at
    FROM crm_interaction_status_event e
  ),
  waits AS (
    SELECT ev.interaction_id,
           SUM(EXTRACT(EPOCH FROM (COALESCE(ev.next_at, ci.resolved_at) - ev.changed_at)) / 86400.0)
             AS wait_days
    FROM events ev
    JOIN crm_interaction ci ON ci.id = ev.interaction_id
    WHERE ev.to_status = 'awaiting_provider'
    GROUP BY ev.interaction_id
  )
  SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0
         - COALESCE(w.wait_days, 0) AS net_days
  INTO v_net
  FROM crm_interaction ci
  LEFT JOIN waits w ON w.interaction_id = ci.id
  WHERE ci.id = v_id_cycle;

  ASSERT v_net IS NOT NULL, 'F1 : le temps net doit etre calculable sur le cycle simule';
  ASSERT abs(v_net - 7) < 0.001,
         format('F2 : 14 jours ecoules moins 7 jours d attente prestataire = 7 jours NETS ; obtenu %s', v_net);

  -- Non-vacuité de F2 : sans la déduction, le calcul rendrait 14. Si l'écoulé brut valait déjà
  -- 7, F2 passerait au vert sans qu'aucune déduction n'ait eu lieu. On relit donc l'écoulé
  -- BRUT SUR LA LIGNE (et non une tautologie sur les intervalles écrits ci-dessus).
  SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0
    INTO v_elapsed FROM crm_interaction ci WHERE ci.id = v_id_cycle;
  ASSERT abs(v_elapsed - 14) < 0.001,
         format('F3 (premisse) : l ecoule BRUT du temoin doit valoir 14 jours pour que F2 mesure une DEDUCTION reelle ; obtenu %s', v_elapsed);

  -- ═══════════════════ (G) LES FILTRES TRADUITS ═══════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_open_n
    FROM jsonb_array_elements(api.list_crm_timeline(p_object_id := v_obj, p_status := 'active') -> 'items') d;
    ASSERT v_open_n > 0,
           'G1 (non vacuite) : le filtre « Actives » doit rendre au moins un temoin (sinon G2 passerait a vide)';
    ASSERT NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(
               api.list_crm_timeline(p_object_id := v_obj, p_status := 'active') -> 'items') d
             WHERE d->>'status' NOT IN ('new','in_progress','awaiting_provider')),
           'G2 : « Actives » ne doit rendre QUE des statuts ouverts (new, in_progress, awaiting_provider)';

    SELECT count(*) INTO v_closed_n
    FROM jsonb_array_elements(api.list_crm_timeline(p_object_id := v_obj, p_status := 'done') -> 'items') d;
    ASSERT v_closed_n > 0,
           'G3 (non vacuite) : le filtre « Traitees » doit rendre au moins un temoin';
    ASSERT NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(
               api.list_crm_timeline(p_object_id := v_obj, p_status := 'done') -> 'items') d
             WHERE d->>'status' NOT IN ('resolved','closed','canceled')),
           'G4 : « Traitees » = la FAMILLE fermee entiere (resolved, closed, canceled), et rien d autre';

    -- Le contrat EXTERNE de p_status est inchange : tout autre mot reste un 22023.
    BEGIN
      PERFORM api.list_crm_timeline(p_object_id := v_obj, p_status := 'resolved');
      RAISE EXCEPTION 'G5 : p_status hors contrat aurait du lever 22023';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    -- Le journal se lit par le RPC, sous le meme perimetre que son interaction.
    v_events := api.list_crm_status_events(v_id_cycle);
    ASSERT jsonb_array_length(v_events->'events') = 5,
           format('G6 : list_crm_status_events doit rendre les 5 transitions du cycle ; obtenu %s',
                  jsonb_array_length(v_events->'events'));
    ASSERT (v_events->'events'->0->>'to_status') = 'new'
       AND (v_events->'events'->4->>'to_status') = 'resolved',
           'G7 : les evenements sont ordonnes du plus ancien au plus recent (changed_at ASC)';
    ASSERT NULLIF(v_events->'events'->4->>'changed_by_label','') IS NOT NULL,
           'G8 : chaque evenement porte un libelle d utilisateur (api.crm_user_label), jamais une ligne sans etiquette';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ═══════════════════ (H) §204 + DOCTRINE §61 ═══════════════════
  ASSERT NOT has_function_privilege('anon', 'api.list_crm_status_events(uuid)', 'EXECUTE'),
         'H1 : EXECUTE doit etre revoque de PUBLIC et anon sur list_crm_status_events (§204)';
  ASSERT has_function_privilege('authenticated', 'api.list_crm_status_events(uuid)', 'EXECUTE'),
         'H2 : authenticated doit pouvoir executer list_crm_status_events';
  ASSERT has_function_privilege('service_role', 'api.list_crm_status_events(uuid)', 'EXECUTE'),
         'H3 : service_role doit pouvoir executer list_crm_status_events';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_interaction_status_event'::regclass),
         'H4 : RLS doit etre ACTIVEE sur le journal';
  ASSERT (SELECT count(*) FROM pg_policies
          WHERE schemaname='public' AND tablename='crm_interaction_status_event') = 0,
         'H5 : ZERO policy (doctrine §61) — la lecture passe par le RPC DEFINER, jamais par PostgREST';
  -- Un privilege accorde a PUBLIC est herite par anon ET authenticated : tester ces deux roles
  -- couvre donc aussi le cas PUBLIC.
  ASSERT NOT (has_table_privilege('anon','public.crm_interaction_status_event','SELECT')
           OR has_table_privilege('anon','public.crm_interaction_status_event','INSERT')
           OR has_table_privilege('authenticated','public.crm_interaction_status_event','SELECT')
           OR has_table_privilege('authenticated','public.crm_interaction_status_event','INSERT')),
         'H6 : AUCUN grant applicatif sur le journal — le REVOKE ferme la porte AVANT meme la RLS';

  RAISE NOTICE 'test_crm_lifecycle: OK (A vocabulaire 6 valeurs / B carte==courbe par execution ET par identite litterale du predicat / I rejeu d audit idempotent / C trigger: sequence exacte + changed_by reel + rien sans changement de statut / D resolved_at sur les 3 terminaux, efface au retour en ouvert / E TOLERANCE-17g traduit done et planned / F temps net = 14 ecoules - 7 attente = 7 / G filtres traduits en FAMILLES + journal lu par RPC / H §204 + RLS sans policy sans grant).';
END$$;
ROLLBACK;
