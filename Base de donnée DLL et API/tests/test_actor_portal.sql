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
-- Blocs C..I ajoutés par les tasks suivantes du même chantier.
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
  v_role_op uuid;
  v_pub     uuid;
  v_email_kind uuid;
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

  RAISE NOTICE 'test_actor_portal blocs A-B OK';
END$$;
ROLLBACK;
