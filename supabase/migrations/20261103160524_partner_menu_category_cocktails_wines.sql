-- Add two values to the existing menu_category reference domain only.
-- Existing categories (including drinks/Boissons), IDs, labels and ordering stay untouched.
-- The observed catalogue has NULL position/parent_id; retain that convention.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';

DO $menu_category_beverages$
DECLARE expected record; actual public.ref_code%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_inherits
    WHERE inhparent='public.ref_code'::regclass AND inhrelid='public.ref_code_menu_category'::regclass) THEN
    RAISE EXCEPTION 'menu_category must remain a partition of public.ref_code' USING ERRCODE='55000';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('cocktails','Cocktails','Cocktails à la carte',
      '{"en":"Cocktails","es":"Cócteles"}'::jsonb,
      '{"en":"Cocktails on the menu","es":"Cócteles de la carta"}'::jsonb),
    ('wines','Vins','Vins à la carte',
      '{"en":"Wines","es":"Vinos"}'::jsonb,
      '{"en":"Wines on the menu","es":"Vinos de la carta"}'::jsonb)
  ) values_to_add(code,name,description,name_i18n,description_i18n) LOOP
    -- The real unique key is (domain,code). UUIDs come from the existing default.
    INSERT INTO public.ref_code(domain,code,name,description,position,parent_id,is_active,is_assignable,name_i18n,description_i18n)
      VALUES('menu_category',expected.code,expected.name,expected.description,NULL,NULL,true,true,expected.name_i18n,expected.description_i18n)
      ON CONFLICT(domain,code) DO NOTHING;
    SELECT * INTO STRICT actual FROM public.ref_code_menu_category WHERE code=expected.code;
    -- Never repair or rename an existing row silently, including on reapplication.
    IF actual.name IS DISTINCT FROM expected.name OR actual.description IS DISTINCT FROM expected.description
      OR actual.position IS NOT NULL OR actual.parent_id IS NOT NULL
      OR actual.is_active IS DISTINCT FROM true OR actual.is_assignable IS DISTINCT FROM true
      OR actual.valid_from IS NOT NULL OR actual.valid_to IS NOT NULL
      OR (actual.name_i18n @> expected.name_i18n) IS NOT TRUE
      OR (actual.description_i18n @> expected.description_i18n) IS NOT TRUE THEN
      RAISE EXCEPTION 'Incompatible existing menu_category reference: %',expected.code USING ERRCODE='23514';
    END IF;
  END LOOP;
END;
$menu_category_beverages$;

COMMIT;
