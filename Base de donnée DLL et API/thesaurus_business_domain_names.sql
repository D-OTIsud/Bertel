-- Business names for all 78 vocabulary domains, reviewed against their real use.
-- Keep identifiers, editorial policy, access and immutable publications unchanged.
-- The JSON mirrors bertel-tourism-ui/src/lib/thesaurus-domain-labels.fr.json.
-- One atomic DO statement: also safe to include inside a disposable test transaction.
DO $business_domain_names$
DECLARE
  names CONSTANT jsonb := $reviewed_names$
{
  "accommodation_family": "Familles d’hébergement",
  "accommodation_type": "Types d’hébergement historiques",
  "accommodation_unit_type": "Types d’unité d’hébergement",
  "activity_type": "Types d’activité",
  "allergen": "Allergènes",
  "amenity": "Équipements et services",
  "amenity_family": "Familles d’équipements et de services",
  "assistance_type": "Types d’assistance",
  "bed_type": "Types de lit",
  "booking_status": "Statuts de réservation",
  "classification_scheme": "Labels et classements",
  "classification_value": "Niveaux et mentions des labels et classements",
  "client_type": "Types de clientèle",
  "commune": "Communes",
  "contact_kind": "Moyens de contact",
  "crm_sentiment": "Sentiment relationnel",
  "cuisine_type": "Types de cuisine",
  "demand_topic": "Sujets de demande",
  "destination_type": "Types de destination",
  "dietary_tag": "Régimes alimentaires",
  "distribution_channel": "Canaux de distribution",
  "document_type": "Types de document",
  "environment_tag": "Cadre et environnement",
  "event_type": "Types d’événement",
  "feedback_type": "Types de retour",
  "insurance_type": "Types d’assurance",
  "iti_difficulty": "Niveaux de difficulté des itinéraires",
  "iti_open_status": "Statuts d’ouverture de sentier",
  "iti_practice": "Pratiques d’itinéraire",
  "iti_stage_kind": "Types d’étape d’itinéraire",
  "language": "Langues",
  "language_level": "Niveaux de maîtrise des langues",
  "media_tag": "Mots-clés des médias",
  "media_type": "Types de médias",
  "meeting_equipment": "Équipements de réunion",
  "membership_campaign": "Campagnes d’adhésion",
  "membership_tier": "Paliers d’adhésion",
  "menu_category": "Catégories de menu",
  "mood": "Ambiances touristiques",
  "opening_period_type": "Types de période d’ouverture",
  "opening_schedule_type": "Types d’horaire",
  "package_type": "Types de forfait",
  "partnership_type": "Types de partenariat",
  "payment_method": "Moyens de paiement",
  "price_kind": "Publics tarifaires",
  "price_type": "Types de tarif",
  "price_unit": "Unités tarifaires",
  "promotion_type": "Types de promotion",
  "room_type": "Types de chambre",
  "season_type": "Saisons et périodes",
  "service_type": "Types de service",
  "social_network": "Réseaux sociaux",
  "sustainability_action": "Actions de durabilité",
  "sustainability_category": "Catégories d’actions de durabilité",
  "taxonomy_act": "Activités encadrées",
  "taxonomy_asc": "Structures d’activités sportives et culturelles",
  "taxonomy_camp": "Campings",
  "taxonomy_com": "Commerces",
  "taxonomy_fma": "Fêtes et manifestations",
  "taxonomy_hlo": "Locations et hébergements collectifs",
  "taxonomy_hot": "Hôtels",
  "taxonomy_hpa": "Hébergements de plein air",
  "taxonomy_iti": "Itinéraires",
  "taxonomy_loi": "Loisirs, visites et découvertes",
  "taxonomy_org": "Organisations",
  "taxonomy_pcu": "Patrimoine culturel",
  "taxonomy_pna": "Sites naturels",
  "taxonomy_prd": "Producteurs et savoir-faire",
  "taxonomy_psv": "Prestataires de services",
  "taxonomy_res": "Restauration",
  "taxonomy_rva": "Résidences et villages de vacances",
  "taxonomy_spu": "Services et équipements publics",
  "taxonomy_vil": "Villes et villages",
  "tourism_type": "Types de tourisme",
  "trail_link_role": "Rôles de liaison de sentier",
  "transport_type": "Types de transport",
  "view_type": "Types de vue",
  "weekday": "Jours de la semaine"
}
$reviewed_names$::jsonb;
  existing_english CONSTANT jsonb := '{"taxonomy_act":"Guided activities","taxonomy_com":"Shops","taxonomy_hot":"Hotels"}'::jsonb;
  unknown_domains text;
  vocabulary_updates integer;
  registry_updates integer;
  catalog_updates integer;
  catalog_additions integer;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Respect the existing preparation fence; never disable a guard or assume a role.
  PERFORM thesaurus.take_source_gate();

  SELECT string_agg(v.domain, ', ' ORDER BY v.domain) INTO unknown_domains
  FROM thesaurus.vocabulary v
  LEFT JOIN jsonb_each_text(names) n ON n.key = v.domain
  WHERE n.key IS NULL;
  IF unknown_domains IS NOT NULL THEN
    RAISE EXCEPTION 'Review business names for every vocabulary before applying: %', unknown_domains;
  END IF;

  UPDATE thesaurus.vocabulary v
  SET name = n.value, updated_at = now()
  FROM jsonb_each_text(names) n
  WHERE v.domain = n.key AND v.name IS DISTINCT FROM n.value;
  GET DIAGNOSTICS vocabulary_updates = ROW_COUNT;

  WITH expected_names AS (
    SELECT r.domain, n.value AS name,
      COALESCE(r.name_i18n, '{}'::jsonb) || jsonb_build_object('fr', n.value)
      || CASE WHEN r.name_i18n ? 'en' AND existing_english ? r.domain
           THEN jsonb_build_object('en', existing_english->>r.domain)
           ELSE '{}'::jsonb END AS name_i18n
    FROM public.ref_code_domain_registry r
    JOIN jsonb_each_text(names) n ON n.key = r.domain
  )
  UPDATE public.ref_code_domain_registry r
  SET name = n.name, name_i18n = n.name_i18n, updated_at = now()
  FROM expected_names n
  WHERE r.domain = n.domain
    AND (r.name IS DISTINCT FROM n.name OR r.name_i18n IS DISTINCT FROM n.name_i18n);
  GET DIAGNOSTICS registry_updates = ROW_COUNT;

  -- Add editorial names for the 19 already-discovered category catalogues.
  -- Their effective family was already "À classer". Access stays derived from
  -- the structural guard before it considers registry.access; do not seed a
  -- parallel structural access rule or modify an existing row's other fields.
  INSERT INTO public.ref_catalog_registry(catalog_key, label, family)
  SELECT 'ref_code:' || v.domain, n.value, 'À classer'
  FROM thesaurus.vocabulary v
  JOIN jsonb_each_text(names) n ON n.key = v.domain
  JOIN public.ref_code_domain_registry r ON r.domain = v.domain
  WHERE r.is_taxonomy AND v.domain ~ '^taxonomy_'
  ON CONFLICT(catalog_key) DO NOTHING;
  GET DIAGNOSTICS catalog_additions = ROW_COUNT;

  -- Keep existing catalogue cards consistent without changing access or grouping.
  WITH expected_names AS (
    SELECT n.value AS label,
      CASE v.source_kind
        WHEN 'ref_code' THEN 'ref_code:' || v.domain
        WHEN 'amenity' THEN 'ref_amenity'
        WHEN 'classification_scheme' THEN 'ref_classification_scheme'
        WHEN 'classification_value' THEN 'ref_classification_value'
        WHEN 'language' THEN 'ref_language'
        WHEN 'commune' THEN 'ref_commune'
        WHEN 'sustainability_action' THEN 'ref_sustainability_action'
        WHEN 'sustainability_category' THEN 'ref_sustainability_action_category'
      END AS catalog_key
    FROM thesaurus.vocabulary v JOIN jsonb_each_text(names) n ON n.key = v.domain
  )
  UPDATE public.ref_catalog_registry r
  SET label = n.label, updated_at = now()
  FROM expected_names n
  WHERE r.catalog_key = n.catalog_key AND r.label IS DISTINCT FROM n.label;
  GET DIAGNOSTICS catalog_updates = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM thesaurus.vocabulary v JOIN jsonb_each_text(names) n ON n.key = v.domain
    WHERE v.name IS DISTINCT FROM n.value
  ) THEN
    RAISE EXCEPTION 'A vocabulary business name did not converge';
  END IF;
  RAISE NOTICE 'Business domain names: % vocabularies, % domain registry rows, % catalogue labels updated, % missing catalogue labels added',
    vocabulary_updates, registry_updates, catalog_updates, catalog_additions;
END
$business_domain_names$;

