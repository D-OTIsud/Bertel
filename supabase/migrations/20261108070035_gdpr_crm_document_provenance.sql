-- Reprend le protocole durable 19a (20260905195257) sur une base où il manque, puis
-- complète l'inventaire de l'effacement d'un acteur avec les documents de ses tâches CRM
-- et les reçus internal.crm_document_detachment / internal.crm_document_upload.
-- Source canonique : Base de donnée DLL et API/gdpr_crm_document_provenance.sql (copie exacte).
--
-- Trois états reconnus strictement, avec effacement déjà fermé aux rôles API :
--  * base hébergée : journal seul, ancien corps d'effacement connu, tuple durable absent ;
--  * base fraîche : tuple 19a + garde realm + lecteur de statut durci + fermeture de 205 ;
--  * rejeu : post-état exact de cette migration, sans autre effet que des remplacements identiques.
-- Tout autre état est refusé avant la moindre écriture : tuple partiel, corps ou attributs
-- inconnus, dérive de la table de tâches ou des tables de provenance.
--
-- Cette migration N'ACTIVE RIEN : toutes les RPC RGPD restent réservées au propriétaire.
-- Un reçu de provenance sert à retrouver et à rédiger ; il n'autorise ni DELETE d'une ligne
-- centrale ni tâche Storage. Seul un lien vivant du sujet ouvre la voie de suppression de 19a.
-- Verrous de la future activation, NON résolus ici et rappelés par report.unresolvedScope :
-- alias/copies Storage, générations d'objet, avatar du compte portail.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;

-- Aides de session retirées avant le COMMIT. Elles ne lisent que le catalogue, pour que le
-- préflight et le post-état classent les mêmes faits avant et après les écritures.
CREATE FUNCTION pg_temp.gdpr_provenance_sorted(p_values text[])
RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT COALESCE(jsonb_agg(v ORDER BY v COLLATE "C"), '[]'::jsonb) FROM unnest(p_values) v;
$helper$;

-- Bénéficiaires hors propriétaire ; « * » signale un droit de réattribution.
CREATE FUNCTION pg_temp.gdpr_provenance_grants(p_acl aclitem[], p_type "char", p_owner oid)
RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT pg_temp.gdpr_provenance_sorted(ARRAY(
    SELECT DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
           || CASE WHEN p_type = 'r' THEN ':' || a.privilege_type ELSE '' END
           || CASE WHEN a.is_grantable THEN '*' ELSE '' END
    FROM aclexplode(COALESCE(p_acl, acldefault(p_type, p_owner))) a
    WHERE a.grantee <> p_owner
  ));
$helper$;

-- p_raw_md5 reprend le calcul exact de la garde 20261108010225 pour l'ancien corps.
CREATE FUNCTION pg_temp.gdpr_provenance_function(p_signature text, p_raw_md5 boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT jsonb_build_object(
    'owner', pg_get_userbyid(p.proowner), 'kind', p.prokind, 'language', l.lanname,
    'arguments', pg_get_function_arguments(p.oid), 'result', pg_get_function_result(p.oid),
    'definer', p.prosecdef, 'volatility', p.provolatile, 'strict', p.proisstrict,
    'leakproof', p.proleakproof, 'parallel', p.proparallel, 'returns_set', p.proretset,
    'config', to_jsonb(p.proconfig),
    'overloads', (SELECT count(*) FROM pg_proc o
                  WHERE o.pronamespace = p.pronamespace AND o.proname = p.proname),
    'grants', pg_temp.gdpr_provenance_grants(p.proacl, 'f', p.proowner),
    'md5', md5(CASE WHEN p_raw_md5 THEN p.prosrc ELSE replace(p.prosrc, chr(13), '') END)
  )
  FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
  WHERE p.oid = to_regprocedure(p_signature);
$helper$;

CREATE FUNCTION pg_temp.gdpr_provenance_expected_function(
  p_arguments text, p_result text, p_language text, p_volatility text, p_definer boolean,
  p_config text, p_md5 text, p_grants text[]
) RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT jsonb_build_object(
    'owner', 'postgres', 'kind', 'f', 'language', p_language,
    'arguments', p_arguments, 'result', p_result,
    'definer', p_definer, 'volatility', p_volatility, 'strict', false,
    'leakproof', false, 'parallel', 'u', 'returns_set', false,
    'config', jsonb_build_array(p_config), 'overloads', 1,
    'grants', pg_temp.gdpr_provenance_sorted(p_grants), 'md5', p_md5
  );
$helper$;

-- CREATE TABLE IF NOT EXISTS ne compare que le nom : ce descripteur compare la structure.
CREATE FUNCTION pg_temp.gdpr_provenance_table(p_table text)
RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT jsonb_build_object(
    'kind', c.relkind, 'persistence', c.relpersistence, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'forced_rls', c.relforcerowsecurity,
    'options', to_jsonb(c.reloptions), 'partition', c.relispartition,
    'inherits', EXISTS (SELECT 1 FROM pg_inherits i WHERE c.oid IN (i.inhrelid, i.inhparent)),
    'grants', pg_temp.gdpr_provenance_grants(c.relacl, 'r', c.relowner),
    'columns', (SELECT jsonb_agg(concat_ws('|', a.attname, format_type(a.atttypid, a.atttypmod),
                  a.attnotnull, pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attnum)
                FROM pg_attribute a
                LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
    'plain_columns', (SELECT bool_and(a.attidentity = '' AND a.attgenerated = ''
                        AND a.attcollation IN (0, 100) AND a.attacl IS NULL)
                      FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
    -- Les NOT NULL nommés de PG18 sont déjà couverts par les colonnes.
    'constraints', pg_temp.gdpr_provenance_sorted(ARRAY(
      SELECT pg_get_constraintdef(x.oid) FROM pg_constraint x
      WHERE x.conrelid = c.oid AND x.contype <> 'n')),
    'indexes', pg_temp.gdpr_provenance_sorted(ARRAY(
      SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i WHERE i.indrelid = c.oid)),
    'valid_indexes', (SELECT bool_and(i.indisvalid AND i.indisready AND i.indislive)
                      FROM pg_index i WHERE i.indrelid = c.oid),
    'triggers', (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = c.oid AND NOT g.tgisinternal),
    'policies', (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid),
    'rules', (SELECT count(*) FROM pg_rewrite r WHERE r.ev_class = c.oid)
  )
  FROM pg_class c WHERE c.oid = to_regclass(p_table);
$helper$;

CREATE FUNCTION pg_temp.gdpr_provenance_expected_table(
  p_columns text[], p_constraints text[], p_indexes text[], p_grants text[]
) RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT jsonb_build_object(
    'kind', 'r', 'persistence', 'p', 'owner', 'postgres',
    'rls', true, 'forced_rls', false, 'options', NULL::text,
    'partition', false, 'inherits', false,
    -- GRANT ALL signifie tous les privilèges natifs de table de cette version PG,
    -- chacun sans GRANT OPTION. Un bénéficiaire seul ne prouve pas ces droits.
    'grants', pg_temp.gdpr_provenance_sorted(ARRAY(
      SELECT g || ':' || a.privilege_type
      FROM unnest(p_grants) g
      CROSS JOIN LATERAL aclexplode(acldefault('r', 'postgres'::regrole)) a
      WHERE a.grantee = 'postgres'::regrole
    )),
    'columns', to_jsonb(p_columns), 'plain_columns', true,
    'constraints', pg_temp.gdpr_provenance_sorted(p_constraints),
    'indexes', pg_temp.gdpr_provenance_sorted(p_indexes), 'valid_indexes', true,
    'triggers', 0, 'policies', 0, 'rules', 0
  );
$helper$;

CREATE FUNCTION pg_temp.gdpr_provenance_oids()
RETURNS jsonb LANGUAGE sql AS $helper$
  SELECT jsonb_build_object(
    'erase', to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)')::oid::text,
    'status', to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)')::oid::text,
    'ack', to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)')::oid::text,
    'redact', to_regprocedure('audit.redact_subject(text,text,text,text[])')::oid::text,
    'referenced', to_regprocedure('internal.gdpr_document_is_referenced(uuid)')::oid::text,
    'tasks', to_regclass('internal.gdpr_cleanup_task')::oid::text
  );
$helper$;

-- Classe la base : hosted, fresh, applied, ou une dérive. Les empreintes sont celles des
-- textes publics : garde 20261108010225, 19a + garde realm + lecteur 202, corps de ce fichier.
CREATE FUNCTION pg_temp.gdpr_provenance_state()
RETURNS text LANGUAGE plpgsql AS $helper$
DECLARE
  c_erase_args CONSTANT text :=
    $x$p_subject_kind text, p_subject_id text, p_mode text DEFAULT 'anonymize'::text, p_reason text DEFAULT NULL::text$x$;
  c_ack_args CONSTANT text :=
    $x$p_operation_id uuid, p_task_id uuid, p_success boolean, p_error text DEFAULT NULL::text$x$;
  c_redact_args CONSTANT text := 'p_table text, p_match_key text, p_match_val text, p_pii_cols text[]';
  c_legacy_path CONSTANT text := 'search_path=pg_catalog, public, api, auth, audit';
  c_erase_path CONSTANT text := 'search_path=pg_catalog, public, api, auth, audit, internal, pg_temp';
  c_rpc_path CONSTANT text := 'search_path=pg_catalog, public, api, auth, internal, pg_temp';
  c_redact_path CONSTANT text := 'search_path=pg_catalog, public, api, auth, audit, pg_temp';
  -- Corps public de schema_unified et migration_gdpr_erasure, qui ne diffèrent que par les
  -- espaces. Aucune empreinte native de cet ancien corps n'est publiée.
  c_legacy_redact_source CONSTANT text :=
    'DECLARE v_count INTEGER; BEGIN UPDATE audit.audit_log SET before_data = before_data - p_pii_cols, '
    'after_data = after_data - p_pii_cols WHERE table_name = p_table AND ( (row_pk ->> p_match_key) = p_match_val '
    'OR (before_data ->> p_match_key) = p_match_val ); GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count; END;';
  c_task_columns CONSTANT text[] := ARRAY[
    'id|uuid|t|gen_random_uuid()', 'operation_id|uuid|t', 'action|text|t',
    $x$metadata|jsonb|t|'{}'::jsonb$x$, $x$status|text|t|'pending'::text$x$, 'attempts|integer|t|0',
    'last_error|text|f', 'created_at|timestamp with time zone|t|now()',
    'updated_at|timestamp with time zone|t|now()'];
  c_task_constraints CONSTANT text[] := ARRAY[
    'PRIMARY KEY (id)',
    'FOREIGN KEY (operation_id) REFERENCES public.gdpr_erasure_log(id) ON DELETE CASCADE',
    $x$CHECK ((action = ANY (ARRAY['storage_remove'::text, 'auth_delete'::text])))$x$,
    $x$CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))$x$];
  c_task_indexes CONSTANT text[] := ARRAY[
    'CREATE UNIQUE INDEX gdpr_cleanup_task_pkey ON internal.gdpr_cleanup_task USING btree (id)',
    'CREATE INDEX idx_gdpr_cleanup_task_operation ON internal.gdpr_cleanup_task USING btree (operation_id)',
    $x$CREATE INDEX idx_gdpr_cleanup_task_pending ON internal.gdpr_cleanup_task USING btree (status) WHERE (status = 'pending'::text)$x$];
  v_erase jsonb := pg_temp.gdpr_provenance_function('api.rpc_gdpr_erase_subject(text,text,text,text)');
  v_erase_raw jsonb := pg_temp.gdpr_provenance_function('api.rpc_gdpr_erase_subject(text,text,text,text)', true);
  v_status jsonb := pg_temp.gdpr_provenance_function('api.rpc_gdpr_get_cleanup_status(uuid)');
  v_ack jsonb := pg_temp.gdpr_provenance_function('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)');
  v_redact jsonb := pg_temp.gdpr_provenance_function('audit.redact_subject(text,text,text,text[])');
  v_referenced jsonb := pg_temp.gdpr_provenance_function('internal.gdpr_document_is_referenced(uuid)');
  v_tasks jsonb := pg_temp.gdpr_provenance_table('internal.gdpr_cleanup_task');
  v_redact_source text;
  v_expected_status jsonb;
BEGIN
  -- Lecture structurelle des deux tables de provenance publiées par 203 et 205.
  IF pg_temp.gdpr_provenance_table('internal.crm_document_detachment')
     IS DISTINCT FROM pg_temp.gdpr_provenance_expected_table(
       ARRAY['id|uuid|t|gen_random_uuid()', 'parent_kind|text|t', 'parent_id|uuid|t', 'document_id|uuid|t',
             'subject_actor_id|uuid|f', 'storage_bucket|text|f', 'storage_path|text|f', 'detached_by|uuid|t',
             'detached_at|timestamp with time zone|t|clock_timestamp()'],
       ARRAY['PRIMARY KEY (id)',
             $x$CHECK ((parent_kind = ANY (ARRAY['actor'::text, 'task'::text])))$x$,
             $x$CHECK ((((storage_bucket IS NULL) AND (storage_path IS NULL)) OR ((storage_bucket IS NOT NULL) AND (storage_bucket = 'actor-documents'::text) AND (storage_path IS NOT NULL) AND (storage_path <> ''::text) AND (storage_path !~ '(^[[:space:]]*/|^[[:space:]]*[A-Za-z][A-Za-z0-9+.-]*:|[?#[:cntrl:]])'::text))))$x$],
       ARRAY['CREATE UNIQUE INDEX crm_document_detachment_pkey ON internal.crm_document_detachment USING btree (id)',
             'CREATE INDEX crm_document_detachment_subject_idx ON internal.crm_document_detachment USING btree (subject_actor_id) WHERE (subject_actor_id IS NOT NULL)'],
       ARRAY[]::text[])
     OR pg_temp.gdpr_provenance_table('internal.crm_document_upload')
     IS DISTINCT FROM pg_temp.gdpr_provenance_expected_table(
       ARRAY['id|uuid|t', 'parent_kind|text|t', 'parent_id|uuid|t', 'prepared_actor_id|uuid|f', 'uploaded_by|uuid|t',
             'storage_bucket|text|t', 'storage_path|text|t', 'title|text|t', 'mime_type|text|t', 'size_bytes|bigint|t',
             'sha256|text|t', $x$state|text|t|'prepared'::text$x$,
             'prepared_at|timestamp with time zone|t|clock_timestamp()', 'uploaded_at|timestamp with time zone|f',
             'attached_at|timestamp with time zone|f', 'attached_actor_id|uuid|f'],
       ARRAY['PRIMARY KEY (id)', 'UNIQUE (storage_path)',
             $x$CHECK ((parent_kind = ANY (ARRAY['actor'::text, 'task'::text])))$x$,
             $x$CHECK ((storage_bucket = 'actor-documents'::text))$x$,
             $x$CHECK ((btrim(title) <> ''::text))$x$,
             $x$CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text])))$x$,
             'CHECK ((size_bytes > 0))',
             $x$CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))$x$,
             $x$CHECK ((state = ANY (ARRAY['prepared'::text, 'uploaded'::text, 'attached'::text])))$x$,
             $x$CHECK (((state = 'prepared'::text) = (uploaded_at IS NULL)))$x$,
             $x$CHECK (((state = 'attached'::text) = (attached_at IS NOT NULL)))$x$],
       ARRAY['CREATE UNIQUE INDEX crm_document_upload_pkey ON internal.crm_document_upload USING btree (id)',
             'CREATE UNIQUE INDEX crm_document_upload_storage_path_key ON internal.crm_document_upload USING btree (storage_path)',
             'CREATE INDEX crm_document_upload_prepared_actor_idx ON internal.crm_document_upload USING btree (prepared_actor_id) WHERE (prepared_actor_id IS NOT NULL)',
             'CREATE INDEX crm_document_upload_attached_actor_idx ON internal.crm_document_upload USING btree (attached_actor_id) WHERE (attached_actor_id IS NOT NULL)',
             'CREATE INDEX crm_document_upload_parent_idx ON internal.crm_document_upload USING btree (parent_kind, parent_id)',
             'CREATE INDEX crm_document_upload_user_idx ON internal.crm_document_upload USING btree (uploaded_by)'],
       ARRAY[]::text[]) THEN
    RETURN 'provenance_drift';
  END IF;

  IF v_tasks IS NULL AND v_status IS NULL AND v_ack IS NULL THEN
    SELECT btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) INTO v_redact_source
      FROM pg_proc p WHERE p.oid = to_regprocedure('audit.redact_subject(text,text,text,text[])');
    -- REVOKE déjà prévu retire ces seuls bénéficiaires de l'ancien audit.redact_subject.
    IF v_referenced IS NULL
       AND v_erase_raw = pg_temp.gdpr_provenance_expected_function(
             c_erase_args, 'jsonb', 'plpgsql', 'v', true, c_legacy_path,
             'e2105031945db1ef4efd383e6493a9b0', ARRAY[]::text[])
       AND (v_redact - 'md5' - 'grants') = (pg_temp.gdpr_provenance_expected_function(
             c_redact_args, 'integer', 'plpgsql', 'v', true, c_legacy_path, NULL, ARRAY[]::text[]) - 'md5' - 'grants')
       AND v_redact_source = c_legacy_redact_source
       AND (v_redact->'grants') <@ '["PUBLIC","anon","authenticated","service_role"]'::jsonb THEN
      RETURN 'hosted';
    END IF;
    RETURN 'unknown';
  END IF;

  v_expected_status := pg_temp.gdpr_provenance_expected_function(
    'p_operation_id uuid', 'jsonb', 'plpgsql', 's', true, c_rpc_path,
    '78c52d53e6a63d2f31ac9dd4e7aac45e', ARRAY[]::text[]);

  IF v_referenced IS NULL
     AND v_erase = pg_temp.gdpr_provenance_expected_function(
           c_erase_args, 'jsonb', 'plpgsql', 'v', true, c_erase_path,
           'e86cb9995f847cb682937d546a8bb19b', ARRAY[]::text[])
     AND v_status = v_expected_status
     AND v_ack = pg_temp.gdpr_provenance_expected_function(
           c_ack_args, 'jsonb', 'plpgsql', 'v', true, c_rpc_path,
           '13f8d5878152b590c91b6de20129287f', ARRAY['service_role'])
     AND v_redact = pg_temp.gdpr_provenance_expected_function(
           c_redact_args, 'integer', 'plpgsql', 'v', true, c_redact_path,
           'a153930278afbb25e0dc0e7b3d6cc2d1', ARRAY['service_role']) THEN
    IF v_tasks IS NOT DISTINCT FROM pg_temp.gdpr_provenance_expected_table(
         c_task_columns, c_task_constraints, c_task_indexes, ARRAY['service_role']) THEN
      RETURN 'fresh';
    END IF;
    RETURN 'cleanup_drift';
  END IF;

  IF v_referenced = pg_temp.gdpr_provenance_expected_function(
       'p_document_id uuid', 'boolean', 'sql', 'v', false, 'search_path=pg_catalog, pg_temp',
       '2916aadcc7602518bdb3481ca19394d8', ARRAY[]::text[])
     AND v_erase = pg_temp.gdpr_provenance_expected_function(
           c_erase_args, 'jsonb', 'plpgsql', 'v', true, c_erase_path,
           '690e95cd8f9eee68300c38cec1414714', ARRAY[]::text[])
     AND v_status = v_expected_status
     AND v_ack = pg_temp.gdpr_provenance_expected_function(
           c_ack_args, 'jsonb', 'plpgsql', 'v', true, c_rpc_path,
           '4ae4fdd854b43a8aeb909c2502e4e70a', ARRAY[]::text[])
     AND v_redact = pg_temp.gdpr_provenance_expected_function(
           c_redact_args, 'integer', 'plpgsql', 'v', true, c_redact_path,
           'a153930278afbb25e0dc0e7b3d6cc2d1', ARRAY[]::text[]) THEN
    IF v_tasks IS NOT DISTINCT FROM pg_temp.gdpr_provenance_expected_table(
         c_task_columns, c_task_constraints, c_task_indexes, ARRAY[]::text[]) THEN
      RETURN 'applied';
    END IF;
    RETURN 'cleanup_drift';
  END IF;

  RETURN 'unknown';
END;
$helper$;

DO $preflight$
DECLARE
  v_state text;
  v_tuple_count integer;
  v_erase regprocedure := to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)');
  v_redact regprocedure := to_regprocedure('audit.redact_subject(text,text,text,text[])');
BEGIN
  IF to_regclass('public.gdpr_erasure_log') IS NULL
     OR to_regclass('public.crm_task_document') IS NULL
     OR to_regclass('internal.crm_document_detachment') IS NULL
     OR to_regclass('internal.crm_document_upload') IS NULL
     OR to_regclass('internal.portal_photo_analysis') IS NULL
     OR to_regprocedure('internal.actor_in_current_realm(uuid)') IS NULL THEN
    RAISE EXCEPTION 'GDPR provenance prerequisites are missing';
  END IF;

  SELECT count(*) INTO v_tuple_count FROM (VALUES
    (to_regclass('internal.gdpr_cleanup_task') IS NOT NULL),
    (to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)') IS NOT NULL),
    (to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)') IS NOT NULL)
  ) members(present) WHERE present;
  IF v_tuple_count NOT IN (0, 3) THEN
    RAISE EXCEPTION 'GDPR durable cleanup contract is partially installed';
  END IF;

  IF v_erase IS NULL OR v_redact IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = v_erase AND p.prosecdef AND p.proowner = 'postgres'::pg_catalog.regrole
  ) THEN
    RAISE EXCEPTION 'Unexpected GDPR erasure predecessor';
  END IF;
  -- Remplacer un effacement encore exposé publierait immédiatement le nouveau corps.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    WHERE p.oid = v_erase AND a.grantee <> p.proowner
  ) THEN
    RAISE EXCEPTION 'GDPR erasure must already be closed to API roles';
  END IF;

  -- Un effacement fermé mais inconnu ne doit jamais être remplacé.
  v_state := pg_temp.gdpr_provenance_state();
  IF v_state = 'provenance_drift' THEN
    RAISE EXCEPTION 'Unexpected CRM document provenance shape';
  ELSIF v_state = 'cleanup_drift' THEN
    RAISE EXCEPTION 'Unexpected internal.gdpr_cleanup_task shape';
  ELSIF v_state NOT IN ('hosted', 'fresh', 'applied') THEN
    RAISE EXCEPTION 'Unexpected GDPR erasure predecessor';
  END IF;

  PERFORM set_config('gdpr_provenance.oids', pg_temp.gdpr_provenance_oids()::text, true);
END;
$preflight$;

-- ---------------------------------------------------------------------
-- 1. Tâches de nettoyage (19a). Aucun rôle API : l'accès passe par les RPC.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal.gdpr_cleanup_task (
  id            uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  operation_id  uuid NOT NULL REFERENCES public.gdpr_erasure_log(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN ('storage_remove', 'auth_delete')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at    timestamptz NOT NULL DEFAULT pg_catalog.now()
);
COMMENT ON TABLE internal.gdpr_cleanup_task IS
  'Tâches de nettoyage (Storage/Auth) issues d''un effacement RGPD, survivant au sujet effacé. '
  'Écrites par api.rpc_gdpr_erase_subject, lues et acquittées par les RPC de statut et d''acquittement.';
CREATE INDEX IF NOT EXISTS idx_gdpr_cleanup_task_operation ON internal.gdpr_cleanup_task(operation_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_cleanup_task_pending ON internal.gdpr_cleanup_task(status) WHERE status = 'pending';
ALTER TABLE internal.gdpr_cleanup_task ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal.gdpr_cleanup_task FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. audit.redact_subject : correspondance after_data (19a)
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

-- ---------------------------------------------------------------------
-- 3. Rétention : toutes les références connues d'un document, sans filtre
--    de statut de fiche. Toute FK entrante reste épinglée par le test.
--    VOLATILE : relit l'état courant après les retraits du sujet et les verrous.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.gdpr_document_is_referenced(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.object_document x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM public.object_classification x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM public.object_legal x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM public.object_sustainability_action x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM public.object_iti x WHERE x.status_document_id = p_document_id
    UNION ALL SELECT 1 FROM public.actor_consent x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM public.actor_document x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM public.actor_document x WHERE x.promoted_document_id = p_document_id
    -- FK ON DELETE CASCADE : supprimer le catalogue retirerait ce lien en silence.
    UNION ALL SELECT 1 FROM public.crm_task_document x WHERE x.document_id = p_document_id
    UNION ALL SELECT 1 FROM internal.portal_photo_analysis x WHERE x.document_id = p_document_id
    -- Une photo publiée n'est reliée à sa source que par ces marqueurs.
    UNION ALL SELECT 1 FROM public.media m WHERE m.extra->>'portal_document_id' = p_document_id::text
    UNION ALL SELECT 1 FROM public.ref_document d
      WHERE d.id = p_document_id AND d.extra->>'published_media_id' IS NOT NULL
    -- Une autre entrée du catalogue peut désigner le même objet Storage.
    UNION ALL SELECT 1 FROM public.ref_document o
      JOIN public.ref_document d ON d.id = p_document_id
      WHERE o.id <> d.id AND o.storage_bucket = d.storage_bucket AND o.storage_path = d.storage_path
  );
$function$;
COMMENT ON FUNCTION internal.gdpr_document_is_referenced(uuid) IS
  'Vrai si un document reste utilisé hors du sujet effacé. Réservé à api.rpc_gdpr_erase_subject.';

-- ---------------------------------------------------------------------
-- 4. api.rpc_gdpr_erase_subject : corps 19a + garde realm + provenance CRM
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
  v_uid                  UUID := auth.uid();
  v_actor                UUID;
  v_portal_user          UUID;
  v_user_id              UUID;
  v_prev_avatar          TEXT;
  v_report               JSONB := '{}'::jsonb;
  v_media                TEXT[] := ARRAY[]::TEXT[];
  v_photo                TEXT;
  v_int_id               UUID;
  v_task_id              UUID;
  v_url                  TEXT;
  v_doc_ids              UUID[] := ARRAY[]::uuid[];
  v_receipt_doc_ids      UUID[] := ARRAY[]::uuid[];
  v_receipt_only_doc_ids UUID[] := ARRAY[]::uuid[];
  v_upload_ids           UUID[] := ARRAY[]::uuid[];
  v_detachment_ids       UUID[] := ARRAY[]::uuid[];
  v_unattached_uploads   UUID[] := ARRAY[]::uuid[];
  v_doc_id               UUID;
  v_crm_int_ids          UUID[];
  v_crm_task_ids         UUID[] := ARRAY[]::uuid[];
  v_hist_id              UUID;
  v_bucket               TEXT;
  v_path                 TEXT;
  v_retained_count       INTEGER := 0;
  v_unresolved_count     INTEGER := 0;
  v_target_role          TEXT;
  v_operation_id         UUID := gen_random_uuid();
  v_performed_by         TEXT;
  TOMBSTONE              CONSTANT TEXT := '[Donnée effacée]';
BEGIN
  -- D4 : le bypass de maintenance exige session_user connu, aucun SET ROLE et aucun claim.
  -- current_user vaudrait toujours le propriétaire dans cette fonction DEFINER.
  IF NOT (session_user IN ('postgres', 'supabase_admin')
          AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin')
          AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
          AND auth.role() IS NULL)
     AND api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Effacement RGPD réservé aux administrateurs plateforme (référent RGPD / superuser).';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('anonymize', 'delete') THEN
    RAISE EXCEPTION 'Mode invalide: % (attendu anonymize|delete)', p_mode;
  END IF;
  IF p_subject_kind IS NULL
     OR p_subject_kind NOT IN ('actor', 'incident', 'review', 'object_legal', 'contact_channel', 'user') THEN
    RAISE EXCEPTION 'Type de sujet inconnu: %', p_subject_kind;
  END IF;

  -- Même verrou sujet que begin_avatar_upload, avant journal et mutations.
  IF p_subject_kind = 'user' THEN
    PERFORM internal.gdpr_assert_no_avatar_upload(p_subject_id::uuid);
  END IF;

  v_performed_by := COALESCE(NULLIF(current_setting('request.jwt.claim.email', true), ''),
                              v_uid::text, current_user);

  -- La FK des tâches impose le journal d'abord. Toute exception annule aussi cette ligne.
  INSERT INTO gdpr_erasure_log(id, subject_kind, subject_id, mode, reason, performed_by, report)
  VALUES (v_operation_id, p_subject_kind, p_subject_id, p_mode, p_reason, v_performed_by, '{}'::jsonb);

  -- =================================================================
  -- TIER A — ACTEUR
  -- =================================================================
  IF p_subject_kind = 'actor' THEN
    v_actor := p_subject_id::uuid;
    IF NOT internal.actor_in_current_realm(v_actor) THEN
      RAISE EXCEPTION 'Actor access denied' USING ERRCODE = '42501';
    END IF; /* actor-realm:erasure */
    IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor) THEN
      RAISE EXCEPTION 'Acteur introuvable: %', p_subject_id;
    END IF;

    -- Ordre commun aux RPC CRM : parent, tâches, puis catalogue. Ces verrous bloquent les
    -- préparations, rattachements et retraits concurrents avant l'inventaire.
    SELECT photo_url INTO v_photo FROM actor WHERE id = v_actor FOR UPDATE;
    IF v_photo IS NOT NULL THEN v_media := array_append(v_media, v_photo); END IF;
    PERFORM 1 FROM public.crm_task WHERE actor_id = v_actor ORDER BY id FOR UPDATE;

    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_crm_int_ids
      FROM crm_interaction WHERE actor_id = v_actor OR handled_by_actor_id = v_actor;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_crm_task_ids
      FROM crm_task WHERE actor_id = v_actor;

    -- Liens vivants du sujet : seuls candidats à la suppression (droit 19a).
    SELECT COALESCE(array_agg(DISTINCT s.doc_id) FILTER (WHERE s.doc_id IS NOT NULL), ARRAY[]::uuid[])
      INTO v_doc_ids
      FROM (
        SELECT document_id AS doc_id FROM actor_document WHERE actor_id = v_actor
        UNION SELECT promoted_document_id FROM actor_document WHERE actor_id = v_actor
        UNION SELECT document_id FROM actor_consent WHERE actor_id = v_actor
        UNION SELECT document_id FROM public.crm_task_document WHERE task_id = ANY(v_crm_task_ids)
      ) s;

    -- Reçus : retrouvés par instantané acteur ou par parent, y compris sans lien restant.
    SELECT COALESCE(array_agg(u.id), ARRAY[]::uuid[]) INTO v_upload_ids
      FROM internal.crm_document_upload u
     WHERE u.prepared_actor_id = v_actor OR u.attached_actor_id = v_actor
        OR (u.parent_kind = 'actor' AND u.parent_id = v_actor)
        OR (u.parent_kind = 'task' AND u.parent_id = ANY(v_crm_task_ids));
    SELECT COALESCE(array_agg(d.id), ARRAY[]::uuid[]) INTO v_detachment_ids
      FROM internal.crm_document_detachment d
     WHERE d.subject_actor_id = v_actor
        OR (d.parent_kind = 'actor' AND d.parent_id = v_actor)
        OR (d.parent_kind = 'task' AND d.parent_id = ANY(v_crm_task_ids));

    SELECT COALESCE(array_agg(DISTINCT s.doc_id), ARRAY[]::uuid[]) INTO v_receipt_doc_ids
      FROM (
        SELECT d.document_id AS doc_id FROM internal.crm_document_detachment d WHERE d.id = ANY(v_detachment_ids)
        UNION SELECT u.id FROM internal.crm_document_upload u WHERE u.id = ANY(v_upload_ids) AND u.state = 'attached'
      ) s
     WHERE NOT s.doc_id = ANY(v_doc_ids)
       AND EXISTS (SELECT 1 FROM public.ref_document r WHERE r.id = s.doc_id);

    -- Une FK prend KEY SHARE sur le catalogue : ce verrou fige ses références jusqu'au COMMIT.
    PERFORM d.id FROM public.ref_document d
     WHERE d.id = ANY(v_doc_ids || v_receipt_doc_ids) ORDER BY d.id FOR UPDATE;

    -- Le protocole ne sait ni interrompre une publication ni solder une analyse en cours.
    IF EXISTS (
      SELECT 1 FROM public.actor_document a
      JOIN public.ref_document d ON d.id = a.document_id
      WHERE a.actor_id = v_actor AND d.extra->>'source' = 'portal_photo'
        AND ((NULLIF(d.extra->>'approval_claim_id', '') IS NOT NULL
              AND (d.extra->>'approval_claim_until')::timestamptz > now())
          OR EXISTS (
            SELECT 1 FROM public.pending_change pc
            WHERE pc.status = 'pending' AND pc.metadata->>'rpc' = 'publish_portal_photo_additions'
              AND pc.payload->'additions' @> jsonb_build_array(jsonb_build_object('upload_id', d.id::text))
          ))
    ) OR EXISTS (
      SELECT 1 FROM internal.portal_photo_analysis x
      WHERE x.actor_id = v_actor AND x.state IN ('reserved', 'started')
    ) THEN
      RAISE EXCEPTION 'Effacement refusé : une photo du portail est en cours de validation ou d''analyse. Réessayez après sa résolution.'
        USING ERRCODE = '55000';
    END IF;

    -- Portail 18a §8 : capturer le compte et couper l'accès AVANT les deux modes.
    UPDATE app_user_profile SET actor_id = NULL WHERE actor_id = v_actor
    RETURNING id INTO v_portal_user;
    IF to_regclass('public.fiche_submission') IS NOT NULL THEN
      UPDATE fiche_submission SET note = NULL
       WHERE actor_id = v_actor OR submitted_by = v_portal_user;
    END IF;

    -- Nettoyage PII CRM identique pour les deux modes : les FK acteur sont SET NULL.
    UPDATE crm_interaction
       SET actor_id = CASE WHEN actor_id = v_actor THEN NULL ELSE actor_id END,
           handled_by_actor_id = CASE WHEN handled_by_actor_id = v_actor THEN NULL ELSE handled_by_actor_id END,
           subject = NULL, body = NULL, source = NULL, extra = NULL
     WHERE actor_id = v_actor OR handled_by_actor_id = v_actor;
    UPDATE crm_task SET actor_id = NULL, title = TOMBSTONE, description = NULL, extra = NULL
     WHERE actor_id = v_actor;

    -- Les tâches survivent déliées : leurs pièces jointes quittent la coquille, et seul
    -- ce lien disparaît pour un document encore utilisé ailleurs.
    DELETE FROM public.crm_task_document WHERE task_id = ANY(v_crm_task_ids);

    -- Rédaction des reçus sans retirer la preuve du fichier non attaché.
    WITH redacted AS (
      UPDATE internal.crm_document_upload u
         SET title = TOMBSTONE,
             prepared_actor_id = NULLIF(u.prepared_actor_id, v_actor),
             attached_actor_id = NULLIF(u.attached_actor_id, v_actor)
       WHERE u.id = ANY(v_upload_ids)
       RETURNING u.id, u.state
    )
    SELECT COALESCE(array_agg(r.id ORDER BY r.id) FILTER (WHERE r.state <> 'attached'), ARRAY[]::uuid[])
      INTO v_unattached_uploads FROM redacted r;
    UPDATE internal.crm_document_detachment
       SET subject_actor_id = NULL
     WHERE id = ANY(v_detachment_ids) AND subject_actor_id = v_actor;

    IF p_mode = 'anonymize' THEN
      UPDATE actor SET display_name = TOMBSTONE, first_name = NULL, last_name = NULL,
                       gender = NULL, photo_url = NULL, extra = NULL
       WHERE id = v_actor;
      DELETE FROM actor_document WHERE actor_id = v_actor;
      DELETE FROM actor_consent  WHERE actor_id = v_actor;
      DELETE FROM actor_channel  WHERE actor_id = v_actor;
      v_report := jsonb_build_object('mode', 'anonymize', 'actor', v_actor);
    ELSE  -- delete : cascade actor_channel / actor_consent / actor_document / actor_object_role
      DELETE FROM actor WHERE id = v_actor;
      v_report := jsonb_build_object('mode', 'delete', 'actor', v_actor);
    END IF;

    IF v_portal_user IS NOT NULL THEN
      v_report := v_report || jsonb_build_object('portal_user_id', v_portal_user,
        'portal_note', 'Compte portail délié. Supprimer auth.users via l''API Admin (action Révoquer de la fiche CRM).');
    END IF;

    -- Rédaction d'audit APRÈS toute mutation, sinon une écriture recréerait un before_data brut.
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
    PERFORM audit.redact_subject('app_user_profile', 'actor_id', v_actor::text,
              ARRAY['actor_id', 'display_name', 'avatar_url', 'preferences']);
    IF v_portal_user IS NOT NULL THEN
      PERFORM audit.redact_subject('app_user_profile', 'id', v_portal_user::text,
                ARRAY['actor_id', 'display_name', 'avatar_url', 'preferences']);
    END IF;
    -- Par identité : couvre l'historique des lignes antérieur à leur liaison au sujet.
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
        PERFORM audit.redact_subject('crm_task_document', 'task_id', v_hist_id::text, ARRAY['title']);
      END LOOP;
    END IF;

    IF v_photo IS NOT NULL THEN
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_photo));
    END IF;

    -- Liens vivants : suppression seulement si plus rien n'utilise le document.
    IF array_length(v_doc_ids, 1) IS NOT NULL THEN
      FOREACH v_doc_id IN ARRAY v_doc_ids LOOP
        IF internal.gdpr_document_is_referenced(v_doc_id) THEN
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
            v_unresolved_count := v_unresolved_count + 1;
          END IF;
          -- Le trigger d'audit écrit sur le DELETE : rédiger ensuite.
          DELETE FROM ref_document WHERE id = v_doc_id;
          PERFORM audit.redact_subject('ref_document', 'id', v_doc_id::text,
                    ARRAY['url', 'title', 'storage_bucket', 'storage_path']);
        END IF;
      END LOOP;
    END IF;

    -- Reçus seuls : aucune suppression ni tâche. Sans autre usage, seul le titre est rédigé.
    IF array_length(v_receipt_doc_ids, 1) IS NOT NULL THEN
      FOREACH v_doc_id IN ARRAY v_receipt_doc_ids LOOP
        IF internal.gdpr_document_is_referenced(v_doc_id) THEN
          v_retained_count := v_retained_count + 1;
        ELSE
          UPDATE ref_document SET title = NULL WHERE id = v_doc_id;
          PERFORM audit.redact_subject('ref_document', 'id', v_doc_id::text, ARRAY['title']);
          v_receipt_only_doc_ids := array_append(v_receipt_only_doc_ids, v_doc_id);
        END IF;
      END LOOP;
    END IF;

    v_report := v_report || jsonb_build_object('crmProvenance', jsonb_build_object(
      'detachmentReceipts', cardinality(v_detachment_ids),
      'uploadReceipts', cardinality(v_upload_ids),
      'unattachedUploadIds', to_jsonb(v_unattached_uploads),
      'receiptOnlyDocumentIds', to_jsonb(v_receipt_only_doc_ids)
    ));

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
    -- api.create_crm_artifacts_from_incident recopie la description dans la tâche.
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
    -- Le cast canonicalise la casse avant l'anti-self et la construction du chemin.
    v_user_id := p_subject_id::uuid;
    IF NOT EXISTS (SELECT 1 FROM app_user_profile WHERE id = v_user_id) THEN
      RAISE EXCEPTION 'Profil utilisateur introuvable: %', p_subject_id;
    END IF;

    -- Mêmes invariants que /api/admin/delete-user (SEC-01).
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

    INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
    VALUES (v_operation_id, 'storage_remove',
            jsonb_build_object('bucket', 'avatars', 'path', v_user_id::text || '/avatar.jpg'));
    IF v_prev_avatar IS NOT NULL
       AND v_prev_avatar NOT LIKE '%/avatars/' || v_user_id::text || '/avatar.jpg%' THEN
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'storage_remove', jsonb_build_object('raw_url', v_prev_avatar));
    END IF;

    PERFORM internal.gdpr_enqueue_avatar_inventory(v_operation_id, v_user_id);

    IF p_mode = 'delete' THEN
      INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
      VALUES (v_operation_id, 'auth_delete', jsonb_build_object('user_id', v_user_id::text));
      v_report := jsonb_build_object('user', v_user_id, 'authDeletionRequested', true,
                    'note', 'Suppression auth.users mise en file (tâche auth_delete) — statut réel = celui de la tâche, exécutée par l''API Admin Supabase, hors SQL.');
    ELSE
      v_report := jsonb_build_object('user', v_user_id, 'authRetained', true, 'authDeletionRequested', false,
                    'note', 'Anonymisation du PROFIL uniquement : le compte auth.users est CONSERVÉ. Ce n''est PAS une anonymisation complète de la personne.');
    END IF;

  ELSE
    RAISE EXCEPTION 'Type de sujet inconnu: %', p_subject_kind;
  END IF;

  v_report := v_report || jsonb_build_object(
    'operationId', v_operation_id,
    'media_to_delete', to_jsonb(v_media),
    'retainedSharedDocuments', v_retained_count,
    'unresolvedDocuments', v_unresolved_count,
    'manualReviewRequired', (v_retained_count > 0) OR (v_unresolved_count > 0)
      OR cardinality(v_unattached_uploads) > 0 OR cardinality(v_receipt_only_doc_ids) > 0,
    'unresolvedScope', jsonb_build_object(
      'historicalStorageOrphans', 'non balayé — inventaire ponctuel des seules références connues en base, pas une énumération du bucket',
      'concurrentUploads', 'non couvert par cet instantané ponctuel (upload concurrent possible)',
      'backupsAndCaches', 'hors périmètre de ce lot',
      'storageAliasesAndGenerations', 'verrou de la future activation — copies, alias et générations d''objet non résolus par ce SQL',
      'portalAccountAvatar', 'verrou de la future activation — avatar du compte portail délié non traité par l''effacement d''un acteur'
    )
  );

  UPDATE gdpr_erasure_log SET report = v_report WHERE id = v_operation_id;

  RETURN v_report;
END;
$$;

COMMENT ON FUNCTION api.rpc_gdpr_erase_subject(TEXT, TEXT, TEXT, TEXT) IS
  'Effacement/anonymisation RGPD Art. 17 d''un sujet, atomique et journalisé. Les documents CRM '
  'du sujet sont inventoriés avec leurs reçus de provenance ; un reçu ne donne aucun droit de '
  'suppression et tout document encore utilisé est conservé. Réservé au propriétaire jusqu''à '
  'la qualification globale de l''activation.';

-- ---------------------------------------------------------------------
-- 5. Lecture et acquittement (corps durcis existants)
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
  SELECT * INTO v_log FROM gdpr_erasure_log WHERE id = p_operation_id
    AND report->'operationId' = to_jsonb(p_operation_id);
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

  -- Idempotent : un acquittement rejoué ne recompte rien et ne régresse pas un succès.
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

-- ---------------------------------------------------------------------
-- 6. Fermeture : propriétaire seul, vérifiée avant le COMMIT
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  api.rpc_gdpr_erase_subject(text, text, text, text),
  api.rpc_gdpr_get_cleanup_status(uuid),
  api.rpc_gdpr_ack_cleanup_task(uuid, uuid, boolean, text),
  audit.redact_subject(text, text, text, text[]),
  internal.gdpr_document_is_referenced(uuid)
FROM PUBLIC, anon, authenticated, service_role;

DO $closed$
DECLARE
  v_signature text;
  v_oid oid;
  v_role text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'api.rpc_gdpr_erase_subject(text,text,text,text)',
    'api.rpc_gdpr_get_cleanup_status(uuid)',
    'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)',
    'audit.redact_subject(text,text,text,text[])',
    'internal.gdpr_document_is_referenced(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = v_oid AND a.grantee <> p.proowner
    ) THEN
      RAISE EXCEPTION 'GDPR function is not owner-only: %', v_signature;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'GDPR function retains API execution: %', v_signature;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'internal.gdpr_cleanup_task',
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'GDPR cleanup table retains API access';
    END IF;
  END LOOP;
END;
$closed$;

-- Post-état exact : toute dérive annule la transaction. Les objets déjà présents gardent leur OID.
DO $poststate$
DECLARE
  v_before jsonb := NULLIF(current_setting('gdpr_provenance.oids', true), '')::jsonb;
BEGIN
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'GDPR provenance preflight snapshot is missing';
  END IF;
  IF pg_temp.gdpr_provenance_state() IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'GDPR provenance post-state does not match the expected catalog';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(v_before) b
    JOIN jsonb_each_text(pg_temp.gdpr_provenance_oids()) a USING (key)
    WHERE b.value IS NOT NULL AND a.value IS DISTINCT FROM b.value
  ) THEN
    RAISE EXCEPTION 'GDPR provenance changed the identity of an existing object';
  END IF;
END;
$poststate$;

DROP FUNCTION pg_temp.gdpr_provenance_state();
DROP FUNCTION pg_temp.gdpr_provenance_oids();
DROP FUNCTION pg_temp.gdpr_provenance_expected_table(text[], text[], text[], text[]);
DROP FUNCTION pg_temp.gdpr_provenance_table(text);
DROP FUNCTION pg_temp.gdpr_provenance_expected_function(text, text, text, text, boolean, text, text, text[]);
DROP FUNCTION pg_temp.gdpr_provenance_function(text, boolean);
DROP FUNCTION pg_temp.gdpr_provenance_grants(aclitem[], "char", oid);
DROP FUNCTION pg_temp.gdpr_provenance_sorted(text[]);

NOTIFY pgrst, 'reload schema';
COMMIT;
