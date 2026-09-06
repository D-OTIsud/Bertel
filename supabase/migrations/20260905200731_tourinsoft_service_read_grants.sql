-- The regional serializer is SECURITY INVOKER. Modern Supabase defaults no longer
-- supply these SELECT grants implicitly; EXECUTE alone cannot read its sources.
-- Idempotent and service-only: no additional access for anon/authenticated.
BEGIN;

GRANT SELECT ON TABLE
  public.contact_channel,
  public.object_act,
  public.object_description,
  public.object_meeting_room,
  public.object_menu,
  public.object_legal,
  public.ref_capacity_metric,
  public.ref_code_contact_kind,
  public.ref_code_cuisine_type,
  public.ref_code_media_type,
  public.ref_code_menu_category,
  public.ref_code_payment_method,
  public.ref_code_price_kind,
  public.ref_code_price_unit,
  public.ref_code_social_network,
  public.ref_code_weekday,
  public.ref_document,
  public.ref_language,
  public.ref_legal_type
TO service_role;

DO $$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'contact_channel', 'object_act', 'object_description', 'object_meeting_room',
    'object_menu', 'object_legal', 'ref_capacity_metric', 'ref_code_contact_kind',
    'ref_code_cuisine_type', 'ref_code_media_type', 'ref_code_menu_category',
    'ref_code_payment_method', 'ref_code_price_kind', 'ref_code_price_unit',
    'ref_code_social_network', 'ref_code_weekday', 'ref_document', 'ref_language',
    'ref_legal_type'
  ] LOOP
    ASSERT has_table_privilege('service_role', format('public.%I', relation_name), 'SELECT'),
      format('Missing service_role SELECT on public.%I', relation_name);
  END LOOP;
  ASSERT NOT (SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = 'api.tourinsoft_reunion_regional_documents(text[])'::regprocedure),
    'The regional serializer must remain SECURITY INVOKER';
  ASSERT NOT has_function_privilege('anon', 'api.tourinsoft_reunion_regional_documents(text[])', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'api.tourinsoft_reunion_regional_documents(text[])', 'EXECUTE');
END;
$$;

COMMIT;
