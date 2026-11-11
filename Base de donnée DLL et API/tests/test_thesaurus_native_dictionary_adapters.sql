-- Disposable fresh-apply regression for nine explicitly selected dictionaries.
-- This test performs no native writes, governance activation, or publication.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
DO $native_dictionary_adapter_contract$
DECLARE expected CONSTANT text[]:=ARRAY[
  'iti_assoc_role','object_relation_type','capacity_metric','legal_type',
  'review_source','sustainability_group','actor_role','contact_role','org_role'];
  private_expected CONSTANT text[]:=ARRAY['actor_role','contact_role','org_role'];
  locale CONSTANT text[]:=ARRAY['fr','en','es','de'];
  source_tables CONSTANT oid[]:=ARRAY[
    'public.ref_iti_assoc_role'::regclass,'public.ref_object_relation_type'::regclass,
    'public.ref_capacity_metric'::regclass,'public.ref_legal_type'::regclass,
    'public.ref_review_source'::regclass,'public.ref_sustainability_action_group'::regclass,
    'public.ref_actor_role'::regclass,'public.ref_contact_role'::regclass,
    'public.ref_org_role'::regclass];
  native_rows bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.ref_iti_assoc_role)
    +(SELECT count(*) FROM public.ref_object_relation_type)
    +(SELECT count(*) FROM public.ref_capacity_metric)
    +(SELECT count(*) FROM public.ref_legal_type)
    +(SELECT count(*) FROM public.ref_review_source)
    +(SELECT count(*) FROM public.ref_sustainability_action_group)
    +(SELECT count(*) FROM public.ref_actor_role)
    +(SELECT count(*) FROM public.ref_contact_role)
    +(SELECT count(*) FROM public.ref_org_role) INTO native_rows;
  ASSERT (SELECT count(*)=87 FROM thesaurus.vocabulary),
    'Nine reviewed domains must extend the 78 existing vocabulary rows';
  ASSERT (SELECT count(*)=78 FROM thesaurus.vocabulary WHERE domain<>ALL(expected)),
    'All pre-existing vocabulary rows must remain present';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary v WHERE v.domain=ANY(expected)
    AND (v.is_public IS DISTINCT FROM (v.domain<>ALL(private_expected)) OR v.is_governed
      OR v.legacy_public OR NOT v.require_definition OR v.required_languages<>locale
      OR jsonb_typeof(v.name_i18n)<>'object' OR v.name<>v.name_i18n->>'fr'
      OR EXISTS(SELECT 1 FROM unnest(locale) l WHERE NOT thesaurus.has_editorial_text(v.name_i18n->l))))
    AND (SELECT count(*)=cardinality(expected) FROM thesaurus.vocabulary WHERE domain=ANY(expected)),
    'New domains must use the reviewed exposure, ungoverned/nonlegacy policy and complete localized names';
  ASSERT (SELECT count(*)=9 FROM (VALUES
    ('iti_assoc_role','ref_iti_assoc_role'),('object_relation_type','ref_object_relation_type'),
    ('capacity_metric','ref_capacity_metric'),('legal_type','ref_legal_type'),('review_source','ref_review_source'),
    ('sustainability_group','ref_sustainability_action_group'),('actor_role','ref_actor_role'),
    ('contact_role','ref_contact_role'),('org_role','ref_org_role')) mapping(domain,catalog_key)
    JOIN thesaurus.vocabulary v ON v.domain=mapping.domain
    JOIN public.ref_catalog_registry r ON r.catalog_key=mapping.catalog_key AND r.label=v.name),
    'All nine native catalog cards must match their reviewed canonical French names';
  ASSERT (SELECT name='Capacité'
    AND name_i18n='{"fr":"Capacité","en":"Capacity","es":"Capacidad","de":"Kapazität"}'::jsonb
    FROM thesaurus.vocabulary WHERE domain='capacity_metric'),
    'The capacity vocabulary must use the short names in all four languages';
  ASSERT (SELECT count(*)=native_rows FROM thesaurus.source_rows WHERE domain=ANY(expected)),
    'Native adapters must expose each source row exactly once';
  ASSERT (SELECT count(DISTINCT (source_kind,source_id,domain))=native_rows
    FROM thesaurus.source_rows WHERE domain=ANY(expected)),
    'Native identity must be unique for every typed source tuple';
  ASSERT (SELECT count(*)=9 FROM unnest(expected) d
    WHERE EXISTS(SELECT 1 FROM thesaurus.source_rows s WHERE s.domain=d)),
    'Every selected domain must have one source_rows adapter';
  ASSERT (SELECT count(*)=9 FROM thesaurus.preparation_sources() s WHERE s.table_oid=ANY(source_tables)),
    'All nine sources must participate in prepared source gates';
  ASSERT (SELECT count(*)=9 FROM pg_class c WHERE c.oid=ANY(source_tables) AND c.relrowsecurity
    AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='thesaurus_publisher'
      AND p.polcmd='*' AND p.polroles @> ARRAY['bertel_thesaurus_publisher'::regrole::oid])),
    'Each source must retain RLS and a publisher-specific policy';
  ASSERT (SELECT count(*)=9 FROM pg_trigger t WHERE t.tgrelid=ANY(source_tables)
    AND t.tgname='zz_thesaurus_source_guard' AND NOT t.tgisinternal),
    'Every native source must use the existing guarded writer';
  ASSERT (SELECT count(*)=9 FROM pg_trigger t WHERE t.tgrelid=ANY(source_tables)
    AND t.tgname='thesaurus_source_gate' AND NOT t.tgisinternal),
    'Every native source must be blocked by the preparation source gate';
  ASSERT (SELECT count(*)=9 FROM pg_trigger t WHERE t.tgrelid=ANY(source_tables)
    AND t.tgname='thesaurus_prepared_truncate' AND NOT t.tgisinternal),
    'Every native source must have the prepared TRUNCATE guard';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.source_link sl WHERE num_nonnulls(
    sl.ref_code_id,sl.amenity_id,sl.classification_scheme_id,sl.classification_value_id,
    sl.language_id,sl.commune_code,sl.sustainability_action_id,sl.sustainability_category_id,
    sl.iti_assoc_role_id,sl.object_relation_type_id,sl.capacity_metric_id,sl.legal_type_id,
    sl.review_source_id,sl.sustainability_group_id,sl.actor_role_id,sl.contact_role_id,sl.org_role_id)<>1),
    'Source links must retain exactly one of the seventeen typed identities';
  ASSERT (SELECT count(*)=0 FROM thesaurus.concept WHERE domain=ANY(expected)),
    'Installing adapters must not bootstrap canonical concepts';
  ASSERT (SELECT count(*)=0 FROM thesaurus.release),
    'Installing adapters must not publish a release';
END
$native_dictionary_adapter_contract$;
ROLLBACK;
