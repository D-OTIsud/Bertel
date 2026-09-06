-- test_gdpr_cleanup_operations.sql
-- PRIV-01/02 — garde permanente, NON VACANTE, de la remédiation bornée de l'effacement RGPD.
-- Couvre : avatar (chemin connu), incident (media_urls + crm_task lié), acteur avec PII
-- visible seulement via handled_by_actor_id, document privé d'acteur détaché et supprimé,
-- document partagé/promu RETENU, audit rédigé via after_data seul, refus de permission
-- anon/authenticated sur les 2 API de nettoyage, garde-fous de compte (self/owner/super_admin),
-- distinction anonymize (auth conservé)/delete (auth mis en file), rollback atomique.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_owner        uuid := '00000000-0000-4000-a000-000000002001';
  v_super        uuid := '00000000-0000-4000-a000-000000002002';
  v_agent        uuid := '00000000-0000-4000-a000-000000002003';
  v_agent2       uuid := '00000000-0000-4000-a000-000000002004';
  v_obj          text := 'HOTRUN9999992001';
  v_category     uuid;
  v_actor_main   uuid;
  v_actor_other  uuid;
  v_doc_private  uuid;
  v_doc_shared   uuid;
  v_doc_consent  uuid;
  v_int_handled  uuid;
  v_int_afterdata uuid;
  v_incident     uuid;
  v_report       jsonb;
  v_op_avatar    uuid;
  v_op_incident  uuid;
  v_op_actor     uuid;
  v_task_incident uuid;
  v_task_history uuid;
  v_pending_task uuid;
  v_task_count   int;
  v_log_count    int;
  v_denied       boolean := false;
  v_status       jsonb;
  v_ack          jsonb;
BEGIN
  ------------------------------------------------------------------
  -- Structure : table de tâches deny-all-direct + 2 API service_role-only
  ------------------------------------------------------------------
  ASSERT to_regclass('internal.gdpr_cleanup_task') IS NOT NULL, 'internal.gdpr_cleanup_task absente';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'internal.gdpr_cleanup_task'::regclass),
         'internal.gdpr_cleanup_task doit avoir la RLS';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='internal' AND tablename='gdpr_cleanup_task'),
         'internal.gdpr_cleanup_task ne doit porter aucune policy (deny-all-direct)';
  ASSERT NOT has_table_privilege('authenticated', 'internal.gdpr_cleanup_task', 'SELECT'),
         'authenticated ne doit pas lire internal.gdpr_cleanup_task directement';
  ASSERT NOT has_table_privilege('anon', 'internal.gdpr_cleanup_task', 'SELECT'),
         'anon ne doit pas lire les tâches directement';
  ASSERT NOT has_function_privilege('authenticated', 'audit.redact_subject(text,text,text,text[])', 'EXECUTE'),
         'authenticated ne doit pas pouvoir supprimer arbitrairement des champs d''audit';
  ASSERT NOT has_function_privilege('anon', 'audit.redact_subject(text,text,text,text[])', 'EXECUTE'),
         'anon ne doit pas exécuter audit.redact_subject';
  ASSERT NOT has_function_privilege('anon', 'api.rpc_gdpr_get_cleanup_status(uuid)', 'EXECUTE'),
         'anon ne doit pas exécuter rpc_gdpr_get_cleanup_status';
  ASSERT NOT has_function_privilege('authenticated', 'api.rpc_gdpr_get_cleanup_status(uuid)', 'EXECUTE'),
         'authenticated ne doit pas exécuter rpc_gdpr_get_cleanup_status';
  ASSERT has_function_privilege('service_role', 'api.rpc_gdpr_get_cleanup_status(uuid)', 'EXECUTE'),
         'service_role doit exécuter rpc_gdpr_get_cleanup_status';
  ASSERT NOT has_function_privilege('authenticated', 'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)', 'EXECUTE'),
         'authenticated ne doit pas exécuter rpc_gdpr_ack_cleanup_task';

  ------------------------------------------------------------------
  -- Fixtures communes
  ------------------------------------------------------------------
  INSERT INTO auth.users (id, email) VALUES
    (v_owner, 'gdpr_owner@test.local'), (v_super, 'gdpr_super@test.local'),
    (v_agent, 'gdpr_agent@test.local'), (v_agent2, 'gdpr_agent2@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name, avatar_url) VALUES
    (v_owner, 'owner', 'Owner Test', NULL),
    (v_super, 'super_admin', 'Super Test', NULL),
    (v_agent, 'tourism_agent', 'Agent Test', 'https://example.supabase.co/storage/v1/object/public/avatars/'||v_agent||'/avatar.jpg?v=1'),
    (v_agent2, 'tourism_agent', 'Agent2 Test', NULL)
  ON CONFLICT (id) DO UPDATE SET role = excluded.role, avatar_url = excluded.avatar_url;

  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'HOT', 'Etablissement test GDPR', 'published')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO ref_code (domain, code, name) VALUES ('incident_category', 'gdpr_test_cat', 'Test GDPR')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_category FROM ref_code WHERE domain = 'incident_category' AND code = 'gdpr_test_cat';
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'fixture: ref_code_incident_category introuvable';
  END IF;

  ------------------------------------------------------------------
  -- A. Avatar utilisateur — chemin CONNU, mode anonymize (auth conservé)
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_report := api.rpc_gdpr_erase_subject('user', v_agent::text, 'anonymize', 'test avatar');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  ASSERT (SELECT avatar_url FROM app_user_profile WHERE id = v_agent) IS NULL,
         'avatar_url du profil non nettoyé après anonymize';
  ASSERT (v_report->>'authRetained')::boolean IS TRUE,
         'mode anonymize doit déclarer authRetained=true (le compte auth.users est conservé)';
  v_op_avatar := (v_report->>'operationId')::uuid;
  ASSERT v_op_avatar IS NOT NULL, 'operationId absent du rapport';
  -- Round-trip complet : le journal a été inséré AVANT les tâches (FK satisfaite) puis mis à
  -- jour avec le rapport définitif — jamais laissé au placeholder vide initial.
  ASSERT (SELECT report FROM gdpr_erasure_log WHERE id = v_op_avatar) ? 'operationId',
         'gdpr_erasure_log.report doit porter le rapport définitif après l''UPDATE de fin de fonction';
  ASSERT EXISTS (
    SELECT 1 FROM internal.gdpr_cleanup_task
    WHERE operation_id = v_op_avatar AND action = 'storage_remove'
      AND metadata->>'bucket' = 'avatars' AND metadata->>'path' = v_agent::text || '/avatar.jpg'
  ), 'tâche storage_remove absente ou chemin avatar non conforme à la convention serveur';
  ASSERT NOT EXISTS (
    SELECT 1 FROM internal.gdpr_cleanup_task WHERE operation_id = v_op_avatar AND action = 'auth_delete'
  ), 'mode anonymize ne doit jamais mettre en file une suppression auth.users';
  -- Dédoublonnage : l'avatar_url précédent de la fixture DÉSIGNE DÉJÀ le chemin canonique
  -- (.../avatars/<uuid>/avatar.jpg) — une seule tâche storage_remove doit exister, pas deux.
  SELECT count(*) INTO v_task_count FROM internal.gdpr_cleanup_task
   WHERE operation_id = v_op_avatar AND action = 'storage_remove';
  ASSERT v_task_count = 1,
         'chemin canonique + avatar_url déjà canonique doivent être dédoublonnés en 1 seule tâche';

  ------------------------------------------------------------------
  -- B. mode delete sur un compte ordinaire — auth.users mis en file, jamais supprimé en SQL
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_report := api.rpc_gdpr_erase_subject('user', v_agent2::text, 'delete', 'test delete ordinaire');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT (v_report->>'authDeletionRequested')::boolean IS TRUE,
         'mode delete doit déclarer authDeletionRequested=true (pas authRetained=false : le statut réel est celui de la tâche)';
  ASSERT NOT (v_report ? 'authRetained'),
         'mode delete ne doit jamais affirmer authRetained à l''instant de l''appel (la tâche auth_delete n''a pas encore tourné)';
  ASSERT EXISTS (
    SELECT 1 FROM internal.gdpr_cleanup_task
    WHERE operation_id = (v_report->>'operationId')::uuid AND action = 'auth_delete'
      AND metadata->>'user_id' = v_agent2::text
  ), 'tâche auth_delete absente ou user_id incorrect';
  ASSERT EXISTS (SELECT 1 FROM auth.users WHERE id = v_agent2),
         'le compte auth.users ne doit JAMAIS être supprimé par du SQL direct (Admin API uniquement)';

  ------------------------------------------------------------------
  -- C. Garde-fous de compte : self / owner / super_admin (hors owner)
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_erase_subject('user', v_owner::text, 'anonymize', NULL);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_denied, 'auto-effacement (self) aurait dû être refusé, y compris insensible à la casse';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_erase_subject('user', v_owner::text, 'delete', NULL);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_denied, 'la cible owner ne doit jamais être effaçable, même par un super_admin';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_erase_subject('user', v_super::text, 'anonymize', NULL);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_denied, 'un super_admin ciblant SON PROPRE compte reste un auto-effacement refusé';

  ------------------------------------------------------------------
  -- C2. Mode NULL explicite : rejeté, ne doit JAMAIS retomber silencieusement sur 'delete'.
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_erase_subject('user', v_agent2::text, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_denied, 'p_mode NULL doit être rejeté explicitement, pas retomber sur la branche delete';
  ASSERT EXISTS (SELECT 1 FROM auth.users WHERE id = v_agent2),
         'p_mode NULL ne doit avoir déclenché AUCUNE suppression (compte toujours présent)';

  ------------------------------------------------------------------
  -- C3. JWT présent mais malformé (aucun rôle/sub exploitable) : DOIT être refusé — un
  --     contexte REST détecté (GUC posée) avec un superuser NULL ne doit jamais autoriser
  --     silencieusement (régression du NOT vs IS NOT TRUE).
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{}'::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_erase_subject('user', v_agent2::text, 'anonymize', NULL);
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT v_denied, 'un JWT présent mais sans rôle/sub exploitable doit être refusé, jamais autorisé par défaut';

  ------------------------------------------------------------------
  -- C4. Une session postgres passée à authenticated reste un appel client,
  -- même sans claims. Le droit de maintenance ne suit pas session_user seul.
  ------------------------------------------------------------------
  SELECT count(*) INTO v_log_count FROM gdpr_erasure_log;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_erase_subject('user', v_agent2::text, 'anonymize', 'sans claims');
    EXCEPTION WHEN OTHERS THEN v_denied := true;
    END;
  RESET ROLE;
  ASSERT v_denied, 'authenticated sans claims ne doit jamais bénéficier du bypass de maintenance';
  ASSERT (SELECT count(*) FROM gdpr_erasure_log) = v_log_count,
         'un appel client sans claims refusé ne doit laisser aucune opération';
  PERFORM set_config('request.jwt.claims', NULL, true);

  ------------------------------------------------------------------
  -- D. Incident : media_urls + crm_task lié (ID collecté mais inexploité avant ce lot)
  ------------------------------------------------------------------
  INSERT INTO incident_report (object_id, category_id, description, reporter_email, reporter_name, media_urls, severity)
  VALUES (v_obj, v_category, 'Fuite d''eau signalée par Jean Dupont, contactez-moi', 'jean.dupont@test.local', 'Jean Dupont',
          ARRAY['https://example.supabase.co/storage/v1/object/public/media/incidents/photo1.jpg',
                'https://example.supabase.co/storage/v1/object/public/media/incidents/photo2.jpg'], 'medium')
  RETURNING id INTO v_incident;

  SELECT crm_task_id INTO v_task_incident FROM incident_report WHERE id = v_incident;
  ASSERT v_task_incident IS NOT NULL, 'fixture: le trigger devait créer une crm_task liée';
  ASSERT (SELECT description FROM crm_task WHERE id = v_task_incident) LIKE '%Jean Dupont%',
         'fixture: la crm_task devait recopier la description du signalement (avant effacement)';

  v_report := api.rpc_gdpr_erase_subject('incident', v_incident::text, 'anonymize', 'test incident');
  v_op_incident := (v_report->>'operationId')::uuid;

  ASSERT (SELECT description FROM incident_report WHERE id = v_incident) IS NULL,
         'incident_report.description non nettoyée';
  ASSERT (SELECT description FROM crm_task WHERE id = v_task_incident) IS NULL,
         'crm_task.description liée au signalement conserve encore la PII du déclarant (correctif non appliqué)';
  SELECT count(*) INTO v_task_count FROM internal.gdpr_cleanup_task
   WHERE operation_id = v_op_incident AND action = 'storage_remove'
     AND metadata->>'raw_url' LIKE '%/media/incidents/%';
  ASSERT v_task_count = 2, 'les 2 media_urls du signalement doivent être mis en file de suppression';

  ------------------------------------------------------------------
  -- E. Acteur : PII visible SEULEMENT via handled_by_actor_id + document privé détaché
  --    + document partagé/promu RETENU + audit rédigé via after_data seul
  ------------------------------------------------------------------
  v_actor_main := gen_random_uuid();
  v_actor_other := gen_random_uuid();
  INSERT INTO actor (id, display_name, photo_url, created_by, updated_by) VALUES
    (v_actor_main, 'Sujet Principal', 'https://example.supabase.co/storage/v1/object/public/media/actors/photo.jpg', v_owner, v_owner),
    (v_actor_other, 'Autre Acteur', NULL, v_owner, v_owner);

  INSERT INTO ref_document (url, title, storage_bucket, storage_path, access_scope) VALUES
    ('storage://actor-documents/priv.pdf', 'Piece privee', 'actor-documents', 'priv/'||v_actor_main||'.pdf', 'crm_private')
    RETURNING id INTO v_doc_private;
  INSERT INTO ref_document (url, title, storage_bucket, storage_path, access_scope) VALUES
    ('storage://actor-documents/shared.pdf', 'Piece promue', 'actor-documents', 'shared/'||v_actor_main||'.pdf', 'crm_private')
    RETURNING id INTO v_doc_shared;
  INSERT INTO ref_document (url, title, storage_bucket, storage_path, access_scope) VALUES
    ('storage://actor-documents/consent.pdf', 'Justificatif consentement', 'actor-documents', 'consent/'||v_actor_main||'.pdf', 'crm_private')
    RETURNING id INTO v_doc_consent;

  INSERT INTO actor_document (actor_id, document_id, title, created_by)
  VALUES (v_actor_main, v_doc_private, 'Piece privee', v_owner);
  INSERT INTO actor_document (actor_id, document_id, promoted_document_id, status, promoted_to_object_id, promoted_at, title, created_by)
  VALUES (v_actor_main, v_doc_shared, v_doc_shared, 'promoted', v_obj, now(), 'Piece promue', v_owner);
  INSERT INTO object_document (object_id, document_id, title) VALUES (v_obj, v_doc_shared, 'Carte promue');

  INSERT INTO actor_consent (actor_id, channel, consent_given, document_id)
  VALUES (v_actor_main, 'email', true, v_doc_consent);

  -- PII visible SEULEMENT via handled_by_actor_id (actor_id pointe vers un AUTRE acteur — CE
  -- lien doit SURVIVRE intact : c'est exactement le bug que le CASE sur les deux colonnes corrige).
  INSERT INTO crm_interaction (object_id, interaction_type, direction, status, subject, body, source, occurred_at, is_actionable, actor_id, handled_by_actor_id)
  VALUES (v_obj, 'note', 'internal', 'done', 'Sujet PII handled_by', 'Corps PII handled_by', 'test', now(), true, v_actor_other, v_actor_main)
  RETURNING id INTO v_int_handled;

  -- Ligne dont la SEULE trace d'audit portant l'acteur vit dans after_data (avant ce correctif,
  -- avant_data ne matchait rien et cette ligne échappait à toute rédaction).
  INSERT INTO crm_interaction (object_id, interaction_type, direction, status, subject, body, source, occurred_at, is_actionable)
  VALUES (v_obj, 'note', 'internal', 'done', 'PII-historique-sans-lien', 'Corps historique sans acteur', 'test', now(), true)
  RETURNING id INTO v_int_afterdata;
  -- Le journal ne couvre pas les INSERT : une UPDATE AVANT la liaison crée
  -- explicitement une trace dont ni before_data ni after_data ne porte l'acteur.
  UPDATE crm_interaction SET body = 'Corps historique modifié sans acteur' WHERE id = v_int_afterdata;
  ASSERT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_interaction' AND (row_pk->>'id') = v_int_afterdata::text
       AND (before_data->>'actor_id') IS NULL AND (after_data->>'actor_id') IS NULL
       AND after_data->>'body' = 'Corps historique modifié sans acteur'
  ), 'fixture: historique CRM antérieur à la liaison absent';
  UPDATE crm_interaction
     SET actor_id = v_actor_main, subject = 'PII-after-data-seul', body = 'Corps PII after-data seul'
   WHERE id = v_int_afterdata;
  ASSERT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_interaction' AND (row_pk->>'id') = v_int_afterdata::text
       AND (before_data->>'actor_id') IS NULL AND (after_data->>'actor_id') = v_actor_main::text
  ), 'fixture: la ligne d''audit after_data-seul n''a pas la forme attendue';

  INSERT INTO crm_task (object_id, title, description)
  VALUES (v_obj, 'Titre historique PII sans acteur', 'Description historique PII sans acteur')
  RETURNING id INTO v_task_history;
  UPDATE crm_task SET description = 'Description historique PII modifiée sans acteur' WHERE id = v_task_history;
  ASSERT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_task' AND (row_pk->>'id') = v_task_history::text
       AND (before_data->>'actor_id') IS NULL AND (after_data->>'actor_id') IS NULL
       AND after_data->>'description' = 'Description historique PII modifiée sans acteur'
  ), 'fixture: historique tâche antérieur à la liaison absent';
  UPDATE crm_task SET actor_id = v_actor_main WHERE id = v_task_history;

  v_report := api.rpc_gdpr_erase_subject('actor', v_actor_main::text, 'delete', 'test acteur complet');
  v_op_actor := (v_report->>'operationId')::uuid;

  -- handled_by_actor_id : la PII doit être nettoyée ET rédigée dans l'audit.
  ASSERT (SELECT handled_by_actor_id FROM crm_interaction WHERE id = v_int_handled) IS NULL,
         'handled_by_actor_id non nettoyé';
  -- Le trigger auto_populate_interaction_subject remplace un sujet NULL par
  -- le libellé générique du type. Vérifier ce libellé exact prouve que le sujet
  -- personnel a disparu sans exiger un NULL que le schéma ne conserve jamais.
  ASSERT (SELECT subject FROM crm_interaction WHERE id = v_int_handled) = 'Note interne',
         'le sujet personnel doit être remplacé par le libellé générique du trigger';
  ASSERT (SELECT body FROM crm_interaction WHERE id = v_int_handled) IS NULL,
         'le corps personnel doit être nettoyé sur la ligne liée par handled_by_actor_id seul';
  ASSERT (SELECT actor_id FROM crm_interaction WHERE id = v_int_handled) = v_actor_other,
         'le lien actor_id vers un AUTRE acteur ne doit JAMAIS être délié quand seul handled_by_actor_id correspond au sujet effacé (bug CASE)';
  ASSERT NOT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_interaction' AND (row_pk->>'id') = v_int_handled::text
       AND ((before_data ? 'subject') OR (after_data ? 'subject'))
  ), 'audit non rédigé pour une ligne dont seul handled_by_actor_id portait le sujet (correctif OR manquant)';

  -- after_data seul : la ligne historique (avant toute mutation par le RPC) doit être rédigée.
  ASSERT NOT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_interaction' AND (row_pk->>'id') = v_int_afterdata::text
       AND (before_data->>'actor_id') IS NULL AND (after_data ? 'subject')
  ), 'audit.redact_subject ne matche pas after_data (fuite PII sur une ligne visible seulement par after_data)';
  ASSERT NOT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_interaction' AND (row_pk->>'id') = v_int_afterdata::text
       AND (before_data ? 'subject' OR after_data ? 'subject' OR before_data ? 'body' OR after_data ? 'body')
  ), 'les IDs CRM doivent être capturés avant déliaison : l''historique antérieur sans acteur conserve la PII';
  ASSERT (SELECT actor_id FROM crm_task WHERE id = v_task_history) IS NULL,
         'la tâche du sujet doit être déliée';
  ASSERT NOT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'crm_task' AND (row_pk->>'id') = v_task_history::text
       AND (before_data ? 'title' OR after_data ? 'title' OR before_data ? 'description' OR after_data ? 'description')
  ), 'l''historique de tâche antérieur à la liaison doit aussi être rédigé par ID';

  -- Document privé : détaché, supprimé, et sa suppression Storage mise en file.
  ASSERT NOT EXISTS (SELECT 1 FROM actor_document WHERE actor_id = v_actor_main),
         'actor_document doit être vidé après effacement (delete cascade + anonymize explicite)';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_document WHERE id = v_doc_private),
         'le document privé orphelin doit être supprimé de ref_document';
  ASSERT EXISTS (
    SELECT 1 FROM internal.gdpr_cleanup_task
     WHERE operation_id = v_op_actor AND action = 'storage_remove'
       AND metadata->>'bucket' = 'actor-documents' AND metadata->>'path' = 'priv/'||v_actor_main||'.pdf'
  ), 'tâche de suppression Storage absente pour le document privé orphelin';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_document WHERE id = v_doc_consent),
         'le justificatif de consentement orphelin doit être supprimé de ref_document';
  ASSERT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'ref_document' AND (row_pk->>'id') = v_doc_private::text
       AND before_data IS NOT NULL
  ), 'fixture: le DELETE ref_document doit avoir produit une trace d''audit non vacante';
  -- L'audit du DELETE sur ref_document doit lui-même être rédigé : sinon l'URL/le chemin du
  -- document orphelin restent lisibles en clair dans before_data malgré la ligne supprimée.
  ASSERT NOT EXISTS (
    SELECT 1 FROM audit.audit_log
     WHERE table_name = 'ref_document' AND (row_pk->>'id') = v_doc_private::text
       AND (before_data ? 'url' OR before_data ? 'storage_path')
  ), 'audit.redact_subject non appliqué sur ref_document après suppression du document orphelin';

  -- Document partagé/promu : JAMAIS supprimé, ni sa ligne, ni son fichier — compté en rétention.
  ASSERT EXISTS (SELECT 1 FROM ref_document WHERE id = v_doc_shared),
         'un document encore référencé par object_document (promu) ne doit jamais être supprimé';
  ASSERT NOT EXISTS (
    SELECT 1 FROM internal.gdpr_cleanup_task
     WHERE operation_id = v_op_actor AND action = 'storage_remove' AND metadata->>'path' = 'shared/'||v_actor_main||'.pdf'
  ), 'un document partagé/promu ne doit jamais être mis en file de suppression Storage';
  ASSERT (v_report->>'retainedSharedDocuments')::int >= 1,
         'retainedSharedDocuments doit refléter le document promu conservé';
  ASSERT (v_report->>'manualReviewRequired')::boolean IS TRUE,
         'manualReviewRequired doit être vrai quand un document personnel est retenu ailleurs';
  ASSERT v_report ? 'unresolvedScope', 'le rapport doit exposer honnêtement le périmètre non résolu';

  ------------------------------------------------------------------
  -- F. Lecture/acquittement des tâches — service_role uniquement, refus anon/authenticated
  ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_agent2, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_get_cleanup_status(v_op_actor);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
  RESET ROLE;
  ASSERT v_denied, 'authenticated ne doit pas pouvoir lire le statut de nettoyage RGPD';

  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_ack_cleanup_task(v_op_actor, gen_random_uuid(), true, NULL);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
  RESET ROLE;
  ASSERT v_denied, 'authenticated ne doit pas pouvoir acquitter une tâche';

  v_denied := false;
  SET LOCAL ROLE anon;
    BEGIN
      PERFORM api.rpc_gdpr_ack_cleanup_task(v_op_actor, gen_random_uuid(), true, NULL);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
  RESET ROLE;
  ASSERT v_denied, 'anon ne doit pas pouvoir acquitter une tâche de nettoyage RGPD';

  SET LOCAL ROLE anon;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_get_cleanup_status(v_op_actor);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
  RESET ROLE;
  ASSERT v_denied, 'anon ne doit pas pouvoir lire le statut de nettoyage';

  SET LOCAL ROLE service_role;
    v_status := api.rpc_gdpr_get_cleanup_status(v_op_actor);
  RESET ROLE;
  ASSERT jsonb_array_length(v_status->'tasks') >= 2,
         'get_cleanup_status doit restituer les tâches de l''opération (document privé + consentement)';

  SELECT (t->>'id')::uuid INTO v_pending_task
    FROM jsonb_array_elements(v_status->'tasks') t
   WHERE t->>'status' = 'pending' LIMIT 1;
  ASSERT v_pending_task IS NOT NULL, 'fixture: aucune tâche pending à acquitter';

  SET LOCAL ROLE service_role;
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_ack_cleanup_task(v_op_avatar, v_pending_task, true, NULL);
    EXCEPTION WHEN no_data_found THEN v_denied := true;
    END;
    ASSERT v_denied, 'une tâche ne doit pas pouvoir être acquittée sous une autre opération';
    v_ack := api.rpc_gdpr_ack_cleanup_task(v_op_actor, v_pending_task, true, NULL);
    ASSERT v_ack->>'status' = 'succeeded', 'acquittement succès non appliqué';
    -- Idempotence : un second acquittement ne doit ni régresser l'état ni recompter un essai.
    v_ack := api.rpc_gdpr_ack_cleanup_task(v_op_actor, v_pending_task, false, 'ne devrait jamais s''appliquer');
    ASSERT v_ack->>'status' = 'succeeded', 'un acquittement dupliqué ne doit jamais régresser une tâche succeeded';
    ASSERT (v_ack->>'attempts')::int = 1, 'un acquittement dupliqué sur une tâche succeeded ne doit pas recompter un essai';
  RESET ROLE;

  ------------------------------------------------------------------
  -- G. Rollback atomique : un échec d'écriture de tâche doit annuler TOUTE la mutation
  ------------------------------------------------------------------
  -- La section F laisse les claims du compte ordinaire utilisé pour prouver
  -- les refus. Restaurer ici la maintenance SQL explicite avant le sabotage DDL.
  PERFORM set_config('request.jwt.claims', NULL, true);
  DECLARE
    v_actor_atomic uuid := gen_random_uuid();
    v_name_before  text;
    v_log_before   int;
  BEGIN
    INSERT INTO actor (id, display_name, photo_url, created_by, updated_by)
    VALUES (v_actor_atomic, 'Atomique Test', 'https://example.supabase.co/storage/v1/object/public/media/actors/atomic.jpg', v_owner, v_owner);
    v_name_before := (SELECT display_name FROM actor WHERE id = v_actor_atomic);
    SELECT count(*) INTO v_log_before FROM gdpr_erasure_log WHERE subject_id = v_actor_atomic::text;

    BEGIN
      -- NOT VALID : l'ALTER lui-même ne doit pas échouer sur les lignes déjà écrites par les
      -- sections précédentes — seule une INSERTION NOUVELLE (celle du RPC ci-dessous) doit violer.
      ALTER TABLE internal.gdpr_cleanup_task ADD CONSTRAINT test_force_fail CHECK (false) NOT VALID;
      PERFORM api.rpc_gdpr_erase_subject('actor', v_actor_atomic::text, 'anonymize', 'sabotage atomique');
      RAISE EXCEPTION 'le sabotage aurait dû faire échouer l''insertion de tâche de nettoyage';
    EXCEPTION WHEN check_violation THEN
      NULL; -- attendu : BEGIN/EXCEPTION annule ATOMIQUEMENT l'ALTER TABLE et l'écriture partielle
    END;

    ASSERT (SELECT display_name FROM actor WHERE id = v_actor_atomic) = v_name_before,
           'rollback atomique : l''acteur n''aurait pas dû être modifié après échec de tâche de nettoyage';
    ASSERT (SELECT count(*) FROM gdpr_erasure_log WHERE subject_id = v_actor_atomic::text) = v_log_before,
           'rollback atomique : aucune ligne de journal ne devrait avoir été insérée après échec';
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'test_force_fail'
    ), 'rollback atomique : le sabotage lui-même aurait dû être annulé';
  END;

  RAISE NOTICE 'gdpr_cleanup_operations assertions passed.';
END$$;
ROLLBACK;
