-- Derived object realm invariant; no creator, revocation or publication policy change.
-- Folded into migration_test_org_isolation.sql for fresh installs.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
-- Existing installations may already expose the reset/seed maintenance path.
-- Fix its UPSERT caller before installing the invariant, in this transaction.
-- Fresh bootstrap defines the corrected seed later in migration_test_org_seed.sql.
-- Pin both reviewed variants; the live media-seeding addition must survive.
DO $seed_compatibility$
DECLARE
  v_oid oid:=to_regprocedure('internal.seed_test_corpus(integer)');
  v_body text; v_definition text; v_hash text; v_new_hash text;
  v_old text:=$old$      INSERT INTO object (id, object_type, name, status, region_code, extra)
      VALUES (v_id, v_type::object_type, v_name, 'published', 'RUN',
              jsonb_build_object('test_corpus', true, 'seeded_at', now()))$old$;
  v_new text:=$new$      INSERT INTO object (id, object_type, name, status, region_code, extra, is_test)
      VALUES (v_id, v_type::object_type, v_name, 'published', 'RUN',
              jsonb_build_object('test_corpus', true, 'seeded_at', now()),
              api.object_expected_is_test(v_id))$new$;
BEGIN
  IF v_oid IS NULL THEN
    RAISE NOTICE 'Realm guard: seed not installed yet; fresh source supplies its derived UPSERT caller';
    RETURN;
  END IF;
  SELECT replace(p.prosrc,E'\r\n',E'\n'),replace(pg_get_functiondef(p.oid),E'\r\n',E'\n')
    INTO v_body,v_definition FROM pg_proc p
    WHERE p.oid=v_oid AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      AND p.prorettype='jsonb'::regtype AND NOT p.prosecdef;
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'Realm guard: seed signature/attributes differ from the reviewed predecessor';
  END IF;
  v_hash:=md5(v_body);
  IF v_hash IN ('88474e38f9dd8b931d81589650b3ee88','b2f41c577485a92ba6ae13d87a94fef8') THEN
    RETURN;
  END IF;
  IF v_hash NOT IN ('247201c2e9b09fdcc9700bc0ef6051c6','8c56f3cc49aa8075eb74e29718d1d20a')
    OR (length(v_body)-length(replace(v_body,v_old,''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Realm guard: seed body drifted; reconcile the caller before installing the invariant';
  END IF;
  v_new_hash:=CASE v_hash
    WHEN '247201c2e9b09fdcc9700bc0ef6051c6' THEN '88474e38f9dd8b931d81589650b3ee88'
    ELSE 'b2f41c577485a92ba6ae13d87a94fef8' END;
  EXECUTE replace(v_definition,v_old,v_new);
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_new_hash THEN
    RAISE EXCEPTION 'Realm guard: seed caller postcondition failed';
  END IF;
END;
$seed_compatibility$;

-- Source tables first, derived table last; bounded locks prevent a write racing
-- the consistency preflight and trigger installation. Reads remain available.
LOCK TABLE public.org_config, public.object_org_link, public.object IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.object o WHERE o.is_test IS DISTINCT FROM COALESCE(
      (SELECT c.is_test_org FROM public.org_config c WHERE c.org_object_id=o.id),
      (SELECT c.is_test_org FROM public.object_org_link l JOIN public.org_config c ON c.org_object_id=l.org_object_id
        WHERE l.object_id=o.id AND l.is_primary IS TRUE ORDER BY l.updated_at DESC,l.org_object_id LIMIT 1),false)
  ) THEN
    RAISE EXCEPTION 'Object realm differs from its canonical organization; review existing data before installing the guard';
  END IF;
END;
$preflight$;

-- Source transitions serialize by organization before touching derived object
-- rows. The object guard never takes these locks: it already owns an object row,
-- whereas a config transition owns its config row before updating objects.
-- A SHARE lock on the organization row also makes a stale REPEATABLE READ source
-- transition fail with 40001 instead of accepting a pre-flip snapshot.
CREATE OR REPLACE FUNCTION internal.lock_object_realm_sources(p_org_ids text[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_org_id text;
BEGIN
  FOR v_org_id IN SELECT DISTINCT x FROM unnest(p_org_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('bertel.object-realm:' || v_org_id, 0));
  END LOOP;
  FOR v_org_id IN SELECT DISTINCT x FROM unnest(p_org_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM 1 FROM public.object WHERE id=v_org_id FOR SHARE;
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.lock_object_realm_sources(text[]) FROM PUBLIC, anon, authenticated, service_role;

-- An ORG follows its own configuration. Other objects follow their primary
-- organization. A new/orphan object has no source yet and starts in production;
-- the existing AFTER INSERT auto-attachment stamps a test creator's object.
CREATE OR REPLACE FUNCTION api.object_expected_is_test(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  SELECT COALESCE(
    (SELECT oc.is_test_org FROM public.org_config oc WHERE oc.org_object_id=p_object_id),
    (
    SELECT oc.is_test_org
    FROM public.object_org_link ool
    JOIN public.org_config oc ON oc.org_object_id = ool.org_object_id
    WHERE ool.object_id = p_object_id AND ool.is_primary IS TRUE
    ORDER BY ool.updated_at DESC, ool.org_object_id
    LIMIT 1
    ), false);
$fn$;

-- This is an invariant, not another authorization decision. Even privileged
-- writers must change the source organization/config rather than forge its copy.
-- VOLATILE is intentional: queries in a row trigger need a fresh snapshot after
-- waiting for another transaction's row update. No caller-controlled bypass GUC.
CREATE OR REPLACE FUNCTION api.guard_object_is_test()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_expected boolean;
BEGIN
  SELECT api.object_expected_is_test(NEW.id) INTO v_expected;
  IF NEW.is_test IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Object realm is derived from its organization'
      USING ERRCODE='42501', DETAIL='object_realm_is_derived',
        HINT='Change the primary organization or its configuration through the existing authorized path.';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION api.guard_object_is_test() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_object_is_test ON public.object;
CREATE TRIGGER trg_guard_object_is_test
BEFORE INSERT OR UPDATE OF is_test ON public.object
FOR EACH ROW EXECUTE FUNCTION api.guard_object_is_test();

CREATE OR REPLACE FUNCTION api.sync_object_is_test(p_object_id text)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  UPDATE public.object o
     SET is_test = api.object_expected_is_test(p_object_id)
   WHERE o.id = p_object_id
     AND o.is_test IS DISTINCT FROM api.object_expected_is_test(p_object_id);
$fn$;

CREATE OR REPLACE FUNCTION api.trg_object_org_link_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_org_ids text[]:=ARRAY[]::text[]; v_object_ids text[]:=ARRAY[]::text[]; v_object_id text;
BEGIN
  -- An object DELETE already owns the derived row before FK cascades remove
  -- its links. There is no remaining row to synchronize; do not invert the
  -- source-lock -> object-row order against a concurrent config transition.
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.object WHERE id=OLD.object_id) THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_org_ids:=array_append(v_org_ids,OLD.org_object_id);
    v_object_ids:=array_append(v_object_ids,OLD.object_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_org_ids:=array_append(v_org_ids,NEW.org_object_id);
    v_object_ids:=array_append(v_object_ids,NEW.object_id);
  END IF;
  PERFORM internal.lock_object_realm_sources(v_org_ids);
  FOR v_object_id IN SELECT DISTINCT x FROM unnest(v_object_ids) x ORDER BY x LOOP
    PERFORM api.sync_object_is_test(v_object_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_object_org_link_is_test ON public.object_org_link;
CREATE TRIGGER trg_object_org_link_is_test
AFTER INSERT OR DELETE OR UPDATE OF object_id, org_object_id, is_primary ON public.object_org_link
FOR EACH ROW EXECUTE FUNCTION api.trg_object_org_link_is_test();

-- A config insert, flag change, key move or deletion re-derives every affected
-- organization and current primary child. An absent source uses the same false
-- fallback as an object without a primary organization. No authorization changes.
CREATE OR REPLACE FUNCTION api.trg_org_config_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_org_ids text[]:=ARRAY[]::text[]; v_object_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_org_ids:=array_append(v_org_ids,OLD.org_object_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_org_ids:=array_append(v_org_ids,NEW.org_object_id);
  END IF;
  PERFORM internal.lock_object_realm_sources(v_org_ids);
  -- Read the current primary source for each row, rather than stamp one config
  -- value onto an object whose primary link may have moved while we waited.
  FOR v_object_id IN
    SELECT ool.object_id FROM public.object_org_link ool
      WHERE ool.org_object_id=ANY(v_org_ids) AND ool.is_primary IS TRUE
    UNION SELECT unnest(v_org_ids)
    ORDER BY 1
  LOOP
    PERFORM api.sync_object_is_test(v_object_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_org_config_is_test ON public.org_config;
CREATE TRIGGER trg_org_config_is_test
AFTER INSERT OR DELETE OR UPDATE OF org_object_id, is_test_org ON public.org_config
FOR EACH ROW EXECUTE FUNCTION api.trg_org_config_is_test();

-- Le tombstone herite du realm de la fiche AU MOMENT de sa suppression.
CREATE OR REPLACE FUNCTION api.trg_object_deletion_log_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
BEGIN
  IF NEW.is_test IS NOT TRUE THEN
    NEW.is_test := COALESCE((SELECT o.is_test FROM public.object o WHERE o.id = NEW.object_id), false);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_object_deletion_log_is_test ON public.object_deletion_log;
CREATE TRIGGER trg_object_deletion_log_is_test
BEFORE INSERT ON public.object_deletion_log
FOR EACH ROW EXECUTE FUNCTION api.trg_object_deletion_log_is_test();

COMMENT ON COLUMN public.object.is_test IS
  'Realm derive de l ORG primaire (ou de la propre configuration d une ORG). Les ecritures directes contradictoires sont refusees ; l entretien passe par les sources autorisees. Exclut le corpus de test des lecteurs publics et partenaires.';
NOTIFY pgrst,'reload schema';
COMMIT;
