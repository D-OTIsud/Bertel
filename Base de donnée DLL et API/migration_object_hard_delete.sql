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

  -- 6. Collecte AVANT suppression : URLs des médias supprimés par CASCADE. `media` est une table
  --    XOR (object_id OU place_id) : les médias object-keyed partent via object_id CASCADE, et les
  --    médias place-keyed des sous-lieux de l'objet partent via object_place→media.place_id CASCADE.
  --    On collecte les DEUX, sinon les fichiers Storage des médias de sous-lieux orphelineraient.
  SELECT coalesce(array_agg(m.url), '{}'::text[])
    INTO v_media
    FROM media m
   WHERE m.url IS NOT NULL
     AND ( m.object_id = p_object_id
        OR m.place_id IN (SELECT op.id FROM object_place op WHERE op.object_id = p_object_id) );

  -- 7. Documents = lignes ref_document (catalogue, url UNIQUE) que CET objet référence par l'UN des
  --    SIX chemins : object_document (lien CASCADE) + 4 colonnes object-keyed SET NULL
  --    (object_classification / object_legal / object_sustainability_action / object_iti.status_document_id).
  --    On collecte tout ref_document référencé par l'objet, puis on ne supprime (ligne + fichier) que
  --    ceux qui ne survivront à AUCUN autre référent — un AUTRE objet (mêmes 5 tables, object_id<>) OU
  --    tout acteur (actor_consent, jamais lié à l'objet). Sinon on SET-NULL un pointeur vivant et on
  --    efface un fichier en usage ailleurs. (Émettre les orphelins dans report ⇒ le GC peut les reprendre.)
  WITH candidate AS (
    SELECT document_id        AS id FROM object_document             WHERE object_id = p_object_id AND document_id IS NOT NULL
    UNION SELECT document_id          FROM object_classification        WHERE object_id = p_object_id AND document_id IS NOT NULL
    UNION SELECT document_id          FROM object_legal                 WHERE object_id = p_object_id AND document_id IS NOT NULL
    UNION SELECT document_id          FROM object_sustainability_action WHERE object_id = p_object_id AND document_id IS NOT NULL
    UNION SELECT status_document_id   FROM object_iti                   WHERE object_id = p_object_id AND status_document_id IS NOT NULL
  ),
  orphan AS (
    SELECT c.id FROM candidate c
    WHERE NOT EXISTS (SELECT 1 FROM object_document             x WHERE x.document_id        = c.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM object_classification        x WHERE x.document_id        = c.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM object_legal                 x WHERE x.document_id        = c.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM object_sustainability_action x WHERE x.document_id        = c.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM object_iti                   x WHERE x.status_document_id = c.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM actor_consent               x WHERE x.document_id        = c.id)
  )
  SELECT coalesce(array_agg(o.id), '{}'::uuid[]),
         coalesce(array_agg(rd.url), '{}'::text[])
    INTO v_doc_ids, v_docs
    FROM orphan o
    JOIN ref_document rd ON rd.id = o.id;

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
