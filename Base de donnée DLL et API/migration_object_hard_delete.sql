-- migration_object_hard_delete.sql
-- §108 — Suppression définitive d'une fiche (admin-only, irréversible).
-- Superuser-only (api.is_platform_superuser), établissements uniquement (ORG rejeté), la fiche
-- doit être 'archived', confirmation par nom exact. Journal immuable qui survit à la suppression.
-- Calque la voie RGPD Art. 17 (rpc_gdpr_erase_subject + /api/rgpd/erase) : le RPC fait la
-- suppression relationnelle (CASCADE) + journalise + retourne les URLs Storage ; la route
-- supprime les fichiers (media + documents) en service-role.
-- Apply order: APRÈS rls_policies.sql (la policy référence api.is_platform_superuser) — manifest 14x.
-- Idempotent + transactionnel. NON foldé dans schema_unified.sql (cf. spec §4.c).
\set ON_ERROR_STOP on
BEGIN;

-- 1. Journal immuable (calqué sur gdpr_erasure_log). PAS de FK vers object : la ligne doit
--    survivre à la suppression. Écrit UNIQUEMENT par api.rpc_delete_object.
CREATE TABLE IF NOT EXISTS object_deletion_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id              TEXT NOT NULL,
  object_name            TEXT,
  object_type            TEXT,
  status_at_deletion     TEXT,
  media_deleted_count    INT  NOT NULL DEFAULT 0,
  document_deleted_count INT  NOT NULL DEFAULT 0,
  performed_by           UUID,
  performed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  report                 JSONB
);

COMMENT ON TABLE object_deletion_log IS
  'Journal immuable des suppressions définitives de fiches (§108). Écrit uniquement par api.rpc_delete_object ; survit à la suppression de l''objet.';

ALTER TABLE object_deletion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS object_deletion_log_admin_read ON object_deletion_log;
CREATE POLICY object_deletion_log_admin_read ON object_deletion_log
  FOR SELECT
  USING ((SELECT api.is_platform_superuser()));   -- §39 : auth wrappé en InitPlan
REVOKE ALL ON object_deletion_log FROM PUBLIC, anon;
GRANT SELECT ON object_deletion_log TO authenticated;
GRANT ALL    ON object_deletion_log TO service_role;

-- 2. RPC de suppression définitive.
CREATE OR REPLACE FUNCTION api.rpc_delete_object(p_object_id text, p_confirm_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_name    text;
  v_type    text;
  v_status  text;
  v_media   text[];
  v_doc_ids uuid[];
  v_docs    text[];
BEGIN
  -- 0. Contexte d'auth requis.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_delete_object requires an authenticated user';
  END IF;

  -- 1. Superuser-only (même garde que l'effacement RGPD).
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: suppression définitive réservée aux administrateurs plateforme';
  END IF;

  -- 2. Charger l'objet.
  SELECT name, object_type::text, status::text
    INTO v_name, v_type, v_status
    FROM object WHERE id = p_object_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;

  -- 3. Établissements uniquement — les ORG sont hors périmètre.
  IF v_type = 'ORG' THEN
    RAISE EXCEPTION 'FORBIDDEN_ORG: les organisations ne peuvent pas être supprimées par cet outil';
  END IF;

  -- 4. Garde-fou : la fiche doit d'abord être archivée.
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'MUST_ARCHIVE_FIRST: archivez la fiche avant de la supprimer définitivement';
  END IF;

  -- 5. Garde-fou : confirmation par nom exact (défense en profondeur ; l'UI l'exige déjà).
  IF btrim(coalesce(p_confirm_name,'')) <> btrim(coalesce(v_name,'')) THEN
    RAISE EXCEPTION 'NAME_MISMATCH: le nom de confirmation ne correspond pas';
  END IF;

  -- 6. Collecte AVANT suppression : URLs des médias object-keyed (CASCADE les supprimera).
  SELECT coalesce(array_agg(url), '{}'::text[])
    INTO v_media
    FROM media WHERE object_id = p_object_id AND url IS NOT NULL;

  -- 7. Documents = lignes ref_document PARTAGÉES via object_document. On ne retient que les
  --    ref_document qui ne seront plus liés à AUCUN autre objet après cette suppression.
  SELECT coalesce(array_agg(od.document_id), '{}'::uuid[]),
         coalesce(array_agg(rd.url), '{}'::text[])
    INTO v_doc_ids, v_docs
    FROM object_document od
    JOIN ref_document rd ON rd.id = od.document_id
   WHERE od.object_id = p_object_id
     AND NOT EXISTS (
       SELECT 1 FROM object_document od2
        WHERE od2.document_id = od.document_id
          AND od2.object_id <> p_object_id
     );

  -- 8. Journaliser (même transaction que le DELETE).
  INSERT INTO object_deletion_log(
    object_id, object_name, object_type, status_at_deletion,
    media_deleted_count, document_deleted_count, performed_by, report)
  VALUES (
    p_object_id, v_name, v_type, v_status,
    coalesce(array_length(v_media,1),0), coalesce(array_length(v_docs,1),0), v_caller,
    jsonb_build_object('media', to_jsonb(v_media), 'documents', to_jsonb(v_docs)));

  -- 9. Supprimer les ref_document orphelinés (CASCADE retire aussi leur lien object_document).
  IF array_length(v_doc_ids,1) IS NOT NULL THEN
    DELETE FROM ref_document WHERE id = ANY(v_doc_ids);
  END IF;

  -- 10. Supprimer l'objet — CASCADE nettoie tous les enfants object-keyed.
  DELETE FROM object WHERE id = p_object_id;

  -- 11. Retour : URLs Storage à supprimer côté serveur (route, service-role).
  RETURN jsonb_build_object(
    'object_id', p_object_id,
    'object_name', v_name,
    'media_to_delete', to_jsonb(v_media),
    'documents_to_delete', to_jsonb(v_docs),
    'deleted', true);
END;
$$;

REVOKE ALL     ON FUNCTION api.rpc_delete_object(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_delete_object(text, text) TO   authenticated, service_role;

COMMENT ON FUNCTION api.rpc_delete_object(text, text) IS
  'Suppression définitive d''une fiche (§108) : superuser-only, établissements, archived requis, confirmation par nom. Journalise dans object_deletion_log, supprime l''objet (CASCADE) + les ref_document orphelinés, et retourne les URLs Storage (media + documents) à supprimer côté serveur.';

COMMIT;
