-- Disposable fresh-apply regression: all domain names are business vocabulary.
-- The outer rollback also contains the two real, transaction-free patch inclusions.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '60s';

-- Reproduce the historical absence of editorial cards for category catalogues.
-- They remain discoverable through the structural view before this correction.
DELETE FROM public.ref_catalog_registry WHERE catalog_key ~ '^ref_code:taxonomy_';

CREATE TEMP TABLE _domain_names_vocabulary_before ON COMMIT DROP AS
SELECT domain, to_jsonb(v) - 'name' - 'updated_at' AS preserved
FROM thesaurus.vocabulary v;
CREATE TEMP TABLE _domain_names_registry_before ON COMMIT DROP AS
SELECT domain, to_jsonb(r) - 'name' - 'name_i18n' - 'updated_at' AS preserved,
  COALESCE(name_i18n, '{}'::jsonb) - 'fr' - 'en' AS other_languages
FROM public.ref_code_domain_registry r;
CREATE TEMP TABLE _domain_names_catalog_before ON COMMIT DROP AS
SELECT catalog_key, to_jsonb(r) - 'label' - 'updated_at' AS preserved
FROM public.ref_catalog_registry r;
CREATE TEMP TABLE _domain_names_access_before ON COMMIT DROP AS
SELECT catalog_key, internal.ref_catalog_access(catalog_key) AS access,
  internal.ref_catalog_readonly_reason(catalog_key) AS readonly_reason
FROM internal.v_ref_catalog;
CREATE TEMP TABLE _domain_names_protected_before(
  table_name text PRIMARY KEY, checksum text NOT NULL
) ON COMMIT DROP;

DO $capture_protected$
DECLARE target text; fingerprint text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'thesaurus.concept', 'thesaurus.source_link', 'thesaurus.revision',
    'thesaurus.release', 'thesaurus.release_concept', 'thesaurus.release_change',
    'thesaurus.localized_field', 'thesaurus.label', 'thesaurus.note',
    'thesaurus.relation', 'thesaurus.mapping',
    'public.ref_code', 'public.ref_amenity', 'public.ref_classification_scheme',
    'public.ref_classification_value', 'public.ref_language', 'public.ref_commune',
    'public.ref_sustainability_action', 'public.ref_sustainability_action_category'
  ] LOOP
    EXECUTE format(
      'SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, ''[]'')) FROM %s t',
      target::regclass
    ) INTO fingerprint;
    INSERT INTO _domain_names_protected_before VALUES(target, fingerprint);
  END LOOP;
END
$capture_protected$;

-- Reproduce both defects: raw codes as names, and stale translated names even
-- when a registry's main French name has already been improved.
UPDATE thesaurus.vocabulary SET name = domain;
UPDATE public.ref_code_domain_registry
SET name = 'Taxonomie ' || upper(replace(domain, 'taxonomy_', '')),
    name_i18n = COALESCE(name_i18n, '{}'::jsonb)
      || jsonb_build_object('fr', 'Taxonomie ' || upper(replace(domain, 'taxonomy_', '')))
      || CASE WHEN domain IN ('taxonomy_act', 'taxonomy_com', 'taxonomy_hot')
           THEN jsonb_build_object('en', upper(replace(domain, 'taxonomy_', '')) || ' taxonomy')
           ELSE '{}'::jsonb END;
UPDATE public.ref_catalog_registry
SET label = 'ref_code:' || catalog_key
WHERE catalog_key LIKE 'ref_code:%'
   OR catalog_key IN ('ref_amenity', 'ref_classification_scheme',
     'ref_classification_value', 'ref_language', 'ref_commune',
     'ref_sustainability_action', 'ref_sustainability_action_category');

\ir ../thesaurus_simple_business_names.sql

DO $business_names$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM thesaurus.vocabulary),
    'The regression must exercise a populated vocabulary';
  ASSERT NOT EXISTS (
    SELECT 1 FROM thesaurus.vocabulary
    WHERE name = domain OR name ~* 'taxonom' OR name ~ '^[a-z0-9]+_[a-z0-9_]+$' OR name ~ '[—–]'
  ), 'A raw domain identifier or technical taxonomy name is still displayed';

  -- Context regressions: these are not literal translations of column names.
  ASSERT NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('taxonomy_com', 'Commerces'),
      ('taxonomy_asc', 'Activités sportives et culturelles'),
      ('taxonomy_hot', 'Hôtellerie'),
      ('taxonomy_hlo', 'Hébergements locatifs et collectifs'),
      ('taxonomy_spu', 'Services publics'),
      ('taxonomy_vil', 'Villes et villages'),
      ('taxonomy_camp', 'Campings'),
      ('menu_category', 'Catégories de menu'),
      ('package_type', 'Types de forfait'),
      ('classification_scheme', 'Labels et classements'),
      ('classification_value', 'Valeurs des labels et classements'),
      ('price_kind', 'Publics tarifaires'),
      ('contact_kind', 'Moyens de contact'),
      ('mood', 'Ambiances touristiques'),
      ('media_tag', 'Mots-clés des médias'),
      ('accommodation_type', 'Types d’hébergement historiques'),
      ('season_type', 'Saisons et périodes')
    ) expected(domain, label)
    LEFT JOIN thesaurus.vocabulary v USING(domain)
    WHERE v.name IS DISTINCT FROM expected.label
  ), 'A reviewed business meaning regressed';

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.ref_code_domain_registry r JOIN thesaurus.vocabulary v USING(domain)
    WHERE r.name IS DISTINCT FROM v.name
       OR r.name_i18n->>'fr' IS DISTINCT FROM v.name
       OR EXISTS (SELECT 1 FROM jsonb_each_text(r.name_i18n) n WHERE n.value ~* 'taxonom')
  ), 'Main and translated domain names must agree without technical terminology';
  ASSERT NOT EXISTS (
    SELECT 1 FROM thesaurus.vocabulary v
    JOIN public.ref_catalog_registry r ON r.catalog_key =
      CASE v.source_kind
        WHEN 'ref_code' THEN 'ref_code:' || v.domain
        WHEN 'amenity' THEN 'ref_amenity'
        WHEN 'classification_scheme' THEN 'ref_classification_scheme'
        WHEN 'classification_value' THEN 'ref_classification_value'
        WHEN 'language' THEN 'ref_language'
        WHEN 'commune' THEN 'ref_commune'
        WHEN 'sustainability_action' THEN 'ref_sustainability_action'
        WHEN 'sustainability_category' THEN 'ref_sustainability_action_category'
      END
    WHERE r.label IS DISTINCT FROM v.name
  ), 'Vocabulary rules and catalogue cards must use the same reviewed business name';

  ASSERT NOT EXISTS (
    SELECT 1 FROM _domain_names_vocabulary_before b
    FULL JOIN thesaurus.vocabulary v USING(domain)
    WHERE b.domain IS NULL OR v.domain IS NULL
       OR b.preserved IS DISTINCT FROM to_jsonb(v) - 'name' - 'updated_at'
  ), 'Naming must preserve domain identifiers, public/governance flags and language/definition policy';
  ASSERT NOT EXISTS (
    SELECT 1 FROM _domain_names_registry_before b
    FULL JOIN public.ref_code_domain_registry r USING(domain)
    WHERE b.domain IS NULL OR r.domain IS NULL
       OR b.preserved IS DISTINCT FROM to_jsonb(r) - 'name' - 'name_i18n' - 'updated_at'
       OR b.other_languages IS DISTINCT FROM COALESCE(r.name_i18n, '{}'::jsonb) - 'fr' - 'en'
  ), 'Naming must preserve object types, active flags, hierarchy and other translations';
  ASSERT NOT EXISTS (
    SELECT 1 FROM _domain_names_catalog_before b
    LEFT JOIN public.ref_catalog_registry r USING(catalog_key)
    WHERE r.catalog_key IS NULL
       OR b.preserved IS DISTINCT FROM to_jsonb(r) - 'label' - 'updated_at'
  ), 'Naming must not change existing catalogue access, family or usage metadata';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.ref_catalog_registry r
    LEFT JOIN _domain_names_catalog_before b USING(catalog_key)
    LEFT JOIN thesaurus.vocabulary v ON r.catalog_key = 'ref_code:' || v.domain
    WHERE b.catalog_key IS NULL AND (
      v.domain IS NULL OR v.domain !~ '^taxonomy_' OR r.family <> 'À classer'
      OR r.label IS DISTINCT FROM v.name
    )
  ), 'New metadata rows must only name existing category catalogues in their original family';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.ref_code_domain_registry d
    JOIN thesaurus.vocabulary v USING(domain)
    LEFT JOIN public.ref_catalog_registry r ON r.catalog_key = 'ref_code:' || v.domain
    WHERE d.is_taxonomy AND (
      r.catalog_key IS NULL OR r.label IS DISTINCT FROM v.name
    )
  ), 'Every existing category catalogue needs a real business name at the database API boundary';
  ASSERT NOT EXISTS (
    SELECT 1 FROM _domain_names_access_before b
    FULL JOIN (
      SELECT catalog_key, internal.ref_catalog_access(catalog_key) AS access,
        internal.ref_catalog_readonly_reason(catalog_key) AS readonly_reason
      FROM internal.v_ref_catalog
    ) current_access USING(catalog_key)
    WHERE b.catalog_key IS NULL OR current_access.catalog_key IS NULL
       OR b.access IS DISTINCT FROM current_access.access
       OR b.readonly_reason IS DISTINCT FROM current_access.readonly_reason
  ), 'Adding editorial names must preserve effective access and structural read-only reasons for every catalogue';
END
$business_names$;

-- A second application must perform zero updates, not merely leave equal values.
-- ctid detects an unnecessary write even within this transaction where now() is fixed.
CREATE TEMP TABLE _domain_names_first_apply ON COMMIT DROP AS
SELECT 'vocabulary'::text AS kind, domain AS key, ctid::text AS row_location FROM thesaurus.vocabulary
UNION ALL
SELECT 'registry', domain, ctid::text FROM public.ref_code_domain_registry
UNION ALL
SELECT 'catalog', catalog_key, ctid::text FROM public.ref_catalog_registry;

\ir ../thesaurus_simple_business_names.sql

DO $unchanged_after_retry$
DECLARE prior record; fingerprint text;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM _domain_names_first_apply expected
    FULL JOIN (
      SELECT 'vocabulary'::text AS kind, domain AS key, ctid::text AS row_location FROM thesaurus.vocabulary
      UNION ALL SELECT 'registry', domain, ctid::text FROM public.ref_code_domain_registry
      UNION ALL SELECT 'catalog', catalog_key, ctid::text FROM public.ref_catalog_registry
    ) actual USING(kind, key)
    WHERE expected.kind IS NULL OR actual.kind IS NULL
       OR expected.row_location IS DISTINCT FROM actual.row_location
  ), 'Applying the same patch twice must write no metadata row on the second call';

  FOR prior IN SELECT * FROM _domain_names_protected_before LOOP
    EXECUTE format(
      'SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, ''[]'')) FROM %s t',
      prior.table_name::regclass
    ) INTO fingerprint;
    ASSERT fingerprint = prior.checksum,
      format('Domain naming unexpectedly changed protected source/editorial/publication data in %s', prior.table_name);
  END LOOP;
  RAISE NOTICE 'Business domain names: full present vocabulary, context, effective access, immutable publications and zero-write retry passed';
END
$unchanged_after_retry$;
ROLLBACK;
