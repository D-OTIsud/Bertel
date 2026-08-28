-- test_crm_assignee_eligibility.sql
-- Garde permanente du manifeste 17c (migration_crm_assignee_eligibility.sql) :
-- on ne peut confier une tâche CRM qu'à quelqu'un qui pourra RÉELLEMENT l'ouvrir et la traiter.
--
-- A) STRUCTURE — les trois fonctions existent, ne sont PAS exécutables par PUBLIC/anon.
-- B) PRÉDICAT — éprouvé sur cinq témoins fabriqués couvrant chaque chemin d'autorisation ET
--    chaque motif de refus. Non vacant DES DEUX CÔTÉS : au moins un TRUE et au moins un FALSE
--    par arme, sinon un prédicat constant passerait.
-- C) TROIS VALEURS (§204) — `api.user_can_assign_crm` ne doit JAMAIS rendre NULL : son
--    consommateur écrit `IF NOT api.user_can_assign_crm(…) THEN RAISE`, et NULL ferait sauter
--    la branche — garde FAIL-OPEN. Éprouvé hors contexte HTTP, là où `auth.role()` est NULL.
-- D) LISTE = GARDE — `api.list_crm_assignees()` ne propose personne que la garde refuserait.
--    Une liste plus large que la garde serait un piège d'écriture (choix systématiquement
--    refusé en 22023).
-- E) REFUS EFFECTIF — `api.save_crm_task` refuse bien un co-membre inéligible. C'est la seule
--    assertion qui prouve que la garde est CÂBLÉE : les blocs B/D ne testent que le prédicat.
-- F) DONNÉES PRÉSERVÉES — aucune ligne `crm_task_assignee` n'est supprimée par 17c ; une
--    assignation historique est une donnée, pas une autorisation courante.
--
-- Contre une base sans 17c : échec immédiat (bloc A). Auto-contenu + transactionnel.
-- Personas RÉELS par `request.jwt.claims` (jamais `SET ROLE` seul : sans JWT `auth.uid()` est
-- NULL et les assertions deviendraient vides — §204). Plage de fixtures dédiée 10xx.

\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgPub  text := 'ORGRUN9999991001';  -- ORG publisher (a un périmètre CRM)
  v_orgVide text := 'ORGRUN9999991002';  -- ORG SANS aucune fiche publiée ⇒ CRM inerte
  v_objPub  text := 'HOTRUN9999991011';
  -- Chemins d'AUTORISATION
  v_uAdmin  uuid := '00000000-0000-4000-a000-000000001001'; -- rang admin, PAS de write_crm_notes
  v_uPerm   uuid := '00000000-0000-4000-a000-000000001002'; -- write_crm_notes directe
  v_uOrgPerm uuid := '00000000-0000-4000-a000-000000001003'; -- permission HÉRITÉE de l'ORG
  -- Chemins de REFUS
  v_uNu     uuid := '00000000-0000-4000-a000-000000001004'; -- co-membre SANS rien
  v_uOrgVide uuid := '00000000-0000-4000-a000-000000001005'; -- admin d'une ORG sans périmètre
  v_uInactif uuid := '00000000-0000-4000-a000-000000001006'; -- membership DÉSACTIVÉ
  v_pub_role uuid;
  v_perm uuid;
  v_admin_role uuid;
  v_membership uuid;
  v_orgVide2 text := 'ORGRUN9999991003';
  v_liste jsonb;
  v_denied boolean;
  v_avant int;
  v_n int;
BEGIN
  -- ═══════════════ A. STRUCTURE ═══════════════
  ASSERT to_regprocedure('api.user_can_act_in_crm(uuid)') IS NOT NULL,
         'A: api.user_can_act_in_crm(uuid) absente (17c non appliquée)';
  ASSERT to_regprocedure('api.user_can_assign_crm(uuid)') IS NOT NULL,
         'A: api.user_can_assign_crm(uuid) absente';
  -- PostgreSQL accorde EXECUTE à PUBLIC par défaut : le REVOKE doit avoir été joué (§204).
  ASSERT NOT has_function_privilege('public', 'api.user_can_act_in_crm(uuid)', 'EXECUTE'),
         'A: PUBLIC peut exécuter api.user_can_act_in_crm — REVOKE manquant';
  ASSERT NOT has_function_privilege('anon', 'api.user_can_act_in_crm(uuid)', 'EXECUTE'),
         'A: anon peut exécuter api.user_can_act_in_crm';
  ASSERT has_function_privilege('authenticated', 'api.user_can_act_in_crm(uuid)', 'EXECUTE'),
         'A: authenticated ne peut PAS exécuter api.user_can_act_in_crm — le CRM serait cassé';

  -- ═══════════════ Fixture ═══════════════
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_perm FROM ref_permission WHERE code='write_crm_notes' LIMIT 1;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant'; END IF;
  SELECT id INTO v_admin_role FROM ref_org_admin_role ORDER BY rank DESC LIMIT 1;
  IF v_admin_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_admin_role vide'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_uAdmin,'crm17c_admin@test.local'), (v_uPerm,'crm17c_perm@test.local'),
    (v_uOrgPerm,'crm17c_orgperm@test.local'), (v_uNu,'crm17c_nu@test.local'),
    (v_uOrgVide,'crm17c_orgvide@test.local'), (v_uInactif,'crm17c_inactif@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_uAdmin,'tourism_agent','Admin Sans Permission'),
    (v_uPerm,'tourism_agent','Perm Directe'),
    (v_uOrgPerm,'tourism_agent','Perm Héritée'),
    (v_uNu,'tourism_agent','Lecteur Seul'),
    (v_uOrgVide,'tourism_agent','Admin Org Sans Périmètre'),
    (v_uInactif,'tourism_agent','Membre Désactivé')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgPub,'ORG','ORG publisher 17c','published'),
    (v_orgVide,'ORG','ORG sans périmètre 17c','published'),
    (v_orgVide2,'ORG','ORG sans périmètre 17c bis','published'),
    (v_objPub,'HOT','Hôtel 17c','draft')
    ON CONFLICT (id) DO NOTHING;
  -- SEULE v_orgPub publie une fiche : v_orgVide n'a AUCUN object_org_link.
  INSERT INTO object_org_link (object_id, org_object_id, role_id)
    VALUES (v_objPub, v_orgPub, v_pub_role) ON CONFLICT DO NOTHING;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_uAdmin,v_orgPub,TRUE), (v_uPerm,v_orgPub,TRUE), (v_uOrgPerm,v_orgVide2,TRUE),
    (v_uNu,v_orgPub,TRUE), (v_uOrgVide,v_orgVide,TRUE), (v_uInactif,v_orgPub,FALSE)
    ON CONFLICT DO NOTHING;
  -- v_uOrgPerm : sa propre ORG publie AUSSI (sinon le chemin « permission héritée » serait
  -- masqué par l'absence de périmètre et le test ne prouverait pas ce qu'il annonce).
  INSERT INTO object_org_link (object_id, org_object_id, role_id)
    VALUES (v_objPub, v_orgVide2, v_pub_role) ON CONFLICT DO NOTHING;

  -- Rang admin pour v_uAdmin (sur v_orgPub) et v_uOrgVide (sur l'ORG sans périmètre).
  SELECT id INTO v_membership FROM user_org_membership WHERE user_id=v_uAdmin AND org_object_id=v_orgPub;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_membership, v_admin_role, TRUE) ON CONFLICT DO NOTHING;
  SELECT id INTO v_membership FROM user_org_membership WHERE user_id=v_uOrgVide AND org_object_id=v_orgVide;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_membership, v_admin_role, TRUE) ON CONFLICT DO NOTHING;

  -- Permission DIRECTE pour v_uPerm ; permission HÉRITÉE de l'ORG pour v_uOrgPerm.
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    VALUES (v_uPerm, v_perm, TRUE, v_uPerm, NOW(), NOW(), NOW()) ON CONFLICT DO NOTHING;
  INSERT INTO org_permission (org_object_id, permission_id, is_active)
    VALUES (v_orgVide2, v_perm, TRUE) ON CONFLICT DO NOTHING;

  -- ═══════════════ B. PRÉDICAT — trois chemins d'autorisation ═══════════════
  -- Le rang admin SUFFIT, sans `write_crm_notes` : s'en tenir à la permission exclurait le
  -- compte du PO lui-même (admin, sans permission directe) — c'est le cas qui a motivé le choix.
  ASSERT api.user_can_act_in_crm(v_uAdmin),
         'B1: un admin d''ORG doit pouvoir agir dans le CRM MÊME sans write_crm_notes '
         '(api.user_can_write_crm l''autorise déjà par ce chemin)';
  ASSERT api.user_can_act_in_crm(v_uPerm),
         'B2: une permission write_crm_notes DIRECTE doit suffire';
  ASSERT api.user_can_act_in_crm(v_uOrgPerm),
         'B3: une permission write_crm_notes HÉRITÉE de l''ORG doit suffire';

  -- ═══════════════ B. PRÉDICAT — motifs de refus ═══════════════
  ASSERT NOT api.user_can_act_in_crm(v_uNu),
         'B4: un co-membre sans rôle ni permission ne doit PAS être éligible — /crm le redirige, '
         'il serait notifié pour un écran qu''il ne peut pas ouvrir';
  ASSERT NOT api.user_can_act_in_crm(v_uOrgVide),
         'B5: un admin d''une ORG qui ne publie AUCUNE fiche n''a pas de périmètre CRM '
         '(current_user_crm_object_ids est vide) — son CRM est structurellement inerte';
  ASSERT NOT api.user_can_act_in_crm(v_uInactif),
         'B6: un membership DÉSACTIVÉ ne rend pas éligible';
  ASSERT NOT api.user_can_act_in_crm(NULL),
         'B7: NULL n''est pas assignable';

  -- ═══════════════ C. TROIS VALEURS (§204) ═══════════════
  -- Ici, hors contexte HTTP : auth.role() et auth.uid() sont NULL. Le prédicat doit rendre
  -- FALSE, jamais NULL — sinon `IF NOT …` de save_crm_task ne prend pas la branche (fail-OPEN).
  ASSERT api.user_can_assign_crm(v_uAdmin) IS NOT NULL,
         'C1: api.user_can_assign_crm rend NULL hors contexte HTTP — COALESCE(…, FALSE) manquant, '
         'la garde de save_crm_task deviendrait fail-OPEN (§204)';
  ASSERT api.user_can_assign_crm(v_uNu) IS NOT NULL, 'C2: idem sur le chemin de refus';

  -- ═══════════════ Persona : un admin de l'ORG publisher ═══════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uAdmin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

    -- D. La LISTE ne propose que des éligibles — et elle n'est pas vide (non-vacuité).
    v_liste := api.list_crm_assignees();
    ASSERT jsonb_array_length(v_liste) > 0,
           'D0: la liste des assignables est vide — le test qui suit serait vacant';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_liste) e
                   WHERE (e->>'user_id')::uuid = v_uPerm),
           'D1: un co-membre ÉLIGIBLE doit être proposé';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_liste) e
                       WHERE (e->>'user_id')::uuid = v_uNu),
           'D2: un co-membre INÉLIGIBLE ne doit pas être proposé — le proposer serait offrir un '
           'choix que l''enregistrement refuse (piège d''écriture)';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_liste) e
                       WHERE (e->>'user_id')::uuid = v_uInactif),
           'D3: un membership désactivé ne doit pas être proposé';
    -- LISTE ⊆ GARDE : aucune entrée proposée ne doit être refusée à l'enregistrement.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_liste) e
                       WHERE NOT api.user_can_assign_crm((e->>'user_id')::uuid)),
           'D4: la liste propose quelqu''un que la garde refuse — liste et garde ont divergé';

    -- E. La garde est CÂBLÉE : save_crm_task refuse effectivement. Sans ce bloc, B/D ne
    -- prouveraient que l'existence d'un prédicat que personne n'appelle (§213).
    v_denied := FALSE;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objPub, 'title', 'Tâche vers un inéligible',
        'assignee_ids', jsonb_build_array(v_uNu)));
    EXCEPTION WHEN OTHERS THEN
      v_denied := TRUE;
      ASSERT SQLSTATE = '22023', 'E1: refus attendu en 22023, obtenu ' || SQLSTATE;
    END;
    ASSERT v_denied, 'E1: assigner une tâche à un co-membre inéligible DOIT être refusé serveur — '
                     'un select filtré côté client n''est pas une garde';

    -- E2. …et le chemin autorisé passe TOUJOURS. Une garde qui coupe tout le monde
    -- satisferait E1 en cassant le produit : il faut mesurer les DEUX côtés.
    ASSERT (api.save_crm_task(jsonb_build_object(
              'object_id', v_objPub, 'title', 'Tâche vers un éligible',
              'assignee_ids', jsonb_build_array(v_uPerm)))->>'id') IS NOT NULL,
           'E2: assigner à un co-membre ÉLIGIBLE doit continuer de fonctionner';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ═══════════════ F. DONNÉES PRÉSERVÉES ═══════════════
  -- 17c ne supprime aucune assignation : une ligne historique est une DONNÉE, pas une
  -- autorisation courante. Le témoin est fabriqué (jamais une déduction sur le corpus).
  INSERT INTO crm_task (id, object_id, title, status, priority)
    VALUES ('00000000-0000-4000-b000-000000001099', v_objPub, 'Tâche héritée 17c', 'todo', 'medium')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO crm_task_assignee (task_id, user_id)
    VALUES ('00000000-0000-4000-b000-000000001099', v_uNu) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_n FROM crm_task_assignee
   WHERE task_id = '00000000-0000-4000-b000-000000001099' AND user_id = v_uNu;
  ASSERT v_n = 1,
         'F1: une assignation vers quelqu''un devenu inéligible doit SURVIVRE — la retirer '
         'effacerait de l''histoire, et le filtre du kanban unit assignables et porteurs réels';

  RAISE NOTICE '17c éligibilité des assignés CRM : assertions passées.';
END$$;
ROLLBACK;
