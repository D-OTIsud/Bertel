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
--   (E) VÉRIFICATEURS — api.list_object_verifier_ids(p_object_id) : les membres actifs d'une
--       ORG publisher de l'objet dont le rôle métier confère validate_changes (matrice 17i) OU
--       qui tiennent le grant individuel sont vérificateurs ; un viewer sans droit ne l'est PAS ;
--       un rang admin (user_org_admin_role) N'EST JAMAIS vérificateur, même en repli — FAIT
--       vérifié en base : user_has_permission (donc user_can_moderate_object) ignore cette
--       table ; repli = superutilisateurs plateforme UNIQUEMENT, sinon liste VIDE. Invariant
--       sondé en boucle : tout id rendu doit satisfaire user_can_moderate_object (nominal ET
--       repli) — c'est cette boucle qui aurait attrapé le défaut du repli par rang admin.
--   (H) VISIBILITÉ — api.get_portal_section_visibility / api.get_actor_section_visibility : le
--       plancher dur (legal…) est toujours annoncé ; sans ligne en base, un module est visible
--       par défaut (jamais NULL) ; hors portée ⇒ 42501 ; get_actor_section_visibility refuse un
--       non-membre de l'ORG même s'il est légitimement scopé côté portail ; l'écriture
--       (rpc_set_actor_section_visibility) exige un rang admin >= 30 sur l'ORG et refuse
--       TOUJOURS le plancher dur — dans les DEUX sens (ouvrir ET fermer), sans jamais y laisser
--       de ligne ; le masquage configuré par l'ORG remonte bien côté vue portail.
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
  -- (E/H) comptes DÉDIÉS Task 4 — sous-plage …001303-…001307, disjointe de 1301-1302 (A) et
  -- 1391-1393 (C). Aucun nouvel objet/acteur : E et H réutilisent v_orgA/v_objA/v_objD (B).
  v_editor  uuid := '00000000-0000-4000-a000-000000001303'; -- rôle métier editor (matrice)
  v_viewer  uuid := '00000000-0000-4000-a000-000000001304'; -- viewer sans permission
  v_granted uuid := '00000000-0000-4000-a000-000000001305'; -- grant individuel validate_changes
  v_orgadm  uuid := '00000000-0000-4000-a000-000000001306'; -- rang admin SANS validate_changes — n'est JAMAIS vérificateur (ruling post-revue)
  v_super   uuid := '00000000-0000-4000-a000-000000001307'; -- superuser plateforme — SEULE population de repli retenue
  v_role_editor uuid;
  v_role_viewer uuid;
  v_perm_validate uuid;
  v_adm_role uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid;
  v_vis jsonb;
  v_verifier_id    uuid;    -- (E) itérateur de l'invariant user_can_moderate_object
  v_verifier_count integer; -- (E) cardinalité exacte attendue à chaque étape (discriminant)
  v_floor_mod      text;    -- (H) itérateur sur les 9 modules du plancher dur
  v_real_super_count integer; -- (E) superusers RÉELS déjà en base (repli non scopé — jamais 0 en prod)
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

  -- ---------- Fixture équipe éditrice (owner, RLS bypass) ----------
  -- RESET ROLE (D1) restaure le rôle Postgres mais PAS le GUC request.jwt.claims (résidu
  -- 'authenticated' de la dernière sonde v_user) : sans ce nettoyage,
  -- enforce_app_user_profile_role_change rejette les INSERT INTO auth.users qui suivent
  -- (le trigger handle_auth_user_profile_created qu'ils déclenchent confondrait le contexte
  -- privilégié courant avec une session authenticated résiduelle). Même geste que (A) et (C).
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT id INTO v_perm_validate FROM ref_permission WHERE code='validate_changes' LIMIT 1;
  IF v_perm_validate IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[validate_changes] manquant'; END IF;
  SELECT id INTO v_role_editor FROM ref_org_business_role WHERE code='editor' LIMIT 1;
  SELECT id INTO v_role_viewer FROM ref_org_business_role WHERE code='viewer' LIMIT 1;
  IF v_role_editor IS NULL OR v_role_viewer IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_business_role manquant'; END IF;
  SELECT id INTO v_adm_role FROM ref_org_admin_role WHERE rank >= 30 LIMIT 1;
  IF v_adm_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_admin_role rang>=30 manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_editor, 'portal_editor_1303@test.local'), (v_viewer, 'portal_viewer_1304@test.local'),
    (v_granted, 'portal_granted_1305@test.local'), (v_orgadm, 'portal_orgadm_1306@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_editor, 'tourism_agent'), (v_viewer, 'tourism_agent'),
    (v_granted, 'tourism_agent'), (v_orgadm, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (id, user_id, org_object_id, is_active) VALUES
    (gen_random_uuid(), v_editor, v_orgA, TRUE),
    (gen_random_uuid(), v_viewer, v_orgA, TRUE),
    (gen_random_uuid(), v_granted, v_orgA, TRUE),
    (gen_random_uuid(), v_orgadm, v_orgA, TRUE)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_m1 FROM user_org_membership WHERE user_id=v_editor AND org_object_id=v_orgA;
  SELECT id INTO v_m2 FROM user_org_membership WHERE user_id=v_viewer AND org_object_id=v_orgA;
  SELECT id INTO v_m3 FROM user_org_membership WHERE user_id=v_granted AND org_object_id=v_orgA;
  SELECT id INTO v_m4 FROM user_org_membership WHERE user_id=v_orgadm AND org_object_id=v_orgA;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES
    (v_m1, v_role_editor, TRUE), (v_m2, v_role_viewer, TRUE), (v_m3, v_role_viewer, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES (v_m4, v_adm_role, TRUE)
    ON CONFLICT DO NOTHING;
  -- La matrice 17i : le rôle editor de CETTE ORG confère validate_changes.
  INSERT INTO org_role_permission (org_object_id, role_id, permission_id, is_active) VALUES
    (v_orgA, v_role_editor, v_perm_validate, TRUE)
    ON CONFLICT (org_object_id, role_id, permission_id) DO UPDATE SET is_active = TRUE;
  -- Le grant individuel (exception).
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES
    (v_granted, v_perm_validate, TRUE)
    ON CONFLICT (user_id, permission_id) DO UPDATE SET is_active = TRUE;

  -- ---------- (E) list_object_verifier_ids ----------
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_editor),
         'E: le rôle métier editor (matrice 17i) est vérificateur';
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_granted),
         'E: le grant individuel validate_changes est vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_viewer),
         'E: un viewer sans permission n''est PAS vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: un rang admin SANS validate_changes n''est jamais vérificateur (user_has_permission ignore user_org_admin_role)';
  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = 2, 'E: branche primaire — exactement editor + granted, aucun tiers';

  -- Invariant réel de la fonction (constat contrôleur, post-revue Task 4) : TOUT id rendu
  -- par list_object_verifier_ids DOIT satisfaire user_can_moderate_object sur CET objet —
  -- sinon la tâche « Vérifier » assignée mène à un 42501 au clic « Approuver », fiche
  -- bloquée à vie (uq_fiche_submission_open n'autorise qu'une soumission ouverte). Sondé
  -- EN BOUCLE sur ce que la fonction rend réellement, pas sur une liste anticipée à la
  -- main : une population plausible mais fausse (ex. les rangs admin seuls, l'ancien
  -- repli) doit mordre ici.
  FOR v_verifier_id IN SELECT s FROM api.list_object_verifier_ids(v_objA) s LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_verifier_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.user_can_moderate_object(v_objA) = TRUE,
             format('E: invariant — %s (rendu par list_object_verifier_ids) doit satisfaire user_can_moderate_object', v_verifier_id);
    RESET ROLE;
  END LOOP;

  -- Repli : on éteint la matrice et le grant. FAIT vérifié en base par le contrôleur —
  -- api.user_has_permission() (donc user_can_moderate_object, donc le bouton Approuver)
  -- ne regarde QUE user_permission et user_org_business_role × org_role_permission ;
  -- user_org_admin_role n'y intervient JAMAIS. Le repli rend donc les superutilisateurs
  -- plateforme UNIQUEMENT (jamais les rangs admin) — la soumission n'échoue pas pour
  -- autant si ce groupe est vide (spec §7), juste assignee_count=0 côté appelant.
  -- Non scopé par construction (le ruling le veut ainsi) : n'assume PAS 0 superuser —
  -- une base réelle porte quasi toujours au moins le compte owner/super_admin fondateur.
  -- On capture donc le baseline RÉEL et on compare la fonction à CE baseline, jamais à
  -- une constante — sans jamais toucher aux comptes superuser existants.
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE org_role_permission SET is_active = FALSE
   WHERE org_object_id = v_orgA AND permission_id = v_perm_validate;
  UPDATE user_permission SET is_active = FALSE
   WHERE user_id = v_granted AND permission_id = v_perm_validate;
  SELECT count(*) INTO v_real_super_count FROM app_user_profile WHERE role IN ('owner','super_admin');

  -- L'invariant D'ABORD, avant toute assertion de forme (count/EXISTS) : c'est LUI qui
  -- doit mordre contre l'ANCIEN repli par rang admin (v_orgadm y satisferait FALSE, pas
  -- TRUE, sur user_can_moderate_object) — rejoué ici contre le NOUVEAU repli (baseline
  -- réel, superusers existants inclus, mais jamais v_orgadm).
  FOR v_verifier_id IN SELECT s FROM api.list_object_verifier_ids(v_objA) s LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_verifier_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.user_can_moderate_object(v_objA) = TRUE,
             format('E: invariant (repli, avant v_super) — %s doit satisfaire user_can_moderate_object', v_verifier_id);
    RESET ROLE;
  END LOOP;

  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = v_real_super_count,
         'E: sans validate_changes actif, le repli rend EXACTEMENT les superusers réels — rien de plus (jamais les rangs admin)';
  -- Sous-ensemble STRICT : tout id rendu par le repli EST un superuser réel — la sonde la
  -- plus directe contre une population « plausible mais fausse » (ex. l'ancien admin-rang) :
  -- si un SEUL id étranger s'y glissait, ce EXCEPT ne serait pas vide.
  ASSERT NOT EXISTS (
    SELECT s FROM api.list_object_verifier_ids(v_objA) s
    EXCEPT
    SELECT id FROM app_user_profile WHERE role IN ('owner','super_admin')
  ), 'E: repli — chaque id rendu est un superuser réel, aucun intrus (ex. rang admin)';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: le rang admin reste exclu même en repli';

  -- Le superutilisateur plateforme : SEULE population de repli retenue par le ruling — il
  -- satisfait user_can_moderate_object ET is_object_owner inconditionnellement, via leur
  -- bras commun is_platform_superuser(), aucun autre bras ne peut donc échouer derrière.
  -- v_super s'AJOUTE au baseline réel — jamais de mutation d'un compte existant.
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO auth.users (id, email) VALUES (v_super, 'portal_super_1307@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super, 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Invariant à nouveau, cas repli PEUPLÉ cette fois : le superuser rendu doit lui aussi
  -- satisfaire user_can_moderate_object.
  FOR v_verifier_id IN SELECT s FROM api.list_object_verifier_ids(v_objA) s LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_verifier_id, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      ASSERT api.user_can_moderate_object(v_objA) = TRUE,
             format('E: invariant (repli, avec v_super) — %s doit satisfaire user_can_moderate_object', v_verifier_id);
    RESET ROLE;
  END LOOP;

  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = v_real_super_count + 1,
         'E: repli — le baseline réel PLUS v_super, rien d''autre';
  ASSERT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_super),
         'E: repli — un superutilisateur plateforme actif EST vérificateur';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_orgadm),
         'E: repli actif — le rang admin reste exclu (le superuser seul qualifie)';

  -- Restauration pour les blocs suivants : la branche primaire reprend la main et reste
  -- PRIORITAIRE — elle ne fusionne PAS avec le repli : le superuser, bien que toujours
  -- superuser, disparaît de la liste dès qu'un vérificateur primaire existe.
  UPDATE org_role_permission SET is_active = TRUE
   WHERE org_object_id = v_orgA AND permission_id = v_perm_validate;
  UPDATE user_permission SET is_active = TRUE
   WHERE user_id = v_granted AND permission_id = v_perm_validate;
  SELECT count(*) INTO v_verifier_count FROM api.list_object_verifier_ids(v_objA);
  ASSERT v_verifier_count = 2,
         'E: la branche primaire restaurée reste prioritaire — exactement editor + granted';
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_object_verifier_ids(v_objA) s WHERE s = v_super),
         'E: le superuser ne s''ajoute PAS à une branche primaire non vide (pas de fusion)';

  -- ---------- (H) visibilité : défauts, plancher, écriture gated ----------
  -- Défaut ouvert : sans ligne, seul le plancher masque.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_portal_section_visibility(v_objA);
    ASSERT (v_vis->'floor_modules') ? 'legal',
           'H: le plancher dur contient legal (§18)';
    ASSERT NOT ((v_vis->'masked_modules') ? 'descriptions'),
           'H: sans config, descriptions est visible (défaut ouvert)';
    -- Hors portée ⇒ refus.
    v_denied := false;
    BEGIN PERFORM api.get_portal_section_visibility(v_objD);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: get_portal_section_visibility hors portée doit lever 42501';
    -- Extension (au-delà du verbatim brief) : get_actor_section_visibility (écran /settings)
    -- est une SECONDE fonction, avec sa PROPRE garde d'appartenance — jamais exercée si l'on ne
    -- teste que la variante portail. Une persona acteur scopée sur v_objA mais SANS membership
    -- dans v_orgA doit être refusée ici aussi : les deux gardes sont indépendantes.
    v_denied := false;
    BEGIN PERFORM api.get_actor_section_visibility(v_orgA, 'HOT');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: get_actor_section_visibility refuse un non-membre de l''ORG (même persona acteur scopée)';
  RESET ROLE;
  -- La variante /settings s'ouvre à un membre ACTIF de l'ORG (ici v_editor) — même plancher,
  -- même défaut ouvert, vérifiés AVANT toute config (symétrique à la vérification portail).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_actor_section_visibility(v_orgA, 'HOT');
    ASSERT (v_vis->'floor_modules') ? 'legal',
           'H: get_actor_section_visibility porte aussi le plancher dur';
    ASSERT NOT ((v_vis->'masked_modules') ? 'descriptions'),
           'H: get_actor_section_visibility — défaut ouvert avant toute config';
  RESET ROLE;
  -- Écriture : rang ≥ 30 requis ; plancher refusé.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_editor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'descriptions', FALSE);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    ASSERT v_denied, 'H: un éditeur sans rang >= 30 ne règle pas la matrice';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_orgadm, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', 'descriptions', FALSE);
    -- Le plancher dur est INTÉGRALEMENT non paramétrable — boucle sur les 9 entrées de
    -- api.actor_portal_floor_modules(), dans les DEUX sens, pas seulement 'legal' : un
    -- sondage à un seul module ne mordrait pas si un AUTRE module du tableau littéral
    -- perdait sa garde. SQLSTATE 22023 explicite (pas WHEN others) : un plantage pour
    -- une tout autre raison ne doit pas passer pour une preuve du plancher.
    FOR v_floor_mod IN SELECT unnest(api.actor_portal_floor_modules()) LOOP
      v_denied := false;
      BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', v_floor_mod, TRUE);
      EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
      ASSERT v_denied, format('H: plancher %s refuse l''ouverture (22023)', v_floor_mod);

      v_denied := false;
      BEGIN PERFORM api.rpc_set_actor_section_visibility(v_orgA, 'HOT', v_floor_mod, FALSE);
      EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
      ASSERT v_denied, format('H: plancher %s refuse la fermeture explicite (22023)', v_floor_mod);
    END LOOP;
  RESET ROLE;
  -- Aucune des tentatives n'a laissé de ligne résiduelle, pour AUCUN des 9 modules du
  -- plancher — l'exclusion vient uniquement de la fonction (4.1), jamais de la table.
  FOR v_floor_mod IN SELECT unnest(api.actor_portal_floor_modules()) LOOP
    ASSERT NOT EXISTS (
      SELECT 1 FROM org_actor_module_visibility
      WHERE org_object_id = v_orgA AND object_type = 'HOT' AND module_id = v_floor_mod
    ), format('H: aucune ligne matrice pour le module plancher %s', v_floor_mod);
  END LOOP;
  -- Le masquage configuré remonte côté portail.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_vis := api.get_portal_section_visibility(v_objA);
    ASSERT (v_vis->'masked_modules') ? 'descriptions',
           'H: le masquage org×type configuré remonte dans la vue portail';
  RESET ROLE;

  RAISE NOTICE 'test_actor_portal blocs A-D1, E, H OK';
END$$;
ROLLBACK;
