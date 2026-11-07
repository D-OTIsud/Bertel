-- DB02: preserve live document references during the archived-object purge.
-- CREATE OR REPLACE preserves the existing RPC grants and signature.
BEGIN;

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
  v_candidate_doc_ids uuid[];
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

  -- Validate the current archived row and serialize competing purges.
  SELECT name, object_type::text, status::text
    INTO v_name, v_type, v_status
    FROM public.object WHERE id = p_object_id FOR UPDATE;
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
  -- A writer can move a place or media row to another authorized object.
  -- Wait for existing moves, and pin the remaining rows until the cascade.
  PERFORM p.id FROM public.object_place p
    WHERE p.object_id = p_object_id ORDER BY p.id FOR UPDATE;
  PERFORM m.id FROM public.media m
    WHERE m.object_id = p_object_id
       OR m.place_id IN (SELECT p.id FROM public.object_place p WHERE p.object_id = p_object_id)
    ORDER BY m.id FOR UPDATE;

  SELECT coalesce(array_agg(m.url), '{}'::text[])
    INTO v_media
    FROM public.media m
   WHERE m.url IS NOT NULL
     AND ( m.object_id = p_object_id
        OR m.place_id IN (SELECT op.id FROM public.object_place op WHERE op.object_id = p_object_id) );

  -- Lock existing target links before collecting candidates. The parent lock
  -- blocks new FK attachments to this object, but not edits to an existing link.
  PERFORM 1 FROM public.object_document WHERE object_id = p_object_id FOR UPDATE;
  PERFORM 1 FROM public.object_classification WHERE object_id = p_object_id FOR UPDATE;
  PERFORM 1 FROM public.object_legal WHERE object_id = p_object_id FOR UPDATE;
  PERFORM 1 FROM public.object_sustainability_action WHERE object_id = p_object_id FOR UPDATE;
  PERFORM 1 FROM public.object_iti WHERE object_id = p_object_id FOR UPDATE;

  WITH candidate AS (
    SELECT document_id AS id FROM public.object_document WHERE object_id = p_object_id
    UNION SELECT document_id FROM public.object_classification WHERE object_id = p_object_id
    UNION SELECT document_id FROM public.object_legal WHERE object_id = p_object_id
    UNION SELECT document_id FROM public.object_sustainability_action WHERE object_id = p_object_id
    UNION SELECT status_document_id FROM public.object_iti WHERE object_id = p_object_id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_candidate_doc_ids
    FROM candidate WHERE id IS NOT NULL;

  -- Immediate foreign keys take KEY SHARE when they attach a document. Wait
  -- in UUID order and use a separate query to observe attachments committed
  -- while waiting under the ordinary READ COMMITTED caller snapshot.
  PERFORM d.id FROM public.ref_document d
    WHERE d.id = ANY(v_candidate_doc_ids) ORDER BY d.id FOR UPDATE;

  WITH orphan AS (
    SELECT d.id, d.url FROM public.ref_document d
    WHERE d.id = ANY(v_candidate_doc_ids)
      AND NOT EXISTS (SELECT 1 FROM public.object_document x WHERE x.document_id = d.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM public.object_classification x WHERE x.document_id = d.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM public.object_legal x WHERE x.document_id = d.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM public.object_sustainability_action x WHERE x.document_id = d.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM public.object_iti x WHERE x.status_document_id = d.id AND x.object_id <> p_object_id)
      AND NOT EXISTS (SELECT 1 FROM public.actor_consent x WHERE x.document_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.actor_document x WHERE x.document_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.actor_document x WHERE x.promoted_document_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_task_document x WHERE x.document_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM internal.portal_photo_analysis x WHERE x.document_id = d.id)
  )
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]),
         coalesce(array_agg(url ORDER BY id), '{}'::text[])
    INTO v_doc_ids, v_docs
    FROM orphan;

  -- 8. Journaliser (même transaction que le DELETE).
  INSERT INTO public.object_deletion_log(
    object_id, object_name, object_type, status_at_deletion,
    media_deleted_count, document_deleted_count, performed_by, report)
  VALUES (
    p_object_id, v_name, v_type, v_status,
    coalesce(array_length(v_media,1),0), coalesce(array_length(v_docs,1),0), v_caller,
    jsonb_build_object('media', to_jsonb(v_media), 'documents', to_jsonb(v_docs)));

  -- 9. Supprimer les ref_document orphelinés (CASCADE retire aussi leur lien object_document).
  IF array_length(v_doc_ids,1) IS NOT NULL THEN
    DELETE FROM public.ref_document WHERE id = ANY(v_doc_ids);
  END IF;

  -- 10. Supprimer l'objet — CASCADE nettoie tous les enfants object-keyed.
  DELETE FROM public.object WHERE id = p_object_id;

  -- 11. Retour : URLs Storage à supprimer côté serveur (route, service-role).
  RETURN jsonb_build_object(
    'object_id', p_object_id,
    'object_name', v_name,
    'media_to_delete', to_jsonb(v_media),
    'documents_to_delete', to_jsonb(v_docs),
    'deleted', true);
END;
$$;

COMMIT;
