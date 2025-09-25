# Diagramme ER - Modélisation Unifiée Supabase

## Vue d'ensemble

```mermaid
erDiagram
    %% Table maître
    OBJECT {
        text id PK "Identifiant fonctionnel stable"
        object_type object_type "Type d'objet (HOT, HLO, HPA, VIL, CAMP, RES, etc.)"
        text name "Nom de l'objet"
        timestamptz updated_at_source "Date de mise à jour source"
        timestamptz published_at "Date de publication"
        timestamptz created_at "Date de création"
        timestamptz updated_at "Date de mise à jour"
        uuid created_by FK "Créateur"
        uuid updated_by FK "Modificateur"
    }

    %% Table unifiée d'adresses et localisations
    OBJECT_LOCATION {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet (optionnel)"
        uuid place_id FK "Référence lieu (optionnel)"
        text address1 "Première ligne d'adresse"
        text address1_suite "Suite première ligne"
        text address2 "Deuxième ligne d'adresse"
        text address3 "Troisième ligne d'adresse"
        varchar postcode "Code postal"
        text city "Ville"
        varchar code_insee "Code INSEE"
        text lieu_dit "Lieu-dit"
        text direction "Instructions pour s'y rendre"
        decimal latitude "Latitude"
        decimal longitude "Longitude"
        integer altitude_m "Altitude en mètres"
        boolean is_main_location "Localisation principale"
        integer position "Position d'affichage"
        geography geog2 "Point PostGIS (généré)"
        text city_normalized "Ville normalisée (généré)"
        text address1_normalized "Adresse normalisée (généré)"
        text lieu_dit_normalized "Lieu-dit normalisé (généré)"
        jsonb extra "Métadonnées"
        jsonb address1_i18n "Adresse multilingue"
        jsonb city_i18n "Ville multilingue"
    }

    CONTACT_CHANNEL {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        uuid kind_id FK "Type de canal (ref_code_contact_kind)"
        text value "Valeur du canal"
        boolean is_primary "Canal principal"
        integer position "Position d'affichage"
        text value_raw "Valeur brute"
    }

    SOCIAL_NETWORK {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        social_network_type network_type "Type de réseau"
        text url "URL du réseau"
        boolean is_primary "Réseau principal"
        integer position "Position d'affichage"
        text url_raw "URL brute"
    }

    MEDIA {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        uuid place_id FK "Référence lieu (optionnel)"
        media_type media_type "Type de média"
        text title "Titre"
        text credit "Crédit"
        text url "URL du média"
        text description "Description"
        integer width "Largeur (px)"
        integer height "Hauteur (px)"
        boolean is_main "Média principal"
        boolean is_published "Affiché publiquement"
        date rights_expires_at "Droits valides jusqu'au"
        integer position "Position d'affichage"
        text path_raw "Chemin original"
        text title_raw "Titre brut"
    }

    OBJECT_PLACE {
        uuid id PK "Identifiant unique"
        text object_id FK "Objet parent"
        text name "Nom du lieu"
        text slug "Slug"
        boolean is_primary "Principal"
        integer position "Ordre"
        date effective_from "Effectif depuis"
        date effective_to "Effectif jusqu'à"
        jsonb extra "Métadonnées"
    }

    OBJECT_PLACE_DESCRIPTION {
        uuid id PK "Identifiant unique"
        uuid place_id FK "Lieu"
        text description "Description"
        text description_chapo "Chapo"
        text description_mobile "Mobile"
        text description_edition "Édition"
        text description_offre_hors_zone "Hors zone"
        text sanitary_measures "Mesures sanitaires"
        integer position "Ordre"
    }

    %% Table CLASSIFICATION supprimée (remplacée par OBJECT_CLASSIFICATION)

    %% Classifications extensibles
    REF_CLASSIFICATION_SCHEME {
        uuid id PK "Identifiant unique"
        varchar code UK "Code schéma"
        varchar name "Nom du schéma"
        text description "Description"
    }

    REF_CLASSIFICATION_VALUE {
        uuid id PK "Identifiant unique"
        uuid scheme_id FK "Schéma"
        varchar code "Code valeur"
        varchar name "Nom valeur"
        integer ordinal "Ordre"
        jsonb metadata "Métadonnées"
    }

    OBJECT_CLASSIFICATION {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        uuid scheme_id FK "Schéma"
        uuid value_id FK "Valeur"
        uuid document_id FK "Document de référence"
        date awarded_at "Attribué le"
        date valid_until "Valide jusqu'au"
        text source "Source"
        text note "Note"
    }

    CAPACITY {
        text object_id PK,FK "Référence objet"
        %% Hébergement
        integer total_rooms "Total chambres"
        integer total_beds "Total lits"
        integer family_rooms "Chambres familiales"
        integer pmr_rooms "Chambres PMR"
        integer max_occupancy "Capacité maximale"
        %% Restauration
        integer seating_capacity "Places assises"
        integer covers "Couverts"
        integer terrace_seats "Places terrasse"
        %% Visite
        integer visitor_capacity "Capacité visiteurs"
        integer group_size_limit "Taille max groupe"
        integer daily_visitor_limit "Visiteurs/jour max"
        %% Activité/Loisir
        integer participant_limit "Participants max"
        integer min_participants "Participants min"
        integer equipment_capacity "Capacité équipement"
        %% Événement
        integer audience_capacity "Capacité audience"
        integer standing_capacity "Capacité debout"
        integer parking_spaces "Places parking"
        %% Commerce/Organisation/Itinéraire
        integer customer_capacity "Capacité clients"
        integer storage_capacity "Capacité stockage"
        integer meeting_room_capacity "Capacité salle réunion"
        integer staff_capacity "Capacité personnel"
        integer max_group_size "Taille de groupe max (ITI)"
        varchar difficulty_level "Niveau (ITI)"
        text capacity_raw "Capacité brute"
    }

    %% Référentiel de capacité (extensible)
    REF_CAPACITY_METRIC {
        uuid id PK "Identifiant unique"
        varchar code UK "Code métrique"
        varchar name "Nom métrique"
        varchar unit "Unité"
        text description "Description"
    }

    REF_CAPACITY_APPLICABILITY {
        uuid metric_id FK "Métrique"
        object_type object_type "Type d'objet"
    }

    OBJECT_CAPACITY {
        uuid id PK "Identifiant unique"
        text object_id FK "Objet"
        uuid metric_id FK "Métrique"
        integer value_integer "Valeur"
        varchar unit "Unité (override)"
        date effective_from "Effectif depuis"
        date effective_to "Effectif jusqu'à"
    }

    LEGAL {
        text object_id PK,FK "Référence objet"
        varchar siret "Numéro SIRET"
        varchar siren "Numéro SIREN"
        varchar vat_number "Numéro TVA"
        uuid document_id FK "Document de référence"
        text siret_raw "SIRET brut"
    }

    ACCOMMODATION_LEGAL {
        text object_id PK,FK "Référence objet (hébergement uniquement)"
        varchar tourist_tax_number "Numéro de taxe de séjour"
        date tourist_tax_issued_date "Date d'émission taxe de séjour"
        date tourist_tax_valid_until "Date de validité taxe de séjour"
        varchar accommodation_license_number "Numéro de licence d'hébergement"
        date accommodation_license_issued_date "Date d'émission licence"
        date accommodation_license_valid_until "Date de validité licence"
        uuid document_id FK "Document de référence"
        text tourist_tax_raw "Taxe de séjour brute"
    }

    %% Système d'ouverture riche (remplace OPENING simple)
    OPENING_PERIOD {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        text name "Nom de la période"
        date date_start "Date de début"
        date date_end "Date de fin"
        boolean is_active "Période active"
        integer position "Position d'affichage"
        jsonb extra "Métadonnées"
    }

    OPENING_SCHEDULE {
        uuid id PK "Identifiant unique"
        uuid period_id FK "Période parente"
        text name "Nom du planning"
        text description "Description"
        boolean is_active "Planning actif"
        integer position "Position d'affichage"
        jsonb extra "Métadonnées"
    }

    OPENING_TIME_PERIOD {
        uuid id PK "Identifiant unique"
        uuid schedule_id FK "Planning parent"
        text name "Nom du créneau"
        time start_time "Heure de début"
        time end_time "Heure de fin"
        boolean is_24h "Ouvert 24h/24"
        boolean is_active "Créneau actif"
        integer position "Position d'affichage"
        jsonb extra "Métadonnées"
    }

    OPENING_TIME_PERIOD_WEEKDAY {
        uuid id PK "Identifiant unique"
        uuid time_period_id FK "Créneau horaire"
        weekday weekday "Jour de la semaine"
        boolean is_active "Jour actif"
        integer position "Position d'affichage"
        jsonb extra "Métadonnées"
    }

    OPENING_TIME_FRAME {
        uuid id PK "Identifiant unique"
        uuid time_period_id FK "Créneau horaire"
        date date_start "Date de début"
        date date_end "Date de fin"
        boolean is_active "Plage active"
        jsonb extra "Métadonnées"
    }

    %% Table unifiée de référence avec partitionnement
    REF_CODE {
        uuid id PK "Identifiant unique"
        text domain "Domaine de référence"
        text code UK "Code de référence"
        text name "Nom de référence"
        text description "Description"
        integer position "Position d'affichage"
        boolean is_active "Actif"
        jsonb metadata "Métadonnées"
        jsonb extra "Données additionnelles"
        timestamptz created_at "Date de création"
        timestamptz updated_at "Date de mise à jour"
    }

    %% Tables de référence spécialisées (partitions de REF_CODE)
    REF_CODE_CONTACT_KIND {
        uuid id PK "Partition de ref_code"
        text domain "contact_kind"
        text code UK "Code type de contact"
        text name "Nom du type"
        text description "Description"
    }

    REF_CODE_PAYMENT_METHOD {
        uuid id PK "Partition de ref_code"
        text domain "payment_method"
        text code UK "Code moyen de paiement"
        text name "Nom du moyen"
        text description "Description"
    }

    REF_CODE_ENVIRONMENT_TAG {
        uuid id PK "Partition de ref_code"
        text domain "environment_tag"
        text code UK "Code tag environnement"
        text name "Nom du tag"
        text description "Description"
    }

    REF_CODE_AMENITY_FAMILY {
        uuid id PK "Partition de ref_code"
        text domain "amenity_family"
        text code UK "Code famille équipement"
        text name "Nom de la famille"
        text description "Description"
    }

    REF_AMENITY {
        uuid id PK "Identifiant unique"
        varchar code UK "Code équipement"
        varchar name "Nom de l'équipement"
        uuid family_id FK "Famille d'équipement"
        text description "Description"
        text icon_url "Icône"
        boolean is_active "Actif"
    }

    REF_LANGUAGE {
        uuid id PK "Identifiant unique"
        varchar code UK "Code langue (fr, en, etc.)"
        varchar name "Nom de la langue"
        varchar native_name "Nom natif"
    }

    REF_SUSTAINABILITY_ACTION_CATEGORY {
        uuid id PK "Identifiant unique"
        varchar code UK "Code catégorie"
        varchar name "Nom catégorie"
        text description "Description"
    }

    REF_SUSTAINABILITY_ACTION {
        uuid id PK "Identifiant unique"
        uuid category_id FK "Catégorie"
        varchar code "Code action"
        varchar label "Libellé action"
        text description "Description"
    }

    OBJECT_SUSTAINABILITY_ACTION {
        uuid id PK "Identifiant unique"
        text object_id FK "Objet"
        uuid action_id FK "Action"
        uuid document_id FK "Document de référence"
        text note "Note"
    }

    OBJECT_SUSTAINABILITY_ACTION_LABEL {
        uuid object_sustainability_action_id PK,FK "Action DD objet"
        uuid object_classification_id PK,FK "Classification liée"
    }
    
    REF_DOCUMENT {
        uuid id PK "Identifiant unique"
        text url UK "URL"
        text title "Titre"
        text issuer "Émetteur"
        text description "Description"
        date valid_from "Valide depuis"
        date valid_to "Valide jusqu'à"
    }

    I18N_TRANSLATION {
        uuid id PK "Identifiant unique"
        text target_table "Table cible"
        text target_pk "PK cible (texte)"
        text target_column "Colonne"
        uuid language_id FK "Langue"
        text value_text "Valeur texte"
        jsonb value_json "Valeur JSON"
    }

    REF_CLASSIFICATION_PREFECTORAL {
        uuid id PK "Identifiant unique"
        varchar code UK "Code niveau"
        varchar name UK "Niveau (Non classé, 1 étoile, etc.)"
        integer ordinal "Ordre"
        text picto "Picto"
        text description "Description"
    }

    REF_TYPE_HOT {
        uuid id PK "Identifiant unique"
        varchar code UK "Code type HOT"
        varchar name "Nom du type"
        integer ordinal "Ordre"
        text picto "Picto"
        text description "Description"
    }

    %% Liaisons structure/zone/description
    OBJECT_STRUCTURE {
        text object_id PK,FK "Référence objet"
        text structure_object_id FK "Objet structure"
    }

    OBJECT_ZONE {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        varchar insee_commune "INSEE commune"
        integer position "Ordre"
    }

    OBJECT_DESCRIPTION {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet"
        text description "Description commerciale"
        text description_chapo "Chapo"
        text description_mobile "Description site mobile"
        text description_edition "Description édition"
        text description_offre_hors_zone "Offre hors zone"
        text sanitary_measures "Mesures sanitaires"
        integer position "Ordre"
    }

    %% Identifiants externes (interne, pas exposé API)
    OBJECT_EXTERNAL_ID {
        uuid id PK "Identifiant unique"
        text object_id FK "Objet référencé"
        text organization_object_id FK "Organisation propriétaire"
        text external_id "ID externe"
        timestamptz last_synced_at "Dernière synchro"
        timestamptz created_at "Créé le"
        timestamptz updated_at "MAJ le"
    }

    %% Tables de liaison M:N
    OBJECT_LANGUAGE {
        text object_id PK,FK "Référence objet"
        uuid language_id PK,FK "Référence langue"
    }

    OBJECT_PAYMENT_METHOD {
        text object_id PK,FK "Référence objet"
        uuid payment_method_id PK,FK "Référence moyen de paiement"
    }

    OBJECT_ENVIRONMENT_TAG {
        text object_id PK,FK "Référence objet"
        uuid environment_tag_id PK,FK "Référence tag environnement"
    }

    OBJECT_AMENITY {
        text object_id PK,FK "Référence objet"
        uuid amenity_id PK,FK "Référence équipement"
    }

    %% Tables spécifiques
    OBJECT_HOT {
        text object_id PK,FK "Référence objet"
        uuid type_hot_id FK "Type d'hôtel"
        boolean has_restaurant "A un restaurant"
        boolean has_spa "A un spa"
        boolean has_pool "A une piscine"
        boolean has_parking "A un parking"
        text type_raw "Type brut"
    }

    OBJECT_FMA {
        text object_id PK,FK "Référence objet"
        date event_start_date "Date de début événement"
        date event_end_date "Date de fin événement"
        time event_start_time "Heure de début"
        time event_end_time "Heure de fin"
        boolean is_recurring "Événement récurrent"
        text recurrence_pattern "Motif de récurrence"
        text dates_raw "Dates brutes"
    }

    %% Menus (RES et FMA)
    OBJECT_MENU {
        uuid id PK "Identifiant unique"
        text object_id FK "Référence objet (RES ou FMA)"
        text name "Nom du menu"
        text description "Description"
        integer position "Position d'affichage"
        boolean is_active "Menu actif"
        date valid_from "Valide depuis"
        date valid_to "Valide jusqu'à"
        jsonb extra "Métadonnées"
    }

    OBJECT_MENU_ITEM {
        uuid id PK "Identifiant unique"
        uuid menu_id FK "Menu parent"
        text name "Nom du plat/boisson"
        text description "Description"
        numeric price_amount "Prix"
        numeric price_amount_max "Prix max"
        char currency "Devise (EUR)"
        uuid unit_id FK "Unité de prix"
        integer position "Position dans le menu"
        text note "Note"
        boolean is_available "Disponible"
        jsonb extra "Métadonnées"
    }

    OBJECT_MENU_ITEM_DIETARY_TAG {
        uuid menu_item_id PK,FK "Élément de menu"
        uuid dietary_tag_id PK,FK "Tag alimentaire"
    }

    OBJECT_MENU_ITEM_ALLERGEN {
        uuid menu_item_id PK,FK "Élément de menu"
        uuid allergen_id PK,FK "Allergène"
    }

    OBJECT_MENU_ITEM_CUISINE_TYPE {
        uuid menu_item_id PK,FK "Élément de menu"
        uuid cuisine_type_id PK,FK "Type de cuisine"
    }

    %% Référentiels pour menus
    REF_CODE_MENU_CATEGORY {
        uuid id PK "Identifiant unique"
        text domain "menu_category"
        text code UK "Code catégorie"
        text name "Nom catégorie"
        integer position "Position"
        text icon_url "Icône"
        boolean is_active "Actif"
    }

    REF_CODE_DIETARY_TAG {
        uuid id PK "Identifiant unique"
        text domain "dietary_tag"
        text code UK "Code tag"
        text name "Nom tag"
        integer position "Position"
        text icon_url "Icône"
        boolean is_active "Actif"
    }

    REF_CODE_ALLERGEN {
        uuid id PK "Identifiant unique"
        text domain "allergen"
        text code UK "Code allergène"
        text name "Nom allergène"
        integer position "Position"
        text icon_url "Icône"
        boolean is_active "Actif"
    }

    REF_CODE_CUISINE_TYPE {
        uuid id PK "Identifiant unique"
        text domain "cuisine_type"
        text code UK "Code type de cuisine"
        text name "Nom du type"
        text description "Description"
        integer position "Position"
        boolean is_active "Actif"
    }

    %% Itinéraires (ITI)
    OBJECT_ITI {
        text object_id PK,FK "Objet ITI"
        decimal distance_km "Distance (km)"
        decimal duration_hours "Durée (h)"
        integer difficulty_level "Difficulté (1..5)"
        integer elevation_gain "Dénivelé (m)"
        boolean is_loop "Boucle"
        geography geom "Trajet principal (LINESTRING)"
    }

    REF_ITI_PRACTICE {
        uuid id PK
        varchar code UK
        varchar name
        text description
    }

    OBJECT_ITI_PRACTICE {
        text object_id FK
        uuid practice_id FK
    }

    REF_ITI_ASSOC_ROLE {
        uuid id PK
        varchar code UK
        varchar name
        text description
    }

    OBJECT_ITI_ASSOCIATED_OBJECT {
        text object_id FK "ITI"
        text associated_object_id FK "Objet associé"
        uuid role_id FK "Rôle"
        text note
    }

    OBJECT_ITI_STAGE {
        uuid id PK
        text object_id FK
        text name
        text description
        integer position
        geography geom "Coordonnées de l'étape (POINT)"
    }

    OBJECT_ITI_STAGE_MEDIA {
        uuid id PK
        uuid stage_id FK "Étape"
        uuid media_id FK "Média"
        integer position "Ordre d'affichage"
    }

    OBJECT_ITI_SECTION {
        uuid id PK
        text parent_object_id FK
        text name
        integer position
        geography geom
    }

    OBJECT_ITI_INFO {
        text object_id PK,FK
        text access
        text ambiance
        text recommended_parking
        text required_equipment
        text info_places
        boolean is_child_friendly
    }

    OBJECT_ITI_PROFILE {
        text object_id FK
        numeric position_m
        numeric elevation_m
    }

    %% Audit
    AUDIT_LOG {
        bigint id PK "Identifiant unique"
        text table_name "Table modifiée"
        text operation "Opération (UPDATE/DELETE)"
        jsonb row_pk "Clé primaire (si disponible)"
        jsonb before_data "Données avant"
        jsonb after_data "Données après"
        timestamptz changed_at "Horodatage"
        text changed_by "Utilisateur"
    }

    %% Modération et workflow d'approbation
    PENDING_CHANGE {
        uuid id PK "Identifiant unique"
        text object_id FK "Objet concerné"
        text target_table "Table cible"
        text target_pk "Clé primaire cible"
        text action "Action (insert/update/delete)"
        jsonb payload "Données à insérer/modifier"
        text status "Statut (pending/approved/rejected/applied)"
        uuid submitted_by FK "Soumis par"
        timestamptz submitted_at "Date de soumission"
        uuid reviewed_by FK "Révisé par"
        timestamptz reviewed_at "Date de révision"
        text review_note "Note de révision"
        timestamptz applied_at "Date d'application"
        jsonb metadata "Métadonnées"
    }

    %% Relations
    OBJECT ||--o{ OBJECT_LOCATION : "a des localisations"
    OBJECT_LOCATION ||--o| OBJECT : "référence objet (optionnel)"
    OBJECT_LOCATION ||--o| OBJECT_PLACE : "référence lieu (optionnel)"
    OBJECT ||--o{ CONTACT_CHANNEL : "a des canaux de contact"
    OBJECT ||--o{ SOCIAL_NETWORK : "a des réseaux sociaux"
    OBJECT ||--o{ MEDIA : "a des médias"
    OBJECT ||--o{ OBJECT_CLASSIFICATION : "a des classements/labels"
    OBJECT ||--o{ OBJECT_CAPACITY : "a des capacités"
    OBJECT ||--o| LEGAL : "a des informations légales"
    OBJECT ||--o| ACCOMMODATION_LEGAL : "a des informations légales d'hébergement"
    OBJECT ||--o{ OPENING_PERIOD : "a des périodes d'ouverture"
    OBJECT ||--o{ PENDING_CHANGE : "a des changements en attente"
    OBJECT ||--o| OBJECT_STRUCTURE : "rattaché à une structure"
    OBJECT ||--o{ OBJECT_ZONE : "a des zones"
    OBJECT ||--o{ OBJECT_DESCRIPTION : "a des descriptions"
    OBJECT ||--o{ OBJECT_PLACE : "a des lieux (meeting points)"
    OBJECT_PLACE ||--o{ OBJECT_PLACE_DESCRIPTION : "a des descriptions"
    OBJECT_PLACE ||--o{ MEDIA : "a des médias (via place_id)"

    OBJECT ||--o{ OBJECT_LANGUAGE : "parle des langues"
    OBJECT ||--o{ OBJECT_PAYMENT_METHOD : "accepte des moyens de paiement"
    OBJECT ||--o{ OBJECT_ENVIRONMENT_TAG : "a des tags d'environnement"
    OBJECT ||--o{ OBJECT_AMENITY : "a des équipements"
    OBJECT ||--o{ OBJECT_EXTERNAL_ID : "a des IDs externes"
    OBJECT ||--o{ OBJECT_EXTERNAL_ID : "est org propriétaire (organization_object_id)"

    OBJECT ||--o| OBJECT_HOT : "est un hôtel"
    OBJECT ||--o| OBJECT_FMA : "est une manifestation"
    OBJECT ||--o| OBJECT_ITI : "est un itinéraire"
    OBJECT ||--o{ OBJECT_MENU : "a des menus (RES/FMA)"

    REF_LANGUAGE ||--o{ OBJECT_LANGUAGE : "est parlée par"
    REF_CODE_PAYMENT_METHOD ||--o{ OBJECT_PAYMENT_METHOD : "est accepté par"
    REF_CODE_ENVIRONMENT_TAG ||--o{ OBJECT_ENVIRONMENT_TAG : "est associé à"
    REF_AMENITY ||--o{ OBJECT_AMENITY : "est utilisé par"
    REF_CODE_AMENITY_FAMILY ||--o{ REF_AMENITY : "famille d'équipement"
    REF_CODE_CONTACT_KIND ||--o{ CONTACT_CHANNEL : "type de canal"

    REF_CLASSIFICATION_PREFECTORAL ||--o{ CLASSIFICATION : "classifie"
    REF_TYPE_HOT ||--o{ OBJECT_HOT : "type d'hôtel"
    REF_CLASSIFICATION_SCHEME ||--o{ REF_CLASSIFICATION_VALUE : "définit des valeurs"
    REF_CLASSIFICATION_SCHEME ||--o{ OBJECT_CLASSIFICATION : "schéma utilisé"
    REF_CLASSIFICATION_VALUE ||--o{ OBJECT_CLASSIFICATION : "valeur attribuée"
    REF_DOCUMENT ||--o{ OBJECT_CLASSIFICATION : "justifie"
    REF_DOCUMENT ||--o{ LEGAL : "justifie"
    REF_DOCUMENT ||--o{ ACCOMMODATION_LEGAL : "justifie"
    REF_SUSTAINABILITY_ACTION_CATEGORY ||--o{ REF_SUSTAINABILITY_ACTION : "catégorise"
    REF_SUSTAINABILITY_ACTION ||--o{ OBJECT_SUSTAINABILITY_ACTION : "mise en place"
    OBJECT_SUSTAINABILITY_ACTION ||--o{ OBJECT_SUSTAINABILITY_ACTION_LABEL : "a pour labels"
    OBJECT_CLASSIFICATION ||--o{ OBJECT_SUSTAINABILITY_ACTION_LABEL : "référence"
    REF_CAPACITY_METRIC ||--o{ REF_CAPACITY_APPLICABILITY : "applicable à"
    REF_CAPACITY_METRIC ||--o{ OBJECT_CAPACITY : "valorisée par"
    REF_ITI_PRACTICE ||--o{ OBJECT_ITI_PRACTICE : "pratiques"
    REF_ITI_STAGE ||--o{ OBJECT_ITI_STAGE : "étapes"
    REF_ITI_SECTION ||--o{ OBJECT_ITI_SECTION : "sections"
    REF_ITI_ASSOCIATED_OBJECT ||--o{ OBJECT_ITI_ASSOCIATED_OBJECT : "objets associés"
    
    OBJECT_ITI ||--o{ OBJECT_ITI_STAGE : "a des étapes"
    OBJECT_ITI_STAGE ||--o{ OBJECT_ITI_STAGE_MEDIA : "a des médias"
    MEDIA ||--o{ OBJECT_ITI_STAGE_MEDIA : "est associé à des étapes"
    REF_ITI_INFO ||--o{ OBJECT_ITI_INFO : "infos ITI"
    REF_ITI_PROFILE ||--o{ OBJECT_ITI_PROFILE : "profil altimétrique"

    %% Relations système d'ouverture riche
    OPENING_PERIOD ||--o{ OPENING_SCHEDULE : "a des plannings"
    OPENING_SCHEDULE ||--o{ OPENING_TIME_PERIOD : "a des créneaux"
    OPENING_TIME_PERIOD ||--o{ OPENING_TIME_PERIOD_WEEKDAY : "a des jours"
    OPENING_TIME_PERIOD ||--o{ OPENING_TIME_FRAME : "a des plages"

    %% Relations menus
    OBJECT_MENU ||--o{ OBJECT_MENU_ITEM : "contient des éléments"
    REF_CODE_MENU_CATEGORY ||--o{ OBJECT_MENU_ITEM : "catégorise"
    REF_CODE_PRICE_UNIT ||--o{ OBJECT_MENU_ITEM : "unité de prix"
    REF_CODE_DIETARY_TAG ||--o{ OBJECT_MENU_ITEM_DIETARY_TAG : "tags alimentaires"
    OBJECT_MENU_ITEM ||--o{ OBJECT_MENU_ITEM_DIETARY_TAG : "a des tags"
    REF_CODE_ALLERGEN ||--o{ OBJECT_MENU_ITEM_ALLERGEN : "allergènes"
    OBJECT_MENU_ITEM ||--o{ OBJECT_MENU_ITEM_ALLERGEN : "contient des allergènes"
    REF_CODE_CUISINE_TYPE ||--o{ OBJECT_MENU_ITEM_CUISINE_TYPE : "types de cuisine"
    OBJECT_MENU_ITEM ||--o{ OBJECT_MENU_ITEM_CUISINE_TYPE : "a des types de cuisine"
    %% L'audit est indépendant et alimenté par triggers

    %% CRM
    CRM_PERSON {
        uuid id PK
        text object_id FK "Account (object)"
        text first_name
        text last_name
        text job_title
        boolean is_primary
        text notes
    }

    CRM_PERSON_CHANNEL {
        uuid id PK
        uuid person_id FK
        contact_kind kind
        text value
        boolean is_primary
        integer position
        text value_raw
    }

    CRM_INTERACTION {
        uuid id PK
        text object_id FK
        uuid person_id FK
        crm_interaction_type interaction_type
        crm_direction direction
        crm_status status
        text subject
        text body
        text source
        timestamptz occurred_at
        timestamptz due_at
        integer duration_min
        uuid owner FK
    }

    CRM_TASK {
        uuid id PK
        text object_id FK
        uuid person_id FK
        text title
        text description
        crm_task_status status
        crm_task_priority priority
        timestamptz due_at
        uuid owner FK
        uuid related_interaction_id FK
    }

    CRM_PIPELINE {
        uuid id PK
        text code UK
        text name
        integer position
    }

    CRM_STAGE {
        uuid id PK
        uuid pipeline_id FK
        text code
        text name
        integer position
        integer probability
    }

    CRM_DEAL {
        uuid id PK
        text object_id FK
        uuid person_id FK
        uuid pipeline_id FK
        uuid stage_id FK
        text title
        numeric amount
        char currency
        date expected_close
        crm_deal_status status
        text lost_reason
        uuid owner FK
        text source
    }

    CRM_PERSON_CONSENT {
        uuid person_id PK,FK
        crm_consent_channel channel PK
        boolean consent_given
        timestamptz timestamp
        text source
        uuid document_id FK
    }

    OBJECT ||--o{ CRM_PERSON : "a des contacts"
    CRM_PERSON ||--o{ CRM_PERSON_CHANNEL : "a des coordonnées"
    OBJECT ||--o{ CRM_INTERACTION : "a des interactions"
    CRM_PERSON ||--o{ CRM_INTERACTION : "ciblé par"
    OBJECT ||--o{ CRM_TASK : "a des tâches"
    CRM_INTERACTION ||--o{ CRM_TASK : "crée des tâches"
    CRM_PIPELINE ||--o{ CRM_STAGE : "a des étapes"
    CRM_STAGE ||--o{ CRM_DEAL : "a des deals"
    OBJECT ||--o{ CRM_DEAL : "a des deals"
    CRM_PERSON ||--o{ CRM_DEAL : "impliqué dans"
    REF_DOCUMENT ||--o{ CRM_PERSON_CONSENT : "preuve"
```

## Légende des relations

- `