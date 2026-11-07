BEGIN;

-- The SECURITY DEFINER note-management check still calls this internal lookup.
REVOKE EXECUTE ON FUNCTION api.object_private_note_author_admin_rank(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
