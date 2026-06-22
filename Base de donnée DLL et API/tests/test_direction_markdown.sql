DO $$
DECLARE
  v_obj  text;
  -- Line-anchored heading + emphasis: strip_markdown is line-anchored, so a heading marker
  -- is only stripped at the start of a line (a mid-line '##' is literal text, left intact).
  v_md   constant text := E'## Plan\nPrenez la **D3** puis suivez les *panneaux*';
  v_res  jsonb;
BEGIN
  SELECT id INTO v_obj FROM object WHERE object_type <> 'ORG' ORDER BY created_at LIMIT 1;
  UPDATE object_location SET direction = v_md WHERE object_id = v_obj AND is_main_location IS TRUE;

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], NULL);

  ASSERT (v_res -> 'address' ->> 'direction') = api.strip_markdown(v_md),
    format('flat direction not stripped: %s', v_res -> 'address' ->> 'direction');
  ASSERT (v_res -> 'address' ->> 'direction') !~ '[*#]', 'flat direction still has markers';
  ASSERT (v_res -> 'address' ->> 'direction_md') = v_md,
    format('direction_md not raw: %s', v_res -> 'address' ->> 'direction_md');
  ASSERT NOT ((v_res -> 'address') ? 'direction_i18n'), 'direction_i18n must not exist (plain text)';

  RAISE EXCEPTION 'ROLLBACK_TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_TEST' THEN RAISE; END IF;
END $$;
