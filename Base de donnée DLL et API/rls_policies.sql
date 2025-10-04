-- =====================================================
-- POLITIQUES RLS (ROW LEVEL SECURITY) SUPABASE
-- =====================================================

-- =====================================================
-- 1. ACTIVATION DE LA SÉCURITÉ AU NIVEAU DES LIGNES
-- =====================================================

-- Activation RLS sur toutes les tables principales
ALTER TABLE object ENABLE ROW LEVEL SECURITY;
ALTER TABLE address ENABLE ROW LEVEL SECURITY;
ALTER TABLE location ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_network ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
-- classification table removed (use object_classification)
-- capacity table removed (using object_capacity)
-- (legacy) ALTER TABLE legal ENABLE ROW LEVEL SECURITY;
-- Current tables
ALTER TABLE object_legal ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_closed_day ENABLE ROW LEVEL SECURITY;
-- object_hot table removed (use object_classification)
ALTER TABLE object_fma ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_iti_practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_iti_assoc_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_associated_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_iti_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_org_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_org_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_description ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_private_description ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_classification_scheme ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_classification_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_external_id ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_capacity_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_capacity_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_sustainability_action_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_sustainability_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_sustainability_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE i18n_translation ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_sustainability_action_label ENABLE ROW LEVEL SECURITY;
-- Commercial policies
ALTER TABLE object_discount ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_group_policy ENABLE ROW LEVEL SECURITY;

-- Activation RLS sur les tables de liaison M:N
ALTER TABLE object_language ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_environment_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_amenity ENABLE ROW LEVEL SECURITY;

-- RLS sur la table d'audit (schéma audit)
ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;

-- Activation RLS sur les tables de référence (lecture publique)
ALTER TABLE ref_language ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_environment_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_amenity ENABLE ROW LEVEL SECURITY;
-- ref_classification_prefectoral / ref_type_hot removed (use schemes/values)

-- =====================================================
-- 1.b FONCTIONS D'AIDE RLS
-- =====================================================

-- Email courant (JWT claims)
CREATE OR REPLACE FUNCTION api.current_user_email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lower((current_setting('request.jwt.claims', true)::json ->> 'email'))
$$;

-- Acteurs liés à l'utilisateur via email dans actor_channel.kind='email'
CREATE OR REPLACE FUNCTION api.user_actor_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT ac.actor_id
  FROM actor_channel ac
  JOIN ref_code_contact_kind ck ON ck.id = ac.kind_id AND ck.code = 'email'
  WHERE lower(ac.value) = api.current_user_email()
$$;

-- Droit étendu si acteur de l'objet ou d'une org parent
CREATE OR REPLACE FUNCTION api.can_read_extended(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_actors AS (
    SELECT * FROM api.user_actor_ids()
  ), parent_orgs AS (
    SELECT ool.org_object_id FROM object_org_link ool WHERE ool.object_id = p_object_id
  )
  SELECT EXISTS (
    SELECT 1 FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT * FROM my_actors)
      AND (aor.object_id = p_object_id OR aor.object_id IN (SELECT org_object_id FROM parent_orgs))
  );
$$;

-- =====================================================
-- 2. POLITIQUES POUR LES TABLES DE RÉFÉRENCE
-- =====================================================

-- Lecture publique pour toutes les tables de référence
CREATE POLICY "Lecture publique des langues" ON ref_language
    FOR SELECT USING (true);

CREATE POLICY "Lecture publique des moyens de paiement" ON ref_payment_method
    FOR SELECT USING (true);

CREATE POLICY "Lecture publique des tags d'environnement" ON ref_environment_tag
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

CREATE POLICY "Écriture admin des moyens de paiement" ON ref_payment_method
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Écriture admin des tags d'environnement" ON ref_environment_tag
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

-- =====================================================
-- 3. POLITIQUES POUR LES TABLES PRINCIPALES
-- =====================================================

-- Objets: published pour tous, sinon accès étendu (acteur org)
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Lecture publique des objets" ON object; EXCEPTION WHEN others THEN NULL; END;
END $$;
CREATE POLICY "public_objects_published" ON object
  FOR SELECT USING (status = 'published');
CREATE POLICY "extended_objects_org_actor" ON object
  FOR SELECT USING (api.can_read_extended(id));
-- Lecture publique des référentiels ITI
CREATE POLICY "Lecture publique des pratiques ITI" ON ref_iti_practice FOR SELECT USING (true);
CREATE POLICY "Lecture publique des rôles ITI" ON ref_iti_assoc_role FOR SELECT USING (true);
CREATE POLICY "Lecture publique des profils ITI" ON object_iti_profile FOR SELECT USING (true);
CREATE POLICY "Lecture publique des adresses" ON address FOR SELECT USING (true);
CREATE POLICY "Lecture publique des localisations" ON location FOR SELECT USING (true);
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
    FOR INSERT WITH CHECK (true);

-- Aucune mise à jour/suppression par défaut (omise intentionnellement)
-- (aucune policy UPDATE/DELETE)
