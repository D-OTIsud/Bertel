-- 20260905195257_gdpr_cleanup_operations.sql
-- PRIV-01/02 — durcissement borné de l'effacement RGPD (Art. 17).
-- APRÈS migration_unblock_team_legal_access.sql (ref_document.storage_bucket/storage_path/
-- access_scope) et supabase/migrations/20260807124408_actor_prospects_documents.sql
-- (actor_document). Ce fichier NE modifie PAS le fold historique de schema_unified.sql
-- (audit.redact_subject / api.rpc_gdpr_erase_subject y sont définis à l'identique de
-- l'ancien migration_gdpr_erasure.sql) : il les redéfinit ici via CREATE OR REPLACE, ce qui
-- l'emporte à la fois sur une base FRAÎCHE (appliqué après le fold, en fin de manifeste) et
-- sur une base LIVE déjà upgradée (dernier mot sur ces deux corps).
--
-- Contenu :
--  1. internal.gdpr_cleanup_task — tâches de nettoyage (Storage/Auth) qui survivent au sujet
--     effacé, rattachées à gdpr_erasure_log.id (operationId). Deny-all-direct : aucune policy,
--     aucun grant hors service_role ; accès exclusivement par les 2 RPC api.* ci-dessous.
--  2. audit.redact_subject — ajoute le matching after_data (une valeur qui n'apparaît QUE
--     dans after_data — ex. une liaison posée par la même écriture qui porte du texte libre —
--     était invisible à avant ce correctif).
--  3. api.rpc_gdpr_erase_subject — inchangé dans son contrat d'entrée/son autorisation ;
--     ajoute la bibliothèque privée d'acteur (actor_document/promoted_document_id), les
--     justificatifs de consentement (actor_consent.document_id), la tâche CRM liée à un
--     signalement, la rédaction actor_id ET handled_by_actor_id, la mise en file des
--     suppressions Storage/Auth (au lieu d'un simple champ de rapport), et les garde-fous
--     de compte (self/owner/super_admin) pour subject_kind='user'.
--  4. api.rpc_gdpr_get_cleanup_status / api.rpc_gdpr_ack_cleanup_task — lecture et
--     acquittement idempotent des tâches, service_role uniquement (le serveur Next.js les
--     appelle avec la clé de service APRÈS avoir revérifié lui-même le JWT/superuser).
--
-- Portée assumée et NON résolue par ce lot (à ne pas prétendre couverte) : énumération des
-- orphelins Storage historiques (avant ce lot), upload concurrent à l'instantané ponctuel,
-- sauvegardes/caches. Voir report.unresolvedScope.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tâches de nettoyage post-effacement
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal.gdpr_cleanup_task (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  UUID NOT NULL REFERENCES gdpr_erasure_log(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('storage_remove', 'auth_delete')),
  -- storage_remove : {"bucket":"...","path":"..."} (connu serveur) OU {"raw_url":"..."}
  --   (à parser côté route contre l'origine Supabase configurée + liste blanche de buckets).
  -- auth_delete    : {"user_id":"<uuid>"}.
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE internal.gdpr_cleanup_task IS
  'Tâches de nettoyage (Storage/Auth) issues d''un effacement RGPD, survivant au sujet '
  'effacé. Écrites uniquement par api.rpc_gdpr_erase_subject ; lues/acquittées uniquement '
  'par api.rpc_gdpr_get_cleanup_status / api.rpc_gdpr_ack_cleanup_task (service_role).';

CREATE INDEX IF NOT EXISTS idx_gdpr_cleanup_task_operation ON internal.gdpr_cleanup_task(operation_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_cleanup_task_pending ON internal.gdpr_cleanup_task(status) WHERE status = 'pending';

ALTER TABLE internal.gdpr_cleanup_task ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct, délibérément : zéro policy (ni lecture ni écriture). Toute lecture/tout
-- acquittement passe par les 2 RPC SECURITY DEFINER ci-dessous, elles-mêmes service_role-only.
REVOKE ALL ON internal.gdpr_cleanup_task FROM PUBLIC, anon, authenticated;
GRANT ALL ON internal.gdpr_cleanup_task TO service_role;

-- ---------------------------------------------------------------------
-- 2. audit.redact_subject — ajoute le matching after_data
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.redact_subject(
  p_table     TEXT,
  p_match_key TEXT,
  p_match_val TEXT,
  p_pii_cols  TEXT[]
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, audit, pg_temp
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE audit.audit_log
     SET before_data = before_data - p_pii_cols,
         after_data  = after_data  - p_pii_cols
   WHERE table_name = p_table
     AND ( (row_pk      ->> p_match_key) = p_match_val
        OR (before_data ->> p_match_key) = p_match_val
        OR (after_data  ->> p_match_key) = p_match_val );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
-- CREATE OR REPLACE ne retire PAS un GRANT déjà posé par le fold historique : REVOKE
-- explicitement authenticated aussi, pas seulement PUBLIC/anon.
REVOKE ALL ON FUNCTION audit.redact_subject(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION audit.redact_subject(TEXT, TEXT, TEXT, TEXT[]) TO service_role;

-- ---------------------------------------------------------------------
-- 3. api.rpc_gdpr_erase_subject — corps étendu, contrat d'entrée inchangé
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.rpc_gdpr_erase_subject(
  p_subject_kind TEXT,
  p_subject_id   TEXT,
  p_mode         TEXT DEFAULT 'anonymize',
  p_reason       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, audit, internal, pg_temp
AS $$
DECLARE
  v_uid              UUID := auth.uid();
  v_actor            UUID;
  v_user_id          UUID;
  v_prev_avatar      TEXT;
  v_report           JSONB := '{}'::jsonb;
  v_media            TEXT[] := ARRAY[]::TEXT[];
  v_photo            TEXT;
  v_int_id           UUID;
  v_task_id          UUID;
  v_url              TEXT;
  v_doc_ids          UUID[];
  v_doc_id           UUID;
  v_crm_int_ids      UUID[];
  v_crm_task_ids     UUID[];
  v_hist_id          UUID;
  v_bucket           TEXT;
  v_path             TEXT;
  v_retained_count   INTEGER := 0;
  v_unresolved_count INTEGER := 0;
  v_target_role      TEXT;
  v_operation_id     UUID := gen_random_uuid();
  v_performed_by     TEXT;
  TOMBSTONE          CONSTANT TEXT := '[Donnée effacée]';
BEGIN
  -- D4 : autorisation fail-closed. Le bypass "connexion privilégiée directe" est réservé aux
  -- rôles de maintenance CONNUS via `session_user` — JAMAIS `current_user` (qui reflète le
  -- PROPRIÉTAIRE de cette fonction SECURITY DEFINER pendant son exécution, pas l'appelant, et
  -- serait donc toujours vrai) et JAMAIS la seule absence de GUC JWT (une session authenticated/
  -- anon/service_role connectée directement, hors PostgREST, aurait aussi ce GUC absent). Toute
  -- AUTRE session — y compris un contexte REST dont le JWT serait absent/malformé — DOIT passer
  -- `api.is_platform_superuser() IS NOT TRUE` (jamais `NOT ...` seul, qui laissait passer un
  -- résultat NULL).
  -- A maintenance connection that SET ROLE authenticated must still obey the caller gate.
  -- Likewise, JWT claims on an otherwise trusted session designate a request, not maintenance.
  IF NOT (session_user IN ('postgres', 'supabase_admin')
          AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin')
          AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
          AND auth.role() IS NULL)
     AND api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Effacement RGPD réservé aux administrateurs plateforme (référent RGPD / superuser).';
  END IF;

  -- p_mode est NULLABLE côté SQL dès qu'il est passé explicitement (le DEFAULT de signature ne
  -- joue que si l'argument est OMIS) : IS NULL doit être vérifié à part, sinon `NOT IN` rend
  -- NULL (pas TRUE) et la branche IF/ELSE plus bas retombait silencieusement sur 'delete'.
  IF p_mode IS NULL OR p_mode NOT IN ('anonymize', 'delete') THEN
    RAISE EXCEPTION 'Mode invalide: % (attendu anonymize|delete)', p_mode;
  END IF;
  IF p_subject_kind IS NULL
     OR p_subject_kind NOT IN ('actor', 'incident', 'review', 'object_legal', 'contact_channel', 'user') THEN
    RAISE EXCEPTION 'Type de sujet inconnu: %', p_subject_kind;
  END IF;

  v_performed_by := COALESCE(NULLIF(current_setting('request.jwt.claim.email', true), ''),
                              v_uid::text, current_user);

  -- Le journal doit exister AVANT toute tâche de nettoyage : internal.gdpr_cleanup_task.
  -- operation_id est une FK IMMÉDIATE vers gdpr_erasure_log.id, et une tâche insérée avant
  -- cette ligne violerait systématiquement la contrainte. Le rapport définitif est posé par un
  -- UPDATE en fin de fonction, dans LA MÊME transaction — un échec plus bas annule toujours
  -- cette ligne ET les mutations/tâches déjà écrites (atomicité native de la fonction).
  INSERT INTO gdpr_erasure_log(id, subject_kind, subject_id, mode, reason, performed_by, report)
  VALUES (v_operation_id, p_subject_kind, p_subject_id, p_mode, p_reason, v_performed_by, '{}'::jsonb);

  -- =================================================================
  -- TIER A — ACTEUR
  -- =================================================================
  IF p_subject_kind = 'actor' THEN
    v_actor := p_subject_id::uuid;
    IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor) THEN
      RAISE EXCEPTION 'Acteur introuvable: %', p_subject_id;
    END IF;
    SELECT photo_url INTO v_photo FROM actor WHERE id = v_actor;
    IF v_photo IS NOT NULL THEN v_media := array_append(v_media, v_photo); END IF;

    -- Inventaire PONCTUEL (avant mutation) des documents personnels déjà référencés par cet
    -- acteur : bibliothèque privée (actor_document) + justificatifs de consentement
    -- (actor_consent.document_id). Ce n'est PAS une énumération du bucket, seulement les
    -- références déjà connues en base.
    SELECT COALESCE(array_agg(DISTINCT doc_id) FILTER (WHERE doc_id IS NOT NULL), ARRAY[]::uuid[])
      INTO v_doc_ids
      FROM (
        SELECT document_id AS doc_id FROM actor_document WHERE actor_id = v_actor
        UNION
        SELECT promoted_document_id FROM actor_document WHERE actor_id = v_actor
        UNION
        SELECT document_id FROM actor_consent WHERE actor_id = v_actor
      ) s;

    -- Capturer les IDs AVANT toute mutation : une redaction qui ne matche QUE la valeur
    -- actor_id/handled_by_actor_id manque la PII posée AVANT que la ligne soit liée à v_actor
    -- (avant_data.actor_id valait alors autre chose, souvent NULL) — rédiger PAR IDENTITÉ après
    -- coup couvre toute la vie d'audit de ces lignes, pas seulement les entrées où la valeur
    -- correspondait au moment précis de l'écriture.
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_crm_int_ids
      FROM crm_interaction WHERE actor_id = v_actor OR handled_by_actor_id = v_actor;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_crm_task_ids
      FROM crm_task WHERE actor_id = v_actor;

    -- Nettoyage PII live CRM — IDENTIQUE pour les DEUX modes. En mode delete, la FK
    -- actor_id/handled_by_actor_id est ON DELETE SET NULL (jamais CASCADE) : sans ce bloc AVANT
    -- la suppression de l'acteur, subject/body/source/extra et crm_task.title/description
    -- restaient VIVANTS malgré l'acteur disparu. CASE sur LES DEUX colonnes : une ligne où seul
    -- handled_by_actor_id porte le sujet ne doit jamais délier l'AUTRE acteur lié par actor_id.
    UPDATE crm_interaction
       SET actor_id = CASE WHEN actor_id = v_actor THEN NULL ELSE actor_id END,
           handled_by_actor_id = CASE WHEN handled_by_actor_id = v_actor THEN NULL ELSE handled_by_actor_id END,
           subject = NULL, body = NULL, source = NULL, extra = NULL
     WHERE actor_id = v_actor OR handled_by_actor_id = v_actor;
    UPDATE crm_task SET actor_id = NULL, title = TOMBSTONE, description = NULL, extra = NULL
     WHERE actor_id = v_actor;

    IF p_mode = 'anonymize' THEN
      UPDATE actor SET display_name = TOMBSTONE, first_name = NULL, last_name = NULL,
                       gender = NULL, photo_url = NULL, extra = NULL
       WHERE id = v_actor;
      -- Bibliothèque privée + consentements + canaux : PII pure, jamais conservée sous la
      -- coquille CRM, y compris en mode anonymize (même doctrine que les canaux ci-dessous).
      DELETE FROM actor_document WHERE actor_id = v_actor;
      DELETE FROM actor_consent  WHERE actor_id = v_actor;
      DELETE FROM actor_channel  WHERE actor_id = v_actor;
      v_report := jsonb_build_object('mode', 'anonymize', 'actor', v_actor);
    ELSE  -- delete : cascade actor_channel / actor_consent / actor_document / actor_object_role
      DELETE FROM actor WHERE id = v_actor;
      v_report := jsonb_build_object('mode', 'delete', 'actor', v_actor);
    END IF;

    -- Rédaction du journal d'audit — APRÈS toute mutation (une mutation ultérieure sur la
    -- même table recréerait un before_data non rédigé). actor_id ET handled_by_actor_id sont
    -- rédigés séparément : une interaction où seul handled_by_actor_id porte le sujet ne
    -- matchait jamais avec la seule clé actor_id (bug corrigé ici).
    PERFORM audit.redact_subject('actor', 'id', v_actor::text,
              ARRAY['display_name', 'first_name', 'last_name', 'gender', 'photo_url', 'extra',
                    'display_name_normalized', 'first_name_normalized', 'last_name_normalized']);
    PERFORM audit.redact_subject('actor_channel', 'actor_id', v_actor::text, ARRAY['value', 'extra']);
    PERFORM audit.redact_subject('actor_consent', 'actor_id', v_actor::text, ARRAY['source']);
    PERFORM audit.redact_subject('actor_document', 'actor_id', v_actor::text, ARRAY['title', 'notes']);
    PERFORM audit.redact_subject('crm_interaction', 'actor_id', v_actor::text,
              ARRAY['subject', 'body', 'source', 'extra', 'actor_id', 'handled_by_actor_id']);
    PERFORM audit.redact_subject('crm_interaction', 'handled_by_actor_id', v_actor::text,
              ARRAY['subject', 'body', 'source', 'extra', 'actor_id', 'handled_by_actor_id']);
    PERFORM audit.redact_subject('crm_task', 'actor_id', v_actor::text,
              ARRAY['title', 'description', 'extra', 'actor_id']);
    -- Couverture PAR IDENTITÉ (IDs capturés avant mutation) : redige la vie d'audit ENTIÈRE des
    -- lignes concernées, y compris les entrées antérieures à la liaison avec v_actor que le
    -- matching par valeur ci-dessus ne peut pas voir. Bornée aux lignes déjà identifiées ci-avant
    -- — jamais une rédaction large des tables CRM (le texte libre d'une ligne SANS RAPPORT avec
    -- ce sujet peut porter une PII distincte, hors périmètre de cet effacement).
    IF array_length(v_crm_int_ids, 1) IS NOT NULL THEN
      FOREACH v_hist_id IN ARRAY v_crm_int_ids LOOP
        PERFORM audit.redact_subject('crm_interaction', 'id', v_hist_id::text,
                  ARRAY['subject', 'body', 'source', 'extra', 'actor_id', 'handled_by_actor_id']);
      END LOOP;
    END IF;
    IF array_length(v_crm_task_ids, 1) IS NOT NULL THEN
      FOREACH v_hist_id IN ARRAY v_crm_task_ids LOOP
        PERFORM audit.redact_subject('crm_task', 'id', v_hist_id::text,
                  ARRAY['title', 'description', 'extra', 'actor_id']);
      END LOOP;
    END IF;

    IF v_photo IS NOT NULL THEN
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_photo));
    END IF;

    -- Rétention : un document reste utile s'il est encore réellement référencé ailleurs
    -- (promu vers une fiche, pièce légale/label/action en cours, justificatif de statut
    -- d'itinéraire, ou consentement/bibliothèque d'un AUTRE acteur). On ne supprime QUE les
    -- documents devenus orphelins par CET effacement — jamais un fichier partagé/promu.
    IF array_length(v_doc_ids, 1) IS NOT NULL THEN
      FOREACH v_doc_id IN ARRAY v_doc_ids LOOP
        IF EXISTS (
          SELECT 1 FROM object_document WHERE document_id = v_doc_id
          UNION ALL SELECT 1 FROM object_classification WHERE document_id = v_doc_id
          UNION ALL SELECT 1 FROM object_legal WHERE document_id = v_doc_id
          UNION ALL SELECT 1 FROM object_sustainability_action WHERE document_id = v_doc_id
          UNION ALL SELECT 1 FROM object_iti WHERE status_document_id = v_doc_id
          UNION ALL SELECT 1 FROM actor_consent WHERE document_id = v_doc_id
          UNION ALL SELECT 1 FROM actor_document WHERE document_id = v_doc_id OR promoted_document_id = v_doc_id
        ) THEN
          v_retained_count := v_retained_count + 1;
        ELSE
          SELECT storage_bucket, storage_path, url INTO v_bucket, v_path, v_url
            FROM ref_document WHERE id = v_doc_id;
          IF v_bucket IS NOT NULL AND v_path IS NOT NULL THEN
            INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
            VALUES (v_operation_id, 'storage_remove', jsonb_build_object('bucket', v_bucket, 'path', v_path));
          ELSIF v_url IS NOT NULL THEN
            INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
            VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_url));
          ELSE
            -- Aucune métadonnée de stockage exploitable : ne jamais construire une tâche vide
            -- ni disparaître silencieusement — compté explicitement comme non résolu.
            v_unresolved_count := v_unresolved_count + 1;
          END IF;
          -- Rédaction APRÈS suppression : le trigger d'audit se déclenche SUR le DELETE et
          -- recrée un before_data brut (URL/chemin en clair) à cet instant précis — rédiger
          -- AVANT n'aurait rien eu à nettoyer, puisque cette ligne d'audit n'existe pas encore.
          DELETE FROM ref_document WHERE id = v_doc_id;
          PERFORM audit.redact_subject('ref_document', 'id', v_doc_id::text,
                    ARRAY['url', 'title', 'storage_bucket', 'storage_path']);
        END IF;
      END LOOP;
    END IF;

  -- =================================================================
  -- TIER A — DÉCLARANT D'INCIDENT (citoyen)
  -- =================================================================
  ELSIF p_subject_kind = 'incident' THEN
    IF NOT EXISTS (SELECT 1 FROM incident_report WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Signalement introuvable: %', p_subject_id;
    END IF;
    SELECT crm_interaction_id, crm_task_id, media_urls
      INTO v_int_id, v_task_id, v_media
      FROM incident_report WHERE id = p_subject_id::uuid;
    v_media := COALESCE(v_media, ARRAY[]::TEXT[]);

    UPDATE incident_report
       SET reporter_email = NULL, reporter_name = NULL, description = NULL,
           media_urls = NULL, geom = NULL, metadata = NULL
     WHERE id = p_subject_id::uuid;
    IF v_int_id IS NOT NULL THEN
      UPDATE crm_interaction SET subject = NULL, body = NULL, extra = NULL WHERE id = v_int_id;
    END IF;
    -- api.create_crm_artifacts_from_incident recopie la description du signalement en clair
    -- dans crm_task.description : sans ce bloc, la PII du déclarant survivait dans la tâche
    -- CRM après l'effacement du signalement (ID collecté mais jamais exploité auparavant).
    IF v_task_id IS NOT NULL THEN
      UPDATE crm_task SET description = NULL WHERE id = v_task_id;
    END IF;

    PERFORM audit.redact_subject('incident_report', 'id', p_subject_id,
              ARRAY['reporter_email', 'reporter_name', 'description', 'media_urls', 'geom', 'metadata']);
    IF v_int_id IS NOT NULL THEN
      PERFORM audit.redact_subject('crm_interaction', 'id', v_int_id::text, ARRAY['subject', 'body', 'extra']);
    END IF;
    IF v_task_id IS NOT NULL THEN
      PERFORM audit.redact_subject('crm_task', 'id', v_task_id::text, ARRAY['description']);
    END IF;

    FOREACH v_url IN ARRAY v_media LOOP
      IF v_url IS NOT NULL THEN
        INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
        VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_url));
      END IF;
    END LOOP;
    v_report := jsonb_build_object('incident', p_subject_id, 'linked_interaction', v_int_id, 'linked_task', v_task_id);

  -- =================================================================
  -- TIER B — AUTEUR D'AVIS (sur demande, Art. 17 §2)
  -- =================================================================
  ELSIF p_subject_kind = 'review' THEN
    IF NOT EXISTS (SELECT 1 FROM object_review WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Avis introuvable: %', p_subject_id;
    END IF;
    SELECT author_avatar_url INTO v_photo FROM object_review WHERE id = p_subject_id::uuid;
    IF v_photo IS NOT NULL THEN
      v_media := array_append(v_media, v_photo);
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_photo));
    END IF;
    IF p_mode = 'delete' THEN
      DELETE FROM object_review WHERE id = p_subject_id::uuid;
    ELSE
      UPDATE object_review
         SET author_name = NULL, author_avatar_url = NULL, content = NULL,
             title = NULL, response = NULL, raw_data = NULL
       WHERE id = p_subject_id::uuid;
    END IF;
    PERFORM audit.redact_subject('object_review', 'id', p_subject_id,
              ARRAY['author_name', 'author_avatar_url', 'content', 'title', 'response', 'raw_data']);
    v_report := jsonb_build_object('review', p_subject_id);

  -- =================================================================
  -- TIER B — DONNÉE LÉGALE D'ENTREPRENEUR INDIVIDUEL (sur demande)
  -- =================================================================
  ELSIF p_subject_kind = 'object_legal' THEN
    IF NOT EXISTS (SELECT 1 FROM object_legal WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Donnée légale introuvable: %', p_subject_id;
    END IF;
    UPDATE object_legal SET value = '{}'::jsonb, note = NULL WHERE id = p_subject_id::uuid;
    PERFORM audit.redact_subject('object_legal', 'id', p_subject_id, ARRAY['value', 'note']);
    v_report := jsonb_build_object('object_legal', p_subject_id);

  -- =================================================================
  -- CONTACT PUBLIC qui s'avère personnel (cas limite)
  -- =================================================================
  ELSIF p_subject_kind = 'contact_channel' THEN
    IF NOT EXISTS (SELECT 1 FROM contact_channel WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Coordonnée introuvable: %', p_subject_id;
    END IF;
    IF p_mode = 'delete' THEN
      DELETE FROM contact_channel WHERE id = p_subject_id::uuid;
    ELSE
      UPDATE contact_channel SET value = TOMBSTONE WHERE id = p_subject_id::uuid;
    END IF;
    PERFORM audit.redact_subject('contact_channel', 'id', p_subject_id, ARRAY['value']);
    v_report := jsonb_build_object('contact_channel', p_subject_id);

  -- =================================================================
  -- UTILISATEUR INTERNE (profil applicatif ; auth.users → tâche auth_delete, hors SQL)
  -- =================================================================
  ELSIF p_subject_kind = 'user' THEN
    -- Casse canonicalisée AVANT toute comparaison/chemin : p_subject_id est TEXT (pas UUID),
    -- donc un appelant qui envoie un UUID en MAJUSCULES ne doit ni échapper à l'anti-self ni
    -- produire un chemin Storage distinct de l'objet réel (la casse d'un chemin est
    -- significative, contrairement à celle d'un uuid::text une fois casté).
    v_user_id := p_subject_id::uuid;
    IF NOT EXISTS (SELECT 1 FROM app_user_profile WHERE id = v_user_id) THEN
      RAISE EXCEPTION 'Profil utilisateur introuvable: %', p_subject_id;
    END IF;

    -- Garde-fous de compte — mêmes invariants que /api/admin/delete-user (SEC-01) : un
    -- compte auth.users traverse toutes les organisations, ce n'est jamais une capacité
    -- d'ORG. Anti-self par égalité UUID (jamais texte/casse) ; owner jamais ciblé
    -- directement ; super_admin réservé à un owner via la RPC canonique (jamais
    -- app_metadata/user_metadata côté client).
    IF v_user_id = v_uid THEN
      RAISE EXCEPTION 'Auto-effacement refusé : un administrateur ne peut pas se cibler lui-même.';
    END IF;
    SELECT role, avatar_url INTO v_target_role, v_prev_avatar FROM app_user_profile WHERE id = v_user_id;
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'Cible = compte owner de la plateforme : effacement direct interdit.';
    END IF;
    IF v_target_role = 'super_admin' AND (SELECT api.is_platform_owner()) IS NOT TRUE THEN
      RAISE EXCEPTION 'Seul un owner de la plateforme peut effacer un compte super administrateur.';
    END IF;

    UPDATE app_user_profile
       SET display_name = NULL, avatar_url = NULL, preferences = '{}'::jsonb
     WHERE id = v_user_id;
    PERFORM audit.redact_subject('app_user_profile', 'id', v_user_id::text,
              ARRAY['display_name', 'avatar_url', 'preferences']);

    -- Avatar : chemin CONNU du serveur (convention figée par /api/avatar/upload) TOUJOURS mis
    -- en file, plus l'avatar_url PRÉCÉDENT réellement enregistré s'il diffère (donnée historique
    -- pouvant pointer ailleurs) — dédoublonné par comparaison textuelle pour ne pas mettre deux
    -- fois la même cible en file.
    INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
    VALUES (v_operation_id, 'storage_remove',
            jsonb_build_object('bucket', 'avatars', 'path', v_user_id::text || '/avatar.jpg'));
    IF v_prev_avatar IS NOT NULL
       AND v_prev_avatar NOT LIKE '%/avatars/' || v_user_id::text || '/avatar.jpg%' THEN
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_prev_avatar));
    END IF;

    IF p_mode = 'delete' THEN
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'auth_delete', jsonb_build_object('user_id', v_user_id::text));
      -- PAS de champ authRetained ici : la suppression n'est que DEMANDÉE (tâche en file), le
      -- statut réel est celui de la tâche auth_delete (pending/succeeded/failed), jamais une
      -- affirmation posée à l'instant de l'appel.
      v_report := jsonb_build_object('user', v_user_id, 'authDeletionRequested', true,
                    'note', 'Suppression auth.users mise en file (tâche auth_delete) — statut réel = celui de la tâche, exécutée par l''API Admin Supabase, hors SQL.');
    ELSE
      v_report := jsonb_build_object('user', v_user_id, 'authRetained', true, 'authDeletionRequested', false,
                    'note', 'Anonymisation du PROFIL uniquement : le compte auth.users est CONSERVÉ. Ce n''est PAS une anonymisation complète de la personne.');
    END IF;

  ELSE
    RAISE EXCEPTION 'Type de sujet inconnu: %', p_subject_kind;
  END IF;

  -- Rapport honnête : pas d'affirmation globale « PII purgée » ; le périmètre non couvert
  -- (orphelins historiques hors de cet instantané ponctuel) est dit explicitement plutôt
  -- qu'assumé résolu.
  v_report := v_report || jsonb_build_object(
    'operationId', v_operation_id,
    'media_to_delete', to_jsonb(v_media),
    'retainedSharedDocuments', v_retained_count,
    'unresolvedDocuments', v_unresolved_count,
    'manualReviewRequired', (v_retained_count > 0) OR (v_unresolved_count > 0),
    'unresolvedScope', jsonb_build_object(
      'historicalStorageOrphans', 'non balayé — inventaire ponctuel des seules références connues en base, pas une énumération du bucket',
      'concurrentUploads', 'non couvert par cet instantané ponctuel (upload concurrent possible)',
      'backupsAndCaches', 'hors périmètre de ce lot'
    )
  );

  -- Le journal a déjà été inséré (report vide) AVANT toute mutation/tâche, pour que la FK de
  -- internal.gdpr_cleanup_task soit satisfaite : on ne fait ici qu'y poser le rapport définitif.
  UPDATE gdpr_erasure_log SET report = v_report WHERE id = v_operation_id;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION api.rpc_gdpr_erase_subject(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.rpc_gdpr_erase_subject(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION api.rpc_gdpr_erase_subject(TEXT, TEXT, TEXT, TEXT) IS
  'Effacement/anonymisation RGPD Art. 17 d''un sujet. Anonymise (défaut) ou supprime les '
  'lignes vivantes, rédige le journal d''audit (row_pk/before_data/after_data), détache les '
  'documents personnels devenus orphelins (retient les documents encore utilisés ailleurs), '
  'met en file les suppressions Storage/Auth (internal.gdpr_cleanup_task), journalise dans '
  'gdpr_erasure_log et retourne un rapport incluant operationId. Gated superuser plateforme. '
  'Pour subject_kind=''user'', mode=''anonymize'' NE supprime JAMAIS le compte auth.users '
  '(anonymisation du PROFIL uniquement) ; mode=''delete'' met en file une tâche auth_delete '
  '(exécutée hors SQL) et refuse self/owner/super_admin (sauf appelant owner).';

-- ---------------------------------------------------------------------
-- 4. Lecture et acquittement des tâches — service_role uniquement
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.rpc_gdpr_get_cleanup_status(p_operation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $$
DECLARE
  v_log   gdpr_erasure_log;
  v_tasks JSONB;
BEGIN
  SELECT * INTO v_log FROM gdpr_erasure_log WHERE id = p_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opération RGPD introuvable: %', p_operation_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'action', t.action, 'metadata', t.metadata,
           'status', t.status, 'attempts', t.attempts, 'lastError', t.last_error
         ) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_tasks
    FROM internal.gdpr_cleanup_task t
   WHERE t.operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'operationId', v_log.id,
    'subjectKind', v_log.subject_kind,
    'subjectId', v_log.subject_id,
    'mode', v_log.mode,
    'reason', v_log.reason,
    'performedBy', v_log.performed_by,
    'performedAt', v_log.performed_at,
    'report', v_log.report,
    'tasks', v_tasks
  );
END;
$$;
REVOKE ALL ON FUNCTION api.rpc_gdpr_get_cleanup_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.rpc_gdpr_get_cleanup_status(UUID) TO service_role;
COMMENT ON FUNCTION api.rpc_gdpr_get_cleanup_status(UUID) IS
  'Recharge une opération RGPD (journal + tâches) par operationId, pour reprise sans '
  'jamais rappeler api.rpc_gdpr_erase_subject. service_role uniquement — le serveur '
  'Next.js revérifie lui-même JWT + api.is_platform_superuser AVANT cet appel.';

CREATE OR REPLACE FUNCTION api.rpc_gdpr_ack_cleanup_task(
  p_operation_id UUID,
  p_task_id      UUID,
  p_success      BOOLEAN,
  p_error        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $$
DECLARE
  v_prior_status TEXT;
  v_status       TEXT;
  v_attempts     INTEGER;
BEGIN
  SELECT status INTO v_prior_status
    FROM internal.gdpr_cleanup_task
   WHERE id = p_task_id AND operation_id = p_operation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tâche de nettoyage RGPD introuvable pour cette opération: %/%', p_operation_id, p_task_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent : une tâche déjà acquittée avec succès ne repasse jamais à échec/pending —
  -- un appel dupliqué depuis une reprise ne doit ni recompter un essai ni régresser l'état.
  IF v_prior_status = 'succeeded' THEN
    SELECT status, attempts INTO v_status, v_attempts FROM internal.gdpr_cleanup_task WHERE id = p_task_id;
    RETURN jsonb_build_object('id', p_task_id, 'status', v_status, 'attempts', v_attempts);
  END IF;

  UPDATE internal.gdpr_cleanup_task
     SET status = CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,
         attempts = attempts + 1,
         last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, 'unknown_error'), 500) END,
         updated_at = NOW()
   WHERE id = p_task_id
  RETURNING status, attempts INTO v_status, v_attempts;

  RETURN jsonb_build_object('id', p_task_id, 'status', v_status, 'attempts', v_attempts);
END;
$$;
REVOKE ALL ON FUNCTION api.rpc_gdpr_ack_cleanup_task(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.rpc_gdpr_ack_cleanup_task(UUID, UUID, BOOLEAN, TEXT) TO service_role;
COMMENT ON FUNCTION api.rpc_gdpr_ack_cleanup_task(UUID, UUID, BOOLEAN, TEXT) IS
  'Acquitte une tâche de nettoyage RGPD (succès/échec, message tronqué à 500 car.). '
  'Idempotent : un acquittement répété d''une tâche déjà succeeded ne régresse rien. '
  'service_role uniquement, association operation_id/task_id stricte.';

COMMIT;
