-- rollback_listes_personnelles_une_cycle_vie.sql
-- Annule supabase/migrations/20260907044528_listes_personnelles_une_cycle_vie.sql.
--
-- Restaure les corps SOURCES historiques d'avant cette migration : 17l
-- (migration_list_create_superuser_only.sql, création réservée au superuser
-- plateforme) + 17k (migration_list_write_creator_only.sql, écriture
-- créateur/reprise d'orpheline) pour l'écriture/la création, et le corps
-- original de migration_object_list.sql pour tout le reste
-- (user_can_read_list, list_effective_object_ids, get_list, list_my_lists,
-- update_list, set_list_items, delete_list, share_list, mark_list_sent(uuid)).
-- Ces corps sont copiés VERBATIM depuis les fichiers historiques ci-dessus —
-- ce que ce rollback prouve, c'est la restauration de CES SOURCES, PAS un
-- état "exact" de production : aucune capture des définitions live n'a été
-- faite avant cette migration (le préflight §live-preflight-verified.md est
-- un agrégat de catalogue/comptages, pas un dump de corps de fonction).
--
-- ⚠️ CE ROLLBACK ROUVRE :
--   - `api.list_my_lists()` au superuser sur TOUTE liste de l'ORG (la grille
--     générale que la migration fermait, règle 2 du cadrage) ;
--   - `api.user_can_read_list` en lecture ORG-large : n'importe quel membre
--     relit à nouveau la liste personnelle non proposée d'un collègue ;
--   - la CRÉATION de listes au SEUL superuser plateforme (17l) — les lecteurs/
--     éditeurs non-superuser ne peuvent plus créer de liste ;
--   - `api.mark_list_sent(uuid)` grantée à `authenticated` : un client peut à
--     nouveau se déclarer « envoyé » sans preuve d'acceptation SMTP.
-- et SUPPRIME les colonnes de cycle de vie (is_featured, feature_requested_at,
-- last_activity_at) — toute mise à la une / proposition / horloge d'activité
-- posée depuis l'application de la migration est DÉFINITIVEMENT PERDUE.
--
-- Idempotent (DROP ... IF EXISTS / CREATE OR REPLACE).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Désinscrire le job cron (no-op si pg_cron absent ou job déjà absent).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'purge-expired-lists';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 2. Supprimer les fonctions introduites par cette migration.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS internal.purge_expired_lists();
DROP FUNCTION IF EXISTS api.ensure_list_share_link(uuid);
DROP FUNCTION IF EXISTS api.duplicate_list(uuid);
DROP FUNCTION IF EXISTS api.restore_list(uuid);
DROP FUNCTION IF EXISTS api.set_list_featured(uuid, boolean);
DROP FUNCTION IF EXISTS api.review_list_feature(uuid, boolean);
DROP FUNCTION IF EXISTS api.request_list_feature(uuid);
DROP FUNCTION IF EXISTS api.list_list_proposals();
DROP FUNCTION IF EXISTS api.list_featured_lists();
DROP FUNCTION IF EXISTS internal.list_sender_authorized(uuid, uuid);
DROP FUNCTION IF EXISTS api.mark_list_sent(uuid, uuid);
DROP FUNCTION IF EXISTS internal.build_list_detail_json(uuid);
DROP FUNCTION IF EXISTS internal.list_grid_summary(uuid);
DROP FUNCTION IF EXISTS api.user_can_manage_list_feature_action(uuid);
DROP FUNCTION IF EXISTS api.user_is_list_org_admin(uuid);
DROP FUNCTION IF EXISTS api.user_can_use_list(uuid);
DROP FUNCTION IF EXISTS api.list_is_archived(boolean, timestamptz);
DROP FUNCTION IF EXISTS internal.org_is_admin(uuid, text);
DROP FUNCTION IF EXISTS internal.org_admin_rank(uuid, text);
DROP FUNCTION IF EXISTS internal.org_membership_active(uuid, text);

-- ---------------------------------------------------------------------
-- 3. Restaurer l'ancienne signature de mark_list_sent (grantée authenticated).
--    Corps identique à migration_object_list.sql §7b.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Restaurer user_can_read_list (base) / user_can_write_list (17k) /
--    create_list (17l) / get_list, list_my_lists, update_list, set_list_items
--    (base, corps inchangés par 17k/17l) à leur état d'avant cette migration.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.user_can_read_list(p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (SELECT 1 FROM object_list l
                 WHERE l.id = p_list_id
                   AND l.org_object_id = api.current_user_org_id());
$$;

CREATE OR REPLACE FUNCTION api.user_can_write_list(p_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT COALESCE(
    api.is_platform_superuser()
      OR EXISTS (
        SELECT 1
        FROM object_list l
        WHERE l.id = p_list_id
          AND l.org_object_id = api.current_user_org_id()
          AND (
            l.created_by = (SELECT auth.uid())
            OR (
              COALESCE(api.current_user_admin_rank(), 0) >= 30
              AND NOT EXISTS (
                SELECT 1 FROM user_org_membership m
                WHERE m.user_id       = l.created_by
                  AND m.org_object_id = l.org_object_id
                  AND m.is_active
              )
            )
          )
      ),
    FALSE);
$function$;

COMMENT ON FUNCTION api.user_can_write_list(uuid) IS
  'Écriture d''une liste : son créateur, ou un admin d''ORG (rang >= 30) si le créateur n''est '
  'plus membre actif (reprise d''orpheline), ou le superuser plateforme. Le bras '
  '« n''importe quel rôle admin » a été retiré le 2026-08-31 (17k).';

-- Corps original de migration_object_list.sql §5 (avant le filtre de corpus de
-- test ajouté en 2e revue architecte §2) — touchée par cette migration, donc
-- restaurée ici comme les autres.
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
COMMENT ON FUNCTION api.list_effective_object_ids(uuid, boolean) IS NULL;

CREATE OR REPLACE FUNCTION api.create_list(
  p_kind text,
  p_name text,
  p_from_object_ids text[] DEFAULT NULL::text[],
  p_filters jsonb DEFAULT NULL::jsonb,
  p_filters_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'auth'
AS $function$
DECLARE v_org text := api.current_user_org_id(); v_id uuid;
BEGIN
  IF NOT COALESCE(api.is_platform_superuser(), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN: la création de listes est réservée aux superusers plateforme'
      USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'NO_ORG' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('static','dynamic') THEN RAISE EXCEPTION 'BAD_KIND'; END IF;
  IF p_kind = 'dynamic' AND p_filters IS NULL THEN RAISE EXCEPTION 'DYNAMIC_REQUIRES_FILTERS'; END IF;
  INSERT INTO object_list(org_object_id, created_by, kind, name, filters, filters_url)
  VALUES (v_org, auth.uid(), p_kind, COALESCE(NULLIF(p_name,''),'Nouvelle liste'),
          CASE WHEN p_kind = 'dynamic' THEN p_filters ELSE NULL END,
          CASE WHEN p_kind = 'dynamic' THEN p_filters_url ELSE NULL END)
  RETURNING id INTO v_id;
  IF p_kind = 'static' AND p_from_object_ids IS NOT NULL THEN
    INSERT INTO object_list_item(list_id, object_id, position)
    SELECT v_id, x.oid, x.ord::int FROM unnest(p_from_object_ids) WITH ORDINALITY AS x(oid, ord)
    WHERE EXISTS (SELECT 1 FROM object o WHERE o.id = x.oid) ON CONFLICT (list_id, object_id) DO NOTHING;
  END IF;
  RETURN v_id;
END; $function$;

COMMENT ON FUNCTION api.create_list(text, text, text[], jsonb, text) IS
  'Création d''une liste : superuser plateforme UNIQUEMENT (17l, arbitrage PO 2026-08-31). '
  'Le rang d''administration d''ORG ne suffit pas.';

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
  v_pub := (v_list.kind = 'dynamic');

  SELECT array_agg(object_id ORDER BY pos)
    INTO v_ids
  FROM api.list_effective_object_ids(p_list_id, v_pub);

  v_cards := COALESCE(
    api.get_object_cards_batch(COALESCE(v_ids, ARRAY[]::text[]), ARRAY[v_list.lang]::text[])::jsonb,
    '[]'::jsonb);

  WITH e AS (SELECT * FROM api.list_effective_object_ids(p_list_id, v_pub)),
       c AS (SELECT (elem->>'id') AS oid, elem AS card
             FROM jsonb_array_elements(v_cards) elem),
       ct AS (SELECT * FROM api.list_item_contacts(COALESCE(v_ids, ARRAY[]::text[])))
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'object_id', e.object_id,
           'position',  e.pos,
           'note_fr',   e.note_fr,
           'note_en',   e.note_en,
           'card',      c.card,
           'contacts',  COALESCE(ct.contacts, '{}'::jsonb)
         ) ORDER BY e.pos), '[]'::jsonb)
    INTO v_items
  FROM e
  LEFT JOIN c  ON c.oid = e.object_id
  LEFT JOIN ct ON ct.object_id = e.object_id;

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

CREATE OR REPLACE FUNCTION api.list_my_lists()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT l.id, l.name, l.name_en, l.kind, l.status, l.lang, l.recipient_label,
           l.accent, l.cover_url, l.updated_at,
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

  DELETE FROM object_list_item i
  WHERE i.list_id = p_list_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) x
                    WHERE x->>'object_id' = i.object_id);

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

-- Ces deux fonctions n'avaient jamais été touchées AVANT la revue architecte
-- (qui leur a ajouté un verrou FOR UPDATE) : la migration les redéfinit donc
-- désormais, et ce rollback doit les restaurer à leur corps EXACT de
-- migration_object_list.sql pour être un rollback complet.
CREATE OR REPLACE FUNCTION api.delete_list(p_list_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth AS $$
BEGIN
  IF NOT api.user_can_write_list(p_list_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  DELETE FROM object_list WHERE id = p_list_id;  -- cascade items
END; $$;

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

-- ---------------------------------------------------------------------
-- 5. Colonnes de cycle de vie : retirées (PERTE des drapeaux is_featured /
--    feature_requested_at et de l'horloge last_activity_at).
-- ---------------------------------------------------------------------
ALTER TABLE object_list DROP CONSTRAINT IF EXISTS chk_object_list_feature_request_closed;
DROP INDEX IF EXISTS idx_object_list_featured;
DROP INDEX IF EXISTS idx_object_list_pending_feature;
DROP INDEX IF EXISTS idx_object_list_retention;
ALTER TABLE object_list DROP COLUMN IF EXISTS is_featured;
ALTER TABLE object_list DROP COLUMN IF EXISTS feature_requested_at;
ALTER TABLE object_list DROP COLUMN IF EXISTS last_activity_at;

NOTIFY pgrst, 'reload schema';

COMMIT;
