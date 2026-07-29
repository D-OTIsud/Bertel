-- =====================================================================
-- migration_object_workspace_permissions_rpc.sql
-- Agrégateur des 8 sondes de permission de l'éditeur de fiche.
--
-- MOTIF (perf, mesuré) : l'ouverture de l'éditeur émettait HUIT appels
-- PostgREST séparés pour huit booléens portant tous sur le même objet
-- (`user_can_write_canonical`, `user_can_write_enrichment`,
-- `user_can_publish_object`, `can_write_object_private_notes`,
-- `is_object_owner`, `user_can_write_crm`, `current_user_is_org_admin`,
-- `is_platform_superuser`). Production : 909 appels de chacune, entre 22 et
-- 32 ms de temps DB — mais surtout huit allers-retours HTTP, à 220-310 ms de
-- latence mesurée depuis La Réunion. Ce fichier les ramène à UN.
--
-- SECURITY INVOKER, DÉLIBÉRÉMENT — et il ne faut PAS le passer en DEFINER.
-- Les huit fonctions feuilles sont déjà `SECURITY DEFINER` et font chacune
-- leur propre contrôle ; les envelopper dans un DEFINER de plus élargirait la
-- surface privilégiée sans rien apporter. L'agrégateur ne fait que composer
-- des résultats, il n'accède à aucune table par lui-même.
--
-- RÉSILIENCE PAR SONDE — le front utilisait `Promise.allSettled` : une sonde
-- en échec laissait les sept autres répondre. Un `SELECT` unique perdrait cette
-- propriété (une erreur ferait échouer l'ensemble, donc verrouillerait un
-- éditeur légitime pour une raison sans rapport). D'où les blocs EXCEPTION
-- individuels : même sémantique observable, fail-closed par sonde.
--
-- Idempotent. Aucun DDL de table. Signature nouvelle ⇒ NOTIFY pgrst en pied.
-- Dépend de : rls_policies.sql (les 8 fonctions feuilles).
-- =====================================================================

CREATE OR REPLACE FUNCTION api.get_object_workspace_permissions(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, api
AS $$
DECLARE
  v_canonical           boolean := false;
  v_enrichment          boolean := false;
  v_publish             boolean := false;
  v_private_notes       boolean := false;
  v_owner               boolean := false;
  v_crm                 boolean := false;
  v_org_admin           boolean := false;
  v_platform_superuser  boolean := false;
BEGIN
  BEGIN v_canonical := COALESCE(api.user_can_write_canonical(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_canonical := false; END;

  BEGIN v_enrichment := COALESCE(api.user_can_write_enrichment(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_enrichment := false; END;

  BEGIN v_publish := COALESCE(api.user_can_publish_object(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_publish := false; END;

  BEGIN v_private_notes := COALESCE(api.can_write_object_private_notes(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_private_notes := false; END;

  BEGIN v_owner := COALESCE(api.is_object_owner(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_owner := false; END;

  BEGIN v_crm := COALESCE(api.user_can_write_crm(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_crm := false; END;

  BEGIN v_org_admin := COALESCE(api.current_user_is_org_admin(), false);
  EXCEPTION WHEN OTHERS THEN v_org_admin := false; END;

  BEGIN v_platform_superuser := COALESCE(api.is_platform_superuser(), false);
  EXCEPTION WHEN OTHERS THEN v_platform_superuser := false; END;

  RETURN jsonb_build_object(
    'canonical',          v_canonical,
    'enrichment',         v_enrichment,
    'publish',            v_publish,
    'private_notes',      v_private_notes,
    'owner',              v_owner,
    'crm',                v_crm,
    'org_admin',          v_org_admin,
    'platform_superuser', v_platform_superuser
  );
END;
$$;

COMMENT ON FUNCTION api.get_object_workspace_permissions(text) IS
  'Agrège en un appel les 8 sondes de permission de l''éditeur pour un objet. '
  'SECURITY INVOKER volontairement : les feuilles sont déjà DEFINER et gatent '
  'elles-mêmes. Chaque sonde est isolée dans un bloc EXCEPTION pour conserver la '
  'sémantique Promise.allSettled du front (une sonde en échec = false, pas un '
  'échec global).';

-- Pas de `anon` : ce n'est ni un helper de policy SELECT ni un lecteur public
-- (cf. la denylist Q1b du runbook). Les fonctions nées `PUBLIC EXECUTE`.
REVOKE ALL ON FUNCTION api.get_object_workspace_permissions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.get_object_workspace_permissions(text) FROM anon;
GRANT EXECUTE ON FUNCTION api.get_object_workspace_permissions(text) TO authenticated, service_role;

-- Auto-assertion : l'agrégat doit rendre exactement les 8 clés attendues.
DO $$
DECLARE
  v_keys text[];
BEGIN
  SELECT array_agg(k ORDER BY k)
    INTO v_keys
    FROM jsonb_object_keys(api.get_object_workspace_permissions('__objet_inexistant__')) AS k;

  IF v_keys IS DISTINCT FROM ARRAY[
    'canonical','crm','enrichment','org_admin','owner','platform_superuser','private_notes','publish'
  ] THEN
    RAISE EXCEPTION 'get_object_workspace_permissions : clés inattendues %', v_keys;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
