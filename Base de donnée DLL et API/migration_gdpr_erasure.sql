-- =====================================================================
-- migration_gdpr_erasure.sql
-- Capacité d'effacement / anonymisation RGPD (Art. 17) + rédaction du journal d'audit
-- Plan : docs/conformite-rgpd/PLAN_effacement_art17.md  (décisions D1–D4 actées 2026-06-16)
--
-- Cadrage (proportionnalité) : Bertel est un référentiel touristique, ~99 % de données
-- publiques (personnes morales). Cet outil agit PAR SUJET IDENTIFIÉ sur les seules données
-- personnelles (Tier A non-public : acteurs/CRM/contacts privés ; Tier B publié sur demande :
-- avis, données légales d'entrepreneurs individuels). Il NE balaie jamais le référentiel public.
--
-- Choix (D1–D4) :
--   D1 anonymisation par défaut (tombstone, FK préservées) ; suppression dure en option ('delete').
--   D2 rédaction ciblée du journal d'audit (audit.audit_log) : on retire la PII, on garde l'événement.
--   D3 object_version : rédigé via le même mécanisme (table auditée comme les autres).
--   D4 déclenchement réservé aux administrateurs plateforme (api.is_platform_superuser()) ;
--      une connexion privilégiée directe sans JWT (migration / test / psql) est autorisée.
--
-- Invariants respectés : SECURITY DEFINER + search_path restreint, gen_random_uuid()
-- (PAS uuid_generate_v4 — extensions hors search_path), REVOKE anon/PUBLIC, idempotent.
--
-- À FAIRE APRÈS RELECTURE (hors de ce fichier) :
--   * supprimer les fichiers Storage retournés dans le rapport (route serveur service-role) ;
--   * la suppression du compte auth.users (kind='user', mode 'delete') passe par l'API Admin
--     Supabase Auth (hors SQL) — ce fichier anonymise app_user_profile uniquement ;
--   * ajouter ce fichier au manifest + docs/SQL_ROLLOUT_RUNBOOK.md (intégrité de déploiement).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registre des effacements exécutés (preuve Art. 5.2 / 30)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gdpr_erasure_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind  TEXT NOT NULL CHECK (subject_kind IN
                  ('actor','incident','review','object_legal','contact_channel','user')),
  subject_id    TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('anonymize','delete')),
  reason        TEXT,
  performed_by  TEXT,                 -- e-mail JWT ou rôle de la connexion privilégiée
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report        JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE gdpr_erasure_log IS
  'Journal des effacements/anonymisations RGPD (Art. 17). Écrit uniquement par api.rpc_gdpr_erase_subject.';

ALTER TABLE gdpr_erasure_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_erasure_log_admin_read ON gdpr_erasure_log;
CREATE POLICY gdpr_erasure_log_admin_read ON gdpr_erasure_log
  FOR SELECT TO authenticated
  USING ((SELECT api.is_platform_superuser()));   -- §39 : auth wrappé en InitPlan
-- Pas de policy d'écriture : seul le RPC DEFINER (propriétaire superuser) insère, en bypass RLS.

REVOKE ALL ON gdpr_erasure_log FROM PUBLIC, anon;
GRANT SELECT ON gdpr_erasure_log TO authenticated;
GRANT ALL    ON gdpr_erasure_log TO service_role;

-- ---------------------------------------------------------------------
-- 2. Rédaction ciblée du journal d'audit pour un sujet (D2)
--    Retire les clés PII de before_data/after_data des lignes d'audit qui
--    concernent le sujet, en matchant SOIT la PK (row_pk), SOIT le contenu
--    (before_data ->> fk) — ce dernier capture les lignes DELETE dont la PK
--    ne porte pas la FK (ex. actor_channel : row_pk = {id}, mais
--    before_data porte actor_id).  ( null::jsonb - text[] = null : sans danger )
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.redact_subject(
  p_table     TEXT,
  p_match_key TEXT,     -- clé à comparer dans row_pk / before_data (ex. 'id', 'actor_id')
  p_match_val TEXT,     -- valeur recherchée
  p_pii_cols  TEXT[]    -- clés JSON à effacer des snapshots
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, audit
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE audit.audit_log
     SET before_data = before_data - p_pii_cols,
         after_data  = after_data  - p_pii_cols
   WHERE table_name = p_table
     AND ( (row_pk      ->> p_match_key) = p_match_val
        OR (before_data ->> p_match_key) = p_match_val );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION audit.redact_subject(TEXT,TEXT,TEXT,TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION audit.redact_subject(TEXT,TEXT,TEXT,TEXT[]) TO service_role;

-- ---------------------------------------------------------------------
-- 3. RPC principal : effacement / anonymisation d'un sujet (Art. 17)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.rpc_gdpr_erase_subject(
  p_subject_kind TEXT,
  p_subject_id   TEXT,
  p_mode         TEXT DEFAULT 'anonymize',   -- 'anonymize' | 'delete'
  p_reason       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, audit
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_actor       UUID;
  v_report      JSONB := '{}'::jsonb;
  v_media       TEXT[] := ARRAY[]::TEXT[];
  v_n           INTEGER;
  v_photo       TEXT;
  v_int_id      UUID;
  v_task_id     TEXT;
  TOMBSTONE     CONSTANT TEXT := '[Donnée effacée]';
BEGIN
  -- D4 : autorisation. Une connexion privilégiée SANS JWT (migration / test / psql) passe ;
  -- toute requête PostgREST (qui porte un JWT) doit être superuser plateforme.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'Effacement RGPD réservé aux administrateurs plateforme (référent RGPD / superuser).';
  END IF;

  IF p_mode NOT IN ('anonymize','delete') THEN
    RAISE EXCEPTION 'Mode invalide: % (attendu anonymize|delete)', p_mode;
  END IF;

  -- =================================================================
  -- TIER A — ACTEUR (cas principal : identité + canaux + consentements + CRM)
  -- =================================================================
  IF p_subject_kind = 'actor' THEN
    v_actor := p_subject_id::uuid;
    IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor) THEN
      RAISE EXCEPTION 'Acteur introuvable: %', p_subject_id;
    END IF;
    SELECT photo_url INTO v_photo FROM actor WHERE id = v_actor;
    IF v_photo IS NOT NULL THEN v_media := array_append(v_media, v_photo); END IF;

    IF p_mode = 'anonymize' THEN
      -- Identité (les colonnes normalisées GENERATED se recalculent automatiquement)
      UPDATE actor SET display_name = TOMBSTONE, first_name = NULL, last_name = NULL,
                       gender = NULL, photo_url = NULL, extra = NULL
       WHERE id = v_actor;
      -- CRM : on conserve la coquille (activité d'équipe) mais on retire la PII et le lien acteur.
      -- subject=NULL : le trigger auto_populate régénère un sujet générique (sans PII).
      UPDATE crm_interaction
         SET actor_id = NULL,
             handled_by_actor_id = CASE WHEN handled_by_actor_id = v_actor THEN NULL ELSE handled_by_actor_id END,
             subject = NULL, body = NULL, source = NULL, extra = NULL
       WHERE actor_id = v_actor OR handled_by_actor_id = v_actor;
      UPDATE crm_task SET actor_id = NULL, title = TOMBSTONE, description = NULL, extra = NULL
       WHERE actor_id = v_actor;
      -- Canaux & consentements : PII pure → suppression
      DELETE FROM actor_consent  WHERE actor_id = v_actor;
      DELETE FROM actor_channel  WHERE actor_id = v_actor;
      v_report := jsonb_build_object('mode','anonymize','actor', v_actor);
    ELSE  -- delete : suppression dure (cascade actor_channel / actor_consent / actor_object_role)
      DELETE FROM actor WHERE id = v_actor;
      v_report := jsonb_build_object('mode','delete','actor', v_actor);
    END IF;

    -- Rédaction du journal d'audit (couvre UPDATE et DELETE)
    PERFORM audit.redact_subject('actor','id', v_actor::text,
              ARRAY['display_name','first_name','last_name','gender','photo_url','extra',
                    'display_name_normalized','first_name_normalized','last_name_normalized']);
    PERFORM audit.redact_subject('actor_channel','actor_id', v_actor::text, ARRAY['value','extra']);
    PERFORM audit.redact_subject('actor_consent','actor_id', v_actor::text, ARRAY['source']);
    PERFORM audit.redact_subject('crm_interaction','actor_id', v_actor::text,
              ARRAY['subject','body','source','extra','actor_id','handled_by_actor_id']);
    PERFORM audit.redact_subject('crm_task','actor_id', v_actor::text,
              ARRAY['title','description','extra','actor_id']);

  -- =================================================================
  -- TIER A — DÉCLARANT D'INCIDENT (citoyen)
  -- =================================================================
  ELSIF p_subject_kind = 'incident' THEN
    IF NOT EXISTS (SELECT 1 FROM incident_report WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Signalement introuvable: %', p_subject_id;
    END IF;
    SELECT crm_interaction_id, crm_task_id INTO v_int_id, v_task_id
      FROM incident_report WHERE id = p_subject_id::uuid;
    UPDATE incident_report
       SET reporter_email = NULL, reporter_name = NULL, description = NULL,
           media_urls = NULL, geom = NULL, metadata = NULL
     WHERE id = p_subject_id::uuid;
    -- Artefacts CRM dérivés du signalement (subject/body recopiés par le trigger)
    IF v_int_id IS NOT NULL THEN
      UPDATE crm_interaction SET subject = NULL, body = NULL, extra = NULL WHERE id = v_int_id;
      PERFORM audit.redact_subject('crm_interaction','id', v_int_id::text,
                ARRAY['subject','body','extra']);
    END IF;
    PERFORM audit.redact_subject('incident_report','id', p_subject_id,
              ARRAY['reporter_email','reporter_name','description','media_urls','geom','metadata']);
    v_report := jsonb_build_object('incident', p_subject_id, 'linked_interaction', v_int_id);

  -- =================================================================
  -- TIER B — AUTEUR D'AVIS (sur demande, Art. 17 §2)
  -- =================================================================
  ELSIF p_subject_kind = 'review' THEN
    IF NOT EXISTS (SELECT 1 FROM object_review WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Avis introuvable: %', p_subject_id;
    END IF;
    SELECT author_avatar_url INTO v_photo FROM object_review WHERE id = p_subject_id::uuid;
    IF v_photo IS NOT NULL THEN v_media := array_append(v_media, v_photo); END IF;
    IF p_mode = 'delete' THEN
      DELETE FROM object_review WHERE id = p_subject_id::uuid;
    ELSE
      UPDATE object_review
         SET author_name = NULL, author_avatar_url = NULL, content = NULL,
             title = NULL, response = NULL, raw_data = NULL
       WHERE id = p_subject_id::uuid;
    END IF;
    PERFORM audit.redact_subject('object_review','id', p_subject_id,
              ARRAY['author_name','author_avatar_url','content','title','response','raw_data']);
    v_report := jsonb_build_object('review', p_subject_id);

  -- =================================================================
  -- TIER B — DONNÉE LÉGALE D'ENTREPRENEUR INDIVIDUEL (sur demande)
  -- =================================================================
  ELSIF p_subject_kind = 'object_legal' THEN
    IF NOT EXISTS (SELECT 1 FROM object_legal WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Donnée légale introuvable: %', p_subject_id;
    END IF;
    UPDATE object_legal SET value = '{}'::jsonb, note = NULL WHERE id = p_subject_id::uuid;
    PERFORM audit.redact_subject('object_legal','id', p_subject_id, ARRAY['value','note']);
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
    PERFORM audit.redact_subject('contact_channel','id', p_subject_id, ARRAY['value']);
    v_report := jsonb_build_object('contact_channel', p_subject_id);

  -- =================================================================
  -- UTILISATEUR INTERNE (profil applicatif ; auth.users → API Admin Supabase, hors SQL)
  -- =================================================================
  ELSIF p_subject_kind = 'user' THEN
    IF NOT EXISTS (SELECT 1 FROM app_user_profile WHERE id = p_subject_id::uuid) THEN
      RAISE EXCEPTION 'Profil utilisateur introuvable: %', p_subject_id;
    END IF;
    UPDATE app_user_profile
       SET display_name = NULL, avatar_url = NULL, preferences = '{}'::jsonb
     WHERE id = p_subject_id::uuid;
    PERFORM audit.redact_subject('app_user_profile','id', p_subject_id,
              ARRAY['display_name','avatar_url','preferences']);
    v_report := jsonb_build_object('user', p_subject_id,
                  'note','Supprimer le compte auth.users via l''API Admin Supabase (hors SQL).');

  ELSE
    RAISE EXCEPTION 'Type de sujet inconnu: %', p_subject_kind;
  END IF;

  -- Fichiers Storage à supprimer côté serveur (média = string sans FK, pas de cascade)
  v_report := v_report || jsonb_build_object('media_to_delete', to_jsonb(v_media));

  -- Trace de preuve
  INSERT INTO gdpr_erasure_log(subject_kind, subject_id, mode, reason, performed_by, report)
  VALUES (p_subject_kind, p_subject_id, p_mode, p_reason,
          COALESCE(NULLIF(current_setting('request.jwt.claim.email', true), ''),
                   v_uid::text, current_user),
          v_report);

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION api.rpc_gdpr_erase_subject(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.rpc_gdpr_erase_subject(TEXT,TEXT,TEXT,TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION api.rpc_gdpr_erase_subject(TEXT,TEXT,TEXT,TEXT) IS
  'Effacement/anonymisation RGPD Art. 17 d''un sujet (acteur/incident/avis/legal/contact/user). '
  'Anonymise (défaut) ou supprime les lignes vivantes, rédige le journal d''audit, journalise dans '
  'gdpr_erasure_log et retourne les URLs Storage à supprimer côté serveur. Gated superuser plateforme.';
