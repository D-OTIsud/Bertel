-- Current explicit ORG/portal authority; creator/email are provenance/contact data.
-- Reviewed live and final fresh predecessors, including identity migration 19k.
-- No backfill, creator rewrite, public reader, realm or publication change.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';

DO $preflight$
DECLARE r record; v_hash text; v_definer boolean; v_language text; v_return text; v_set boolean; v_volatility "char"; v_kind "char"; v_command text; v_roles text; v_mode text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('api.current_user_actor_id()',ARRAY['8c5f5d36e3b16a6dcdf0f354be116438','36fab44e19cb957e578ad3f10c92b879']::text[],'36fab44e19cb957e578ad3f10c92b879',true,'sql','uuid',false),
    ('api.user_actor_ids()',ARRAY['3465131da540118da4c893a78ff6371f','4cae5bc7e41b03f619e58bc53f6bcad0']::text[],'4cae5bc7e41b03f619e58bc53f6bcad0',false,'sql','uuid',true),
    ('api.is_object_owner(text)',ARRAY['ebc71d1957e73a2544a1797551b1f9e6','433c50d4ca919f6f96121ba7b284935f']::text[],'433c50d4ca919f6f96121ba7b284935f',true,'sql','boolean',false),
    ('api.user_can_write_object_canonical(text)',ARRAY['9be1b9e2ff9a0c30bb2b5e7a20c7998d','8422cebec4b349324ee28f8397da21d7','782b57ec1067ddd041338656ce8b91a2']::text[],'782b57ec1067ddd041338656ce8b91a2',true,'sql','boolean',false),
    ('api.current_user_extended_object_ids()',ARRAY['d74ba6cef4700267fdd9abed6248dbae','986ec97481bde29af1520f4c6ba539a2']::text[],'986ec97481bde29af1520f4c6ba539a2',true,'plpgsql','text',true)
  ) AS expected(signature,allowed_hashes,target_hash,definer,language,return_type,returns_set) LOOP
    SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),p.prosecdef,l.lanname,p.prorettype::regtype::text,p.proretset,p.provolatile,p.prokind
      INTO v_hash,v_definer,v_language,v_return,v_set,v_volatility,v_kind
      FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(r.signature);
    IF NOT FOUND OR v_definer IS DISTINCT FROM r.definer OR v_language IS DISTINCT FROM r.language
      OR v_return IS DISTINCT FROM r.return_type OR v_set IS DISTINCT FROM r.returns_set
      OR v_volatility<>'s' OR v_kind<>'f'
      OR NOT (v_hash=ANY(r.allowed_hashes)) THEN
      RAISE EXCEPTION 'Current-rights function predecessor differs: %',r.signature;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('media_tag','canonical_del_media_tag','DELETE','c69b9bb5cd7abba04f6fba70ff306b6a','e4a1530e6ea0f336fcb6b786dbb22768'),
    ('media_tag','canonical_upd_media_tag','UPDATE','9b924e787caf7009441a205a25d0f039','6a183ec330c44cec5a07630009466d3e'),
    ('object','owner_delete_object','DELETE','e59a7d59643aa1ff9e458b2b85229783','edcec5597c9635deda7c8612b7626d39'),
    ('object','owner_update_object','UPDATE','d11acf2a7431e69e2f3a4702af55e7dd','485fd90d32f5b14c956861ae9cb87d02'),
    ('object_room_type','canonical_del_object_room_type','DELETE','efdd33871b2f69e0dc1abbc5365e3a78','299b948dce42ae0be4fc556432ccb941'),
    ('object_room_type','canonical_upd_object_room_type','UPDATE','fc578b1a51081e50c778e53b8bb05178','623a033ebc6cb46646f0bd88e84bc55e'),
    ('object_room_type_amenity','canonical_del_object_room_type_amenity','DELETE','f2281f396b563b61b52013238c9d4285','af4e7756527fb26c688c9649c8b7388b'),
    ('object_room_type_amenity','canonical_upd_object_room_type_amenity','UPDATE','63f06cef8b9c384603b950121487c320','5122dbd0283da6e5c527275f5def65f6'),
    ('object_room_type_bed','canonical_del_object_room_type_bed','DELETE','bbae33cba141ad2b8a35ab733e971807','a04a459ee83c68d0f7c1d83ff2153bdf'),
    ('object_room_type_bed','canonical_upd_object_room_type_bed','UPDATE','f83cf8affa84617525044766370b5891','5aebad966a70983d889fb3a9bb97ae8b'),
    ('object_room_type_media','canonical_del_object_room_type_media','DELETE','caf694f67371db873f442f0cac234461','a29f1f085348df2c95870ebf4c650ece'),
    ('object_room_type_media','canonical_upd_object_room_type_media','UPDATE','cf9cb1ccbebe176cd46765827471696b','345cb49fc6830a8b052a390a7367528f'),
    ('media_tag','canonical_ins_media_tag','INSERT','550ebe9ba3fe135c5b815a57260b62be','8d8d20ce2a871d6876d0dce2ca7d2443'),
    ('object_room_type','canonical_ins_object_room_type','INSERT','25c1e85283c5aa26416de21f0cf78dce','ca44bb42a20192f101ddead2db9e0c6e'),
    ('object_room_type_amenity','canonical_ins_object_room_type_amenity','INSERT','d8cc7f2f596e09614f7f05d064b344b7','215f856f71a588928fa0fd25641a118b'),
    ('object_room_type_bed','canonical_ins_object_room_type_bed','INSERT','4de72b475c72ad82fe586b6538dad9d1','9985f945df11173fcb3fce5b623c79be'),
    ('object_room_type_media','canonical_ins_object_room_type_media','INSERT','0dbc1a2b26881f88ad2c9edbd2f07f93','a8868848730c3bf85b654c0138800572')
  ) AS expected(table_name,policy_name,command,old_hash,target_hash) LOOP
    SELECT md5(coalesce(qual,'')||chr(31)||coalesce(with_check,'')),cmd,roles::text,permissive
      INTO v_hash,v_command,v_roles,v_mode FROM pg_policies
      WHERE schemaname='public' AND tablename=r.table_name AND policyname=r.policy_name;
    IF NOT FOUND OR v_command IS DISTINCT FROM r.command OR v_roles IS DISTINCT FROM '{public}'
      OR v_mode IS DISTINCT FROM 'PERMISSIVE' OR v_hash NOT IN(r.old_hash,r.target_hash) THEN
      RAISE EXCEPTION 'Current-rights policy predecessor differs: %.%',r.table_name,r.policy_name;
    END IF;
  END LOOP;
END;
$preflight$;

-- Current table state is the authority for every private object access path.
-- Creator identity and email matches are audit/contact data, not grants.
CREATE OR REPLACE FUNCTION api.current_user_actor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT p.actor_id FROM public.app_user_profile p
  JOIN public.actor a ON a.id=p.actor_id
  WHERE p.id=(SELECT auth.uid()) AND p.role='actor'
    AND a.is_test=(SELECT api.current_user_test_realm());
$fn$;

CREATE OR REPLACE FUNCTION api.user_actor_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT p.actor_id
  FROM public.app_user_profile p
  WHERE p.id=(SELECT auth.uid()) AND p.role='actor' AND p.actor_id IS NOT NULL
    AND internal.actor_in_current_realm(p.actor_id);
$fn$;

CREATE OR REPLACE FUNCTION api.is_object_owner(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT COALESCE((SELECT auth.role()) IN ('service_role','admin')
    OR api.is_platform_superuser(), false);
$fn$;

CREATE OR REPLACE FUNCTION api.user_can_write_object_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT COALESCE(api.is_object_owner(p_object_id)
    OR api.user_can_write_canonical(p_object_id), false);
$fn$;

CREATE OR REPLACE FUNCTION api.current_user_extended_object_ids()
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
BEGIN
  -- Only a current authenticated identity can carry private scope.
  IF (SELECT auth.uid()) IS NULL THEN RETURN; END IF;
  IF api.is_actor_persona() THEN
    RETURN QUERY SELECT * FROM api.current_user_portal_object_ids();
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.object_id
  FROM (
    SELECT m.org_object_id FROM public.user_org_membership m
      WHERE m.user_id=(SELECT auth.uid()) AND m.is_active IS TRUE
    UNION
    SELECT l.object_id FROM public.user_org_membership m
      JOIN public.object_org_link l ON l.org_object_id=m.org_object_id
      WHERE m.user_id=(SELECT auth.uid()) AND m.is_active IS TRUE
    UNION
    SELECT o.id FROM public.object o WHERE o.status='published'
      AND EXISTS(SELECT 1 FROM public.user_org_membership m
        JOIN public.org_config c ON c.org_object_id=m.org_object_id
        WHERE m.user_id=(SELECT auth.uid()) AND m.is_active IS TRUE
          AND c.access_scope='all_published')
  ) s(object_id)
  JOIN public.object o ON o.id=s.object_id
  WHERE o.is_test=(SELECT api.current_user_test_realm());
END;
$fn$;

COMMENT ON FUNCTION api.user_actor_ids() IS 'Compatibility identity helper: current actor profile binding only; email never grants scope.';
COMMENT ON FUNCTION api.current_user_actor_id() IS 'Current authenticated actor profile binding; demotion or unlink removes portal identity immediately.';
COMMENT ON FUNCTION api.is_object_owner(text) IS 'Legacy name retained for technical/platform authority only. Canonical staff writes use current explicit publisher permissions.';

-- Alter only the reviewed DML clauses: keep policy identity, command, roles and mode.
ALTER POLICY "owner_update_object" ON public.object
  USING (api.user_can_write_object_canonical(id))
  WITH CHECK (api.user_can_write_object_canonical(id));
ALTER POLICY "owner_delete_object" ON public.object
  USING (api.user_can_write_object_canonical(id));
ALTER POLICY "canonical_ins_object_room_type" ON public.object_room_type
  WITH CHECK (api.user_can_write_object_canonical(object_id));
ALTER POLICY "canonical_upd_object_room_type" ON public.object_room_type
  USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));
ALTER POLICY "canonical_del_object_room_type" ON public.object_room_type
  USING (api.user_can_write_object_canonical(object_id));
ALTER POLICY "canonical_ins_object_room_type_amenity" ON public.object_room_type_amenity
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_upd_object_room_type_amenity" ON public.object_room_type_amenity
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_del_object_room_type_amenity" ON public.object_room_type_amenity
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_ins_object_room_type_bed" ON public.object_room_type_bed
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_upd_object_room_type_bed" ON public.object_room_type_bed
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_del_object_room_type_bed" ON public.object_room_type_bed
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_ins_object_room_type_media" ON public.object_room_type_media
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_upd_object_room_type_media" ON public.object_room_type_media
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_del_object_room_type_media" ON public.object_room_type_media
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_ins_media_tag" ON public.media_tag
  WITH CHECK (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))));
ALTER POLICY "canonical_upd_media_tag" ON public.media_tag
  USING (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))))
  WITH CHECK (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))));
ALTER POLICY "canonical_del_media_tag" ON public.media_tag
  USING (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))));

DO $postflight$
DECLARE r record; v_hash text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('api.current_user_actor_id()','36fab44e19cb957e578ad3f10c92b879'),
    ('api.user_actor_ids()','4cae5bc7e41b03f619e58bc53f6bcad0'),
    ('api.is_object_owner(text)','433c50d4ca919f6f96121ba7b284935f'),
    ('api.user_can_write_object_canonical(text)','782b57ec1067ddd041338656ce8b91a2'),
    ('api.current_user_extended_object_ids()','986ec97481bde29af1520f4c6ba539a2')) AS expected(signature,target_hash) LOOP
    SELECT md5(replace(prosrc,E'\r\n',E'\n')) INTO v_hash FROM pg_proc WHERE oid=to_regprocedure(r.signature);
    IF v_hash IS DISTINCT FROM r.target_hash THEN RAISE EXCEPTION 'Current-rights function postcondition differs: %',r.signature; END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('media_tag','canonical_del_media_tag','e4a1530e6ea0f336fcb6b786dbb22768'),
    ('media_tag','canonical_upd_media_tag','6a183ec330c44cec5a07630009466d3e'),
    ('object','owner_delete_object','edcec5597c9635deda7c8612b7626d39'),
    ('object','owner_update_object','485fd90d32f5b14c956861ae9cb87d02'),
    ('object_room_type','canonical_del_object_room_type','299b948dce42ae0be4fc556432ccb941'),
    ('object_room_type','canonical_upd_object_room_type','623a033ebc6cb46646f0bd88e84bc55e'),
    ('object_room_type_amenity','canonical_del_object_room_type_amenity','af4e7756527fb26c688c9649c8b7388b'),
    ('object_room_type_amenity','canonical_upd_object_room_type_amenity','5122dbd0283da6e5c527275f5def65f6'),
    ('object_room_type_bed','canonical_del_object_room_type_bed','a04a459ee83c68d0f7c1d83ff2153bdf'),
    ('object_room_type_bed','canonical_upd_object_room_type_bed','5aebad966a70983d889fb3a9bb97ae8b'),
    ('object_room_type_media','canonical_del_object_room_type_media','a29f1f085348df2c95870ebf4c650ece'),
    ('object_room_type_media','canonical_upd_object_room_type_media','345cb49fc6830a8b052a390a7367528f'),
    ('media_tag','canonical_ins_media_tag','8d8d20ce2a871d6876d0dce2ca7d2443'),
    ('object_room_type','canonical_ins_object_room_type','ca44bb42a20192f101ddead2db9e0c6e'),
    ('object_room_type_amenity','canonical_ins_object_room_type_amenity','215f856f71a588928fa0fd25641a118b'),
    ('object_room_type_bed','canonical_ins_object_room_type_bed','9985f945df11173fcb3fce5b623c79be'),
    ('object_room_type_media','canonical_ins_object_room_type_media','a8868848730c3bf85b654c0138800572')) AS expected(table_name,policy_name,target_hash) LOOP
    SELECT md5(coalesce(qual,'')||chr(31)||coalesce(with_check,'')) INTO v_hash FROM pg_policies
      WHERE schemaname='public' AND tablename=r.table_name AND policyname=r.policy_name;
    IF v_hash IS DISTINCT FROM r.target_hash THEN RAISE EXCEPTION 'Current-rights policy postcondition differs: %.%',r.table_name,r.policy_name; END IF;
  END LOOP;
END;
$postflight$;
NOTIFY pgrst,'reload schema';
COMMIT;
