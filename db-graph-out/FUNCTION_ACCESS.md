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

### `api.approve_pending_change(p_id uuid, p_review_note text DEFAULT NULL::text)` _(DEFINER, dyn-SQL)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/approve_pending_change`
- **object types served:** **all object types**
- _P2.1 §120 — Approuve : re-dispatch vers le writer structuré (metadata->>'rpc', whitelisté) puis status=applied._

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

### `api.can_read_actor_contacts(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/can_read_actor_contacts`
- **object types served:** —
- _SOURCE AUTORITAIRE (§208) de la règle « qui voit les coordonnées complètes d'un acteur » : superuser plateforme (lu dans app_user_profile.role — délibérément PAS api.is_platform_superuser(), dont le premier bras dirait TRUE à une clé service_role) OU membre d'une ORG publisher de la fiche (api.current_user_crm_object_ids). FALSE hors contexte HTTP et en service-role (auth.uid() NULL) : un export de PII est imputable à une personne. Forme PAR FICHE, appelée par api.export_actor_capabilities et par l'éditeur. DEUX autres formulations existent (tâche 7, 2026-08-08, mise à jour depuis « UNE seule ») : la forme ensembliste du périmètre dans api.export_actor_contacts (duplication délibérée §204), et le bras superuser de la cascade prestataire→fiche de api.list_selection_emails (migration_selection_emails.sql, §211 plié au régime §208) — faire évoluer les TROIS ensemble._

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

### `api.check_org_branding_org_type()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Garde type ORG (miroir de api.check_org_config_org_type — table à part, message dédié)._

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

### `api.claim_unmailed_notifications(p_limit integer DEFAULT 20)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/claim_unmailed_notifications`
- **object types served:** **all object types**
- _Outbox e-mail (17i) : réclame les notifications crm_task_assigned non e-mailées (TTL 10 min, SKIP LOCKED) et retourne le contenu du message dérivé en DB. Appelée UNIQUEMENT par la route Next /api/crm/notify-drain en service_role._

### `api.commit_staging_to_public(p_batch_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/commit_staging_to_public`
- **object types served:** **all object types**

### `api.compose_object_resource_blocks(p_payload jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/compose_object_resource_blocks`
- **object types served:** —

### `api.configure_sandbox_discovery_user(p_user_id uuid DEFAULT NULL::uuid)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/configure_sandbox_discovery_user`
- **object types served:** **all object types**

### `api.create_crm_artifacts_from_incident()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _7.6  api.create_crm_artifacts_from_incident — corps schema_unified traduit_

### `api.create_list(p_kind text, p_name text, p_from_object_ids text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT NULL::jsonb, p_filters_url text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/create_list`
- **object types served:** **all object types**
- _Création d'une liste : superuser plateforme UNIQUEMENT (17l, arbitrage PO 2026-08-31). Le rang d'administration d'ORG ne suffit pas._

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

### `api.crm_user_label(p_user uuid, p_display_name text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/crm_user_label`
- **object types served:** —
- _Libellé affichable d'un utilisateur : display_name, à défaut « Utilisateur xxxxxxxx ». Source unique du repli — les sérialiseurs de tâche et de notification l'appellent tous._

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

### `api.current_user_can_manage_actor_portal()`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_can_manage_actor_portal`
- **object types served:** —
- _Permission dédiée au bloc CRM Accès portail. Superutilisateur plateforme ou permission explicite ; aucun rôle métier ne la reçoit par défaut. Les gardes CRM par acteur restent requises._

### `api.current_user_can_write_crm_notes()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_can_write_crm_notes`
- **object types served:** —
- _Sonde d'interface : l'utilisateur courant peut-il écrire des notes CRM ? Reproduit la garde de api.user_can_write_crm_actor (write_crm_notes OU rang admin d'ORG OU superuser) SANS son arme de périmètre. Source de vérité UNIQUE — le front ne doit jamais re-transcrire cette chaîne de OR. Chantier 2026-08-28, manifeste 17c._

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

### `api.current_user_test_realm()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/current_user_test_realm`
- **object types served:** **all object types**
- _Realm de lecture du user courant : true = bac a sable, false = production (jamais NULL). service_role et anon renvoient false — l'API partenaire ne voit donc jamais le corpus de test. Garde a double sens : o.is_test = (SELECT api.current_user_test_realm())._

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

### `api.delete_list(p_list_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/delete_list`
- **object types served:** **all object types**
- _6.6 Suppression_

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
- _Never trust raw_user_meta_data for authorization. A signed-in user may edit_

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

### `api.export_actor_capabilities(p_object_ids text[])` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/export_actor_capabilities`
- **object types served:** **all object types**
- _Préflight ERGONOMIQUE (§208 R2) de la modale d'export : deux booléens agrégés sur la sélection réelle — l'offre de colonnes acteur suit la consultation effective, pas un proxy « membre d'une ORG ». N'est JAMAIS une garde : api.export_actor_contacts refait tous les contrôles fiche par fiche et c'est lui seul qui journalise. Appelle api.can_read_actor_contacts (source autoritaire) plutôt que de la retranscrire ; chaque bras est intersecté avec le périmètre lisible de l'appelant (§36) — aucun oracle d'existence sur un id non lu. PLAFOND DUR de 500 ids après dédoublonnage (BATCH_TOO_LARGE, SQLSTATE 22023), identique à celui de api.export_actor_contacts : la garde appelée est SECURITY DEFINER donc non inlinable, et le pire cas (sélection intégralement refusée, le cas d'un appelant hostile) coûte 2 évaluations par id — le plafond est ce qui borne réellement ce fan-out, pas l'ordre des bras du OR._

### `api.export_actor_contacts(p_object_ids text[], p_reason text, p_format text DEFAULT 'xlsx'::text, p_export_run_id uuid DEFAULT NULL::uuid, p_batch_index integer DEFAULT 1, p_batch_count integer DEFAULT 1)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/export_actor_contacts`
- **object types served:** **all object types**
- _Export JOURNALISÉ des coordonnées d'acteur (§208), seule voie autorisée : autorise-une-fois (§36 — la liste d'ids du client n'est jamais de confiance, elle est réduite fiche par fiche au périmètre de l'appelant), finalité validée serveur (5–500 car.), format xlsx|csv, dédoublonnage serveur, plafond dur de 500 ids par appel, puis écriture d'une ligne dans public.actor_contact_export_log DANS LA MÊME TRANSACTION que la lecture. Sélection mixte : sert l'autorisé et NOMME le refusé (denied_object_ids) ; tout-refusé ⇒ FORBIDDEN (42501) et — limite assumée — aucune ligne de journal. Pas de GRANT à service_role : un export de PII est imputable à une personne. Le bras de périmètre est la forme ensembliste de api.can_read_actor_contacts (duplication délibérée §204) : faire évoluer les deux ensemble._

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
- **object types served:** **all object types**
- _Payload branding authentifié — résout la surcharge ORG selon le membership actif, champ par champ, fallback plateforme. markerStyles/extra plateforme. Clé orgObjectId = ORG résolue (NULL si aucun membership)._

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
- _Dashboard Qualité: remplissage « perçu visiteur » par type. Lit internal.v_object_essentials_

### `api.get_dashboard_crm_activity()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_crm_activity`
- **object types served:** **all object types**
- _Onglet Activité équipe §4 : arriéré CRM par âge et par sujet, flux mensuel, temps de_

### `api.get_dashboard_crm_open()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_crm_open`
- **object types served:** **all object types**
- _Dashboard §1 : compteur GLOBAL des éléments CRM ouverts pour la carte d'attention du bandeau._

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

### `api.get_dashboard_team_activity()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_dashboard_team_activity`
- **object types served:** **all object types**
- _Onglet Activité équipe §2 : rythme de saisie sur 12 semaines + table des contributeurs._

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
- _4) get_filtered_object_ids : les deux cles de remplissage_

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

### `api.get_list(p_list_id uuid)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_list`
- **object types served:** **all object types**
- _6.2 Détail d'une liste (compose)_

### `api.get_local_now_for_timezone(p_business_timezone text)`
- **returns:** `TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_local_now_for_timezone`
- **object types served:** —

### `api.get_local_time_for_timezone(p_business_timezone text, p_at timestamp with time zone)`
- **returns:** `TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_local_time_for_timezone`
- **object types served:** —
- _§157 — variante paramétrée du résolveur d'heure locale : même validation_

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

### `api.get_object_i18n_all(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_i18n_all`
- **object types served:** **all object types**
- _Partner i18n=all block (audit API C-5): object_description free-text family as {field:{lang:plain text}} (strip_markdown per language, public-visibility only, published-gated). service_role-only._

### `api.get_object_interop(p_object_id text, p_profile text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_interop`
- **object types served:** **all object types**
- _Partner interop serializer (audit API I4 §137): datatourisme (JSON-LD) / apidae / tourinsoft (bespoke JSON) document for a PUBLISHED object; @type/class from the nearest mapped taxonomy ancestor (closure depth ASC), then the object_type fallback in ref_interop_crosswalk (table-driven), core via api.interop_object_core (public-only). service_role-only; unmapped/unpublished/unknown-profile => NULL. Core-fields subset — validate field-level conformance against the target importer before production sync._

### `api.get_object_jsonld(p_object_id text, p_profile text DEFAULT 'jsonld'::text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_jsonld`
- **object types served:** **all object types**
- _Partner JSON-LD serializer (audit API I4): schema.org output for a PUBLISHED object, @type from ref_interop_crosswalk (table-driven), public-only contacts/media/web-channels, plain-text description (strip_markdown). service_role-only; unmapped/unpublished => NULL. §136._

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

### `api.get_object_workspace_permissions(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_object_workspace_permissions`
- **object types served:** —
- _Agrège en un appel les 9 sondes de permission de l'éditeur pour un objet, dont la permission juridique dédiée. SECURITY INVOKER volontairement ; chaque sonde échoue fermée et indépendamment._

### `api.get_objects_by_type_with_deep_data(p_object_type text, p_languages text[] DEFAULT ARRAY['fr'::text], p_include_media text DEFAULT 'none'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_objects_by_type_with_deep_data`
- **object types served:** **all object types**
- _Enhanced API function: Get objects by type with deep data_

### `api.get_objects_interop_batch(p_object_ids text[], p_profile text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_objects_interop_batch`
- **object types served:** **all object types**
- _Partner batch interop serializer (audit API I4 §153): {"<object_id>": <profile document>} for up to 200 PUBLISHED ids, wrapping get_object_jsonld (profile 'jsonld') / get_object_interop (datatourisme/apidae/tourinsoft). Unpublished/unknown/unmapped ids are absent. service_role-only. Measured 200 docs = 88 ms._

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

### `api.get_org_branding(p_org_object_id text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_org_branding`
- **object types served:** **all object types**
- _4) Lecture admin (éditeur de branding) : ligne brute (NULL = hérite) + payload résolu._

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
- _Returns public-safe brand settings for anonymous contexts such as the login page, including the runtime-driven institutional operator attribution (operatorName/territory/islandTagline from extra)._

### `api.get_public_list_by_token(p_token text)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_public_list_by_token`
- **object types served:** **all object types**
- _7. RPC PUBLIQUE (anon) : lecture par token_

### `api.get_public_trail(p_slug text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_public_trail`
- **object types served:** **all object types**

### `api.get_ref_catalog(p_catalog_key text)` _(DEFINER, dyn-SQL)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_ref_catalog`
- **object types served:** —

### `api.get_sandbox_discovery_user()` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_sandbox_discovery_user`
- **object types served:** **all object types**

### `api.get_trail(p_trail_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/get_trail`
- **object types served:** **all object types**

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

### `api.interop_object_core(p_object_id text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/interop_object_core`
- **object types served:** **all object types**
- _Shared interop core reader (audit API I4 §137): flat gated core of a PUBLISHED object (public-only) for the profile serializers._

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

### `api.list_actor_support(p_actor_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_actor_support`
- **object types served:** —

### `api.list_ai_providers()` _(DEFINER)_
- **returns:** `TABLE(id uuid, label text, api_kind text, base_url text, model text, max_output_tokens integer, is_active boolean, extra jsonb, has_key boolean, created_at timestamp with time zone, updated_at timestamp with time zone)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_ai_providers`
- **object types served:** —

### `api.list_catalog(p_domain text, p_lang text DEFAULT 'fr'::text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_catalog`
- **object types served:** —
- _Un référentiel public résolu i18n, forme {code,name,icon_url,parent_code,domain}. Audit API I1._

### `api.list_crm_assignees()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_assignees`
- **object types served:** **all object types**
- _Assignataires possibles d'une tâche (demande PO 2026-06-12) : membres ACTIFS DISTINCTS des_

### `api.list_crm_directory(p_topic_code text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_directory`
- **object types served:** **all object types**

### `api.list_crm_directory_linked(p_topic_code text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_directory_linked`
- **object types served:** **all object types**

### `api.list_crm_status_events(p_interaction_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_status_events`
- **object types served:** **all object types**
- _Journal des transitions de statut d'une demande CRM, ordonné du plus ancien au plus récent (manifeste 17g). Alimente l'encart « depuis quand » du sélecteur de statut. Périmètre §61 : la lisibilité du journal SUIT celle de son interaction (arme objet, à défaut arme acteur, à défaut la sonde d'écriture de notes). N'émet aucune coordonnée — seulement un libellé d'utilisateur via api.crm_user_label._

### `api.list_crm_tasks()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_tasks`
- **object types served:** **all object types**
- _7. LECTURES DE TÂCHE — clés `assignees[]`, `created_by_id`, `created_by_name`_

### `api.list_crm_timeline(p_object_id text DEFAULT NULL::text, p_topic_code text DEFAULT NULL::text, p_interaction_type text DEFAULT NULL::text, p_sentiment_code text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_crm_timeline`
- **object types served:** **all object types**
- _7.4  api.list_crm_timeline — corps 8z traduit : un filtre devient une FAMILLE_

### `api.list_deleted_objects_since(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 500)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_deleted_objects_since`
- **object types served:** —
- _Flux tombstone partenaire (§108/C-4) : suppressions définitives depuis object_deletion_log, projeté {object_id,type,deleted_at} (jamais report/performed_by/object_name). service_role-only._

### `api.list_effective_object_ids(p_list_id uuid, p_published_only boolean)` _(DEFINER)_
- **returns:** `TABLE(object_id text, pos integer, note_fr text, note_en text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_effective_object_ids`
- **object types served:** **all object types**
- _5. Membres effectifs d'une liste (statique OU dynamique)_

### `api.list_item_contacts(p_ids text[])` _(DEFINER)_
- **returns:** `TABLE(object_id text, contacts jsonb)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_item_contacts`
- **object types served:** **all object types**
- _5b. Contacts publics des items (téléphone / site web)_

### `api.list_my_lists()` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_my_lists`
- **object types served:** **all object types**
- _6.1 Grille « Mes listes »_

### `api.list_my_notifications(p_limit integer DEFAULT 50)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_my_notifications`
- **object types served:** **all object types**
- _Boîte de réception de l'appelant UNIQUEMENT (recipient_id = auth.uid(), jamais un paramètre). Renvoie {items[], unread_count}. Anon ⇒ boîte vide._

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

### `api.list_object_markers(p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_filters jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_markers`
- **object types served:** **all object types**
- _Explorer map markers: lightweight {id,type,name,image,open_now,location{lat,lon,city}} for ALL matching geolocated objects in one call. Authorize-once SECURITY DEFINER (§36): filtered set ∩ current_user_readable_object_ids() then object_location read RLS-free. Replaces the per-page card fetch as the map data source; avoids the per-row can_read_object scalar (§35) and per-row enrichment (cf. list_objects_map_view). See decision log §125._

### `api.list_object_resources_filtered_page(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_object_resources_filtered_page`
- **object types served:** **all object types**
- _5) list_object_resources_filtered_page : le champ sur les cartes_

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

### `api.list_partner_keys()` _(DEFINER)_
- **returns:** `TABLE(id uuid, label text, key_prefix text, scopes text[], is_active boolean, expires_at timestamp with time zone, revoked_at timestamp with time zone, last_used_at timestamp with time zone, created_at timestamp with time zone)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_partner_keys`
- **object types served:** —
- _Liste les clés (métadonnées seulement — JAMAIS le hash ni la clé)._

### `api.list_pending_changes(p_status text DEFAULT 'pending'::text, p_object_id text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)` _(DEFINER)_
- **returns:** `TABLE(id uuid, object_id text, object_name text, target_table text, target_pk text, action text, status text, field_label text, before_value text, after_value text, submitted_by uuid, submitter_label text, submitted_at timestamp with time zone, reviewed_by uuid, reviewer_label text, reviewed_at timestamp with time zone, review_note text, applied_at timestamp with time zone)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_pending_changes`
- **object types served:** **all object types**
- _P2.1 §120 — File de modération auto-autorisée (§36) : lignes des objets modérables par l'appelant uniquement._

### `api.list_public_trails(p_status_code text DEFAULT NULL::text, p_simplify boolean DEFAULT true, p_tolerance numeric DEFAULT 0.0001, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)` _(DEFINER)_
- **returns:** `TABLE(id uuid, slug text, name text, status_code text, status_label text, not_guaranteed boolean, manager_labels text[], source_label text, source_website text, last_update timestamp with time zone, length_m numeric, geom jsonb)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_public_trails`
- **object types served:** **all object types**

### `api.list_ref_catalogs()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_ref_catalogs`
- **object types served:** —

### `api.list_ref_code_domains()`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_ref_code_domains`
- **object types served:** —
- _Phase 7.5 — domaines ref_code éditables (non structurels) + compteurs, pour le maître de l'éditeur de référentiels._

### `api.list_reference_bundle(p_domains text[] DEFAULT NULL::text[], p_lang text DEFAULT 'fr'::text)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_reference_bundle`
- **object types served:** —
- _Plusieurs référentiels publics en un appel. p_domains NULL = tous. Audit API I1._

### `api.list_selection_emails(p_reason text, p_object_ids text[] DEFAULT NULL::text[], p_list_id uuid DEFAULT NULL::uuid)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_selection_emails`
- **object types served:** **all object types**
- _Export des e-mails d'une sélection Explorer (p_object_ids) OU d'une liste (p_list_id). Authorize-once SECURITY DEFINER : garde éditeur (§205) puis périmètre ORG publisher (= périmètre CRM — `readable` ne suffit pas pour une donnée partners). Cascade prestataire operator → fiche. Rend des lignes brutes ; dédoublonnage et formatage côté client. §211. RÉGIME §208 (tâche 7, 2026-08-08) : p_reason PREMIER paramètre, obligatoire (5–500 car., sinon PT400/REASON_REQUIRED) ; VOLATILE (écrit) ; journal public.actor_contact_export_log dans la MÊME transaction, UNIQUEMENT quand le bras acteur émet au moins une adresse (une sélection entièrement résolue par les adresses de fiche n'a rien à journaliser) ; AUCUNE valeur de coordonnée dans le journal ; bras superuser ALIGNÉ sur api.can_read_actor_contacts (jamais api.is_platform_superuser()) ; PAS de GRANT à service_role. Troisième formulation du périmètre « qui voit les coordonnées d'un acteur » (§208) — évolue avec api.can_read_actor_contacts et la forme ensembliste de api.export_actor_contacts._

### `api.list_trail_sync_runs(p_source_code text DEFAULT NULL::text, p_limit integer DEFAULT 20)` _(DEFINER)_
- **returns:** `TABLE(id uuid, source_code text, trigger text, dry_run boolean, status text, started_at timestamp with time zone, finished_at timestamp with time zone, http_status integer, error text, layer_last_edit_date timestamp with time zone, counts jsonb, report jsonb)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_trail_sync_runs`
- **object types served:** —

### `api.list_trails(p_status_code text DEFAULT NULL::text, p_presence text DEFAULT NULL::text, p_visibility text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)` _(DEFINER)_
- **returns:** `TABLE(id uuid, slug text, name text, origin text, visibility text, public_status_code text, public_status_flags jsonb, manager_codes text[], source_count integer, presence_summary jsonb, archived_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/list_trails`
- **object types served:** **all object types**

### `api.lock_object_private_description_system_fields()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Notes privées : les champs de portée et d'auteur restent immuables même si_

### `api.log_crm_interaction_status_event()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Trigger AFTER INSERT OR UPDATE OF status sur crm_interaction : écrit une ligne de crm_interaction_status_event par transition RÉELLE (un UPDATE qui ne touche pas au statut n'écrit rien). from_status NULL = création. Manifeste 17g._

### `api.log_publication_proof_interaction()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _7.7  api.log_publication_proof_interaction — corps schema_unified traduit_

### `api.manage_object_published_at()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Mise à jour published_at_

### `api.mark_all_notifications_read()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/mark_all_notifications_read`
- **object types served:** —

### `api.mark_list_sent(p_list_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/mark_list_sent`
- **object types served:** **all object types**
- _7b. Marquer une liste « envoyée » (route email /api/lists/send)_

### `api.mark_notification_read(p_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/mark_notification_read`
- **object types served:** —

### `api.mark_notifications_emailed(p_sent uuid[], p_failed jsonb DEFAULT '[]'::jsonb)` _(DEFINER)_
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/mark_notifications_emailed`
- **object types served:** —
- _Acquittement du drain e-mail (17i). Succès = email_sent_at ; échec = email_error + email_attempts+1 + claim levé (re-réclamable jusqu'à 5 tentatives). Service_role only._

### `api.norm_search(p text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/norm_search`
- **object types served:** —

### `api.notify_task_assignees(p_task_id uuid, p_new_assignees uuid[], p_actor uuid)` _(DEFINER)_
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/notify_task_assignees`
- **object types served:** —
- _Crée une notification crm_task_assigned par NOUVEL assigné, en excluant l'auteur de l'action (règle produit : on ne se notifie pas de sa propre auto-assignation). Appelée UNIQUEMENT depuis api.save_crm_task, dans la même transaction que le save._

### `api.object_expected_is_test(p_object_id text)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/object_expected_is_test`
- **object types served:** **all object types**
- _Realm que la fiche DEVRAIT porter, d'apres son ORG primaire. Une fiche sans lien_

### `api.object_missing_essentials(p_object_ids text[])` _(DEFINER)_
- **returns:** `TABLE(object_id text, missing text[])`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/object_missing_essentials`
- **object types served:** —
- _§204 — essentiels manquants pour un ENSEMBLE d'objets (jamais par ligne). Rend 0 ligne si_

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

### `api.partner_authenticate(p_key_hash text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/partner_authenticate`
- **object types served:** —
- _Le route passe le SHA-256 hex (calculé en Node) — la clé brute ne touche jamais la DB._

### `api.partner_log_call(p_key_id uuid, p_path text, p_status integer)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/partner_log_call`
- **object types served:** —

### `api.partner_rate_check(p_key_id uuid, p_limit integer DEFAULT 120, p_window_seconds integer DEFAULT 60)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/partner_rate_check`
- **object types served:** —
- _Incrémente le compteur de la fenêtre courante et rend le verdict. service_role-only._

### `api.periods_partial_overlap(p_all_years boolean, a_s date, a_e date, b_s date, b_e date)`
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/periods_partial_overlap`
- **object types served:** —

### `api.phonetic_document(p_text text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/phonetic_document`
- **object types served:** —
- _§198 — texte normalisé → codes dmetaphone dédupliqués, séparés par des espaces. SOURCE UNIQUE de la transformation phonétique : utilisée pour construire object.search_document_phonetic ET pour interroger. Deux implémentations divergeraient en silence. Entrée attendue déjà en minuscules sans accents._

### `api.pick_lang(p_lang_prefs text[] DEFAULT ARRAY['fr'::text])`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/pick_lang`
- **object types served:** —

### `api.prevent_duplicate_actor_email()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Unicité email cross-actors_

### `api.public_catalog_domains()`
- **returns:** `text[]`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/public_catalog_domains`
- **object types served:** —
- _Liste des domaines de référentiel exposés publiquement par api.list_catalog (whitelist default-deny). Audit API I1._

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

### `api.ref_code_usage_count(p_domain text, p_id uuid)` _(DEFINER)_
- **returns:** `integer`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/ref_code_usage_count`
- **object types served:** —
- _Phase 7.5 — nombre de références d'UNE valeur ref_code (super-admin). Garde de suppression._

### `api.ref_code_usage_counts(p_domain text)` _(DEFINER, dyn-SQL)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/ref_code_usage_counts`
- **object types served:** —
- _Phase 7.5 — carte {ref_code.id -> N références} d'un domaine (super-admin). Scan catalogue-dirigé des colonnes uuid *_id non-FK-ailleurs ; correct par unicité UUID. Alimente « utilisé par N fiches » + la garde delete-at-0._

### `api.refresh_object_filter_caches(p_object_id text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/refresh_object_filter_caches`
- **object types served:** **all object types**
- _2) Extend the cache-refresh function to also build search_document_

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

### `api.reject_pending_change(p_id uuid, p_review_note text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/reject_pending_change`
- **object types served:** **all object types**
- _P2.1 §120 — Refuse une suggestion (note obligatoire). Aucun re-dispatch._

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

### `api.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean DEFAULT true, p_limit integer DEFAULT 200)` _(DEFINER)_
- **returns:** `SETOF text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/resolve_list_object_ids`
- **object types served:** —
- _4. Résolveur dynamique (wrapper du leaf de filtre)_

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

### `api.rpc_create_org(p_name text, p_region_code text DEFAULT 'RUN'::text, p_access_scope text DEFAULT 'own_objects_only'::text)` _(DEFINER)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_create_org`
- **object types served:** **all object types**
- _Crée une organisation (objet ORG published + org_config) en une transaction. Superadmin plateforme uniquement — voie UNIQUE de création d'ORG (jamais rpc_create_object ni le dialog B1)._

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

### `api.rpc_delete_ref_code(p_domain text, p_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_delete_ref_code`
- **object types served:** —
- _Phase 7.5 — suppression définitive d'une valeur ref_code, UNIQUEMENT à 0 référence (sinon 23503) ; super-admin + domaine éditable (fail-closed)._

### `api.rpc_delete_ref_row(p_catalog_key text, p_key jsonb)` _(DEFINER, dyn-SQL)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_delete_ref_row`
- **object types served:** —

### `api.rpc_gdpr_erase_subject(p_subject_kind text, p_subject_id text, p_mode text DEFAULT 'anonymize'::text, p_reason text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** Next.js route — `POST /api/rgpd/erase` (wraps `api.rpc_gdpr_erase_subject`, runs as the caller)
- **object types served:** **all object types**
- _Effacement/anonymisation RGPD Art. 17 d'un sujet. Anonymise (défaut) ou supprime, rédige le journal d'audit, journalise dans gdpr_erasure_log, retourne les URLs Storage à supprimer. Gated superuser plateforme._

### `api.rpc_grant_user_permission(p_target_user_id uuid, p_permission_code text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_grant_user_permission`
- **object types served:** **all object types**
- _D3. rpc_grant_user_permission_

### `api.rpc_issue_partner_key(p_label text, p_scopes text[] DEFAULT '{}'::text[], p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_issue_partner_key`
- **object types served:** —
- _Émet une clé : renvoie la clé BRUTE UNE SEULE FOIS (jamais re-consultable)._

### `api.rpc_list_org_members(p_org_object_id text)` _(DEFINER)_
- **returns:** `TABLE(membership_id uuid, user_id uuid, email text, display_name text, is_active boolean, business_role_code text, admin_role_code text, permission_codes text[], last_seen_at timestamp with time zone, role_permission_codes text[], is_platform_superuser boolean)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_list_org_members`
- **object types served:** **all object types**

### `api.rpc_list_orgs()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_list_orgs`
- **object types served:** **all object types**
- _Liste des organisations (ORG) avec périmètre d'accès et effectif actif. Superadmin plateforme uniquement._

### `api.rpc_list_role_permissions(p_org_object_id text)` _(DEFINER)_
- **returns:** `TABLE(role_code text, permission_code text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_list_role_permissions`
- **object types served:** **all object types**
- _Lecture de la matrice pour l'écran /team. SECURITY DEFINER + prédicat d'appartenance :_

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

### `api.rpc_reorder_ref_rows(p_catalog_key text, p_keys jsonb)` _(DEFINER, dyn-SQL)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_reorder_ref_rows`
- **object types served:** —
- _Réordonnancement. Sans cette RPC, absorber RefCodeEditor ferait disparaître les flèches_

### `api.rpc_reset_test_data()` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_reset_test_data`
- **object types served:** **all object types**
- _Vide et resseme le corpus du bac a sable. Superuser plateforme uniquement, et refuse de s'executer si l'ORG cible n'est pas is_test_org. Sans argument : la cible est constante et ne peut pas etre pointee sur une organisation de production._

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

### `api.rpc_revoke_partner_key(p_id uuid)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_revoke_partner_key`
- **object types served:** —
- _Révoque une clé (effet immédiat : partner_authenticate la refusera)._

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

### `api.rpc_set_role_permission(p_org_object_id text, p_role_code text, p_permission_code text, p_granted boolean)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_set_role_permission`
- **object types served:** **all object types**
- _4. Écriture de la matrice — rang ≥ 30, comme toute écriture de permission._

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

### `api.rpc_upsert_ref_row(p_catalog_key text, p_key jsonb, p_values jsonb)` _(DEFINER, dyn-SQL)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/rpc_upsert_ref_row`
- **object types served:** —

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

### `api.save_actor_document(p_payload jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/save_actor_document`
- **object types served:** —

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
- _6. api.save_crm_task — contrat `assignee_ids`_

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
- **object types served:** **all object types**

### `api.search_events_by_restaurant_cuisine(p_cuisine_types text[], p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_events_by_restaurant_cuisine`
- **object types served:** **all object types**

### `api.search_objects_by_label(p_label_value_id uuid, p_include_partial boolean DEFAULT true, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)`
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_objects_by_label`
- **object types served:** **all object types**
- _Search objects by label with partial action matches_

### `api.search_objects_by_name(p_term text, p_limit integer DEFAULT 8)` _(DEFINER)_
- **returns:** `TABLE(id text, name text, object_type object_type, status object_status, city text, image_url text)`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/search_objects_by_name`
- **object types served:** **all object types**
- _Concordance directe par nom (spec 2026-08-26) : navigation, pas filtrage — cherche tout le corpus visible indépendamment des filtres de l'Exploreur. Périmètre auto-gardé : published pour tous, + draft du périmètre étendu pour un éditeur (COALESCE sur la sonde à trois valeurs, §204) ; archived/hidden jamais. Consommée par le menu de la barre de recherche, le bandeau de résultats et la palette ⌘K._

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

### `api.set_list_items(p_list_id uuid, p_items jsonb)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/set_list_items`
- **object types served:** **all object types**
- _6.5 Remplacement des items statiques (reconcile non-destructif — §40)_

### `api.set_publication_workflow_timestamps()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.set_tag_color(p_anchor_object_id text, p_tag_id uuid, p_color text)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/set_tag_color`
- **object types served:** —
- _§09: set a tag's GLOBAL color (ref_tag.color, HEX #rrggbb), gated per-object. Color is global per tag (D3). SECURITY DEFINER._

### `api.share_list(p_list_id uuid, p_enable boolean DEFAULT true, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/share_list`
- **object types served:** **all object types**
- _6.7 Partage : génère/rote le token, (dé)active le lien_

### `api.strip_markdown(md text)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/strip_markdown`
- **object types served:** —
- _Plain-text derivation for Markdown-canonical description columns (manifest 14w)._

### `api.strip_markdown_i18n(p_i18n jsonb)`
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/strip_markdown_i18n`
- **object types served:** —
- _{lang: markdown} -> {lang: plain text}. Empty/whitespace values dropped, keys lowercased,_

### `api.submit_pending_change(p_object_id text, p_target_table text, p_target_pk text, p_action text, p_payload jsonb, p_metadata jsonb DEFAULT NULL::jsonb)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/submit_pending_change`
- **object types served:** **all object types**
- _P2.1 §120 — Dépose une suggestion (pending). Large : authentifié + objet lisible. submitted_by=auth.uid()._

### `api.sync_app_user_profile_from_auth_user(p_user_id uuid, p_email text, p_raw_user_meta_data jsonb DEFAULT '{}'::jsonb, p_raw_app_meta_data jsonb DEFAULT '{}'::jsonb)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/sync_app_user_profile_from_auth_user`
- **object types served:** —

### `api.sync_classification_from_audit_session()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `api.sync_object_is_test(p_object_id text)`
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/sync_object_is_test`
- **object types served:** **all object types**

### `api.tg_object_list_touch()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _Tenue à jour de updated_at_

### `api.to_base36(n bigint)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/to_base36`
- **object types served:** —
- _to_base36_

### `api.trail_create_manual(p_name text, p_visibility text DEFAULT 'private'::text, p_description_md text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_create_manual`
- **object types served:** —

### `api.trail_force_status(p_trail_id uuid, p_forced_status_code text, p_reason text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_force_status`
- **object types served:** —

### `api.trail_link_source_record(p_source_record_id uuid, p_trail_id uuid)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_link_source_record`
- **object types served:** —

### `api.trail_revoke_override(p_override_id uuid, p_note text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_revoke_override`
- **object types served:** —

### `api.trail_set_visibility(p_trail_id uuid, p_visibility text)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_set_visibility`
- **object types served:** —

### `api.trail_sync_apply_service(p_sync_run_id uuid, p_features jsonb, p_options jsonb DEFAULT '{}'::jsonb)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_sync_apply_service`
- **object types served:** —

### `api.trail_sync_begin(p_source_code text, p_trigger text, p_dry_run boolean DEFAULT false, p_requested_by uuid DEFAULT NULL::uuid)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_sync_begin`
- **object types served:** —

### `api.trail_sync_finalize(p_sync_run_id uuid, p_status text, p_report jsonb DEFAULT NULL::jsonb, p_http_status integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text, p_layer_last_edit_date timestamp with time zone DEFAULT NULL::timestamp with time zone)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_sync_finalize`
- **object types served:** —

### `api.trail_update_editorial(p_trail_id uuid, p_name text DEFAULT NULL::text, p_description_md text DEFAULT NULL::text, p_editorial_geom_geojson jsonb DEFAULT NULL::jsonb)` _(DEFINER)_
- **returns:** `void`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/trail_update_editorial`
- **object types served:** —

### `api.trg_object_deletion_log_is_test()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Le tombstone herite du realm de la fiche AU MOMENT de sa suppression._

### `api.trg_object_org_link_is_test()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.trg_org_config_is_test()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**
- _Bascule d'une ORG entiere (is_test_org modifie) : re-synchronise ses fiches._

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

### `api.update_list(p_list_id uuid, p_patch jsonb)` _(DEFINER)_
- **returns:** `json`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/update_list`
- **object types served:** **all object types**
- _6.4 Mise à jour des métadonnées (patch whitelisté)_

### `api.upsert_ai_provider(p_id uuid, p_label text, p_api_kind text, p_base_url text, p_model text, p_max_output_tokens integer, p_is_active boolean, p_extra jsonb DEFAULT '{}'::jsonb, p_api_key text DEFAULT NULL::text)` _(DEFINER)_
- **returns:** `uuid`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/upsert_ai_provider`
- **object types served:** —

### `api.upsert_app_branding(p_brand_name text DEFAULT NULL::text, p_logo_storage_path text DEFAULT NULL::text, p_logo_public_url text DEFAULT NULL::text, p_logo_mime_type text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_accent_color text DEFAULT NULL::text, p_text_color text DEFAULT NULL::text, p_background_color text DEFAULT NULL::text, p_surface_color text DEFAULT NULL::text, p_marker_styles jsonb DEFAULT NULL::jsonb, p_extra jsonb DEFAULT NULL::jsonb, p_clear_logo boolean DEFAULT false)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/upsert_app_branding`
- **object types served:** —
- _Creates or updates the global branding/theme settings used by the UI. Restricted to platform admins._

### `api.upsert_org_branding(p_org_object_id text, p_brand_name text DEFAULT NULL::text, p_logo_storage_path text DEFAULT NULL::text, p_logo_public_url text DEFAULT NULL::text, p_logo_mime_type text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_accent_color text DEFAULT NULL::text, p_text_color text DEFAULT NULL::text, p_background_color text DEFAULT NULL::text, p_surface_color text DEFAULT NULL::text, p_reset boolean DEFAULT false)` _(DEFINER)_
- **returns:** `jsonb`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/upsert_org_branding`
- **object types served:** **all object types**
- _5) Écriture : contrat FULL-STATE PUT — chaque appel remplace la ligne entière (NULL = hérite)._

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

### `api.user_can_attach_object_document(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_attach_object_document`
- **object types served:** **all object types**

### `api.user_can_create_object()` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_create_object`
- **object types served:** —
- _Phase 5 — api.user_can_create_object()_

### `api.user_can_manage_object_legal(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_manage_object_legal`
- **object types served:** **all object types**

### `api.user_can_manage_org_branding(p_org_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_manage_org_branding`
- **object types served:** **all object types**
- _3) Gouvernance : superuser plateforme OU admin (rang >= 30) actif de CETTE ORG._

### `api.user_can_moderate_object(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_moderate_object`
- **object types served:** —
- _P2.1 §120 — TRUE si l'appelant peut modérer les suggestions de cet objet (superuser OU validate_changes + membre ORG publisher)._

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

### `api.user_can_read_list(p_list_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_read_list`
- **object types served:** **all object types**

### `api.user_can_write_canonical(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_canonical`
- **object types served:** **all object types**
- _E3. api.user_can_write_canonical(p_object_id text)_

### `api.user_can_write_crm(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_crm`
- **object types served:** —
- _1. Écriture CRM sur un ÉTABLISSEMENT._

### `api.user_can_write_crm_actor(p_actor_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_crm_actor`
- **object types served:** —
- _2. Écriture CRM sur un ACTEUR._

### `api.user_can_write_crm_task(p_task_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_crm_task`
- **object types served:** **all object types**
- _true si l'appelant peut écrire la tâche (même prédicat que save_crm_task : user_can_write_crm sur son object). Gate des routes /api/task-document (17i)._

### `api.user_can_write_enrichment(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_enrichment`
- **object types served:** **all object types**
- _E4. api.user_can_write_enrichment(p_object_id text)_

### `api.user_can_write_list(p_list_id uuid)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_list`
- **object types served:** **all object types**
- _Écriture d'une liste : son créateur, ou un admin d'ORG (rang >= 30) si le créateur n'est plus membre actif (reprise d'orpheline), ou le superuser plateforme. Le bras « n'importe quel rôle admin » a été retiré le 2026-08-31 (17k)._

### `api.user_can_write_object_canonical(p_object_id text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_can_write_object_canonical`
- **object types served:** —
- _user_can_write_object_canonical: defined in migration_permission_write_paths.sql (SP-1), \ir'd_

### `api.user_has_permission(p_permission_code text)` _(DEFINER)_
- **returns:** `boolean`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/user_has_permission`
- **object types served:** **all object types**
- _Droits effectifs : exception individuelle OU rôle métier de l'ORG (§227). Le chemin org_permission a été retiré le 2026-08-31 — il accordait sans regarder le rôle._

### `api.validate_audit_result_points()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.validate_object_business_timezone()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `api.validate_object_hotel_positioning()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

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
- _16e (§146): born-gated + self-repairing — partitions do NOT inherit RLS/policies from the_

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
- _16e (§146): the daily cron entrypoint maintains BOTH partitioned parents — audit.audit_log AND_

### `audit.redact_subject(p_table text, p_match_key text, p_match_val text, p_pii_cols text[])` _(DEFINER)_
- **returns:** `integer`
- **access:** audit schema — SQL-callable; reached via api/internal wrappers, not PostgREST
- **object types served:** —
- _Rédaction ciblée du journal d'audit : retire les clés PII d'un sujet (row_pk OU before_data->>key,_

## schema `internal`

### `internal.compute_open_status(p_at timestamp with time zone)`
- **returns:** `TABLE(object_id text, is_open boolean)`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** **all object types**
- _§157 — LE moteur d'ouverture, paramétré par l'instant demandé. Source UNIQUE :_

### `internal.crm_backfill_assignees_from_owner()`
- **returns:** `integer`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** **all object types**
- _Reprise des assignations depuis crm_task.owner (16w) : une ligne par owner non nul, SANS provenance (assigned_by et assigned_at à NULL — voir §A). Idempotente. Nommée pour que tests/test_crm_task_multi_assignee.sql éprouve LA règle et non une copie._

### `internal.recompute_trail_status(p_trail_id uuid)`
- **returns:** `void`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.ref_catalog_access(p_catalog_key text)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Accès EFFECTIF : DÉRIVÉ d'abord, registre ensuite. Les dérivés ne peuvent pas être_

### `internal.ref_catalog_cast_expr(p_columns jsonb, p_name text, p_src text)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Valeur castée au type découvert, réutilisée par l'INSERT, le SET et le WHERE._

### `internal.ref_catalog_label_column(p_catalog_key text)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Cascade de libellé. Une déclaration par table serait la RÈGLE et non l'exception_

### `internal.ref_catalog_readonly_reason(p_catalog_key text)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.ref_catalog_row_count(p_table text)` _(dyn-SQL)_
- **returns:** `bigint`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.resolve_list_object_ids(p_buckets jsonb, p_published_only boolean DEFAULT true, p_limit integer DEFAULT 200)` _(DEFINER)_
- **returns:** `SETOF text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Moteur de résolution des listes dynamiques (plafond 2001). NON exposé : joignable uniquement depuis un SECURITY DEFINER qui a déjà appliqué sa propre garde. Le contrat public api.resolve_list_object_ids reste plafonné à 200. §211_

### `internal.seed_test_corpus(p_per_type integer DEFAULT 15)`
- **returns:** `jsonb`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** **all object types**
- _Chaque fiche est rattachee a l'ORG de test comme ORG PRIMAIRE : c'est CE lien_

### `internal.seed_test_facets(p_id text, p_type text, p_i integer, p_src text DEFAULT NULL::text)`
- **returns:** `void`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** **all object types**
- _Profondeur PAR TYPE du corpus de test : object_iti (+etapes, pratiques, profil, trace), object_fma (+occurrences), object_act, types de chambre, salles de reunion, carte. Suit ref_facet_applicability a la lettre — 7 types n'ont aucune facette. Idempotent (purge avant reecriture)._

### `internal.test_actor_name(p_type text, p_i integer)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Noms d'acteurs FICTIFS. Jamais tires du corpus reel : c'est la ligne rouge de_

### `internal.test_corpus_id(p_type text, p_i integer)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Id conforme a chk_object_id_shape (3 lettres + 3 alphanum + 10 alphanum) :_

### `internal.test_corpus_name(p_type text, p_i integer)`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Un nom credible par type. Volontairement realiste : un corpus intitule_

### `internal.test_org_id()`
- **returns:** `text`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —
- _Id de l'ORG bac a sable. Source unique pour le seed, la remise a zero et les tests._

### `internal.trail_expire_overrides()`
- **returns:** `void`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** —

### `internal.trail_recompute_status_self_trigger()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `internal.trail_recompute_status_trigger()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —

### `internal.trail_sync_apply(p_sync_run_id uuid, p_features jsonb, p_options jsonb DEFAULT '{}'::jsonb)`
- **returns:** `jsonb`
- **access:** internal — SQL-callable by other functions/triggers; **not** PostgREST-exposed
- **object types served:** **all object types**

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

### `public.create_object_version_monthly_partition(partition_date timestamp with time zone)` _(dyn-SQL)_
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/create_object_version_monthly_partition` (public schema, if exposed) / SQL-callable
- **object types served:** —
- _1) object_version partition creator — born-gated + self-repairing_

### `public.enforce_classification_single_selection()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.enforce_single_main_media()`
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** **all object types**

### `public.ensure_object_version_partitions(months_ahead integer DEFAULT 3)`
- **returns:** `text`
- **access:** PostgREST RPC — `POST /rest/v1/rpc/ensure_object_version_partitions` (public schema, if exposed) / SQL-callable
- **object types served:** —
- _16e (§146): monthly horizon for object_version — called by audit.maintain_partitions() (daily_

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

### `public.seed_org_role_permission()` _(DEFINER)_
- **returns:** `trigger`
- **access:** trigger function — fires from a table trigger, not callable directly
- **object types served:** —
- _2bis. Semer AUSSI les ORG créées plus tard._

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
