-- ============================================================================
-- migration_ref_code_admin_rpcs.sql  (Phase 7.5 — éditeur de référentiels)
--
-- WHAT THIS DOES (idempotent, CREATE OR REPLACE throughout):
--   ref_* est admin-write RLS (service_role/admin only, rls_policies.sql). L'écriture
--   éditeur passe donc par des RPC SECURITY DEFINER gated api.is_platform_superuser() —
--   même précédent que api.create_tag / api.set_tag_color (manifest 14h).
--
--   v1 = domaines PLATS NON STRUCTURELS, « désactiver-pas-supprimer » :
--     - api.ref_code_domain_is_editable(domain) — un domaine est éditable s'il n'est
--       NI taxonomie (is_taxonomy) NI hiérarchique (is_hierarchical) NI couplé à un
--       object_type. Les domaines structurels sont régis par les triggers
--       d'applicabilité/taxonomie ⇒ LECTURE SEULE (le RPC refuse, 42501).
--     - api.rpc_upsert_ref_code  — crée (code requis, normalisé, verrouillé) OU édite
--       (libellé + i18n + position ; code/domaine VERROUILLÉS).
--     - api.rpc_set_ref_code_active — (dés)active une valeur (is_active).
--     - api.rpc_reorder_ref_code — réordonne (position = rang dans le tableau d'ids).
--   Pas de suppression en v1 (la doc 7.5 : désactiver par défaut ; supprimer seulement
--   à 0 référence — déféré, le comptage de références est par-domaine).
--
--   Lecture : directe sur ref_code_domain_registry + ref_code (RLS « Lecture publique »).
--
-- DEPLOY : appliquer à live + NOTIFY pgrst, 'reload schema'. Foldé dans le runbook SQL
--   (nouveau pas de manifest). Le flag advisor 0028/0029 sur les RPC DEFINER exécutables
--   est attendu (§36). gen_random_uuid() (search_path restreint — invariant CLAUDE.md).
-- ============================================================================

-- Un domaine ref_code est-il éditable par l'admin (non structurel) ?
CREATE OR REPLACE FUNCTION api.ref_code_domain_is_editable(p_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api
AS $$
  -- Éditable = NON structurel. Un domaine est STRUCTUREL s'il possède une entrée de
  -- registre marquée taxonomie / hiérarchique / couplée object_type (régie par triggers
  -- d'applicabilité/taxonomie ⇒ lecture seule). Les domaines PLATS (vocabulaires comme
  -- price_type, dietary_tag, transport_type…) n'ont PAS d'entrée structurelle au registre
  -- (souvent pas d'entrée du tout) ⇒ éditables.
  SELECT NOT EXISTS (
    SELECT 1 FROM ref_code_domain_registry r
    WHERE r.domain = p_domain
      AND (COALESCE(r.is_taxonomy, false)
           OR COALESCE(r.is_hierarchical, false)
           OR r.object_type IS NOT NULL)
  );
$$;

COMMENT ON FUNCTION api.ref_code_domain_is_editable(text) IS
'Phase 7.5 — un domaine ref_code est éditable s''il n''est PAS structurel (pas d''entrée registre taxonomie/hiérarchique/object_type ; sinon régi par triggers ⇒ lecture seule).';

-- CRÉE (p_id NULL) ou ÉDITE (p_id fourni) une valeur ref_code d'un domaine éditable.
CREATE OR REPLACE FUNCTION api.rpc_upsert_ref_code(
  p_domain text,
  p_name text,
  p_id uuid DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_name_i18n jsonb DEFAULT NULL,
  p_position integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_code text;
  v_id   uuid;
  v_pos  integer;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;
  IF NOT api.ref_code_domain_is_editable(p_domain) THEN
    RAISE EXCEPTION 'Domaine % non éditable (structurel / lecture seule)', p_domain USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Le libellé est requis' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    -- CRÉATION : code requis + normalisé (satisfait chk_ref_code_code_normalized), verrouillé.
    v_code := public.immutable_unaccent(lower(btrim(COALESCE(p_code, ''))));
    IF v_code = '' THEN
      RAISE EXCEPTION 'Le code est requis à la création' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM ref_code WHERE domain = p_domain AND code = v_code) THEN
      RAISE EXCEPTION 'Le code « % » existe déjà dans %', v_code, p_domain USING ERRCODE = '23505';
    END IF;
    v_id := gen_random_uuid();
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos FROM ref_code WHERE domain = p_domain;
    INSERT INTO ref_code (id, domain, code, name, name_i18n, position, is_active)
    VALUES (v_id, p_domain, v_code, v_name, p_name_i18n, COALESCE(p_position, v_pos), true);
  ELSE
    -- ÉDITION : libellé + i18n + position uniquement. Code et domaine VERROUILLÉS.
    UPDATE ref_code
      SET name       = v_name,
          name_i18n  = COALESCE(p_name_i18n, name_i18n),
          position   = COALESCE(p_position, position),
          updated_at = NOW()
      WHERE id = p_id AND domain = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Valeur introuvable (% / %)', p_domain, p_id USING ERRCODE = 'P0002';
    END IF;
    v_id := p_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'domain', p_domain);
END;
$$;

COMMENT ON FUNCTION api.rpc_upsert_ref_code(text, text, uuid, text, jsonb, integer) IS
'Phase 7.5 — crée/édite une valeur ref_code (domaine éditable, gated super-admin). Code verrouillé après création.';

-- (DÉS)ACTIVE une valeur ref_code.
CREATE OR REPLACE FUNCTION api.rpc_set_ref_code_active(
  p_id uuid,
  p_domain text,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $$
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;
  IF NOT api.ref_code_domain_is_editable(p_domain) THEN
    RAISE EXCEPTION 'Domaine % non éditable', p_domain USING ERRCODE = '42501';
  END IF;
  UPDATE ref_code
    SET is_active = COALESCE(p_active, true), updated_at = NOW()
    WHERE id = p_id AND domain = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Valeur introuvable' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('id', p_id, 'domain', p_domain, 'is_active', COALESCE(p_active, true));
END;
$$;

COMMENT ON FUNCTION api.rpc_set_ref_code_active(uuid, text, boolean) IS
'Phase 7.5 — (dés)active une valeur ref_code (gated super-admin, domaine éditable).';

-- RÉORDONNE : position = rang (1-based) dans le tableau d'ids fourni.
CREATE OR REPLACE FUNCTION api.rpc_reorder_ref_code(
  p_domain text,
  p_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $$
DECLARE
  i integer;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;
  IF NOT api.ref_code_domain_is_editable(p_domain) THEN
    RAISE EXCEPTION 'Domaine % non éditable', p_domain USING ERRCODE = '42501';
  END IF;
  FOR i IN 1 .. COALESCE(array_length(p_ids, 1), 0) LOOP
    UPDATE ref_code SET position = i, updated_at = NOW()
      WHERE id = p_ids[i] AND domain = p_domain;
  END LOOP;
  RETURN jsonb_build_object('domain', p_domain, 'count', COALESCE(array_length(p_ids, 1), 0));
END;
$$;

COMMENT ON FUNCTION api.rpc_reorder_ref_code(text, uuid[]) IS
'Phase 7.5 — réordonne les valeurs d''un domaine ref_code (position = rang ; gated super-admin).';

-- Liste des domaines ÉDITABLES (non structurels) + compteurs, pour le maître de l'éditeur.
-- Lecture seule (ref_code/registry public-read) ⇒ pas de DEFINER.
CREATE OR REPLACE FUNCTION api.list_ref_code_domains()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api
AS $$
  SELECT COALESCE(jsonb_agg(d ORDER BY d->>'label'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'domain', rc.domain,
      'label', COALESCE(reg.name, rc.domain),
      'n_values', count(*),
      'n_active', count(*) FILTER (WHERE rc.is_active)
    ) AS d
    FROM ref_code rc
    LEFT JOIN ref_code_domain_registry reg ON reg.domain = rc.domain
    GROUP BY rc.domain, reg.name
    HAVING api.ref_code_domain_is_editable(rc.domain)
  ) s;
$$;

COMMENT ON FUNCTION api.list_ref_code_domains() IS
'Phase 7.5 — domaines ref_code éditables (non structurels) + compteurs, pour le maître de l''éditeur de référentiels.';

GRANT EXECUTE ON FUNCTION api.ref_code_domain_is_editable(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_ref_code_domains() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_upsert_ref_code(text, text, uuid, text, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_set_ref_code_active(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_reorder_ref_code(text, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
