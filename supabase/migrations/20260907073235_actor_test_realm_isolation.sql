-- Actor isolation is a durable property of the actor, including unattached prospects.
-- The object realm alone never constrained SECURITY DEFINER CRM directories or search.
-- Apply after the test corpus, actor prospects, CRM lifecycle and permission migrations.
BEGIN;

ALTER TABLE public.actor ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.actor.is_test IS
  'Durable sandbox realm, stamped on creation and immutable afterwards. Unlinking an actor never publishes it to the production CRM.';
CREATE INDEX IF NOT EXISTS idx_actor_test_realm ON public.actor (is_test, id);

-- Portal accounts can have an explicitly assigned actor without an ORG membership.
-- That assignment is guarded server-side; unlike JWT user_metadata it is authoritative.
CREATE OR REPLACE FUNCTION api.current_user_test_realm()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT COALESCE(auth.jwt()->'app_metadata'->>'sandbox_discovery' = 'true', false)
    OR EXISTS (SELECT 1 FROM public.user_org_membership m
      JOIN public.org_config c ON c.org_object_id=m.org_object_id
      WHERE m.user_id=auth.uid() AND m.is_active AND c.is_test_org)
    OR EXISTS (SELECT 1 FROM public.app_user_profile p
      JOIN public.actor a ON a.id=p.actor_id
      WHERE p.id=auth.uid() AND p.role='actor' AND a.is_test);
$fn$;

-- Existing seed provenance is explicit. Names and email strings are never classification rules.
-- Also recover actors created manually in the sandbox, whose owner organization is authoritative.
UPDATE public.actor a SET is_test = true
WHERE NOT a.is_test AND (
  a.extra->>'test_corpus' = 'true'
  OR EXISTS (SELECT 1 FROM public.org_config c
             WHERE c.org_object_id = a.crm_owner_org_id AND c.is_test_org)
  OR (EXISTS (SELECT 1 FROM public.actor_object_role r JOIN public.object o ON o.id=r.object_id
              WHERE r.actor_id=a.id AND o.is_test)
      AND NOT EXISTS (SELECT 1 FROM public.actor_object_role r JOIN public.object o ON o.id=r.object_id
                      WHERE r.actor_id=a.id AND NOT o.is_test))
);

CREATE OR REPLACE FUNCTION internal.actor_in_current_realm(p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.actor a
                 WHERE a.id = p_actor_id AND a.is_test = (SELECT api.current_user_test_realm()));
$fn$;
REVOKE ALL ON FUNCTION internal.actor_in_current_realm(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.actor_in_current_realm(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.object_in_current_realm(p_object_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.object o
                 WHERE o.id = p_object_id AND o.is_test = (SELECT api.current_user_test_realm()));
$fn$;
REVOKE ALL ON FUNCTION internal.object_in_current_realm(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.object_in_current_realm(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.crm_row_in_current_realm(p_object_id text, p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $fn$
  SELECT (p_object_id IS NOT NULL OR p_actor_id IS NOT NULL)
    AND (p_object_id IS NULL OR internal.object_in_current_realm(p_object_id))
    AND (p_actor_id IS NULL OR internal.actor_in_current_realm(p_actor_id));
$fn$;
REVOKE ALL ON FUNCTION internal.crm_row_in_current_realm(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.crm_row_in_current_realm(text, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.stamp_actor_test_realm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
DECLARE v_owner_realm boolean;
BEGIN
  IF NEW.crm_owner_org_id IS NOT NULL THEN
    SELECT c.is_test_org INTO v_owner_realm FROM public.org_config c
    WHERE c.org_object_id = NEW.crm_owner_org_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- save_crm_actor does not copy client extra/is_test/owner fields. The legacy seed
    -- writes its explicit marker server-side, including during an owner-run reset.
    NEW.is_test := COALESCE(NEW.is_test, false)
      OR (SELECT api.current_user_test_realm())
      OR COALESCE(v_owner_realm, false)
      OR COALESCE(NEW.extra->>'test_corpus' = 'true', false);
  ELSIF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
    RAISE EXCEPTION 'Actor realm is immutable' USING ERRCODE = '42501';
  END IF;
  -- An ordinary ORG may predate org_config; the established object realm defaults it to false.
  IF NEW.crm_owner_org_id IS NOT NULL AND COALESCE(v_owner_realm, false) IS DISTINCT FROM NEW.is_test THEN
    RAISE EXCEPTION 'Actor and CRM owner organization must share a realm' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.stamp_actor_test_realm() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_actor_test_realm ON public.actor;
CREATE TRIGGER trg_actor_test_realm BEFORE INSERT OR UPDATE OF is_test, crm_owner_org_id
ON public.actor FOR EACH ROW EXECUTE FUNCTION internal.stamp_actor_test_realm();

-- A caller allowed to edit a production object must not attach a sandbox actor by UUID.
-- Table triggers cover every writer, including workspace RPCs and service-role routes.
CREATE OR REPLACE FUNCTION internal.guard_actor_object_realm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
DECLARE v_actor_realm boolean; v_object_realm boolean; v_old_realm boolean; v_new_realm boolean;
BEGIN
  IF TG_TABLE_NAME IN ('crm_interaction', 'crm_task') THEN
    -- Administrative erasure and actor FK ON DELETE SET NULL must be able to
    -- remove an existing row's final anchor. API writes validate their target
    -- anchor explicitly below; realm-filtered readers exclude erased orphan rows.
    IF TG_OP = 'INSERT' AND NEW.actor_id IS NULL AND NEW.object_id IS NULL THEN
      RAISE EXCEPTION 'CRM rows require an actor or object anchor' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      -- Writers authorize the existing interaction before applying its payload. An
      -- actor-only row could otherwise be moved to a foreign actor UUID after that
      -- check, bypassing RLS in a DEFINER writer. Compare resolved anchors even when
      -- actor_id AND object_id change together; a pairwise match alone is insufficient.
      SELECT COALESCE(
        (SELECT o.is_test FROM public.object o WHERE o.id=OLD.object_id),
        (SELECT a.is_test FROM public.actor a WHERE a.id=OLD.actor_id)) INTO v_old_realm;
      SELECT COALESCE(
        (SELECT o.is_test FROM public.object o WHERE o.id=NEW.object_id),
        (SELECT a.is_test FROM public.actor a WHERE a.id=NEW.actor_id)) INTO v_new_realm;
      IF v_old_realm IS NOT NULL AND v_new_realm IS NOT NULL
         AND v_old_realm IS DISTINCT FROM v_new_realm THEN
        RAISE EXCEPTION 'CRM rows cannot move between realms' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF NEW.actor_id IS NOT NULL AND NEW.object_id IS NOT NULL THEN
    SELECT a.is_test INTO v_actor_realm FROM public.actor a WHERE a.id=NEW.actor_id;
    SELECT o.is_test INTO v_object_realm FROM public.object o WHERE o.id=NEW.object_id;
    IF v_actor_realm IS NOT NULL AND v_object_realm IS NOT NULL
       AND v_actor_realm IS DISTINCT FROM v_object_realm THEN
      RAISE EXCEPTION 'Actor and object must share a realm' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'crm_interaction' THEN
   IF NEW.handled_by_actor_id IS NOT NULL THEN
    SELECT a.is_test INTO v_actor_realm FROM public.actor a WHERE a.id=NEW.handled_by_actor_id;
    IF NEW.object_id IS NOT NULL THEN
      SELECT o.is_test INTO v_object_realm FROM public.object o WHERE o.id=NEW.object_id;
    ELSE
      SELECT a.is_test INTO v_object_realm FROM public.actor a WHERE a.id=NEW.actor_id;
    END IF;
    IF v_actor_realm IS NOT NULL AND v_object_realm IS NOT NULL
       AND v_actor_realm IS DISTINCT FROM v_object_realm THEN
      RAISE EXCEPTION 'CRM handler and interaction must share a realm' USING ERRCODE = '23514';
    END IF;
   END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.guard_actor_object_realm() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_actor_object_realm ON public.actor_object_role;
CREATE TRIGGER trg_actor_object_realm BEFORE INSERT OR UPDATE OF actor_id, object_id
ON public.actor_object_role FOR EACH ROW EXECUTE FUNCTION internal.guard_actor_object_realm();
DROP TRIGGER IF EXISTS trg_actor_object_realm ON public.crm_interaction;
CREATE TRIGGER trg_actor_object_realm BEFORE INSERT OR UPDATE OF actor_id, object_id, handled_by_actor_id
ON public.crm_interaction FOR EACH ROW EXECUTE FUNCTION internal.guard_actor_object_realm();
DROP TRIGGER IF EXISTS trg_actor_object_realm ON public.crm_task;
CREATE TRIGGER trg_actor_object_realm BEFORE INSERT OR UPDATE OF actor_id, object_id
ON public.crm_task FOR EACH ROW EXECUTE FUNCTION internal.guard_actor_object_realm();

-- Restrictive policies intersect every pre-existing permission, including platform owners.
DROP POLICY IF EXISTS actor_test_realm ON public.actor;
CREATE POLICY actor_test_realm ON public.actor AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (is_test = (SELECT api.current_user_test_realm()))
WITH CHECK (is_test = (SELECT api.current_user_test_realm()));
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['actor_channel','actor_consent','actor_document','actor_object_role'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS actor_test_realm ON public.%I', t);
    EXECUTE format('CREATE POLICY actor_test_realm ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (internal.actor_in_current_realm(actor_id)) WITH CHECK (internal.actor_in_current_realm(actor_id))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['crm_interaction','crm_task'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS actor_test_realm ON public.%I', t);
    EXECUTE format('CREATE POLICY actor_test_realm ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (internal.crm_row_in_current_realm(object_id, actor_id)) WITH CHECK (internal.crm_row_in_current_realm(object_id, actor_id))', t);
  END LOOP;
END;
$rls$;

CREATE OR REPLACE FUNCTION api.current_user_crm_object_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT ool.object_id
  FROM public.user_org_membership uom
  JOIN public.object_org_link ool ON ool.org_object_id = uom.org_object_id
  JOIN public.ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
  JOIN public.object o ON o.id = ool.object_id
  WHERE uom.user_id = auth.uid() AND uom.is_active
    AND o.is_test = (SELECT api.current_user_test_realm());
$fn$;

CREATE OR REPLACE FUNCTION api.current_user_crm_actor_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT a.id FROM public.actor a
  WHERE a.is_test = (SELECT api.current_user_test_realm())
    AND (a.crm_owner_org_id = (SELECT api.current_user_org_id())
      OR a.id IN (SELECT ar.actor_id FROM public.actor_object_role ar
                  WHERE ar.object_id IN (SELECT api.current_user_crm_object_ids()))
      OR a.id IN (SELECT ci.actor_id FROM public.crm_interaction ci
                  WHERE ci.object_id IN (SELECT api.current_user_crm_object_ids())));
$fn$;

CREATE OR REPLACE FUNCTION api.user_can_read_crm(p_object_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $fn$
  SELECT internal.object_in_current_realm(p_object_id) AND COALESCE(
    api.is_platform_superuser() OR p_object_id IN (SELECT api.current_user_crm_object_ids()), false);
$fn$;
CREATE OR REPLACE FUNCTION api.user_can_write_crm(p_object_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $fn$
  SELECT internal.object_in_current_realm(p_object_id) AND COALESCE(
    api.is_platform_superuser() OR (p_object_id IN (SELECT api.current_user_crm_object_ids())
      AND api.user_has_permission('write_crm_notes')), false);
$fn$;
CREATE OR REPLACE FUNCTION api.user_can_read_crm_actor(p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $fn$
  SELECT internal.actor_in_current_realm(p_actor_id) AND COALESCE(
    api.is_platform_superuser() OR p_actor_id IN (SELECT api.current_user_crm_actor_ids()), false);
$fn$;
CREATE OR REPLACE FUNCTION api.user_can_write_crm_actor(p_actor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $fn$
  SELECT internal.actor_in_current_realm(p_actor_id) AND COALESCE(
    api.is_platform_superuser() OR (p_actor_id IN (SELECT api.current_user_crm_actor_ids())
      AND api.user_has_permission('write_crm_notes')), false);
$fn$;

CREATE OR REPLACE FUNCTION api.current_user_actor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT p.actor_id FROM public.app_user_profile p
  JOIN public.actor a ON a.id=p.actor_id
  WHERE p.id = (SELECT auth.uid()) AND a.is_test = (SELECT api.current_user_test_realm());
$fn$;
CREATE OR REPLACE FUNCTION api.user_actor_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT ac.actor_id FROM public.actor_channel ac
  JOIN public.ref_code_contact_kind ck ON ck.id=ac.kind_id AND ck.code='email'
  WHERE lower(ac.value)=api.current_user_email()
    AND internal.actor_in_current_realm(ac.actor_id);
$fn$;

CREATE OR REPLACE FUNCTION api.can_read_actor_contacts(p_object_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL AND internal.object_in_current_realm(p_object_id)
    AND (EXISTS (SELECT 1 FROM public.app_user_profile p WHERE p.id=(SELECT auth.uid())
                 AND p.role IN ('owner','super_admin'))
         OR p_object_id IN (SELECT api.current_user_crm_object_ids()));
$fn$;

-- Duplicate-email detection must not reveal or depend on the other realm's actor identities.
CREATE OR REPLACE FUNCTION api.prevent_duplicate_actor_email()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
DECLARE v_is_email boolean; v_existing_actor_id uuid;
BEGIN
  SELECT lower(code)='email' INTO v_is_email FROM public.ref_code_contact_kind WHERE id=NEW.kind_id;
  IF v_is_email AND NEW.value IS NOT NULL THEN
    SELECT ac.actor_id INTO v_existing_actor_id
    FROM public.actor_channel ac
    JOIN public.ref_code_contact_kind k ON k.id=ac.kind_id AND lower(k.code)='email'
    JOIN public.actor a ON a.id=ac.actor_id
    JOIN public.actor incoming ON incoming.id=NEW.actor_id AND incoming.is_test=a.is_test
    WHERE lower(ac.value)=lower(NEW.value) AND ac.actor_id<>NEW.actor_id LIMIT 1;
    IF v_existing_actor_id IS NOT NULL THEN
      RAISE EXCEPTION 'Email % is already used by actor %', NEW.value, v_existing_actor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- DEFINER readers bypass RLS. Patch only a declared inventory of SELECT relation references,
-- preserving the latest complete function bodies, return contracts and privilege grants.
-- Derived relations allow the planner to inline the equality and its one-time realm lookup.
-- Every expected function/table pair must actually match, or this migration aborts.
DO $readers$
DECLARE r record; v_src text; v_new text; v_filter text; v_pattern text; v_marker text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('list_crm_directory','actor'), ('list_crm_directory_linked','actor'),
    ('list_actor_crm','actor'), ('list_actor_support','actor'), ('search_actors','actor'),
    ('list_crm_tasks','actor'), ('list_crm_timeline','actor'), ('list_object_crm','actor'),
    ('get_actor_data','actor'), ('get_my_actor_profile','actor'),
    ('get_object_resource','actor'), ('list_pending_changes','actor'),
    ('export_actor_contacts','actor'),
    ('list_crm_directory_linked','object'), ('list_actor_crm','object'),
    ('list_crm_tasks','object'), ('list_crm_timeline','object'),
    ('export_actor_contacts','object'), ('list_selection_emails','object'),
    ('list_actor_crm','crm_interaction'), ('list_crm_directory_linked','crm_interaction'),
    ('list_crm_tasks','crm_interaction'), ('list_crm_timeline','crm_interaction'),
    ('list_object_crm','crm_interaction'), ('list_crm_tasks','crm_task'), ('list_object_crm','crm_task')
  ) AS inventory(fn, tbl)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO STRICT v_src FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api' AND p.proname=r.fn;
    v_marker := '/* actor-realm:' || r.tbl || ' */';
    IF position(v_marker IN v_src)>0 THEN CONTINUE; END IF;
    v_filter := CASE WHEN r.tbl IN ('actor','object') THEN
      'is_test = (SELECT api.current_user_test_realm())'
    ELSE
      '(object_id IS NOT NULL OR actor_id IS NOT NULL)'
      || ' AND (object_id IS NULL OR object_id IN (SELECT id FROM public.object WHERE is_test = (SELECT api.current_user_test_realm())))'
      || ' AND (actor_id IS NULL OR actor_id IN (SELECT id FROM public.actor WHERE is_test = (SELECT api.current_user_test_realm())))'
    END;
    -- These read bodies use explicit aliases; the alias remains outside the replacement.
    v_pattern := '\m(FROM|JOIN)\s+(public\.)?' || r.tbl || '\M';
    v_new := regexp_replace(v_src, v_pattern,
      '\1 (SELECT * FROM public.' || r.tbl || ' WHERE ' || v_filter || ') ' || v_marker, 'gi');
    IF v_new = v_src THEN
      RAISE EXCEPTION 'Actor isolation patch did not match api.%, table %', r.fn, r.tbl;
    END IF;
    EXECUTE v_new;
  END LOOP;
END;
$readers$;

-- Validate the actor-only target after existing-row authorization, before applying
-- the UPDATE payload. Keep this in the user-facing writer: table-level UPDATEs
-- must still permit RGPD anonymization and ON DELETE SET NULL to erase an anchor.
DO $interaction_writer$
DECLARE v_src text; v_new text;
BEGIN
  SELECT pg_get_functiondef('api.save_crm_interaction(jsonb)'::regprocedure) INTO v_src;
  IF position('/* actor-realm:interaction-target */' IN v_src)=0 THEN
    v_new := replace(v_src, 'UPDATE crm_interaction SET',
      'IF COALESCE(v_existing_object, v_object_id) IS NULL THEN
      IF (CASE WHEN p_payload ? ''actor_id'' THEN v_actor_id ELSE v_existing_actor END) IS NULL THEN
        RAISE EXCEPTION ''CRM rows require an actor or object anchor'' USING ERRCODE = ''23514'';
      END IF;
      IF NOT api.user_can_write_crm_actor(
        CASE WHEN p_payload ? ''actor_id'' THEN v_actor_id ELSE v_existing_actor END) THEN
        RAISE EXCEPTION ''Actor access denied'' USING ERRCODE = ''42501'';
      END IF;
    END IF; /* actor-realm:interaction-target */

    UPDATE crm_interaction SET');
    IF v_new=v_src THEN RAISE EXCEPTION 'Actor isolation interaction target patch did not match'; END IF;
    EXECUTE v_new;
  END IF;
END;
$interaction_writer$;

-- Selection-email cascade has no actor table join of its own; constrain its actor-channel arm.
DO $selection$
DECLARE v_src text; v_new text;
BEGIN
  SELECT pg_get_functiondef('api.list_selection_emails(text,text[],uuid)'::regprocedure) INTO v_src;
  IF position('/* actor-realm:selection */' IN v_src)=0 THEN
    v_new := replace(v_src, 'WHERE aor.object_id = e.object_id',
      'WHERE aor.object_id = e.object_id AND internal.actor_in_current_realm(aor.actor_id) /* actor-realm:selection */');
    IF v_new=v_src THEN RAISE EXCEPTION 'Actor isolation selection-email patch did not match'; END IF;
    EXECUTE v_new;
  END IF;
END;
$selection$;

-- The erasure RPC is a privileged mutation but also returns actor media/profile identifiers.
-- Its platform-admin check must not authorize the other realm by itself.
DO $erasure$
DECLARE v_src text; v_new text;
BEGIN
  SELECT pg_get_functiondef('api.rpc_gdpr_erase_subject(text,text,text,text)'::regprocedure) INTO v_src;
  IF position('/* actor-realm:erasure */' IN v_src)=0 THEN
    v_new := replace(v_src, 'v_actor := p_subject_id::uuid;',
      'v_actor := p_subject_id::uuid;
    IF NOT internal.actor_in_current_realm(v_actor) THEN
      RAISE EXCEPTION ''Actor access denied'' USING ERRCODE = ''42501'';
    END IF; /* actor-realm:erasure */');
    IF v_new=v_src THEN RAISE EXCEPTION 'Actor isolation erasure patch did not match'; END IF;
    EXECUTE v_new;
  END IF;
END;
$erasure$;

NOTIFY pgrst, 'reload schema';
COMMIT;
