# Functions / RPCs

_Reads/writes are regex-inferred and flagged by confidence._

## `api.add_legal_record(p_object_id text, p_type_code text, p_value jsonb, p_document_id uuid DEFAULT NULL::uuid, p_valid_from date DEFAULT CURRENT_DATE, p_valid_to date DEFAULT NULL::date, p_validity_mode legal_validity_mode DEFAULT 'fixed_end_date'::legal_validity_mode, p_status text DEFAULT 'active'::text, p_document_requested_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_document_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)`
- returns: `uuid`
- reads `public.ref_legal_type` _(high)_
- writes `public.object_legal` _(high)_

> =====================================================
> Function to add a legal record
> =====================================================

## `api.assert_facet_applicable()`
- returns: `trigger`
- reads `public.object` _(high)_
- reads `public.ref_facet_applicability` _(high)_
- reads `public.ref_facet_registry` _(high)_

> == 4. Generic applicability trigger ========================================
> Pattern B validator (cf. api.validate_object_taxonomy_assignment): SECURITY INVOKER,
> house search_path. Cost per row: 2 PK probes + 1 two-key PK probe -- hot-path safe (§37).

## `api.assert_object_type_change_consistent()`
- returns: `trigger` — dynamic SQL
- reads `public.ref_facet_applicability` _(high)_
- reads `public.ref_facet_registry` _(high)_

> == 5. Guard on object.object_type changes ==================================

## `api.assert_staging_batch_integrity(p_batch_id text)`
- returns: `jsonb` — SECURITY DEFINER

## `api.audit_legal_compliance(p_object_types text[] DEFAULT NULL::text[], p_include_expired boolean DEFAULT false)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to audit legal compliance across all objects
> =====================================================

## `api.auto_attach_object_to_creator_org()`
- returns: `trigger` — SECURITY DEFINER
- reads `public.object_org_link` _(high)_
- reads `public.ref_org_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.object_org_link` _(high)_

## `api.auto_populate_interaction_subject()`
- returns: `trigger`

## `api.b64url_decode(p text)`
- returns: `bytea`

## `api.b64url_encode(p bytea)`
- returns: `text`

## `api.before_insert_object_generate_id()`
- returns: `trigger`

> Génération d'ID si absent

## `api.build_iti_track(p_object_id text, p_format text DEFAULT 'kml'::text, p_include_stages boolean DEFAULT true, p_stage_color text DEFAULT 'red'::text)`
- returns: `text`
- reads `public.object` _(high)_
- reads `public.object_iti` _(high)_
- reads `public.object_iti_stage` _(high)_

## `api.build_opening_period_json(p_period_id uuid, p_object_id text, p_date_start date, p_date_end date)`
- returns: `json`

> =====================================================
> Helper: build a single opening period JSON (pure JSON, ordered)
> =====================================================

## `api.build_opening_period_json(p_period_id uuid, p_object_id text, p_date_start date, p_date_end date, p_order integer DEFAULT 1)`
- returns: `json`

> =====================================================
> Helper: build a single opening period JSON (pure JSON, ordered)
> =====================================================

## `api.can_delete_object_private_note(p_note_id uuid)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.object_private_description` _(high)_

> Suppression : réservée au rang admin le plus élevé de l'ORG (org_admin) ou au superuser plateforme.

## `api.can_manage_object_private_note(p_note_id uuid)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_
- reads `public.object_private_description` _(high)_

> Auteur, supérieur hiérarchique direct dans la même ORG, ou superuser plateforme.
> Utilisé pour modifier / archiver une note.

## `api.can_read_extended(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER

> Boolean per-row predicate kept as the single gate used by api.can_read_object -> the ~40
> object-child read policies (P0.3). Delegates to the set function above (one source of truth);
> MUST stay byte-equivalent to it. Was an inline 4-path WITH (see git history); set-based now.

## `api.can_read_object(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.object` _(high)_

> 1) Single source of truth for "is this object's data readable by the current caller".

## `api.can_read_object_private_notes(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER

> Retourne TRUE si l'utilisateur courant peut consulter les notes privées
> depuis le périmètre de son organisation active.

## `api.can_write_object_private_notes(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER

> Retourne TRUE si l'utilisateur courant peut écrire une note privée
> pour l'objet dans le périmètre de son organisation active.

## `api.check_membership_org_type()`
- returns: `trigger` — SECURITY DEFINER
- reads `public.object` _(high)_

> Trigger : garantit que org_object_id pointe vers un objet de type 'ORG'.
> Un CHECK constraint ne peut pas référencer une autre table en PostgreSQL ;
> le trigger est la solution correcte.

## `api.check_object_legal_compliance(p_object_id text)`
- returns: `TABLE(type_code text, type_name text, is_required boolean, has_record boolean, is_valid boolean, status text, valid_to date, days_until_expiry integer)`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to check if an object has all required legal records
> =====================================================

## `api.check_org_config_org_type()`
- returns: `trigger` — SECURITY DEFINER
- reads `public.object` _(high)_

> Trigger : garantit que org_object_id pointe vers un objet de type 'ORG'.

## `api.check_org_permission_org_type()`
- returns: `trigger` — SECURITY DEFINER
- reads `public.object` _(high)_

> Trigger : garantit que org_object_id pointe vers un objet de type 'ORG'.
> Un CHECK constraint ne peut pas référencer une autre table en PostgreSQL ;
> le trigger est la solution correcte (même pattern que check_membership_org_type
> et check_org_config_org_type).

## `api.commit_staging_to_public(p_batch_id text)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.ref_code` _(high)_
- writes `public.ref_classification_scheme` _(high)_
- writes `public.ref_code` _(high)_

## `api.compose_object_resource_blocks(p_payload jsonb)`
- returns: `jsonb`

## `api.create_crm_artifacts_from_incident()`
- returns: `trigger`
- writes `public.crm_interaction` _(high)_
- writes `public.crm_task` _(high)_
- writes `public.incident_report` _(high)_
- writes `public.object_iti` _(high)_

## `api.current_user_active_org()`
- returns: `TABLE(org_id text, org_name text)` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.user_org_membership` _(high)_

> Retourne l'ORG active de l'utilisateur courant (id + nom), pour le libellé
> côté éditeur du sélecteur de périmètre des descriptions. Le serveur reste
> autoritaire ; le client n'utilise ce nom que pour l'affichage.

## `api.current_user_admin_rank()`
- returns: `integer` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_

> Retourne le rang admin actif du user courant dans son ORG active (NULL si aucun).

## `api.current_user_admin_role_code()`
- returns: `text` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_

> Retourne le code du rôle admin actif du user courant (NULL si pas de rôle admin).
> Traverse : user_org_membership → user_org_admin_role → ref_org_admin_role.
> Le rôle admin ne bypasse pas api.user_has_permission() (§2.6 du plan).

## `api.current_user_business_role_code()`
- returns: `text` — SECURITY DEFINER
- reads `public.ref_org_business_role` _(high)_
- reads `public.user_org_business_role` _(high)_
- reads `public.user_org_membership` _(high)_

> Retourne le code du rôle métier actif du user courant (NULL si aucun).
> Traverse : user_org_membership → user_org_business_role → ref_org_business_role.
> Usage : affichage, contexte session — pas de logique de permission ici.

## `api.current_user_can_edit_objects()`
- returns: `boolean` — SECURITY DEFINER

> =====================================================
> Capability check : "le user courant peut-il éditer des objets ?"
> =====================================================
> TRUE quand l'utilisateur a au moins une voie d'édition sur le périmètre
> de son organisation active :
> 1. superuser plateforme (owner / super_admin / service_role / admin),
> 2. rôle admin actif dans son ORG (peu importe le rang),
> 3. permission métier d'édition sur n'importe quel objet : create_object,
> edit_canonical_when_publisher, edit_org_enrichment, publish_object.
> 
> Usage : la fonction est consommée par le frontend Explorer pour décider
> s'il doit afficher les statuts non publiés (draft) des objets de l'ORG.
> Elle ne porte AUCUNE logique d'autorisation sur une fiche précise — la RLS
> (cf. api.can_read_extended) reste seule à gater l'accès ligne par ligne.
> Un membre simple en lecture seule (pas d'admin role, pas de permission
> métier d'édition) renvoie FALSE et n'a donc accès qu'aux fiches publiées.
> STABLE + SECURITY DEFINER : pour traverser ref_permission / org_permission /
> user_permission sans dépendre des policies RLS de ces tables.

## `api.current_user_email()`
- returns: `text`

> Email courant (JWT claims)

## `api.current_user_extended_object_ids()`
- returns: `SETOF text` — SECURITY DEFINER
- reads `public.actor_object_role` _(high)_
- reads `public.object` _(high)_
- reads `public.object_org_link` _(high)_
- reads `public.org_config` _(high)_
- reads `public.user_org_membership` _(high)_

> Set form of api.can_read_extended: the current user's extended-readable object ids, computed once (RLS-bypassed). Used by the object SELECT policy as a hashed-set membership test to avoid per-row predicate evaluation. Keep byte-equivalent to can_read_extended's 4 paths.

## `api.current_user_org_id()`
- returns: `text` — SECURITY DEFINER
- reads `public.user_org_membership` _(high)_

> Retourne l'org_object_id actif du user courant (NULL si aucun membership actif).
> Pour un tourism_agent, au plus une ORG active existe (contrainte enforce_single_active_org_membership).
> Pour un owner/super_admin, retourne la première trouvée (usage interne uniquement).

## `api.current_user_readable_object_ids()`
- returns: `SETOF text` — SECURITY DEFINER
- reads `public.object` _(high)_

> 1) "Objects visible to me" = published ∪ my extended scope. Single source of truth for the
> object-level read visibility (the `object` table's own SELECT predicate, as a SET). SECURITY
> DEFINER so the published scan bypasses RLS; returns only object ids. Reuses §35's set fn.

## `api.cursor_pack(p jsonb)`
- returns: `text`

## `api.cursor_unpack(p text)`
- returns: `jsonb`

## `api.deliver_legal_document(p_legal_id uuid, p_document_id uuid, p_delivered_at timestamp with time zone DEFAULT now(), p_new_status text DEFAULT 'active'::text)`
- returns: `boolean`
- writes `public.object_legal` _(high)_

> =====================================================
> Function to mark a document as delivered
> =====================================================

## `api.disable_cache_triggers()`
- returns: `void` — SECURITY DEFINER

## `api.enable_cache_triggers()`
- returns: `void` — SECURITY DEFINER

## `api.enforce_actor_channel_email_shape()`
- returns: `trigger`

## `api.enforce_app_user_profile_role_change()`
- returns: `trigger` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_

## `api.enforce_contact_email_shape()`
- returns: `trigger`

> Email shape enforcement (object + actor)

## `api.enforce_single_active_org_membership()`
- returns: `trigger` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_
- reads `public.user_org_membership` _(high)_

> Trigger : contrainte "1 user tourism_agent = 1 ORG active".
> Un index partiel unique WHERE is_active = TRUE s'appliquerait à TOUS les users,
> y compris owner/super_admin. Le trigger permet d'appliquer la règle sélectivement.
> 
> Durcissements par rapport à la version naïve :
> 1. pg_advisory_xact_lock(user_id) : sérialise les transactions concurrentes sur le
> même user_id — élimine le TOCTOU sur les INSERTs simultanés.
> 2. SELECT ... FOR NO KEY UPDATE : verrouille les lignes actives existantes pendant
> la vérification — empêche une transaction concurrente de désactiver/réactiver
> un membership pendant que la nôtre lit.
> 3. Le trigger se déclenche aussi sur UPDATE OF user_id : si user_id est modifié
> sur un membership actif, la contrainte est revérifiée pour le nouveau user_id.
> 4. id IS DISTINCT FROM NEW.id remplace la condition TG_OP redondante :
> en BEFORE INSERT la ligne n'existe pas encore, l'exclusion est toujours correcte.

## `api.export_itineraries_gpx_batch(p_object_ids text[], p_include_stages boolean DEFAULT true)`
- returns: `TABLE(object_id text, name text, gpx_data text, file_size integer)`
- reads `public.object` _(high)_

> Batch GPX export for multiple itineraries

## `api.export_itinerary_gpx(p_object_id text, p_include_stages boolean DEFAULT true, p_include_metadata boolean DEFAULT true)`
- returns: `text`
- reads `public.object` _(high)_
- reads `public.object_description` _(high)_
- reads `public.object_iti` _(high)_
- reads `public.object_iti_stage` _(high)_

> Export full GPX with metadata and stages

## `api.export_publication_indesign(p_publication_id uuid, p_min_width integer DEFAULT 1600, p_min_height integer DEFAULT 1200)`
- returns: `json`
- reads `public.media` _(high)_
- reads `public.object` _(high)_
- reads `public.object_description` _(high)_
- reads `public.object_location` _(high)_
- reads `public.publication` _(high)_
- reads `public.publication_object` _(high)_

> =====================================================
> Publication export for print workflows (InDesign-ready)
> =====================================================

## `api.facet_applicability_violations()`
- returns: `TABLE(facet_table text, object_id text, object_type object_type)` — dynamic SQL
- reads `public.object` _(high)_
- reads `public.ref_facet_applicability` _(high)_
- reads `public.ref_facet_registry` _(high)_

> == 6. Violations report (ops/CI; legacy rows are NOT auto-deleted) =========

## `api.generate_legal_expiry_notifications(p_days_ahead integer DEFAULT 30, p_object_types text[] DEFAULT NULL::text[])`
- returns: `json`
- reads `public.object` _(high)_

> =====================================================
> Function to generate legal expiry notifications
> =====================================================

## `api.generate_object_id(p_object_type text, p_region_code text)`
- returns: `text`

> generate_object_id (HOTAQU000V5014ZU-like)

## `api.get_actor_data(p_object_id text)`
- returns: `jsonb`
- reads `public.actor` _(high)_
- reads `public.actor_channel` _(high)_
- reads `public.actor_object_role` _(high)_
- reads `public.ref_actor_role` _(high)_
- reads `public.ref_contact_role` _(high)_

> =====================================================
> Helper: Get enriched actor data with contacts
> =====================================================

## `api.get_all_opening_time_slots(p_period_id uuid)`
- returns: `jsonb`
- reads `public.opening_schedule` _(high)_
- reads `public.opening_time_frame` _(high)_
- reads `public.opening_time_period` _(high)_
- reads `public.opening_time_period_weekday` _(high)_

> =====================================================
> Optimized function to get all opening time slots for a period
> =====================================================

## `api.get_app_branding()`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.app_branding_settings` _(high)_

> Returns the full branding payload used by the authenticated SPA, including marker styles.

## `api.get_dashboard_actualisation(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date, p_threshold_days integer DEFAULT 90)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object` _(high)_

> Dashboard §10: per-type freshness breakdown against a configurable threshold.
> Tiers: up_to_date (< p_threshold_days old), to_review (threshold..2x threshold),
> stale (> 2x threshold). rate = percentage up_to_date.
> weekly_rates is NULL until Phase 2B adds the object_version time-series join.
> updated_at reflects meaningful business edits only (cache-only changes are excluded
> by the update_object_updated_at_business trigger).
> ORG objects excluded. p_updated_at_from/to scope the object pool (inclusive DATE boundaries).

## `api.get_dashboard_city_distribution(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date, p_limit integer DEFAULT 20)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_

> Dashboard §2b: top cities by object count within the filtered pool.
> Reads is_main_location=true from object_location; excludes null/empty cities.
> delta_30d counts objects created (not updated) in that city in the last 30 days.
> ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.

## `api.get_dashboard_city_options()`
- returns: `text[]` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_

> Returns a sorted TEXT[] of distinct cities present in object_location
> (is_main_location=true, non-null/non-empty) for all non-ORG objects, any status.
> No filter parameters. Used to populate the dashboard city filter dropdown.
> Represents the full corpus city domain, not the current filtered slice.

## `api.get_dashboard_distinction_overview(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_classification` _(high)_
- reads `public.ref_classification_scheme` _(high)_

> Dashboard §5: overview of objects carrying at least one granted qualification,
> classification, or label. Scope is driven by ref_classification_scheme.is_distinction = TRUE —
> no hardcoded list. To add a new label, seed its scheme with is_distinction = TRUE; this
> function picks it up automatically. Typological schemes (type_hot, retail_category) keep
> is_distinction = FALSE and are excluded. Returns global rate + per-scheme breakdown sorted
> by count DESC. ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.

## `api.get_dashboard_filter_options()`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_

> Returns { cities: text[], lieu_dits: text[] } as jsonb — sorted, btrim-cleaned,
> distinct values from object_location (is_main_location=true) for all non-ORG objects,
> any status. Both arrays represent the full corpus domain (not the current filtered slice).
> Used to populate the city and lieu-dit filter dropdowns on the dashboard sidebar in one call.

## `api.get_dashboard_lieu_dit_options()`
- returns: `text[]` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_

> Returns a sorted TEXT[] of distinct lieux-dits (btrim-cleaned, non-null/non-empty)
> from object_location (is_main_location=true) for all non-ORG objects, any status.
> No filter parameters. Used to populate the dashboard lieu-dit filter dropdown.
> Represents the full corpus lieu-dit domain, not the current filtered slice.

## `api.get_dashboard_scorecards(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.pending_change` _(high)_

> Dashboard §1: hero scorecard aggregates for the filtered object pool.
> Returns total/published counts, pending_change count (scoped to same pool),
> 30-day creation delta vs the prior 30 days, and average processing delay
> (COALESCE(applied_at, reviewed_at) - submitted_at) for resolved pending_changes.
> avg_completeness is always NULL in Phase 2A; it will be populated in Phase 2C.
> ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.

## `api.get_dashboard_type_breakdown(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object` _(high)_

> Dashboard §2a: object count broken down by object_type within the filtered pool.
> Each row includes per-status counts and the type's share of the total.
> ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.

## `api.get_expiring_legal_records(p_days_ahead integer DEFAULT 30, p_object_id text DEFAULT NULL::text, p_type_codes text[] DEFAULT NULL::text[])`
- returns: `TABLE(legal_id uuid, object_id text, object_name text, object_type text, legal_type_code text, legal_type_name text, value jsonb, valid_to date, days_until_expiry integer, status text)`
- reads `public.object` _(high)_
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get expiring legal records
> =====================================================

## `api.get_expiring_legal_records_api(p_days_ahead integer DEFAULT 30, p_object_types text[] DEFAULT NULL::text[], p_legal_types text[] DEFAULT NULL::text[])`
- returns: `json`
- reads `public.object` _(high)_

> =====================================================
> Function to get expiring legal records in API format
> =====================================================

## `api.get_filtered_object_ids(p_filters jsonb, p_types object_type[], p_status object_status[], p_search text DEFAULT NULL::text)`
- returns: `TABLE(object_id text, label_rank integer)` — SECURITY DEFINER

## `api.get_ingestor_metrics()`
- returns: `jsonb` — SECURITY DEFINER

## `api.get_ingestor_scheduler_health()`
- returns: `jsonb` — SECURITY DEFINER

## `api.get_itinerary_track_geojson(p_object_id text, p_simplify boolean DEFAULT false, p_tolerance double precision DEFAULT 0.0001)`
- returns: `json`
- reads `public.object_iti` _(high)_
- reads `public.object_iti_stage` _(high)_

> Get track with stages as GeoJSON FeatureCollection

## `api.get_itinerary_track_simplified(p_object_id text, p_tolerance double precision DEFAULT 0.0001)`
- returns: `json`
- reads `public.object_iti` _(high)_

> Simplified track for map display (lightweight GeoJSON)

## `api.get_local_now_for_timezone(p_business_timezone text)`
- returns: `TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)`

## `api.get_media_for_web(p_object_id text, p_preferred_tags text[] DEFAULT ARRAY['facade'::text, 'interieur'::text, 'cuisine'::text, 'paysage'::text], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20)`
- returns: `json`
- reads `public.media` _(high)_
- reads `public.media_tag` _(high)_

> =====================================================
> Get filtered media for web display (excludes internal/sensitive)
> =====================================================

## `api.get_object_amenity_codes_compact(p_object_id text)`
- returns: `jsonb`
- reads `public.object` _(high)_

> Compact amenity code array for cards, maps and LCP/list payloads. Uses canonical cached_amenity_codes, never legacy wheelchair_access.

## `api.get_object_badges_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb`
- reads `public.object_amenity` _(high)_
- reads `public.object_classification` _(high)_
- reads `public.object_sustainability_action` _(high)_
- reads `public.ref_amenity` _(high)_
- reads `public.ref_classification_scheme` _(high)_
- reads `public.ref_classification_value` _(high)_
- reads `public.ref_sustainability_action` _(high)_

> Compact badges from official classifications, sustainability actions and canonical acc_* accessibility amenities.

## `api.get_object_card(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb`
- reads `public.object` _(high)_
- reads `public.object_description` _(high)_
- reads `public.object_location` _(high)_

> =====================================================
> Lightweight card read model (single + batch)
> =====================================================

## `api.get_object_cards_adapted_batch(p_ids text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `json`

> Batch wrapper for get_object_resource_adapted. Returns adapted/FALC resources for multiple objects, preserving input order.

## `api.get_object_cards_batch(p_ids text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `json` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_description` _(high)_
- reads `public.object_location` _(high)_
- reads `public.object_taxonomy` _(high)_
- reads `public.ref_code` _(high)_
- reads `public.ref_code_domain_registry` _(high)_
- reads `public.ref_code_taxonomy_closure` _(high)_

> 2) cards_batch -> SECURITY DEFINER + authorize-once. Body is byte-identical to the step-5
> definition in api_views_functions.sql EXCEPT THREE changes: (a) the SECURITY DEFINER clause
> below; (b) the `distinct_ids` CTE gains the authorize-once gate — `WHERE EXISTS(published)
> OR id IN (SELECT api.current_user_extended_object_ids())` (§38 published-only fast-path: the
> set-equivalent split of `… current_user_readable_object_ids()` that skips the extended scan
> for an all-published page; every downstream child CTE joins distinct_ids); and
> (c) `main_description` re-applies the object_description visibility RLS this DEFINER body
> bypasses (see the inline note there — the only field-level read gate among the tables read).

## `api.get_object_environment_tags_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb`
- reads `public.object_environment_tag` _(high)_

> Compact environment tag payload for cards, maps and LCP/list payloads.

## `api.get_object_legal_compliance(p_object_id text)`
- returns: `json`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get legal compliance in API format
> =====================================================

## `api.get_object_legal_data(p_object_id text)`
- returns: `jsonb`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get legal data in API format
> =====================================================

## `api.get_object_legal_records(p_object_id text)`
- returns: `TABLE(legal_id uuid, type_code text, type_name text, type_category text, type_is_public boolean, value jsonb, document_id uuid, valid_from date, valid_to date, validity_mode text, status text, document_requested_at timestamp with time zone, document_delivered_at timestamp with time zone, note text, days_until_expiry integer)`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get all legal records for an object
> =====================================================

## `api.get_object_legal_records_by_visibility(p_object_id text, p_is_public boolean DEFAULT NULL::boolean)`
- returns: `TABLE(legal_id uuid, type_code text, type_name text, type_category text, type_is_public boolean, value jsonb, document_id uuid, valid_from date, valid_to date, validity_mode text, status text, document_requested_at timestamp with time zone, document_delivered_at timestamp with time zone, note text, days_until_expiry integer)`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get legal records filtered by visibility
> =====================================================

## `api.get_object_local_now(p_object_id text)`
- returns: `TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)`
- reads `public.object` _(high)_

## `api.get_object_map_item(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb`
- reads `public.object` _(high)_
- reads `public.object_description` _(high)_
- reads `public.object_location` _(high)_

> =====================================================
> Lightweight map view API - returns minimal object data
> =====================================================

## `api.get_object_private_legal_records(p_object_id text)`
- returns: `json`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get private legal records only (for parent org)
> =====================================================

## `api.get_object_public_legal_records(p_object_id text)`
- returns: `json`
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get public legal records only
> =====================================================

## `api.get_object_resource(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_track_format text DEFAULT 'none'::text, p_options jsonb DEFAULT '{}'::jsonb)`
- returns: `json` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.object_org_link` _(high)_

## `api.get_object_resource_adapted(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.contact_channel` _(high)_
- reads `public.object` _(high)_
- reads `public.object_amenity` _(high)_
- reads `public.object_classification` _(high)_
- reads `public.object_location` _(high)_
- reads `public.ref_amenity` _(high)_
- reads `public.ref_classification_scheme` _(high)_
- reads `public.ref_classification_value` _(high)_

> FALC/Accessibility-friendly resource read model. Returns a simplified JSON with
> description_adapted preferred over regular description, essential location,
> primary phone/email contacts, main image, and LBL_TOURISME_HANDICAP accessibility labels (V5 canonical code).

## `api.get_object_resources_batch(p_ids text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_track_format text DEFAULT 'none'::text, p_options jsonb DEFAULT '{}'::jsonb)`
- returns: `json`

> =====================================================
> Batch wrapper for get_object_resource (performance optimization)
> Fetches resources for multiple objects while preserving order
> =====================================================

## `api.get_object_reviews(p_object_id text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `json`
- reads `public.object_review` _(high)_
- reads `public.ref_review_source` _(high)_

> =====================================================
> Get object reviews with aggregates (external imports)
> =====================================================

## `api.get_object_room_types(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `json`
- reads `public.media` _(high)_
- reads `public.object_room_type` _(high)_
- reads `public.object_room_type_amenity` _(high)_
- reads `public.object_room_type_media` _(high)_
- reads `public.ref_amenity` _(high)_

> =====================================================
> Get room types for accommodations
> =====================================================

## `api.get_object_tags_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb`
- reads `public.ref_tag` _(high)_
- reads `public.tag_link` _(high)_

> Compact object tag payload for cards, maps and LCP/list payloads.

## `api.get_object_taxonomy_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `jsonb`
- reads `public.object_taxonomy` _(high)_
- reads `public.ref_code` _(high)_
- reads `public.ref_code_domain_registry` _(high)_
- reads `public.ref_code_taxonomy_closure` _(high)_

> Compact taxonomy payload for cards, maps and other LCP/list payloads.

## `api.get_object_with_deep_data(p_object_id text, p_languages text[] DEFAULT ARRAY['fr'::text], p_options jsonb DEFAULT '{}'::jsonb)`
- returns: `json`

## `api.get_objects_by_type_with_deep_data(p_object_type text, p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)`
- returns: `json`
- reads `public.object` _(high)_

> =====================================================
> Enhanced API function: Get objects by type with deep data
> =====================================================

## `api.get_objects_with_deep_data(p_object_ids text[], p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb)`
- returns: `json`
- reads `public.actor` _(high)_
- reads `public.actor_channel` _(high)_
- reads `public.actor_object_role` _(high)_
- reads `public.object` _(high)_
- reads `public.object_org_link` _(high)_
- reads `public.object_relation` _(high)_
- reads `public.ref_actor_role` _(high)_
- reads `public.ref_contact_role` _(high)_
- reads `public.ref_object_relation_type` _(high)_
- reads `public.ref_org_role` _(high)_

> =====================================================
> Enhanced API function: Get multiple objects with deep data
> =====================================================

## `api.get_opening_slots_by_day(p_period_id uuid)`
- returns: `jsonb`
- reads `public.opening_schedule` _(high)_
- reads `public.opening_time_frame` _(high)_
- reads `public.opening_time_period` _(high)_
- reads `public.opening_time_period_weekday` _(high)_

> =====================================================
> Optimized: get ALL opening time frames per weekday as arrays (unbounded)
> =====================================================

## `api.get_opening_time_slots(p_period_id uuid, p_weekday_code text, p_slot_number integer DEFAULT 1)`
- returns: `jsonb`
- reads `public.opening_schedule` _(high)_
- reads `public.opening_time_frame` _(high)_
- reads `public.opening_time_period` _(high)_
- reads `public.opening_time_period_weekday` _(high)_

> =====================================================
> Helper function to extract opening time slots for a specific day (legacy)
> =====================================================

## `api.get_organization_data(p_object_id text)`
- returns: `jsonb`
- reads `public.contact_channel` _(high)_
- reads `public.object` _(high)_
- reads `public.object_org_link` _(high)_
- reads `public.ref_contact_role` _(high)_
- reads `public.ref_org_role` _(high)_

> =====================================================
> Helper: Get enriched organization data
> =====================================================

## `api.get_parent_object_data(p_object_id text)`
- returns: `jsonb`
- reads `public.object` _(high)_
- reads `public.object_relation` _(high)_
- reads `public.ref_object_relation_type` _(high)_

> =====================================================
> Helper: Get enriched parent object data
> =====================================================

## `api.get_pending_document_requests(p_object_id text DEFAULT NULL::text, p_type_codes text[] DEFAULT NULL::text[])`
- returns: `TABLE(legal_id uuid, object_id text, object_name text, object_type text, legal_type_code text, legal_type_name text, value jsonb, document_requested_at timestamp with time zone, days_since_requested integer, note text)`
- reads `public.object` _(high)_
- reads `public.object_legal` _(high)_
- reads `public.ref_legal_type` _(high)_

> =====================================================
> Function to get pending document requests
> =====================================================

## `api.get_pending_document_requests_api(p_object_id text DEFAULT NULL::text, p_type_codes text[] DEFAULT NULL::text[])`
- returns: `json`

> =====================================================
> Function to get pending document requests in API format
> =====================================================

## `api.get_public_branding()`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.app_branding_settings` _(high)_

> Returns public-safe brand settings for anonymous contexts such as the login page.

## `api.guard_object_status_change()`
- returns: `trigger` — SECURITY DEFINER

> 8) Status guard: status changes require publish_object (rpc_publish_object), not edit_canonical.
> service_role/admin and platform superuser are exempt. rpc_publish_object verifies the
> caller's publish right before its UPDATE, so the trigger re-check passes for it
> (auth.uid() is preserved under SECURITY DEFINER). Fires only when `status` is in the SET list.

## `api.handle_auth_user_profile_created()`
- returns: `trigger` — SECURITY DEFINER

## `api.handle_membership_status_transition()`
- returns: `trigger`
- reads `public.object_membership` _(high)_
- reads `public.object_org_link` _(high)_
- writes `public.object` _(high)_

## `api.i18n_get_text(p_target_table text, p_target_pk text, p_target_column text, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- returns: `text`
- reads `public.i18n_translation` _(high)_
- reads `public.ref_language` _(high)_

> I18N Helper: Get translation from EAV i18n_translation table with fallback
> Usage: api.i18n_get_text('object_description', 'desc-uuid-123', 'description', 'en', 'fr')
> Returns: Translated text from i18n_translation table with fallback support
> Used for advanced cases where JSONB columns are not available

## `api.i18n_get_text_strict(p_target_table text, p_target_pk text, p_target_column text, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- returns: `text`
- reads `public.i18n_translation` _(high)_
- reads `public.ref_language` _(high)_

> I18N Helper (strict): EAV i18n without "any language" fallback

## `api.i18n_pick(p_i18n_data jsonb, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- returns: `text`

> I18N Helper: Pick translation from JSONB with fallback
> Usage: api.i18n_pick('{"fr": "Bonjour", "en": "Hello"}', 'en', 'fr')
> Returns: "Hello" (or "Bonjour" if 'en' not found, or any available language as last resort)
> Language codes are normalized to lowercase following project conventions

## `api.i18n_pick_strict(p_i18n_data jsonb, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- returns: `text`

> I18N Helper (strict): Pick translation from JSONB without "any language" fallback
> Returns NULL if both requested and fallback are missing/empty

## `api.is_object_open_now(p_object_id text)`
- returns: `boolean`
- reads `public.opening_period` _(high)_
- reads `public.opening_schedule` _(high)_
- reads `public.opening_time_frame` _(high)_
- reads `public.opening_time_period` _(high)_
- reads `public.opening_time_period_weekday` _(high)_

## `api.is_object_owner(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.actor_object_role` _(high)_

> Vérifie si l'utilisateur est propriétaire (owner) de l'objet
> via un rôle actor_object_role lié à son email dans actor_channel

## `api.is_opening_period_active_on_date(p_all_years boolean, p_date_start date, p_date_end date, p_local_date date)`
- returns: `boolean`

> Batch refresh cached_is_open_now for all objects.
> Scheduled on live via pg_cron. NOTE (2026-06-04): heavy job (~18-22s/run on ~373 published
> objects: correlated EXISTS over the opening_* chain + per-object timezone LATERAL). To avoid
> periodic instance saturation it runs every 15 min, STAGGERED off the */5 mv_filtered_objects
> refresh:  SELECT cron.alter_job(job_id := <id>, schedule := '3,18,33,48 * * * *');
> (orig example: SELECT cron.schedule('refresh-open-status','*/5 * * * *',$$SELECT api.refresh_open_status()$$);)
> A set-based rewrite of this function (sub-second) is a tracked follow-up (lot1_mapping_decisions.md §35).

## `api.is_opening_period_active_today(p_all_years boolean, p_date_start date, p_date_end date)`
- returns: `boolean`

## `api.is_platform_admin()`
- returns: `boolean` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_

> Returns true when the current user can manage platform-level branding and UI theme settings, using app_user_profile or auth metadata.

## `api.is_platform_owner()`
- returns: `boolean` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_

> Vérifie si l'utilisateur courant est owner plateforme (ou admin/service)

## `api.is_platform_superuser()`
- returns: `boolean` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_

> =====================================================
> Helper : autorité plateforme (owner OU super_admin)
> Distinct de api.is_platform_owner() qui ne couvre que 'owner'.
> Utilisé pour les opérations réservées à l'autorité plateforme :
> - écriture sur org_config.access_scope (§2.8 du plan maître)
> =====================================================

## `api.is_ref_code_taxonomy_domain(p_domain text)`
- returns: `boolean`
- reads `public.ref_code_domain_registry` _(high)_

## `api.json_clean(p jsonb)`
- returns: `jsonb`

> Clean JSON by removing newlines and extra whitespace

## `api.jsonb_pick_keys(p_payload jsonb, p_keys text[])`
- returns: `jsonb`

> =====================================================
> Object resource block helpers (decomposition layer)
> =====================================================

## `api.jsonb_prune_empty_top(p jsonb)`
- returns: `jsonb`

> =====================================================
> JSON Helper: Prune empty top-level keys (arrays/objects)
> =====================================================

## `api.list_object_resources_filtered_page(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- returns: `json`
- reads `public.object` _(high)_

## `api.list_object_resources_filtered_since_fast(p_since timestamp with time zone, p_cursor text DEFAULT NULL::text, p_use_source boolean DEFAULT false, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- returns: `json`
- reads `public.object` _(high)_

## `api.list_object_resources_page(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_omit_empty boolean DEFAULT NULL::boolean, p_view text DEFAULT 'card'::text)`
- returns: `json`
- reads `public.object` _(high)_

## `api.list_object_resources_page_text(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_types text[] DEFAULT NULL::text[], p_status text[] DEFAULT ARRAY['published'::text], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_omit_empty boolean DEFAULT NULL::boolean, p_view text DEFAULT 'card'::text)`
- returns: `json`

## `api.list_object_resources_since_fast(p_since timestamp with time zone, p_cursor text DEFAULT NULL::text, p_use_source boolean DEFAULT false, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 50, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- returns: `json`
- reads `public.object` _(high)_

## `api.list_object_resources_since_fast_text(p_since timestamp with time zone, p_cursor text DEFAULT NULL::text, p_use_source boolean DEFAULT false, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 50, p_types text[] DEFAULT NULL::text[], p_status text[] DEFAULT ARRAY['published'::text], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- returns: `json`

## `api.list_objects_map_view(p_types text[] DEFAULT NULL::text[], p_status text[] DEFAULT ARRAY['published'::text], p_filters jsonb DEFAULT '{}'::jsonb, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_

## `api.list_objects_with_validated_changes_since(p_since timestamp with time zone)`
- returns: `json` — SECURITY DEFINER
- reads `public.pending_change` _(high)_

> Returns a JSON array of object IDs that have had validated modifications (approved or applied) since the specified date. Uses applied_at timestamp if available, otherwise reviewed_at.

## `api.lock_object_private_description_system_fields()`
- returns: `trigger` — SECURITY DEFINER

> Notes privées : les champs de portée et d'auteur restent immuables même si
> un responsable ORG supérieur modifie le contenu d'une note.

## `api.log_publication_proof_interaction()`
- returns: `trigger`
- writes `public.crm_interaction` _(high)_

## `api.manage_object_published_at()`
- returns: `trigger`

> Mise à jour published_at

## `api.norm_search(p text)`
- returns: `text`

## `api.object_private_note_author_admin_rank(p_note_id uuid)`
- returns: `integer` — SECURITY DEFINER
- reads `public.object_private_description` _(high)_
- reads `public.ref_org_admin_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_

> Retourne le rang admin de l'auteur de la note dans l'ORG de la note (NULL si aucun).

## `api.pick_lang(p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- returns: `text`

## `api.prevent_duplicate_actor_email()`
- returns: `trigger`
- reads `public.actor_channel` _(high)_

> Unicité email cross-actors

## `api.purge_expired_staging_batches(p_limit integer DEFAULT 500)`
- returns: `jsonb` — SECURITY DEFINER

## `api.purge_staging_batch(p_batch_id text, p_force boolean DEFAULT false)`
- returns: `jsonb` — SECURITY DEFINER

## `api.recompute_audit_session_score()`
- returns: `trigger`
- reads `public.audit_result` _(high)_
- writes `public.audit_session` _(high)_

## `api.refresh_object_filter_caches(p_object_id text)`
- returns: `void` — SECURITY DEFINER
- reads `public.object_amenity` _(high)_
- reads `public.object_classification` _(high)_
- reads `public.object_environment_tag` _(high)_
- reads `public.object_language` _(high)_
- reads `public.object_payment_method` _(high)_
- reads `public.object_taxonomy` _(high)_
- reads `public.ref_amenity` _(high)_
- reads `public.ref_classification_scheme` _(high)_
- reads `public.ref_classification_value` _(high)_
- reads `public.ref_code` _(high)_
- reads `public.ref_code_taxonomy_closure` _(high)_
- reads `public.ref_language` _(high)_
- writes `public.object` _(high)_

> Refresh denormalized filter caches used by hot-path filtered listing.

## `api.refresh_object_taxonomy_cache_for_domain(p_domain text)`
- returns: `void`
- reads `public.object` _(high)_
- reads `public.object_taxonomy` _(high)_
- reads `public.ref_code` _(high)_
- reads `public.ref_code_taxonomy_closure` _(high)_
- writes `public.object` _(high)_

## `api.refresh_open_status()`
- returns: `void`
- reads `public.object` _(high)_
- reads `public.opening_period` _(high)_
- reads `public.opening_schedule` _(high)_
- reads `public.opening_time_frame` _(high)_
- reads `public.opening_time_period` _(high)_
- reads `public.opening_time_period_weekday` _(high)_
- writes `public.object` _(high)_

## `api.refresh_ref_code_taxonomy_closure(p_domain text)`
- returns: `void`
- reads `public.ref_code` _(high)_
- reads `public.ref_code_taxonomy_closure` _(high)_
- writes `public.ref_code_taxonomy_closure` _(high)_

## `api.render_format_currency(p_amount numeric, p_currency text, p_locale text)`
- returns: `text`

> =====================================================
> Rendering helpers (currency, percent, dates, datetimes)
> =====================================================

## `api.render_format_date(p_date date, p_locale text)`
- returns: `text`

## `api.render_format_date_range(p_start date, p_end date, p_locale text)`
- returns: `text`

## `api.render_format_datetime_range(p_start timestamp with time zone, p_end timestamp with time zone, p_locale text, p_timezone text)`
- returns: `text`

## `api.render_format_percent(p_percent numeric, p_locale text)`
- returns: `text`

## `api.render_format_time(p_time time without time zone, p_locale text)`
- returns: `text`

## `api.request_legal_document(p_legal_id uuid, p_requested_at timestamp with time zone DEFAULT now())`
- returns: `boolean`
- writes `public.object_legal` _(high)_

> =====================================================
> Function to request a document for a legal record
> =====================================================

## `api.resolve_staging_dependencies(p_batch_id text)`
- returns: `jsonb` — SECURITY DEFINER

## `api.resource_block_base(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_contacts(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_descriptions(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_itinerary(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_legal(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_location(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_media(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_misc(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_pricing(p_payload jsonb)`
- returns: `jsonb`

## `api.resource_block_render(p_payload jsonb)`
- returns: `jsonb`

## `api.retry_failed_media_downloads(p_limit integer DEFAULT 200)`
- returns: `jsonb` — SECURITY DEFINER

## `api.rollback_staging_batch_compensate(p_batch_id text, p_force boolean DEFAULT false)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.media` _(high)_
- reads `public.object` _(high)_
- writes `public.media` _(high)_
- writes `public.object` _(high)_

## `api.rpc_create_object(p_object_type text, p_name text, p_region_code text DEFAULT NULL::text)`
- returns: `text` — SECURITY DEFINER
- writes `public.object` _(high)_

> -------------------------------------------------------
> F1. api.rpc_create_object(p_object_type, p_name, p_region_code)
> Crée un objet via la surface métier sécurisée.
> Exige : membership ORG actif (Niveau 1) + permission create_object (Niveau 2).
> Status forcé à 'draft' : la publication passe obligatoirement par rpc_publish_object.
> created_by forcé à auth.uid() : non paramétrable, non falsifiable.
> ID généré automatiquement par le trigger (basé sur object_type + region_code).
> Retourne : l'id TEXT de l'objet créé.
> -------------------------------------------------------

## `api.rpc_deactivate_membership(p_membership_id uuid)`
- returns: `void` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_org_admin_role` _(high)_
- writes `public.user_org_business_role` _(high)_
- writes `public.user_org_membership` _(high)_

> -------------------------------------------------------
> rpc_deactivate_membership
> Désactive un membership et ses rôles (métier + admin) en cascade.
> Autorisation : org_admin (rank ≥ 30) de l'ORG cible, ou super_admin.
> Anti-self : un admin ne peut pas désactiver son propre membership.
> Rang : la cible doit avoir un rang admin strictement inférieur à l'appelant (§2.6).
> -------------------------------------------------------

## `api.rpc_grant_org_permission(p_org_object_id text, p_permission_code text)`
- returns: `void` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_permission` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.org_permission` _(high)_

> -------------------------------------------------------
> D1. rpc_grant_org_permission
> Accorde une permission à une ORG entière.
> Autorisation : org_admin (rank 30) de l'ORG cible, ou superuser plateforme.
> Idempotent : si la permission existe et est inactive, elle est réactivée.
> Pas d'anti-self : c'est une permission ORG, pas personnelle.
> -------------------------------------------------------

## `api.rpc_grant_user_permission(p_target_user_id uuid, p_permission_code text)`
- returns: `void` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_permission` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_permission` _(high)_

> -------------------------------------------------------
> D3. rpc_grant_user_permission
> Accorde une permission additive à un user précis.
> Autorisation : org_admin (rank 30) de l'ORG du user cible, ou superuser plateforme.
> Anti-self (§2.6) : un admin ne peut pas s'auto-accorder une permission.
> Idempotent : réactive une permission révoquée si elle existe déjà.
> -------------------------------------------------------

## `api.rpc_list_org_members(p_org_object_id text)`
- returns: `TABLE(membership_id uuid, user_id uuid, email text, display_name text, is_active boolean, business_role_code text, admin_role_code text, permission_codes text[])` — SECURITY DEFINER
- reads `public.app_user_profile` _(high)_
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_org_business_role` _(high)_
- reads `public.ref_permission` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_business_role` _(high)_
- reads `public.user_org_membership` _(high)_
- reads `public.user_permission` _(high)_

## `api.rpc_publish_object(p_object_id text, p_publish boolean DEFAULT true)`
- returns: `void` — SECURITY DEFINER

> -------------------------------------------------------
> F2. api.rpc_publish_object(p_object_id, p_publish)
> Publie (TRUE) ou dépublie (FALSE) un objet.
> Exige : permission publish_object + ORG active = publisher sur l'objet.
> 
> Publication  (p_publish = TRUE)  → status = 'published'
> published_at géré par trg_manage_object_published_at (premier passage uniquement).
> Dépublication (p_publish = FALSE) → status = 'hidden'
> 'hidden' = retrait temporaire du public, l'objet n'est pas remis en rédaction.
> 'draft' est réservé aux objets non encore publiés.
> published_at conservé (historique de première publication intact).
> -------------------------------------------------------

## `api.rpc_revoke_admin_role(p_membership_id uuid)`
- returns: `void` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_org_admin_role` _(high)_

> -------------------------------------------------------
> rpc_revoke_admin_role
> Retire le rôle admin d'un membre (sans toucher au rôle métier).
> Autorisation : org_admin (rank 30), ou super_admin.
> Anti-self (§2.6) : impossible de se retirer son propre rôle admin.
> Gestion vers le bas seulement (§2.6) : rang cible < rang appelant.
> No-op silencieux si la cible n'a pas de rôle admin actif.
> -------------------------------------------------------

## `api.rpc_revoke_org_permission(p_org_object_id text, p_permission_code text)`
- returns: `void` — SECURITY DEFINER
- reads `public.object` _(high)_
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_permission` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.org_permission` _(high)_

> -------------------------------------------------------
> D2. rpc_revoke_org_permission
> Révoque une permission d'une ORG (soft revoke : is_active = FALSE).
> Autorisation : org_admin (rank 30) de l'ORG cible, ou superuser plateforme.
> No-op silencieux si la permission n'est pas active sur cette ORG.
> -------------------------------------------------------

## `api.rpc_revoke_user_permission(p_target_user_id uuid, p_permission_code text)`
- returns: `void` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_permission` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_permission` _(high)_

> -------------------------------------------------------
> D4. rpc_revoke_user_permission
> Révoque une permission individuelle d'un user (soft revoke).
> Autorisation : org_admin (rank 30) de l'ORG du user cible, ou superuser plateforme.
> Anti-self (§2.6) : un admin ne peut pas se retirer une permission lui-même.
> No-op silencieux si la permission n'est pas active pour ce user.
> -------------------------------------------------------

## `api.rpc_set_admin_role(p_membership_id uuid, p_role_code text)`
- returns: `void` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_business_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_org_admin_role` _(high)_

> -------------------------------------------------------
> rpc_set_admin_role
> Attribue ou remplace le rôle admin d'un membre.
> Autorisation : org_admin (rank 30) de l'ORG cible, ou super_admin.
> Anti-self (§2.6) : auto-attribution interdite.
> Gestion vers le bas seulement (§2.6) :
> - nouveau rang cible < rang appelant
> - rang actuel cible (si admin) < rang appelant
> Invariant §2.5 : le membre doit avoir un rôle métier actif avant
> de recevoir un rôle admin ("pas d'admin sans métier").
> -------------------------------------------------------

## `api.rpc_set_business_role(p_membership_id uuid, p_role_code text)`
- returns: `void` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_org_business_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_org_business_role` _(high)_

> -------------------------------------------------------
> rpc_set_business_role
> Remplace le rôle métier actif d'un membre (rotation : désactiver + créer).
> Autorisation : org_manager (rank ≥ 20) de l'ORG cible, ou super_admin.
> Anti-self : un admin ne peut pas modifier son propre rôle métier.
> Note : les rôles métier n'ont pas de hiérarchie de rang propre ;
> le guard porte sur le rang admin de l'appelant uniquement.
> -------------------------------------------------------

## `api.rpc_set_object_status(p_object_id text, p_status text)`
- returns: `text` — SECURITY DEFINER
- reads `public.object` _(high)_
- writes `public.object` _(high)_

## `api.rpc_upsert_membership(p_target_user_id uuid, p_org_object_id text, p_business_role_code text)`
- returns: `uuid` — SECURITY DEFINER
- reads `public.ref_org_admin_role` _(high)_
- reads `public.ref_org_business_role` _(high)_
- reads `public.user_org_admin_role` _(high)_
- reads `public.user_org_membership` _(high)_
- writes `public.user_org_business_role` _(high)_
- writes `public.user_org_membership` _(high)_

> -------------------------------------------------------
> rpc_upsert_membership
> Crée un membership (+ rôle métier initial) ou réactive un membership inactif.
> Autorisation : org_manager (rank ≥ 20) de l'ORG cible, ou super_admin.
> Anti-self : un admin ne peut pas s'ajouter lui-même.
> Invariant §2.5 : le rôle métier est obligatoire — toujours fourni à la création.
> -------------------------------------------------------

## `api.rpc_write_org_description(p_object_id text, p_payload jsonb)`
- returns: `jsonb` — SECURITY DEFINER
- reads `public.object_description` _(high)_
- writes `public.object_description` _(high)_

> Écrit/supprime la SURCOUCHE de description propre à l'ORG active de l'utilisateur.
> Seul écrivain des lignes object_description scopées org_object_id (invariant CLAUDE.md).
> Le serveur fixe org_object_id = current_user_org_id() : le client ne choisit pas l'ORG.
> Payload tout-vide => suppression de la ligne (fallback canonique au rendu).

## `api.run_staging_dedup(p_batch_id text, p_distance_meters integer DEFAULT 50, p_name_similarity real DEFAULT 0.45)`
- returns: `jsonb` — SECURITY DEFINER

## `api.save_object_commercial(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.object_amenity` _(high)_
- reads `public.object_environment_tag` _(high)_
- reads `public.object_language` _(high)_
- reads `public.object_payment_method` _(high)_
- reads `public.ref_language` _(high)_
- writes `public.object_amenity` _(high)_
- writes `public.object_environment_tag` _(high)_
- writes `public.object_language` _(high)_
- writes `public.object_payment_method` _(high)_

## `api.save_object_itinerary_nested(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.object_iti_info` _(high)_
- reads `public.object_iti_stage` _(high)_
- writes `public.object_iti_info` _(high)_
- writes `public.object_iti_stage` _(high)_

## `api.save_object_openings(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.opening_period` _(high)_
- writes `public.opening_period` _(high)_
- writes `public.opening_schedule` _(high)_
- writes `public.opening_time_period` _(high)_

## `api.save_object_places(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.object_place` _(high)_
- writes `public.object_location` _(high)_
- writes `public.object_place` _(high)_
- writes `public.object_place_description` _(high)_

## `api.save_object_relations(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.object` _(high)_
- reads `public.object_org_link` _(high)_
- reads `public.object_relation` _(high)_
- reads `public.ref_object_relation_type` _(high)_
- reads `public.ref_org_role` _(high)_
- writes `public.object_org_link` _(high)_
- writes `public.object_relation` _(high)_

> ⚠ BODY SYNC: this function body must stay byte-identical to the copy in migration_actor_links_editor.sql (8r re-applies it after this file on fresh installs). Edit BOTH or fresh ≠ live.

## `api.save_object_workspace_sustainability(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.object_sustainability_action` _(high)_
- reads `public.ref_sustainability_action` _(high)_
- reads `public.ref_sustainability_action_category` _(high)_
- writes `public.object_sustainability_action` _(high)_

## `api.save_object_workspace_tags(p_object_id text, p_payload jsonb)`
- returns: `jsonb`
- reads `public.ref_tag` _(high)_
- reads `public.tag_link` _(high)_
- writes `public.tag_link` _(high)_

## `api.search_actors(p_query text)`
- returns: `TABLE(id uuid, display_name text, first_name text, last_name text)` — SECURITY DEFINER
- reads `public.actor` _(high)_
- reads `public.actor_object_role` _(high)_

> == 4. picker RPC ==

## `api.search_events_by_restaurant_cuisine(p_cuisine_types text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_
- reads `public.object_menu` _(high)_
- reads `public.object_menu_item` _(high)_
- reads `public.object_menu_item_cuisine_type` _(high)_
- reads `public.object_relation` _(high)_

## `api.search_objects_by_label(p_label_value_id uuid, p_include_partial boolean DEFAULT true, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.object_classification` _(high)_
- reads `public.object_sustainability_action` _(high)_
- reads `public.object_sustainability_action_label` _(high)_
- reads `public.ref_classification_value` _(high)_

> =====================================================
> Search objects by label with partial action matches
> =====================================================

## `api.search_objects_with_deep_data(p_search_term text, p_object_types text[] DEFAULT NULL::text[], p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_

> =====================================================
> Enhanced API function: Search objects with deep data
> =====================================================

## `api.search_restaurants_by_cuisine(p_cuisine_types text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.object_location` _(high)_
- reads `public.object_menu` _(high)_
- reads `public.object_menu_item` _(high)_
- reads `public.object_menu_item_cuisine_type` _(high)_

## `api.set_publication_workflow_timestamps()`
- returns: `trigger`

## `api.sync_app_user_profile_from_auth_user(p_user_id uuid, p_email text, p_raw_user_meta_data jsonb DEFAULT '{}'::jsonb, p_raw_app_meta_data jsonb DEFAULT '{}'::jsonb)`
- returns: `void` — SECURITY DEFINER
- writes `public.app_user_profile` _(high)_

## `api.sync_classification_from_audit_session()`
- returns: `trigger`
- reads `public.audit_template` _(high)_
- writes `public.object_classification` _(high)_

## `api.to_base36(n bigint)`
- returns: `text`

> to_base36

## `api.trg_refresh_object_filter_caches_from_child()`
- returns: `trigger` — SECURITY DEFINER

## `api.trg_refresh_ref_code_taxonomy_closure()`
- returns: `trigger`
- reads `public.ref_code_domain_registry` _(high)_

## `api.update_legal_record(p_legal_id uuid, p_value jsonb DEFAULT NULL::jsonb, p_document_id uuid DEFAULT NULL::uuid, p_valid_from date DEFAULT NULL::date, p_valid_to date DEFAULT NULL::date, p_validity_mode legal_validity_mode DEFAULT NULL::legal_validity_mode, p_status text DEFAULT NULL::text, p_document_requested_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_document_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)`
- returns: `boolean`
- writes `public.object_legal` _(high)_

> =====================================================
> Function to update a legal record
> =====================================================

## `api.upsert_app_branding(p_brand_name text DEFAULT NULL::text, p_logo_storage_path text DEFAULT NULL::text, p_logo_public_url text DEFAULT NULL::text, p_logo_mime_type text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_accent_color text DEFAULT NULL::text, p_text_color text DEFAULT NULL::text, p_background_color text DEFAULT NULL::text, p_surface_color text DEFAULT NULL::text, p_marker_styles jsonb DEFAULT NULL::jsonb, p_extra jsonb DEFAULT NULL::jsonb, p_clear_logo boolean DEFAULT false)`
- returns: `jsonb` — SECURITY DEFINER
- writes `public.app_branding_settings` _(high)_

> Creates or updates the global branding/theme settings used by the UI. Restricted to platform admins.

## `api.user_actor_ids()`
- returns: `SETOF uuid`
- reads `public.actor_channel` _(high)_

> Acteurs liés à l'utilisateur via email dans actor_channel.kind='email'

## `api.user_can_create_object()`
- returns: `boolean` — SECURITY DEFINER

> -------------------------------------------------------
> Phase 5 — api.user_can_create_object()
> Définie ICI (avant la policy qui l'utilise) pour respecter l'ordre
> d'exécution SQL : la policy INSERT référence la fonction, elle doit
> exister au moment du CREATE POLICY.
> -------------------------------------------------------

## `api.user_can_publish_object(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.object_org_link` _(high)_
- reads `public.ref_org_role` _(high)_

> -------------------------------------------------------
> E2. api.user_can_publish_object(p_object_id text)
> Permission Niveau 2 : publish_object
> ET l'ORG active du user est publisher sur l'objet (via object_org_link).
> Règle prudente (§2.2) : seul le publisher contrôle le statut de publication.
> Non branché en RLS : le changement de status passe par UPDATE, impossible de
> distinguer OLD.status vs NEW.status dans USING/WITH CHECK sans RPC.
> Conçu pour être appelé par rpc_publish_object (à créer en Phase 6).
> -------------------------------------------------------

## `api.user_can_write_canonical(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.object_org_link` _(high)_
- reads `public.ref_org_role` _(high)_

> -------------------------------------------------------
> E3. api.user_can_write_canonical(p_object_id text)
> Permission Niveau 2 : edit_canonical_when_publisher
> ET l'ORG active du user est publisher sur l'objet.
> Règle métier (§2.2) : seul le publisher modifie la donnée canonique.
> Non branché en RLS : pas de surface de colonne isolée pour le canonique
> vs l'enrichissement dans le schéma actuel.
> Conçu pour être appelé par les RPC d'écriture canonique (Phase 6).
> -------------------------------------------------------

## `api.user_can_write_enrichment(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.object_org_link` _(high)_
- reads `public.ref_org_role` _(high)_

> -------------------------------------------------------
> E4. api.user_can_write_enrichment(p_object_id text)
> Permission Niveau 2 : edit_org_enrichment
> ET l'ORG active du user dispose d'un lien object_org_link explicite
> avec rôle 'publisher' ou 'contributor' (pas 'reader').
> Règle métier (§2.2) : une ORG ne peut enrichir un objet que si elle a
> un lien explicite avec un rôle au moins contributeur.
> Non branché en RLS : aucune table d'enrichissement ORG distincte n'existe
> encore dans le schéma — surface d'écriture non matérialisée.
> Conçu pour être appelé par les RPC d'enrichissement ORG (Phase 6).
> -------------------------------------------------------

## `api.user_can_write_object_canonical(p_object_id text)`
- returns: `boolean` — SECURITY DEFINER

> 1) Single source of truth for canonical-write authorization (additive OR).

## `api.user_has_permission(p_permission_code text)`
- returns: `boolean` — SECURITY DEFINER
- reads `public.org_permission` _(high)_
- reads `public.ref_permission` _(high)_
- reads `public.user_org_membership` _(high)_
- reads `public.user_permission` _(high)_

> =====================================================
> B. Helper : api.user_has_permission(p_permission_code text)
> =====================================================
> Résolution V1 — deux chemins, sans exceptions ni groupes :
> Chemin 1 : permission accordée directement au user (user_permission)
> Chemin 2 : permission accordée à l'ORG active du user (org_permission, héritage ORG)
> 
> CHOIX D'IMPLÉMENTATION — Pas de bypass automatique pour owner/super_admin :
> §2.6 du plan : "Un admin doit avoir ses permissions dans org_permission
> ou user_permission comme n'importe qui."
> Ce principe s'étend aux autorités plateforme pour préserver l'auditabilité.
> En pratique, les opérations owner/super_admin passent par service_role (bypass RLS
> natif) et n'ont pas besoin de shortcut ici.
> Si un owner a besoin d'une permission pour des tests UI, il reçoit une user_permission
> explicite — tracée comme n'importe quelle autre attribution.
> 
> STABLE + SECURITY DEFINER : bypass RLS sur org_permission et user_permission
> pour éviter toute récursion (même principe que current_user_org_id()).
> =====================================================

## `api.validate_audit_result_points()`
- returns: `trigger`
- reads `public.audit_criteria` _(high)_

## `api.validate_object_business_timezone()`
- returns: `trigger`

## `api.validate_object_taxonomy_assignment()`
- returns: `trigger`
- reads `public.object` _(high)_
- reads `public.ref_code` _(high)_
- reads `public.ref_code_domain_registry` _(high)_

## `api.validate_promotion_code(p_code text, p_object_id text DEFAULT NULL::text)`
- returns: `json`
- reads `public.object` _(high)_
- reads `public.promotion` _(high)_
- reads `public.promotion_object` _(high)_

> =====================================================
> Validate promotion code for an object
> =====================================================

## `api.validate_ref_code_taxonomy_hierarchy()`
- returns: `trigger`
- reads `public.ref_code` _(high)_
- reads `public.ref_code_domain_registry` _(high)_

## `api.watchdog_mark_stale_batches(p_stale_minutes integer DEFAULT 30, p_limit integer DEFAULT 200)`
- returns: `jsonb` — SECURITY DEFINER

## `audit.attach_missing_triggers()`
- returns: `void` — SECURITY DEFINER, dynamic SQL

> Attach audit triggers (invoked at end of script to include late-created tables).

## `audit.create_monthly_partition(partition_date timestamp with time zone)`
- returns: `text` — dynamic SQL

## `audit.drop_old_partitions(months_to_keep integer DEFAULT 12)`
- returns: `text` — dynamic SQL

## `audit.ensure_future_partitions(months_ahead integer DEFAULT 3)`
- returns: `text`

## `audit.get_month_partition_name(partition_date timestamp with time zone)`
- returns: `text`

## `audit.log_row_changes()`
- returns: `trigger` — SECURITY DEFINER
- writes `audit.audit_log` _(high)_

## `audit.maintain_partitions()`
- returns: `text`

## `internal.workspace_assert_can_write_object(p_object_id text)`
- returns: `void` — SECURITY DEFINER
- reads `public.object` _(high)_

> 2) Workspace gate (was: is_object_owner only).

## `internal.workspace_jsonb_array(p_value jsonb)`
- returns: `jsonb`

## `internal.workspace_jsonb_object(p_value jsonb)`
- returns: `jsonb`

## `internal.workspace_result(p_success boolean DEFAULT true, p_changed_counts jsonb DEFAULT '{}'::jsonb, p_skipped_fields text[] DEFAULT ARRAY[]::text[], p_warnings text[] DEFAULT ARRAY[]::text[])`
- returns: `jsonb`

## `internal.workspace_uuid(p_value text)`
- returns: `uuid`

## `public.create_object_version_monthly_partition(partition_date timestamp with time zone)`
- returns: `text`

## `public.enforce_classification_single_selection()`
- returns: `trigger`
- reads `public.object_classification` _(high)_
- reads `public.ref_classification_scheme` _(high)_
- reads `public.ref_classification_value` _(high)_

## `public.enforce_single_main_media()`
- returns: `trigger`
- writes `public.media` _(high)_

## `public.immutable_unaccent(text)`
- returns: `text`

> immutable_unaccent

## `public.increment_object_version()`
- returns: `trigger`

## `public.pending_change_after_delete()`
- returns: `trigger`
- reads `public.pending_change` _(high)_
- writes `public.object` _(high)_

## `public.pending_change_after_insert()`
- returns: `trigger`
- writes `public.object` _(high)_

## `public.pending_change_after_update()`
- returns: `trigger`
- reads `public.pending_change` _(high)_
- writes `public.object` _(high)_

## `public.propagate_capacity_unit_change()`
- returns: `trigger`
- writes `public.object_capacity` _(high)_

## `public.ref_language_set_position()`
- returns: `trigger`
- reads `public.ref_language` _(high)_

## `public.regenerate_iti_track_cache()`
- returns: `trigger`

## `public.save_object_version()`
- returns: `trigger` — SECURITY DEFINER
- writes `public.object_version` _(high)_

## `public.sync_object_capacity_unit()`
- returns: `trigger`
- reads `public.ref_capacity_metric` _(high)_

## `public.update_object_cached_main_image()`
- returns: `trigger`
- reads `public.media` _(high)_
- writes `public.object` _(high)_

## `public.update_object_cached_min_price()`
- returns: `trigger`
- reads `public.object_price` _(high)_
- writes `public.object` _(high)_

## `public.update_object_cached_rating_metrics()`
- returns: `trigger`
- reads `public.object_review` _(high)_
- writes `public.object` _(high)_

## `public.update_object_updated_at_business()`
- returns: `trigger`

## `public.update_updated_at_column()`
- returns: `trigger`

## `public.validate_i18n_translation_target()`
- returns: `trigger`

## `public.validate_media_dimensions()`
- returns: `trigger`

## `public.validate_org_object_type()`
- returns: `trigger`
- reads `public.object` _(high)_
