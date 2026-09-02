-- test_actor_portal.sql
-- Prouve migration_actor_portal.sql (manifeste 18a, spec 2026-09-01-portail-acteur-design.md) :
--   (A) PERSONA — le CHECK app_user_profile.role accepte 'actor' (et garde NULL + les 3 valeurs
--       historiques) ; api.is_actor_persona() rend TRUE pour un profil 'actor', FALSE pour un
--       tourism_agent, FALSE hors contexte HTTP (COALESCE §204) ; api.current_user_actor_id()
--       rend l'actor_id du profil, NULL sinon.
--   (B) PORTÉE — api.current_user_portal_object_ids() : lien valide ⇒ objet présent ; lien
--       expiré (valid_to hier) ⇒ absent ; lien futur (valid_from demain) ⇒ absent ; objet ORG
--       ⇒ absent ; et SURTOUT le pont e-mail ne joue PAS (un acteur persona dont l'e-mail
--       matche un AUTRE acteur ne voit pas les objets de cet autre acteur). Pour la persona
--       acteur, current_user_extended_object_ids() ≡ portal_object_ids (bras 1b fermé : le
--       rôle d'acteur sur une ORG ne donne PLUS les fiches de l'ORG). Pour un tourism_agent,
--       les 5 bras historiques sont inchangés (régression bloc I, Task 8).
--   (C) D7 — api.is_object_owner(p_object_id) : un lien actor_object_role.is_primary=TRUE ne
--       donne JAMAIS l'écriture canonique à une persona acteur (ni user_can_write_object_canonical,
--       qui en dérive) ; le chemin owner HISTORIQUE reste ouvert pour un non-acteur (tourism_agent)
--       dont l'e-mail matche un lien primaire — D7 ferme seulement la persona acteur, pas le reste.
--   (D1) DDL — fiche_submission, pending_change.submission_id et org_actor_module_visibility
--       existent ; chk_app_notification_kind admet 'fiche_submission_reviewed' ; l'index unique
--       partiel anti-doublon (uq_fiche_submission_open) existe ; et la RLS/REVOKE ferme les DEUX
--       tables sensibles à TOUT authenticated, en lecture ET en écriture, persona acteur comme
--       persona éditeur — pas seulement « la table existe ».
-- Blocs suivants ajoutés par les tasks suivantes du même chantier.
-- Contre une base sans la migration : échec immédiat (fonctions absentes) — rouge attendu (TDD).
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste). Plage de fixtures dédiée 13xx.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA    text := 'ORGRUN9999991301';
  v_objA    text := 'HOTRUN9999991311'; -- lien acteur valide
  v_objB    text := 'HOTRUN9999991312'; -- lien expiré
  v_objC    text := 'HOTRUN9999991313'; -- lien futur
  v_objD    text := 'HOTRUN9999991314'; -- fiche de l'ORG (bras 1b) — ne doit PAS être visible
  v_actor1  uuid := '00000000-0000-4000-a000-000000001321'; -- l'acteur du portail
  v_actor2  uuid := '00000000-0000-4000-a000-000000001322'; -- un AUTRE acteur (piège e-mail)
  v_user    uuid := '00000000-0000-4000-a000-000000001301'; -- compte portail (role actor)
  v_agent   uuid := '00000000-0000-4000-a000-000000001302'; -- témoin tourism_agent
  v_objE    text := 'HOTRUN9999991391'; -- (C) objet DÉDIÉ D7, hors piège e-mail du bloc B
  v_actor3  uuid := '00000000-0000-4000-a000-000000001392'; -- (C) acteur DÉDIÉ D7, détient v_objE
  v_user2   uuid := '00000000-0000-4000-a000-000000001393'; -- (C) compte portail DÉDIÉ D7 (persona actor)
  v_role_op uuid;
  v_pub     uuid;
  v_email_kind uuid;
  v_denied  boolean; -- (D1) sonde REVOKE/RLS : TRUE si insufficient_privilege a bien été levée.
BEGIN
  -- ---------- (A) CHECK + helpers ----------
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'portal_actor_1301@test.local'), (v_agent, 'portal_agent_1302@test.local')
    ON CONFLICT (id) DO NOTHING;
  -- Le CHECK doit accepter 'actor' — c'est le cœur de la migration : rouge avant elle.
  INSERT INTO app_user_profile (id, role) VALUES (v_user, 'actor')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO app_user_profile (id, role) VALUES (v_agent, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- Fixture objets / acteurs / liens (owner, RLS bypass) ----------
  SELECT id INTO v_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_role_op FROM ref_actor_role WHERE code = 'operator' LIMIT 1;
  IF v_role_op IS NULL THEN RAISE EXCEPTION 'fixture: ref_actor_role[operator] manquant'; END IF;
  SELECT id INTO v_email_kind FROM ref_code_contact_kind WHERE code = 'email' LIMIT 1;
  IF v_email_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_contact_kind[email] manquant'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG portail test', 'published'),
    (v_objA, 'HOT', 'Hôtel lien valide', 'draft'),
    (v_objB, 'HOT', 'Hôtel lien expiré', 'published'),
    (v_objC, 'HOT', 'Hôtel lien futur', 'published'),
    (v_objD, 'HOT', 'Hôtel de l''ORG', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub), (v_objB, v_orgA, v_pub), (v_objC, v_orgA, v_pub), (v_objD, v_orgA, v_pub)
    ON CONFLICT DO NOTHING;

  INSERT INTO actor (id, display_name) VALUES
    (v_actor1, 'Acteur Portail 1301'), (v_actor2, 'Acteur Piège 1302')
    ON CONFLICT (id) DO NOTHING;
  -- Piège du pont e-mail : l'e-mail du COMPTE portail est enregistré comme canal de
  -- l'AUTRE acteur. Sous le pont historique (user_actor_ids), ce compte verrait les
  -- objets de v_actor2 ; sous la portée portail (actor_id explicite), il ne doit PAS.
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor2, v_email_kind, 'portal_actor_1301@test.local')
    ON CONFLICT DO NOTHING;

  -- Le lien explicite compte↔acteur (la source de vérité du portail).
  UPDATE app_user_profile SET actor_id = v_actor1 WHERE id = v_user;

  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to) VALUES
    (v_actor1, v_objA, v_role_op, TRUE,  NULL,                        NULL),
    (v_actor1, v_objB, v_role_op, FALSE, NULL,                        CURRENT_DATE - 1),
    (v_actor1, v_objC, v_role_op, FALSE, CURRENT_DATE + 1,            NULL),
    (v_actor1, v_orgA, v_role_op, FALSE, NULL,                        NULL), -- rôle sur l'ORG (bras 1b)
    (v_actor2, v_objD, v_role_op, TRUE,  NULL,                        NULL)  -- objet de l'acteur piège
    ON CONFLICT DO NOTHING;

  -- ---------- (A) suite : helpers sous la persona acteur ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_actor_persona() = TRUE,  'A: is_actor_persona doit être TRUE pour role=actor';
    ASSERT api.current_user_actor_id() = v_actor1, 'A: current_user_actor_id doit rendre l''actor_id du profil';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_actor_persona() = FALSE, 'A: is_actor_persona doit être FALSE pour un tourism_agent';
    ASSERT api.current_user_actor_id() IS NULL, 'A: current_user_actor_id NULL sans lien';
  RESET ROLE;

  -- Hors contexte HTTP : fail-closed, jamais NULL (§204).
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT api.is_actor_persona() = FALSE, 'A: is_actor_persona hors HTTP doit être FALSE (COALESCE)';

  -- ---------- (B) portée portail ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objA),
           'B: lien valide ⇒ objet dans la portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objB),
           'B: lien EXPIRÉ ⇒ hors portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objC),
           'B: lien FUTUR ⇒ hors portée';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_orgA),
           'B: un objet ORG n''entre jamais dans la portée portail';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_portal_object_ids() s WHERE s = v_objD),
           'B: le pont e-mail ne joue PAS — l''objet de l''acteur homonyme d''e-mail est hors portée';
    -- Le branchement : pour la persona acteur, la fonction ÉTENDUE ≡ la portée portail.
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objD),
           'B: extended (persona acteur) ne doit PAS emprunter le pont e-mail';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objB),
           'B: extended (persona acteur) exclut les liens expirés';
    ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_objA),
           'B: extended (persona acteur) contient la fiche liée — y compris en DRAFT';
    -- La lecture RLS suit : la fiche draft liée est lisible, celle du piège non.
    ASSERT (SELECT count(*) FROM object WHERE id = v_objA) = 1,
           'B: la policy object laisse lire la fiche draft liée';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objD) = 0,
           'B: la policy object ne fuit pas la fiche draft de l''acteur piège';
  RESET ROLE;

  -- ---------- (C) D7 : lien primaire + persona acteur ⇒ AUCUNE écriture canonique ----------
  -- Fixture DÉDIÉE au bloc C (v_objE/v_actor3/v_user2, 1391-1393) — AUCUNE ligne des blocs A/B
  -- n'est modifiée (les blocs D..I s'appuient dessus, et le piège e-mail du bloc B est
  -- lui-même une assertion qui doit perdurer). Nécessaire : sous le fixture du bloc B, le pont
  -- e-mail (api.user_actor_ids) fait résoudre v_user vers v_actor2, PAS vers v_actor1 — donc
  -- is_object_owner(v_objA) pour v_user est déjà FALSE AVANT la §2, pour une raison étrangère
  -- à D7 (l'assertion ne « mordrait » pas — constaté empiriquement lors de la revue, corrigé
  -- ici ; cf. task-2-report.md § « Correction post-revue »). Ici l'e-mail du compte v_user2 est
  -- le canal DIRECT de SON PROPRE acteur v_actor3 (pas de piège) : le scénario réel que D7 doit
  -- fermer — persona acteur + is_primary=TRUE ⇒ TRUE avant la §2, FALSE après.
  -- RESET ROLE (bloc B) restaure le rôle Postgres mais PAS le GUC request.jwt.claims : sans ce
  -- nettoyage, le trigger enforce_app_user_profile_role_change confond ces INSERT (rôle
  -- privilégié) avec une session 'authenticated' résiduelle du dernier persona testé. Même
  -- geste que le cas « hors HTTP » du bloc A ci-dessus.
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO auth.users (id, email) VALUES (v_user2, 'portal_actor_1393@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_user2, 'actor')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES (v_objE, 'HOT', 'Hôtel D7 (bloc C)', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor (id, display_name) VALUES (v_actor3, 'Acteur D7 (bloc C)')
    ON CONFLICT (id) DO NOTHING;
  -- L'UPDATE référence v_actor3 (FK app_user_profile_actor_id_fkey) : DOIT suivre l'INSERT actor.
  UPDATE app_user_profile SET actor_id = v_actor3 WHERE id = v_user2;
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor3, v_email_kind, 'portal_actor_1393@test.local')
    ON CONFLICT DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary) VALUES
    (v_actor3, v_objE, v_role_op, TRUE)
    ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user2, 'role', 'authenticated', 'email', 'portal_actor_1393@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objE) = FALSE,
           'C: is_object_owner doit être FALSE pour une persona acteur titulaire d''un lien primaire (D7)';
    ASSERT api.user_can_write_object_canonical(v_objE) = FALSE,
           'C: user_can_write_object_canonical doit suivre (aucun autre bras ne s''ouvre)';
  RESET ROLE;

  -- Témoin de non-régression (renforcé, 2 objets, MÊME compte v_agent) : un tourism_agent
  -- dont l'e-mail de session bridge vers un acteur titulaire d'un lien primaire GARDE le
  -- chemin historique — D7 ne ferme QUE la persona acteur, jamais le mécanisme lui-même.
  -- Deux e-mails de session DISTINCTS pour le MÊME v_agent (le trigger
  -- prevent_duplicate_actor_email interdit qu'un seul e-mail bridge vers deux acteurs
  -- différents — constaté empiriquement) : le premier prouve sur v_objE, le MÊME objet que
  -- le refus ci-dessus (une fonction qui refuserait tout le monde échouerait ici) ; le second,
  -- l'e-mail RÉEL de v_agent (auth.users), prouve sur v_objA (bloc B) comme témoin historique.
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor3, v_email_kind, 'portal_agent_1302_objE@test.local')
    ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302_objE@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objE) = TRUE,
           'C: le chemin owner HISTORIQUE reste ouvert pour un non-acteur, même objet que le refus D7';
  RESET ROLE;

  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES
    (v_actor1, v_email_kind, 'portal_agent_1302@test.local')
    ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated', 'email', 'portal_agent_1302@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.is_object_owner(v_objA) = TRUE,
           'C: le chemin owner HISTORIQUE reste ouvert pour un non-acteur (équipes internes)';
  RESET ROLE;

  -- ---------- (D1) DDL : tables + contraintes clés ----------
  -- Aucune fixture nouvelle : réutilise v_agent/v_user (1301/1302) déjà déclarés — ce bloc
  -- teste la structure DDL/RLS, pas un contenu métier. Les valeurs 'zz-noop-d1' ci-dessous
  -- ne sont JAMAIS insérées (le REVOKE frappe avant toute vérification de contrainte FK/PK) :
  -- hors registre de fixtures, aucune réservation d'id n'est nécessaire.
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='fiche_submission'),
         'D1: la table fiche_submission doit exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='pending_change' AND column_name='submission_id'),
         'D1: pending_change.submission_id doit exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='org_actor_module_visibility'),
         'D1: la table org_actor_module_visibility doit exister';
  -- Le CHECK des notifications accepte la nouvelle espèce (fail-closed avant migration).
  ASSERT (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conname='chk_app_notification_kind') LIKE '%fiche_submission_reviewed%',
         'D1: chk_app_notification_kind doit inclure fiche_submission_reviewed';
  -- Une seule soumission ouverte par fiche (index partiel unique).
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uq_fiche_submission_open'),
         'D1: index unique partiel uq_fiche_submission_open manquant';
  -- RLS + REVOKE : un authenticated n'a même pas le SELECT sur la table (permission
  -- denied attendu, PAS « zéro ligne » — le REVOKE frappe avant la policy).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM count(*) FROM fiche_submission;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission doit être inaccessible en PostgREST direct (REVOKE)';
  RESET ROLE;

  -- ---------- (D1 suite) fermeture RLS EXHAUSTIVE ----------
  -- Le SELECT ci-dessus ne prouve qu'UNE table, EN LECTURE, pour LA persona éditeur : ça ne
  -- suffit pas à exclure une RLS ouverte en écriture, sur org_actor_module_visibility, ou
  -- pour la persona acteur. On répète les 4 sondes (2 tables × lecture/écriture) pour les
  -- 2 personas — un test qui ne vérifierait que la création des tables laisserait passer
  -- une RLS ouverte.
  -- Persona ÉDITEUR (v_agent, tourism_agent).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_agent, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN INSERT INTO fiche_submission (object_id) VALUES ('zz-noop-d1');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission non-inscriptible en direct (éditeur, REVOKE)';

    v_denied := false;
    BEGIN PERFORM count(*) FROM org_actor_module_visibility;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility illisible en direct (éditeur, REVOKE)';

    v_denied := false;
    BEGIN INSERT INTO org_actor_module_visibility (org_object_id, object_type, module_id)
      VALUES ('zz-noop-d1', 'HOT', 'descriptions');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility non-inscriptible en direct (éditeur, REVOKE)';
  RESET ROLE;

  -- Persona ACTEUR (v_user, role='actor') — les 4 mêmes sondes. La fermeture RLS/REVOKE ne
  -- dépend pas de la persona métier : ni l'acteur ni l'éditeur n'ont de voie directe.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'portal_actor_1301@test.local')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM count(*) FROM fiche_submission;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission illisible en direct (acteur, REVOKE)';

    v_denied := false;
    BEGIN INSERT INTO fiche_submission (object_id) VALUES ('zz-noop-d1');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: fiche_submission non-inscriptible en direct (acteur, REVOKE)';

    v_denied := false;
    BEGIN PERFORM count(*) FROM org_actor_module_visibility;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility illisible en direct (acteur, REVOKE)';

    v_denied := false;
    BEGIN INSERT INTO org_actor_module_visibility (org_object_id, object_type, module_id)
      VALUES ('zz-noop-d1', 'HOT', 'descriptions');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'D1: org_actor_module_visibility non-inscriptible en direct (acteur, REVOKE)';
  RESET ROLE;

  RAISE NOTICE 'test_actor_portal blocs A-D1 OK';
END$$;
ROLLBACK;
