-- Frozen multilingual vocabulary metadata; no historical manifest or concept is rewritten.
-- Generated from tools/thesaurus-content/domain-labels.i18n.json.
DO $domain_metadata$
DECLARE
  names CONSTANT jsonb := $reviewed_names$
{
  "accommodation_family": {
    "fr": "Familles d’hébergement",
    "en": "Accommodation families",
    "es": "Familias de alojamiento",
    "de": "Beherbergungsfamilien"
  },
  "accommodation_type": {
    "fr": "Types d’hébergement historiques",
    "en": "Historical accommodation types",
    "es": "Tipos históricos de alojamiento",
    "de": "Historische Beherbergungsarten"
  },
  "accommodation_unit_type": {
    "fr": "Types d’unité d’hébergement",
    "en": "Accommodation unit types",
    "es": "Tipos de unidades de alojamiento",
    "de": "Arten von Unterkunftseinheiten"
  },
  "activity_type": {
    "fr": "Types d’activité",
    "en": "Activity types",
    "es": "Tipos de actividad",
    "de": "Aktivitätsarten"
  },
  "allergen": {
    "fr": "Allergènes",
    "en": "Allergens",
    "es": "Alérgenos",
    "de": "Allergene"
  },
  "amenity": {
    "fr": "Équipements et services",
    "en": "Amenities and services",
    "es": "Equipamientos y servicios",
    "de": "Ausstattung und Dienstleistungen"
  },
  "amenity_family": {
    "fr": "Familles d’équipements et services",
    "en": "Amenity and service families",
    "es": "Familias de equipamientos y servicios",
    "de": "Ausstattungs- und Dienstleistungsgruppen"
  },
  "assistance_type": {
    "fr": "Types d’assistance",
    "en": "Assistance types",
    "es": "Tipos de asistencia",
    "de": "Arten der Unterstützung"
  },
  "bed_type": {
    "fr": "Types de lit",
    "en": "Bed types",
    "es": "Tipos de cama",
    "de": "Bettenarten"
  },
  "booking_status": {
    "fr": "Statuts de réservation",
    "en": "Booking statuses",
    "es": "Estados de reserva",
    "de": "Buchungsstatus"
  },
  "classification_scheme": {
    "fr": "Labels et classements",
    "en": "Labels and classifications",
    "es": "Sellos y clasificaciones",
    "de": "Siegel und Klassifizierungen"
  },
  "classification_value": {
    "fr": "Valeurs des labels et classements",
    "en": "Label and classification values",
    "es": "Valores de sellos y clasificaciones",
    "de": "Werte von Siegeln und Klassifizierungen"
  },
  "client_type": {
    "fr": "Types de clientèle",
    "en": "Client types",
    "es": "Tipos de clientela",
    "de": "Kundengruppen"
  },
  "commune": {
    "fr": "Communes",
    "en": "Municipalities",
    "es": "Municipios",
    "de": "Gemeinden"
  },
  "contact_kind": {
    "fr": "Moyens de contact",
    "en": "Contact methods",
    "es": "Medios de contacto",
    "de": "Kontaktwege"
  },
  "crm_sentiment": {
    "fr": "Sentiment relationnel",
    "en": "Relationship sentiment",
    "es": "Sentimiento de la relación",
    "de": "Beziehungsstimmung"
  },
  "cuisine_type": {
    "fr": "Types de cuisine",
    "en": "Cuisine types",
    "es": "Tipos de cocina",
    "de": "Küchenarten"
  },
  "demand_topic": {
    "fr": "Sujets de demande",
    "en": "Request topics",
    "es": "Temas de solicitud",
    "de": "Anliegen"
  },
  "destination_type": {
    "fr": "Types de destination",
    "en": "Destination types",
    "es": "Tipos de destino",
    "de": "Reiseziele"
  },
  "dietary_tag": {
    "fr": "Régimes alimentaires",
    "en": "Dietary tags",
    "es": "Etiquetas alimentarias",
    "de": "Ernährungsmerkmale"
  },
  "distribution_channel": {
    "fr": "Canaux de distribution",
    "en": "Distribution channels",
    "es": "Canales de distribución",
    "de": "Vertriebskanäle"
  },
  "document_type": {
    "fr": "Types de document",
    "en": "Document types",
    "es": "Tipos de documento",
    "de": "Dokumentarten"
  },
  "environment_tag": {
    "fr": "Cadre et environnement",
    "en": "Setting and environment",
    "es": "Entorno y ambiente",
    "de": "Umgebung und Atmosphäre"
  },
  "event_type": {
    "fr": "Types d’événement",
    "en": "Event types",
    "es": "Tipos de evento",
    "de": "Veranstaltungsarten"
  },
  "feedback_type": {
    "fr": "Types de retour",
    "en": "Feedback types",
    "es": "Tipos de comentarios",
    "de": "Arten von Rückmeldungen"
  },
  "insurance_type": {
    "fr": "Types d’assurance",
    "en": "Insurance types",
    "es": "Tipos de seguro",
    "de": "Versicherungsarten"
  },
  "iti_difficulty": {
    "fr": "Difficulté des itinéraires",
    "en": "Route difficulty",
    "es": "Dificultad de los itinerarios",
    "de": "Schwierigkeitsgrad der Routen"
  },
  "iti_open_status": {
    "fr": "Statut des sentiers",
    "en": "Trail status",
    "es": "Estado de los senderos",
    "de": "Wegestatus"
  },
  "iti_practice": {
    "fr": "Pratiques d’itinéraire",
    "en": "Route activities",
    "es": "Prácticas de itinerario",
    "de": "Routenaktivitäten"
  },
  "iti_stage_kind": {
    "fr": "Étapes d’itinéraire",
    "en": "Route stage types",
    "es": "Tipos de etapa de itinerario",
    "de": "Arten von Routenabschnitten"
  },
  "language": {
    "fr": "Langues",
    "en": "Languages",
    "es": "Idiomas",
    "de": "Sprachen"
  },
  "language_level": {
    "fr": "Maîtrise des langues",
    "en": "Language proficiency",
    "es": "Dominio de idiomas",
    "de": "Sprachkenntnisse"
  },
  "media_tag": {
    "fr": "Mots-clés des médias",
    "en": "Media keywords",
    "es": "Etiquetas de medios",
    "de": "Medienstichwörter"
  },
  "media_type": {
    "fr": "Types de médias",
    "en": "Media types",
    "es": "Tipos de medios",
    "de": "Medienarten"
  },
  "meeting_equipment": {
    "fr": "Équipements de réunion",
    "en": "Meeting equipment",
    "es": "Equipamiento para reuniones",
    "de": "Tagungsausstattung"
  },
  "membership_campaign": {
    "fr": "Campagnes d’adhésion",
    "en": "Membership campaigns",
    "es": "Campañas de afiliación",
    "de": "Mitgliedschaftskampagnen"
  },
  "membership_tier": {
    "fr": "Paliers d’adhésion",
    "en": "Membership levels",
    "es": "Niveles de afiliación",
    "de": "Mitgliedschaftsstufen"
  },
  "menu_category": {
    "fr": "Catégories de menu",
    "en": "Menu categories",
    "es": "Categorías de menú",
    "de": "Menükategorien"
  },
  "mood": {
    "fr": "Ambiances touristiques",
    "en": "Tourism atmospheres",
    "es": "Ambientes turísticos",
    "de": "Touristische Atmosphären"
  },
  "opening_period_type": {
    "fr": "Saisons d’ouverture",
    "en": "Opening seasons",
    "es": "Temporadas de apertura",
    "de": "Öffnungsperioden"
  },
  "opening_schedule_type": {
    "fr": "Types d’horaires",
    "en": "Opening schedule types",
    "es": "Tipos de horario",
    "de": "Öffnungszeitarten"
  },
  "package_type": {
    "fr": "Types de forfait",
    "en": "Package types",
    "es": "Tipos de paquete",
    "de": "Paketarten"
  },
  "partnership_type": {
    "fr": "Types de partenariat",
    "en": "Partnership types",
    "es": "Tipos de colaboración",
    "de": "Partnerschaftsarten"
  },
  "payment_method": {
    "fr": "Moyens de paiement",
    "en": "Payment methods",
    "es": "Métodos de pago",
    "de": "Zahlungsarten"
  },
  "price_kind": {
    "fr": "Publics tarifaires",
    "en": "Price audiences",
    "es": "Públicos tarifarios",
    "de": "Preiszielgruppen"
  },
  "price_type": {
    "fr": "Types de tarif",
    "en": "Price types",
    "es": "Tipos de tarifa",
    "de": "Tarifarten"
  },
  "price_unit": {
    "fr": "Unités tarifaires",
    "en": "Price units",
    "es": "Unidades tarifarias",
    "de": "Preiseinheiten"
  },
  "promotion_type": {
    "fr": "Types de promotion",
    "en": "Promotion types",
    "es": "Tipos de promoción",
    "de": "Aktionsarten"
  },
  "room_type": {
    "fr": "Types de chambre",
    "en": "Room types",
    "es": "Tipos de habitación",
    "de": "Zimmerarten"
  },
  "season_type": {
    "fr": "Saisons et périodes",
    "en": "Seasons and periods",
    "es": "Temporadas y periodos",
    "de": "Jahreszeiten und Zeiträume"
  },
  "service_type": {
    "fr": "Types de service",
    "en": "Service types",
    "es": "Tipos de servicio",
    "de": "Dienstleistungsarten"
  },
  "social_network": {
    "fr": "Réseaux sociaux",
    "en": "Social networks",
    "es": "Redes sociales",
    "de": "Soziale Netzwerke"
  },
  "sustainability_action": {
    "fr": "Actions de durabilité",
    "en": "Sustainability actions",
    "es": "Acciones de sostenibilidad",
    "de": "Nachhaltigkeitsmaßnahmen"
  },
  "sustainability_category": {
    "fr": "Catégories d’actions de durabilité",
    "en": "Sustainability action categories",
    "es": "Categorías de acciones de sostenibilidad",
    "de": "Kategorien von Nachhaltigkeitsmaßnahmen"
  },
  "taxonomy_act": {
    "fr": "Activités encadrées",
    "en": "Guided activities",
    "es": "Actividades dirigidas",
    "de": "Geführte Aktivitäten"
  },
  "taxonomy_asc": {
    "fr": "Activités sportives et culturelles",
    "en": "Sports and cultural activities",
    "es": "Actividades deportivas y culturales",
    "de": "Sport- und Kulturaktivitäten"
  },
  "taxonomy_camp": {
    "fr": "Campings",
    "en": "Campgrounds",
    "es": "Campings",
    "de": "Campingplätze"
  },
  "taxonomy_com": {
    "fr": "Commerces",
    "en": "Shops and businesses",
    "es": "Comercios",
    "de": "Geschäfte und Gewerbe"
  },
  "taxonomy_fma": {
    "fr": "Fêtes et manifestations",
    "en": "Festivals and events",
    "es": "Fiestas y eventos",
    "de": "Feste und Veranstaltungen"
  },
  "taxonomy_hlo": {
    "fr": "Hébergements locatifs et collectifs",
    "en": "Holiday rentals and group accommodation",
    "es": "Alojamientos turísticos y colectivos",
    "de": "Ferienunterkünfte und Gruppenunterkünfte"
  },
  "taxonomy_hot": {
    "fr": "Hôtellerie",
    "en": "Hotels",
    "es": "Hotellerie",
    "de": "Hotellerie"
  },
  "taxonomy_hpa": {
    "fr": "Hébergements de plein air",
    "en": "Outdoor accommodation",
    "es": "Alojamientos al aire libre",
    "de": "Unterkünfte im Freien"
  },
  "taxonomy_iti": {
    "fr": "Itinéraires",
    "en": "Routes",
    "es": "Itinerarios",
    "de": "Routen"
  },
  "taxonomy_loi": {
    "fr": "Loisirs et découvertes",
    "en": "Leisure and discovery",
    "es": "Ocio y descubrimientos",
    "de": "Freizeit und Entdeckungen"
  },
  "taxonomy_org": {
    "fr": "Organisations",
    "en": "Organizations",
    "es": "Organizaciones",
    "de": "Organisationen"
  },
  "taxonomy_pcu": {
    "fr": "Patrimoine culturel",
    "en": "Cultural heritage",
    "es": "Patrimonio cultural",
    "de": "Kulturerbe"
  },
  "taxonomy_pna": {
    "fr": "Sites naturels",
    "en": "Natural sites",
    "es": "Espacios naturales",
    "de": "Naturstätten"
  },
  "taxonomy_prd": {
    "fr": "Producteurs",
    "en": "Producers",
    "es": "Productores",
    "de": "Erzeuger"
  },
  "taxonomy_psv": {
    "fr": "Prestataires de services",
    "en": "Service providers",
    "es": "Prestadores de servicios",
    "de": "Dienstleister"
  },
  "taxonomy_res": {
    "fr": "Restauration",
    "en": "Food service",
    "es": "Restauración",
    "de": "Gastronomie"
  },
  "taxonomy_rva": {
    "fr": "Résidences et villages de vacances",
    "en": "Holiday residences and villages",
    "es": "Residencias y pueblos vacacionales",
    "de": "Ferienresidenzen und Feriendörfer"
  },
  "taxonomy_spu": {
    "fr": "Services publics",
    "en": "Public services",
    "es": "Servicios públicos",
    "de": "Öffentliche Dienste"
  },
  "taxonomy_vil": {
    "fr": "Villes et villages",
    "en": "Towns and villages",
    "es": "Ciudades y pueblos",
    "de": "Städte und Dörfer"
  },
  "tourism_type": {
    "fr": "Types de tourisme",
    "en": "Tourism types",
    "es": "Tipos de turismo",
    "de": "Tourismusarten"
  },
  "trail_link_role": {
    "fr": "Relations aux sentiers",
    "en": "Trail relationships",
    "es": "Relaciones con senderos",
    "de": "Wegverbindungen"
  },
  "transport_type": {
    "fr": "Types de transport",
    "en": "Transport types",
    "es": "Tipos de transporte",
    "de": "Verkehrsmittelarten"
  },
  "view_type": {
    "fr": "Types de vue",
    "en": "View types",
    "es": "Tipos de vistas",
    "de": "Aussichtsarten"
  },
  "weekday": {
    "fr": "Jours de la semaine",
    "en": "Days of the week",
    "es": "Días de la semana",
    "de": "Wochentage"
  }
}
$reviewed_names$::jsonb;
  original text; body text; prior_owner oid; prior_acl aclitem[]; prior_config text[];
  executor oid; executor_name text; had_executor_grant boolean;
  prior_admin boolean; prior_inherit boolean; prior_set boolean;
  memberships_before jsonb; memberships_after jsonb;
  prior_function jsonb;
  old_fields CONSTANT text := $old$'domain',v.domain,'name',v.name,'source_kind',v.source_kind$old$;
  new_fields CONSTANT text := $new$'domain',v.domain,'name',v.name,'name_i18n',v.name_i18n,'source_kind',v.source_kind$new$;
  old_update CONSTANT text := $old$  UPDATE thesaurus.release SET manifest=v_manifest,checksum=v_manifest->>'checksum' WHERE release_id=rid;$old$;
  new_update CONSTANT text := $new$  v_manifest:=v_manifest||jsonb_build_object('metadata_scope','release_snapshot','metadata_checksum',md5((v_manifest->'domains')::text));
  UPDATE thesaurus.release SET manifest=v_manifest,checksum=v_manifest->>'checksum' WHERE release_id=rid;$new$;
  old_meta CONSTANT text := $old$  meta:=jsonb_build_object('contract_version','1.0.0','release_id',rid,'previous_release_id',r.previous_release_id,'as_of',r.manifest->'as_of','checksum',r.checksum,'next_after',NULL);$old$;
  new_meta CONSTANT text := $new$  meta:=jsonb_build_object('contract_version','1.0.0','release_id',rid,'previous_release_id',r.previous_release_id,'as_of',r.manifest->'as_of','checksum',r.checksum,'next_after',NULL);
  IF r.manifest ? 'metadata_checksum' THEN
    meta:=meta||jsonb_build_object('metadata_checksum',r.manifest->'metadata_checksum');
  END IF;$new$;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Thesaurus metadata upgrade requires READ COMMITTED' USING ERRCODE='PT409';
  END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM thesaurus.take_source_gate();
  -- S2 -> X1 matches source configuration ordering. Wait for in-flight draft
  -- saves before checking; hold off new saves until their fingerprints are fresh.
  PERFORM pg_advisory_xact_lock(741126,1);
  -- Vocabulary metadata participates in optimistic draft fingerprints. Never
  -- bless or silently rebase an outstanding draft across this schema change.
  IF EXISTS(SELECT 1 FROM thesaurus.revision WHERE status<>'published') THEN
    RAISE EXCEPTION 'Publish or explicitly discard outstanding thesaurus drafts before metadata upgrade' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM thesaurus.vocabulary v WHERE NOT names ? v.domain)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(names) d WHERE NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary v WHERE v.domain=d)) THEN
    RAISE EXCEPTION 'Review multilingual names against the complete vocabulary set before applying';
  END IF;

  ALTER TABLE thesaurus.vocabulary ADD COLUMN IF NOT EXISTS name_i18n jsonb;
  UPDATE thesaurus.vocabulary v SET name=n.value->>'fr',name_i18n=n.value,updated_at=now()
  FROM jsonb_each(names) n WHERE v.domain=n.key
    AND (v.name IS DISTINCT FROM n.value->>'fr' OR v.name_i18n IS DISTINCT FROM n.value);
  ALTER TABLE thesaurus.vocabulary ALTER COLUMN name_i18n SET NOT NULL;
  -- New domains require explicit reviewed translations; do not fabricate them.
  ALTER TABLE thesaurus.vocabulary ALTER COLUMN name_i18n DROP DEFAULT;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='thesaurus.vocabulary'::regclass AND conname='thesaurus_vocabulary_name_languages') THEN
    ALTER TABLE thesaurus.vocabulary ADD CONSTRAINT thesaurus_vocabulary_name_languages CHECK (
      jsonb_typeof(name_i18n)='object' AND name=name_i18n->>'fr'
      AND thesaurus.has_editorial_text(name_i18n->'fr')
      AND thesaurus.has_editorial_text(name_i18n->'en')
      AND thesaurus.has_editorial_text(name_i18n->'es')
      AND thesaurus.has_editorial_text(name_i18n->'de'));
  END IF;
  UPDATE public.ref_code_domain_registry r
  SET name=n.value->>'fr',name_i18n=COALESCE(r.name_i18n,'{}'::jsonb)||n.value,updated_at=now()
  FROM jsonb_each(names)n WHERE r.domain=n.key AND (
    r.name IS DISTINCT FROM n.value->>'fr'
    OR r.name_i18n IS DISTINCT FROM COALESCE(r.name_i18n,'{}'::jsonb)||n.value);
  UPDATE public.ref_catalog_registry r SET label=v.name,updated_at=now()
  FROM thesaurus.vocabulary v WHERE r.catalog_key=CASE v.source_kind
    WHEN 'ref_code' THEN 'ref_code:'||v.domain WHEN 'amenity' THEN 'ref_amenity'
    WHEN 'classification_scheme' THEN 'ref_classification_scheme'
    WHEN 'classification_value' THEN 'ref_classification_value'
    WHEN 'language' THEN 'ref_language' WHEN 'commune' THEN 'ref_commune'
    WHEN 'sustainability_action' THEN 'ref_sustainability_action'
    WHEN 'sustainability_category' THEN 'ref_sustainability_action_category' END
    AND r.label IS DISTINCT FROM v.name;

  SELECT prosrc,proowner,proacl,proconfig INTO STRICT original,prior_owner,prior_acl,prior_config
  FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  -- Exact predecessor, or the exact same already-applied patch. No authority,
  -- source gates, publication rules, concept checksum or privileges may drift.
  IF strpos(body,new_fields)>0 THEN
    IF (length(body)-length(replace(body,new_fields,'')))/length(new_fields)<>1
      OR (length(body)-length(replace(body,new_update,'')))/length(new_update)<>1
      OR md5(replace(replace(body,new_fields,old_fields),new_update,old_update))<>'985839358c6e0d68eb7db280f42bb6ed' THEN
      RAISE EXCEPTION 'Multilingual publication metadata patch drift';
    END IF;
  ELSE
    IF md5(body)<>'985839358c6e0d68eb7db280f42bb6ed'
      OR (length(body)-length(replace(body,old_fields,'')))/length(old_fields)<>1
      OR (length(body)-length(replace(body,old_update,'')))/length(old_update)<>1 THEN
      RAISE EXCEPTION 'Reviewed publication kernel changed before metadata patch';
    END IF;
    body:=replace(replace(body,old_fields,new_fields),old_update,new_update);
    -- Hosted postgres is not a superuser. Temporarily inherit the existing
    -- publisher ownership capability solely for this reviewed replacement.
    -- Preserve each grantor's row: never alter another grantor's membership.
    executor_name:=current_user;
    executor:=executor_name::regrole::oid;
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]')
    INTO memberships_before FROM pg_auth_members m
    WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
    SELECT admin_option,inherit_option,set_option
    INTO prior_admin,prior_inherit,prior_set FROM pg_auth_members
    WHERE roleid='bertel_thesaurus_publisher'::regrole
      AND member=executor AND grantor=executor;
    had_executor_grant:=FOUND;
    EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT TRUE, SET FALSE GRANTED BY %I',
      executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,executor_name);
    EXECUTE replace(pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure),original,body);
    IF had_executor_grant THEN
      EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I',
        executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,
        CASE WHEN prior_inherit THEN 'TRUE' ELSE 'FALSE' END,
        CASE WHEN prior_set THEN 'TRUE' ELSE 'FALSE' END,executor_name);
    ELSE
      EXECUTE format('REVOKE bertel_thesaurus_publisher FROM %I GRANTED BY %I',executor_name,executor_name);
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]')
    INTO memberships_after FROM pg_auth_members m
    WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
    IF memberships_after IS DISTINCT FROM memberships_before THEN
      RAISE EXCEPTION 'Publisher role memberships were not restored exactly';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure
    AND (proowner IS DISTINCT FROM prior_owner OR proacl IS DISTINCT FROM prior_acl OR proconfig IS DISTINCT FROM prior_config OR NOT prosecdef)) THEN
    RAISE EXCEPTION 'Publication ownership, ACL, security mode or settings changed';
  END IF;

  -- Every endpoint receives the checksum from its pinned immutable manifest.
  -- Legacy snapshots keep the key absent; no live vocabulary lookup is added.
  SELECT prosrc,to_jsonb(p)-'prosrc' INTO STRICT original,prior_function
  FROM pg_proc p WHERE oid='thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  IF strpos(body,new_meta)>0 THEN
    IF (length(body)-length(replace(body,new_meta,'')))/length(new_meta)<>1
      OR md5(replace(body,new_meta,old_meta))<>'03fb8e96e1b55d8ed42ce2df19301942' THEN
      RAISE EXCEPTION 'Frozen metadata reader patch drift';
    END IF;
  ELSE
    IF md5(body)<>'03fb8e96e1b55d8ed42ce2df19301942'
      OR (length(body)-length(replace(body,old_meta,'')))/length(old_meta)<>1 THEN
      RAISE EXCEPTION 'Reviewed public reader changed before metadata patch';
    END IF;
    body:=replace(body,old_meta,new_meta);
    EXECUTE replace(pg_get_functiondef('thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure),original,body);
  END IF;
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p
    WHERE oid='thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure) IS DISTINCT FROM prior_function THEN
    RAISE EXCEPTION 'Public reader identity, ACL, owner, signature or execution settings changed';
  END IF;
END $domain_metadata$;
