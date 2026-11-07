-- =====================================================================
-- test_object_workspace_permissions_rpc.sql
-- Garde de api.get_object_workspace_permissions (agrégateur des 9 sondes).
--
-- Ce que la garde protège réellement :
--  1. l'attribut de sécurité — repasser en SECURITY DEFINER élargirait la
--     surface privilégiée pour rien (les 9 feuilles sont déjà DEFINER) ;
--  2. les grants — `anon` ne doit pas pouvoir l'exécuter ;
--  3. le contrat de clés — le front lit `canonical`/`enrichment`/`publish`/
--     `private_notes`/`owner`/`crm`/`legal`/`org_admin`/`platform_superuser` ;
--  4. la PARITÉ avec les 9 sondes individuelles — c'est l'assertion non
--     vacante : elle compare les deux chemins sur un objet réel, donc elle
--     tombe si l'agrégat dérive de ses feuilles ;
--  5. la résilience par sonde — un objet inexistant ne doit pas faire échouer
--     l'appel (le front avait un Promise.allSettled, la sémantique a migré
--     dans la fonction).
-- =====================================================================

DO $$
DECLARE
  v_secdef  boolean;
  v_anon    boolean;
  v_auth    boolean;
  v_keys    text[];
  v_obj     text;
  v_agg     jsonb;
  v_ind     jsonb;
BEGIN
  -- 1 / 2 — attribut de sécurité et grants
  SELECT p.prosecdef,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_secdef, v_anon, v_auth
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api' AND p.proname = 'get_object_workspace_permissions';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'api.get_object_workspace_permissions absente';
  END IF;
  IF v_secdef THEN
    RAISE EXCEPTION 'get_object_workspace_permissions doit rester SECURITY INVOKER : les 9 feuilles sont deja DEFINER et gatent elles-memes';
  END IF;
  IF v_anon THEN
    RAISE EXCEPTION 'anon ne doit pas pouvoir executer get_object_workspace_permissions';
  END IF;
  IF NOT v_auth THEN
    RAISE EXCEPTION 'authenticated doit pouvoir executer get_object_workspace_permissions';
  END IF;

  -- 5 — un objet inexistant ne fait pas echouer l'appel
  SELECT array_agg(k ORDER BY k)
    INTO v_keys
    FROM jsonb_object_keys(api.get_object_workspace_permissions('__objet_inexistant__')) AS k;

  -- 3 — contrat de cles
  IF v_keys IS DISTINCT FROM ARRAY[
    'canonical','crm','enrichment','legal','org_admin','owner','platform_superuser','private_notes','publish'
  ] THEN
    RAISE EXCEPTION 'contrat de cles rompu : %', v_keys;
  END IF;

  -- 4 — parite avec les 9 sondes individuelles, sur un objet REEL
  SELECT id INTO v_obj FROM object ORDER BY id LIMIT 1;
  IF v_obj IS NULL THEN
    RAISE NOTICE 'aucun objet en base : parite non verifiee (base fraiche)';
    RETURN;
  END IF;

  v_agg := api.get_object_workspace_permissions(v_obj);
  v_ind := jsonb_build_object(
    'canonical',          COALESCE(api.user_can_write_canonical(v_obj), false),
    'enrichment',         COALESCE(api.user_can_write_enrichment(v_obj), false),
    'publish',            COALESCE(api.user_can_publish_object(v_obj), false),
    'private_notes',      COALESCE(api.can_write_object_private_notes(v_obj), false),
    'owner',              COALESCE(api.is_object_owner(v_obj), false),
    'crm',                COALESCE(api.user_can_write_crm(v_obj), false),
    'legal',              COALESCE(api.user_can_manage_object_legal(v_obj), false),
    'org_admin',          COALESCE(api.current_user_is_org_admin(), false),
    'platform_superuser', COALESCE(api.is_platform_superuser(), false)
  );

  IF v_agg IS DISTINCT FROM v_ind THEN
    RAISE EXCEPTION 'agregat != sondes individuelles sur % : agrege=% individuelles=%', v_obj, v_agg, v_ind;
  END IF;

  RAISE NOTICE 'test_object_workspace_permissions_rpc OK (parite verifiee sur %)', v_obj;
END;
$$;
