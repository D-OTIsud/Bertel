-- During preparation, edition 1 follows the current technical publication.
-- A non-null first_release_id fixes the baseline when the edition is approved.
BEGIN;

CREATE TABLE thesaurus.public_launch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  first_release_id bigint REFERENCES thesaurus.release(release_id)
);
ALTER TABLE thesaurus.public_launch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE thesaurus.public_launch FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION thesaurus.public_edition_manifest(p_manifest jsonb, p_edition bigint)
RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog
AS $$
  SELECT p_manifest || jsonb_build_object(
    'release_id', p_edition,
    'previous_release_id', NULLIF(p_edition-1, 0),
    'changed_count', CASE WHEN p_edition=1 THEN p_manifest->'total_concepts'
      ELSE p_manifest->'changed_count' END
  )
$$;
REVOKE ALL ON FUNCTION thesaurus.public_edition_manifest(jsonb,bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION thesaurus.public_edition_dispatch(p_action text, p_edition bigint, p_params jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  first_release bigint;
  current_release bigint;
  internal_release bigint;
  edition bigint;
  snapshot_key text;
  result jsonb;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('manifest','release','concepts','concept','changes','export','resolve') THEN
    RAISE EXCEPTION 'Unknown public edition action' USING ERRCODE='PT400';
  END IF;

  SELECT l.first_release_id, i.current_release_id INTO first_release, current_release
  FROM thesaurus.public_launch l CROSS JOIN thesaurus.instance i
  WHERE l.singleton AND i.singleton;

  IF NOT FOUND OR current_release IS NULL OR current_release<first_release THEN
    RAISE EXCEPTION 'No official thesaurus edition is active' USING ERRCODE='PT503';
  END IF;
  first_release:=COALESCE(first_release,current_release);

  IF p_edition IS NULL THEN
    internal_release:=current_release;
    SELECT count(*) INTO edition FROM thesaurus.release r
    WHERE r.release_id BETWEEN first_release AND current_release;
  ELSE
    edition:=p_edition;
    IF edition<1 THEN RAISE EXCEPTION 'Invalid edition' USING ERRCODE='PT400'; END IF;
    SELECT r.release_id INTO internal_release FROM thesaurus.release r
    WHERE r.release_id BETWEEN first_release AND current_release
    ORDER BY r.release_id OFFSET edition-1 LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown edition' USING ERRCODE='PT404'; END IF;
  END IF;

  SELECT md5(r.manifest::text) INTO STRICT snapshot_key FROM thesaurus.release r
  WHERE r.release_id=internal_release;
  IF p_params->>'cursor_snapshot' IS NOT NULL
    AND p_params->>'cursor_snapshot' IS DISTINCT FROM snapshot_key THEN
    RAISE EXCEPTION 'invalid_cursor' USING ERRCODE='PT400';
  END IF;

  IF p_action='changes' AND edition=1 THEN
    -- The first edition has no public predecessor. Its feed starts with every
    -- public concept, using the same filters and keyset pagination as the reader.
    result:=thesaurus.public_dispatch('concepts', internal_release, p_params);
    result:=jsonb_set(result, '{data}', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'concept_id', x.item->'concept_id', 'change_type', 'added',
        'before', NULL, 'after', x.item
      ) ORDER BY x.position), '[]'::jsonb)
      FROM jsonb_array_elements(result->'data') WITH ORDINALITY x(item,position)
    ));
  ELSE
    result:=thesaurus.public_dispatch(
      CASE WHEN p_action='manifest' THEN 'release' ELSE p_action END,
      internal_release, p_params
    );
  END IF;

  result:=jsonb_set(result, '{meta}', (result->'meta') || jsonb_build_object(
    'release_id', edition, 'previous_release_id', NULLIF(edition-1,0), 'cursor_snapshot', snapshot_key
  ));

  IF p_action IN ('manifest','release') THEN
    result:=jsonb_set(result, '{data}', thesaurus.public_edition_manifest(result->'data', edition));
  END IF;

  IF p_action='manifest' THEN
    result:=jsonb_set(result, '{data,releases}', (
      SELECT COALESCE(jsonb_agg(thesaurus.public_edition_manifest(r.manifest, r.edition)
        ORDER BY r.edition DESC), '[]'::jsonb)
      FROM (
        SELECT manifest, row_number() OVER (ORDER BY release_id) AS edition
        FROM thesaurus.release
        WHERE release_id BETWEEN first_release AND current_release
        ORDER BY release_id DESC LIMIT 100
      ) r
    ));
  END IF;

  RETURN result;
END
$$;
REVOKE ALL ON FUNCTION thesaurus.public_edition_dispatch(text,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION thesaurus.public_edition_dispatch(text,bigint,jsonb) TO service_role;

CREATE FUNCTION api.thesaurus_public_edition(p_action text, p_release_id bigint, p_params jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $$
  SELECT thesaurus.public_edition_dispatch(p_action,p_release_id,p_params)
$$;
REVOKE ALL ON FUNCTION api.thesaurus_public_edition(text,bigint,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.thesaurus_public_edition(text,bigint,jsonb) TO service_role;

-- The partner list, partner-selection list and detail RPCs already call this
-- helper within the same statement snapshot. The admin generation stays technical.
CREATE OR REPLACE FUNCTION api.thesaurus_object_release()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT CASE WHEN l.singleton IS NULL THEN i.current_release_id
    WHEN i.current_release_id IS NULL THEN NULL
    WHEN l.first_release_id IS NULL THEN 1
    ELSE (
      SELECT count(*) FROM thesaurus.release r
      WHERE r.release_id BETWEEN l.first_release_id AND i.current_release_id
    )
  END
  FROM thesaurus.instance i
  LEFT JOIN thesaurus.public_launch l ON l.singleton
  WHERE i.singleton
$$;

COMMIT;
