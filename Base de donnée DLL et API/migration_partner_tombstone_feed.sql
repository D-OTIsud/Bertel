-- migration_partner_tombstone_feed.sql
-- Audit API — Phase 1, chantier C-4 (tombstones dans le delta de synchronisation).
--
-- PROBLÈME : un partenaire qui synchronise en delta voit les ajouts/modifications
-- (liste publiée `GET /api/public/objects`) mais JAMAIS les suppressions définitives —
-- une fiche hard-deletée (§108, `api.rpc_delete_object`) disparaît de la liste sans
-- signal, laissant un enregistrement fantôme côté partenaire.
--
-- SOLUTION : un flux tombstone dédié lu depuis le journal IMMUABLE `object_deletion_log`
-- (§108), exposé UNIQUEMENT via la passerelle service-role (`/api/public/objects/deletions`).
--   api.list_deleted_objects_since(p_since, p_limit) → jsonb
--     { tombstones: [{object_id, type, deleted_at}], cursor, count }
--
-- RGPD : on ne projette QUE {object_id, object_type, performed_at}. Les colonnes
-- sensibles du journal (`report` = URLs Storage, `performed_by`, `object_name`) ne sont
-- JAMAIS exposées.
--
-- AUTORISATION : SECURITY INVOKER (moindre privilège) + EXECUTE réservé à service_role
-- (la passerelle appelle en service-role, qui bypasse la RLS superuser-only du journal).
-- anon/authenticated : REVOKE — un partenaire ne parle jamais à PostgREST en direct, et
-- si le grant s'élargissait par erreur, la RLS `object_deletion_log_admin_read`
-- (superuser-only) fail-close quand même.
--
-- PÉRIMÈTRE (arbitrage documenté) : ce flux couvre les suppressions DÉFINITIVES (hard
-- delete). L'état courant / les upserts = re-sync via `GET /api/public/objects` (liste
-- publiée). L'« unpublish » (published→draft/archived) = tombstone LOGIQUE, réconcilié
-- par le partenaire (id absent de la liste publiée ET absent des tombstones ⇒ dépublié) —
-- un vrai delta d'upserts exigerait un suivi de changements couvrant l'objet ET ses
-- tables enfants (object.updated_at ne bouge pas sur l'enrichissement enfant), différé.
--
-- SECURITY INVOKER + STABLE + search_path figé. Idempotent (CREATE OR REPLACE).
-- Dépend de `object_deletion_log` (migration_object_hard_delete.sql, §108) — runbook only.

BEGIN;

CREATE OR REPLACE FUNCTION api.list_deleted_objects_since(
  p_since timestamptz DEFAULT NULL,
  p_limit int         DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = api, public, extensions
AS $$
DECLARE
  v_limit  int         := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
  v_since  timestamptz := COALESCE(p_since, '-infinity'::timestamptz);
  v_rows   jsonb;
  v_cursor timestamptz;
BEGIN
  -- Fenêtre ordonnée par date de suppression, strictement après p_since, bornée par p_limit.
  -- ponytail: cursor = MAX(performed_at) de la page ; le prochain appel utilise `since=cursor`
  -- (comparaison stricte `>`). Plafond : si p_limit coupait EXACTEMENT entre deux suppressions
  -- au même `performed_at`, la seconde serait sautée. Négligeable ici (les hard-deletes sont
  -- rarissimes : superuser-only, archivage requis, confirmation par nom). Upgrade = keyset
  -- (performed_at, id) si le volume l'exigeait un jour.
  SELECT COALESCE(jsonb_agg(t.tombstone ORDER BY t.performed_at), '[]'::jsonb),
         MAX(t.performed_at)
  INTO v_rows, v_cursor
  FROM (
    SELECT dl.performed_at,
           jsonb_build_object(
             'object_id',  dl.object_id,
             'type',       dl.object_type,
             'deleted_at', dl.performed_at
           ) AS tombstone
    FROM object_deletion_log dl
    WHERE dl.performed_at > v_since
    ORDER BY dl.performed_at
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'tombstones', v_rows,
    'cursor',     COALESCE(v_cursor, p_since),  -- inchangé si page vide (le partenaire garde son curseur)
    'count',      jsonb_array_length(v_rows)
  );
END;
$$;

COMMENT ON FUNCTION api.list_deleted_objects_since(timestamptz, int) IS
  'Flux tombstone partenaire (§108/C-4) : suppressions définitives depuis object_deletion_log, '
  'projeté {object_id,type,deleted_at} (jamais report/performed_by/object_name). service_role-only.';

-- Grants : réservé à la passerelle service-role. anon/authenticated exclus.
REVOKE ALL ON FUNCTION api.list_deleted_objects_since(timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.list_deleted_objects_since(timestamptz, int) TO service_role;

COMMIT;
