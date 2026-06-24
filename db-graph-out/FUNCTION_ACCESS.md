# Functions — output, access path & object types served

_For every function: what it **returns** (output), **how to reach it**, and **which object types** its data touches. Object types are derived from detected reads/writes → facet applicability + object/common-child membership; `ALL` = touches `object` or a common child (so serves every type). `—` under types = not object-scoped (ref / rbac / admin / infra) or no table touch detected. Reads/writes are regex-inferred (false negatives possible — see SURFACE_COVERAGE.md)._

## schema `api`

### `api._covered_days(p_all_years boolean, p_s date, p_e date)`
- **returns:** `integer[]`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/_covered_days`
- **object types served:** —
- _4) Validation anti-chevauchement (même rang : croisement partiel interdit, imbrication tolérée)._

### `api.add_legal_record(p_object_id text, p_type_code text, p_value jsonb, p_document_id uuid DEFAULT NULL::uuid, p_valid_from date DEFAULT CURRENT_DATE, p_valid_to date DEFAULT NULL::date, p_validity_mode legal_validity_mode DEFAULT 'fixed_end_date'::legal_validity_mode, p_status text DEFAULT 'active'::text, p_document_requested_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_document_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)`
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/add_legal_record`
- **object types served:** **all object types**
- _Function to add a legal record_

### `api.assert_facet_applicable()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _4. Generic applicability trigger_

### `api.assert_no_period_overlap(p_periods jsonb)`
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/assert_no_period_overlap`
- **object types served:** —

### `api.assert_object_type_change_consistent()` _(dyn-SQL)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _5. Guard on object.object_type changes_

### `api.assert_staging_batch_integrity(p_batch_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/assert_staging_batch_integrity`
- **object types served:** —

### `api.audit_legal_compliance(p_object_types text[] DEFAULT NULL::text[], p_include_expired boolean DEFAULT false)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/audit_legal_compliance`
- **object types served:** **all object types**
- _Function to audit legal compliance across all objects_

### `api.auto_attach_object_to_creator_org()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.auto_populate_interaction_subject()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.b64url_decode(p text)`
- **returns:** `bytea`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/b64url_decode`
- **object types served:** —

### `api.b64url_encode(p bytea)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/b64url_encode`
- **object types served:** —

### `api.before_insert_object_generate_id()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Génération d'ID si absent_

### `api.build_iti_track(p_object_id text, p_format text DEFAULT 'kml'::text, p_include_stages boolean DEFAULT true, p_stage_color text DEFAULT 'red'::text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/build_iti_track`
- **object types served:** **all object types**

### `api.build_opening_period_json(p_period_id uuid, p_object_id text, p_date_start date, p_date_end date)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/build_opening_period_json`
- **object types served:** —
- _5) Read path: emit the period type code (+ all_years) so the editor round-trips._

### `api.build_opening_period_json(p_period_id uuid, p_object_id text, p_date_start date, p_date_end date, p_order integer DEFAULT 1)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/build_opening_period_json`
- **object types served:** **all object types**
- _5) Read path: emit the period type code (+ all_years) so the editor round-trips._

### `api.can_delete_object_private_note(p_note_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_delete_object_private_note`
- **object types served:** **all object types**
- _Suppression : réservée au rang admin le plus élevé de l'ORG (org_admin) ou au superuser plateforme._

### `api.can_manage_object_private_note(p_note_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_manage_object_private_note`
- **object types served:** **all object types**
- _Auteur, supérieur hiérarchique direct dans la même ORG, ou superuser plateforme._

### `api.can_read_extended(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_read_extended`
- **object types served:** —
- _Boolean per-row predicate kept as the single gate used by api.can_read_object -> the ~40_

### `api.can_read_object(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_read_object`
- **object types served:** **all object types**
- _1) Single source of truth for "is this object's data readable by the current caller"._

### `api.can_read_object_private_notes(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_read_object_private_notes`
- **object types served:** —
- _Retourne TRUE si l'utilisateur courant peut consulter les notes privées_

### `api.can_write_object_private_notes(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_write_object_private_notes`
- **object types served:** —
- _Retourne TRUE si l'utilisateur courant peut écrire une note privée_

### `api.capture_metric_snapshots(p_date date DEFAULT CURRENT_DATE)` _(DEFINER)_
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/capture_metric_snapshots`
- **object types served:** **all object types**
- _Brique 2: fige le panel de KPIs dashboard pour p_date dans metric_snapshot (upsert idempotent)._

### `api.check_membership_org_type()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Trigger : garantit que org_object_id pointe vers un objet de type 'ORG'._

### `api.check_object_legal_compliance(p_object_id text)`
- **returns:** `TABLE(type_code text, type_name text, is_required boolean, has_record boolean, is_valid boolean, status text, valid_to date, days_until_expiry integer)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/check_object_legal_compliance`
- **object types served:** **all object types**
- _Function to check if an object has all required legal records_

### `api.check_org_config_org_type()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Trigger : garantit que org_object_id pointe vers un objet de type 'ORG'._

### `api.check_org_permission_org_type()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Trigger : garantit que org_object_id pointe vers un objet de type 'ORG'._

### `api.commit_staging_to_public(p_batch_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/commit_staging_to_public`
- **object types served:** **all object types**

### `api.compose_object_resource_blocks(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/compose_object_resource_blocks`
- **object types served:** —

### `api.create_crm_artifacts_from_incident()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.create_membership_campaign(p_anchor_object_id text, p_name text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/create_membership_campaign`
- **object types served:** —

### `api.create_membership_tier(p_anchor_object_id text, p_name text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/create_membership_tier`
- **object types served:** —

### `api.create_tag(p_anchor_object_id text, p_name text, p_color text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/create_tag`
- **object types served:** —
- _§09: dedup-guarded GLOBAL tag creation. Gated per-object. Dedup on ref_tag.name_normalized; slug inline; gen_random_uuid; created_by set. Color is a HEX #rrggbb (global per tag); defaults to #64748b._

### `api.current_user_active_org()` _(DEFINER)_
- **returns:** `TABLE(org_id text, org_name text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_active_org`
- **object types served:** **all object types**
- _Retourne l'ORG active de l'utilisateur courant (id + nom), pour le libellé_

### `api.current_user_admin_rank()` _(DEFINER)_
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_admin_rank`
- **object types served:** **all object types**
- _Retourne le rang admin actif du user courant dans son ORG active (NULL si aucun)._

### `api.current_user_admin_role_code()` _(DEFINER)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_admin_role_code`
- **object types served:** **all object types**
- _Retourne le code du rôle admin actif du user courant (NULL si pas de rôle admin)._

### `api.current_user_business_role_code()` _(DEFINER)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_business_role_code`
- **object types served:** **all object types**
- _Retourne le code du rôle métier actif du user courant (NULL si aucun)._

### `api.current_user_can_edit_objects()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_can_edit_objects`
- **object types served:** —
- _Capability check : "le user courant peut-il éditer des objets ?"_

### `api.current_user_crm_actor_ids()` _(DEFINER)_
- **returns:** `SETOF uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_crm_actor_ids`
- **object types served:** **all object types**
- _Acteurs du périmètre CRM : liés (actor_object_role) à un objet du périmètre publisher,_

### `api.current_user_crm_object_ids()` _(DEFINER)_
- **returns:** `SETOF text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_crm_object_ids`
- **object types served:** **all object types**
- _7. Helpers d'autorisation (style current_user_extended_object_ids, §35)_

### `api.current_user_email()`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_email`
- **object types served:** —
- _Email courant (JWT claims)_

### `api.current_user_extended_object_ids()` _(DEFINER)_
- **returns:** `SETOF text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_extended_object_ids`
- **object types served:** **all object types**
- _Set form of api.can_read_extended: the current user's extended-readable object ids, computed once (RLS-bypassed). Used by the object SELECT policy as a hashed-set membership test to avoid per-row predicate evaluation. Keep byte-equivalent to can_read_extended's 4 paths._

### `api.current_user_is_org_admin()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_is_org_admin`
- **object types served:** —
- _1. Admin-gate helper — single source for the §22 front gate (mirrors the write gate exactly)._

### `api.current_user_org_id()` _(DEFINER)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_org_id`
- **object types served:** **all object types**
- _Retourne l'org_object_id actif du user courant (NULL si aucun membership actif)._

### `api.current_user_readable_object_ids()` _(DEFINER)_
- **returns:** `SETOF text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_readable_object_ids`
- **object types served:** **all object types**
- _1) "Objects visible to me" = published ∪ my extended scope. Single source of truth for the_

### `api.cursor_pack(p jsonb)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/cursor_pack`
- **object types served:** —

### `api.cursor_unpack(p text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/cursor_unpack`
- **object types served:** —

### `api.delete_actor_channel(p_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/delete_actor_channel`
- **object types served:** —
- _Suppression d'un canal (gate par l'acteur de la ligne, mêmes erreurs P0002/42501)._

### `api.delete_ai_provider(p_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/delete_ai_provider`
- **object types served:** —

### `api.delete_crm_interaction(p_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/delete_crm_interaction`
- **object types served:** **all object types**
- _Suppression d'une interaction (même gate d'écriture ; arme objet si contexte, sinon arme_

### `api.deliver_legal_document(p_legal_id uuid, p_document_id uuid, p_delivered_at timestamp with time zone DEFAULT now(), p_new_status text DEFAULT 'active'::text)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/deliver_legal_document`
- **object types served:** **all object types**
- _Function to mark a document as delivered_

### `api.disable_cache_triggers()` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/disable_cache_triggers`
- **object types served:** —

### `api.enable_cache_triggers()` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/enable_cache_triggers`
- **object types served:** —

### `api.enforce_actor_channel_email_shape()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.enforce_app_user_profile_role_change()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.enforce_contact_email_shape()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Email shape enforcement (object + actor)_

### `api.enforce_single_active_org_membership()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Trigger : contrainte "1 user tourism_agent = 1 ORG active"._

### `api.export_itineraries_gpx_batch(p_object_ids text[], p_include_stages boolean DEFAULT true)`
- **returns:** `TABLE(object_id text, name text, gpx_data text, file_size integer)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/export_itineraries_gpx_batch`
- **object types served:** **all object types**
- _Batch GPX export for multiple itineraries_

### `api.export_itinerary_gpx(p_object_id text, p_include_stages boolean DEFAULT true, p_include_metadata boolean DEFAULT true)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/export_itinerary_gpx`
- **object types served:** **all object types**
- _Export full GPX with metadata and stages_

### `api.export_publication_indesign(p_publication_id uuid, p_min_width integer DEFAULT 1600, p_min_height integer DEFAULT 1200)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/export_publication_indesign`
- **object types served:** **all object types**
- _Publication export for print workflows (InDesign-ready)_

### `api.facet_applicability_violations()` _(dyn-SQL)_
- **returns:** `TABLE(facet_table text, object_id text, object_type object_type)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/facet_applicability_violations`
- **object types served:** **all object types**
- _6. Violations report (ops/CI; legacy rows are NOT auto-deleted)_

### `api.generate_legal_expiry_notifications(p_days_ahead integer DEFAULT 30, p_object_types text[] DEFAULT NULL::text[])`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/generate_legal_expiry_notifications`
- **object types served:** **all object types**
- _Function to generate legal expiry notifications_

### `api.generate_object_id(p_object_type text, p_region_code text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/generate_object_id`
- **object types served:** —
- _generate_object_id (HOTAQU000V5014ZU-like)_

### `api.get_active_ai_provider_secret()` _(DEFINER)_
- **returns:** `TABLE(id uuid, label text, api_kind text, base_url text, model text, max_output_tokens integer, extra jsonb, api_key text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_active_ai_provider_secret`
- **object types served:** —

### `api.get_actor_data(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_actor_data`
- **object types served:** **all object types**
- _Helper: Get enriched actor data with contacts_

### `api.get_all_opening_time_slots(p_period_id uuid)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_all_opening_time_slots`
- **object types served:** —
- _Optimized function to get all opening time slots for a period_

### `api.get_app_branding()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_app_branding`
- **object types served:** —
- _Returns the full branding payload used by the authenticated SPA, including marker styles._

### `api.get_dashboard_actualisation(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date, p_threshold_days integer DEFAULT 90)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_actualisation`
- **object types served:** **all object types**
- _Dashboard §10: per-type freshness breakdown against a configurable threshold._

### `api.get_dashboard_city_distribution(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date, p_limit integer DEFAULT 20)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_city_distribution`
- **object types served:** **all object types**
- _Dashboard §2b: top cities by object count within the filtered pool._

### `api.get_dashboard_city_options()` _(DEFINER)_
- **returns:** `text[]`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_city_options`
- **object types served:** **all object types**
- _Returns a sorted TEXT[] of distinct cities present in object_location_

### `api.get_dashboard_completeness(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date, p_below_limit integer DEFAULT 10)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_completeness`
- **object types served:** **all object types**
- _§Qualité  Complétude « perçue visiteur » par type_

### `api.get_dashboard_distinction_overview(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_distinction_overview`
- **object types served:** **all object types**
- _Dashboard §5: overview of objects carrying at least one granted qualification,_

### `api.get_dashboard_filter_options()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_filter_options`
- **object types served:** **all object types**
- _Returns { cities: text[], lieu_dits: text[] } as jsonb — sorted, btrim-cleaned,_

### `api.get_dashboard_lieu_dit_options()` _(DEFINER)_
- **returns:** `text[]`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_lieu_dit_options`
- **object types served:** **all object types**
- _Returns a sorted TEXT[] of distinct lieux-dits (btrim-cleaned, non-null/non-empty)_

### `api.get_dashboard_scorecards(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_scorecards`
- **object types served:** **all object types**
- _Dashboard §1: hero scorecard aggregates for the filtered object pool._

### `api.get_dashboard_type_breakdown(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_updated_at_from date DEFAULT NULL::date, p_updated_at_to date DEFAULT NULL::date)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_type_breakdown`
- **object types served:** **all object types**
- _Dashboard §2a: object count broken down by object_type within the filtered pool._

### `api.get_expiring_legal_records(p_days_ahead integer DEFAULT 30, p_object_id text DEFAULT NULL::text, p_type_codes text[] DEFAULT NULL::text[])`
- **returns:** `TABLE(legal_id uuid, object_id text, object_name text, object_type text, legal_type_code text, legal_type_name text, value jsonb, valid_to date, days_until_expiry integer, status text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_expiring_legal_records`
- **object types served:** **all object types**
- _Function to get expiring legal records_

### `api.get_expiring_legal_records_api(p_days_ahead integer DEFAULT 30, p_object_types text[] DEFAULT NULL::text[], p_legal_types text[] DEFAULT NULL::text[])`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_expiring_legal_records_api`
- **object types served:** **all object types**
- _Function to get expiring legal records in API format_

### `api.get_filtered_object_ids(p_filters jsonb, p_types object_type[], p_status object_status[], p_search text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `TABLE(object_id text, label_rank integer, label_match jsonb, relevance real)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_filtered_object_ids`
- **object types served:** **all object types**

### `api.get_ingestor_metrics()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_ingestor_metrics`
- **object types served:** —

### `api.get_ingestor_scheduler_health()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_ingestor_scheduler_health`
- **object types served:** —

### `api.get_itinerary_track_geojson(p_object_id text, p_simplify boolean DEFAULT false, p_tolerance double precision DEFAULT 0.0001)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_itinerary_track_geojson`
- **object types served:** `ITI`
- _Get track with stages as GeoJSON FeatureCollection_

### `api.get_itinerary_track_simplified(p_object_id text, p_tolerance double precision DEFAULT 0.0001)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_itinerary_track_simplified`
- **object types served:** `ITI`
- _Simplified track for map display (lightweight GeoJSON)_

### `api.get_local_now_for_timezone(p_business_timezone text)`
- **returns:** `TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_local_now_for_timezone`
- **object types served:** —

### `api.get_media_for_web(p_object_id text, p_preferred_tags text[] DEFAULT ARRAY['facade'::text, 'interieur'::text, 'cuisine'::text, 'paysage'::text], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_media_for_web`
- **object types served:** **all object types**
- _Get filtered media for web display (excludes internal/sensitive)_

### `api.get_metric_snapshot_series(p_metric_key text, p_scope text DEFAULT 'global'::text, p_scope_key text DEFAULT ''::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_grain text DEFAULT 'month'::text)` _(DEFINER)_
- **returns:** `TABLE(bucket date, value numeric, denominator integer)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_metric_snapshot_series`
- **object types served:** —

### `api.get_metric_snapshot_yoy(p_metric_key text, p_scope text DEFAULT 'global'::text, p_scope_key text DEFAULT ''::text, p_years integer DEFAULT 3)` _(DEFINER)_
- **returns:** `TABLE(yr integer, mon integer, value numeric)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_metric_snapshot_yoy`
- **object types served:** —

### `api.get_object_amenity_codes_compact(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_amenity_codes_compact`
- **object types served:** **all object types**
- _Compact amenity code array for cards, maps and LCP/list payloads. Uses canonical cached_amenity_codes, never legacy wheelchair_access._

### `api.get_object_badges_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_badges_compact`
- **object types served:** **all object types**
- _Compact badges from official classifications, sustainability actions and canonical acc_* accessibility amenities._

### `api.get_object_card(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_card`
- **object types served:** **all object types**
- _Lightweight card read model (single + batch)_

### `api.get_object_cards_adapted_batch(p_ids text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_cards_adapted_batch`
- **object types served:** —
- _Batch wrapper for get_object_resource_adapted. Returns adapted/FALC resources for multiple objects, preserving input order._

### `api.get_object_cards_batch(p_ids text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text])` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_cards_batch`
- **object types served:** **all object types**
- _2) cards_batch -> SECURITY DEFINER + authorize-once. Body is byte-identical to the step-5_

### `api.get_object_environment_tags_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_environment_tags_compact`
- **object types served:** **all object types**
- _Compact environment tag payload for cards, maps and LCP/list payloads._

### `api.get_object_legal_compliance(p_object_id text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_legal_compliance`
- **object types served:** **all object types**
- _Function to get legal compliance in API format_

### `api.get_object_legal_data(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_legal_data`
- **object types served:** **all object types**
- _Function to get legal data in API format_

### `api.get_object_legal_records(p_object_id text)`
- **returns:** `TABLE(legal_id uuid, type_code text, type_name text, type_category text, type_is_public boolean, value jsonb, document_id uuid, valid_from date, valid_to date, validity_mode text, status text, document_requested_at timestamp with time zone, document_delivered_at timestamp with time zone, note text, days_until_expiry integer)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_legal_records`
- **object types served:** **all object types**
- _Function to get all legal records for an object_

### `api.get_object_legal_records_by_visibility(p_object_id text, p_is_public boolean DEFAULT NULL::boolean)`
- **returns:** `TABLE(legal_id uuid, type_code text, type_name text, type_category text, type_is_public boolean, value jsonb, document_id uuid, valid_from date, valid_to date, validity_mode text, status text, document_requested_at timestamp with time zone, document_delivered_at timestamp with time zone, note text, days_until_expiry integer)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_legal_records_by_visibility`
- **object types served:** **all object types**
- _Function to get legal records filtered by visibility_

### `api.get_object_local_now(p_object_id text)`
- **returns:** `TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_local_now`
- **object types served:** **all object types**

### `api.get_object_map_item(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_map_item`
- **object types served:** **all object types**
- _Lightweight map view API - returns minimal object data_

### `api.get_object_private_legal_records(p_object_id text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_private_legal_records`
- **object types served:** **all object types**
- _Function to get private legal records only (for parent org)_

### `api.get_object_public_legal_records(p_object_id text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_public_legal_records`
- **object types served:** **all object types**
- _Function to get public legal records only_

### `api.get_object_resource(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_track_format text DEFAULT 'none'::text, p_options jsonb DEFAULT '{}'::jsonb)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_resource`
- **object types served:** **all object types**
- _Migration: Markdown D2 -- sub-place description (object_place_description)_

### `api.get_object_resource_adapted(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_resource_adapted`
- **object types served:** **all object types**
- _FALC/Accessibility-friendly resource read model. Returns a simplified JSON with_

### `api.get_object_resources_batch(p_ids text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_track_format text DEFAULT 'none'::text, p_options jsonb DEFAULT '{}'::jsonb)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_resources_batch`
- **object types served:** —
- _Batch wrapper for get_object_resource (performance optimization)_

### `api.get_object_reviews(p_object_id text, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_reviews`
- **object types served:** **all object types**
- _Get object reviews with aggregates (external imports)_

### `api.get_object_room_types(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_room_types`
- **object types served:** **all object types**
- _Get room types for accommodations_

### `api.get_object_tags_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_tags_compact`
- **object types served:** —
- _Compact object tag payload for cards, maps and LCP/list payloads. Ordered by tag_link.position (§09 per-object priority)._

### `api.get_object_taxonomy_compact(p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_taxonomy_compact`
- **object types served:** **all object types**
- _Compact taxonomy payload for cards, maps and other LCP/list payloads._

### `api.get_object_version_snapshot(p_object_id text, p_version_number integer)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_version_snapshot`
- **object types served:** **all object types**
- _(2) Single-version snapshot (the full data jsonb) for the detailed diff._

### `api.get_object_versions(p_object_id text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)` _(DEFINER)_
- **returns:** `TABLE(version_number integer, created_at timestamp with time zone, created_by_name text, change_type text, change_reason text, changed_fields text[])`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_versions`
- **object types served:** **all object types**
- _(1) Timeline + per-version changed_fields. The cache/meta ignore-list is the SAME set_

### `api.get_object_with_deep_data(p_object_id text, p_languages text[] DEFAULT ARRAY['fr'::text], p_options jsonb DEFAULT '{}'::jsonb)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_with_deep_data`
- **object types served:** —

### `api.get_objects_by_type_with_deep_data(p_object_type text, p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_objects_by_type_with_deep_data`
- **object types served:** **all object types**
- _Enhanced API function: Get objects by type with deep data_

### `api.get_objects_with_deep_data(p_object_ids text[], p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_objects_with_deep_data`
- **object types served:** **all object types**
- _Enhanced API function: Get multiple objects with deep data_

### `api.get_opening_slots_by_day(p_period_id uuid)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_opening_slots_by_day`
- **object types served:** —
- _Optimized: get ALL opening time frames per weekday as arrays (unbounded)_

### `api.get_opening_time_slots(p_period_id uuid, p_weekday_code text, p_slot_number integer DEFAULT 1)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_opening_time_slots`
- **object types served:** —
- _Helper function to extract opening time slots for a specific day (legacy)_

### `api.get_organization_data(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_organization_data`
- **object types served:** **all object types**
- _Helper: Get enriched organization data_

### `api.get_parent_object_data(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_parent_object_data`
- **object types served:** **all object types**
- _Helper: Get enriched parent object data_

### `api.get_pending_document_requests(p_object_id text DEFAULT NULL::text, p_type_codes text[] DEFAULT NULL::text[])`
- **returns:** `TABLE(legal_id uuid, object_id text, object_name text, object_type text, legal_type_code text, legal_type_name text, value jsonb, document_requested_at timestamp with time zone, days_since_requested integer, note text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_pending_document_requests`
- **object types served:** **all object types**
- _Function to get pending document requests_

### `api.get_pending_document_requests_api(p_object_id text DEFAULT NULL::text, p_type_codes text[] DEFAULT NULL::text[])`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_pending_document_requests_api`
- **object types served:** —
- _Function to get pending document requests in API format_

### `api.get_public_branding()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_public_branding`
- **object types served:** —
- _Returns public-safe brand settings for anonymous contexts such as the login page._

### `api.guard_object_status_change()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _8) Status guard: status changes require publish_object (rpc_publish_object), not edit_canonical._

### `api.handle_auth_user_profile_created()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.handle_membership_status_transition()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.i18n_get_text(p_target_table text, p_target_pk text, p_target_column text, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/i18n_get_text`
- **object types served:** —
- _I18N Helper: Get translation from EAV i18n_translation table with fallback_

### `api.i18n_get_text_strict(p_target_table text, p_target_pk text, p_target_column text, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/i18n_get_text_strict`
- **object types served:** —
- _I18N Helper (strict): EAV i18n without "any language" fallback_

### `api.i18n_pick(p_i18n_data jsonb, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/i18n_pick`
- **object types served:** —
- _I18N Helper: Pick translation from JSONB with fallback_

### `api.i18n_pick_strict(p_i18n_data jsonb, p_lang_code text DEFAULT 'fr'::text, p_fallback_lang text DEFAULT 'fr'::text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/i18n_pick_strict`
- **object types served:** —
- _I18N Helper (strict): Pick translation from JSONB without "any language" fallback_

### `api.is_object_open_now(p_object_id text)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_object_open_now`
- **object types served:** **all object types**

### `api.is_object_owner(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_object_owner`
- **object types served:** **all object types**
- _Vérifie si l'utilisateur est propriétaire (owner) de l'objet_

### `api.is_opening_period_active_on_date(p_all_years boolean, p_date_start date, p_date_end date, p_local_date date)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_opening_period_active_on_date`
- **object types served:** —
- _Batch refresh cached_is_open_now for all objects._

### `api.is_opening_period_active_today(p_all_years boolean, p_date_start date, p_date_end date)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_opening_period_active_today`
- **object types served:** —

### `api.is_platform_admin()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_platform_admin`
- **object types served:** —
- _Returns true when the current user can manage platform-level branding and UI theme settings, using app_user_profile or auth metadata._

### `api.is_platform_owner()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_platform_owner`
- **object types served:** —
- _Vérifie si l'utilisateur courant est owner plateforme (ou admin/service)_

### `api.is_platform_superuser()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_platform_superuser`
- **object types served:** —
- _Helper : autorité plateforme (owner OU super_admin)_

### `api.is_ref_code_taxonomy_domain(p_domain text)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/is_ref_code_taxonomy_domain`
- **object types served:** —

### `api.json_clean(p jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/json_clean`
- **object types served:** —
- _Clean JSON by removing newlines and extra whitespace_

### `api.jsonb_pick_keys(p_payload jsonb, p_keys text[])`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/jsonb_pick_keys`
- **object types served:** —
- _Object resource block helpers (decomposition layer)_

### `api.jsonb_prune_empty_top(p jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/jsonb_prune_empty_top`
- **object types served:** —
- _JSON Helper: Prune empty top-level keys (arrays/objects)_

### `api.link_actor_to_object(p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/link_actor_to_object`
- **object types served:** **all object types**
- _Affecter un établissement à un acteur EXISTANT (demande PO 2026-06-14). Symétrique de la_

### `api.list_actor_crm(p_actor_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_actor_crm`
- **object types served:** **all object types**
- _Fiche acteur (navigation acteur → objets → interactions tous contextes) : identité, objets_

### `api.list_ai_providers()` _(DEFINER)_
- **returns:** `TABLE(id uuid, label text, api_kind text, base_url text, model text, max_output_tokens integer, is_active boolean, extra jsonb, has_key boolean, created_at timestamp with time zone, updated_at timestamp with time zone)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_ai_providers`
- **object types served:** —

### `api.list_crm_assignees()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_assignees`
- **object types served:** **all object types**
- _Assignataires possibles d'une tâche (demande PO 2026-06-12) : membres ACTIFS DISTINCTS des_

### `api.list_crm_directory(p_topic_code text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_directory`
- **object types served:** **all object types**

### `api.list_crm_tasks()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_tasks`
- **object types served:** **all object types**
- _Tâches CRM du périmètre (échéance croissante, NULLS LAST)._

### `api.list_crm_timeline(p_object_id text DEFAULT NULL::text, p_topic_code text DEFAULT NULL::text, p_interaction_type text DEFAULT NULL::text, p_sentiment_code text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_timeline`
- **object types served:** **all object types**

### `api.list_object_contact_suggestions(p_object_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_contact_suggestions`
- **object types served:** **all object types**
- _Suggestions de contacts pour l'authoring d'un acteur (demande PO 2026-06-12). Le caller_

### `api.list_object_crm(p_object_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_crm`
- **object types served:** **all object types**
- _Vue CRM d'un objet : interactions + tâches + répartition des sujets + acteurs liés_

### `api.list_object_resources_filtered_page(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_filtered_page`
- **object types served:** **all object types**

### `api.list_object_resources_filtered_since_fast(p_since timestamp with time zone, p_cursor text DEFAULT NULL::text, p_use_source boolean DEFAULT false, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_filtered_since_fast`
- **object types served:** **all object types**

### `api.list_object_resources_page(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_omit_empty boolean DEFAULT NULL::boolean, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_page`
- **object types served:** **all object types**

### `api.list_object_resources_page_text(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_types text[] DEFAULT NULL::text[], p_status text[] DEFAULT ARRAY['published'::text], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_omit_empty boolean DEFAULT NULL::boolean, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_page_text`
- **object types served:** —

### `api.list_object_resources_since_fast(p_since timestamp with time zone, p_cursor text DEFAULT NULL::text, p_use_source boolean DEFAULT false, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 50, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_since_fast`
- **object types served:** **all object types**

### `api.list_object_resources_since_fast_text(p_since timestamp with time zone, p_cursor text DEFAULT NULL::text, p_use_source boolean DEFAULT false, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 50, p_types text[] DEFAULT NULL::text[], p_status text[] DEFAULT ARRAY['published'::text], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_since_fast_text`
- **object types served:** —

### `api.list_objects_map_view(p_types text[] DEFAULT NULL::text[], p_status text[] DEFAULT ARRAY['published'::text], p_filters jsonb DEFAULT '{}'::jsonb, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_objects_map_view`
- **object types served:** **all object types**

### `api.list_objects_with_validated_changes_since(p_since timestamp with time zone)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_objects_with_validated_changes_since`
- **object types served:** **all object types**
- _Returns a JSON array of object IDs that have had validated modifications (approved or applied) since the specified date. Uses applied_at timestamp if available, otherwise reviewed_at._

### `api.list_ref_code_domains()`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_ref_code_domains`
- **object types served:** —
- _Phase 7.5 — domaines ref_code éditables (non structurels) + compteurs, pour le maître de l'éditeur de référentiels._

### `api.lock_object_private_description_system_fields()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Notes privées : les champs de portée et d'auteur restent immuables même si_

### `api.log_publication_proof_interaction()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.manage_object_published_at()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Mise à jour published_at_

### `api.norm_search(p text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/norm_search`
- **object types served:** —

### `api.object_private_note_author_admin_rank(p_note_id uuid)` _(DEFINER)_
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/object_private_note_author_admin_rank`
- **object types served:** **all object types**
- _Retourne le rang admin de l'auteur de la note dans l'ORG de la note (NULL si aucun)._

### `api.opening_period_rank(p_is_closure boolean, p_all_years boolean, p_date_start date, p_date_end date)`
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/opening_period_rank`
- **object types served:** —
- _2) Rang de priorité (closure 4 > fixe 3 > cyclique 2 > base 1)._

### `api.opening_period_width(p_all_years boolean, p_date_start date, p_date_end date)`
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/opening_period_width`
- **object types served:** —
- _3) Largeur de fenêtre en "jours" (à rang égal, la plus étroite gagne)._

### `api.periods_partial_overlap(p_all_years boolean, a_s date, a_e date, b_s date, b_e date)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/periods_partial_overlap`
- **object types served:** —

### `api.pick_lang(p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/pick_lang`
- **object types served:** —

### `api.prevent_duplicate_actor_email()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Unicité email cross-actors_

### `api.purge_expired_staging_batches(p_limit integer DEFAULT 500)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/purge_expired_staging_batches`
- **object types served:** —

### `api.purge_staging_batch(p_batch_id text, p_force boolean DEFAULT false)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/purge_staging_batch`
- **object types served:** —

### `api.recompute_audit_session_score()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.ref_code_domain_is_editable(p_domain text)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/ref_code_domain_is_editable`
- **object types served:** —
- _Un domaine ref_code est-il éditable par l'admin (non structurel) ?_

### `api.refresh_object_filter_caches(p_object_id text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/refresh_object_filter_caches`
- **object types served:** **all object types**
- _Refresh denormalized filter caches used by hot-path filtered listing._

### `api.refresh_object_taxonomy_cache_for_domain(p_domain text)`
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/refresh_object_taxonomy_cache_for_domain`
- **object types served:** **all object types**

### `api.refresh_open_status()`
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/refresh_open_status`
- **object types served:** **all object types**
- _5) Moteur de statut : la période active la PLUS SPÉCIFIQUE gagne ; une fermeture active force fermé._

### `api.refresh_ref_code_taxonomy_closure(p_domain text)`
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/refresh_ref_code_taxonomy_closure`
- **object types served:** —

### `api.render_format_currency(p_amount numeric, p_currency text, p_locale text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/render_format_currency`
- **object types served:** —
- _Rendering helpers (currency, percent, dates, datetimes)_

### `api.render_format_date(p_date date, p_locale text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/render_format_date`
- **object types served:** —

### `api.render_format_date_range(p_start date, p_end date, p_locale text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/render_format_date_range`
- **object types served:** —

### `api.render_format_datetime_range(p_start timestamp with time zone, p_end timestamp with time zone, p_locale text, p_timezone text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/render_format_datetime_range`
- **object types served:** —

### `api.render_format_percent(p_percent numeric, p_locale text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/render_format_percent`
- **object types served:** —

### `api.render_format_time(p_time time without time zone, p_locale text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/render_format_time`
- **object types served:** —

### `api.request_legal_document(p_legal_id uuid, p_requested_at timestamp with time zone DEFAULT now())`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/request_legal_document`
- **object types served:** **all object types**
- _Function to request a document for a legal record_

### `api.resolve_staging_dependencies(p_batch_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resolve_staging_dependencies`
- **object types served:** —

### `api.resource_block_base(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_base`
- **object types served:** —

### `api.resource_block_contacts(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_contacts`
- **object types served:** —

### `api.resource_block_descriptions(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_descriptions`
- **object types served:** —

### `api.resource_block_itinerary(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_itinerary`
- **object types served:** —

### `api.resource_block_legal(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_legal`
- **object types served:** —

### `api.resource_block_location(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_location`
- **object types served:** —

### `api.resource_block_media(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_media`
- **object types served:** —

### `api.resource_block_misc(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_misc`
- **object types served:** —

### `api.resource_block_pricing(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_pricing`
- **object types served:** —

### `api.resource_block_render(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resource_block_render`
- **object types served:** —

### `api.retry_failed_media_downloads(p_limit integer DEFAULT 200)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/retry_failed_media_downloads`
- **object types served:** —

### `api.rollback_staging_batch_compensate(p_batch_id text, p_force boolean DEFAULT false)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rollback_staging_batch_compensate`
- **object types served:** **all object types**

### `api.rpc_create_object(p_object_type text, p_name text, p_region_code text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_create_object`
- **object types served:** **all object types**
- _F1. api.rpc_create_object(p_object_type, p_name, p_region_code)_

### `api.rpc_deactivate_membership(p_membership_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_deactivate_membership`
- **object types served:** **all object types**
- _rpc_deactivate_membership_

### `api.rpc_delete_object(p_object_id text, p_confirm_name text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** Next.js route — `POST /api/objects/delete` (wraps `api.rpc_delete_object`, runs as the caller)
- **object types served:** **all object types**
- _Suppression définitive d'une fiche (§108) : superuser-only, établissements, archived requis, confirmation par nom. Journalise dans object_deletion_log, supprime l'objet (CASCADE) + les ref_document orphelinés, et retourne les URLs Storage (media + documents) à supprimer côté serveur._

### `api.rpc_delete_object_external_id(p_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_delete_object_external_id`
- **object types served:** **all object types**
- _3. Delete one external identifier owned by the current user's ORG (admin-only, non-canonical)._

### `api.rpc_gdpr_erase_subject(p_subject_kind text, p_subject_id text, p_mode text DEFAULT 'anonymize'::text, p_reason text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** Next.js route — `POST /api/rgpd/erase` (wraps `api.rpc_gdpr_erase_subject`, runs as the caller)
- **object types served:** **all object types**
- _Effacement/anonymisation RGPD Art. 17 d'un sujet. Anonymise (défaut) ou supprime, rédige le journal d'audit, journalise dans gdpr_erasure_log, retourne les URLs Storage à supprimer. Gated superuser plateforme._

### `api.rpc_grant_org_permission(p_org_object_id text, p_permission_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_grant_org_permission`
- **object types served:** **all object types**
- _D1. rpc_grant_org_permission_

### `api.rpc_grant_user_permission(p_target_user_id uuid, p_permission_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_grant_user_permission`
- **object types served:** **all object types**
- _D3. rpc_grant_user_permission_

### `api.rpc_list_org_members(p_org_object_id text)` _(DEFINER)_
- **returns:** `TABLE(membership_id uuid, user_id uuid, email text, display_name text, is_active boolean, business_role_code text, admin_role_code text, permission_codes text[])`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_list_org_members`
- **object types served:** **all object types**

### `api.rpc_publish_object(p_object_id text, p_publish boolean DEFAULT true)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_publish_object`
- **object types served:** —
- _F2. api.rpc_publish_object(p_object_id, p_publish)_

### `api.rpc_reorder_ref_code(p_domain text, p_ids uuid[])` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_reorder_ref_code`
- **object types served:** —
- _RÉORDONNE : position = rang (1-based) dans le tableau d'ids fourni._

### `api.rpc_restore_object_version(p_object_id text, p_version_number integer)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_restore_object_version`
- **object types served:** **all object types**
- _(3) Restore: apply ONLY writable canonical columns from the snapshot. EXCLUDES id, current_version,_

### `api.rpc_revoke_admin_role(p_membership_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_revoke_admin_role`
- **object types served:** **all object types**
- _rpc_revoke_admin_role_

### `api.rpc_revoke_org_permission(p_org_object_id text, p_permission_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_revoke_org_permission`
- **object types served:** **all object types**
- _D2. rpc_revoke_org_permission_

### `api.rpc_revoke_user_permission(p_target_user_id uuid, p_permission_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_revoke_user_permission`
- **object types served:** **all object types**
- _D4. rpc_revoke_user_permission_

### `api.rpc_set_admin_role(p_membership_id uuid, p_role_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_set_admin_role`
- **object types served:** **all object types**
- _rpc_set_admin_role_

### `api.rpc_set_business_role(p_membership_id uuid, p_role_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_set_business_role`
- **object types served:** **all object types**
- _rpc_set_business_role_

### `api.rpc_set_object_status(p_object_id text, p_status text)` _(DEFINER)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_set_object_status`
- **object types served:** **all object types**

### `api.rpc_set_ref_code_active(p_id uuid, p_domain text, p_active boolean)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_set_ref_code_active`
- **object types served:** —
- _(DÉS)ACTIVE une valeur ref_code._

### `api.rpc_upsert_membership(p_target_user_id uuid, p_org_object_id text, p_business_role_code text)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_upsert_membership`
- **object types served:** **all object types**
- _rpc_upsert_membership_

### `api.rpc_upsert_object_external_id(p_object_id text, p_source_system text, p_external_id text, p_last_synced_at timestamp with time zone DEFAULT NULL::timestamp with time zone)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_upsert_object_external_id`
- **object types served:** **all object types**
- _2. Upsert one external identifier on the CURRENT USER'S ORG (server-derived org; admin-only;_

### `api.rpc_upsert_ref_code(p_domain text, p_name text, p_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_name_i18n jsonb DEFAULT NULL::jsonb, p_position integer DEFAULT NULL::integer)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_upsert_ref_code`
- **object types served:** —
- _CRÉE (p_id NULL) ou ÉDITE (p_id fourni) une valeur ref_code d'un domaine éditable._

### `api.rpc_write_org_description(p_object_id text, p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_write_org_description`
- **object types served:** **all object types**
- _Écrit/supprime la SURCOUCHE de description propre à l'ORG active de l'utilisateur._

### `api.run_staging_dedup(p_batch_id text, p_distance_meters integer DEFAULT 50, p_name_similarity real DEFAULT 0.45)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/run_staging_dedup`
- **object types served:** —

### `api.save_actor_channel(p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_actor_channel`
- **object types served:** —
- _Upsert canal de contact. INSERT : actor_id + kind_code + value requis ; UPDATE partiel_

### `api.save_crm_actor(p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_crm_actor`
- **object types served:** **all object types**
- _Upsert acteur. INSERT : display_name + object_id requis — l'acteur ENTRE dans le périmètre_

### `api.save_crm_interaction(p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_crm_interaction`
- **object types served:** **all object types**
- _Upsert interaction (id présent = UPDATE partiel ; topic/sentiment par code, clé présente_

### `api.save_crm_task(p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_crm_task`
- **object types served:** **all object types**
- _Upsert tâche (id présent = UPDATE partiel « clé présente ⇒ écrite », sinon INSERT)._

### `api.save_object_commercial(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_commercial`
- **object types served:** **all object types**

### `api.save_object_itinerary_nested(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_itinerary_nested`
- **object types served:** **all object types**

### `api.save_object_openings(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_openings`
- **object types served:** **all object types**
- _4) Write path: resolve period_type_code -> id and persist it (mirrors schedule_type)._

### `api.save_object_places(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_places`
- **object types served:** **all object types**

### `api.save_object_relations(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_relations`
- **object types served:** **all object types**
- _⚠ BODY SYNC: this function body must stay byte-identical to the copy in migration_actor_links_editor.sql (8r re-applies it after this file on fresh installs). Edit BOTH or fresh ≠ live._

### `api.save_object_workspace_sustainability(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_workspace_sustainability`
- **object types served:** **all object types**

### `api.save_object_workspace_tags(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_object_workspace_tags`
- **object types served:** —

### `api.search_actors(p_query text)` _(DEFINER)_
- **returns:** `TABLE(id uuid, display_name text, first_name text, last_name text, gender text, email text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_actors`
- **object types served:** —

### `api.search_events_by_restaurant_cuisine(p_cuisine_types text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_events_by_restaurant_cuisine`
- **object types served:** **all object types**

### `api.search_objects_by_label(p_label_value_id uuid, p_include_partial boolean DEFAULT true, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_objects_by_label`
- **object types served:** **all object types**
- _Search objects by label with partial action matches_

### `api.search_objects_with_deep_data(p_search_term text, p_object_types text[] DEFAULT NULL::text[], p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_objects_with_deep_data`
- **object types served:** **all object types**
- _Enhanced API function: Search objects with deep data_

### `api.search_restaurants_by_cuisine(p_cuisine_types text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_restaurants_by_cuisine`
- **object types served:** **all object types**

### `api.set_active_ai_provider(p_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/set_active_ai_provider`
- **object types served:** —

### `api.set_itinerary_track(p_object_id text, p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/set_itinerary_track`
- **object types served:** `ITI`
- _§111 Section 06 ITI editor — ingest the imported GPX/KML trace (client-parsed_

### `api.set_publication_workflow_timestamps()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.set_tag_color(p_anchor_object_id text, p_tag_id uuid, p_color text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/set_tag_color`
- **object types served:** —
- _§09: set a tag's GLOBAL color (ref_tag.color, HEX #rrggbb), gated per-object. Color is global per tag (D3). SECURITY DEFINER._

### `api.strip_markdown(md text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/strip_markdown`
- **object types served:** —
- _Plain-text derivation for Markdown-canonical description columns (manifest 14w)._

### `api.sync_app_user_profile_from_auth_user(p_user_id uuid, p_email text, p_raw_user_meta_data jsonb DEFAULT '{}'::jsonb, p_raw_app_meta_data jsonb DEFAULT '{}'::jsonb)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/sync_app_user_profile_from_auth_user`
- **object types served:** —

### `api.sync_classification_from_audit_session()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.to_base36(n bigint)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/to_base36`
- **object types served:** —
- _to_base36_

### `api.trg_refresh_caches_from_menu_item_link()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** `RES`
- _For menu-item child link tables (dietary_tag / allergen / cuisine_type): resolve object_id via menu_item → menu._

### `api.trg_refresh_caches_from_object_menu_item()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** `RES`
- _§109 search_document sources not covered by the generic (object_id-direct) trigger above._

### `api.trg_refresh_caches_from_tag_link()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _tag_link is polymorphic; object_id is target_pk when target_table = 'object'._

### `api.trg_refresh_object_filter_caches_from_child()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.trg_refresh_ref_code_taxonomy_closure()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.update_legal_record(p_legal_id uuid, p_value jsonb DEFAULT NULL::jsonb, p_document_id uuid DEFAULT NULL::uuid, p_valid_from date DEFAULT NULL::date, p_valid_to date DEFAULT NULL::date, p_validity_mode legal_validity_mode DEFAULT NULL::legal_validity_mode, p_status text DEFAULT NULL::text, p_document_requested_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_document_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/update_legal_record`
- **object types served:** **all object types**
- _Function to update a legal record_

### `api.upsert_ai_provider(p_id uuid, p_label text, p_api_kind text, p_base_url text, p_model text, p_max_output_tokens integer, p_is_active boolean, p_extra jsonb DEFAULT '{}'::jsonb, p_api_key text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/upsert_ai_provider`
- **object types served:** —

### `api.upsert_app_branding(p_brand_name text DEFAULT NULL::text, p_logo_storage_path text DEFAULT NULL::text, p_logo_public_url text DEFAULT NULL::text, p_logo_mime_type text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_accent_color text DEFAULT NULL::text, p_text_color text DEFAULT NULL::text, p_background_color text DEFAULT NULL::text, p_surface_color text DEFAULT NULL::text, p_marker_styles jsonb DEFAULT NULL::jsonb, p_extra jsonb DEFAULT NULL::jsonb, p_clear_logo boolean DEFAULT false)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/upsert_app_branding`
- **object types served:** —
- _Creates or updates the global branding/theme settings used by the UI. Restricted to platform admins._

### `api.user_actor_ids()`
- **returns:** `SETOF uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_actor_ids`
- **object types served:** —
- _Acteurs liés à l'utilisateur via email dans actor_channel.kind='email'_

### `api.user_can_assign_crm(p_user uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_assign_crm`
- **object types served:** **all object types**
- _Assignabilité d'une tâche (demande PO 2026-06-12) : p_user est assignable ssi il partage_

### `api.user_can_create_object()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_create_object`
- **object types served:** —
- _Phase 5 — api.user_can_create_object()_

### `api.user_can_publish_object(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_publish_object`
- **object types served:** **all object types**
- _E2. api.user_can_publish_object(p_object_id text)_

### `api.user_can_read_crm(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_read_crm`
- **object types served:** —

### `api.user_can_read_crm_actor(p_actor_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_read_crm_actor`
- **object types served:** —

### `api.user_can_write_canonical(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_canonical`
- **object types served:** **all object types**
- _E3. api.user_can_write_canonical(p_object_id text)_

### `api.user_can_write_crm(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_crm`
- **object types served:** —
- _Écriture : superuser OU (membre ORG publisher ET (permission write_crm_notes OU rôle_

### `api.user_can_write_crm_actor(p_actor_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_crm_actor`
- **object types served:** —
- _Écriture ancrée acteur : mêmes ingrédients que user_can_write_crm (périmètre + permission_

### `api.user_can_write_enrichment(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_enrichment`
- **object types served:** **all object types**
- _E4. api.user_can_write_enrichment(p_object_id text)_

### `api.user_can_write_object_canonical(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_object_canonical`
- **object types served:** —
- _1) Single source of truth for canonical-write authorization (additive OR)._

### `api.user_has_permission(p_permission_code text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_has_permission`
- **object types served:** **all object types**
- _B. Helper : api.user_has_permission(p_permission_code text)_

### `api.validate_audit_result_points()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.validate_object_business_timezone()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.validate_object_taxonomy_assignment()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.validate_promotion_code(p_code text, p_object_id text DEFAULT NULL::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/validate_promotion_code`
- **object types served:** **all object types**
- _Validate promotion code for an object_

### `api.validate_ref_code_taxonomy_hierarchy()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.watchdog_mark_stale_batches(p_stale_minutes integer DEFAULT 30, p_limit integer DEFAULT 200)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/watchdog_mark_stale_batches`
- **object types served:** —

## schema `audit`

### `audit.attach_missing_triggers()` _(DEFINER, dyn-SQL)_
- **returns:** `void`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —
- _Attach audit triggers (invoked at end of script to include late-created tables)._

### `audit.create_monthly_partition(partition_date timestamp with time zone)` _(dyn-SQL)_
- **returns:** `text`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —

### `audit.drop_old_partitions(months_to_keep integer DEFAULT 12)` _(dyn-SQL)_
- **returns:** `text`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —

### `audit.ensure_future_partitions(months_ahead integer DEFAULT 3)`
- **returns:** `text`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —

### `audit.get_month_partition_name(partition_date timestamp with time zone)`
- **returns:** `text`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —

### `audit.log_row_changes()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `audit.maintain_partitions()`
- **returns:** `text`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —

### `audit.redact_subject(p_table text, p_match_key text, p_match_val text, p_pii_cols text[])` _(DEFINER)_
- **returns:** `integer`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —
- _Rédaction ciblée du journal d'audit : retire les clés PII d'un sujet (row_pk OU before_data->>key,_

## schema `internal`

### `internal.workspace_assert_can_write_object(p_object_id text)` _(DEFINER)_
- **returns:** `void`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** **all object types**
- _2) Workspace gate (was: is_object_owner only)._

### `internal.workspace_jsonb_array(p_value jsonb)`
- **returns:** `jsonb`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.workspace_jsonb_object(p_value jsonb)`
- **returns:** `jsonb`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.workspace_result(p_success boolean DEFAULT true, p_changed_counts jsonb DEFAULT '{}'::jsonb, p_skipped_fields text[] DEFAULT ARRAY[]::text[], p_warnings text[] DEFAULT ARRAY[]::text[])`
- **returns:** `jsonb`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.workspace_uuid(p_value text)`
- **returns:** `uuid`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

## schema `public`

### `public.create_object_version_monthly_partition(partition_date timestamp with time zone)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/create_object_version_monthly_partition` (public schema, if exposed) / SQL-callable
- **object types served:** —

### `public.enforce_classification_single_selection()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.enforce_single_main_media()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.immutable_unaccent(text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/immutable_unaccent` (public schema, if exposed) / SQL-callable
- **object types served:** —
- _immutable_unaccent_

### `public.increment_object_version()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.pending_change_after_delete()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.pending_change_after_insert()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.pending_change_after_update()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.propagate_capacity_unit_change()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.ref_language_set_position()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.regenerate_iti_track_cache()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.save_object_version()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.sync_object_capacity_unit()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.update_object_cached_main_image()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.update_object_cached_min_price()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.update_object_cached_rating_metrics()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.update_object_updated_at_business()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.update_updated_at_column()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.validate_i18n_translation_target()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.validate_media_dimensions()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `public.validate_org_object_type()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
