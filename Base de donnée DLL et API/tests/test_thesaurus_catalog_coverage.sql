-- CI-only live-discovery invariant; all fixture DDL rolls back.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _catalog_coverage_fixture_guard(id integer) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.assert_thesaurus_catalog_coverage()
RETURNS void LANGUAGE plpgsql AS $coverage$
DECLARE expected CONSTANT text[] := ARRAY[
    'ref_actor_role',
    'ref_amenity',
    'ref_capacity_applicability',
    'ref_capacity_metric',
    'ref_catalog_registry',
    'ref_classification_equivalent_action',
    'ref_classification_equivalent_group',
    'ref_classification_scheme',
    'ref_classification_scheme_applicability',
    'ref_classification_value',
    'ref_code:accommodation_family',
    'ref_code:accommodation_type',
    'ref_code:accommodation_unit_type',
    'ref_code:activity_type',
    'ref_code:allergen',
    'ref_code:amenity_family',
    'ref_code:assistance_type',
    'ref_code:bed_type',
    'ref_code:booking_status',
    'ref_code:client_type',
    'ref_code:contact_kind',
    'ref_code:crm_sentiment',
    'ref_code:cuisine_type',
    'ref_code:demand_topic',
    'ref_code:destination_type',
    'ref_code:dietary_tag',
    'ref_code:distribution_channel',
    'ref_code:document_type',
    'ref_code:environment_tag',
    'ref_code:event_type',
    'ref_code:feedback_type',
    'ref_code:insurance_type',
    'ref_code:iti_difficulty',
    'ref_code:iti_open_status',
    'ref_code:iti_practice',
    'ref_code:iti_stage_kind',
    'ref_code:language_level',
    'ref_code:media_tag',
    'ref_code:media_type',
    'ref_code:meeting_equipment',
    'ref_code:membership_campaign',
    'ref_code:membership_tier',
    'ref_code:menu_category',
    'ref_code:mood',
    'ref_code:opening_period_type',
    'ref_code:opening_schedule_type',
    'ref_code:package_type',
    'ref_code:partnership_type',
    'ref_code:payment_method',
    'ref_code:price_kind',
    'ref_code:price_type',
    'ref_code:price_unit',
    'ref_code:promotion_type',
    'ref_code:room_type',
    'ref_code:season_type',
    'ref_code:service_type',
    'ref_code:social_network',
    'ref_code:taxonomy_act',
    'ref_code:taxonomy_asc',
    'ref_code:taxonomy_camp',
    'ref_code:taxonomy_com',
    'ref_code:taxonomy_fma',
    'ref_code:taxonomy_hlo',
    'ref_code:taxonomy_hot',
    'ref_code:taxonomy_hpa',
    'ref_code:taxonomy_iti',
    'ref_code:taxonomy_loi',
    'ref_code:taxonomy_org',
    'ref_code:taxonomy_pcu',
    'ref_code:taxonomy_pna',
    'ref_code:taxonomy_prd',
    'ref_code:taxonomy_psv',
    'ref_code:taxonomy_res',
    'ref_code:taxonomy_rva',
    'ref_code:taxonomy_spu',
    'ref_code:taxonomy_vil',
    'ref_code:tourism_type',
    'ref_code:trail_link_role',
    'ref_code:transport_type',
    'ref_code:view_type',
    'ref_code:weekday',
    'ref_code_domain_registry',
    'ref_code_taxonomy_closure',
    'ref_commune',
    'ref_contact_role',
    'ref_document',
    'ref_facet_applicability',
    'ref_facet_registry',
    'ref_interop_crosswalk',
    'ref_iti_assoc_role',
    'ref_language',
    'ref_legal_type',
    'ref_object_relation_type',
    'ref_org_admin_role',
    'ref_org_business_role',
    'ref_org_role',
    'ref_permission',
    'ref_review_source',
    'ref_sustainability_action',
    'ref_sustainability_action_category',
    'ref_sustainability_action_group',
    'ref_tag',
    'ref_trail_manager',
    'ref_trail_source'
  ];
BEGIN
  IF EXISTS(SELECT 1 FROM internal.v_ref_catalog actual WHERE actual.catalog_key<>ALL(expected)) THEN
    RAISE EXCEPTION 'An automatically discovered reference catalog lacks deliberate thesaurus classification' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(expected) expected_key WHERE NOT EXISTS(
    SELECT 1 FROM internal.v_ref_catalog actual WHERE actual.catalog_key=expected_key)) THEN
    RAISE EXCEPTION 'A classified reference catalog is absent from the fresh schema' USING ERRCODE='PT409';
  END IF;
END $coverage$;
SELECT pg_temp.assert_thesaurus_catalog_coverage();
-- A new ref_* table must be discovered and refused until it is classified.
CREATE TABLE public.ref_unclassified_catalog_probe(id uuid PRIMARY KEY,code text,name text);
DO $negative$
BEGIN
  ASSERT EXISTS(SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key='ref_unclassified_catalog_probe'),
    'Negative control must be a real discovered reference catalog';
  BEGIN
    PERFORM pg_temp.assert_thesaurus_catalog_coverage();
    RAISE EXCEPTION 'Coverage invariant accepted an unclassified live catalog';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    ASSERT SQLERRM='An automatically discovered reference catalog lacks deliberate thesaurus classification';
  END;
END $negative$;
ROLLBACK;
