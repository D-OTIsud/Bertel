-- test_dashboard_activity.sql
-- Garde permanente du manifeste 17h — les deux RPC de l'onglet « Activité équipe » et
-- l'extension de la carte d'attention.
--
--   (A) CONTRATS DE CLÉS des trois fonctions.
--   (B) DOUZE SEMAINES, TOUJOURS — et une semaine SANS ACTIVITÉ sort à ZÉRO sur toute la
--       ligne. C'est le bloc central de ce fichier : `count(DISTINCT (created_by,
--       created_at::date))` posé DIRECTEMENT au-dessus d'un LEFT JOIN sur la série des
--       semaines compte la ligne toute-NULL du générateur, parce que `ROW(NULL,NULL)`
--       n'est PAS NULL. Une semaine vide rapporterait alors **1 jour-éditeur** pour zéro
--       éditeur et zéro objet. Mesuré sur la base vive le 31/08 : la semaine du 2026-07-06
--       est vide, et la formule naïve y rendait `editor_days=1, editors=0`. La fonction
--       agrège AVANT de joindre ; ce bloc l'éprouve sur le corpus réel.
--   (C) `created_by IS NULL` EST IGNORÉ — 57,5 % des versions sont des imports/système
--       (2 299 sur 3 995 au 31/08). Une version anonyme insérée ici ne doit RIEN changer.
--   (D) `bulk_days` BASCULE À DIX PILE — 9 objets dans la journée : non ; 10 : oui. La
--       distribution réelle est bimodale (≤ 9 d'un côté, ≥ 58 de l'autre, spec §2) : le
--       seuil tombe dans un trou, et aucune donnée réelle ne l'éprouve. Seule une fixture
--       posée exactement sur la bascule peut le faire.
--   (E) `recent + backlog = open_interactions` — l'invariant INTERNE de la carte.
--   (F) LES QUATRE TRANCHES D'ÂGE SONT TOUJOURS ÉMISES, même vides. Non vacant : au 31/08
--       la tranche `d30_90` est à zéro sur la base vive (3 / 0 / 24 / 143).
--   (G) TEMPS NET — le cycle simulé du bloc (F) de `test_crm_lifecycle` est rejoué ici et
--       doit rendre 7 jours par la RPC, pas par une requête recopiée.
--   (H) DOUZE MOIS, TOUJOURS, dans `monthly_flow`.
--   (I) §204 sur les trois fonctions + `display_name` vient de `api.crm_user_label`.
--
-- ⚠ ORDRE D'EXÉCUTION : (A) (B) (E) (F) (H) portent sur le CORPUS RÉEL et sont joués AVANT
--   toute fixture. (C) (D) (G) (I) suivent. Poser les fixtures d'abord peuplerait la semaine
--   vide de (B) et ferait rougir la garde pour une raison ÉTRANGÈRE à ce qu'elle teste.
--
-- ⚠ AUCUN CHIFFRE DE CORPUS EN DUR. 3 995 / 2 299 / 3 / 5 / 170 datent du 31/08. Les seules
--   constantes du fichier décrivent les FIXTURES (9 vs 10 objets, le cycle J0→J14).
--
-- Run AFTER the full manifest. Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Plage de fixtures dédiée 12xx (11xx = test_crm_lifecycle, 10xx = test_crm_interaction_status).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_team       jsonb;
  v_crm        jsonb;
  v_card       jsonb;

  v_n          int;
  v_weeks      int;
  v_empty      int;
  v_buckets    text[];
  v_open       int;
  v_recent     int;
  v_backlog    int;
  v_net        numeric;
  v_cnt        int;

  v_obj        text;
  v_actor      uuid;
  v_user       uuid := '00000000-0000-4000-a000-000000001201';
  v_user_lbl   text;
  v_day_a      date;
  v_day_b      date;
  v_i          int;

  v_before     jsonb;
  v_after      jsonb;

  v_id_open    uuid := gen_random_uuid();
  v_id_cycle   uuid := gen_random_uuid();
  v_t0         timestamptz;
  v_rows       int;
BEGIN
  -- ═══════════════════ (A) LES CONTRATS DE CLÉS ═══════════════════
  v_team := api.get_dashboard_team_activity();
  ASSERT v_team ? 'weeks',        'A1 : get_dashboard_team_activity doit emettre weeks';
  ASSERT v_team ? 'contributors', 'A2 : get_dashboard_team_activity doit emettre contributors';

  v_crm := api.get_dashboard_crm_activity();
  ASSERT v_crm ? 'open_by_age',   'A3 : get_dashboard_crm_activity doit emettre open_by_age';
  ASSERT v_crm ? 'open_by_topic', 'A4 : get_dashboard_crm_activity doit emettre open_by_topic';
  ASSERT v_crm ? 'monthly_flow',  'A5 : get_dashboard_crm_activity doit emettre monthly_flow';
  ASSERT v_crm ? 'net',           'A6 : get_dashboard_crm_activity doit emettre net';

  v_card := api.get_dashboard_crm_open();
  ASSERT v_card ? 'open_interactions' AND v_card ? 'open_tasks' AND v_card ? 'total',
         'A7 : les trois cles historiques de la carte sont CONSERVEES (l invariant carte/courbe est dessus)';
  ASSERT v_card ? 'recent_interactions',  'A8 : la carte doit emettre recent_interactions';
  ASSERT v_card ? 'backlog_interactions', 'A9 : la carte doit emettre backlog_interactions';

  -- ═══ (B) DOUZE SEMAINES, ET UNE SEMAINE VIDE EST VIDE SUR TOUTE LA LIGNE ═══
  -- Joué AVANT toute fixture : il porte sur le corpus RÉEL.
  SELECT jsonb_array_length(v_team->'weeks') INTO v_weeks;
  ASSERT v_weeks = 12,
         format('B1 : weeks doit porter exactement 12 entrees (semaines vides comprises) ; obtenu %s', v_weeks);

  -- Ordre croissant, et la dernière entrée est la semaine COURANTE.
  ASSERT (SELECT bool_and(prev < cur) FROM (
            SELECT (lag(d->>'week_start') OVER (ORDER BY ord))::date AS prev, (d->>'week_start')::date AS cur
            FROM jsonb_array_elements(v_team->'weeks') WITH ORDINALITY AS t(d, ord)) z
          WHERE prev IS NOT NULL),
         'B2 : les semaines sont ordonnees de la plus ancienne a la plus recente';
  ASSERT (v_team->'weeks'->11->>'week_start')::date = date_trunc('week', current_date)::date,
         format('B3 : la derniere semaine est la semaine COURANTE ; obtenu %s', v_team->'weeks'->11->>'week_start');

  -- LE PIÈGE. Une semaine sans activité porte ZÉRO PARTOUT — `editor_days` compris.
  -- `ROW(NULL,NULL)` n'etant pas NULL, un count(DISTINCT (created_by, created_at::date))
  -- pose au-dessus d'un LEFT JOIN rendrait 1 ici pour 0 editeur et 0 objet.
  SELECT count(*) INTO v_empty
  FROM jsonb_array_elements(v_team->'weeks') d
  WHERE (d->>'editors')::int = 0 AND (d->>'objects_touched')::int = 0;
  ASSERT v_empty > 0,
         'B4 (non vacuite) : le corpus doit porter AU MOINS une semaine sans activite, sinon B5 ne prouve rien — si cette assertion rougit un jour, c est que le corpus a change, pas que la fonction est fausse : fabriquer alors une semaine vide plutot que de retirer B5';
  ASSERT NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_team->'weeks') d
           WHERE (d->>'editors')::int = 0 AND (d->>'objects_touched')::int = 0
             AND (d->>'editor_days')::int <> 0),
         'B5 : une semaine SANS editeur et SANS objet doit porter editor_days = 0 — un jour-editeur fantome vient du ROW(NULL,NULL) compte par le LEFT JOIN sur la serie des semaines';
  ASSERT NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_team->'weeks') d
           WHERE (d->>'editor_days')::int < (d->>'editors')::int),
         'B6 : editor_days (jours x editeurs) ne peut pas etre inferieur au nombre d editeurs distincts de la semaine';

  -- ═══ (E) L'INVARIANT INTERNE DE LA CARTE ═══
  v_open    := (v_card->>'open_interactions')::int;
  v_recent  := (v_card->>'recent_interactions')::int;
  v_backlog := (v_card->>'backlog_interactions')::int;
  ASSERT v_recent + v_backlog = v_open,
         format('E1 : recent (%s) + arriere (%s) doit egaler open_interactions (%s) — sinon la carte se contredit elle-meme',
                v_recent, v_backlog, v_open);
  -- Sur une base vivante, le corpus rend normalement E1 non vacant. Une base fraîche peut
  -- légitimement être vide ; un témoin est alors fabriqué plus bas, une fois son objet créé,
  -- puis l'invariant est rappelé sur 1 ligne réelle plutôt que d'exiger une seed historique.

  -- ═══ (F) LES QUATRE TRANCHES D'ÂGE, MÊME VIDES ═══
  SELECT array_agg(d->>'bucket' ORDER BY ord) INTO v_buckets
  FROM jsonb_array_elements(v_crm->'open_by_age') WITH ORDINALITY AS t(d, ord);
  ASSERT v_buckets = ARRAY['lt_30d','d30_90','d90_1y','gt_1y'],
         format('F1 : open_by_age porte les QUATRE tranches, dans cet ordre, meme vides ; obtenu %s', v_buckets);
  ASSERT (SELECT sum((d->>'count')::int) FROM jsonb_array_elements(v_crm->'open_by_age') d) = v_open,
         'F2 : la somme des tranches d age doit egaler open_interactions — meme predicat de statut ouvert';
  SELECT count(*) INTO v_n
  FROM jsonb_array_elements(v_crm->'open_by_age') d WHERE (d->>'count')::int = 0;
  ASSERT v_n > 0,
         'F3 (non vacuite) : au moins une tranche doit etre VIDE sur le corpus, sinon F1 ne prouve pas qu une tranche vide est EMISE plutot qu OMISE — si le corpus change, fabriquer le cas plutot que retirer F1';

  -- Sujets : le libelle n'est JAMAIS nul, meme quand la demande n'a pas de sujet.
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_crm->'open_by_topic') d
                     WHERE NULLIF(d->>'name','') IS NULL),
         'F4 : open_by_topic porte toujours un libelle affichable — une demande sans sujet est regroupee sous un nom explicite, jamais sous une case vide';
  ASSERT COALESCE((SELECT sum((d->>'count')::int)
                   FROM jsonb_array_elements(v_crm->'open_by_topic') d), 0) = v_open,
         'F5 : la somme par sujet doit egaler open_interactions — aucune demande ouverte n est perdue par la jointure sur le referentiel';
  ASSERT COALESCE((SELECT bool_and(prev >= cur) FROM (
            SELECT lag((d->>'count')::int) OVER (ORDER BY ord) AS prev, (d->>'count')::int AS cur
            FROM jsonb_array_elements(v_crm->'open_by_topic') WITH ORDINALITY AS t(d, ord)) z
          WHERE prev IS NOT NULL), TRUE),
         'F6 : open_by_topic est trie par count DESC';

  -- ═══ (H) DOUZE MOIS, TOUJOURS ═══
  SELECT jsonb_array_length(v_crm->'monthly_flow') INTO v_n;
  ASSERT v_n = 12, format('H1 : monthly_flow doit porter exactement 12 mois ; obtenu %s', v_n);
  ASSERT (v_crm->'monthly_flow'->11->>'month')::date = date_trunc('month', current_date)::date,
         format('H2 : le dernier mois est le mois COURANT ; obtenu %s', v_crm->'monthly_flow'->11->>'month');
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_crm->'monthly_flow') d
                     WHERE d->>'created' IS NULL OR d->>'resolved' IS NULL),
         'H3 : un mois sans mouvement porte 0, jamais null — la courbe ne doit pas trouer';

  -- ═══════════════════ FIXTURE (superuser, RLS bypass) ═══════════════════
  SELECT ci.actor_id INTO v_actor FROM crm_interaction ci WHERE ci.actor_id IS NOT NULL LIMIT 1;

  INSERT INTO auth.users (id, email) VALUES (v_user, 'dashboard_activity@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name)
    VALUES (v_user, 'tourism_agent', 'Agent activite 12xx')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

  -- Dix objets porteurs, dans la plage de fixtures dediee.
  FOR v_i IN 1..10 LOOP
    INSERT INTO object (id, object_type, name, status)
    VALUES ('HOTRUN99999912' || lpad(v_i::text, 2, '0'), 'HOT', 'Objet activite 12xx n' || v_i, 'draft')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
  v_obj := 'HOTRUN9999991201';

  -- Fresh-apply : rend E1 explicitement non vacant sans dépendre d'une seed appliquée après
  -- les migrations. Sur une base vivante déjà peuplée, le contrôle initial suffit.
  IF v_open = 0 THEN
    INSERT INTO crm_interaction
      (id, object_id, interaction_type, direction, status, body, occurred_at)
    VALUES
      (v_id_open, v_obj, 'email', 'inbound', 'new', 'Temoin fresh-apply invariant carte', NOW());
    v_card    := api.get_dashboard_crm_open();
    v_open    := (v_card->>'open_interactions')::int;
    v_recent  := (v_card->>'recent_interactions')::int;
    v_backlog := (v_card->>'backlog_interactions')::int;
    ASSERT v_open = 1 AND v_recent + v_backlog = v_open,
           format('E2 (temoin fresh-apply) : recent (%s) + arriere (%s) doit egaler 1 demande ouverte ; obtenu open=%s',
                  v_recent, v_backlog, v_open);
  END IF;

  -- ═══ (C) UNE VERSION SANS AUTEUR NE COMPTE PAS ═══
  -- 57,5 % du corpus est dans ce cas (imports/système). Si elle comptait, le « rythme de
  -- saisie de l'équipe » mesurerait surtout les imports.
  v_before := api.get_dashboard_team_activity();
  INSERT INTO object_version (object_id, version_number, data, created_at, created_by, change_type)
  VALUES ('HOTRUN9999991201', 900, '{}'::jsonb, now(), NULL, 'update');
  v_after := api.get_dashboard_team_activity();
  ASSERT v_after->'weeks' = v_before->'weeks',
         'C1 : une version created_by NULL ne doit RIEN changer aux semaines (imports et systeme hors du rythme d equipe)';
  ASSERT v_after->'contributors' = v_before->'contributors',
         'C2 : une version created_by NULL ne doit creer AUCUN contributeur';

  -- ═══ (D) `bulk_days` BASCULE À DIX PILE ═══
  -- Deux journées fabriquées DANS la fenêtre : 9 objets (sous le seuil) puis 10 (au seuil).
  -- La distribution réelle étant bimodale (≤ 9 vs ≥ 58), aucune donnée vive n'éprouve la
  -- bascule ; c'est le seul endroit où elle est prouvée.
  v_day_a := (date_trunc('week', current_date) - interval '2 weeks')::date + 1;
  v_day_b := (date_trunc('week', current_date) - interval '2 weeks')::date + 2;

  FOR v_i IN 1..9 LOOP    -- journée A : NEUF objets ⇒ PAS une journée de masse
    INSERT INTO object_version (object_id, version_number, data, created_at, created_by, change_type)
    VALUES ('HOTRUN99999912' || lpad(v_i::text, 2, '0'), 901, '{}'::jsonb,
            v_day_a::timestamptz + interval '10 hours', v_user, 'update');
  END LOOP;
  FOR v_i IN 1..10 LOOP   -- journée B : DIX objets ⇒ journée de masse
    INSERT INTO object_version (object_id, version_number, data, created_at, created_by, change_type)
    VALUES ('HOTRUN99999912' || lpad(v_i::text, 2, '0'), 902, '{}'::jsonb,
            v_day_b::timestamptz + interval '10 hours', v_user, 'update');
  END LOOP;

  v_team := api.get_dashboard_team_activity();
  SELECT (d->>'active_days')::int, (d->>'bulk_days')::int, (d->>'objects_touched')::int, d->>'display_name'
    INTO v_n, v_cnt, v_rows, v_user_lbl
  FROM jsonb_array_elements(v_team->'contributors') d
  WHERE (d->>'user_id')::uuid = v_user;

  ASSERT v_n = 2,    format('D1 : deux journees fabriquees ⇒ active_days = 2 ; obtenu %s', v_n);
  ASSERT v_cnt = 1,  format('D2 : NEUF objets dans la journee ne font PAS une journee de masse, DIX oui ⇒ bulk_days = 1 ; obtenu %s — si vous obtenez 2, le seuil est a 9 ; si 0, il est au-dessus de 10', v_cnt);
  ASSERT v_rows = 10, format('D3 : objets_touches = 10 objets DISTINCTS (et non 19 versions) ; obtenu %s', v_rows);

  -- (I-a) le libellé vient de la source unique, pas d'une seconde formule.
  ASSERT v_user_lbl = api.crm_user_label(v_user, 'Agent activite 12xx'),
         format('D4 : display_name doit venir de api.crm_user_label — source UNIQUE partagee avec le kanban CRM et le journal 17g ; obtenu %s', v_user_lbl);

  -- Tri : le contributeur le plus actif d'abord.
  ASSERT COALESCE((SELECT bool_and(prev >= cur) FROM (
            SELECT lag((d->>'active_days')::int) OVER (ORDER BY ord) AS prev, (d->>'active_days')::int AS cur
            FROM jsonb_array_elements(v_team->'contributors') WITH ORDINALITY AS t(d, ord)) z
          WHERE prev IS NOT NULL), TRUE),
         'D5 : contributors est trie par active_days DESC';

  -- ═══ (G) LE TEMPS NET, PAR LA RPC ═══
  -- Même cycle que le bloc (F) de test_crm_lifecycle : new(J0) → in_progress(J2) →
  -- awaiting_provider(J5) → in_progress(J12) → resolved(J14). 14 écoulés − 7 d'attente = 7.
  -- Décalages en HEURES : sur un timestamptz, « + interval '14 days' » traverse un changement
  -- d'heure là où il y en a et l'écoulé vaudrait 14 jours ± 1 h.
  --
  -- ⚠ Ce bloc est le SEUL à éprouver `net` : au 31/08 aucune demande vive ne porte
  --   d'événement de création (le journal ne date que d'aujourd'hui), donc la RPC rend
  --   {avg_days: null, count: 0} sur le corpus réel. Sans cette fixture, `net` ne serait
  --   gardé par RIEN.
  v_t0 := date_trunc('day', NOW()) - interval '720 hours';
  INSERT INTO crm_interaction (id, object_id, actor_id, interaction_type, direction, status, body, occurred_at)
  VALUES (v_id_cycle, v_obj, v_actor, 'email', 'inbound', 'new', 'Cycle simule 12xx pour le temps net', v_t0);
  UPDATE crm_interaction SET status = 'in_progress'       WHERE id = v_id_cycle;
  UPDATE crm_interaction SET status = 'awaiting_provider' WHERE id = v_id_cycle;
  UPDATE crm_interaction SET status = 'in_progress'       WHERE id = v_id_cycle;
  UPDATE crm_interaction SET status = 'resolved'          WHERE id = v_id_cycle;

  UPDATE crm_interaction_status_event SET changed_at = v_t0
   WHERE interaction_id = v_id_cycle AND from_status IS NULL AND to_status = 'new';
  GET DIAGNOSTICS v_rows = ROW_COUNT; ASSERT v_rows = 1, 'G0a : evenement ∅→new introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '48 hours'
   WHERE interaction_id = v_id_cycle AND from_status = 'new' AND to_status = 'in_progress';
  GET DIAGNOSTICS v_rows = ROW_COUNT; ASSERT v_rows = 1, 'G0b : evenement new→in_progress introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '120 hours'
   WHERE interaction_id = v_id_cycle AND from_status = 'in_progress' AND to_status = 'awaiting_provider';
  GET DIAGNOSTICS v_rows = ROW_COUNT; ASSERT v_rows = 1, 'G0c : evenement in_progress→awaiting_provider introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '288 hours'
   WHERE interaction_id = v_id_cycle AND from_status = 'awaiting_provider' AND to_status = 'in_progress';
  GET DIAGNOSTICS v_rows = ROW_COUNT; ASSERT v_rows = 1, 'G0d : evenement awaiting_provider→in_progress introuvable ou duplique';
  UPDATE crm_interaction_status_event SET changed_at = v_t0 + interval '336 hours'
   WHERE interaction_id = v_id_cycle AND from_status = 'in_progress' AND to_status = 'resolved';
  GET DIAGNOSTICS v_rows = ROW_COUNT; ASSERT v_rows = 1, 'G0e : evenement in_progress→resolved introuvable ou duplique';

  UPDATE crm_interaction
     SET occurred_at = v_t0, resolved_at = v_t0 + interval '336 hours'
   WHERE id = v_id_cycle;

  v_crm := api.get_dashboard_crm_activity();
  v_net := (v_crm->'net'->>'avg_days')::numeric;
  v_cnt := (v_crm->'net'->>'count')::int;
  ASSERT v_cnt >= 1,
         format('G1 : le cycle fabrique doit entrer dans le calcul du temps net ; count = %s', v_cnt);
  ASSERT v_net IS NOT NULL, 'G2 : avg_days doit etre calculable des qu une demande a boucle son cycle';
  ASSERT abs(v_net - 7) < 0.01,
         format('G3 : 14 jours ecoules moins 7 jours d attente prestataire = 7 jours NETS ; obtenu %s — 14 signifie que l attente prestataire n est PAS deduite', v_net);

  -- Non-vacuité de G3 : sans la déduction le calcul rendrait 14. On relit l'écoulé BRUT sur
  -- la ligne (et non une tautologie sur les intervalles fabriqués ci-dessus).
  SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0 INTO v_net
  FROM crm_interaction ci WHERE ci.id = v_id_cycle;
  ASSERT abs(v_net - 14) < 0.01,
         format('G4 (premisse) : l ecoule BRUT du temoin doit valoir 14 jours pour que G3 mesure une DEDUCTION reelle ; obtenu %s', v_net);

  -- `canceled` est EXCLU de la moyenne (arbitrage plan n°3) : une demande annulee n a pas
  -- ete « traitee », son delai ne dit rien du travail de l equipe.
  UPDATE crm_interaction SET status = 'canceled' WHERE id = v_id_cycle;
  v_crm := api.get_dashboard_crm_activity();
  ASSERT (v_crm->'net'->>'count')::int = v_cnt - 1,
         format('G5 : passer le temoin a « annulee » doit le RETIRER de la moyenne (%s attendu, %s obtenu)',
                v_cnt - 1, (v_crm->'net'->>'count')::int);

  -- ═══════════════════ (I) §204 ═══════════════════
  ASSERT NOT (has_function_privilege('anon',   'api.get_dashboard_team_activity()', 'EXECUTE')
           OR has_function_privilege('public', 'api.get_dashboard_team_activity()', 'EXECUTE')),
         'I1 : EXECUTE doit etre revoque de PUBLIC et anon sur get_dashboard_team_activity (§204)';
  ASSERT NOT (has_function_privilege('anon',   'api.get_dashboard_crm_activity()', 'EXECUTE')
           OR has_function_privilege('public', 'api.get_dashboard_crm_activity()', 'EXECUTE')),
         'I2 : EXECUTE doit etre revoque de PUBLIC et anon sur get_dashboard_crm_activity (§204)';
  ASSERT has_function_privilege('authenticated', 'api.get_dashboard_team_activity()', 'EXECUTE')
     AND has_function_privilege('service_role',  'api.get_dashboard_team_activity()', 'EXECUTE'),
         'I3 : authenticated et service_role doivent pouvoir executer get_dashboard_team_activity';
  ASSERT has_function_privilege('authenticated', 'api.get_dashboard_crm_activity()', 'EXECUTE')
     AND has_function_privilege('service_role',  'api.get_dashboard_crm_activity()', 'EXECUTE'),
         'I4 : authenticated et service_role doivent pouvoir executer get_dashboard_crm_activity';

  -- L'extension de la carte n'a pas rouvert la fonction au passage.
  ASSERT NOT (has_function_privilege('anon',   'api.get_dashboard_crm_open()', 'EXECUTE')
           OR has_function_privilege('public', 'api.get_dashboard_crm_open()', 'EXECUTE')),
         'I5 : l ajout des deux cles ne doit pas avoir rouvert get_dashboard_crm_open a PUBLIC/anon';

  -- Le prédicat canonique du cycle de vie (17g) survit à la réécriture de 17h : c'est LUI
  -- que le bloc (B3) de test_crm_lifecycle compare a l octet pres entre les deux corps.
  ASSERT position(
           E'  FROM crm_interaction\n  WHERE resolved_at IS NULL\n    AND status = ANY (ARRAY[''new'',''in_progress'',''awaiting_provider'']::crm_status[])'
           IN (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname='api' AND p.proname='get_dashboard_crm_open')) > 0,
         'I6 : 17h reecrit get_dashboard_crm_open — le bloc de predicat canonique de 17g doit y survivre MOT POUR MOT, sinon le bloc (B3b) de test_crm_lifecycle rougit';

  RAISE NOTICE 'test_dashboard_activity: OK (A contrats / B 12 semaines dont une VIDE a zero partout / C created_by NULL ignore / D bulk_days bascule a 10 pile / E recent+arriere=ouvertes / F 4 tranches d age meme vides + sujets totalisants / G temps net = 14 ecoules - 7 attente = 7, canceled exclu / H 12 mois / I §204 + predicat 17g preserve).';
END$$;
ROLLBACK;
