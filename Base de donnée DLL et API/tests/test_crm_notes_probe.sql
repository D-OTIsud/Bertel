-- test_crm_notes_probe.sql
-- Prouve migration_crm_notes_probe.sql (manifeste 17c, chantier 2026-08-28 n°1 sous-lot 1d) :
--   (A) EXPOSITION — la fonction existe, est `SECURITY DEFINER`, et `anon` n'a PAS l'EXECUTE
--       (§204 : PostgreSQL l'accorde à PUBLIC par défaut et un GRANT ciblé ne le retire pas).
--   (B) BRAS ADMIN — un membre portant un rôle d'administration d'ORG mais AUCUNE permission
--       `write_crm_notes` obtient TRUE. C'est le cas réel qui motive le chantier : 2 comptes de
--       production voyaient tout le CRM en « Lecture seule » alors que le serveur les acceptait.
--   (C) BRAS PERMISSION — un membre portant `write_crm_notes` sans rôle admin obtient TRUE.
--   (D) LECTEUR — un membre sans l'un ni l'autre obtient FALSE, et surtout **PAS NULL** : la
--       chaîne de `OR` passe par `auth.*()`, et sans le `COALESCE` la sonde serait à trois
--       valeurs — un `if (!canWrite)` deviendrait alors fail-OPEN (§204).
--   (E) HORS CONTEXTE HTTP — sans JWT, `auth.uid()` est NULL : la sonde doit rendre FALSE,
--       jamais NULL. C'est le cas psql/pooler/service_role, superuser compris.
--   (F) PARITÉ AVEC LE SERVEUR — pour chaque persona, la sonde d'interface dit la MÊME chose que
--       la garde d'écriture réelle `api.user_can_write_crm`. C'est CE bloc qui rougit si les deux
--       divergent à nouveau : sans lui, on ne testerait qu'une transcription de la règle.
--
-- Les personas s'établissent par `request.jwt.claims` + `SET LOCAL ROLE`, jamais par `SET ROLE`
-- seul : sans JWT, `auth.uid()` est NULL, le bras admin n'est JAMAIS emprunté et le test
-- n'asserte que du vide (§204).
--
-- Run AFTER the full manifest. Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Plage de fixtures dédiée 11xx.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org        text := 'ORGRUN9999991101';
  v_obj        text := 'HOTRUN9999991111';
  v_user_admin uuid := '00000000-0000-4000-a000-000000001101';  -- (B) rôle admin, AUCUNE permission
  v_user_perm  uuid := '00000000-0000-4000-a000-000000001102';  -- (C) write_crm_notes, PAS admin
  v_user_read  uuid := '00000000-0000-4000-a000-000000001103';  -- (D) ni l'un ni l'autre
  v_pub_role     uuid;
  v_perm_id      uuid;
  v_admin_role   uuid;
  v_membership   uuid;
  v_probe        boolean;
  v_server       boolean;
BEGIN
  -- ---------- (A) Exposition ----------
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'api' AND p.proname = 'current_user_can_write_crm_notes'),
         'A1 : api.current_user_can_write_crm_notes est absente (migration 17c non appliquee)';
  ASSERT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'api' AND p.proname = 'current_user_can_write_crm_notes'),
         'A2 : la sonde doit etre SECURITY DEFINER (elle lit des tables gatees)';
  ASSERT NOT has_function_privilege('anon', 'api.current_user_can_write_crm_notes()', 'EXECUTE'),
         'A3 : anon ne doit PAS pouvoir executer la sonde (REVOKE FROM PUBLIC manquant — §204)';
  ASSERT has_function_privilege('authenticated', 'api.current_user_can_write_crm_notes()', 'EXECUTE'),
         'A4 : authenticated doit pouvoir executer la sonde';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_perm_id FROM ref_permission WHERE code = 'write_crm_notes' AND is_active LIMIT 1;
  IF v_perm_id IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant'; END IF;
  -- N'importe quel rôle d'administration d'ORG suffit : la garde teste `IS NOT NULL`, pas un rang.
  SELECT id INTO v_admin_role FROM ref_org_admin_role ORDER BY rank LIMIT 1;
  IF v_admin_role IS NULL THEN RAISE EXCEPTION 'fixture: aucun ref_org_admin_role (seeds non appliques)'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_user_admin, 'crm_probe_admin@test.local'),
    (v_user_perm,  'crm_probe_perm@test.local'),
    (v_user_read,  'crm_probe_read@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_user_admin, 'tourism_agent'), (v_user_perm, 'tourism_agent'), (v_user_read, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ORG sonde CRM', 'published'),
    (v_obj, 'HOT', 'Hotel sonde CRM', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_user_admin, v_org, TRUE), (v_user_perm, v_org, TRUE), (v_user_read, v_org, TRUE)
    ON CONFLICT DO NOTHING;

  -- (B) rôle d'administration d'ORG, et RIEN d'autre.
  SELECT id INTO v_membership FROM user_org_membership
   WHERE user_id = v_user_admin AND org_object_id = v_org;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_membership, v_admin_role, TRUE) ON CONFLICT DO NOTHING;

  -- (C) permission, et RIEN d'autre.
  INSERT INTO user_permission (user_id, permission_id, is_active)
    VALUES (v_user_perm, v_perm_id, TRUE) ON CONFLICT DO NOTHING;

  -- Préalables assertés AVANT usage : sans eux, (B) et (C) passeraient à vide.
  ASSERT NOT EXISTS (SELECT 1 FROM user_permission up
                      WHERE up.user_id = v_user_admin AND up.permission_id = v_perm_id AND up.is_active),
         'prealable B : le temoin ADMIN ne doit porter AUCUNE permission write_crm_notes';
  ASSERT NOT EXISTS (SELECT 1 FROM user_org_admin_role uar
                      JOIN user_org_membership uom ON uom.id = uar.membership_id
                     WHERE uom.user_id = v_user_perm AND uar.is_active),
         'prealable C : le temoin PERMISSION ne doit porter AUCUN role d administration';

  -- ---------- (E) HORS contexte HTTP : auth.uid() est NULL ----------
  -- Exécuté AVANT de poser le moindre JWT, pour que le cas soit réel et non simulé.
  v_probe := api.current_user_can_write_crm_notes();
  ASSERT v_probe IS NOT NULL,
         'E1 : la sonde ne doit JAMAIS rendre NULL — sans COALESCE elle est a trois valeurs et '
         'un « if (!canWrite) » cote client devient fail-OPEN (§204)';
  ASSERT v_probe = FALSE,
         'E2 : sans JWT (psql, pooler, service_role) la sonde doit rendre FALSE';

  -- ---------- (B) Bras ADMIN ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_probe  := api.current_user_can_write_crm_notes();
    v_server := api.user_can_write_crm(v_obj);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_probe = TRUE,
         'B1 : un membre au ROLE D ADMINISTRATION d ORG, sans aucune permission, doit pouvoir '
         'ecrire des notes CRM — c est le cas exact qui affichait « Lecture seule » a tort';
  ASSERT v_probe = v_server,
         format('B2 PARITE : la sonde dit %s la ou la garde serveur dit %s', v_probe, v_server);

  -- ---------- (C) Bras PERMISSION ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_perm, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_probe  := api.current_user_can_write_crm_notes();
    v_server := api.user_can_write_crm(v_obj);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_probe = TRUE, 'C1 : write_crm_notes seule doit suffire';
  ASSERT v_probe = v_server,
         format('C2 PARITE : la sonde dit %s la ou la garde serveur dit %s', v_probe, v_server);

  -- ---------- (D) LECTEUR ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_read, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_probe  := api.current_user_can_write_crm_notes();
    v_server := api.user_can_write_crm(v_obj);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_probe IS NOT NULL, 'D1 : FALSE, jamais NULL (meme raison qu en E1)';
  ASSERT v_probe = FALSE, 'D2 : un simple membre d ORG ne doit PAS pouvoir ecrire des notes CRM';
  ASSERT v_probe = v_server,
         format('D3 PARITE : la sonde dit %s la ou la garde serveur dit %s', v_probe, v_server);

  RAISE NOTICE 'crm notes probe assertions passed (A exposition + anon sans EXECUTE / B bras admin sans permission / C bras permission sans role admin / D lecteur FALSE et non NULL / E hors HTTP FALSE et non NULL / F parite avec api.user_can_write_crm sur les 3 personas).';
END$$;
ROLLBACK;
