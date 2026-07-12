-- test_trail_referential.sql
-- Couvre migration_trail_referential.sql (référentiel sentiers de randonnée, §181,
-- docs/superpowers/specs/2026-07-12-referentiel-sentiers-randonnee-design.md).
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste). Pattern exact
-- tests/test_room_type_read_gate.sql. Toutes les assertions ont été vérifiées en
-- direct contre la base live avant l'apply de la migration (voir plan
-- docs/superpowers/plans/2026-07-12-referentiel-sentiers-migration-phase3.md).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_count      integer;
  v_test_user  uuid := '00000000-0000-4000-a000-0000000000f1';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_test_user, 'trail-referential-test@test.local')
    ON CONFLICT (id) DO NOTHING;

  -- Sources de test DÉDIÉES pour les sections 5/8 (fixtures statiques) et 9 (diff engine) —
  -- JAMAIS le seed réel 'onf_arcgis_reunion' : internal.trail_sync_apply traite chaque payload
  -- comme le snapshot COMPLET de la source (§8.3, comportement correct/voulu) — un record fixture
  -- créé manuellement sous la même source qu'un run de sync ultérieur serait donc marqué 'missing'
  -- par ce run (il n'est pas dans son payload), polluant les assertions d'autres sections. Seules
  -- les sections 4/10/12 utilisent le vrai 'onf_arcgis_reunion' (elles valident spécifiquement le
  -- code source réel), et restent isolées de trail_source_record par construction (4 ne touche que
  -- trail_sync_run ; 10/12 s'exécutent après que 9 ait fini d'utiliser sa propre source dédiée).
  INSERT INTO ref_trail_source (code, label, kind, default_trust) VALUES
    ('__test_source_fixtures', 'Test fixtures source', 'manual', 50)
  ON CONFLICT (code) DO NOTHING;
  INSERT INTO ref_trail_source (code, label, kind, default_trust) VALUES
    ('__test_source_diffengine', 'Test diff engine source', 'manual', 50)
  ON CONFLICT (code) DO NOTHING;

  -- ---------- 1. Vocabulaire ----------
  SELECT count(*) INTO v_count FROM ref_code
    WHERE domain = 'iti_open_status' AND code IN ('not_managed','unknown','archived');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'iti_open_status: attendu 3 nouveaux codes, trouvé %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM ref_code WHERE domain = 'trail_link_role';
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'trail_link_role: attendu 6 codes, trouvé %', v_count;
  END IF;

  -- ---------- 2. Sources + gestionnaires ----------
  SELECT count(*) INTO v_count FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ref_trail_source: seed onf_arcgis_reunion manquant'; END IF;

  SELECT count(*) INTO v_count FROM ref_trail_manager WHERE code = 'onf';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ref_trail_manager: seed onf manquant'; END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('ref_trail_source','ref_trail_manager','trail',
      'trail_manager_link','trail_sync_run','trail_source_record','trail_geometry_version',
      'trail_status_history','trail_status_override','trail_object_link','trail_commune')) THEN
    RAISE EXCEPTION 'trail_*/ref_trail_*: policy trouvée — attendu deny-all-direct (zéro policy)';
  END IF;

  -- ---------- 3. trail + trail_manager_link (contrainte unique) ----------
  DECLARE
    v_trail_id uuid; v_manager_id uuid;
  BEGIN
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task3', 'Test Task 3', 'manual', 'private')
      RETURNING id INTO v_trail_id;
    SELECT id INTO v_manager_id FROM ref_trail_manager WHERE code = 'onf';
    INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail_id, v_manager_id, 'primary');

    BEGIN
      INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail_id, v_manager_id, 'secondary');
      RAISE EXCEPTION 'trail_manager_link: doublon (trail_id,manager_id) accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL; -- attendu
    END;
  END;

  -- ---------- 4. trail_sync_run + lease un-running-par-source ----------
  DECLARE
    v_source_id uuid; v_run1_id uuid;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
    -- started_at = clock_timestamp() (pas now()/défaut) : now() est figé pour toute la transaction
    -- de test, et la garde-fou §9 §8.3 (Task 9 plus bas) trie par started_at DESC — sans avance
    -- réelle, ces runs "historiques" seraient à égalité avec ceux de Task 9 et pourraient être
    -- pêchés à leur place (counts='{}' ⇒ garde-fou silencieusement sauté). clock_timestamp()
    -- avance à chaque instruction même dans une seule transaction.
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'manual', clock_timestamp()) RETURNING id INTO v_run1_id;

    BEGIN
      INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'cron');
      RAISE EXCEPTION 'trail_sync_run: deux runs running simultanés acceptés à tort';
    EXCEPTION WHEN unique_violation THEN NULL; -- attendu
    END;

    UPDATE trail_sync_run SET status = 'succeeded', finished_at = now() WHERE id = v_run1_id;
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'cron', clock_timestamp()) RETURNING id INTO v_run1_id;
    -- Refermer le lease : les sections suivantes réutilisent la même source onf_arcgis_reunion.
    UPDATE trail_sync_run SET status = 'succeeded', finished_at = now() WHERE id = v_run1_id;
  END;

  -- ---------- 5. trail_source_record + trail_geometry_version ----------
  DECLARE
    v_trail5_id uuid; v_source_id uuid; v_open_id uuid; v_record5_id uuid;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code = '__test_source_fixtures';
    SELECT id INTO v_open_id FROM ref_code_iti_open_status WHERE code = 'open';
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task5', 'Test Task 5', 'imported', 'private') RETURNING id INTO v_trail5_id;
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence, trust)
      VALUES (v_trail5_id, v_source_id, 'objectid:9001', v_open_id, 'present', 80)
      RETURNING id INTO v_record5_id;

    INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash)
      VALUES (v_record5_id, 1, ST_Multi(ST_MakeLine(ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)))::geography, 'hash-v1');

    BEGIN
      INSERT INTO trail_source_record (trail_id, source_id, external_id) VALUES (v_trail5_id, v_source_id, 'objectid:9001');
      RAISE EXCEPTION 'trail_source_record: doublon (source_id,external_id) accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    BEGIN
      INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash)
        VALUES (v_record5_id, 1, ST_Multi(ST_MakeLine(ST_MakePoint(0,0), ST_MakePoint(1,1)))::geography, 'hash-dup');
      RAISE EXCEPTION 'trail_geometry_version: doublon (source_record_id,version_no) accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END;

  -- ---------- 6. trail_status_history (insert-only) + trail_status_override (append-only) ----------
  DECLARE
    v_trail6_id uuid; v_closed_id uuid; v_override_id uuid;
  BEGIN
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task6', 'Test Task 6', 'manual', 'private') RETURNING id INTO v_trail6_id;
    SELECT id INTO v_closed_id FROM ref_code_iti_open_status WHERE code = 'closed';

    INSERT INTO trail_status_history (trail_id, event_type, old, new)
      VALUES (v_trail6_id, 'manual_override', NULL, jsonb_build_object('forced_status','closed'));

    INSERT INTO trail_status_override (trail_id, forced_status, reason, author, expires_at)
      VALUES (v_trail6_id, v_closed_id, 'Test override', v_test_user, now() + interval '1 day')
      RETURNING id INTO v_override_id;

    UPDATE trail_status_override SET revoked_at = now(), revoked_by = v_test_user WHERE id = v_override_id;
    SELECT count(*) INTO v_count FROM trail_status_override WHERE id = v_override_id AND revoked_at IS NOT NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_status_override: révocation échouée'; END IF;

    BEGIN
      UPDATE trail_status_override SET revoked_at = now(), revoked_by = NULL WHERE id = v_override_id;
      RAISE EXCEPTION 'trail_status_override: revoked_at sans revoked_by accepté à tort';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END;

  -- ---------- 7. trail_object_link + trail_commune ----------
  DECLARE
    v_trail7_id uuid; v_role_id uuid; v_commune_code varchar(5); v_object_id text;
  BEGIN
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task7', 'Test Task 7', 'manual', 'private') RETURNING id INTO v_trail7_id;
    SELECT id INTO v_role_id FROM ref_code_trail_link_role WHERE code = 'starts_at';
    SELECT insee_code INTO v_commune_code FROM ref_commune LIMIT 1;
    IF v_commune_code IS NULL THEN RAISE EXCEPTION 'fixture: ref_commune vide (migration_ref_commune.sql requise avant ce test)'; END IF;

    INSERT INTO trail_commune (trail_id, insee_code, method) VALUES (v_trail7_id, v_commune_code, 'manual');
    SELECT count(*) INTO v_count FROM trail_commune WHERE trail_id = v_trail7_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_commune: insertion échouée'; END IF;

    SELECT id INTO v_object_id FROM object LIMIT 1;
    IF v_object_id IS NOT NULL THEN
      INSERT INTO trail_object_link (trail_id, object_id, role_id) VALUES (v_trail7_id, v_object_id, v_role_id);
      SELECT count(*) INTO v_count FROM trail_object_link WHERE trail_id = v_trail7_id;
      IF v_count <> 1 THEN RAISE EXCEPTION 'trail_object_link: insertion échouée'; END IF;
    ELSE
      RAISE NOTICE 'trail_object_link: aucun object en fixture, sous-test sauté (schéma seul vérifié)';
    END IF;
  END;

  -- ---------- 8. internal.recompute_trail_status — les 4 scénarios critiques ----------
  DECLARE
    v_trail8 uuid; v_source_id uuid; v_onf uuid; v_open uuid; v_closed uuid; v_not_managed uuid;
    v_status uuid; v_flags jsonb;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code='__test_source_fixtures';
    SELECT id INTO v_onf FROM ref_trail_manager WHERE code='onf';
    SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';
    SELECT id INTO v_closed FROM ref_code_iti_open_status WHERE code='closed';
    SELECT id INTO v_not_managed FROM ref_code_iti_open_status WHERE code='not_managed';

    -- A: source gestionnaire -> open garanti.
    INSERT INTO trail (slug,name,origin,visibility) VALUES ('__test_scn_a','A','imported','private') RETURNING id INTO v_trail8;
    INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail8, v_onf, 'primary');
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence)
      VALUES (v_trail8, v_source_id, 'objectid:testA', v_open, v_onf, 'present');
    SELECT public_status, public_status_flags INTO v_status, v_flags FROM trail WHERE id=v_trail8;
    IF v_status <> v_open OR (v_flags ? 'not_guaranteed') THEN
      RAISE EXCEPTION 'consolidation A: attendu open garanti, obtenu %/%', v_status, v_flags;
    END IF;

    -- B (CRITIQUE §181/§23): hors gestion -> JAMAIS open.
    INSERT INTO trail (slug,name,origin,visibility) VALUES ('__test_scn_b','B','imported','private') RETURNING id INTO v_trail8;
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence)
      VALUES (v_trail8, v_source_id, 'objectid:testB', v_not_managed, 'present');
    SELECT public_status, public_status_flags INTO v_status, v_flags FROM trail WHERE id=v_trail8;
    IF v_status = v_open THEN
      RAISE EXCEPTION 'RÉGRESSION CRITIQUE §181: hors gestion ONF traduit en open';
    END IF;
    IF NOT (v_flags ? 'not_guaranteed') THEN
      RAISE EXCEPTION 'consolidation B: flag not_guaranteed manquant pour un statut non garanti';
    END IF;

    -- C: closed prime sur open, trust ignoré entre échelons.
    INSERT INTO trail (slug,name,origin,visibility) VALUES ('__test_scn_c','C','imported','private') RETURNING id INTO v_trail8;
    INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail8, v_onf, 'primary');
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence, trust)
      VALUES (v_trail8, v_source_id, 'objectid:testC1', v_open, v_onf, 'present', 90);
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence, trust)
      VALUES (v_trail8, v_source_id, 'objectid:testC2', v_closed, v_onf, 'present', 20);
    SELECT public_status INTO v_status FROM trail WHERE id=v_trail8;
    IF v_status <> v_closed THEN
      RAISE EXCEPTION 'consolidation C: closed (trust 20) devait battre open (trust 90)';
    END IF;

    -- D: override manuel prime sur un closed source.
    INSERT INTO trail_status_override (trail_id, forced_status, reason, author)
      VALUES (v_trail8, v_open, 'Test override prioritaire', v_test_user);
    SELECT public_status INTO v_status FROM trail WHERE id=v_trail8;
    IF v_status <> v_open THEN
      RAISE EXCEPTION 'consolidation D: override actif devait forcer open malgré un closed source';
    END IF;

    SELECT count(*) INTO v_count FROM trail_status_history
      WHERE trail_id = v_trail8 AND event_type = 'consolidation_change';
    IF v_count = 0 THEN RAISE EXCEPTION 'trail_status_history: aucun consolidation_change émis'; END IF;
  END;

  -- ---------- 9. internal.trail_sync_apply — diff engine ----------
  DECLARE
    v_source_id uuid; v_run1 uuid; v_run2 uuid; v_run3 uuid; v_run_bad uuid; v_run_gone uuid; v_run_back uuid;
    v_result jsonb; v_trail_id uuid; v_payload jsonb; v_bad_payload jsonb; v_gone_result jsonb; v_back_result jsonb; v_bad_result jsonb;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code = '__test_source_diffengine';
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'initial', clock_timestamp()) RETURNING id INTO v_run1;
    v_payload := jsonb_build_array(
      jsonb_build_object('external_id','objectid:tt1','name_normalized','Sentier TT1',
        'raw_attributes', jsonb_build_object('WS_NomIti','Sentier TT1'),
        'geom_geojson', jsonb_build_object('type','MultiLineString','coordinates', jsonb_build_array(jsonb_build_array(jsonb_build_array(55.5,-21.1), jsonb_build_array(55.51,-21.11)))),
        'length_m_source', 1518, 'status_raw','Sentier ouvert', 'status_normalized_code','open'),
      jsonb_build_object('external_id','objectid:tt2','name_normalized','Sentier TT2 (hors gestion ONF)',
        'raw_attributes', jsonb_build_object('WS_NomIti','Sentier TT2 (hors gestion ONF)'),
        'geom_geojson', jsonb_build_object('type','MultiLineString','coordinates', jsonb_build_array(jsonb_build_array(jsonb_build_array(55.6,-21.2), jsonb_build_array(55.61,-21.21)))),
        'length_m_source', 800, 'status_raw','Sentier hors gestion ONF', 'status_normalized_code','not_managed'));

    -- Import initial.
    v_result := internal.trail_sync_apply(v_run1, v_payload, '{}'::jsonb);
    UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_result->'counts' WHERE id = v_run1;
    IF (v_result->'counts'->>'created')::int <> 2 THEN RAISE EXCEPTION 'run1 FAILED: %', v_result; END IF;

    -- Rejeu strictement identique : idempotence (0 événement).
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'manual', clock_timestamp()) RETURNING id INTO v_run2;
    v_result := internal.trail_sync_apply(v_run2, v_payload, '{}'::jsonb);
    UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_result->'counts' WHERE id = v_run2;
    IF (v_result->'counts'->>'unchanged')::int <> 2 OR (v_result->'counts'->>'created')::int <> 0 THEN
      RAISE EXCEPTION 'idempotence FAILED: %', v_result;
    END IF;

    -- Hors-gestion : aucun lien gestionnaire ; géré : lien primary présent.
    SELECT trail_id INTO v_trail_id FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:tt2';
    IF EXISTS (SELECT 1 FROM trail_manager_link WHERE trail_id = v_trail_id) THEN
      RAISE EXCEPTION 'REGRESSION: hors-gestion trail got a manager link';
    END IF;
    SELECT trail_id INTO v_trail_id FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:tt1';
    IF NOT EXISTS (SELECT 1 FROM trail_manager_link WHERE trail_id = v_trail_id AND role='primary') THEN
      RAISE EXCEPTION 'managed trail missing manager link';
    END IF;

    -- Garde-fou payload anormal : réponse vide ⇒ source_error, 0 missing.
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'manual', clock_timestamp()) RETURNING id INTO v_run3;
    v_result := internal.trail_sync_apply(v_run3, '[]'::jsonb, '{}'::jsonb);
    UPDATE trail_sync_run SET status='failed', finished_at=now() WHERE id = v_run3;
    IF v_result->>'status' <> 'source_error' THEN RAISE EXCEPTION 'garde-fou not triggered: %', v_result; END IF;
    IF EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND presence='missing') THEN
      RAISE EXCEPTION 'garde-fou triggered but records marked missing anyway';
    END IF;

    -- Disparition (payload partiel = snapshot complet volontairement restreint) puis réapparition.
    -- AVANT le test géométrie invalide : ce dernier gonfle 'fetched' à 3 (2 bons + 1 mauvais),
    -- ce qui deviendrait la référence du garde-fou pour le run suivant et ferait déclencher à
    -- tort le garde-fou sur ce payload volontairement partiel (1 < 3×0.5 alors que 1 < 2×0.5 est
    -- faux — la baseline doit rester 2, celle de run1/run2).
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'manual', clock_timestamp()) RETURNING id INTO v_run_gone;
    v_gone_result := internal.trail_sync_apply(v_run_gone, jsonb_build_array(v_payload->0), '{}'::jsonb);
    UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_gone_result->'counts' WHERE id = v_run_gone;
    IF (v_gone_result->'counts'->>'missing')::int <> 1 THEN RAISE EXCEPTION 'disparition FAILED: %', v_gone_result; END IF;
    IF NOT EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:tt2' AND presence='missing' AND missing_since IS NOT NULL) THEN
      RAISE EXCEPTION 'disparition: tt2 should be presence=missing with missing_since set';
    END IF;

    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'manual', clock_timestamp()) RETURNING id INTO v_run_back;
    v_back_result := internal.trail_sync_apply(v_run_back, v_payload, '{}'::jsonb);
    UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_back_result->'counts' WHERE id = v_run_back;
    IF (v_back_result->'counts'->>'reappeared')::int <> 1 THEN RAISE EXCEPTION 'reapparition FAILED: %', v_back_result; END IF;
    IF EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:tt2' AND presence <> 'present') THEN
      RAISE EXCEPTION 'reapparition: tt2 should be present';
    END IF;

    -- Géométrie invalide au sein d'un lot complet : rejet isolé, siblings intacts.
    INSERT INTO trail_sync_run (source_id, trigger, started_at) VALUES (v_source_id, 'manual', clock_timestamp()) RETURNING id INTO v_run_bad;
    v_bad_payload := v_payload || jsonb_build_array(jsonb_build_object('external_id','objectid:bad1',
      'name_normalized','Sentier invalide', 'raw_attributes','{}'::jsonb,
      'geom_geojson', jsonb_build_object('type','MultiLineString','coordinates', jsonb_build_array(jsonb_build_array(jsonb_build_array(55.5,-21.1)))),
      'status_normalized_code','open'));
    v_bad_result := internal.trail_sync_apply(v_run_bad, v_bad_payload, '{}'::jsonb);
    UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_bad_result->'counts' WHERE id = v_run_bad;
    IF (v_bad_result->'counts'->>'errors')::int <> 1 THEN RAISE EXCEPTION 'invalid geometry: expected 1 error, got %', v_bad_result; END IF;
    IF (v_bad_result->'counts'->>'unchanged')::int <> 2 THEN RAISE EXCEPTION 'invalid geometry: siblings should stay unchanged, got %', v_bad_result; END IF;
    IF EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:bad1') THEN
      RAISE EXCEPTION 'invalid geometry: record was written anyway';
    END IF;
  END;

  -- ---------- 10. Frontière service_role (trail_sync_begin/apply_service/finalize) ----------
  DECLARE
    v_run10_id uuid; v_result10 jsonb;
  BEGIN
    v_run10_id := api.trail_sync_begin('onf_arcgis_reunion', 'manual', true, NULL);
    IF v_run10_id IS NULL THEN RAISE EXCEPTION 'trail_sync_begin: aucun id retourné'; END IF;

    BEGIN
      PERFORM api.trail_sync_begin('onf_arcgis_reunion', 'manual', false, NULL);
      RAISE EXCEPTION 'trail_sync_begin: second run running accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    v_result10 := api.trail_sync_apply_service(v_run10_id, '[]'::jsonb, jsonb_build_object('dry_run', true));
    IF v_result10->>'dry_run' <> 'true' THEN RAISE EXCEPTION 'trail_sync_apply_service: dry_run non respecté'; END IF;

    PERFORM api.trail_sync_finalize(v_run10_id, 'succeeded', v_result10);
    SELECT count(*) INTO v_count FROM trail_sync_run WHERE id = v_run10_id AND status = 'succeeded' AND finished_at IS NOT NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_sync_finalize: run non finalisé correctement'; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'api' AND routine_name IN ('trail_sync_begin','trail_sync_apply_service','trail_sync_finalize')
      AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'frontière service_role violée: anon/authenticated ont EXECUTE sur une RPC de sync';
  END IF;

  -- ---------- 11. Lecture admin + lecture publique (aucune fuite §17) ----------
  DECLARE
    v_trail11_id uuid; v_source_id uuid; v_open uuid; v_detail jsonb; v_public jsonb; v_list_count integer;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
    SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';
    INSERT INTO trail (slug, name, origin, visibility, public_status)
      VALUES ('__test_trail11_public', 'Test Task 11', 'imported', 'public', v_open) RETURNING id INTO v_trail11_id;
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence, raw_geom, length_m_computed, raw_attributes)
      VALUES (v_trail11_id, v_source_id, 'objectid:test11', v_open, 'present',
        ST_Multi(ST_MakeLine(ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)))::geography, 1000,
        jsonb_build_object('WS_NomIti','secret interne non exposable'));

    SELECT count(*) INTO v_list_count FROM api.list_trails(NULL,NULL,NULL,'Test Task 11',10,0);
    IF v_list_count <> 1 THEN RAISE EXCEPTION 'list_trails: attendu 1 résultat, obtenu %', v_list_count; END IF;

    v_detail := api.get_trail(v_trail11_id);
    IF v_detail->>'slug' <> '__test_trail11_public' THEN RAISE EXCEPTION 'get_trail: résultat inattendu'; END IF;
    IF (v_detail->'source_records'->0->'raw_attributes'->>'WS_NomIti') IS NULL THEN
      RAISE EXCEPTION 'get_trail: raw_attributes absent alors qu''attendu côté ADMIN';
    END IF;

    v_public := api.get_public_trail('__test_trail11_public');
    IF v_public ? 'raw_attributes' OR v_public ? 'history' OR v_public ? 'overrides' OR v_public ? 'source_records' THEN
      RAISE EXCEPTION 'RÉGRESSION §17: get_public_trail expose raw_attributes/history/overrides/source_records';
    END IF;
    IF v_public->>'name' <> 'Test Task 11' THEN RAISE EXCEPTION 'get_public_trail: name inattendu'; END IF;

    UPDATE trail SET visibility = 'private' WHERE id = v_trail11_id;
    BEGIN
      PERFORM api.get_public_trail('__test_trail11_public');
      RAISE EXCEPTION 'FUITE: un trail visibility=private est lisible via get_public_trail';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%introuvable%' THEN RAISE; END IF; -- attendu : introuvable
    END;
  END;

  -- ---------- 12. Écriture admin (6 RPC) ----------
  DECLARE
    v_trail_a uuid; v_trail_b uuid; v_source_id uuid; v_open uuid; v_record_id uuid;
    v_override_id uuid; v_status_code text;
  BEGIN
    -- auth.role() résout déjà 'service_role' sur cette connexion (d'où le succès des sections
    -- 10/11 sans configuration) mais auth.uid() reste NULL sans claim 'sub' — or
    -- trail_status_override.author est NOT NULL (§9 design, traçabilité obligatoire). On simule
    -- un utilisateur authentifié SANS changer de rôle effectif (pattern set_config exact de
    -- tests/test_room_type_read_gate.sql), pour que trail_force_status/trail_revoke_override
    -- puissent écrire author/revoked_by.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_test_user, 'role', 'service_role')::text, true);

    SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
    SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';

    v_trail_a := api.trail_create_manual('Sentier manuel A', 'private', 'Test');

    PERFORM api.trail_force_status(v_trail_a, 'closed', 'Test fermeture manuelle', now() + interval '1 day');
    SELECT rc.code INTO v_status_code FROM trail t JOIN ref_code_iti_open_status rc ON rc.id=t.public_status WHERE t.id=v_trail_a;
    IF v_status_code <> 'closed' THEN RAISE EXCEPTION 'force_status: statut non appliqué (%)', v_status_code; END IF;

    SELECT id INTO v_override_id FROM trail_status_override WHERE trail_id=v_trail_a AND revoked_at IS NULL;
    PERFORM api.trail_revoke_override(v_override_id, 'Test révocation');
    SELECT rc.code INTO v_status_code FROM trail t JOIN ref_code_iti_open_status rc ON rc.id=t.public_status WHERE t.id=v_trail_a;
    IF v_status_code = 'closed' THEN RAISE EXCEPTION 'revoke_override: statut toujours forcé après révocation'; END IF;

    PERFORM api.trail_set_visibility(v_trail_a, 'public');
    IF (SELECT visibility FROM trail WHERE id=v_trail_a) <> 'public' THEN RAISE EXCEPTION 'set_visibility échoué'; END IF;

    PERFORM api.trail_update_editorial(v_trail_a, 'Sentier manuel A (renommé)', 'Nouvelle description', NULL);
    IF (SELECT name FROM trail WHERE id=v_trail_a) <> 'Sentier manuel A (renommé)' THEN RAISE EXCEPTION 'update_editorial échoué'; END IF;

    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence)
      VALUES (v_trail_a, v_source_id, 'objectid:link1', v_open, 'present') RETURNING id INTO v_record_id;
    v_trail_b := api.trail_create_manual('Sentier manuel B (cible reliaison)', 'private', NULL);
    PERFORM api.trail_link_source_record(v_record_id, v_trail_b);
    IF (SELECT trail_id FROM trail_source_record WHERE id=v_record_id) <> v_trail_b THEN
      RAISE EXCEPTION 'link_source_record: record non déplacé';
    END IF;
    IF (SELECT public_status FROM trail WHERE id=v_trail_b) IS NULL THEN
      RAISE EXCEPTION 'link_source_record: trail cible non recalculé';
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'api'
      AND routine_name IN ('trail_force_status','trail_revoke_override','trail_set_visibility',
                            'trail_update_editorial','trail_create_manual','trail_link_source_record')
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'gate superuser violée: anon a EXECUTE sur une RPC d''écriture admin';
  END IF;

  RAISE NOTICE 'test_trail_referential.sql: TOUS LES TESTS PASSENT (§181 Phase 3 — 12 sections)';
END $$;
ROLLBACK;
