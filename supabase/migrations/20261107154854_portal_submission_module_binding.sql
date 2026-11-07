BEGIN;

-- The browser sends an editor module as data. Only the module bound to the
-- target and optional writer can pass the submission's floor and mask checks.
CREATE FUNCTION internal.portal_submission_module(p_target_table text, p_rpc text, p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT candidate.module
  FROM (VALUES
    ('contact_channel',    NULL,                             'contacts',          NULL::text[]),
    ('object_description', NULL,                             'descriptions',      NULL::text[]),
    ('object_capacity',    NULL,                             'capacity-policies',  NULL::text[]),
    ('object_price',       NULL,                             'pricing',            NULL::text[]),
    ('object_act',         NULL,                             'activity',           NULL::text[]),
    ('opening_period',     'save_object_openings',           'openings',           ARRAY['periods']),
    ('object_amenity',      'save_object_commercial',         'characteristics',   ARRAY['languages','payment_methods','environment_tags','amenities']),
    ('media',              'publish_portal_photo_additions', 'media',              ARRAY['additions'])
  ) AS candidate(target_table, rpc, module, allowed_keys)
  WHERE candidate.target_table = p_target_table
    AND candidate.rpc IS NOT DISTINCT FROM p_rpc
    AND CASE
      WHEN jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN false
      -- Manual proposals keep the full draft slice. A NULL RPC can only be
      -- attested in moderation, never dispatched to a writer.
      WHEN candidate.allowed_keys IS NULL THEN true
      ELSE (p_payload - candidate.allowed_keys) = '{}'::jsonb
    END;
$function$;

REVOKE ALL ON FUNCTION internal.portal_submission_module(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.submit_actor_fiche(p_object_id text, p_changes jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_masked    text[];
  v_floor     text[] := api.actor_portal_floor_modules();
  -- CORRECTION CONTRÔLEUR (revue task-5) : le brief listait HUIT writers (avec
  -- save_object_rooms). Le prosrc VIF de api.approve_pending_change (§120) —
  -- re-vérifié en base juste avant cette écriture, md5(prosrc)=3cf2a45631df18e22e0b4c5cd81d9e2e,
  -- IDENTIQUE à l'archive .superpowers/sdd/2026-09-01-portail-acteur/live/approve_pending_change.LIVE.sql —
  -- n'en porte que SEPT : SANS save_object_rooms. Cette liste DOIT rester un
  -- SOUS-ENSEMBLE (depuis la revue du 2026-09-04 : STRICT — voir plus bas) de celle
  -- d'approve_pending_change, JAMAIS un
  -- sur-ensemble : si submit_actor_fiche acceptait un writer qu'approve_pending_change
  -- refuse, ce changement entrerait en base à la soumission puis ne pourrait plus
  -- JAMAIS être approuvé (22023 côté approve) — et comme uq_fiche_submission_open
  -- n'autorise qu'UNE vérification ouverte par fiche, celle-ci resterait bloquée
  -- POUR TOUJOURS (aucun mécanisme ne libère le verrou sans résolution). N'AJOUTE
  -- JAMAIS une entrée ici sans l'avoir d'abord ajoutée, vérifiée et déployée côté
  -- approve_pending_change — et sans mettre à jour l'assertion miroir de
  -- tests/test_actor_portal.sql (bloc D2, « épinglé save_object_rooms ») qui
  -- proteste explicitement contre cette divergence.
  --
  -- RÉDUCTION (revue sécurité 2026-09-04) — le défaut que ces DEUX entrées ferment :
  -- le plancher dur est contrôlé sur `metadata.section`, le ré-dispatch d'écriture est
  -- décidé sur `metadata.rpc`, et RIEN dans cette fonction ne COUPLE les deux clés. Une
  -- enveloppe qui déclare une section anodine ('contacts', ni plancher ni masquée) et un
  -- writer de la liste franchissait donc le plancher, entrait en base, puis se faisait
  -- ré-dispatcher pour de bon à l'approbation. Trois des sept entrées étaient par ailleurs
  -- explicitement interdites AILLEURS dans ce même fichier : `relationships`, `places` et
  -- `media` sont dans api.actor_portal_floor_modules() (§4.1), dont le commentaire dit
  -- pourquoi — save_object_relations « réécrit object_org_link ET actor_object_role, le
  -- périmètre même de l'acteur », save_object_places « supprime les médias des sous-lieux
  -- absents du payload ». Le plancher les fermait par la section ; la whitelist les
  -- rouvrait par le rpc.
  -- La liste est donc ramenée aux SEULS writers que le portail ÉMET réellement. Les cinq
  -- autres n'ont aucun émetteur : les retirer ne retire aucune capacité existante.
  -- L'invariant du §7 tient toujours, et plus largement qu'avant : cette liste reste un
  -- SOUS-ENSEMBLE (ici STRICT) de celle d'api.approve_pending_change — donc aucun
  -- changement accepté ici ne peut être refusé là-bas, et aucune fiche ne peut rester
  -- bloquée à vie sur uq_fiche_submission_open. C'est le sens de l'inclusion qui compte :
  -- rétrécir est TOUJOURS sûr, élargir ne l'est jamais.
  -- Épinglé au test, bloc D2 : les cinq writers retirés y sont refusés UN PAR UN, et
  -- save_object_commercial y a son contrôle positif (une whitelist vidée serait sinon
  -- verte partout et le portail muet).
  v_allowed   text[] := ARRAY['save_object_commercial','save_object_openings','publish_portal_photo_additions'];
  v_change    jsonb;
  v_section   text;
  v_rpc       text;
  v_action    text;
  v_count     int := 0;
  v_sub_id    uuid;
  v_task_id   uuid;
  v_name      text;
  v_sections  text[] := ARRAY[]::text[];
  v_assignees uuid[];
BEGIN
  IF v_uid IS NULL OR NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  IF p_object_id IS NULL OR p_object_id NOT IN (SELECT api.current_user_portal_object_ids()) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) = 0 OR jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'p_changes doit être un tableau de 1 à 40 changements' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fiche_submission fs
              WHERE fs.object_id = p_object_id AND fs.status = 'pending') THEN
    -- PT409 (PostgREST ⇒ HTTP 409, SQLSTATE exposé dans error.code) et PAS 23505 : le front
    -- traduit 23505 en « Cette valeur existe déjà (doublon). » (db-error-message.ts) et
    -- mapDatabaseError applique le SQLSTATE AVANT le message — le prestataire lirait « doublon ».
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END IF;

  v_actor := api.current_user_actor_id();
  v_masked := ARRAY(SELECT jsonb_array_elements_text(
    api.get_portal_section_visibility(p_object_id)->'masked_modules'));

  -- Validation de CHAQUE enveloppe avant la moindre écriture.
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_section := v_change->'metadata'->>'section';
    v_rpc     := v_change->'metadata'->>'rpc';
    v_action  := v_change->>'action';
    IF v_section IS NULL OR btrim(v_section) = '' THEN
      RAISE EXCEPTION 'metadata.section requis sur chaque changement' USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_floor) THEN
      RAISE EXCEPTION 'La section « % » n''est pas ouverte aux acteurs', v_section USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_masked) THEN
      RAISE EXCEPTION 'La section « % » est masquée par votre organisation', v_section USING ERRCODE = '22023';
    END IF;
    IF v_rpc IS NOT NULL AND NOT (v_rpc = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Writer non autorisé: %', v_rpc USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_action, '') NOT IN ('insert','update','delete') THEN
      RAISE EXCEPTION 'action invalide: %', v_action USING ERRCODE = '22023';
    END IF;
    IF v_change->'payload' IS NULL OR (v_change->>'target_table') IS NULL
       OR btrim(v_change->>'target_table') = '' THEN
      RAISE EXCEPTION 'payload et target_table requis' USING ERRCODE = '22023';
    END IF;
    IF internal.portal_submission_module(v_change->>'target_table', v_rpc, v_change->'payload')
         IS DISTINCT FROM v_section THEN
      RAISE EXCEPTION 'Les données proposées ne correspondent pas à la rubrique déclarée' USING ERRCODE = '22023';
    END IF;
    IF v_section = 'media' THEN
      IF v_rpc IS DISTINCT FROM 'publish_portal_photo_additions' OR v_action <> 'update'
        OR v_change->>'target_table' IS DISTINCT FROM 'media' THEN
        RAISE EXCEPTION 'Les photos se transmettent uniquement comme ajouts à relire' USING ERRCODE='22023';
      END IF;
      PERFORM internal.validate_portal_photo_additions(p_object_id,v_change->'payload',v_uid);
    ELSIF v_rpc = 'publish_portal_photo_additions' THEN
      RAISE EXCEPTION 'Writer de photos hors de sa rubrique' USING ERRCODE='22023';
    END IF;
    v_sections := array_append(v_sections, v_change->'metadata'->>'field');
  END LOOP;

  -- La soumission. Le pré-check EXISTS plus haut n'est qu'un check-then-act : il rend
  -- le cas courant lisible sans lever d'exception coûteuse, mais entre lui et CET
  -- INSERT, rien ne l'empêche d'être doublé (double-clic avant que le bouton se
  -- désactive côté front, deux onglets) — les deux appels peuvent lire EXISTS=FALSE
  -- et arriver ici ensemble ; uq_fiche_submission_open (index unique partiel)
  -- départage alors les deux à l'ÉCRITURE, pas au pré-check. Sans ce blindage, le
  -- perdant de la course remonterait un 23505 NU — exactement le message
  -- « doublon » (db-error-message.ts) que le pré-check ci-dessus prétend déjà
  -- fermer, et le piège nommé par le PO pour ce chantier. Le code d'erreur est la
  -- SEULE chose que voit le prestataire : on rattrape donc ICI, à l'écriture réelle,
  -- avec le MÊME message et le MÊME SQLSTATE que le pré-check — le front n'a
  -- jamais qu'un seul cas PT409 à traiter. Motif identique à 4 précédents du dépôt
  -- (SELECT optimiste + écriture blindée) : api.create_tag et
  -- api.create_membership_campaign (api_views_functions.sql), et leur miroir dans
  -- migration_tags_create_and_order.sql.
  BEGIN
    INSERT INTO fiche_submission (object_id, actor_id, submitted_by, note)
    VALUES (p_object_id, v_actor, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_sub_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END;

  -- Les changements (mêmes colonnes que submit_pending_change + submission_id ;
  -- le trigger after-insert flippe object.is_editing).
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                                submitted_by, status, metadata, submission_id)
    VALUES (p_object_id, v_change->>'target_table', v_change->>'target_pk',
            v_change->>'action', v_change->'payload', v_uid, 'pending',
            -- Les trois clés d'ATTESTATION sont retirées de l'enveloppe : elles n'appartiennent
            -- qu'à api.approve_pending_change (§7), qui seule les écrit, et seulement sur sa
            -- branche attestée. Sans ce filtre, un acteur les poserait lui-même — au nom du
            -- modérateur de son choix — et elles survivraient sur les deux issues que §7 ne
            -- réécrit pas : un REFUS (reject_pending_change ne touche pas metadata) et la voie
            -- AUTO (`applied`, aucune réécriture). La ligne porterait alors « untel déclare
            -- l'avoir reportée à la main » sans que personne n'ait rien signé. `-` sur jsonb est
            -- NULL-safe, et metadata est nécessairement un objet ici (un scalaire est abattu par
            -- le contrôle d'enveloppe plus haut). Les clés déclaratives — section, rpc,
            -- manual_apply, field, before, after — passent intactes.
            (v_change->'metadata') - ARRAY['applied_manually','attested_by','attested_at']::text[],
            v_sub_id);
    v_count := v_count + 1;
  END LOOP;

  -- La tâche de vérification, typée par extra (crm_task n'a pas de colonne kind).
  SELECT o.name INTO v_name FROM object o WHERE o.id = p_object_id;
  v_task_id := gen_random_uuid();
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, created_by, extra)
  VALUES (v_task_id, p_object_id, v_actor,
          'Vérifier la fiche « ' || COALESCE(v_name, p_object_id) || ' »',
          COALESCE('Message du prestataire : ' || NULLIF(btrim(COALESCE(p_note, '')), '') || E'\n', '')
            -- array_to_string (forme à 2 arguments) ignore silencieusement les NULL : si
            -- tous les metadata.field valent NULL, la liste serait vide et la phrase
            -- finirait tronquée (« Sections modifiées : » suivi de rien) — l'office lit
            -- cette description, un repli lisible vaut mieux qu'une phrase coupée.
            || 'Sections modifiées : ' || COALESCE(NULLIF(array_to_string(v_sections, ', '), ''), '(non précisées)'),
          'todo', 'medium', v_uid,
          jsonb_build_object('kind', 'fiche_verification', 'submission_id', v_sub_id));
  UPDATE fiche_submission SET task_id = v_task_id WHERE id = v_sub_id;

  -- Assignation multi (D3) + notifications (kind crm_task_assigned réutilisé — l'outbox
  -- e-mail existante part sans aucun nouveau rail).
  v_assignees := ARRAY(SELECT api.list_object_verifier_ids(p_object_id));
  IF COALESCE(array_length(v_assignees, 1), 0) > 0 THEN
    INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
    SELECT v_task_id, u.u, v_uid FROM unnest(v_assignees) AS u(u)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    -- owner de compat = plus petit uuid (même règle que save_crm_task, migration_crm_task_
    -- multi_assignee_notifications.sql L378). PAS min(u.u) : uuid n'a pas d'agrégat MIN/MAX
    -- sur cette version de Postgres (constaté à l'exécution : « function min(uuid) does not
    -- exist ») — uuid n'a qu'un opclass btree (ORDER BY fonctionne), pas d'agrégat dédié.
    UPDATE crm_task SET owner = (SELECT u.u FROM unnest(v_assignees) u(u) ORDER BY u.u LIMIT 1)
      WHERE id = v_task_id;
    PERFORM api.notify_task_assignees(v_task_id, v_assignees, v_uid);
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id, 'task_id', v_task_id,
    'change_count', v_count,
    'assignee_count', COALESCE(array_length(v_assignees, 1), 0));
END;
$function$;

COMMIT;
