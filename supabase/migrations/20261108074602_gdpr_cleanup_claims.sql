-- Claim durable et exclusif des tâches de nettoyage RGPD 19a, avant tout effet Storage/Auth.
-- Réutilise gdpr_erasure_log et internal.gdpr_cleanup_task : aucune table, aucun protocole générique.
--
-- La cible normalisée est calculée par le normaliseur strict du serveur (origine, bucket, chemin).
-- Ce SQL ne parse aucune URL : il compare une clé canonique {bucket,path} à sa métadonnée et ne
-- vérifie que la forme d'une clé issue de raw_url.
--
-- Un seul propriétaire d'effet par cible, toutes opérations confondues. Une autre tâche visant la
-- même cible est liée à ce reçu et n'émet aucun effet ; elle ne devient succeeded que si ce reçu
-- réussit.
--
-- Une tentative dont l'issue est inconnue (claim sans ACK, réponse provider perdue ou en erreur)
-- reste définitive : ni TTL, ni adoption, ni nouveau claim, ni rejeu. Seule une tentative acquittée
-- comme refusée AVANT tout effet libère la tâche.
--
-- Cette migration N'ACTIVE RIEN : RPC et table restent réservées au propriétaire jusqu'à une
-- release explicite. La clé historique réutilisable par un writer legacy/privilégié reste une
-- contrainte opérationnelle hors de ce lot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $prerequisites$
BEGIN
  IF pg_catalog.to_regclass('public.gdpr_erasure_log') IS NULL
     OR pg_catalog.to_regclass('internal.gdpr_cleanup_task') IS NULL
     OR pg_catalog.to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)') IS NULL THEN
    RAISE EXCEPTION 'GDPR cleanup claims require the complete durable tuple';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'internal.gdpr_cleanup_task'::pg_catalog.regclass
       AND c.conname = 'gdpr_cleanup_task_operation_id_fkey'
       AND c.contype = 'f' AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Unexpected internal.gdpr_cleanup_task operation foreign key';
  END IF;
END;
$prerequisites$;

LOCK TABLE public.gdpr_erasure_log, internal.gdpr_cleanup_task IN ACCESS EXCLUSIVE MODE;

-- Avant cette migration, un effet a pu partir sans trace d'ACK : aucune tâche non réussie ne peut
-- recevoir de claim sans inventer son histoire. Le propriétaire doit la résoudre séparément.
DO $preclaim_queue$
BEGIN
  IF EXISTS (SELECT 1 FROM internal.gdpr_cleanup_task t WHERE t.status <> 'succeeded') THEN
    RAISE EXCEPTION 'gdpr_cleanup_preclaim_queue_not_empty' USING ERRCODE = '55000';
  END IF;
END;
$preclaim_queue$;

-- Colonnes serveur uniquement : le statut visible reste pending/succeeded/failed.
ALTER TABLE internal.gdpr_cleanup_task
  ADD COLUMN target_key      text,
  ADD COLUMN attempt_id      uuid,
  ADD COLUMN attempt_state   text,
  ADD COLUMN receipt_task_id uuid;

-- Les reçus ne doivent jamais disparaître avec leur journal.
ALTER TABLE internal.gdpr_cleanup_task
  DROP CONSTRAINT gdpr_cleanup_task_operation_id_fkey,
  ADD CONSTRAINT gdpr_cleanup_task_operation_id_fkey
    FOREIGN KEY (operation_id) REFERENCES public.gdpr_erasure_log(id) ON DELETE RESTRICT,
  ADD CONSTRAINT gdpr_cleanup_task_receipt_fkey
    FOREIGN KEY (receipt_task_id) REFERENCES internal.gdpr_cleanup_task(id) ON DELETE RESTRICT,
  ADD CONSTRAINT gdpr_cleanup_task_attempt_check CHECK (
    (attempt_state IS NULL AND attempt_id IS NULL)
    OR (attempt_id IS NOT NULL AND target_key IS NOT NULL AND (
         (attempt_state = 'claimed'   AND status = 'pending')
      OR (attempt_state = 'succeeded' AND status = 'succeeded')
      OR (attempt_state = 'unknown'   AND status = 'failed')))
  ),
  ADD CONSTRAINT gdpr_cleanup_task_receipt_check CHECK (
    receipt_task_id IS NULL
    OR (attempt_state IS NULL AND target_key IS NOT NULL AND receipt_task_id <> id)
  );

-- Un seul propriétaire d'effet par cible : filet de sécurité du verrou consultatif ci-dessous.
CREATE UNIQUE INDEX gdpr_cleanup_task_target_owner_key
  ON internal.gdpr_cleanup_task(target_key) WHERE attempt_state IS NOT NULL;
CREATE UNIQUE INDEX gdpr_cleanup_task_attempt_key
  ON internal.gdpr_cleanup_task(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX gdpr_cleanup_task_receipt_idx
  ON internal.gdpr_cleanup_task(receipt_task_id) WHERE receipt_task_id IS NOT NULL;

-- Claims et ACK d'une même cible se sérialisent ici, toujours avant les verrous de lignes.
-- READ COMMITTED garantit qu'après l'attente chaque instruction voit le dernier état commis.
CREATE FUNCTION internal.gdpr_cleanup_lock_target(p_target_key text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'gdpr_cleanup_requires_read_committed' USING ERRCODE = '0A000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gdpr-cleanup-target:' || p_target_key, 0));
END;
$function$;

CREATE FUNCTION api.rpc_gdpr_claim_cleanup_task(
  p_operation_id      uuid,
  p_task_id           uuid,
  p_attempt_id        uuid,
  p_expected_action   text,
  p_expected_metadata jsonb,
  p_target_key        text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_task   internal.gdpr_cleanup_task%ROWTYPE;
  v_owner  internal.gdpr_cleanup_task%ROWTYPE;
  v_key_ok boolean;
BEGIN
  IF p_operation_id IS NULL OR p_task_id IS NULL OR p_attempt_id IS NULL
     OR p_expected_action IS NULL OR p_expected_metadata IS NULL OR p_target_key IS NULL
     OR pg_catalog.octet_length(p_target_key) > 2048 THEN
    RAISE EXCEPTION 'gdpr_cleanup_claim_refused' USING ERRCODE = '55000';
  END IF;

  PERFORM internal.gdpr_cleanup_lock_target(p_target_key);

  SELECT t.* INTO v_task
    FROM internal.gdpr_cleanup_task t
    JOIN public.gdpr_erasure_log e ON e.id = t.operation_id
   WHERE t.id = p_task_id AND t.operation_id = p_operation_id
     AND e.report -> 'operationId' = pg_catalog.to_jsonb(p_operation_id)
   FOR UPDATE OF t;

  v_key_ok := CASE p_expected_action
    WHEN 'auth_delete' THEN
      p_expected_metadata ->> 'user_id' ~ '^[0-9a-fA-F-]{36}$'
      AND p_target_key = 'auth_delete:' || pg_catalog.lower(p_expected_metadata ->> 'user_id')
    WHEN 'storage_remove' THEN
      p_target_key ~ '^storage_remove:(media|avatars|actor-documents|documents)/[^[:cntrl:]\\]+$'
      AND CASE
        WHEN pg_catalog.jsonb_typeof(p_expected_metadata -> 'bucket') = 'string'
             AND pg_catalog.jsonb_typeof(p_expected_metadata -> 'path') = 'string'
          THEN p_target_key = 'storage_remove:' || (p_expected_metadata ->> 'bucket')
                              || '/' || (p_expected_metadata ->> 'path')
        ELSE pg_catalog.jsonb_typeof(p_expected_metadata -> 'raw_url') = 'string'
      END
    ELSE false
  END;

  IF v_task.id IS NULL
     OR v_task.action IS DISTINCT FROM p_expected_action
     OR v_task.metadata IS DISTINCT FROM p_expected_metadata
     OR (v_task.target_key IS NOT NULL AND v_task.target_key IS DISTINCT FROM p_target_key)
     OR v_key_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'gdpr_cleanup_claim_refused' USING ERRCODE = '55000';
  END IF;

  -- Une tentative existante, y compris rejouée avec le même identifiant, n'est jamais réadmise.
  IF v_task.status = 'succeeded' OR v_task.attempt_state IS NOT NULL THEN
    RAISE EXCEPTION 'gdpr_cleanup_attempt_unresolved' USING ERRCODE = '55000';
  END IF;

  SELECT o.* INTO v_owner
    FROM internal.gdpr_cleanup_task o
   WHERE o.target_key = p_target_key AND o.attempt_state IS NOT NULL
   FOR UPDATE;

  IF v_owner.id IS NOT NULL THEN
    UPDATE internal.gdpr_cleanup_task
       SET target_key = p_target_key,
           receipt_task_id = v_owner.id,
           status = CASE WHEN v_owner.attempt_state = 'succeeded' THEN 'succeeded' ELSE status END,
           last_error = CASE WHEN v_owner.attempt_state = 'succeeded' THEN NULL ELSE last_error END,
           updated_at = pg_catalog.now()
     WHERE id = p_task_id;
    RETURN pg_catalog.jsonb_build_object(
      'operationId', p_operation_id, 'taskId', p_task_id, 'claimOutcome', 'linked',
      'receiptTaskId', v_owner.id);
  END IF;

  UPDATE internal.gdpr_cleanup_task
     SET target_key = p_target_key,
         attempt_id = p_attempt_id,
         attempt_state = 'claimed',
         receipt_task_id = NULL,
         status = 'pending',
         last_error = NULL,
         updated_at = pg_catalog.now()
   WHERE id = p_task_id;

  RETURN pg_catalog.jsonb_build_object(
    'operationId', p_operation_id, 'taskId', p_task_id, 'attemptId', p_attempt_id,
    'action', v_task.action, 'metadata', v_task.metadata, 'targetKey', p_target_key,
    'claimOutcome', 'claimed');
END;
$function$;

-- p_effect_issued distingue un refus prouvé sans effet (tâche relançable) d'un envoi provider dont
-- l'issue est inconnue (définitif). Le succès propage le reçu aux tâches liées à cette cible.
CREATE FUNCTION api.rpc_gdpr_ack_cleanup_attempt(
  p_operation_id  uuid,
  p_task_id       uuid,
  p_attempt_id    uuid,
  p_success       boolean,
  p_effect_issued boolean,
  p_error         text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_key  text;
  v_task internal.gdpr_cleanup_task%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_task_id IS NULL OR p_attempt_id IS NULL
     OR p_success IS NULL OR p_effect_issued IS NULL THEN
    RAISE EXCEPTION 'gdpr_cleanup_ack_refused' USING ERRCODE = '55000';
  END IF;

  -- La clé est immuable une fois liée ; la ligne est revérifiée sous le verrou de cible.
  SELECT t.target_key INTO v_key
    FROM internal.gdpr_cleanup_task t
   WHERE t.id = p_task_id AND t.operation_id = p_operation_id AND t.attempt_id = p_attempt_id;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'gdpr_cleanup_ack_refused' USING ERRCODE = '55000';
  END IF;

  PERFORM internal.gdpr_cleanup_lock_target(v_key);

  SELECT t.* INTO v_task
    FROM internal.gdpr_cleanup_task t
   WHERE t.id = p_task_id AND t.operation_id = p_operation_id AND t.attempt_id = p_attempt_id
   FOR UPDATE;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'gdpr_cleanup_ack_refused' USING ERRCODE = '55000';
  END IF;

  IF v_task.attempt_state = 'succeeded' AND p_success THEN
    RETURN pg_catalog.jsonb_build_object(
      'operationId', p_operation_id, 'taskId', p_task_id, 'attemptId', p_attempt_id,
      'status', v_task.status, 'attempts', v_task.attempts);
  END IF;
  IF v_task.attempt_state <> 'claimed' THEN
    RAISE EXCEPTION 'gdpr_cleanup_ack_refused' USING ERRCODE = '55000';
  END IF;

  IF p_success THEN
    UPDATE internal.gdpr_cleanup_task
       SET status = 'succeeded', attempt_state = 'succeeded', attempts = attempts + 1,
           last_error = NULL, updated_at = pg_catalog.now()
     WHERE id = p_task_id
    RETURNING * INTO v_task;

    UPDATE internal.gdpr_cleanup_task a
       SET status = 'succeeded', last_error = NULL, updated_at = pg_catalog.now()
     WHERE a.receipt_task_id = p_task_id AND a.target_key = v_key AND a.status <> 'succeeded';
  ELSIF p_effect_issued THEN
    UPDATE internal.gdpr_cleanup_task
       SET status = 'failed', attempt_state = 'unknown', attempts = attempts + 1,
           last_error = pg_catalog.left(COALESCE(p_error, 'unknown_error'), 500),
           updated_at = pg_catalog.now()
     WHERE id = p_task_id
    RETURNING * INTO v_task;
  ELSE
    UPDATE internal.gdpr_cleanup_task
       SET status = 'failed', attempt_id = NULL, attempt_state = NULL, attempts = attempts + 1,
           last_error = pg_catalog.left(COALESCE(p_error, 'unknown_error'), 500),
           updated_at = pg_catalog.now()
     WHERE id = p_task_id
    RETURNING * INTO v_task;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'operationId', p_operation_id, 'taskId', p_task_id, 'attemptId', p_attempt_id,
    'status', v_task.status, 'attempts', v_task.attempts);
END;
$function$;

-- Refus d'une référence externe ou invalide, qui n'a aucune cible à réclamer. Sans attemptId,
-- cette RPC ne peut ni marquer un succès, ni libérer ou masquer une tentative en cours.
CREATE FUNCTION api.rpc_gdpr_refuse_cleanup_task(
  p_operation_id      uuid,
  p_task_id           uuid,
  p_expected_action   text,
  p_expected_metadata jsonb,
  p_error             text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_task internal.gdpr_cleanup_task%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'gdpr_cleanup_requires_read_committed' USING ERRCODE = '0A000';
  END IF;

  SELECT t.* INTO v_task
    FROM internal.gdpr_cleanup_task t
    JOIN public.gdpr_erasure_log e ON e.id = t.operation_id
   WHERE t.id = p_task_id AND t.operation_id = p_operation_id
     AND e.report -> 'operationId' = pg_catalog.to_jsonb(p_operation_id)
   FOR UPDATE OF t;

  IF v_task.id IS NULL
     OR v_task.action IS DISTINCT FROM p_expected_action
     OR v_task.metadata IS DISTINCT FROM p_expected_metadata
     OR v_task.status = 'succeeded'
     OR v_task.attempt_state IS NOT NULL THEN
    RAISE EXCEPTION 'gdpr_cleanup_refusal_refused' USING ERRCODE = '55000';
  END IF;

  UPDATE internal.gdpr_cleanup_task
     SET status = 'failed', attempts = attempts + 1,
         last_error = pg_catalog.left(COALESCE(p_error, 'unknown_error'), 500),
         updated_at = pg_catalog.now()
   WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN pg_catalog.jsonb_build_object(
    'operationId', p_operation_id, 'taskId', p_task_id,
    'status', v_task.status, 'attempts', v_task.attempts);
END;
$function$;

-- L'identité 4 arguments reste pour les préalables 19a, mais ne peut plus muter sans tentative.
CREATE OR REPLACE FUNCTION api.rpc_gdpr_ack_cleanup_task(
  p_operation_id UUID,
  p_task_id      UUID,
  p_success      BOOLEAN,
  p_error        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'gdpr_cleanup_ack_requires_attempt' USING ERRCODE = '55000';
END;
$function$;

COMMENT ON COLUMN internal.gdpr_cleanup_task.target_key IS
  'Cible normalisée par le serveur ; immuable une fois liée. Sert à dédoublonner entre tâches et opérations.';
COMMENT ON COLUMN internal.gdpr_cleanup_task.attempt_state IS
  'claimed et unknown sont définitifs sans ACK de la même tentative ; aucune expiration ni nouveau claim.';
COMMENT ON COLUMN internal.gdpr_cleanup_task.receipt_task_id IS
  'Reçu propriétaire de la même cible ; cette tâche n''émet aucun effet et suit son succès.';

ALTER FUNCTION internal.gdpr_cleanup_lock_target(text) OWNER TO postgres;
ALTER FUNCTION api.rpc_gdpr_claim_cleanup_task(uuid, uuid, uuid, text, jsonb, text) OWNER TO postgres;
ALTER FUNCTION api.rpc_gdpr_ack_cleanup_attempt(uuid, uuid, uuid, boolean, boolean, text) OWNER TO postgres;
ALTER FUNCTION api.rpc_gdpr_refuse_cleanup_task(uuid, uuid, text, jsonb, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION
  internal.gdpr_cleanup_lock_target(text),
  api.rpc_gdpr_claim_cleanup_task(uuid, uuid, uuid, text, jsonb, text),
  api.rpc_gdpr_ack_cleanup_attempt(uuid, uuid, uuid, boolean, boolean, text),
  api.rpc_gdpr_refuse_cleanup_task(uuid, uuid, text, jsonb, text),
  api.rpc_gdpr_ack_cleanup_task(uuid, uuid, boolean, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE internal.gdpr_cleanup_task FROM PUBLIC, anon, authenticated, service_role;

DO $closed$
DECLARE
  v_signature text;
  v_oid oid;
  v_role text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'internal.gdpr_cleanup_lock_target(text)',
    'api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text)',
    'api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text)',
    'api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)',
    'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)'
  ] LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF v_oid IS NULL OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = v_oid AND a.grantee <> p.proowner
    ) THEN
      RAISE EXCEPTION 'GDPR cleanup function is not owner-only: %', v_signature;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'GDPR cleanup function retains API execution: %', v_signature;
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

NOTIFY pgrst, 'reload schema';
COMMIT;
