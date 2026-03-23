-- =====================================================
-- POLITIQUES RLS (ROW LEVEL SECURITY) SUPABASE
-- =====================================================

-- =====================================================
-- 1. ACTIVATION DE LA SÉCURITÉ AU NIVEAU DES LIGNES
-- =====================================================

-- Activation RLS sur toutes les tables principales
ALTER TABLE object ENABLE ROW LEVEL SECURITY;
-- legacy address/location dropped in schema; use unified tables below
ALTER TABLE object_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_place ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_channel ENABLE ROW LEVEL SECURITY;
-- social_network is a ref_code partition (ref_code_social_network); no separate table
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
-- classification table removed (use object_classification)
-- capacity table removed (using object_capacity)
-- (legacy) ALTER TABLE legal ENABLE ROW LEVEL SECURITY;
-- Current tables
ALTER TABLE object_legal ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_time_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_time_period_weekday ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_time_frame ENABLE ROW LEVEL SECURITY;
-- object_hot table removed (use object_classification)
ALTER TABLE object_fma ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_iti_practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_iti_assoc_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_associated_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_profile ENABLE ROW LEVEL SECURITY;
-- object_structure table does not exist in current schema
ALTER TABLE ref_org_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_org_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_description ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_private_description ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_classification_scheme ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_classification_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_external_id ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_capacity_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_capacity_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_review_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_sustainability_action_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_sustainability_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_sustainability_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE i18n_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_sustainability_action_label ENABLE ROW LEVEL SECURITY;
-- Commercial policies
ALTER TABLE object_discount ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_group_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_room_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_room_type_amenity ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_room_type_media ENABLE ROW LEVEL SECURITY;

-- Activation RLS sur les tables de liaison M:N
ALTER TABLE object_language ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_environment_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_amenity ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_tag ENABLE ROW LEVEL SECURITY;

-- RLS sur la table d'audit (schéma audit)
ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;

-- Activation RLS sur les tables de référence (lecture publique)
ALTER TABLE ref_language ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code ENABLE ROW LEVEL SECURITY;
-- Supabase peut linter la partition default séparément; on l'active explicitement.
ALTER TABLE ref_code_other ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_environment_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_amenity ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_view_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_membership_tier ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_membership_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_incident_category ENABLE ROW LEVEL SECURITY;
-- ref_classification_prefectoral / ref_type_hot removed (use schemes/values)

-- =====================================================
-- 1.b FONCTIONS D'AIDE RLS
-- =====================================================

-- Email courant (JWT claims)
CREATE OR REPLACE FUNCTION api.current_user_email()
RETURNS text LANGUAGE sql STABLE 
SET search_path = pg_catalog, public, api, extensions, auth
AS $$
  SELECT lower((current_setting('request.jwt.claims', true)::json ->> 'email'))
$$;

-- Acteurs liés à l'utilisateur via email dans actor_channel.kind='email'
CREATE OR REPLACE FUNCTION api.user_actor_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE 
SET search_path = pg_catalog, public, api, extensions, auth
AS $$
  SELECT ac.actor_id
  FROM actor_channel ac
  JOIN ref_code_contact_kind ck ON ck.id = ac.kind_id AND ck.code = 'email'
  WHERE lower(ac.value) = api.current_user_email()
$$;

-- Droit étendu en lecture : acteur (chemin historique) OU membership ORG (Phase 2).
-- Les deux chemins sont en OR — aucune logique existante n'est retirée.
-- Ne couvre que la lecture. Pas d'écriture, pas de permissions d'action.
--
-- Chemin 1 (conservé intact) — accès via rôle acteur :
--   actor_object_role sur l'objet lui-même OU sur une ORG parente de l'objet.
--
-- Chemin 2 (ajouté Phase 2) — accès via membership ORG :
--   A. Périmètre propre — l'objet EST l'ORG du user
--   B. Périmètre propre — l'objet est lié à l'ORG du user via object_org_link (tous rôles, non publiés inclus)
--   C. Périmètre externe publié — org_config.access_scope = 'all_published' ET objet published
--      (objets non publiés d'autres ORG hors périmètre, cf. §2.3.B du plan)
CREATE OR REPLACE FUNCTION api.can_read_extended(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  WITH
  -- Chemin 1 : accès acteur historique (conservé intact)
  actor_path AS (
    SELECT 1
    FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT * FROM api.user_actor_ids())
      AND (
        aor.object_id = p_object_id
        OR aor.object_id IN (
          SELECT ool.org_object_id
          FROM object_org_link ool
          WHERE ool.object_id = p_object_id
        )
      )
    LIMIT 1
  ),
  -- Chemin 2A : l'objet est l'ORG elle-même (membership actif sur cet objet-ORG)
  own_org AS (
    SELECT 1
    FROM user_org_membership uom
    WHERE uom.user_id    = auth.uid()
      AND uom.is_active  = TRUE
      AND uom.org_object_id = p_object_id
    LIMIT 1
  ),
  -- Chemin 2B : l'objet est dans le périmètre propre de l'ORG du user
  --   (rattaché via object_org_link, quel que soit le rôle ORG, publiés et non publiés)
  own_objects AS (
    SELECT 1
    FROM user_org_membership uom
    JOIN object_org_link ool ON ool.org_object_id = uom.org_object_id
    WHERE uom.user_id   = auth.uid()
      AND uom.is_active = TRUE
      AND ool.object_id = p_object_id
    LIMIT 1
  ),
  -- Chemin 2C : périmètre externe publié
  --   L'ORG du user a le scope 'all_published' ET l'objet est published.
  --   Les objets non publiés d'autres ORG restent hors portée (§2.3.B).
  external_published AS (
    SELECT 1
    FROM user_org_membership uom
    JOIN org_config oc ON oc.org_object_id = uom.org_object_id
    JOIN object     o  ON o.id = p_object_id
    WHERE uom.user_id   = auth.uid()
      AND uom.is_active = TRUE
      AND oc.access_scope = 'all_published'
      AND o.status        = 'published'
    LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM actor_path)
    OR EXISTS (SELECT 1 FROM own_org)
    OR EXISTS (SELECT 1 FROM own_objects)
    OR EXISTS (SELECT 1 FROM external_published);
$$;

-- Vérifie si l'utilisateur est propriétaire (owner) de l'objet
-- via un rôle actor_object_role lié à son email dans actor_channel
CREATE OR REPLACE FUNCTION api.is_object_owner(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, api, auth AS $$
  SELECT EXISTS (
    SELECT 1 FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT * FROM api.user_actor_ids())
      AND aor.object_id = p_object_id
      AND aor.is_primary = TRUE
  )
  OR auth.role() IN ('service_role','admin')
  OR auth.uid() IN (
    SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
  );
$$;

-- Vérifie si l'utilisateur courant est owner plateforme (ou admin/service)
CREATE OR REPLACE FUNCTION api.is_platform_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, api, auth AS $$
  SELECT
    auth.role() IN ('service_role', 'admin')
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role = 'owner'
    );
$$;

-- =====================================================
-- Phase 2 — Helpers RLS membership ORG
-- Référence : access_control_master_plan.md §7 Phase 2
-- Ces fonctions lisent uniquement le membership actif du user courant.
-- Elles ne confèrent aucun droit d'écriture ni de permission d'action.
-- =====================================================

-- Retourne l'org_object_id actif du user courant (NULL si aucun membership actif).
-- Pour un tourism_agent, au plus une ORG active existe (contrainte enforce_single_active_org_membership).
-- Pour un owner/super_admin, retourne la première trouvée (usage interne uniquement).
CREATE OR REPLACE FUNCTION api.current_user_org_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT uom.org_object_id
  FROM user_org_membership uom
  WHERE uom.user_id = auth.uid()
    AND uom.is_active = TRUE
  LIMIT 1;
$$;

-- Retourne le code du rôle métier actif du user courant (NULL si aucun).
-- Traverse : user_org_membership → user_org_business_role → ref_org_business_role.
-- Usage : affichage, contexte session — pas de logique de permission ici.
CREATE OR REPLACE FUNCTION api.current_user_business_role_code()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT r.code
  FROM user_org_membership uom
  JOIN user_org_business_role ubr ON ubr.membership_id = uom.id
                                  AND ubr.is_active = TRUE
  JOIN ref_org_business_role r    ON r.id = ubr.role_id
  WHERE uom.user_id  = auth.uid()
    AND uom.is_active = TRUE
  LIMIT 1;
$$;

-- Retourne le code du rôle admin actif du user courant (NULL si pas de rôle admin).
-- Traverse : user_org_membership → user_org_admin_role → ref_org_admin_role.
-- Le rôle admin ne bypasse pas api.user_has_permission() (§2.6 du plan).
CREATE OR REPLACE FUNCTION api.current_user_admin_role_code()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT r.code
  FROM user_org_membership uom
  JOIN user_org_admin_role uar ON uar.membership_id = uom.id
                               AND uar.is_active = TRUE
  JOIN ref_org_admin_role r   ON r.id = uar.role_id
  WHERE uom.user_id  = auth.uid()
    AND uom.is_active = TRUE
  LIMIT 1;
$$;

-- =====================================================
-- 2. POLITIQUES POUR LES TABLES DE RÉFÉRENCE
-- =====================================================

-- Idempotency strategy:
-- Use explicit DROP POLICY IF EXISTS statements for policies managed in this file.
-- Avoid blanket drops across schemas to prevent removing unrelated/custom policies.
DROP POLICY IF EXISTS "Lecture publique des langues" ON ref_language;
DROP POLICY IF EXISTS "Lecture publique des moyens de paiement" ON ref_code_payment_method;
DROP POLICY IF EXISTS "Lecture publique des tags d'environnement" ON ref_code_environment_tag;
DROP POLICY IF EXISTS "Lecture publique des équipements" ON ref_amenity;
DROP POLICY IF EXISTS "Lecture publique des schémas de classification" ON ref_classification_scheme;
DROP POLICY IF EXISTS "Lecture publique des valeurs de classification" ON ref_classification_value;
DROP POLICY IF EXISTS "Lecture publique des métriques de capacité" ON ref_capacity_metric;
DROP POLICY IF EXISTS "Lecture publique des applicabilités de capacité" ON ref_capacity_applicability;
DROP POLICY IF EXISTS "Lecture publique des documents de référence" ON ref_document;
DROP POLICY IF EXISTS "Lecture publique des catégories DD" ON ref_sustainability_action_category;
DROP POLICY IF EXISTS "Lecture publique des actions DD" ON ref_sustainability_action;
DROP POLICY IF EXISTS "Lecture publique des traductions" ON i18n_translation;
DROP POLICY IF EXISTS "Lecture publique des rôles d'organisation" ON ref_org_role;
DROP POLICY IF EXISTS "Lecture publique des sources d'avis" ON ref_review_source;
DROP POLICY IF EXISTS "Lecture publique des types de vue" ON ref_code_view_type;
DROP POLICY IF EXISTS "Lecture publique des tags média" ON ref_code_media_tag;
DROP POLICY IF EXISTS "Écriture admin des langues" ON ref_language;
DROP POLICY IF EXISTS "Écriture admin des moyens de paiement" ON ref_code_payment_method;
DROP POLICY IF EXISTS "Écriture admin des tags d'environnement" ON ref_code_environment_tag;
DROP POLICY IF EXISTS "Écriture admin des équipements" ON ref_amenity;
DROP POLICY IF EXISTS "Écriture admin des schémas de classification" ON ref_classification_scheme;
DROP POLICY IF EXISTS "Écriture admin des valeurs de classification" ON ref_classification_value;
DROP POLICY IF EXISTS "Écriture admin des métriques de capacité" ON ref_capacity_metric;
DROP POLICY IF EXISTS "Écriture admin des applicabilités de capacité" ON ref_capacity_applicability;
DROP POLICY IF EXISTS "Écriture admin des documents de référence" ON ref_document;
DROP POLICY IF EXISTS "Écriture admin des catégories DD" ON ref_sustainability_action_category;
DROP POLICY IF EXISTS "Écriture admin des actions DD" ON ref_sustainability_action;
DROP POLICY IF EXISTS "Écriture admin des traductions" ON i18n_translation;
DROP POLICY IF EXISTS "Écriture admin des sources d'avis" ON ref_review_source;
DROP POLICY IF EXISTS "Écriture admin des types de vue" ON ref_code_view_type;
DROP POLICY IF EXISTS "public_objects_published" ON object;
DROP POLICY IF EXISTS "extended_objects_org_actor" ON object;
DROP POLICY IF EXISTS "Lecture publique des pratiques ITI" ON ref_code_iti_practice;
DROP POLICY IF EXISTS "Lecture publique des rôles ITI" ON ref_iti_assoc_role;
DROP POLICY IF EXISTS "Lecture publique des profils ITI" ON object_iti_profile;
DROP POLICY IF EXISTS "Lecture publique des localisations" ON object_location;
DROP POLICY IF EXISTS "Lecture publique des places" ON object_place;
DROP POLICY IF EXISTS "pub_contacts_public" ON contact_channel;
DROP POLICY IF EXISTS "ext_contacts_org_actor" ON contact_channel;
DROP POLICY IF EXISTS "pub_media_published" ON media;
DROP POLICY IF EXISTS "ext_media_org_actor" ON media;
DROP POLICY IF EXISTS "Lecture restreinte identifiants externes" ON object_external_id;
DROP POLICY IF EXISTS "pub_descriptions_public" ON object_description;
DROP POLICY IF EXISTS "ext_descriptions_org_actor" ON object_description;
DROP POLICY IF EXISTS "ext_private_descriptions_org_actor" ON object_private_description;
DROP POLICY IF EXISTS "ext_legal_org_actor" ON object_legal;
DROP POLICY IF EXISTS "ext_discounts_org_actor" ON object_discount;
DROP POLICY IF EXISTS "ext_group_policies_org_actor" ON object_group_policy;
DROP POLICY IF EXISTS "owner_write_location" ON object_location;
DROP POLICY IF EXISTS "owner_write_place" ON object_place;
DROP POLICY IF EXISTS "owner_write_contact" ON contact_channel;
DROP POLICY IF EXISTS "owner_write_media" ON media;
DROP POLICY IF EXISTS "owner_write_description" ON object_description;
DROP POLICY IF EXISTS "owner_write_private_description" ON object_private_description;
DROP POLICY IF EXISTS "owner_write_legal" ON object_legal;
DROP POLICY IF EXISTS "owner_write_discount" ON object_discount;
DROP POLICY IF EXISTS "owner_write_group_policy" ON object_group_policy;
DROP POLICY IF EXISTS "Écriture par propriétaire (object)" ON object;
DROP POLICY IF EXISTS "Accès admin/service_role (object)" ON object;
DROP POLICY IF EXISTS "Accès admin/service_role (object_external_id)" ON object_external_id;
DROP POLICY IF EXISTS "Accès admin/service_role (object_sustainability_action)" ON object_sustainability_action;
DROP POLICY IF EXISTS "Accès admin/service_role (object_sustainability_action_label)" ON object_sustainability_action_label;
DROP POLICY IF EXISTS "Lecture publique des avis" ON object_review;
DROP POLICY IF EXISTS "Écriture admin des avis" ON object_review;
DROP POLICY IF EXISTS "pub_fma_published" ON object_fma;
DROP POLICY IF EXISTS "ext_fma_org_actor" ON object_fma;
DROP POLICY IF EXISTS "pub_iti_published" ON object_iti;
DROP POLICY IF EXISTS "ext_iti_org_actor" ON object_iti;
DROP POLICY IF EXISTS "pub_iti_practice_read" ON object_iti_practice;
DROP POLICY IF EXISTS "pub_iti_stage_read" ON object_iti_stage;
DROP POLICY IF EXISTS "pub_iti_section_read" ON object_iti_section;
DROP POLICY IF EXISTS "pub_iti_associated_read" ON object_iti_associated_object;
DROP POLICY IF EXISTS "pub_iti_info_read" ON object_iti_info;
DROP POLICY IF EXISTS "pub_zone_read" ON object_zone;
DROP POLICY IF EXISTS "pub_classification_read" ON object_classification;
DROP POLICY IF EXISTS "pub_capacity_read" ON object_capacity;
DROP POLICY IF EXISTS "pub_object_language_read" ON object_language;
DROP POLICY IF EXISTS "pub_payment_method_read" ON object_payment_method;
DROP POLICY IF EXISTS "pub_environment_tag_read" ON object_environment_tag;
DROP POLICY IF EXISTS "pub_amenity_read" ON object_amenity;
DROP POLICY IF EXISTS "pub_org_link_read" ON object_org_link;
DROP POLICY IF EXISTS "pub_opening_period_read" ON opening_period;
DROP POLICY IF EXISTS "pub_opening_schedule_read" ON opening_schedule;
DROP POLICY IF EXISTS "pub_opening_time_period_read" ON opening_time_period;
DROP POLICY IF EXISTS "pub_opening_time_period_weekday_read" ON opening_time_period_weekday;
DROP POLICY IF EXISTS "pub_opening_time_frame_read" ON opening_time_frame;
DROP POLICY IF EXISTS "Lecture publique des types de chambre" ON object_room_type;
DROP POLICY IF EXISTS "Lecture étendue des types de chambre" ON object_room_type;
DROP POLICY IF EXISTS "Écriture types de chambre par propriétaire" ON object_room_type;
DROP POLICY IF EXISTS "Lecture publique amenities chambre" ON object_room_type_amenity;
DROP POLICY IF EXISTS "Écriture amenities chambre par propriétaire" ON object_room_type_amenity;
DROP POLICY IF EXISTS "Lecture de son profil utilisateur" ON app_user_profile;
DROP POLICY IF EXISTS "Insertion de son profil utilisateur" ON app_user_profile;
DROP POLICY IF EXISTS "Mise à jour de son profil utilisateur" ON app_user_profile;
DROP POLICY IF EXISTS "Administration des profils utilisateur" ON app_user_profile;
DROP POLICY IF EXISTS "Lecture publique médias chambre" ON object_room_type_media;
DROP POLICY IF EXISTS "Écriture médias chambre par propriétaire" ON object_room_type_media;
DROP POLICY IF EXISTS "Lecture publique des promotions" ON promotion;
DROP POLICY IF EXISTS "Écriture admin des promotions" ON promotion;
DROP POLICY IF EXISTS "Lecture publique des liaisons promotions" ON promotion_object;
DROP POLICY IF EXISTS "Écriture admin des liaisons promotions" ON promotion_object;
DROP POLICY IF EXISTS "Lecture admin des usages promotions" ON promotion_usage;
DROP POLICY IF EXISTS "Écriture admin des usages promotions" ON promotion_usage;
DROP POLICY IF EXISTS "Lecture audit (admin/service_role)" ON audit.audit_log;
DROP POLICY IF EXISTS "Insertion via triggers" ON audit.audit_log;
DROP POLICY IF EXISTS "Lecture publique des media_tag" ON media_tag;
DROP POLICY IF EXISTS "Écriture media_tag par propriétaire" ON media_tag;
DROP POLICY IF EXISTS "ext_actor_read" ON actor;
DROP POLICY IF EXISTS "admin_actor_write" ON actor;
DROP POLICY IF EXISTS "ext_actor_channel_read" ON actor_channel;
DROP POLICY IF EXISTS "admin_actor_channel_write" ON actor_channel;
DROP POLICY IF EXISTS "ext_actor_object_role_read" ON actor_object_role;
DROP POLICY IF EXISTS "admin_actor_object_role_write" ON actor_object_role;
DROP POLICY IF EXISTS "own_actor_consent_read" ON actor_consent;
DROP POLICY IF EXISTS "own_actor_consent_write" ON actor_consent;
DROP POLICY IF EXISTS "admin_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_pending_change" ON pending_change;
DROP POLICY IF EXISTS "admin_object_version" ON object_version;
DROP POLICY IF EXISTS "pub_membership_tier_read" ON ref_code_membership_tier;
DROP POLICY IF EXISTS "admin_membership_tier_write" ON ref_code_membership_tier;
DROP POLICY IF EXISTS "pub_membership_campaign_read" ON ref_code_membership_campaign;
DROP POLICY IF EXISTS "admin_membership_campaign_write" ON ref_code_membership_campaign;
DROP POLICY IF EXISTS "pub_incident_category_read" ON ref_code_incident_category;
DROP POLICY IF EXISTS "admin_incident_category_write" ON ref_code_incident_category;
DROP POLICY IF EXISTS "pub_object_membership_read" ON object_membership;
DROP POLICY IF EXISTS "ext_object_membership_read" ON object_membership;
DROP POLICY IF EXISTS "owner_object_membership_write" ON object_membership;
DROP POLICY IF EXISTS "admin_incident_report" ON incident_report;
DROP POLICY IF EXISTS "admin_publication" ON publication;
DROP POLICY IF EXISTS "admin_publication_object" ON publication_object;
DROP POLICY IF EXISTS "pub_audit_template_read" ON audit_template;
DROP POLICY IF EXISTS "admin_audit_template_write" ON audit_template;
DROP POLICY IF EXISTS "pub_audit_criteria_read" ON audit_criteria;
DROP POLICY IF EXISTS "admin_audit_criteria_write" ON audit_criteria;
DROP POLICY IF EXISTS "admin_audit_session" ON audit_session;
DROP POLICY IF EXISTS "admin_audit_result" ON audit_result;
DROP POLICY IF EXISTS "pub_price_read" ON object_price;
DROP POLICY IF EXISTS "owner_price_write" ON object_price;
DROP POLICY IF EXISTS "pub_price_period_read" ON object_price_period;
DROP POLICY IF EXISTS "owner_price_period_write" ON object_price_period;
DROP POLICY IF EXISTS "pub_menu_read" ON object_menu;
DROP POLICY IF EXISTS "owner_menu_write" ON object_menu;
DROP POLICY IF EXISTS "pub_menu_item_read" ON object_menu_item;
DROP POLICY IF EXISTS "owner_menu_item_write" ON object_menu_item;
DROP POLICY IF EXISTS "pub_menu_item_dietary_read" ON object_menu_item_dietary_tag;
DROP POLICY IF EXISTS "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag;
DROP POLICY IF EXISTS "pub_menu_item_allergen_read" ON object_menu_item_allergen;
DROP POLICY IF EXISTS "owner_menu_item_allergen_write" ON object_menu_item_allergen;
DROP POLICY IF EXISTS "pub_menu_item_cuisine_read" ON object_menu_item_cuisine_type;
DROP POLICY IF EXISTS "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type;
DROP POLICY IF EXISTS "pub_menu_item_media_read" ON object_menu_item_media;
DROP POLICY IF EXISTS "owner_menu_item_media_write" ON object_menu_item_media;
DROP POLICY IF EXISTS "pub_meeting_room_read" ON object_meeting_room;
DROP POLICY IF EXISTS "owner_meeting_room_write" ON object_meeting_room;
DROP POLICY IF EXISTS "pub_meeting_room_equipment_read" ON meeting_room_equipment;
DROP POLICY IF EXISTS "owner_meeting_room_equipment_write" ON meeting_room_equipment;
DROP POLICY IF EXISTS "pub_pet_policy_read" ON object_pet_policy;
DROP POLICY IF EXISTS "owner_pet_policy_write" ON object_pet_policy;
DROP POLICY IF EXISTS "pub_fma_occurrence_read" ON object_fma_occurrence;
DROP POLICY IF EXISTS "owner_fma_occurrence_write" ON object_fma_occurrence;
DROP POLICY IF EXISTS "pub_iti_stage_media_read" ON object_iti_stage_media;
DROP POLICY IF EXISTS "owner_iti_stage_media_write" ON object_iti_stage_media;
DROP POLICY IF EXISTS "pub_place_description_read" ON object_place_description;
DROP POLICY IF EXISTS "admin_place_description_write" ON object_place_description;
DROP POLICY IF EXISTS "pub_origin_read" ON object_origin;
DROP POLICY IF EXISTS "admin_origin_write" ON object_origin;
DROP POLICY IF EXISTS "pub_relation_read" ON object_relation;
DROP POLICY IF EXISTS "admin_relation_write" ON object_relation;
DROP POLICY IF EXISTS "pub_legal_type_read" ON ref_legal_type;
DROP POLICY IF EXISTS "admin_legal_type_write" ON ref_legal_type;
DROP POLICY IF EXISTS "pub_actor_role_read" ON ref_actor_role;
DROP POLICY IF EXISTS "admin_actor_role_write" ON ref_actor_role;
DROP POLICY IF EXISTS "pub_contact_role_read" ON ref_contact_role;
DROP POLICY IF EXISTS "admin_contact_role_write" ON ref_contact_role;
DROP POLICY IF EXISTS "pub_object_relation_type_read" ON ref_object_relation_type;
DROP POLICY IF EXISTS "admin_object_relation_type_write" ON ref_object_relation_type;
DROP POLICY IF EXISTS "pub_tag_read" ON ref_tag;
DROP POLICY IF EXISTS "admin_tag_write" ON ref_tag;
DROP POLICY IF EXISTS "pub_tag_link_read" ON tag_link;
DROP POLICY IF EXISTS "admin_tag_link_write" ON tag_link;
DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code;
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code;
-- Partition default ref_code_other (peut ne pas apparaître comme héritée selon l'état DB)
DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_other;
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_other;

-- Lecture publique pour toutes les tables de référence
CREATE POLICY "Lecture publique des langues" ON ref_language
    FOR SELECT USING (true);

CREATE POLICY "Lecture publique des moyens de paiement" ON ref_code_payment_method
    FOR SELECT USING (true);

CREATE POLICY "Lecture publique des tags d'environnement" ON ref_code_environment_tag
    FOR SELECT USING (true);

CREATE POLICY "Lecture publique des équipements" ON ref_amenity
    FOR SELECT USING (true);

-- policies for legacy classification refs removed
CREATE POLICY "Lecture publique des schémas de classification" ON ref_classification_scheme
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des valeurs de classification" ON ref_classification_value
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des métriques de capacité" ON ref_capacity_metric
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des applicabilités de capacité" ON ref_capacity_applicability
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des documents de référence" ON ref_document
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des catégories DD" ON ref_sustainability_action_category
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des actions DD" ON ref_sustainability_action
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des traductions" ON i18n_translation
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des rôles d'organisation" ON ref_org_role
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des sources d'avis" ON ref_review_source
    FOR SELECT USING (true);
CREATE POLICY "Lecture publique des types de vue" ON ref_code_view_type
    FOR SELECT USING (true);

CREATE POLICY "Lecture publique des tags média" ON ref_code_media_tag
    FOR SELECT USING (true);

-- Écriture réservée aux rôles admin et service_role
CREATE POLICY "Écriture admin des langues" ON ref_language
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Écriture admin des moyens de paiement" ON ref_code_payment_method
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Écriture admin des tags d'environnement" ON ref_code_environment_tag
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Écriture admin des équipements" ON ref_amenity
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

-- write policies for legacy classification refs removed
CREATE POLICY "Écriture admin des schémas de classification" ON ref_classification_scheme
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des valeurs de classification" ON ref_classification_value
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des métriques de capacité" ON ref_capacity_metric
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des applicabilités de capacité" ON ref_capacity_applicability
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des documents de référence" ON ref_document
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des catégories DD" ON ref_sustainability_action_category
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des actions DD" ON ref_sustainability_action
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des traductions" ON i18n_translation
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des sources d'avis" ON ref_review_source
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Écriture admin des types de vue" ON ref_code_view_type
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

-- =====================================================
-- 3. POLITIQUES POUR LES TABLES PRINCIPALES
-- =====================================================

-- Profil utilisateur applicatif: self-service + admin/service_role
CREATE POLICY "Lecture de son profil utilisateur" ON app_user_profile
  FOR SELECT USING (
    id = auth.uid()
    OR api.is_platform_owner()
  );

CREATE POLICY "Insertion de son profil utilisateur" ON app_user_profile
  FOR INSERT WITH CHECK (
    id = auth.uid()
    OR api.is_platform_owner()
  );

CREATE POLICY "Mise à jour de son profil utilisateur" ON app_user_profile
  FOR UPDATE
  USING (
    id = auth.uid()
    OR api.is_platform_owner()
  )
  WITH CHECK (
    id = auth.uid()
    OR api.is_platform_owner()
  );

CREATE POLICY "Administration des profils utilisateur" ON app_user_profile
  FOR DELETE USING (
    api.is_platform_owner()
  );

-- Objets: published pour tous, sinon accès étendu (acteur org)
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Lecture publique des objets" ON object; EXCEPTION WHEN others THEN NULL; END;
END $$;
CREATE POLICY "public_objects_published" ON object
  FOR SELECT USING (status = 'published');
CREATE POLICY "extended_objects_org_actor" ON object
  FOR SELECT USING (api.can_read_extended(id));
-- Lecture publique des référentiels ITI
CREATE POLICY "Lecture publique des pratiques ITI" ON ref_code_iti_practice FOR SELECT USING (true);
CREATE POLICY "Lecture publique des rôles ITI" ON ref_iti_assoc_role FOR SELECT USING (true);
CREATE POLICY "Lecture publique des profils ITI" ON object_iti_profile FOR SELECT USING (true);
-- Localisation tables
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Lecture publique des adresses" ON address; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Lecture publique des localisations" ON location; EXCEPTION WHEN others THEN NULL; END;
END $$;
CREATE POLICY "Lecture publique des localisations" ON object_location FOR SELECT USING (true);
CREATE POLICY "Lecture publique des places" ON object_place FOR SELECT USING (true);
-- Contacts: publics seulement si is_public, sinon accès étendu
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Lecture publique des contacts" ON contact_channel; EXCEPTION WHEN others THEN NULL; END;
END $$;
CREATE POLICY "pub_contacts_public" ON contact_channel
  FOR SELECT USING (is_public IS TRUE);
CREATE POLICY "ext_contacts_org_actor" ON contact_channel
  FOR SELECT USING (api.can_read_extended(object_id));

-- Médias: publiés pour tous, autres via accès étendu
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Lecture publique des médias" ON media; EXCEPTION WHEN others THEN NULL; END;
END $$;
CREATE POLICY "pub_media_published" ON media
  FOR SELECT USING (is_published IS TRUE);
CREATE POLICY "ext_media_org_actor" ON media
  FOR SELECT USING (api.can_read_extended(object_id));
-- Pas de lecture publique pour les identifiants externes
CREATE POLICY "Lecture restreinte identifiants externes" ON object_external_id FOR SELECT USING (
    auth.role() IN ('service_role','admin')
);

-- Drop if exists then (re)create, as CREATE POLICY lacks IF NOT EXISTS in PG versions
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "pub_descriptions_public" ON object_description; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "ext_descriptions_org_actor" ON object_description; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "ext_private_descriptions_org_actor" ON object_private_description; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "ext_legal_org_actor" ON object_legal; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "ext_discounts_org_actor" ON object_discount; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "ext_group_policies_org_actor" ON object_group_policy; EXCEPTION WHEN others THEN NULL; END;
END $$;

CREATE POLICY "pub_descriptions_public" ON object_description
  FOR SELECT USING (visibility = 'public');
CREATE POLICY "ext_descriptions_org_actor" ON object_description
  FOR SELECT USING (api.can_read_extended(object_id));

CREATE POLICY "ext_private_descriptions_org_actor" ON object_private_description
  FOR SELECT USING (api.can_read_extended(object_id));

-- Légal, réductions & politiques groupe: accès étendu uniquement
CREATE POLICY "ext_legal_org_actor" ON object_legal
  FOR SELECT USING (api.can_read_extended(object_id));
CREATE POLICY "ext_discounts_org_actor" ON object_discount
  FOR SELECT USING (api.can_read_extended(object_id));
CREATE POLICY "ext_group_policies_org_actor" ON object_group_policy
  FOR SELECT USING (api.can_read_extended(object_id));

-- =====================================================
-- PHASE 1C: Owner WRITE policies for existing tables
-- =====================================================

-- Owner write policies for object detail tables
CREATE POLICY "owner_write_location" ON object_location
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_place" ON object_place
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_contact" ON contact_channel
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_media" ON media
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_description" ON object_description
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_private_description" ON object_private_description
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_legal" ON object_legal
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_discount" ON object_discount
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "owner_write_group_policy" ON object_group_policy
  FOR ALL USING (api.is_object_owner(object_id));

-- Écriture par propriétaire
CREATE POLICY "Écriture par propriétaire (object)" ON object
    FOR ALL USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Accès admin/service_role
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Accès admin/service_role (object)" ON object; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Accès admin/service_role (object_external_id)" ON object_external_id; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Accès admin/service_role (object_sustainability_action)" ON object_sustainability_action; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Accès admin/service_role (object_sustainability_action_label)" ON object_sustainability_action_label; EXCEPTION WHEN others THEN NULL; END;
END $$;

CREATE POLICY "Accès admin/service_role (object)" ON object
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "Accès admin/service_role (object_external_id)" ON object_external_id
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Accès admin/service_role aux actions DD et leurs labels
CREATE POLICY "Accès admin/service_role (object_sustainability_action)" ON object_sustainability_action
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
CREATE POLICY "Accès admin/service_role (object_sustainability_action_label)" ON object_sustainability_action_label
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Avis (reviews): lecture publique si publiés, écriture admin seulement
CREATE POLICY "Lecture publique des avis" ON object_review
  FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Écriture admin des avis" ON object_review
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin')
  );

-- =====================================================
-- PHASE 1A: SELECT policies for tables with RLS enabled but no policy
-- =====================================================

-- Objets FMA (événements) - lecture publique si publiés
CREATE POLICY "pub_fma_published" ON object_fma
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM object o WHERE o.id = object_fma.object_id AND o.status = 'published')
  );
CREATE POLICY "ext_fma_org_actor" ON object_fma
  FOR SELECT USING (api.can_read_extended(object_id));

-- Itinéraires - lecture publique si publiés
CREATE POLICY "pub_iti_published" ON object_iti
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM object o WHERE o.id = object_iti.object_id AND o.status = 'published')
  );
CREATE POLICY "ext_iti_org_actor" ON object_iti
  FOR SELECT USING (api.can_read_extended(object_id));

-- Données ITI associées - lecture publique
CREATE POLICY "pub_iti_practice_read" ON object_iti_practice
  FOR SELECT USING (true);
CREATE POLICY "pub_iti_stage_read" ON object_iti_stage
  FOR SELECT USING (true);
CREATE POLICY "pub_iti_section_read" ON object_iti_section
  FOR SELECT USING (true);
CREATE POLICY "pub_iti_associated_read" ON object_iti_associated_object
  FOR SELECT USING (true);
CREATE POLICY "pub_iti_info_read" ON object_iti_info
  FOR SELECT USING (true);

-- Zones géographiques - lecture publique
CREATE POLICY "pub_zone_read" ON object_zone
  FOR SELECT USING (true);

-- Classifications - lecture publique
CREATE POLICY "pub_classification_read" ON object_classification
  FOR SELECT USING (true);

-- Capacités - lecture publique
CREATE POLICY "pub_capacity_read" ON object_capacity
  FOR SELECT USING (true);

-- Langues, moyens de paiement, tags - lecture publique
CREATE POLICY "pub_object_language_read" ON object_language
  FOR SELECT USING (true);
CREATE POLICY "pub_payment_method_read" ON object_payment_method
  FOR SELECT USING (true);
CREATE POLICY "pub_environment_tag_read" ON object_environment_tag
  FOR SELECT USING (true);
CREATE POLICY "pub_amenity_read" ON object_amenity
  FOR SELECT USING (true);

-- Liens organisations - lecture publique
CREATE POLICY "pub_org_link_read" ON object_org_link
  FOR SELECT USING (true);

-- Horaires d'ouverture - lecture publique
CREATE POLICY "pub_opening_period_read" ON opening_period
  FOR SELECT USING (true);
CREATE POLICY "pub_opening_schedule_read" ON opening_schedule
  FOR SELECT USING (true);
CREATE POLICY "pub_opening_time_period_read" ON opening_time_period
  FOR SELECT USING (true);
CREATE POLICY "pub_opening_time_period_weekday_read" ON opening_time_period_weekday
  FOR SELECT USING (true);
CREATE POLICY "pub_opening_time_frame_read" ON opening_time_frame
  FOR SELECT USING (true);

-- Types de chambres: lecture publique si publié, accès étendu, écriture propriétaire/admin
CREATE POLICY "Lecture publique des types de chambre" ON object_room_type
  FOR SELECT USING (is_published = TRUE);
CREATE POLICY "Lecture étendue des types de chambre" ON object_room_type
  FOR SELECT USING (api.can_read_extended(object_id));
CREATE POLICY "Écriture types de chambre par propriétaire" ON object_room_type
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    EXISTS (
      SELECT 1 FROM object o
      WHERE o.id = object_room_type.object_id
        AND o.created_by = auth.uid()
    )
  );

CREATE POLICY "Lecture publique amenities chambre" ON object_room_type_amenity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM object_room_type rt
      WHERE rt.id = object_room_type_amenity.room_type_id
        AND rt.is_published = TRUE
    )
  );
CREATE POLICY "Écriture amenities chambre par propriétaire" ON object_room_type_amenity
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    EXISTS (
      SELECT 1 FROM object_room_type rt
      JOIN object o ON o.id = rt.object_id
      WHERE rt.id = object_room_type_amenity.room_type_id
        AND o.created_by = auth.uid()
    )
  );

CREATE POLICY "Lecture publique médias chambre" ON object_room_type_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM object_room_type rt
      WHERE rt.id = object_room_type_media.room_type_id
        AND rt.is_published = TRUE
    )
  );
CREATE POLICY "Écriture médias chambre par propriétaire" ON object_room_type_media
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    EXISTS (
      SELECT 1 FROM object_room_type rt
      JOIN object o ON o.id = rt.object_id
      WHERE rt.id = object_room_type_media.room_type_id
        AND o.created_by = auth.uid()
    )
  );

-- Promotions: lecture publique si actives et publiques, écriture admin
CREATE POLICY "Lecture publique des promotions" ON promotion
  FOR SELECT USING (is_public = TRUE AND is_active = TRUE);
CREATE POLICY "Écriture admin des promotions" ON promotion
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin')
  );

CREATE POLICY "Lecture publique des liaisons promotions" ON promotion_object
  FOR SELECT USING (true);
CREATE POLICY "Écriture admin des liaisons promotions" ON promotion_object
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin')
  );

CREATE POLICY "Lecture admin des usages promotions" ON promotion_usage
  FOR SELECT USING (
    auth.role() IN ('service_role','admin') OR
    auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin')
  );
CREATE POLICY "Écriture admin des usages promotions" ON promotion_usage
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin')
  );

-- =====================================================
-- 4. POLITIQUES POUR AUDIT.AUDIT_LOG
-- =====================================================

-- Lecture réservée aux rôles admin / service_role
CREATE POLICY "Lecture audit (admin/service_role)" ON audit.audit_log
    FOR SELECT USING (
        auth.role() IN ('service_role','admin') OR
        auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin')
    );

-- Insertion autorisée par le rôle courant (triggers côté DB)
-- Note: l'insertion est effectuée par les triggers en contexte de l'utilisateur courant
CREATE POLICY "Insertion via triggers" ON audit.audit_log
    FOR INSERT TO service_role, postgres WITH CHECK (true);

-- Aucune mise à jour/suppression par défaut (omise intentionnellement)
-- (aucune policy UPDATE/DELETE)

-- =====================================================
-- 5. POLITIQUES POUR MEDIA_TAG
-- =====================================================

-- Lecture publique des tags (pour affichage)
CREATE POLICY "Lecture publique des media_tag" ON media_tag
  FOR SELECT USING (true);

-- Écriture réservée aux propriétaires d'objets et admins
CREATE POLICY "Écriture media_tag par propriétaire" ON media_tag
  FOR ALL USING (
    auth.role() IN ('service_role','admin') OR
    EXISTS (
      SELECT 1 FROM media m
      JOIN object o ON o.id = m.object_id
      WHERE m.id = media_tag.media_id
        AND o.created_by = auth.uid()
    )
  );

-- =====================================================
-- PHASE 1B: Enable RLS + add policies for 31 unprotected tables
-- =====================================================

-- ========== SENSITIVE TABLES (Restricted Read) ==========

-- Actor system tables
ALTER TABLE actor ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_object_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_consent ENABLE ROW LEVEL SECURITY;

-- Actor policies: read via extended access or own actor
CREATE POLICY "ext_actor_read" ON actor
  FOR SELECT USING (
    auth.role() IN ('service_role','admin') OR
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM actor_object_role aor 
            JOIN object o ON o.id = aor.object_id 
            WHERE aor.actor_id = actor.id AND api.can_read_extended(o.id))
  );
CREATE POLICY "admin_actor_write" ON actor
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "ext_actor_channel_read" ON actor_channel
  FOR SELECT USING (
    auth.role() IN ('service_role','admin') OR
    actor_id = auth.uid()
  );
CREATE POLICY "admin_actor_channel_write" ON actor_channel
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "ext_actor_object_role_read" ON actor_object_role
  FOR SELECT USING (
    auth.role() IN ('service_role','admin') OR
    actor_id = auth.uid() OR
    api.can_read_extended(object_id)
  );
CREATE POLICY "admin_actor_object_role_write" ON actor_object_role
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Actor consent: own actor only
CREATE POLICY "own_actor_consent_read" ON actor_consent
  FOR SELECT USING (actor_id = auth.uid());
CREATE POLICY "own_actor_consent_write" ON actor_consent
  FOR ALL USING (actor_id = auth.uid());

-- CRM tables: admin only
ALTER TABLE crm_interaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_task ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_crm_interaction" ON crm_interaction
  FOR ALL USING (auth.role() IN ('service_role','admin'));
CREATE POLICY "admin_crm_task" ON crm_task
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Versioning/changes: admin only
ALTER TABLE pending_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_pending_change" ON pending_change
  FOR ALL USING (auth.role() IN ('service_role','admin'));
CREATE POLICY "admin_object_version" ON object_version
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- ========== PUBLIC READ, OWNER/ADMIN WRITE ==========

-- Price tables
ALTER TABLE object_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_price_period ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_price_read" ON object_price
  FOR SELECT USING (true);
CREATE POLICY "owner_price_write" ON object_price
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "pub_price_period_read" ON object_price_period
  FOR SELECT USING (true);
CREATE POLICY "owner_price_period_write" ON object_price_period
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_price op WHERE op.id = object_price_period.price_id 
            AND api.is_object_owner(op.object_id))
  );

-- Menu tables
ALTER TABLE object_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_menu_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_menu_item_dietary_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_menu_item_allergen ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_menu_item_cuisine_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_menu_item_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_menu_read" ON object_menu
  FOR SELECT USING (true);
CREATE POLICY "owner_menu_write" ON object_menu
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "pub_menu_item_read" ON object_menu_item
  FOR SELECT USING (true);
CREATE POLICY "owner_menu_item_write" ON object_menu_item
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu om WHERE om.id = object_menu_item.menu_id 
            AND api.is_object_owner(om.object_id))
  );

CREATE POLICY "pub_menu_item_dietary_read" ON object_menu_item_dietary_tag
  FOR SELECT USING (true);
CREATE POLICY "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi 
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_dietary_tag.menu_item_id 
            AND api.is_object_owner(om.object_id))
  );

CREATE POLICY "pub_menu_item_allergen_read" ON object_menu_item_allergen
  FOR SELECT USING (true);
CREATE POLICY "owner_menu_item_allergen_write" ON object_menu_item_allergen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi 
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_allergen.menu_item_id 
            AND api.is_object_owner(om.object_id))
  );

CREATE POLICY "pub_menu_item_cuisine_read" ON object_menu_item_cuisine_type
  FOR SELECT USING (true);
CREATE POLICY "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi 
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_cuisine_type.menu_item_id 
            AND api.is_object_owner(om.object_id))
  );

CREATE POLICY "pub_menu_item_media_read" ON object_menu_item_media
  FOR SELECT USING (true);
CREATE POLICY "owner_menu_item_media_write" ON object_menu_item_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi 
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_media.menu_item_id 
            AND api.is_object_owner(om.object_id))
  );

-- Meeting room tables
ALTER TABLE object_meeting_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_room_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_meeting_room_read" ON object_meeting_room
  FOR SELECT USING (true);
CREATE POLICY "owner_meeting_room_write" ON object_meeting_room
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "pub_meeting_room_equipment_read" ON meeting_room_equipment
  FOR SELECT USING (true);
CREATE POLICY "owner_meeting_room_equipment_write" ON meeting_room_equipment
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_meeting_room omr 
            WHERE omr.id = meeting_room_equipment.room_id 
            AND api.is_object_owner(omr.object_id))
  );

-- Other object detail tables
ALTER TABLE object_pet_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_fma_occurrence ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_stage_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_pet_policy_read" ON object_pet_policy
  FOR SELECT USING (true);
CREATE POLICY "owner_pet_policy_write" ON object_pet_policy
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "pub_fma_occurrence_read" ON object_fma_occurrence
  FOR SELECT USING (true);
CREATE POLICY "owner_fma_occurrence_write" ON object_fma_occurrence
  FOR ALL USING (api.is_object_owner(object_id));

CREATE POLICY "pub_iti_stage_media_read" ON object_iti_stage_media
  FOR SELECT USING (true);
CREATE POLICY "owner_iti_stage_media_write" ON object_iti_stage_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_iti_stage ois 
            WHERE ois.id = object_iti_stage_media.stage_id 
            AND api.is_object_owner(ois.object_id))
  );

-- Master data tables: public read, admin write
ALTER TABLE object_place_description ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_relation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_place_description_read" ON object_place_description
  FOR SELECT USING (true);
CREATE POLICY "admin_place_description_write" ON object_place_description
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "pub_origin_read" ON object_origin
  FOR SELECT USING (true);
CREATE POLICY "admin_origin_write" ON object_origin
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "pub_relation_read" ON object_relation
  FOR SELECT USING (true);
CREATE POLICY "admin_relation_write" ON object_relation
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Reference tables: public read, admin write
ALTER TABLE ref_legal_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_actor_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_contact_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_object_relation_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_legal_type_read" ON ref_legal_type
  FOR SELECT USING (true);
CREATE POLICY "admin_legal_type_write" ON ref_legal_type
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "pub_actor_role_read" ON ref_actor_role
  FOR SELECT USING (true);
CREATE POLICY "admin_actor_role_write" ON ref_actor_role
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "pub_contact_role_read" ON ref_contact_role
  FOR SELECT USING (true);
CREATE POLICY "admin_contact_role_write" ON ref_contact_role
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "pub_object_relation_type_read" ON ref_object_relation_type
  FOR SELECT USING (true);
CREATE POLICY "admin_object_relation_type_write" ON ref_object_relation_type
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Tag system
ALTER TABLE ref_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_link ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_tag_read" ON ref_tag
  FOR SELECT USING (true);
CREATE POLICY "admin_tag_write" ON ref_tag
  FOR ALL USING (auth.role() IN ('service_role','admin'));

CREATE POLICY "pub_tag_link_read" ON tag_link
  FOR SELECT USING (true);
CREATE POLICY "admin_tag_link_write" ON tag_link
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- ref_code parent table: public read, admin write
CREATE POLICY "pub_ref_code_read" ON ref_code
  FOR SELECT USING (true);
CREATE POLICY "admin_ref_code_write" ON ref_code
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Policies explicites sur la partition default ref_code_other
CREATE POLICY "pub_ref_code_read" ON ref_code_other
  FOR SELECT USING (true);
CREATE POLICY "admin_ref_code_write" ON ref_code_other
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Supabase Table Editor affiche les partitions séparément.
-- On applique explicitement RLS + policies sur toutes les partitions ref_code
-- pour éviter les états "UNRESTRICTED" sur ref_code_*.
DO $$
DECLARE
  v_part RECORD;
BEGIN
  FOR v_part IN
    SELECT ns.nspname AS schema_name, c.relname AS table_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pns ON pns.oid = p.relnamespace
    WHERE pns.nspname = 'public'
      AND p.relname = 'ref_code'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_part.schema_name, v_part.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pub_ref_code_read" ON %I.%I', v_part.schema_name, v_part.table_name);
    EXECUTE format('CREATE POLICY "pub_ref_code_read" ON %I.%I FOR SELECT USING (true)', v_part.schema_name, v_part.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "admin_ref_code_write" ON %I.%I', v_part.schema_name, v_part.table_name);
    EXECUTE format(
      'CREATE POLICY "admin_ref_code_write" ON %I.%I FOR ALL USING (auth.role() IN (''service_role'',''admin''))',
      v_part.schema_name, v_part.table_name
    );
  END LOOP;
END
$$;

-- Même logique pour les partitions object_version (ex: object_version_YYYY_MM)
DO $$
DECLARE
  v_part RECORD;
BEGIN
  FOR v_part IN
    SELECT ns.nspname AS schema_name, c.relname AS table_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pns ON pns.oid = p.relnamespace
    WHERE pns.nspname = 'public'
      AND p.relname = 'object_version'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_part.schema_name, v_part.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "admin_object_version" ON %I.%I', v_part.schema_name, v_part.table_name);
    EXECUTE format(
      'CREATE POLICY "admin_object_version" ON %I.%I FOR ALL USING (auth.role() IN (''service_role'',''admin''))',
      v_part.schema_name, v_part.table_name
    );
  END LOOP;
END
$$;

-- Même logique pour les partitions audit.audit_log (mensuelles + default)
DO $$
DECLARE
  v_part RECORD;
BEGIN
  FOR v_part IN
    SELECT ns.nspname AS schema_name, c.relname AS table_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace pns ON pns.oid = p.relnamespace
    WHERE pns.nspname = 'audit'
      AND p.relname = 'audit_log'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_part.schema_name, v_part.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Lecture audit (admin/service_role)" ON %I.%I', v_part.schema_name, v_part.table_name);
    EXECUTE format(
      'CREATE POLICY "Lecture audit (admin/service_role)" ON %I.%I FOR SELECT USING (auth.role() IN (''service_role'',''admin'') OR auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>''role'' = ''admin''))',
      v_part.schema_name, v_part.table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS "Insertion via triggers" ON %I.%I', v_part.schema_name, v_part.table_name);
    EXECUTE format(
      'CREATE POLICY "Insertion via triggers" ON %I.%I FOR INSERT TO service_role, postgres WITH CHECK (true)',
      v_part.schema_name, v_part.table_name
    );
  END LOOP;
END
$$;

-- =====================================================
-- Tourism CRM extensions (memberships, incidents, publication, audits)
-- =====================================================
ALTER TABLE object_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_result ENABLE ROW LEVEL SECURITY;

-- Membership references
DROP POLICY IF EXISTS "pub_membership_tier_read" ON ref_code_membership_tier;
CREATE POLICY "pub_membership_tier_read" ON ref_code_membership_tier
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_membership_tier_write" ON ref_code_membership_tier;
CREATE POLICY "admin_membership_tier_write" ON ref_code_membership_tier
  FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "pub_membership_campaign_read" ON ref_code_membership_campaign;
CREATE POLICY "pub_membership_campaign_read" ON ref_code_membership_campaign
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_membership_campaign_write" ON ref_code_membership_campaign;
CREATE POLICY "admin_membership_campaign_write" ON ref_code_membership_campaign
  FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "pub_incident_category_read" ON ref_code_incident_category;
CREATE POLICY "pub_incident_category_read" ON ref_code_incident_category
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_incident_category_write" ON ref_code_incident_category;
CREATE POLICY "admin_incident_category_write" ON ref_code_incident_category
  FOR ALL USING (auth.role() IN ('service_role','admin'));

-- Memberships: public read only for active object-level listings
DROP POLICY IF EXISTS "pub_object_membership_read" ON object_membership;
CREATE POLICY "pub_object_membership_read" ON object_membership
  FOR SELECT USING (
    object_id IS NOT NULL
    AND status IN ('invoiced','paid')
    AND (starts_at IS NULL OR starts_at <= CURRENT_DATE)
    AND (ends_at IS NULL OR ends_at >= CURRENT_DATE)
    AND EXISTS (
      SELECT 1
      FROM object o
      WHERE o.id = object_membership.object_id
        AND o.status = 'published'
    )
  );
DROP POLICY IF EXISTS "ext_object_membership_read" ON object_membership;
CREATE POLICY "ext_object_membership_read" ON object_membership
  FOR SELECT USING (
    auth.role() IN ('service_role','admin')
    OR api.can_read_extended(COALESCE(object_id, org_object_id))
  );
DROP POLICY IF EXISTS "owner_object_membership_write" ON object_membership;
CREATE POLICY "owner_object_membership_write" ON object_membership
  FOR ALL USING (
    auth.role() IN ('service_role','admin')
    OR api.is_object_owner(COALESCE(object_id, org_object_id))
  );

-- Incidents, publication workflow, and audit sessions are internal/admin-managed.
DROP POLICY IF EXISTS "admin_incident_report" ON incident_report;
CREATE POLICY "admin_incident_report" ON incident_report
  FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "admin_publication" ON publication;
CREATE POLICY "admin_publication" ON publication
  FOR ALL USING (auth.role() IN ('service_role','admin'));
DROP POLICY IF EXISTS "admin_publication_object" ON publication_object;
CREATE POLICY "admin_publication_object" ON publication_object
  FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "pub_audit_template_read" ON audit_template;
CREATE POLICY "pub_audit_template_read" ON audit_template
  FOR SELECT USING (is_active = TRUE OR auth.role() IN ('service_role','admin'));
DROP POLICY IF EXISTS "admin_audit_template_write" ON audit_template;
CREATE POLICY "admin_audit_template_write" ON audit_template
  FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "pub_audit_criteria_read" ON audit_criteria;
CREATE POLICY "pub_audit_criteria_read" ON audit_criteria
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM audit_template t
      WHERE t.id = audit_criteria.template_id
        AND (t.is_active = TRUE OR auth.role() IN ('service_role','admin'))
    )
  );
DROP POLICY IF EXISTS "admin_audit_criteria_write" ON audit_criteria;
CREATE POLICY "admin_audit_criteria_write" ON audit_criteria
  FOR ALL USING (auth.role() IN ('service_role','admin'));

DROP POLICY IF EXISTS "admin_audit_session" ON audit_session;
CREATE POLICY "admin_audit_session" ON audit_session
  FOR ALL USING (auth.role() IN ('service_role','admin'));
DROP POLICY IF EXISTS "admin_audit_result" ON audit_result;
CREATE POLICY "admin_audit_result" ON audit_result
  FOR ALL USING (auth.role() IN ('service_role','admin'));
