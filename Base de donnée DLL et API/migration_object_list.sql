-- migration_object_list.sql — Module « Listes & templates d'envoi »
-- =============================================================================
-- Un conseiller OTI transforme une sélection (liste STATIQUE) ou un jeu de
-- filtres Explorer (liste DYNAMIQUE, ré-évaluée à chaque accès) en une liste
-- curatée, imprimable / envoyable par email / partageable par lien public.
--
-- Design : docs/superpowers/specs/2026-07-01-listes-templates-envoi-design.md
-- Plan    : docs/superpowers/plans/2026-07-01-listes-templates-envoi.md
--
-- Invariants respectés :
--   * object.id est TEXT (org_object_id / object_id = text, FK -> object(id)).
--   * Tables verrouillées ; accès via RPCs SECURITY DEFINER authorize-once (§36/§61).
--   * gen_random_uuid() uniquement (pas d'extensions dans le search_path — §29).
--   * Résolution dynamique = wrapper du leaf existant api.get_filtered_object_ids
--     (published-only, borné) — zéro duplication du prédicat de filtre.
--   * Page publique = objets publiés uniquement, aucune PII destinataire, token >=128 bits.
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- =============================================================================

-- ---------- 1. Tables ----------

CREATE TABLE IF NOT EXISTS object_list (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_object_id    text NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('static','dynamic')),
  name             text NOT NULL,
  name_en          text,
  recipient_label  text,                       -- PII : jamais émise par le RPC public
  intro_fr         text,
  intro_en         text,
  template         text NOT NULL DEFAULT 'carnet' CHECK (template IN ('carnet','grille','itineraire')),
  accent           text NOT NULL DEFAULT 'teal'   CHECK (accent   IN ('teal','green','gold','terra')),
  lang             text NOT NULL DEFAULT 'fr'      CHECK (lang     IN ('fr','en')),
  cover_url        text,
  show_map         boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'draft'   CHECK (status   IN ('draft','sent','shared')),
  filters          jsonb,                      -- dynamique : payload {buckets:[{types,filters,search}]}
  filters_url      text,                       -- URL Explorer (re-hydratation UI + résumé) — jamais pour la résolution
  share_token      text,
  share_enabled    boolean NOT NULL DEFAULT false,
  share_expires_at timestamptz,
  last_sent_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_object_list_dynamic_has_filters CHECK (kind = 'static' OR filters IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_list_share_token
  ON object_list(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_list_org     ON object_list(org_object_id);
CREATE INDEX IF NOT EXISTS idx_object_list_creator ON object_list(created_by);

CREATE TABLE IF NOT EXISTS object_list_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id    uuid NOT NULL REFERENCES object_list(id) ON DELETE CASCADE,
  object_id  text NOT NULL REFERENCES object(id)       ON DELETE CASCADE,
  position   int  NOT NULL,
  note_fr    text,
  note_en    text,
  UNIQUE (list_id, object_id)
);
CREATE INDEX IF NOT EXISTS idx_object_list_item_list ON object_list_item(list_id, position);

-- Tenue à jour de updated_at
CREATE OR REPLACE FUNCTION api.tg_object_list_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_object_list_touch ON object_list;
CREATE TRIGGER trg_object_list_touch BEFORE UPDATE ON object_list
  FOR EACH ROW EXECUTE FUNCTION api.tg_object_list_touch();

-- ---------- 2. Verrouillage : RLS + lock PostgREST direct ----------
ALTER TABLE object_list      ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_list_item ENABLE ROW LEVEL SECURITY;

-- Aucun accès PostgREST direct : tout passe par les RPC DEFINER ci-dessous.
REVOKE ALL ON TABLE object_list      FROM anon, authenticated;
REVOKE ALL ON TABLE object_list_item FROM anon, authenticated;

-- ---------- 3. Helpers d'autorisation ----------

CREATE OR REPLACE FUNCTION api.user_can_read_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (SELECT 1 FROM object_list l
                 WHERE l.id = p_list_id
                   AND l.org_object_id = api.current_user_org_id());
$$;

CREATE OR REPLACE FUNCTION api.user_can_write_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (SELECT 1 FROM object_list l
                 WHERE l.id = p_list_id
                   AND l.org_object_id = api.current_user_org_id()
                   AND (l.created_by = auth.uid()
                        OR api.current_user_admin_rank() IS NOT NULL));
$$;

REVOKE ALL ON FUNCTION api.user_can_read_list(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_read_list(uuid)  TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_write_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_write_list(uuid) TO authenticated, service_role;

-- Policies de lecture (defense-in-depth ; l'app passe par les RPC). Pas de policy
-- d'écriture : les writes sont réservés aux RPC DEFINER (owner postgres). anon n'a
-- aucun grant sur la table ⇒ ne touche jamais ces prédicats (P0.3).
DROP POLICY IF EXISTS read_object_list ON object_list;
CREATE POLICY read_object_list ON object_list FOR SELECT
  USING (api.user_can_read_list(id));
DROP POLICY IF EXISTS read_object_list_item ON object_list_item;
CREATE POLICY read_object_list_item ON object_list_item FOR SELECT
  USING (api.user_can_read_list(list_id));

-- ---------- 4. Résolveur dynamique (wrapper du leaf de filtre) ----------
-- p_buckets : soit un tableau [{types,filters,search}], soit {buckets:[...]}.
CREATE OR REPLACE FUNCTION api.resolve_list_object_ids(
  p_buckets jsonb,
  p_published_only boolean DEFAULT true,
  p_limit int DEFAULT 200
) RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api AS $$
DECLARE
  v_arr jsonb := CASE
                   WHEN p_buckets IS NULL THEN '[]'::jsonb
                   WHEN jsonb_typeof(p_buckets) = 'array' THEN p_buckets
                   WHEN p_buckets ? 'buckets' THEN p_buckets->'buckets'
                   ELSE '[]'::jsonb
                 END;
  v_status object_status[] := CASE WHEN p_published_only
                                   THEN ARRAY['published']::object_status[]
                                   ELSE NULL END;
  v_lim int := LEAST(GREATEST(COALESCE(p_limit,200),1),200);  -- ponytail: plafond 200, upgrade=pagination
BEGIN
  RETURN QUERY
  WITH ids AS (
    SELECT g.object_id, g.relevance, g.label_rank
    FROM jsonb_array_elements(v_arr) AS b(elem)
    CROSS JOIN LATERAL api.get_filtered_object_ids(
      COALESCE(b.elem->'filters', '{}'::jsonb),
      CASE WHEN b.elem ? 'types' AND jsonb_typeof(b.elem->'types') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(b.elem->'types'))::object_type[]
           ELSE NULL END,
      v_status,
      NULLIF(b.elem->>'search','')
    ) g
  ),
  dedup AS (
    SELECT DISTINCT ON (object_id) object_id, relevance, label_rank
    FROM ids
    ORDER BY object_id, relevance DESC, label_rank
  )
  SELECT object_id FROM dedup
  ORDER BY relevance DESC, label_rank, object_id
  LIMIT v_lim;
END;
$$;
REVOKE ALL ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.resolve_list_object_ids(jsonb, boolean, int) TO authenticated, service_role;

-- ---------- 5. Membres effectifs d'une liste (statique OU dynamique) ----------
-- Helper interne : jamais exposé (les callers DEFINER l'exécutent en tant qu'owner).
-- Statique : object_list_item ordonné ; published_only filtre sur object.status.
-- Dynamique : résolveur ci-dessus (ordinalité = position), notes NULL.
CREATE OR REPLACE FUNCTION api.list_effective_object_ids(
  p_list_id uuid,
  p_published_only boolean
) RETURNS TABLE(object_id text, pos int, note_fr text, note_en text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api AS $$
  WITH l AS (SELECT * FROM object_list WHERE id = p_list_id)
  SELECT i.object_id, i.position, i.note_fr, i.note_en
  FROM l
  JOIN object_list_item i ON i.list_id = l.id
  JOIN object o ON o.id = i.object_id
  WHERE l.kind = 'static'
    AND (NOT p_published_only OR o.status = 'published')
  UNION ALL
  SELECT r.object_id, r.ord::int, NULL::text, NULL::text
  FROM l
  CROSS JOIN LATERAL api.resolve_list_object_ids(l.filters, p_published_only, 200)
    WITH ORDINALITY AS r(object_id, ord)
  WHERE l.kind = 'dynamic';
$$;
REVOKE ALL ON FUNCTION api.list_effective_object_ids(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.list_effective_object_ids(uuid, boolean) TO service_role;

-- ---------- 6. RPCs propriétaires (authenticated) ----------

-- 6.1 Grille « Mes listes »
CREATE OR REPLACE FUNCTION api.list_my_lists()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT l.id, l.name, l.name_en, l.kind, l.status, l.lang, l.recipient_label,
           l.cover_url, l.updated_at,
           cnt.item_count, tb.type_breakdown
    FROM object_list l
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS item_count
      FROM api.list_effective_object_ids(l.id, l.kind = 'dynamic') e
    ) cnt
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', otype, 'n', n) ORDER BY n DESC), '[]'::jsonb) AS type_breakdown
      FROM (
        SELECT o.object_type::text AS otype, count(*) AS n
        FROM api.list_effective_object_ids(l.id, l.kind = 'dynamic') e
        JOIN object o ON o.id = e.object_id
        GROUP BY o.object_type
      ) t
    ) tb
    WHERE l.org_object_id = api.current_user_org_id() OR api.is_platform_superuser()
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_my_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_lists() TO authenticated, service_role;

-- 6.2 Détail d'une liste (compose)
CREATE OR REPLACE FUNCTION api.get_list(p_list_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
DECLARE
  v_list  object_list;
  v_pub   boolean;
  v_ids   text[];
  v_cards jsonb;
  v_items jsonb;
BEGIN
  IF NOT api.user_can_read_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_list FROM object_list WHERE id = p_list_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- statique : montre tous les items curatés ; dynamique : domaine publié.
  v_pub := (v_list.kind = 'dynamic');

  SELECT array_agg(object_id ORDER BY pos)
    INTO v_ids
  FROM api.list_effective_object_ids(p_list_id, v_pub);

  v_cards := COALESCE(
    api.get_object_cards_batch(COALESCE(v_ids, ARRAY[]::text[]), ARRAY[v_list.lang]::text[])::jsonb,
    '[]'::jsonb);

  WITH e AS (SELECT * FROM api.list_effective_object_ids(p_list_id, v_pub)),
       c AS (SELECT (elem->>'id') AS oid, elem AS card
             FROM jsonb_array_elements(v_cards) elem)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'object_id', e.object_id,
           'position',  e.pos,
           'note_fr',   e.note_fr,
           'note_en',   e.note_en,
           'card',      c.card
         ) ORDER BY e.pos), '[]'::jsonb)
    INTO v_items
  FROM e LEFT JOIN c ON c.oid = e.object_id;

  RETURN json_build_object(
    'id', v_list.id, 'kind', v_list.kind,
    'name', v_list.name, 'name_en', v_list.name_en,
    'recipient_label', v_list.recipient_label,
    'intro_fr', v_list.intro_fr, 'intro_en', v_list.intro_en,
    'template', v_list.template, 'accent', v_list.accent, 'lang', v_list.lang,
    'cover_url', v_list.cover_url, 'show_map', v_list.show_map, 'status', v_list.status,
    'filters', v_list.filters, 'filters_url', v_list.filters_url,
    'share_token', v_list.share_token, 'share_enabled', v_list.share_enabled,
    'share_expires_at', v_list.share_expires_at, 'updated_at', v_list.updated_at,
    'resolved_from', CASE WHEN v_list.kind = 'static' THEN 'items' ELSE 'filters' END,
    'items', v_items
  );
END; $$;
REVOKE ALL ON FUNCTION api.get_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_list(uuid) TO authenticated, service_role;

-- 6.3 Création (statique depuis une sélection, ou dynamique depuis des filtres)
CREATE OR REPLACE FUNCTION api.create_list(
  p_kind text,
  p_name text,
  p_from_object_ids text[] DEFAULT NULL,
  p_filters jsonb DEFAULT NULL,
  p_filters_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
DECLARE
  v_org text := api.current_user_org_id();
  v_id  uuid;
BEGIN
  IF v_org IS NULL AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'NO_ORG' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('static','dynamic') THEN
    RAISE EXCEPTION 'BAD_KIND';
  END IF;
  IF p_kind = 'dynamic' AND p_filters IS NULL THEN
    RAISE EXCEPTION 'DYNAMIC_REQUIRES_FILTERS';
  END IF;

  INSERT INTO object_list(org_object_id, created_by, kind, name, filters, filters_url)
  VALUES (v_org, auth.uid(), p_kind, COALESCE(NULLIF(p_name,''),'Nouvelle liste'),
          CASE WHEN p_kind = 'dynamic' THEN p_filters ELSE NULL END,
          CASE WHEN p_kind = 'dynamic' THEN p_filters_url ELSE NULL END)
  RETURNING id INTO v_id;

  IF p_kind = 'static' AND p_from_object_ids IS NOT NULL THEN
    INSERT INTO object_list_item(list_id, object_id, position)
    SELECT v_id, x.oid, x.ord::int
    FROM unnest(p_from_object_ids) WITH ORDINALITY AS x(oid, ord)
    WHERE EXISTS (SELECT 1 FROM object o WHERE o.id = x.oid)
    ON CONFLICT (list_id, object_id) DO NOTHING;
  END IF;

  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION api.create_list(text, text, text[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.create_list(text, text, text[], jsonb, text) TO authenticated, service_role;

-- 6.4 Mise à jour des métadonnées (patch whitelisté)
CREATE OR REPLACE FUNCTION api.update_list(p_list_id uuid, p_patch jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
BEGIN
  IF NOT api.user_can_write_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE object_list l SET
    name            = COALESCE(p_patch->>'name', l.name),
    name_en         = CASE WHEN p_patch ? 'name_en'         THEN p_patch->>'name_en'         ELSE l.name_en END,
    recipient_label = CASE WHEN p_patch ? 'recipient_label' THEN p_patch->>'recipient_label' ELSE l.recipient_label END,
    intro_fr        = CASE WHEN p_patch ? 'intro_fr'        THEN p_patch->>'intro_fr'        ELSE l.intro_fr END,
    intro_en        = CASE WHEN p_patch ? 'intro_en'        THEN p_patch->>'intro_en'        ELSE l.intro_en END,
    template        = COALESCE(p_patch->>'template', l.template),
    accent          = COALESCE(p_patch->>'accent', l.accent),
    lang            = COALESCE(p_patch->>'lang', l.lang),
    cover_url       = CASE WHEN p_patch ? 'cover_url' THEN p_patch->>'cover_url' ELSE l.cover_url END,
    show_map        = COALESCE((p_patch->>'show_map')::boolean, l.show_map),
    status          = COALESCE(p_patch->>'status', l.status)
  WHERE l.id = p_list_id;
  RETURN api.get_list(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.update_list(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.update_list(uuid, jsonb) TO authenticated, service_role;

-- 6.5 Remplacement des items statiques (reconcile non-destructif — §40)
CREATE OR REPLACE FUNCTION api.set_list_items(p_list_id uuid, p_items jsonb)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
BEGIN
  IF NOT api.user_can_write_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM object_list WHERE id = p_list_id AND kind = 'static') THEN
    RAISE EXCEPTION 'ITEMS_ONLY_ON_STATIC';
  END IF;

  -- Retraits : items absents du payload
  DELETE FROM object_list_item i
  WHERE i.list_id = p_list_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) x
                    WHERE x->>'object_id' = i.object_id);

  -- Upserts : position + notes
  INSERT INTO object_list_item(list_id, object_id, position, note_fr, note_en)
  SELECT p_list_id, x->>'object_id', COALESCE((x->>'position')::int, 0),
         x->>'note_fr', x->>'note_en'
  FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) x
  WHERE EXISTS (SELECT 1 FROM object o WHERE o.id = x->>'object_id')
  ON CONFLICT (list_id, object_id) DO UPDATE
    SET position = EXCLUDED.position,
        note_fr  = EXCLUDED.note_fr,
        note_en  = EXCLUDED.note_en;

  UPDATE object_list SET updated_at = now() WHERE id = p_list_id;
  RETURN api.get_list(p_list_id);
END; $$;
REVOKE ALL ON FUNCTION api.set_list_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_list_items(uuid, jsonb) TO authenticated, service_role;

-- 6.6 Suppression
CREATE OR REPLACE FUNCTION api.delete_list(p_list_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
BEGIN
  IF NOT api.user_can_write_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  DELETE FROM object_list WHERE id = p_list_id;  -- cascade items
END; $$;
REVOKE ALL ON FUNCTION api.delete_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_list(uuid) TO authenticated, service_role;

-- 6.7 Partage : génère/rote le token, (dé)active le lien
CREATE OR REPLACE FUNCTION api.share_list(
  p_list_id uuid,
  p_enable boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
DECLARE v_token text; v_list object_list;
BEGIN
  IF NOT api.user_can_write_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_list FROM object_list WHERE id = p_list_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_enable THEN
    v_token := COALESCE(v_list.share_token,
                        replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''));
    UPDATE object_list SET
      share_token = v_token, share_enabled = true,
      share_expires_at = p_expires_at,
      status = CASE WHEN status = 'draft' THEN 'shared' ELSE status END
    WHERE id = p_list_id;
  ELSE
    UPDATE object_list SET share_enabled = false WHERE id = p_list_id;
    v_token := v_list.share_token;
  END IF;

  RETURN json_build_object(
    'share_token', CASE WHEN p_enable THEN v_token ELSE v_list.share_token END,
    'share_url_path', CASE WHEN p_enable THEN '/l/' || v_token ELSE NULL END,
    'share_enabled', p_enable,
    'share_expires_at', p_expires_at
  );
END; $$;
REVOKE ALL ON FUNCTION api.share_list(uuid, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.share_list(uuid, boolean, timestamptz) TO authenticated, service_role;

-- ---------- 7. RPC PUBLIQUE (anon) : lecture par token ----------
-- Objets PUBLIÉS uniquement ; AUCUNE PII destinataire ; réponse indifférenciée
-- (NULL) si token invalide / désactivé / expiré.
CREATE OR REPLACE FUNCTION api.get_public_list_by_token(p_token text)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
DECLARE
  v_list  object_list;
  v_ids   text[];
  v_cards jsonb;
  v_items jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO v_list FROM object_list
  WHERE share_token = p_token
    AND share_enabled = true
    AND (share_expires_at IS NULL OR share_expires_at > now());
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT array_agg(object_id ORDER BY pos)
    INTO v_ids
  FROM api.list_effective_object_ids(v_list.id, true);   -- published-only, TOUJOURS

  v_cards := COALESCE(
    api.get_object_cards_batch(COALESCE(v_ids, ARRAY[]::text[]), ARRAY[v_list.lang]::text[])::jsonb,
    '[]'::jsonb);

  WITH e AS (SELECT * FROM api.list_effective_object_ids(v_list.id, true)),
       c AS (SELECT (elem->>'id') AS oid, elem AS card
             FROM jsonb_array_elements(v_cards) elem)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'object_id', e.object_id, 'position', e.pos,
           'note_fr', e.note_fr, 'note_en', e.note_en, 'card', c.card
         ) ORDER BY e.pos), '[]'::jsonb)
    INTO v_items
  FROM e LEFT JOIN c ON c.oid = e.object_id;

  -- NB : pas de recipient_label, created_by, org_object_id, filters, share_token.
  RETURN json_build_object(
    'name', v_list.name, 'name_en', v_list.name_en,
    'intro_fr', v_list.intro_fr, 'intro_en', v_list.intro_en,
    'template', v_list.template, 'accent', v_list.accent, 'lang', v_list.lang,
    'cover_url', v_list.cover_url, 'show_map', v_list.show_map,
    'items', v_items
  );
END; $$;
REVOKE ALL ON FUNCTION api.get_public_list_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.get_public_list_by_token(text) TO anon, authenticated, service_role;

-- ---------- 7b. Marquer une liste « envoyée » (route email /api/lists/send) ----------
CREATE OR REPLACE FUNCTION api.mark_list_sent(p_list_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
BEGIN
  IF NOT api.user_can_write_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE object_list SET last_sent_at = now(), status = 'sent' WHERE id = p_list_id;
END; $$;
REVOKE ALL ON FUNCTION api.mark_list_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.mark_list_sent(uuid) TO authenticated, service_role;

-- ---------- 8. Reload PostgREST ----------
NOTIFY pgrst, 'reload schema';
