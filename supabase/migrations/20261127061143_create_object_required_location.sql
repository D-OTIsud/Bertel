-- Create the fiche and its required main address in one atomic RPC call.
-- The existing location INSEE trigger and thesaurus assignment guard remain
-- authoritative. Imports and institutional organization creation are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION api.rpc_create_object(
  p_object_type text,
  p_name text,
  p_region_code text,
  p_city text,
  p_postcode text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_new_id text;
  v_valid_types text;
  v_city text := nullif(btrim(p_city), '');
  v_postcode text := nullif(btrim(p_postcode), '');
  v_insee text;
BEGIN
  -- Preserve the existing current-user authorization order and provenance.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION
      'NO_AUTH_CONTEXT: rpc_create_object requiert un utilisateur authentifié (auth.uid() est NULL). Appel service_role sans JWT applicatif non supporté par cette RPC';
  END IF;
  IF NOT api.user_can_create_object() THEN
    RAISE EXCEPTION
      'FORBIDDEN: création d''objet refusée — vérifiez votre membership ORG actif et la permission create_object';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_enum
    WHERE enumtypid = 'public.object_type'::regtype AND enumlabel = p_object_type
  ) THEN
    SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
    INTO v_valid_types FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = 'public.object_type'::regtype;
    RAISE EXCEPTION 'INVALID_OBJECT_TYPE: type d''objet inconnu : %. Types valides : %',
      p_object_type, v_valid_types USING ERRCODE = 'P0001';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELD: le champ name est obligatoire et ne peut pas être vide';
  END IF;
  IF v_city IS NULL OR v_postcode IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELD: la commune et le code postal sont obligatoires dès la création';
  END IF;
  IF v_postcode !~ '^[0-9]{5}$' THEN
    RAISE EXCEPTION 'INVALID_POSTCODE: le code postal doit contenir exactement cinq chiffres'
      USING ERRCODE = '23514';
  END IF;

  v_insee := internal.resolve_location_insee(v_city, v_postcode);
  IF v_insee IS NULL THEN
    RAISE EXCEPTION 'INSEE_REQUIRED: la commune et le code postal doivent déterminer un code INSEE unique'
      USING ERRCODE = '23514';
  END IF;
  -- Creation requires a recognized postal pair, unlike historical-address edits
  -- where the existing resolver can recover a commune from its name alone.
  IF NOT EXISTS (
    SELECT 1 FROM public.ref_commune_postcode p
    WHERE p.postcode = v_postcode AND p.insee_code = v_insee
  ) THEN
    RAISE EXCEPTION 'INVALID_POSTCODE: le code postal ne correspond pas à la commune choisie'
      USING ERRCODE = '23514';
  END IF;
  SELECT c.name INTO STRICT v_city FROM public.ref_commune c
  WHERE c.insee_code = v_insee AND c.is_active;

  -- Auto-attachment, type/realm gates and the existing version triggers run as
  -- before. Any later address/assignment error rolls this whole call back.
  INSERT INTO public.object (
    object_type, name, region_code, status, created_by, updated_by, created_at, updated_at
  ) VALUES (
    p_object_type::public.object_type, btrim(p_name), p_region_code, 'draft',
    v_caller_id, v_caller_id, now(), now()
  ) RETURNING id INTO v_new_id;

  -- Omit code_insee deliberately: the canonical address trigger calculates it,
  -- then the governed thesaurus guard authorizes the resulting assignment.
  INSERT INTO public.object_location(object_id, city, postcode, is_main_location)
  VALUES (v_new_id, v_city, v_postcode, true);

  RETURN v_new_id;
END;
$function$;

-- Keep old clients on a clear error instead of allowing address-free creation.
-- The five-argument overload has no defaults, so named PostgREST requests select
-- exactly one overload. The legacy region default also handles old two-key calls.
CREATE OR REPLACE FUNCTION api.rpc_create_object(
  p_object_type text,
  p_name text,
  p_region_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $function$
BEGIN
  RETURN api.rpc_create_object(p_object_type, p_name, p_region_code, NULL::text, NULL::text);
END;
$function$;

REVOKE ALL ON FUNCTION api.rpc_create_object(text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.rpc_create_object(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.rpc_create_object(text,text,text,text,text),
  api.rpc_create_object(text,text,text) TO authenticated, service_role;
COMMENT ON FUNCTION api.rpc_create_object(text,text,text,text,text) IS
  'Create a draft and its main location atomically. Commune and a matching official postal code are required; INSEE is resolved in the database. Existing current create permission, organization attachment, realm and governed assignment guards apply.';
COMMENT ON FUNCTION api.rpc_create_object(text,text,text) IS
  'Legacy creation signature: delegates without an address and refuses with MISSING_REQUIRED_FIELD after current authorization checks.';

-- Enforce the same invariant for direct writes and imports at transaction end:
-- creating an object before its address remains possible in one transaction.
-- Only new non-ORG objects, actual type changes and removal of a main address
-- are checked. Existing address-free historical rows are not retro-validated.
CREATE OR REPLACE FUNCTION internal.guard_object_main_location_insee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_object_id text;
  v_object_type public.object_type;
BEGIN
  IF TG_TABLE_NAME = 'object' THEN
    v_object_id := NEW.id;
  ELSE
    v_object_id := OLD.object_id;
  END IF;
  -- Serialize with object deletion/retyping without conflicting with the
  -- KEY SHARE lock taken by a concurrent location FK insert. FOR UPDATE would
  -- deadlock a retype commit against an otherwise valid main-address replacement.
  -- Canonical mutation fences have already acquired their source/writer gates.
  SELECT o.object_type INTO v_object_type FROM public.object o
  WHERE o.id = v_object_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_object_type = 'ORG'::public.object_type THEN
    RETURN NULL; -- includes cascading deletion of the owning object
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.object_location l
    WHERE l.object_id = v_object_id AND l.is_main_location IS TRUE
      AND l.code_insee IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'MAIN_LOCATION_INSEE_REQUIRED: une fiche doit posséder une localisation principale avec un code INSEE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION internal.guard_object_main_location_insee()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS object_creation_main_location_required ON public.object;
CREATE CONSTRAINT TRIGGER object_creation_main_location_required
  AFTER INSERT ON public.object DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.object_type <> 'ORG'::public.object_type)
  EXECUTE FUNCTION internal.guard_object_main_location_insee();

DROP TRIGGER IF EXISTS object_type_main_location_required ON public.object;
CREATE CONSTRAINT TRIGGER object_type_main_location_required
  AFTER UPDATE ON public.object DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.object_type IS DISTINCT FROM NEW.object_type
    AND NEW.object_type <> 'ORG'::public.object_type)
  EXECUTE FUNCTION internal.guard_object_main_location_insee();

DROP TRIGGER IF EXISTS object_main_location_delete_required ON public.object_location;
CREATE CONSTRAINT TRIGGER object_main_location_delete_required
  AFTER DELETE ON public.object_location DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.object_id IS NOT NULL AND OLD.is_main_location IS TRUE)
  EXECUTE FUNCTION internal.guard_object_main_location_insee();

DROP TRIGGER IF EXISTS object_main_location_update_required ON public.object_location;
CREATE CONSTRAINT TRIGGER object_main_location_update_required
  AFTER UPDATE ON public.object_location DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.object_id IS NOT NULL AND OLD.is_main_location IS TRUE
    AND (NEW.object_id IS DISTINCT FROM OLD.object_id OR NEW.is_main_location IS DISTINCT FROM TRUE))
  EXECUTE FUNCTION internal.guard_object_main_location_insee();

COMMENT ON FUNCTION internal.guard_object_main_location_insee() IS
  'Private deferred integrity trigger: new/retyped non-ORG objects and objects losing their main location must retain a main location with INSEE. Bounded owner-ID lookup bypasses caller RLS only for this integrity decision; existing address-free history and institutional ORG are preserved.';
NOTIFY pgrst, 'reload schema';
COMMIT;
