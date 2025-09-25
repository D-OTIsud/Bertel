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
ALTER TABLE legal ENABLE ROW LEVEL SECURITY;
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

-- Lecture publique (via vues API/contrôlées)
CREATE POLICY "Lecture publique des objets" ON object FOR SELECT USING (true);
-- Lecture publique des référentiels ITI
CREATE POLICY "Lecture publique des pratiques ITI" ON ref_iti_practice FOR SELECT USING (true);
CREATE POLICY "Lecture publique des rôles ITI" ON ref_iti_assoc_role FOR SELECT USING (true);
CREATE POLICY "Lecture publique des profils ITI" ON object_iti_profile FOR SELECT USING (true);
CREATE POLICY "Lecture publique des adresses" ON address FOR SELECT USING (true);
CREATE POLICY "Lecture publique des localisations" ON location FOR SELECT USING (true);
CREATE POLICY "Lecture publique des contacts" ON contact_channel FOR SELECT USING (true);
CREATE POLICY "Lecture publique des médias" ON media FOR SELECT USING (true);
-- Pas de lecture publique pour les identifiants externes
CREATE POLICY "Lecture restreinte identifiants externes" ON object_external_id FOR SELECT USING (
    auth.role() IN ('service_role','admin')
);

-- Écriture par propriétaire
CREATE POLICY "Écriture par propriétaire (object)" ON object
    FOR ALL USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Accès admin/service_role
CREATE POLICY "Accès admin/service_role (object)" ON object
-- Accès admin/service_role aux identifiants externes
CREATE POLICY "Accès admin/service_role (object_external_id)" ON object_external_id
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
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'admin' OR
        auth.uid() IN (
            SELECT id FROM auth.users 
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );
