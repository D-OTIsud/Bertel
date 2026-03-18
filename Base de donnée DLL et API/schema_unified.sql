

-- Classements/labels extensibles par schéma (moved to after object table creation)


-- =====================================================
-- TOURISM CRM - SCHÉMA UNIFIÉ (MONOLITHIQUE)
-- Fichier : tourism_crm_schema_updated (2).sql
-- Description : Schéma complet, idempotent, incluant toutes les tables (y compris celles qui manquaient)
-- =====================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- Schémas
CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS internal;

-- Séquence pour ID fonctionnels
CREATE SEQUENCE IF NOT EXISTS object_id_seq START 1;

-- =====================================================
-- Fonctions utilitaires
-- =====================================================

-- immutable_unaccent
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT extensions.unaccent($1);
$$;

-- to_base36
CREATE OR REPLACE FUNCTION api.to_base36(n BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
    digits CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    q BIGINT := n;
    r INT;
    out TEXT := '';
BEGIN
    IF q = 0 THEN
        RETURN '0';
    END IF;
    WHILE q > 0 LOOP
        r := (q % 36)::INT;
        out := substr(digits, r + 1, 1) || out;
        q := q / 36;
    END LOOP;
    RETURN out;
END;
$$;

-- generate_object_id (HOTAQU000V5014ZU-like)
CREATE OR REPLACE FUNCTION api.generate_object_id(p_object_type TEXT, p_region_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
    digits CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    q BIGINT;
    r INT;
    out TEXT := '';
    seq BIGINT;
    prefix TEXT;
BEGIN
    prefix := upper(left(p_object_type, 3)) || upper(right(lpad(p_region_code, 3, 'X'), 3));
    seq := nextval('object_id_seq');
    q := seq;
    IF q = 0 THEN
      out := '0';
    ELSE
      WHILE q > 0 LOOP
        r := (q % 36)::INT;
        out := substr(digits, r + 1, 1) || out;
        q := q / 36;
      END LOOP;
    END IF;
    RETURN prefix || lpad(out, 10, '0');
END;
$$;

-- update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Object-specific updated_at guard: ignore cache-only updates.
CREATE OR REPLACE FUNCTION update_object_updated_at_business()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF (
    to_jsonb(NEW) - ARRAY[
      'updated_at',
      'is_editing',
      'commercial_visibility',
      'cached_min_price',
      'cached_main_image_url',
      'cached_rating',
      'cached_review_count',
      'cached_is_open_now',
      'cached_amenity_codes',
      'cached_payment_codes',
      'cached_environment_tags',
      'cached_language_codes',
      'cached_classification_codes',
      'current_version'
    ]
  ) IS NOT DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'updated_at',
      'is_editing',
      'commercial_visibility',
      'cached_min_price',
      'cached_main_image_url',
      'cached_rating',
      'cached_review_count',
      'cached_is_open_now',
      'cached_amenity_codes',
      'cached_payment_codes',
      'cached_environment_tags',
      'cached_language_codes',
      'cached_classification_codes',
      'current_version'
    ]
  ) THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Types
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'object_type'
  ) THEN
    CREATE TYPE object_type AS ENUM (
      'RES','PCU','PNA','ORG','ITI','VIL','HPA','ASC','COM','HOT','HLO','LOI','FMA','CAMP','PSV','RVA'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'object_status'
  ) THEN
    CREATE TYPE object_status AS ENUM ('draft','published','archived','hidden');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'crm_interaction_type'
  ) THEN
    CREATE TYPE crm_interaction_type AS ENUM ('call','email','meeting','visit','whatsapp','sms','note','other');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'crm_direction'
  ) THEN
    CREATE TYPE crm_direction AS ENUM ('inbound','outbound','internal');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'crm_status'
  ) THEN
    CREATE TYPE crm_status AS ENUM ('planned','done','canceled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'crm_task_status'
  ) THEN
    CREATE TYPE crm_task_status AS ENUM ('todo','in_progress','done','canceled','blocked');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'crm_task_priority'
  ) THEN
    CREATE TYPE crm_task_priority AS ENUM ('low','medium','high','urgent');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'crm_consent_channel'
  ) THEN
    CREATE TYPE crm_consent_channel AS ENUM ('email','phone','sms','whatsapp','postal');
  END IF;
END $$;

-- =====================================================
-- ref_code partitionné
-- =====================================================
CREATE TABLE IF NOT EXISTS ref_code (
  id UUID DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER,
  icon_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from DATE,
  valid_to DATE,
  parent_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for reference data
  name_i18n JSONB,
  description_i18n JSONB,
  name_normalized TEXT GENERATED ALWAYS AS (immutable_unaccent(lower(name))) STORED,
  PRIMARY KEY (id, domain)
) PARTITION BY LIST (domain);

-- Ensure description column exists for existing installations
ALTER TABLE IF EXISTS ref_code ADD COLUMN IF NOT EXISTS description TEXT;

-- Drop legacy normalized column and enforce normalization via CHECK
ALTER TABLE IF EXISTS ref_code DROP COLUMN IF EXISTS code_normalized;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ref_code_code_normalized'
      AND conrelid = 'ref_code'::regclass
  ) THEN
    ALTER TABLE ref_code
      ADD CONSTRAINT chk_ref_code_code_normalized
      CHECK (code = immutable_unaccent(lower(code)));
  END IF;
END $$;

-- Partitions courantes
CREATE TABLE IF NOT EXISTS ref_code_contact_kind PARTITION OF ref_code FOR VALUES IN ('contact_kind');
CREATE TABLE IF NOT EXISTS ref_code_media_type PARTITION OF ref_code FOR VALUES IN ('media_type');
CREATE TABLE IF NOT EXISTS ref_code_media_tag PARTITION OF ref_code FOR VALUES IN ('media_tag');
CREATE TABLE IF NOT EXISTS ref_code_social_network PARTITION OF ref_code FOR VALUES IN ('social_network');
CREATE TABLE IF NOT EXISTS ref_code_weekday PARTITION OF ref_code FOR VALUES IN ('weekday');
CREATE TABLE IF NOT EXISTS ref_code_language_level PARTITION OF ref_code FOR VALUES IN ('language_level');
CREATE TABLE IF NOT EXISTS ref_code_amenity_family PARTITION OF ref_code FOR VALUES IN ('amenity_family');
CREATE TABLE IF NOT EXISTS ref_code_payment_method PARTITION OF ref_code FOR VALUES IN ('payment_method');
CREATE TABLE IF NOT EXISTS ref_code_environment_tag PARTITION OF ref_code FOR VALUES IN ('environment_tag');
CREATE TABLE IF NOT EXISTS ref_code_price_kind PARTITION OF ref_code FOR VALUES IN ('price_kind');
CREATE TABLE IF NOT EXISTS ref_code_price_unit PARTITION OF ref_code FOR VALUES IN ('price_unit');
CREATE TABLE IF NOT EXISTS ref_code_meeting_equipment PARTITION OF ref_code FOR VALUES IN ('meeting_equipment');
CREATE TABLE IF NOT EXISTS ref_code_opening_schedule_type PARTITION OF ref_code FOR VALUES IN ('opening_schedule_type');
CREATE TABLE IF NOT EXISTS ref_code_iti_practice PARTITION OF ref_code FOR VALUES IN ('iti_practice');
CREATE TABLE IF NOT EXISTS ref_code_demand_topic PARTITION OF ref_code FOR VALUES IN ('demand_topic');
CREATE TABLE IF NOT EXISTS ref_code_demand_subtopic PARTITION OF ref_code FOR VALUES IN ('demand_subtopic');
CREATE TABLE IF NOT EXISTS ref_code_mood PARTITION OF ref_code FOR VALUES IN ('mood');
CREATE TABLE IF NOT EXISTS ref_code_menu_category PARTITION OF ref_code FOR VALUES IN ('menu_category');
CREATE TABLE IF NOT EXISTS ref_code_dietary_tag PARTITION OF ref_code FOR VALUES IN ('dietary_tag');
CREATE TABLE IF NOT EXISTS ref_code_allergen PARTITION OF ref_code FOR VALUES IN ('allergen');
CREATE TABLE IF NOT EXISTS ref_code_cuisine_type PARTITION OF ref_code FOR VALUES IN ('cuisine_type');
CREATE TABLE IF NOT EXISTS ref_code_accommodation_type PARTITION OF ref_code FOR VALUES IN ('accommodation_type');
CREATE TABLE IF NOT EXISTS ref_code_tourism_type PARTITION OF ref_code FOR VALUES IN ('tourism_type');
CREATE TABLE IF NOT EXISTS ref_code_transport_type PARTITION OF ref_code FOR VALUES IN ('transport_type');
CREATE TABLE IF NOT EXISTS ref_code_activity_type PARTITION OF ref_code FOR VALUES IN ('activity_type');
CREATE TABLE IF NOT EXISTS ref_code_season_type PARTITION OF ref_code FOR VALUES IN ('season_type');
CREATE TABLE IF NOT EXISTS ref_code_client_type PARTITION OF ref_code FOR VALUES IN ('client_type');
CREATE TABLE IF NOT EXISTS ref_code_service_type PARTITION OF ref_code FOR VALUES IN ('service_type');
CREATE TABLE IF NOT EXISTS ref_code_booking_status PARTITION OF ref_code FOR VALUES IN ('booking_status');
CREATE TABLE IF NOT EXISTS ref_code_promotion_type PARTITION OF ref_code FOR VALUES IN ('promotion_type');
CREATE TABLE IF NOT EXISTS ref_code_document_type PARTITION OF ref_code FOR VALUES IN ('document_type');
CREATE TABLE IF NOT EXISTS ref_code_insurance_type PARTITION OF ref_code FOR VALUES IN ('insurance_type');
CREATE TABLE IF NOT EXISTS ref_code_feedback_type PARTITION OF ref_code FOR VALUES IN ('feedback_type');
CREATE TABLE IF NOT EXISTS ref_code_partnership_type PARTITION OF ref_code FOR VALUES IN ('partnership_type');
CREATE TABLE IF NOT EXISTS ref_code_assistance_type PARTITION OF ref_code FOR VALUES IN ('assistance_type');
CREATE TABLE IF NOT EXISTS ref_code_destination_type PARTITION OF ref_code FOR VALUES IN ('destination_type');
CREATE TABLE IF NOT EXISTS ref_code_event_type PARTITION OF ref_code FOR VALUES IN ('event_type');
CREATE TABLE IF NOT EXISTS ref_code_package_type PARTITION OF ref_code FOR VALUES IN ('package_type');
CREATE TABLE IF NOT EXISTS ref_code_room_type PARTITION OF ref_code FOR VALUES IN ('room_type');
CREATE TABLE IF NOT EXISTS ref_code_view_type PARTITION OF ref_code FOR VALUES IN ('view_type');
CREATE TABLE IF NOT EXISTS ref_code_amenity_type PARTITION OF ref_code FOR VALUES IN ('amenity_type');
CREATE TABLE IF NOT EXISTS ref_code_membership_tier PARTITION OF ref_code FOR VALUES IN ('membership_tier');
CREATE TABLE IF NOT EXISTS ref_code_membership_campaign PARTITION OF ref_code FOR VALUES IN ('membership_campaign');
CREATE TABLE IF NOT EXISTS ref_code_incident_category PARTITION OF ref_code FOR VALUES IN ('incident_category');
CREATE TABLE IF NOT EXISTS ref_code_other PARTITION OF ref_code DEFAULT;

-- Stable weekday mapping: locale-independent day number (1=Mon..7=Sun).
ALTER TABLE IF EXISTS ref_code
  ADD COLUMN IF NOT EXISTS dow_number SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_ref_code_weekday_dow_number'
      AND conrelid = 'ref_code'::regclass
  ) THEN
    ALTER TABLE ref_code
      ADD CONSTRAINT chk_ref_code_weekday_dow_number
      CHECK (
        domain <> 'weekday'
        OR (dow_number BETWEEN 1 AND 7)
      );
  END IF;
END $$;

-- Backfill weekday numeric mapping from canonical weekday code.
UPDATE ref_code
SET dow_number = CASE code
  WHEN 'monday' THEN 1
  WHEN 'tuesday' THEN 2
  WHEN 'wednesday' THEN 3
  WHEN 'thursday' THEN 4
  WHEN 'friday' THEN 5
  WHEN 'saturday' THEN 6
  WHEN 'sunday' THEN 7
  ELSE dow_number
END
WHERE domain = 'weekday'
  AND (
    dow_number IS NULL
    OR dow_number <> CASE code
      WHEN 'monday' THEN 1
      WHEN 'tuesday' THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday' THEN 4
      WHEN 'friday' THEN 5
      WHEN 'saturday' THEN 6
      WHEN 'sunday' THEN 7
      ELSE dow_number
    END
  );

-- Index d'unicité nécessaires sur chaque partition (id & code)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_contact_kind_id ON ref_code_contact_kind (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_media_type_id ON ref_code_media_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_media_tag_id ON ref_code_media_tag (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_social_network_id ON ref_code_social_network (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_weekday_id ON ref_code_weekday (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_language_level_id ON ref_code_language_level (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_amenity_family_id ON ref_code_amenity_family (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_payment_method_id ON ref_code_payment_method (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_environment_tag_id ON ref_code_environment_tag (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_price_kind_id ON ref_code_price_kind (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_price_unit_id ON ref_code_price_unit (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_meeting_equipment_id ON ref_code_meeting_equipment (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_opening_schedule_type_id ON ref_code_opening_schedule_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_practice_id ON ref_code_iti_practice (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_demand_topic_id ON ref_code_demand_topic (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_demand_subtopic_id ON ref_code_demand_subtopic (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_mood_id ON ref_code_mood (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_menu_category_id ON ref_code_menu_category (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_dietary_tag_id ON ref_code_dietary_tag (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_allergen_id ON ref_code_allergen (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_cuisine_type_id ON ref_code_cuisine_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_accommodation_type_id ON ref_code_accommodation_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_tourism_type_id ON ref_code_tourism_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_transport_type_id ON ref_code_transport_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_activity_type_id ON ref_code_activity_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_season_type_id ON ref_code_season_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_client_type_id ON ref_code_client_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_service_type_id ON ref_code_service_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_booking_status_id ON ref_code_booking_status (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_promotion_type_id ON ref_code_promotion_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_document_type_id ON ref_code_document_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_insurance_type_id ON ref_code_insurance_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_feedback_type_id ON ref_code_feedback_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_partnership_type_id ON ref_code_partnership_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_assistance_type_id ON ref_code_assistance_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_destination_type_id ON ref_code_destination_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_event_type_id ON ref_code_event_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_package_type_id ON ref_code_package_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_room_type_id ON ref_code_room_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_view_type_id ON ref_code_view_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_amenity_type_id ON ref_code_amenity_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_membership_tier_id ON ref_code_membership_tier (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_membership_campaign_id ON ref_code_membership_campaign (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_incident_category_id ON ref_code_incident_category (id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_contact_kind_code ON ref_code_contact_kind(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_media_type_code ON ref_code_media_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_media_tag_code ON ref_code_media_tag(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_social_network_code ON ref_code_social_network(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_weekday_code ON ref_code_weekday(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_language_level_code ON ref_code_language_level(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_amenity_family_code ON ref_code_amenity_family(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_payment_method_code ON ref_code_payment_method(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_environment_tag_code ON ref_code_environment_tag(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_price_kind_code ON ref_code_price_kind(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_price_unit_code ON ref_code_price_unit(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_meeting_equipment_code ON ref_code_meeting_equipment(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_opening_schedule_type_code ON ref_code_opening_schedule_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_iti_practice_code ON ref_code_iti_practice(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_demand_topic_code ON ref_code_demand_topic(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_demand_subtopic_code ON ref_code_demand_subtopic(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_mood_code ON ref_code_mood(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_menu_category_code ON ref_code_menu_category(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_dietary_tag_code ON ref_code_dietary_tag(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_allergen_code ON ref_code_allergen(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_cuisine_type_code ON ref_code_cuisine_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_accommodation_type_code ON ref_code_accommodation_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_tourism_type_code ON ref_code_tourism_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_transport_type_code ON ref_code_transport_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_activity_type_code ON ref_code_activity_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_season_type_code ON ref_code_season_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_client_type_code ON ref_code_client_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_service_type_code ON ref_code_service_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_booking_status_code ON ref_code_booking_status(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_promotion_type_code ON ref_code_promotion_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_document_type_code ON ref_code_document_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_insurance_type_code ON ref_code_insurance_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_feedback_type_code ON ref_code_feedback_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_partnership_type_code ON ref_code_partnership_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_assistance_type_code ON ref_code_assistance_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_destination_type_code ON ref_code_destination_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_event_type_code ON ref_code_event_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_package_type_code ON ref_code_package_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_room_type_code ON ref_code_room_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_view_type_code ON ref_code_view_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_amenity_type_code ON ref_code_amenity_type(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_membership_tier_code ON ref_code_membership_tier(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_membership_campaign_code ON ref_code_membership_campaign(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_incident_category_code ON ref_code_incident_category(code);

-- =====================================================
-- Référentiels et i18n
-- =====================================================

CREATE TABLE IF NOT EXISTS ref_language (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(5) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100),
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_language_position ON ref_language(position) WHERE position IS NOT NULL;

CREATE OR REPLACE FUNCTION ref_language_set_position()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.position IS NULL THEN
    LOCK TABLE ref_language IN SHARE ROW EXCLUSIVE MODE;
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position FROM ref_language;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ref_language_set_position') THEN
    CREATE TRIGGER trg_ref_language_set_position BEFORE INSERT ON ref_language FOR EACH ROW EXECUTE FUNCTION ref_language_set_position();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS ref_amenity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  family_id UUID NOT NULL REFERENCES ref_code_amenity_family(id) ON DELETE RESTRICT,
  scope TEXT DEFAULT 'object' CHECK (scope IN ('object','meeting_room','both')),
  description TEXT,
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name_i18n JSONB,
  -- I18n support for description
  description_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);

CREATE TABLE IF NOT EXISTS ref_sustainability_action_category (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name_i18n JSONB,
  -- I18n support for description
  description_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);

CREATE TABLE IF NOT EXISTS ref_sustainability_action (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES ref_sustainability_action_category(id) ON DELETE RESTRICT,
  code VARCHAR(50) NOT NULL,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label_i18n JSONB,
  description_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB,
  UNIQUE(category_id, code)
);

CREATE TABLE IF NOT EXISTS ref_document (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  issuer TEXT,
  description TEXT,
  icon_url TEXT,
  position INTEGER,
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for document content
  title_i18n JSONB,
  issuer_i18n JSONB,
  description_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);

CREATE TABLE IF NOT EXISTS ref_review_source (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon_url TEXT,
  base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link documents to a ref_code document_type when present
-- Revert prior attempt to link documents to ref_code document_type; legal types are handled by ref_legal_type via object_legal
ALTER TABLE IF EXISTS ref_document DROP COLUMN IF EXISTS type_id;
DROP INDEX IF EXISTS idx_ref_document_type_id;

-- Tags libres + liaisons génériques
CREATE TABLE IF NOT EXISTS ref_tag (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  icon_url TEXT,
  position INTEGER,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extra JSONB,
  name_normalized TEXT GENERATED ALWAYS AS (immutable_unaccent(lower(name))) STORED,
  description_normalized TEXT GENERATED ALWAYS AS (
    CASE WHEN description IS NOT NULL THEN immutable_unaccent(lower(description)) END
  ) STORED
);
CREATE TABLE IF NOT EXISTS tag_link (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag_id UUID NOT NULL REFERENCES ref_tag(id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  target_pk TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extra JSONB,
  CONSTRAINT uq_tag_unique_target UNIQUE (tag_id, target_table, target_pk)
);

-- i18n générique
CREATE TABLE IF NOT EXISTS i18n_translation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_table TEXT NOT NULL,
  target_pk TEXT NOT NULL,
  target_column TEXT NOT NULL,
  language_id UUID NOT NULL REFERENCES ref_language(id) ON DELETE RESTRICT,
  value_text TEXT,
  value_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_i18n_value_not_empty CHECK (value_text IS NOT NULL OR value_json IS NOT NULL),
  CONSTRAINT uq_i18n_translation UNIQUE (target_table, target_pk, target_column, language_id)
);

-- Governance guard: avoid dual source-of-truth when table already has a JSONB *_i18n column.
CREATE OR REPLACE FUNCTION validate_i18n_translation_target()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_has_jsonb_i18n BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = NEW.target_table
      AND c.column_name = NEW.target_column || '_i18n'
      AND c.data_type = 'jsonb'
  )
  INTO v_has_jsonb_i18n;

  IF v_has_jsonb_i18n THEN
    RAISE EXCEPTION
      'i18n_translation is blocked for %.% because %.%_i18n exists and is canonical',
      NEW.target_table, NEW.target_column, NEW.target_table, NEW.target_column;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_i18n_translation_target ON i18n_translation;
CREATE TRIGGER trg_validate_i18n_translation_target
BEFORE INSERT OR UPDATE ON i18n_translation
FOR EACH ROW EXECUTE FUNCTION validate_i18n_translation_target();

CREATE OR REPLACE FUNCTION validate_org_object_type()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_column_name TEXT := TG_ARGV[0];
  v_org_id TEXT;
BEGIN
  v_org_id := to_jsonb(NEW)->>v_column_name;

  IF v_org_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM object o
       WHERE o.id = v_org_id
         AND o.object_type = 'ORG'
     ) THEN
    RAISE EXCEPTION '% must reference an ORG object id, got %', v_column_name, v_org_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_classification_single_selection()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_scheme_code TEXT;
BEGIN
  IF NEW.value_id IS NOT NULL
     AND NEW.scheme_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM ref_classification_value v
       WHERE v.id = NEW.value_id
         AND v.scheme_id = NEW.scheme_id
     ) THEN
    RAISE EXCEPTION 'value_id % does not belong to scheme_id %', NEW.value_id, NEW.scheme_id;
  END IF;

  IF NEW.status = 'granted'
     AND EXISTS (
       SELECT 1
       FROM ref_classification_scheme s
       WHERE s.id = NEW.scheme_id
         AND s.selection = 'single'
     )
     AND EXISTS (
       SELECT 1
       FROM object_classification oc
       WHERE oc.object_id = NEW.object_id
         AND oc.scheme_id = NEW.scheme_id
         AND oc.status = 'granted'
         AND oc.id IS DISTINCT FROM NEW.id
     ) THEN
    SELECT s.code
    INTO v_scheme_code
    FROM ref_classification_scheme s
    WHERE s.id = NEW.scheme_id;

    RAISE EXCEPTION 'classification scheme % allows only one granted value per object',
      COALESCE(v_scheme_code, NEW.scheme_id::TEXT);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Classifications
CREATE TABLE IF NOT EXISTS ref_classification_scheme (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url TEXT,
  selection VARCHAR(10) NOT NULL DEFAULT 'single',
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ref_classification_scheme'
      AND c.conname = 'chk_classification_scheme_selection'
  ) THEN
    ALTER TABLE ref_classification_scheme
      ADD CONSTRAINT chk_classification_scheme_selection
      CHECK (selection IN ('single', 'multiple'));
  END IF;
END $$;

ALTER TABLE IF EXISTS ref_classification_scheme
  ADD COLUMN IF NOT EXISTS name_i18n JSONB;
CREATE TABLE IF NOT EXISTS ref_classification_value (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheme_id UUID NOT NULL REFERENCES ref_classification_scheme(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  ordinal INTEGER,
  parent_id UUID REFERENCES ref_classification_value(id) ON DELETE CASCADE,
  metadata JSONB,
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name_i18n JSONB,
  UNIQUE(scheme_id, code)
);

-- =====================================================
-- TABLE MAÎTRE OBJECT
-- =====================================================
CREATE TABLE IF NOT EXISTS object (
  id TEXT PRIMARY KEY,
  object_type object_type NOT NULL,
  name TEXT NOT NULL,
  business_timezone TEXT NOT NULL DEFAULT 'Indian/Reunion',
  commercial_visibility TEXT NOT NULL DEFAULT 'active',
  region_code TEXT CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9]{3}$'),
  updated_at_source TIMESTAMPTZ,
  status object_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  is_editing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name_normalized TEXT GENERATED ALWAYS AS (immutable_unaccent(lower(name))) STORED,
  name_search_vector tsvector GENERATED ALWAYS AS (to_tsvector('french', COALESCE(immutable_unaccent(lower(name)), ''))) STORED,
  -- Cached aggregates for quick lookups (updated by triggers)
  cached_min_price NUMERIC(10,2),
  cached_main_image_url TEXT,
  cached_rating NUMERIC(3,2),
  cached_review_count INTEGER DEFAULT 0,
  cached_is_open_now BOOLEAN,
  cached_amenity_codes TEXT[],
  cached_payment_codes TEXT[],
  cached_environment_tags TEXT[],
  cached_language_codes TEXT[],
  cached_classification_codes TEXT[],
  -- Current version number (for efficient versioning without MAX() scan)
  current_version INTEGER NOT NULL DEFAULT 0,
  extra JSONB,
  name_i18n JSONB,
  CONSTRAINT chk_object_id_shape CHECK (id ~ '^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$'),
  CONSTRAINT chk_object_status CHECK (status IN ('draft','published','archived','hidden')),
  CONSTRAINT chk_object_commercial_visibility CHECK (commercial_visibility IN ('active','lapsed','suspended'))
);

-- Ensure cache columns exist for existing installations
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS business_timezone TEXT;
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS commercial_visibility TEXT;
UPDATE object
SET business_timezone = 'Indian/Reunion'
WHERE business_timezone IS NULL
   OR btrim(business_timezone) = '';
UPDATE object
SET commercial_visibility = 'active'
WHERE commercial_visibility IS NULL
   OR btrim(commercial_visibility) = '';
ALTER TABLE IF EXISTS object ALTER COLUMN business_timezone SET DEFAULT 'Indian/Reunion';
ALTER TABLE IF EXISTS object ALTER COLUMN business_timezone SET NOT NULL;
ALTER TABLE IF EXISTS object ALTER COLUMN commercial_visibility SET DEFAULT 'active';
ALTER TABLE IF EXISTS object ALTER COLUMN commercial_visibility SET NOT NULL;
ALTER TABLE IF EXISTS object DROP CONSTRAINT IF EXISTS chk_object_commercial_visibility;
ALTER TABLE IF EXISTS object
ADD CONSTRAINT chk_object_commercial_visibility
CHECK (commercial_visibility IN ('active','lapsed','suspended'));

ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS cached_amenity_codes TEXT[];
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS cached_payment_codes TEXT[];
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS cached_environment_tags TEXT[];
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS cached_language_codes TEXT[];
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS cached_classification_codes TEXT[];

-- Génération d'ID si absent
CREATE OR REPLACE FUNCTION api.before_insert_object_generate_id()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE v_region TEXT;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    v_region := COALESCE(NEW.region_code, NULLIF(current_setting('app.region_code', true), ''), 'GEN');
    NEW.id := api.generate_object_id((NEW.object_type)::text, v_region);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_before_insert_object_generate_id ON object;
CREATE TRIGGER trg_before_insert_object_generate_id BEFORE INSERT ON object FOR EACH ROW EXECUTE FUNCTION api.before_insert_object_generate_id();

CREATE OR REPLACE FUNCTION api.validate_object_business_timezone()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  NEW.business_timezone := COALESCE(NULLIF(btrim(NEW.business_timezone), ''), 'Indian/Reunion');
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names tzn
    WHERE tzn.name = NEW.business_timezone
  ) THEN
    RAISE EXCEPTION 'Invalid business_timezone: %', NEW.business_timezone
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_validate_object_business_timezone ON object;
CREATE TRIGGER trg_validate_object_business_timezone
BEFORE INSERT OR UPDATE OF business_timezone ON object
FOR EACH ROW
EXECUTE FUNCTION api.validate_object_business_timezone();

-- Mise à jour published_at
CREATE OR REPLACE FUNCTION api.manage_object_published_at()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := NOW();
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_manage_object_published_at ON object;
CREATE TRIGGER trg_manage_object_published_at BEFORE UPDATE ON object FOR EACH ROW EXECUTE FUNCTION api.manage_object_published_at();

-- =====================================================
-- Tables communes
-- =====================================================

-- Address table removed in favor of unified object_location
DROP TABLE IF EXISTS address CASCADE;

CREATE TABLE IF NOT EXISTS object_zone (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  insee_commune VARCHAR(5) NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(object_id, insee_commune)
);

-- Legacy simple location table removed (using unified object_location)

CREATE TABLE IF NOT EXISTS object_place (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  label TEXT,
  slug TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  effective_from DATE,
  effective_to DATE,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_object_place_one_primary ON object_place(object_id) WHERE is_primary;



-- =====================================================
-- Unified Location model (object or place)
-- =====================================================

CREATE TABLE IF NOT EXISTS object_location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT REFERENCES object(id) ON DELETE CASCADE,
  place_id UUID REFERENCES object_place(id) ON DELETE CASCADE,

  -- Address fields
  address1 TEXT,
  address1_suite TEXT,
  address2 TEXT,
  address3 TEXT,
  postcode VARCHAR(10),
  city TEXT,
  code_insee VARCHAR(5),
  lieu_dit TEXT,
  direction TEXT,

  -- Geographic fields
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  altitude_m INTEGER,

  -- Metadata
  is_main_location BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Generated geography point
  geog2 GEOGRAPHY(POINT,4326) GENERATED ALWAYS AS (
    CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8),4326)::geography
    END
  ) STORED,

  -- Full-text search vector for city
  city_search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('french', COALESCE(immutable_unaccent(lower(city)), ''))
  ) STORED,

  -- Constraints
  CONSTRAINT chk_object_or_place CHECK ((object_id IS NOT NULL AND place_id IS NULL) OR (object_id IS NULL AND place_id IS NOT NULL)),
  CONSTRAINT chk_latitude_range_unified CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT chk_longitude_range_unified CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT chk_latlon_both_or_none_unified CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_object_location_object_id ON object_location(object_id);
CREATE INDEX IF NOT EXISTS idx_object_location_place_id ON object_location(place_id);
CREATE INDEX IF NOT EXISTS idx_object_location_geog2 ON object_location USING GIST (geog2);
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_location_main ON object_location(object_id) WHERE is_main_location;
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_location_main_place ON object_location(place_id) WHERE is_main_location;

-- =====================================================
-- Pending changes moderation queue
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_change (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT REFERENCES object(id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  target_pk TEXT,
  action TEXT NOT NULL CHECK (action IN ('insert','update','delete')),
  payload JSONB NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  applied_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_change_object_status ON pending_change(object_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_change_target ON pending_change(target_table, target_pk);
-- Index to support querying validated changes by effective timestamp
DROP INDEX IF EXISTS idx_pending_change_validated_timestamp;
CREATE INDEX IF NOT EXISTS idx_pending_change_validated_effective_ts
ON pending_change (status, (COALESCE(applied_at, reviewed_at)))
WHERE status IN ('approved', 'applied');

DROP TRIGGER IF EXISTS update_pending_change_updated_at ON pending_change;
CREATE TRIGGER update_pending_change_updated_at BEFORE UPDATE ON pending_change FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Maintain object.is_editing based on pending changes lifecycle
CREATE OR REPLACE FUNCTION pending_change_after_insert()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.object_id IS NOT NULL THEN
    UPDATE object SET is_editing = TRUE WHERE id = NEW.object_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pending_change_after_update()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  -- If becomes pending, mark editing
  IF NEW.status = 'pending' AND (OLD.status IS DISTINCT FROM 'pending') AND NEW.object_id IS NOT NULL THEN
    UPDATE object SET is_editing = TRUE WHERE id = NEW.object_id;
  END IF;

  -- If leaves pending, clear when no more pending remain
  IF OLD.status = 'pending' AND NEW.status <> 'pending' AND NEW.object_id IS NOT NULL THEN
    PERFORM 1 FROM pending_change pc WHERE pc.object_id = NEW.object_id AND pc.status = 'pending' LIMIT 1;
    IF NOT FOUND THEN
      UPDATE object SET is_editing = FALSE WHERE id = NEW.object_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pending_change_after_delete()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF OLD.status = 'pending' AND OLD.object_id IS NOT NULL THEN
    PERFORM 1 FROM pending_change pc WHERE pc.object_id = OLD.object_id AND pc.status = 'pending' LIMIT 1;
    IF NOT FOUND THEN
      UPDATE object SET is_editing = FALSE WHERE id = OLD.object_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pending_change_after_insert ON pending_change;
CREATE TRIGGER trg_pending_change_after_insert AFTER INSERT ON pending_change FOR EACH ROW EXECUTE FUNCTION pending_change_after_insert();

DROP TRIGGER IF EXISTS trg_pending_change_after_update ON pending_change;
CREATE TRIGGER trg_pending_change_after_update AFTER UPDATE OF status ON pending_change FOR EACH ROW EXECUTE FUNCTION pending_change_after_update();

DROP TRIGGER IF EXISTS trg_pending_change_after_delete ON pending_change;
CREATE TRIGGER trg_pending_change_after_delete AFTER DELETE ON pending_change FOR EACH ROW EXECUTE FUNCTION pending_change_after_delete();

-- Backfill/compatibility helpers removed with unified locations
-- Ensure ref_contact_role exists before it's referenced
CREATE TABLE IF NOT EXISTS ref_contact_role (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_channel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  kind_id UUID NOT NULL REFERENCES ref_code_contact_kind(id) ON DELETE RESTRICT,
  value TEXT NOT NULL,
  role_id UUID REFERENCES ref_contact_role(id) ON DELETE RESTRICT,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(object_id, kind_id, value),
  CONSTRAINT chk_contact_value_not_empty CHECK (LENGTH(TRIM(value)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_primary ON contact_channel(object_id, kind_id) WHERE is_primary;

-- Media
CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT REFERENCES object(id) ON DELETE CASCADE,
  media_type_id UUID NOT NULL REFERENCES ref_code_media_type(id) ON DELETE RESTRICT,
  title TEXT,
  credit TEXT,
  url TEXT NOT NULL,
  description TEXT,
  analyse_data JSONB,
  width INTEGER,
  height INTEGER,
  is_main BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  rights_expires_at DATE,
  visibility TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title_normalized TEXT GENERATED ALWAYS AS (CASE WHEN title IS NOT NULL THEN immutable_unaccent(lower(title)) END) STORED,
  description_normalized TEXT GENERATED ALWAYS AS (CASE WHEN description IS NOT NULL THEN immutable_unaccent(lower(description)) END) STORED,
  place_id UUID REFERENCES object_place(id) ON DELETE CASCADE,
  kind TEXT,
  title_i18n JSONB,
  description_i18n JSONB,
  CONSTRAINT chk_media_url_not_empty CHECK (LENGTH(TRIM(url)) > 0),
  CONSTRAINT chk_media_visibility CHECK (visibility IS NULL OR visibility IN ('public','private','partners')),
  CONSTRAINT chk_media_kind CHECK (kind IS NULL OR kind IN ('illustration','asset','logo')),
  CONSTRAINT chk_media_target_present CHECK ((object_id IS NOT NULL) <> (place_id IS NOT NULL)),
  CONSTRAINT chk_media_url_shape CHECK (url ~* '^https?://')
);

-- Add organization context to media table (similar to object_description)
ALTER TABLE IF EXISTS media
  ADD COLUMN IF NOT EXISTS org_object_id TEXT REFERENCES object(id) ON DELETE SET NULL;

-- Ensure new enum labels exist on upgraded databases
DO $$ BEGIN
  BEGIN
    ALTER TYPE object_type ADD VALUE IF NOT EXISTS 'PSV';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TYPE object_type ADD VALUE IF NOT EXISTS 'RVA';
  EXCEPTION WHEN others THEN NULL; END;
END $$;

-- Valider dimensions médias selon type
CREATE OR REPLACE FUNCTION validate_media_dimensions()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE is_photo_video BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM ref_code_media_type rc WHERE rc.id = NEW.media_type_id AND rc.code IN ('photo','video')
  ) INTO is_photo_video;
  IF is_photo_video THEN
    IF (NEW.width IS NOT NULL AND NEW.width < 0) OR (NEW.height IS NOT NULL AND NEW.height < 0) THEN
      RAISE EXCEPTION 'Width and height must be non-negative for photo/video media types';
    END IF;
  ELSE
    IF NEW.width IS NOT NULL OR NEW.height IS NOT NULL THEN
      RAISE EXCEPTION 'Width and height must be NULL for non-photo/video media types';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_validate_media_dimensions ON media;
CREATE TRIGGER trg_validate_media_dimensions BEFORE INSERT OR UPDATE ON media FOR EACH ROW EXECUTE FUNCTION validate_media_dimensions();

-- Descriptions
CREATE TABLE IF NOT EXISTS object_description (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  description TEXT,
  description_chapo TEXT,
  description_mobile TEXT,
  description_edition TEXT,
  description_offre_hors_zone TEXT,
  sanitary_measures TEXT,
  visibility TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description_normalized TEXT GENERATED ALWAYS AS (CASE WHEN description IS NOT NULL THEN immutable_unaccent(lower(description)) END) STORED,
  description_chapo_normalized TEXT GENERATED ALWAYS AS (CASE WHEN description_chapo IS NOT NULL THEN immutable_unaccent(lower(description_chapo)) END) STORED,
  CONSTRAINT chk_object_description_visibility CHECK (visibility IS NULL OR visibility IN ('public','private','partners'))
);
-- Add organization context to descriptions
ALTER TABLE IF EXISTS object_description
  ADD COLUMN IF NOT EXISTS org_object_id TEXT REFERENCES object(id) ON DELETE SET NULL;

-- Add i18n JSONB columns for description translations
-- These columns store translations in JSONB format: {"fr": "French text", "en": "English text", "es": "Spanish text"}
-- Use api.i18n_pick() helper function to extract translations with fallback support
-- Example: UPDATE object_description SET description_i18n = '{"fr": "Description en français", "en": "Description in English"}' WHERE id = 'desc-uuid';
ALTER TABLE IF EXISTS object_description
  ADD COLUMN IF NOT EXISTS description_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_chapo_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_mobile_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_edition_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_offre_hors_zone_i18n JSONB,
  ADD COLUMN IF NOT EXISTS sanitary_measures_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_adapted TEXT,
  ADD COLUMN IF NOT EXISTS description_adapted_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- Backfill duplicates: keep most recent canonical row per object and delete older duplicates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'object_description' AND column_name = 'org_object_id'
  ) THEN
    WITH ranked AS (
      SELECT id, object_id,
             ROW_NUMBER() OVER (PARTITION BY object_id ORDER BY created_at DESC, id) AS rn
      FROM object_description
      WHERE org_object_id IS NULL
    ), to_delete AS (
      SELECT id
      FROM ranked
      WHERE rn > 1
    )
    DELETE FROM object_description d
    USING to_delete
    WHERE d.id = to_delete.id;
  END IF;
END $$;

-- Uniqueness: one canonical description per object (org_object_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_description_canonical_one
  ON object_description(object_id)
  WHERE org_object_id IS NULL;

-- Uniqueness: at most one description per organization for a given object
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_description_per_org
  ON object_description(object_id, org_object_id)
  WHERE org_object_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS object_place_description (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id UUID NOT NULL REFERENCES object_place(id) ON DELETE CASCADE,
  description TEXT,
  description_chapo TEXT,
  description_mobile TEXT,
  description_edition TEXT,
  description_offre_hors_zone TEXT,
  sanitary_measures TEXT,
  description_adapted TEXT,
  visibility TEXT,
  position INTEGER DEFAULT 0,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for place descriptions
  description_i18n JSONB,
  description_chapo_i18n JSONB,
  description_mobile_i18n JSONB,
  description_edition_i18n JSONB,
  description_offre_hors_zone_i18n JSONB,
  sanitary_measures_i18n JSONB,
  description_adapted_i18n JSONB,
  CONSTRAINT chk_object_place_description_visibility CHECK (visibility IS NULL OR visibility IN ('public','private','partners'))
);
ALTER TABLE IF EXISTS object_place_description
  ADD COLUMN IF NOT EXISTS description_adapted TEXT,
  ADD COLUMN IF NOT EXISTS description_adapted_i18n JSONB;

CREATE TABLE IF NOT EXISTS object_private_description (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  org_object_id TEXT REFERENCES object(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'private' CHECK (audience IN ('private','partners')),
  language_id UUID REFERENCES ref_language(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Liens externes (external_ids)
CREATE TABLE IF NOT EXISTS object_external_id (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  organization_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL DEFAULT 'default',
  external_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_object_external_id_by_source UNIQUE (organization_object_id, source_system, external_id),
  CONSTRAINT uq_object_external_id_object_org_source UNIQUE (object_id, organization_object_id, source_system)
);

ALTER TABLE IF EXISTS object_external_id
  ADD COLUMN IF NOT EXISTS source_system TEXT;

UPDATE object_external_id
SET source_system = 'default'
WHERE source_system IS NULL;

ALTER TABLE IF EXISTS object_external_id
  ALTER COLUMN source_system SET DEFAULT 'default';

ALTER TABLE IF EXISTS object_external_id
  ALTER COLUMN source_system SET NOT NULL;

DO $$
DECLARE
  v_legacy_conname TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'object_external_id'
      AND c.conname = 'uq_object_org'
  ) THEN
    ALTER TABLE object_external_id DROP CONSTRAINT uq_object_org;
  END IF;

  SELECT c.conname
  INTO v_legacy_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'object_external_id'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (organization_object_id, external_id)%'
  LIMIT 1;

  IF v_legacy_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE object_external_id DROP CONSTRAINT %I', v_legacy_conname);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'object_external_id'
      AND c.conname = 'uq_object_external_id_by_source'
  ) THEN
    ALTER TABLE object_external_id
      ADD CONSTRAINT uq_object_external_id_by_source
      UNIQUE (organization_object_id, source_system, external_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'object_external_id'
      AND c.conname = 'uq_object_external_id_object_org_source'
  ) THEN
    ALTER TABLE object_external_id
      ADD CONSTRAINT uq_object_external_id_object_org_source
      UNIQUE (object_id, organization_object_id, source_system);
  END IF;
END $$;

-- Avis (reviews) importés
CREATE TABLE IF NOT EXISTS object_review (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES ref_review_source(id) ON DELETE RESTRICT,
  external_id TEXT,
  rating NUMERIC(3,2) CHECK (rating >= 0 AND rating <= 5),
  rating_max INTEGER DEFAULT 5,
  title TEXT,
  content TEXT,
  author_name TEXT,
  author_avatar_url TEXT,
  review_date DATE,
  visit_date DATE,
  traveler_type TEXT,
  language_id UUID REFERENCES ref_language(id) ON DELETE SET NULL,
  helpful_count INTEGER DEFAULT 0,
  response TEXT,
  response_date DATE,
  is_published BOOLEAN DEFAULT TRUE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, external_id)
);

-- Origine
CREATE TABLE IF NOT EXISTS object_origin (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  source_system TEXT,
  source_object_id TEXT,
  import_batch_id UUID,
  first_imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Légal
-- Legacy specific legal tables removed in favor of unified object_legal

-- Simple opening tables removed - using rich opening system instead

-- Développement durable
CREATE TABLE IF NOT EXISTS object_sustainability_action (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES ref_sustainability_action(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(object_id, action_id)
);
-- Classification table required by sustainability_action_label
CREATE TABLE IF NOT EXISTS object_classification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  scheme_id UUID NOT NULL REFERENCES ref_classification_scheme(id) ON DELETE RESTRICT,
  value_id UUID NOT NULL REFERENCES ref_classification_value(id) ON DELETE RESTRICT,
  subvalue_ids UUID[],
  document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  requested_at DATE,
  awarded_at DATE,
  valid_until DATE,
  status TEXT,
  source TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_label_dates CHECK (valid_until IS NULL OR awarded_at IS NULL OR valid_until >= awarded_at),
  CONSTRAINT chk_object_classification_status CHECK (status IS NULL OR status IN ('requested','granted','suspended','expired'))
);
CREATE TABLE IF NOT EXISTS object_sustainability_action_label (
  object_sustainability_action_id UUID NOT NULL REFERENCES object_sustainability_action(id) ON DELETE CASCADE,
  object_classification_id UUID NOT NULL REFERENCES object_classification(id) ON DELETE CASCADE,
  PRIMARY KEY (object_sustainability_action_id, object_classification_id)
);

-- Relations objets
CREATE TABLE IF NOT EXISTS ref_object_relation_type (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS object_relation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  target_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  relation_type_id UUID NOT NULL REFERENCES ref_object_relation_type(id) ON DELETE RESTRICT,
  distance_m NUMERIC(10,2),
  note TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_relation_not_self CHECK (source_object_id <> target_object_id),
  CONSTRAINT uq_object_relation UNIQUE (source_object_id, target_object_id, relation_type_id)
);

-- M:N liaisons
CREATE TABLE IF NOT EXISTS object_language (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES ref_language(id) ON DELETE CASCADE,
  level_id UUID REFERENCES ref_code_language_level(id) ON DELETE SET NULL,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, language_id)
);
CREATE TABLE IF NOT EXISTS object_payment_method (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES ref_code_payment_method(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, payment_method_id)
);
CREATE TABLE IF NOT EXISTS object_environment_tag (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  environment_tag_id UUID NOT NULL REFERENCES ref_code_environment_tag(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, environment_tag_id)
);
CREATE TABLE IF NOT EXISTS object_amenity (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  amenity_id UUID NOT NULL REFERENCES ref_amenity(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, amenity_id)
);

-- Media tags (M:N - multiple tags per media)
CREATE TABLE IF NOT EXISTS media_tag (
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES ref_code_media_tag(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_id, tag_id)
);

-- ORG/Contacts/Actor
CREATE TABLE IF NOT EXISTS ref_org_role (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS object_org_link (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  org_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES ref_org_role(id) ON DELETE RESTRICT,
  is_primary BOOLEAN DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, org_object_id, role_id)
);

-- A single primary organization per object
CREATE UNIQUE INDEX IF NOT EXISTS uq_object_primary_org
  ON object_org_link(object_id)
  WHERE is_primary;

-- Actor model
CREATE TABLE IF NOT EXISTS ref_actor_role (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS actor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  gender TEXT,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_name_normalized TEXT GENERATED ALWAYS AS (immutable_unaccent(lower(display_name))) STORED,
  first_name_normalized TEXT GENERATED ALWAYS AS (CASE WHEN first_name IS NOT NULL THEN immutable_unaccent(lower(first_name)) END) STORED,
  last_name_normalized TEXT GENERATED ALWAYS AS (CASE WHEN last_name IS NOT NULL THEN immutable_unaccent(lower(last_name)) END) STORED,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS actor_channel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  kind_id UUID NOT NULL REFERENCES ref_code_contact_kind(id) ON DELETE RESTRICT,
  value TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  role_id UUID REFERENCES ref_contact_role(id) ON DELETE SET NULL,
  position INTEGER DEFAULT 0,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_actor_channel_not_empty CHECK (length(trim(value)) > 0),
  CONSTRAINT uq_actor_channel_unique UNIQUE (actor_id, kind_id, value)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_actor_channel_primary ON actor_channel(actor_id, kind_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS actor_object_role (
  actor_id UUID NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES ref_actor_role(id) ON DELETE RESTRICT,
  is_primary BOOLEAN DEFAULT FALSE,
  valid_from DATE,
  valid_to DATE,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','partners')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, object_id, role_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_actor_object_role_primary ON actor_object_role(object_id, role_id) WHERE is_primary;

-- Email shape enforcement (object + actor)
CREATE OR REPLACE FUNCTION api.enforce_contact_email_shape()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE v_is_email BOOLEAN;
BEGIN
  SELECT lower(code) = 'email' INTO v_is_email FROM ref_code_contact_kind WHERE id = NEW.kind_id;
  IF v_is_email AND NEW.value IS NOT NULL AND NEW.value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Invalid email format for contact kind=email: %', NEW.value;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_contact_channel_email ON contact_channel;
CREATE TRIGGER trg_contact_channel_email BEFORE INSERT OR UPDATE ON contact_channel FOR EACH ROW EXECUTE FUNCTION api.enforce_contact_email_shape();

CREATE OR REPLACE FUNCTION api.enforce_actor_channel_email_shape()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE v_is_email BOOLEAN;
BEGIN
  SELECT lower(code) = 'email' INTO v_is_email FROM ref_code_contact_kind WHERE id = NEW.kind_id;
  IF v_is_email AND NEW.value IS NOT NULL AND NEW.value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Invalid email format for actor channel kind=email: %', NEW.value;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_actor_channel_email ON actor_channel;
CREATE TRIGGER trg_actor_channel_email BEFORE INSERT OR UPDATE ON actor_channel FOR EACH ROW EXECUTE FUNCTION api.enforce_actor_channel_email_shape();

-- Unicité email cross-actors
CREATE OR REPLACE FUNCTION api.prevent_duplicate_actor_email()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE v_is_email BOOLEAN; v_existing_actor_id UUID;
BEGIN
  SELECT lower(code) = 'email' INTO v_is_email FROM ref_code_contact_kind WHERE id = NEW.kind_id;
  IF v_is_email AND NEW.value IS NOT NULL THEN
    SELECT ac.actor_id INTO v_existing_actor_id
    FROM actor_channel ac
    JOIN ref_code_contact_kind rck ON ac.kind_id = rck.id
    WHERE lower(rck.code) = 'email' AND lower(ac.value) = lower(NEW.value) AND ac.actor_id != NEW.actor_id
    LIMIT 1;
    IF v_existing_actor_id IS NOT NULL THEN
      RAISE EXCEPTION 'Email % is already used by actor %', NEW.value, v_existing_actor_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prevent_duplicate_actor_email ON actor_channel;
CREATE TRIGGER trg_prevent_duplicate_actor_email BEFORE INSERT OR UPDATE ON actor_channel FOR EACH ROW EXECUTE FUNCTION api.prevent_duplicate_actor_email();

-- CRM: interactions & tasks
CREATE TABLE IF NOT EXISTS crm_interaction (
  id UUID DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES actor(id) ON DELETE SET NULL,
  interaction_type crm_interaction_type NOT NULL DEFAULT 'note',
  direction crm_direction NOT NULL DEFAULT 'internal',
  status crm_status NOT NULL DEFAULT 'done',
  subject TEXT,
  body TEXT,
  source TEXT,
  occurred_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  duration_min INTEGER,
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_by_actor_id UUID REFERENCES actor(id) ON DELETE SET NULL,
  demand_topic_id UUID REFERENCES ref_code_demand_topic(id) ON DELETE RESTRICT,
  demand_subtopic_id UUID REFERENCES ref_code_demand_subtopic(id) ON DELETE RESTRICT,
  request_mood_id UUID REFERENCES ref_code_mood(id) ON DELETE SET NULL,
  response_mood_id UUID REFERENCES ref_code_mood(id) ON DELETE SET NULL,
  is_actionable BOOLEAN NOT NULL DEFAULT TRUE,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE OR REPLACE FUNCTION api.auto_populate_interaction_subject()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE topic_name TEXT; subtopic_name TEXT; generated_subject TEXT;
BEGIN
  IF NEW.subject IS NOT NULL AND trim(NEW.subject) != '' THEN RETURN NEW; END IF;
  IF NEW.demand_topic_id IS NOT NULL THEN SELECT name INTO topic_name FROM ref_code_demand_topic WHERE id = NEW.demand_topic_id; END IF;
  IF NEW.demand_subtopic_id IS NOT NULL THEN SELECT name INTO subtopic_name FROM ref_code_demand_subtopic WHERE id = NEW.demand_subtopic_id; END IF;
  IF topic_name IS NOT NULL AND subtopic_name IS NOT NULL THEN
    generated_subject := topic_name || ' - ' || subtopic_name;
  ELSIF topic_name IS NOT NULL THEN
    generated_subject := topic_name;
  ELSIF subtopic_name IS NOT NULL THEN
    generated_subject := subtopic_name;
  ELSE
    CASE NEW.interaction_type
      WHEN 'call' THEN generated_subject := 'Appel téléphonique';
      WHEN 'email' THEN generated_subject := 'Email';
      WHEN 'meeting' THEN generated_subject := 'Rendez-vous';
      WHEN 'visit' THEN generated_subject := 'Visite';
      WHEN 'whatsapp' THEN generated_subject := 'WhatsApp';
      WHEN 'sms' THEN generated_subject := 'SMS';
      WHEN 'note' THEN generated_subject := 'Note interne';
      ELSE generated_subject := 'Interaction CRM';
    END CASE;
  END IF;
  NEW.subject := generated_subject;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_auto_populate_interaction_subject ON crm_interaction;
CREATE TRIGGER trg_auto_populate_interaction_subject BEFORE INSERT OR UPDATE ON crm_interaction FOR EACH ROW EXECUTE FUNCTION api.auto_populate_interaction_subject();

CREATE TABLE IF NOT EXISTS crm_task (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES actor(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status crm_task_status NOT NULL DEFAULT 'todo',
  priority crm_task_priority NOT NULL DEFAULT 'medium',
  due_at TIMESTAMPTZ,
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_interaction_id UUID REFERENCES crm_interaction(id) ON DELETE SET NULL,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consentements
CREATE TABLE IF NOT EXISTS actor_consent (
  actor_id UUID NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  channel crm_consent_channel NOT NULL,
  consent_given BOOLEAN NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  PRIMARY KEY(actor_id, channel)
);

-- Pricing
CREATE TABLE IF NOT EXISTS ref_capacity_metric (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(20),
  icon_url TEXT,
  position INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ref_capacity_applicability (
  metric_id UUID NOT NULL REFERENCES ref_capacity_metric(id) ON DELETE CASCADE,
  object_type object_type NOT NULL,
  PRIMARY KEY(metric_id, object_type)
);
CREATE TABLE IF NOT EXISTS object_capacity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  metric_id UUID NOT NULL REFERENCES ref_capacity_metric(id) ON DELETE RESTRICT,
  value_integer INTEGER CHECK (value_integer IS NULL OR value_integer >= 0),
  unit VARCHAR(20),
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(object_id, metric_id),
  CONSTRAINT chk_capacity_dates CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
-- sync unit
CREATE OR REPLACE FUNCTION sync_object_capacity_unit()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.metric_id IS NOT NULL THEN
    SELECT unit INTO STRICT NEW.unit FROM ref_capacity_metric WHERE id = NEW.metric_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_object_capacity_sync_unit_ins ON object_capacity;
CREATE TRIGGER trg_object_capacity_sync_unit_ins BEFORE INSERT ON object_capacity FOR EACH ROW EXECUTE FUNCTION sync_object_capacity_unit();
DROP TRIGGER IF EXISTS trg_object_capacity_sync_unit_upd ON object_capacity;
CREATE TRIGGER trg_object_capacity_sync_unit_upd BEFORE UPDATE OF metric_id ON object_capacity FOR EACH ROW EXECUTE FUNCTION sync_object_capacity_unit();
CREATE OR REPLACE FUNCTION propagate_capacity_unit_change()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.unit IS DISTINCT FROM OLD.unit THEN
    UPDATE object_capacity SET unit = NEW.unit WHERE metric_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ref_capacity_metric_unit_change ON ref_capacity_metric;
CREATE TRIGGER trg_ref_capacity_metric_unit_change AFTER UPDATE OF unit ON ref_capacity_metric FOR EACH ROW EXECUTE FUNCTION propagate_capacity_unit_change();

-- Tarifs
CREATE TABLE IF NOT EXISTS object_price (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  kind_id UUID NOT NULL REFERENCES ref_code_price_kind(id) ON DELETE RESTRICT,
  unit_id UUID REFERENCES ref_code_price_unit(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) CHECK (amount IS NULL OR amount >= 0),
  amount_max NUMERIC(12,2) CHECK (amount_max IS NULL OR amount_max >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  season_code TEXT,
  indication_code TEXT,
  age_min_enfant SMALLINT,
  age_max_enfant SMALLINT,
  age_min_junior SMALLINT,
  age_max_junior SMALLINT,
  valid_from DATE,
  valid_to DATE,
  conditions TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_amount_range CHECK (amount_max IS NULL OR amount IS NULL OR amount_max >= amount),
  CONSTRAINT chk_age_ranges_valid CHECK (
    (age_min_enfant IS NULL OR age_min_enfant >= 0) AND
    (age_max_enfant IS NULL OR age_max_enfant >= age_min_enfant) AND
    (age_min_junior IS NULL OR age_min_junior >= 0) AND
    (age_max_junior IS NULL OR age_max_junior >= age_min_junior)
  )
);
CREATE TABLE IF NOT EXISTS object_price_period (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  price_id UUID NOT NULL REFERENCES object_price(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_price_period_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_price_period_times CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
);
CREATE TABLE IF NOT EXISTS object_discount (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  conditions TEXT,
  discount_percent NUMERIC(5,2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  discount_amount NUMERIC(12,2) CHECK (discount_amount IS NULL OR discount_amount >= 0),
  currency CHAR(3),
  min_group_size INTEGER CHECK (min_group_size IS NULL OR min_group_size >= 1),
  max_group_size INTEGER CHECK (max_group_size IS NULL OR max_group_size >= min_group_size),
  valid_from DATE,
  valid_to DATE,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_discount_xor CHECK (
    (discount_percent IS NOT NULL AND discount_amount IS NULL) OR
    (discount_percent IS NULL AND discount_amount IS NOT NULL)
  ),
  CONSTRAINT chk_discount_currency_amount CHECK (discount_amount IS NULL OR currency IS NOT NULL)
);

-- MICE / Meeting rooms
CREATE TABLE IF NOT EXISTS object_meeting_room (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  name TEXT,
  area_m2 NUMERIC(8,2) CHECK (area_m2 IS NULL OR area_m2 >= 0),
  cap_theatre INTEGER CHECK (cap_theatre IS NULL OR cap_theatre >= 0),
  cap_u INTEGER CHECK (cap_u IS NULL OR cap_u >= 0),
  cap_classroom INTEGER CHECK (cap_classroom IS NULL OR cap_classroom >= 0),
  cap_boardroom INTEGER CHECK (cap_boardroom IS NULL OR cap_boardroom >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for meeting room names
  name_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);
CREATE TABLE IF NOT EXISTS meeting_room_equipment (
  room_id UUID NOT NULL REFERENCES object_meeting_room(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES ref_code_meeting_equipment(id) ON DELETE RESTRICT,
  position INTEGER DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, equipment_id)
);

-- Types de chambres (Hébergement)
CREATE TABLE IF NOT EXISTS object_room_type (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_i18n JSONB,
  description TEXT,
  description_i18n JSONB,
  capacity_adults INTEGER CHECK (capacity_adults IS NULL OR capacity_adults >= 0),
  capacity_children INTEGER CHECK (capacity_children IS NULL OR capacity_children >= 0),
  capacity_total INTEGER CHECK (capacity_total IS NULL OR capacity_total >= 0),
  size_sqm NUMERIC(6,2),
  bed_config TEXT,
  bed_config_i18n JSONB,
  total_rooms INTEGER DEFAULT 1,
  floor_level INTEGER,
  view_type_id UUID REFERENCES ref_code_view_type(id) ON DELETE SET NULL,
  base_price NUMERIC(12,2),
  currency TEXT DEFAULT 'EUR',
  is_accessible BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, code)
);

CREATE TABLE IF NOT EXISTS object_room_type_amenity (
  room_type_id UUID NOT NULL REFERENCES object_room_type(id) ON DELETE CASCADE,
  amenity_id UUID NOT NULL REFERENCES ref_amenity(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_type_id, amenity_id)
);

CREATE TABLE IF NOT EXISTS object_room_type_media (
  room_type_id UUID NOT NULL REFERENCES object_room_type(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_type_id, media_id)
);

-- Ouvertures riches
CREATE TABLE IF NOT EXISTS opening_period (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  name TEXT,
  date_start DATE,
  date_end DATE,
  source_period_id TEXT,
  all_years BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for opening period names
  name_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB,
  CONSTRAINT chk_opening_period_dates CHECK (date_end IS NULL OR date_start IS NULL OR date_end >= date_start)
);
CREATE TABLE IF NOT EXISTS opening_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_id UUID NOT NULL REFERENCES opening_period(id) ON DELETE CASCADE,
  schedule_type_id UUID NOT NULL REFERENCES ref_code_opening_schedule_type(id) ON DELETE RESTRICT,
  name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for schedule names and notes
  name_i18n JSONB,
  note_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);
CREATE TABLE IF NOT EXISTS opening_time_period (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES opening_schedule(id) ON DELETE CASCADE,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS opening_time_period_weekday (
  time_period_id UUID NOT NULL REFERENCES opening_time_period(id) ON DELETE CASCADE,
  weekday_id UUID NOT NULL REFERENCES ref_code_weekday(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (time_period_id, weekday_id)
);
ALTER TABLE IF EXISTS opening_time_period_weekday
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS opening_time_frame (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  time_period_id UUID NOT NULL REFERENCES opening_time_period(id) ON DELETE CASCADE,
  start_time TIME,
  end_time TIME,
  recurrence INTERVAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_time_frame_range CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);

-- Group & Pets
CREATE TABLE IF NOT EXISTS object_group_policy (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  min_size INTEGER CHECK (min_size IS NULL OR min_size >= 1),
  max_size INTEGER CHECK (max_size IS NULL OR (min_size IS NULL OR max_size >= min_size)),
  group_only BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS object_pet_policy (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  accepted BOOLEAN NOT NULL,
  conditions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promotions
CREATE TABLE IF NOT EXISTS promotion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  name_i18n JSONB,
  description TEXT,
  description_i18n JSONB,
  type_id UUID REFERENCES ref_code_promotion_type(id) ON DELETE RESTRICT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_amount', 'free_item')),
  discount_value NUMERIC(12,2) NOT NULL,
  currency TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  max_uses INTEGER,
  max_uses_per_user INTEGER,
  current_uses INTEGER DEFAULT 0,
  min_purchase_amount NUMERIC(12,2),
  applicable_object_types TEXT[],
  season_id UUID REFERENCES ref_code_season_type(id) ON DELETE SET NULL,
  partner_org_id TEXT REFERENCES object(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_promo_currency_amount CHECK (discount_type <> 'fixed_amount' OR currency IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS promotion_object (
  promotion_id UUID NOT NULL REFERENCES promotion(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (promotion_id, object_id)
);

CREATE TABLE IF NOT EXISTS promotion_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promotion_id UUID NOT NULL REFERENCES promotion(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  object_id TEXT REFERENCES object(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_saved NUMERIC(12,2),
  currency TEXT
);

-- =====================================================
-- Profil utilisateur applicatif (non-auth)
-- =====================================================
CREATE TABLE IF NOT EXISTS app_user_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'fr',
  timezone TEXT NOT NULL DEFAULT 'Indian/Reunion',
  role TEXT CHECK (role IS NULL OR role IN ('owner', 'super_admin', 'tourism_agent')),
  lang_prefs TEXT[] NOT NULL DEFAULT ARRAY['fr','en'],
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION api.enforce_app_user_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  requester_uid UUID := auth.uid();
  requester_is_owner BOOLEAN := false;
BEGIN
  -- No JWT context (migration SQL / privileged direct connection): skip runtime guard.
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  requester_is_owner :=
    auth.role() IN ('service_role', 'admin')
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = requester_uid
        AND u.raw_user_meta_data->>'role' = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM app_user_profile me
      WHERE me.id = requester_uid
        AND me.role = 'owner'
    );

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IN ('owner', 'super_admin') AND NOT requester_is_owner THEN
      RAISE EXCEPTION 'Seul un owner peut attribuer le role owner ou super_admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND NEW.role IN ('owner', 'super_admin')
       AND NOT requester_is_owner THEN
      RAISE EXCEPTION 'Seul un owner peut attribuer le role owner ou super_admin.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_app_user_profile_role ON app_user_profile(role);
CREATE INDEX IF NOT EXISTS idx_app_user_profile_locale ON app_user_profile(locale);
CREATE INDEX IF NOT EXISTS idx_app_user_profile_preferences_gin ON app_user_profile USING GIN (preferences);

-- =====================================================
-- Spécifiques FMA (événements)
-- =====================================================
CREATE TABLE IF NOT EXISTS object_fma (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  event_start_date DATE,
  event_end_date DATE,
  event_start_time TIME,
  event_end_time TIME,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fma_dates CHECK (event_end_date IS NULL OR event_start_date IS NULL OR event_end_date >= event_start_date)
);
CREATE TABLE IF NOT EXISTS object_fma_occurrence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  state TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fma_occ_dates CHECK (end_at IS NULL OR end_at >= start_at)
);

-- =====================================================
-- Spécifiques ITI (itinéraires) + détails/stages/sections/profile/practice/etc.
-- =====================================================
CREATE TABLE IF NOT EXISTS object_iti (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  distance_km DECIMAL(8, 2),
  duration_hours DECIMAL(4, 2),
  difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
  elevation_gain INTEGER,
  is_loop BOOLEAN DEFAULT FALSE,
  geom GEOGRAPHY(LINESTRING, 4326),
  -- Cached GPX/KML for performance (auto-regenerated on geometry change)
  cached_gpx TEXT,
  cached_kml TEXT,
  cached_gpx_generated_at TIMESTAMPTZ,
  -- Itinerary status (open/closed/partial)
  open_status TEXT CHECK (open_status IS NULL OR open_status IN ('open', 'closed', 'partially_closed', 'warning')),
  status_note TEXT,
  status_document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  status_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS object_iti_practice (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES ref_code_iti_practice(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, practice_id)
);

CREATE TABLE IF NOT EXISTS ref_iti_assoc_role (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS object_iti_associated_object (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  associated_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES ref_iti_assoc_role(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, associated_object_id, role_id)
);

CREATE TABLE IF NOT EXISTS object_iti_stage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  geom GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for stage names and descriptions
  name_i18n JSONB,
  description_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);

CREATE TABLE IF NOT EXISTS object_iti_stage_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id UUID NOT NULL REFERENCES object_iti_stage(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stage_id, media_id)
);

CREATE TABLE IF NOT EXISTS object_iti_section (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  name TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  geom GEOGRAPHY(LINESTRING, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- I18n support for section names
  name_i18n JSONB,
  -- Extra JSONB for future extensibility
  extra JSONB
);

CREATE TABLE IF NOT EXISTS object_iti_info (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  access TEXT,
  ambiance TEXT,
  recommended_parking TEXT,
  required_equipment TEXT,
  info_places TEXT,
  is_child_friendly BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_i18n JSONB,
  ambiance_i18n JSONB,
  recommended_parking_i18n JSONB,
  required_equipment_i18n JSONB,
  info_places_i18n JSONB
);

CREATE TABLE IF NOT EXISTS object_iti_profile (
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  position_m NUMERIC(10,2) NOT NULL,
  elevation_m NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (object_id, position_m)
);

ALTER TABLE IF EXISTS object_iti_profile
  ADD COLUMN IF NOT EXISTS id UUID;

UPDATE object_iti_profile
SET id = uuid_generate_v4()
WHERE id IS NULL;

ALTER TABLE IF EXISTS object_iti_profile
  ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE IF EXISTS object_iti_profile
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'object_iti_profile'
      AND c.conname = 'object_iti_profile_pkey'
  ) THEN
    ALTER TABLE object_iti_profile DROP CONSTRAINT object_iti_profile_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'object_iti_profile'
      AND c.conname = 'object_iti_profile_id_pkey'
  ) THEN
    ALTER TABLE object_iti_profile ADD CONSTRAINT object_iti_profile_id_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_object_iti_profile_pos
ON object_iti_profile(object_id, position_m);

-- =====================================================
-- Tourism CRM extensions
-- =====================================================

-- Memberships & subscriptions
CREATE TABLE IF NOT EXISTS object_membership (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  object_id TEXT REFERENCES object(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES ref_code_membership_campaign(id) ON DELETE RESTRICT,
  tier_id UUID NOT NULL REFERENCES ref_code_membership_tier(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','invoiced','paid','canceled','lapsed')),
  starts_at DATE,
  ends_at DATE,
  payment_date DATE,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_object_membership_dates CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS idx_object_membership_org ON object_membership(org_object_id);
CREATE INDEX IF NOT EXISTS idx_object_membership_object ON object_membership(object_id);
CREATE INDEX IF NOT EXISTS idx_object_membership_campaign_status ON object_membership(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_object_membership_current
ON object_membership(org_object_id, object_id, starts_at, ends_at)
WHERE status IN ('invoiced','paid');

CREATE OR REPLACE FUNCTION api.handle_membership_status_transition()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.status = 'lapsed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.object_id IS NOT NULL THEN
      UPDATE object o
      SET commercial_visibility = 'lapsed'
      WHERE o.id = NEW.object_id
        AND o.commercial_visibility IS DISTINCT FROM 'lapsed'
        AND NOT EXISTS (
          SELECT 1
          FROM object_membership m2
          WHERE m2.id <> NEW.id
            AND (
              m2.object_id = NEW.object_id
              OR (
                m2.object_id IS NULL
                AND m2.org_object_id IN (
                  SELECT l.org_object_id
                  FROM object_org_link l
                  WHERE l.object_id = NEW.object_id
                )
              )
            )
            AND m2.status IN ('paid', 'invoiced')
            AND (m2.starts_at IS NULL OR m2.starts_at <= CURRENT_DATE)
            AND (m2.ends_at IS NULL OR m2.ends_at >= CURRENT_DATE)
        );
    ELSE
      UPDATE object o
      SET commercial_visibility = 'lapsed'
      WHERE o.commercial_visibility IS DISTINCT FROM 'lapsed'
        AND EXISTS (
          SELECT 1
          FROM object_org_link l
          WHERE l.object_id = o.id
            AND l.org_object_id = NEW.org_object_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM object_membership m2
          WHERE m2.id <> NEW.id
            AND (
              m2.object_id = o.id
              OR (m2.object_id IS NULL AND m2.org_object_id = NEW.org_object_id)
            )
            AND m2.status IN ('paid', 'invoiced')
            AND (m2.starts_at IS NULL OR m2.starts_at <= CURRENT_DATE)
            AND (m2.ends_at IS NULL OR m2.ends_at >= CURRENT_DATE)
        );
    END IF;
  ELSIF NEW.status IN ('paid', 'invoiced') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.object_id IS NOT NULL THEN
      UPDATE object o
      SET commercial_visibility = 'active'
      WHERE o.id = NEW.object_id
        AND o.commercial_visibility IS DISTINCT FROM 'active'
        AND EXISTS (
          SELECT 1
          FROM object_membership m2
          WHERE (
              m2.object_id = NEW.object_id
              OR (
                m2.object_id IS NULL
                AND m2.org_object_id IN (
                  SELECT l.org_object_id
                  FROM object_org_link l
                  WHERE l.object_id = NEW.object_id
                )
              )
            )
            AND m2.status IN ('paid', 'invoiced')
            AND (m2.starts_at IS NULL OR m2.starts_at <= CURRENT_DATE)
            AND (m2.ends_at IS NULL OR m2.ends_at >= CURRENT_DATE)
        );
    ELSE
      UPDATE object o
      SET commercial_visibility = 'active'
      WHERE o.commercial_visibility IS DISTINCT FROM 'active'
        AND EXISTS (
          SELECT 1
          FROM object_org_link l
          WHERE l.object_id = o.id
            AND l.org_object_id = NEW.org_object_id
        )
        AND EXISTS (
          SELECT 1
          FROM object_membership m2
          WHERE (
              m2.object_id = o.id
              OR (m2.object_id IS NULL AND m2.org_object_id = NEW.org_object_id)
            )
            AND m2.status IN ('paid', 'invoiced')
            AND (m2.starts_at IS NULL OR m2.starts_at <= CURRENT_DATE)
            AND (m2.ends_at IS NULL OR m2.ends_at >= CURRENT_DATE)
        );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_membership_status_transition ON object_membership;
CREATE TRIGGER trg_membership_status_transition
AFTER INSERT OR UPDATE OF status ON object_membership
FOR EACH ROW EXECUTE FUNCTION api.handle_membership_status_transition();

-- Incident reporting
CREATE TABLE IF NOT EXISTS incident_report (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES ref_code_incident_category(id) ON DELETE RESTRICT,
  geom GEOGRAPHY(POINT, 4326),
  description TEXT,
  reporter_email TEXT,
  reporter_name TEXT,
  media_urls TEXT[],
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','critical')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved','rejected')),
  crm_task_id UUID REFERENCES crm_task(id) ON DELETE SET NULL,
  crm_interaction_id UUID REFERENCES crm_interaction(id) ON DELETE SET NULL,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_incident_reporter_email_shape
    CHECK (
      reporter_email IS NULL
      OR reporter_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
);
CREATE INDEX IF NOT EXISTS idx_incident_report_object_status ON incident_report(object_id, status);
CREATE INDEX IF NOT EXISTS idx_incident_report_category ON incident_report(category_id);
CREATE INDEX IF NOT EXISTS idx_incident_report_geom ON incident_report USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_incident_report_created_at ON incident_report(created_at DESC);

CREATE OR REPLACE FUNCTION api.create_crm_artifacts_from_incident()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_interaction_id UUID;
  v_task_id UUID;
  v_priority crm_task_priority;
BEGIN
  v_priority := CASE NEW.severity
    WHEN 'critical' THEN 'urgent'::crm_task_priority
    WHEN 'medium' THEN 'high'::crm_task_priority
    ELSE 'medium'::crm_task_priority
  END;

  INSERT INTO crm_interaction (
    object_id,
    interaction_type,
    direction,
    status,
    subject,
    body,
    source,
    occurred_at,
    is_actionable,
    extra
  ) VALUES (
    NEW.object_id,
    'note',
    'internal',
    'done',
    'Incident report received',
    COALESCE(NEW.description, 'No details provided'),
    'incident_report',
    NOW(),
    TRUE,
    jsonb_build_object(
      'incident_id', NEW.id,
      'severity', NEW.severity,
      'category_id', NEW.category_id
    )
  )
  RETURNING id INTO v_interaction_id;

  INSERT INTO crm_task (
    object_id,
    title,
    description,
    status,
    priority,
    related_interaction_id,
    extra
  ) VALUES (
    NEW.object_id,
    'Maintenance incident to review',
    COALESCE(NEW.description, 'No details provided'),
    'todo',
    v_priority,
    v_interaction_id,
    jsonb_build_object(
      'incident_id', NEW.id,
      'severity', NEW.severity
    )
  )
  RETURNING id INTO v_task_id;

  UPDATE incident_report
  SET crm_task_id = v_task_id,
      crm_interaction_id = v_interaction_id
  WHERE id = NEW.id;

  IF NEW.severity = 'critical' THEN
    UPDATE object_iti
    SET open_status = 'warning',
        status_note = COALESCE(status_note, 'Critical incident reported'),
        status_updated_at = NOW()
    WHERE object_id = NEW.object_id
      AND COALESCE(open_status, 'open') <> 'closed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incident_report_after_insert ON incident_report;
CREATE TRIGGER trg_incident_report_after_insert
AFTER INSERT ON incident_report
FOR EACH ROW EXECUTE FUNCTION api.create_crm_artifacts_from_incident();

-- Publication / print management
CREATE TABLE IF NOT EXISTS publication (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_audience TEXT,
  year INTEGER CHECK (year IS NULL OR (year BETWEEN 2000 AND 2200)),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','proofing','at_press','published')),
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_publication_code_normalized CHECK (code = immutable_unaccent(lower(code)))
);

CREATE TABLE IF NOT EXISTS publication_object (
  publication_id UUID NOT NULL REFERENCES publication(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  custom_print_text TEXT,
  workflow_status TEXT NOT NULL DEFAULT 'selected'
    CHECK (workflow_status IN ('selected','proof_sent','changes_requested','validated_bat','rejected')),
  page_number INTEGER CHECK (page_number IS NULL OR page_number > 0),
  proof_sent_at TIMESTAMPTZ,
  validated_bat_at TIMESTAMPTZ,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publication_id, object_id)
);
CREATE INDEX IF NOT EXISTS idx_publication_status_year ON publication(status, year);
CREATE INDEX IF NOT EXISTS idx_publication_object_status ON publication_object(workflow_status, publication_id);
CREATE INDEX IF NOT EXISTS idx_publication_object_object_id ON publication_object(object_id);

CREATE OR REPLACE FUNCTION api.set_publication_workflow_timestamps()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.workflow_status = 'proof_sent' AND (OLD.workflow_status IS DISTINCT FROM 'proof_sent') THEN
    NEW.proof_sent_at := NOW();
  END IF;
  IF NEW.workflow_status = 'validated_bat' AND (OLD.workflow_status IS DISTINCT FROM 'validated_bat') THEN
    NEW.validated_bat_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_publication_object_workflow_timestamps ON publication_object;
CREATE TRIGGER trg_publication_object_workflow_timestamps
BEFORE UPDATE OF workflow_status ON publication_object
FOR EACH ROW EXECUTE FUNCTION api.set_publication_workflow_timestamps();

CREATE OR REPLACE FUNCTION api.log_publication_proof_interaction()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF NEW.workflow_status = 'proof_sent' AND (OLD.workflow_status IS DISTINCT FROM 'proof_sent') THEN
    INSERT INTO crm_interaction (
      object_id,
      interaction_type,
      direction,
      status,
      subject,
      body,
      source,
      occurred_at,
      is_actionable,
      extra
    ) VALUES (
      NEW.object_id,
      'email',
      'outbound',
      'done',
      'Proof sent for publication',
      'A PDF proof was sent for publication workflow.',
      'publication_workflow',
      NOW(),
      TRUE,
      jsonb_build_object(
        'publication_id', NEW.publication_id,
        'workflow_status', NEW.workflow_status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_publication_proof_interaction ON publication_object;
CREATE TRIGGER trg_publication_proof_interaction
AFTER UPDATE OF workflow_status ON publication_object
FOR EACH ROW EXECUTE FUNCTION api.log_publication_proof_interaction();

-- Structured quality audits
CREATE TABLE IF NOT EXISTS audit_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheme_id UUID NOT NULL REFERENCES ref_classification_scheme(id) ON DELETE RESTRICT,
  classification_value_id UUID REFERENCES ref_classification_value(id) ON DELETE RESTRICT,
  code TEXT,
  name TEXT NOT NULL,
  passing_score_required INTEGER NOT NULL DEFAULT 0 CHECK (passing_score_required >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_audit_template_scheme_name UNIQUE (scheme_id, name),
  CONSTRAINT uq_audit_template_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS audit_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES audit_template(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  question TEXT NOT NULL,
  max_points INTEGER NOT NULL CHECK (max_points > 0),
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_audit_criteria_template_code UNIQUE (template_id, code)
);

CREATE TABLE IF NOT EXISTS audit_session (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES audit_template(id) ON DELETE RESTRICT,
  auditor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed','certified','failed')),
  certified_at TIMESTAMPTZ,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_result (
  session_id UUID NOT NULL REFERENCES audit_session(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES audit_criteria(id) ON DELETE CASCADE,
  points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  auditor_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, criteria_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_template_scheme_active ON audit_template(scheme_id, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_criteria_template ON audit_criteria(template_id, position);
CREATE INDEX IF NOT EXISTS idx_audit_session_object_status ON audit_session(object_id, status, audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_result_session ON audit_result(session_id);

CREATE OR REPLACE FUNCTION api.validate_audit_result_points()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_max_points INTEGER;
BEGIN
  SELECT c.max_points INTO v_max_points
  FROM audit_criteria c
  WHERE c.id = NEW.criteria_id;

  IF v_max_points IS NULL THEN
    RAISE EXCEPTION 'Unknown criteria_id %', NEW.criteria_id;
  END IF;
  IF NEW.points_awarded < 0 OR NEW.points_awarded > v_max_points THEN
    RAISE EXCEPTION 'points_awarded (%) must be between 0 and %', NEW.points_awarded, v_max_points;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_audit_result_points ON audit_result;
CREATE TRIGGER trg_validate_audit_result_points
BEFORE INSERT OR UPDATE OF points_awarded, criteria_id ON audit_result
FOR EACH ROW EXECUTE FUNCTION api.validate_audit_result_points();

CREATE OR REPLACE FUNCTION api.recompute_audit_session_score()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  v_session_id := COALESCE(NEW.session_id, OLD.session_id);

  UPDATE audit_session s
  SET total_score = COALESCE((
      SELECT SUM(ar.points_awarded)
      FROM audit_result ar
      WHERE ar.session_id = v_session_id
    ), 0)
  WHERE s.id = v_session_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_audit_session_score ON audit_result;
CREATE TRIGGER trg_recompute_audit_session_score
AFTER INSERT OR UPDATE OR DELETE ON audit_result
FOR EACH ROW EXECUTE FUNCTION api.recompute_audit_session_score();

CREATE OR REPLACE FUNCTION api.sync_classification_from_audit_session()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_scheme_id UUID;
  v_value_id UUID;
  v_validity_months INTEGER;
BEGIN
  IF NEW.status = 'certified' AND (OLD.status IS DISTINCT FROM 'certified') THEN
    NEW.certified_at := COALESCE(NEW.certified_at, NOW());

    SELECT t.scheme_id,
           t.classification_value_id,
           COALESCE(NULLIF((t.metadata->>'validity_months'),'')::INTEGER, 36)
    INTO v_scheme_id, v_value_id, v_validity_months
    FROM audit_template t
    WHERE t.id = NEW.template_id;

    IF v_scheme_id IS NOT NULL AND v_value_id IS NOT NULL THEN
      UPDATE object_classification oc
      SET awarded_at = NEW.audit_date,
          valid_until = NEW.audit_date + make_interval(months => GREATEST(v_validity_months, 1)),
          status = 'granted',
          source = 'audit',
          note = COALESCE(oc.note, 'Granted from certified audit session'),
          updated_at = NOW()
      WHERE oc.object_id = NEW.object_id
        AND oc.scheme_id = v_scheme_id
        AND oc.value_id = v_value_id
        AND COALESCE(oc.source, '') = 'audit';

      IF NOT FOUND THEN
        INSERT INTO object_classification (
          object_id,
          scheme_id,
          value_id,
          awarded_at,
          valid_until,
          status,
          source,
          note
        ) VALUES (
          NEW.object_id,
          v_scheme_id,
          v_value_id,
          NEW.audit_date,
          NEW.audit_date + make_interval(months => GREATEST(v_validity_months, 1)),
          'granted',
          'audit',
          'Granted from certified audit session'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_classification_from_audit_session ON audit_session;
CREATE TRIGGER trg_sync_classification_from_audit_session
BEFORE UPDATE OF status ON audit_session
FOR EACH ROW EXECUTE FUNCTION api.sync_classification_from_audit_session();

DROP TRIGGER IF EXISTS update_object_membership_updated_at ON object_membership;
CREATE TRIGGER update_object_membership_updated_at
BEFORE UPDATE ON object_membership
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_incident_report_updated_at ON incident_report;
CREATE TRIGGER update_incident_report_updated_at
BEFORE UPDATE ON incident_report
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_publication_updated_at ON publication;
CREATE TRIGGER update_publication_updated_at
BEFORE UPDATE ON publication
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_publication_object_updated_at ON publication_object;
CREATE TRIGGER update_publication_object_updated_at
BEFORE UPDATE ON publication_object
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_audit_template_updated_at ON audit_template;
CREATE TRIGGER update_audit_template_updated_at
BEFORE UPDATE ON audit_template
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_audit_criteria_updated_at ON audit_criteria;
CREATE TRIGGER update_audit_criteria_updated_at
BEFORE UPDATE ON audit_criteria
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_audit_session_updated_at ON audit_session;
CREATE TRIGGER update_audit_session_updated_at
BEFORE UPDATE ON audit_session
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_audit_result_updated_at ON audit_result;
CREATE TRIGGER update_audit_result_updated_at
BEFORE UPDATE ON audit_result
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Classifications objets (labels)
-- =====================================================
 

-- =====================================================
-- Versioning objets + Audit partitionné
-- =====================================================
CREATE TABLE IF NOT EXISTS audit.audit_log (
  id BIGSERIAL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPDATE','DELETE')),
  row_pk JSONB,
  before_data JSONB,
  after_data JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT,
  PRIMARY KEY (id, changed_at)
) PARTITION BY RANGE (changed_at);

CREATE OR REPLACE FUNCTION audit.get_month_partition_name(partition_date TIMESTAMPTZ)
RETURNS TEXT 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN 'audit_log_' || to_char(partition_date, 'YYYY_MM');
END; $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION audit.create_monthly_partition(partition_date TIMESTAMPTZ)
RETURNS TEXT 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE partition_name TEXT; start_date TIMESTAMPTZ; end_date TIMESTAMPTZ; sql_stmt TEXT;
BEGIN
  partition_name := audit.get_month_partition_name(partition_date);
  start_date := date_trunc('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='audit' AND tablename=partition_name) THEN
    RETURN 'Partition ' || partition_name || ' already exists';
  END IF;
  sql_stmt := format('CREATE TABLE audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)', partition_name, start_date, end_date);
  EXECUTE sql_stmt;
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_table_name ON audit.%I (table_name)', partition_name, partition_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_changed_at ON audit.%I (changed_at)', partition_name, partition_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_operation ON audit.%I (operation)', partition_name, partition_name);
  RETURN 'Created partition ' || partition_name;
END; $$ LANGUAGE plpgsql;

SELECT audit.create_monthly_partition(date_trunc('month', CURRENT_DATE));
SELECT audit.create_monthly_partition(date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');

-- DEFAULT partition as safety net (catches inserts when monthly partition is missing)
CREATE TABLE IF NOT EXISTS audit.audit_log_default PARTITION OF audit.audit_log DEFAULT;

CREATE OR REPLACE FUNCTION audit.ensure_future_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS TEXT 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE i INTEGER; result_text TEXT := ''; partition_date TIMESTAMPTZ;
BEGIN
  FOR i IN 0..months_ahead-1 LOOP
    partition_date := date_trunc('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
    result_text := result_text || audit.create_monthly_partition(partition_date) || E'\n';
  END LOOP;
  RETURN result_text;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit.drop_old_partitions(months_to_keep INTEGER DEFAULT 12)
RETURNS TEXT 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  cutoff_date DATE;
  result_text TEXT := '';
  r RECORD;
  part_year INTEGER;
  part_month INTEGER;
  part_date DATE;
BEGIN
  cutoff_date := (date_trunc('month', CURRENT_DATE) - make_interval(months => months_to_keep))::date;

  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'audit'
      AND tablename ~ '^audit_log_[0-9]{4}_[0-9]{2}$'
  LOOP
    part_year := split_part(r.tablename, '_', 3)::INTEGER;
    part_month := split_part(r.tablename, '_', 4)::INTEGER;
    part_date := make_date(part_year, part_month, 1);

    IF part_date < cutoff_date THEN
      EXECUTE format('DROP TABLE IF EXISTS audit.%I', r.tablename);
      result_text := result_text || 'Dropped old partition: ' || r.tablename || E'\n';
    END IF;
  END LOOP;

  IF result_text = '' THEN
    result_text := 'No old partitions to drop';
  END IF;

  RETURN result_text;
END;
$$ LANGUAGE plpgsql;

SELECT audit.ensure_future_partitions(3);

CREATE OR REPLACE FUNCTION audit.maintain_partitions()
RETURNS TEXT 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE result_text TEXT := '';
BEGIN
  result_text := result_text || '=== Creating future partitions ===' || E'\n' || audit.ensure_future_partitions(3) || E'\n';
  result_text := result_text || '=== Cleaning old partitions ===' || E'\n' || audit.drop_old_partitions(12) || E'\n';
  EXECUTE 'ANALYZE audit.audit_log';
  result_text := result_text || 'Updated statistics for audit.audit_log' || E'\n';
  RETURN result_text;
END; $$ LANGUAGE plpgsql;

COMMENT ON TABLE audit.audit_log IS 'Partitioned audit log table tracking all UPDATE and DELETE operations on public tables.';

CREATE OR REPLACE FUNCTION audit.log_row_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, public, pg_temp
AS $$
DECLARE
  v_pk JSONB := NULL;
  v_changed_by TEXT := NULL;
  v_pk_cols TEXT[];
  v_row JSONB;
BEGIN
  v_changed_by := COALESCE(NULLIF(current_setting('request.jwt.claim.email', true), ''), NULLIF(current_setting('request.jwt.claim.sub', true), ''), current_user);

  v_row := CASE
    WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
    WHEN NEW IS NOT NULL THEN to_jsonb(NEW)
    ELSE to_jsonb(OLD)
  END;

  SELECT array_agg(a.attname ORDER BY k.ord)
  INTO v_pk_cols
  FROM pg_index i
  JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid
   AND a.attnum = k.attnum
  WHERE i.indrelid = TG_RELID
    AND i.indisprimary;

  IF v_pk_cols IS NOT NULL AND array_length(v_pk_cols, 1) > 0 THEN
    SELECT jsonb_object_agg(col_name, v_row -> col_name)
    INTO v_pk
    FROM unnest(v_pk_cols) AS t(col_name);
  ELSIF v_row ? 'id' THEN
    v_pk := jsonb_build_object('id', v_row->'id');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit.audit_log(table_name, operation, row_pk, before_data, after_data, changed_by) VALUES (TG_TABLE_NAME, TG_OP, v_pk, to_jsonb(OLD), to_jsonb(NEW), v_changed_by);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit.audit_log(table_name, operation, row_pk, before_data, after_data, changed_by) VALUES (TG_TABLE_NAME, TG_OP, v_pk, to_jsonb(OLD), NULL, v_changed_by);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit triggers (invoked at end of script to include late-created tables).
CREATE OR REPLACE FUNCTION audit.attach_missing_triggers()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, public, pg_temp
AS $$
DECLARE
  r RECORD;
  trig_name TEXT;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'ref_code_%'
      AND table_name NOT LIKE 'audit_log_%'
  LOOP
    trig_name := format('trg_audit_%s', r.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trig_name) THEN
      EXECUTE format('CREATE TRIGGER %I AFTER UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes()', trig_name, r.table_schema, r.table_name);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_ref_code') THEN
    CREATE TRIGGER trg_audit_ref_code AFTER UPDATE OR DELETE ON ref_code FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_crm_interaction') THEN
    CREATE TRIGGER trg_audit_crm_interaction AFTER UPDATE OR DELETE ON crm_interaction FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes();
  END IF;
END;
$$;

-- Versioning
CREATE TABLE IF NOT EXISTS object_version (
  id UUID DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason TEXT,
  change_type TEXT NOT NULL DEFAULT 'update' CHECK (change_type IN ('insert','update','delete')),
  UNIQUE(object_id, version_number, created_at),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE OR REPLACE FUNCTION create_object_version_monthly_partition(partition_date TIMESTAMPTZ)
RETURNS TEXT 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE partition_name TEXT; start_date TIMESTAMPTZ; end_date TIMESTAMPTZ; sql_stmt TEXT;
BEGIN
  partition_name := 'object_version_' || to_char(partition_date, 'YYYY_MM');
  start_date := date_trunc('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=partition_name) THEN
    RETURN 'Partition ' || partition_name || ' already exists';
  END IF;
  sql_stmt := format('CREATE TABLE %I PARTITION OF object_version FOR VALUES FROM (%L) TO (%L)', partition_name, start_date, end_date);
  EXECUTE sql_stmt;
  RETURN 'Created partition: ' || partition_name;
END; $$ LANGUAGE plpgsql;

SELECT create_object_version_monthly_partition(date_trunc('month', CURRENT_DATE));
SELECT create_object_version_monthly_partition(date_trunc('month', CURRENT_DATE) + INTERVAL '1 month');

-- DEFAULT partition as safety net (catches inserts when monthly partition is missing)
CREATE TABLE IF NOT EXISTS object_version_default PARTITION OF object_version DEFAULT;
CREATE INDEX IF NOT EXISTS idx_object_version_object_id_created
ON object_version(object_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_audit_object_version ON object_version;
CREATE TRIGGER trg_audit_object_version AFTER UPDATE OR DELETE ON object_version FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes();

CREATE OR REPLACE FUNCTION save_object_version()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE v_version_number INTEGER; v_change_type TEXT; v_actor UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN 
    v_change_type := 'insert';
    -- For INSERT, use current_version from NEW (should be 1 after increment trigger)
    v_version_number := COALESCE(NEW.current_version, 1);
    v_actor := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN 
    IF (
      to_jsonb(NEW) - ARRAY[
        'updated_at',
        'is_editing',
        'commercial_visibility',
        'cached_min_price',
        'cached_main_image_url',
        'cached_rating',
        'cached_review_count',
        'cached_is_open_now',
        'cached_amenity_codes',
        'cached_payment_codes',
        'cached_environment_tags',
        'cached_language_codes',
        'cached_classification_codes',
        'current_version'
      ]
    ) IS NOT DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'updated_at',
        'is_editing',
        'commercial_visibility',
        'cached_min_price',
        'cached_main_image_url',
        'cached_rating',
        'cached_review_count',
        'cached_is_open_now',
        'cached_amenity_codes',
        'cached_payment_codes',
        'cached_environment_tags',
        'cached_language_codes',
        'cached_classification_codes',
        'current_version'
      ]
    ) THEN
      RETURN NEW;
    END IF;
    v_change_type := 'update';
    -- For UPDATE, use current_version from NEW (already incremented)
    v_version_number := COALESCE(NEW.current_version, OLD.current_version, 1);
    v_actor := COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
  ELSIF TG_OP = 'DELETE' THEN 
    v_change_type := 'delete';
    -- For DELETE (BEFORE trigger), use OLD.current_version + 1
    v_version_number := COALESCE(OLD.current_version, 0) + 1;
    v_actor := COALESCE(OLD.updated_by, OLD.created_by);
  END IF;

  INSERT INTO object_version (object_id, version_number, data, created_by, change_type)
  VALUES (COALESCE(NEW.id, OLD.id), v_version_number, to_jsonb(COALESCE(NEW, OLD)), v_actor, v_change_type);

  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_object_version ON object;
CREATE TRIGGER trg_object_version AFTER INSERT OR UPDATE ON object FOR EACH ROW EXECUTE FUNCTION save_object_version();
DROP TRIGGER IF EXISTS trg_object_version_delete ON object;
CREATE TRIGGER trg_object_version_delete BEFORE DELETE ON object FOR EACH ROW EXECUTE FUNCTION save_object_version();

-- =====================================================
-- Index (principaux) pour perfs
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_object_type ON object(object_type);
CREATE INDEX IF NOT EXISTS idx_object_status_published ON object(id, name, object_type) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_object_status_draft ON object(id, name, object_type) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_object_status_archived ON object(id, name, object_type) WHERE status = 'archived';
CREATE INDEX IF NOT EXISTS idx_object_name_normalized_trgm ON object USING GIN (name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_name_normalized_btree ON object (name_normalized);
CREATE INDEX IF NOT EXISTS idx_object_name_search_vector ON object USING GIN (name_search_vector);
CREATE INDEX IF NOT EXISTS idx_object_cached_amenity_codes_gin ON object USING GIN (cached_amenity_codes);
CREATE INDEX IF NOT EXISTS idx_object_cached_payment_codes_gin ON object USING GIN (cached_payment_codes);
CREATE INDEX IF NOT EXISTS idx_object_cached_environment_tags_gin ON object USING GIN (cached_environment_tags);
CREATE INDEX IF NOT EXISTS idx_object_cached_language_codes_gin ON object USING GIN (cached_language_codes);
CREATE INDEX IF NOT EXISTS idx_object_cached_classification_codes_gin ON object USING GIN (cached_classification_codes);
CREATE INDEX IF NOT EXISTS idx_object_location_city_search_vector ON object_location USING GIN (city_search_vector);

-- Covering index for map view and filtered list base CTE (index-only scan)
CREATE INDEX IF NOT EXISTS idx_location_main_covering
ON object_location(object_id)
INCLUDE (latitude, longitude, address1, postcode, city, city_search_vector, geog2)
WHERE is_main_location = TRUE;

CREATE INDEX IF NOT EXISTS idx_object_updated_at_source ON object(updated_at_source);
CREATE INDEX IF NOT EXISTS idx_object_updated_at_id ON object(updated_at, id);
CREATE INDEX IF NOT EXISTS idx_object_updated_at_source_id ON object(updated_at_source, id);

-- Partial indexes for hot paths (published objects only)
CREATE INDEX IF NOT EXISTS idx_object_published_type_updated 
ON object(object_type, updated_at, id) 
WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_object_published_updated_at_id
ON object(updated_at, id)
WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_object_published_updated_at_source_id
ON object(updated_at_source, id)
WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_object_published_name_search
ON object USING GIN(name_search_vector)
WHERE status = 'published';

-- Only index main locations with coordinates
CREATE INDEX IF NOT EXISTS idx_location_main_with_coords
ON object_location(object_id, latitude, longitude)
WHERE is_main_location = TRUE AND latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_location_main_city_search
ON object_location USING GIN(city_search_vector)
WHERE is_main_location = TRUE;

CREATE INDEX IF NOT EXISTS idx_location_main_geog_gist
ON object_location USING GIST(geog2)
WHERE is_main_location = TRUE AND geog2 IS NOT NULL;

-- Only index published media with org context
CREATE INDEX IF NOT EXISTS idx_media_published_org
ON media(object_id, org_object_id, is_main, position)
WHERE is_published = TRUE;

-- Only index active classifications
CREATE INDEX IF NOT EXISTS idx_classification_active
ON object_classification(object_id, value_id, scheme_id)
WHERE status = 'granted';
-- Critical indexes for 1M+ row performance
CREATE INDEX IF NOT EXISTS idx_object_type_status ON object(object_type, status);
CREATE INDEX IF NOT EXISTS idx_object_updated_at ON object(updated_at);
DROP INDEX IF EXISTS idx_object_updated_at_brin;
CREATE INDEX IF NOT EXISTS idx_object_updated_at_published
ON object(updated_at)
WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_object_org_link_org ON object_org_link(org_object_id, is_primary);
-- Address indexes removed; see object_location indexes below
-- Legacy location indexes removed (using object_location)
CREATE INDEX IF NOT EXISTS idx_object_place_object ON object_place(object_id);
-- geog2 removed from object_place; spatial index resides on object_location
-- altitude index removed with simplified object_place (use object_location if needed)
CREATE INDEX IF NOT EXISTS idx_contact_channel_object_id ON contact_channel(object_id);
CREATE INDEX IF NOT EXISTS idx_contact_channel_kind_id ON contact_channel(kind_id);
CREATE INDEX IF NOT EXISTS idx_contact_channel_value ON contact_channel(value);
CREATE INDEX IF NOT EXISTS idx_contact_channel_public ON contact_channel(is_public);
CREATE INDEX IF NOT EXISTS idx_contact_channel_role ON contact_channel(role_id);
CREATE INDEX IF NOT EXISTS idx_contact_channel_object_kind_id ON contact_channel(object_id, kind_id);
CREATE INDEX IF NOT EXISTS idx_media_object_id ON media(object_id);
CREATE INDEX IF NOT EXISTS idx_media_org_object_id ON media(org_object_id) WHERE org_object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_object_org ON media(object_id, org_object_id) WHERE org_object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_place_id ON media(place_id);
CREATE INDEX IF NOT EXISTS idx_media_media_type_id ON media(media_type_id);
CREATE INDEX IF NOT EXISTS idx_media_is_published ON media(is_published);
CREATE INDEX IF NOT EXISTS idx_media_rights_expires_at ON media(rights_expires_at);
CREATE INDEX IF NOT EXISTS idx_media_analyse_data ON media USING GIN (analyse_data);
CREATE INDEX IF NOT EXISTS idx_media_is_main ON media(is_main);
CREATE INDEX IF NOT EXISTS idx_media_visibility ON media(visibility);
DROP INDEX IF EXISTS idx_media_updated_at_brin;
CREATE INDEX IF NOT EXISTS idx_media_updated_at_published
ON media(updated_at)
WHERE is_published = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_one_main_per_type ON media(object_id, media_type_id) WHERE is_main;
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_one_main_per_type_place ON media(place_id, media_type_id) WHERE is_main;
CREATE INDEX IF NOT EXISTS idx_media_title_normalized_trgm ON media USING GIN (title_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_media_description_normalized_trgm ON media USING GIN (description_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_description_object_id ON object_description(object_id);
CREATE INDEX IF NOT EXISTS idx_object_description_normalized_trgm ON object_description USING GIN (description_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_description_chapo_normalized_trgm ON object_description USING GIN (description_chapo_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_description_i18n_gin
ON object_description USING GIN (description_i18n jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_object_private_description_object ON object_private_description(object_id);
CREATE INDEX IF NOT EXISTS idx_object_private_description_object_org ON object_private_description(object_id, org_object_id);
CREATE INDEX IF NOT EXISTS idx_object_external_id_object_id ON object_external_id(object_id);
CREATE INDEX IF NOT EXISTS idx_object_external_id_organization_object_id ON object_external_id(organization_object_id);
CREATE INDEX IF NOT EXISTS idx_object_origin_object_id ON object_origin(object_id);
-- Legacy legal indexes removed (using object_legal only)
-- Simple opening table indexes removed
CREATE INDEX IF NOT EXISTS idx_object_language_object_id ON object_language(object_id);
CREATE INDEX IF NOT EXISTS idx_object_language_language_id ON object_language(language_id);
CREATE INDEX IF NOT EXISTS idx_object_amenity_object_id ON object_amenity(object_id);
CREATE INDEX IF NOT EXISTS idx_object_amenity_amenity_id ON object_amenity(amenity_id);
CREATE INDEX IF NOT EXISTS idx_media_tag_media_id ON media_tag(media_id);
CREATE INDEX IF NOT EXISTS idx_media_tag_tag_id ON media_tag(tag_id);
CREATE INDEX IF NOT EXISTS idx_object_review_object_id ON object_review(object_id);
CREATE INDEX IF NOT EXISTS idx_object_review_source_id ON object_review(source_id);
CREATE INDEX IF NOT EXISTS idx_object_review_published ON object_review(is_published);
CREATE INDEX IF NOT EXISTS idx_object_review_date ON object_review(review_date);
CREATE INDEX IF NOT EXISTS idx_room_type_object_id ON object_room_type(object_id);
CREATE INDEX IF NOT EXISTS idx_room_type_published ON object_room_type(is_published);
CREATE INDEX IF NOT EXISTS idx_room_type_view_type ON object_room_type(view_type_id);
CREATE INDEX IF NOT EXISTS idx_room_type_amenity_amenity_id ON object_room_type_amenity(amenity_id);
CREATE INDEX IF NOT EXISTS idx_room_type_media_media_id ON object_room_type_media(media_id);
CREATE INDEX IF NOT EXISTS idx_promotion_active_public ON promotion(is_active, is_public);
CREATE INDEX IF NOT EXISTS idx_promotion_validity ON promotion(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_promotion_object_object_id ON promotion_object(object_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_promotion_id ON promotion_usage(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_user_id ON promotion_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_object_payment_method_object_id ON object_payment_method(object_id);
CREATE INDEX IF NOT EXISTS idx_object_payment_method_payment_method_id ON object_payment_method(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_object_environment_tag_object_id ON object_environment_tag(object_id);
CREATE INDEX IF NOT EXISTS idx_object_environment_tag_environment_tag_id ON object_environment_tag(environment_tag_id);
CREATE INDEX IF NOT EXISTS idx_object_org_link_object_id ON object_org_link(object_id);
CREATE INDEX IF NOT EXISTS idx_object_org_link_org_object_id ON object_org_link(org_object_id);
CREATE INDEX IF NOT EXISTS idx_object_org_link_role_id ON object_org_link(role_id);
CREATE INDEX IF NOT EXISTS idx_object_zone_object_id ON object_zone(object_id);
CREATE INDEX IF NOT EXISTS idx_object_zone_insee_commune ON object_zone(insee_commune);
CREATE INDEX IF NOT EXISTS idx_ref_sustainability_action_category_id ON ref_sustainability_action(category_id);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_object_id ON object_sustainability_action(object_id);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_action_id ON object_sustainability_action(action_id);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_label_action_id ON object_sustainability_action_label(object_sustainability_action_id);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_label_classification_id ON object_sustainability_action_label(object_classification_id);
CREATE INDEX IF NOT EXISTS idx_ref_tag_slug_ci ON ref_tag (immutable_unaccent(lower(slug)));
CREATE INDEX IF NOT EXISTS idx_tag_link_tag_id ON tag_link(tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_link_target ON tag_link(target_table, target_pk);
CREATE INDEX IF NOT EXISTS idx_actor_display_name_normalized_trgm ON actor USING GIN (display_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actor_first_name_normalized_trgm ON actor USING GIN (first_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actor_last_name_normalized_trgm ON actor USING GIN (last_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_task_object ON crm_task(object_id);
CREATE INDEX IF NOT EXISTS idx_crm_task_owner_due ON crm_task(owner, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_task_status ON crm_task(status);
CREATE INDEX IF NOT EXISTS idx_object_price_object ON object_price(object_id);
CREATE INDEX IF NOT EXISTS idx_object_price_kind ON object_price(kind_id);
CREATE INDEX IF NOT EXISTS idx_object_price_unit ON object_price(unit_id);
CREATE INDEX IF NOT EXISTS idx_object_price_validity ON object_price(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_object_price_indication ON object_price(indication_code);
CREATE INDEX IF NOT EXISTS idx_object_discount_object ON object_discount(object_id);
CREATE INDEX IF NOT EXISTS idx_object_discount_validity ON object_discount(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_object_discount_groups ON object_discount(min_group_size, max_group_size);
CREATE INDEX IF NOT EXISTS idx_object_group_policy_object ON object_group_policy(object_id);
CREATE INDEX IF NOT EXISTS idx_object_pet_policy_object ON object_pet_policy(object_id);
CREATE INDEX IF NOT EXISTS idx_meeting_room_object ON object_meeting_room(object_id);
CREATE INDEX IF NOT EXISTS idx_meeting_room_equipment_room ON meeting_room_equipment(room_id);
CREATE INDEX IF NOT EXISTS idx_meeting_room_equipment_equipment ON meeting_room_equipment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_opening_period_object ON opening_period(object_id);
CREATE INDEX IF NOT EXISTS idx_opening_schedule_period ON opening_schedule(period_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_schedule ON opening_time_period(schedule_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_weekday_period ON opening_time_period_weekday(time_period_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_weekday_weekday ON opening_time_period_weekday(weekday_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_frame_period ON opening_time_frame(time_period_id);
CREATE INDEX IF NOT EXISTS idx_object_fma_object_id ON object_fma(object_id);
CREATE INDEX IF NOT EXISTS idx_object_fma_occ_object ON object_fma_occurrence(object_id);
CREATE INDEX IF NOT EXISTS idx_object_fma_occ_start ON object_fma_occurrence(start_at);
CREATE INDEX IF NOT EXISTS idx_object_iti_object_id ON object_iti(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_geom ON object_iti USING GIST (geom);
-- Additional GPX-specific indexes
CREATE INDEX IF NOT EXISTS idx_iti_geom_bbox
ON object_iti USING GIST(geom)
WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_iti_with_track
ON object_iti(object_id, distance_km, difficulty_level)
WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_iti_practice_object_id ON object_iti_practice(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_practice_practice_id ON object_iti_practice(practice_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_object_id ON object_iti_stage(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_geom_gist ON object_iti_stage USING GIST (geom);
-- Index for stage waypoints with coordinates
CREATE INDEX IF NOT EXISTS idx_iti_stage_with_geom
ON object_iti_stage(object_id, position)
WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_media_stage_id ON object_iti_stage_media(stage_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_media_media_id ON object_iti_stage_media(media_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_section_parent_object_id ON object_iti_section(parent_object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_associated_object_object_id ON object_iti_associated_object(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_associated_object_associated_object_id ON object_iti_associated_object(associated_object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_profile_object ON object_iti_profile(object_id);
CREATE INDEX IF NOT EXISTS idx_i18n_translation_target ON i18n_translation(target_table, target_pk);
CREATE INDEX IF NOT EXISTS idx_i18n_translation_column_language ON i18n_translation(target_table, target_column, language_id);

-- =====================================================
-- Materialized views for reference data caching
-- =====================================================

-- Consolidated reference data cache for frequently accessed data
DROP MATERIALIZED VIEW IF EXISTS public.mv_ref_data_json CASCADE;
DROP MATERIALIZED VIEW IF EXISTS internal.mv_ref_data_json CASCADE;
CREATE MATERIALIZED VIEW internal.mv_ref_data_json AS
SELECT 
  'amenity' as ref_type,
  ra.id,
  ra.code,
  jsonb_build_object(
    'code', ra.code,
    'name', ra.name,
    'name_i18n', ra.name_i18n,
    'icon_url', ra.icon_url,
    'family_code', fam.code,
    'family_name', fam.name,
    'family_icon_url', fam.icon_url
  ) as json_data
FROM ref_amenity ra
LEFT JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
UNION ALL
SELECT 
  'language',
  rl.id,
  rl.code,
  jsonb_build_object(
    'code', rl.code,
    'name', rl.name
  ) as json_data
FROM ref_language rl
UNION ALL
SELECT 
  'media_type',
  mt.id,
  mt.code,
  jsonb_build_object(
    'code', mt.code,
    'name', mt.name,
    'name_i18n', mt.name_i18n,
    'description_i18n', mt.description_i18n,
    'icon_url', mt.icon_url
  ) as json_data
FROM ref_code_media_type mt
UNION ALL
SELECT
  'contact_kind',
  ck.id,
  ck.code,
  jsonb_build_object(
    'code', ck.code,
    'name', ck.name,
    'description', ck.description,
    'icon_url', ck.icon_url
  ) as json_data
FROM ref_code_contact_kind ck;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ref_data_type_id ON internal.mv_ref_data_json(ref_type, id);
CREATE INDEX IF NOT EXISTS idx_mv_ref_data_code ON internal.mv_ref_data_json(ref_type, code);

-- Note: Refresh this view daily or when reference data changes
-- REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;

-- Hot-path filter projection for list/map endpoints (published + main location).
-- Freshness strategy: REFRESH MATERIALIZED VIEW CONCURRENTLY via pg_cron every 5 minutes.
DROP MATERIALIZED VIEW IF EXISTS public.mv_filtered_objects CASCADE;
DROP MATERIALIZED VIEW IF EXISTS internal.mv_filtered_objects CASCADE;
CREATE MATERIALIZED VIEW internal.mv_filtered_objects AS
SELECT
  o.id,
  o.object_type,
  o.status,
  o.commercial_visibility,
  o.updated_at,
  o.name_normalized,
  o.name_search_vector,
  ol.city_search_vector,
  ol.latitude,
  ol.longitude,
  ol.geog2,
  o.cached_min_price,
  o.cached_main_image_url,
  o.cached_rating,
  o.cached_is_open_now,
  o.cached_amenity_codes,
  o.cached_payment_codes,
  o.cached_environment_tags,
  o.cached_language_codes,
  o.cached_classification_codes
FROM object o
LEFT JOIN object_location ol
  ON ol.object_id = o.id
 AND ol.is_main_location IS TRUE
WHERE o.status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_filtered_objects_id
ON internal.mv_filtered_objects(id);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_name_search_gin
ON internal.mv_filtered_objects USING GIN(name_search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_city_search_gin
ON internal.mv_filtered_objects USING GIN(city_search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_geog_gist
ON internal.mv_filtered_objects USING GIST(geog2);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_amenity_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_amenity_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_payment_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_payment_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_environment_tags_gin
ON internal.mv_filtered_objects USING GIN(cached_environment_tags);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_language_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_language_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_classification_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_classification_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_updated_at_id
ON internal.mv_filtered_objects(updated_at, id);

-- =====================================================
-- Triggers for cached GPX/KML generation
-- =====================================================

-- Regenerate GPX/KML when itinerary geometry changes
CREATE OR REPLACE FUNCTION regenerate_iti_track_cache()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.geom IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.geom IS DISTINCT FROM OLD.geom) THEN
    -- Generate GPX (track only, stages added separately by export function)
    NEW.cached_gpx := CASE 
      WHEN NEW.geom IS NOT NULL 
      THEN ST_AsGPX(3, NEW.geom::geometry, 15, 1, NULL, NULL)
      ELSE NULL
    END;
    
    -- Generate KML
    NEW.cached_kml := CASE 
      WHEN NEW.geom IS NOT NULL 
      THEN ST_AsKML(3, NEW.geom::geometry, 15, NULL)
      ELSE NULL
    END;
    
    NEW.cached_gpx_generated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cache_iti_track ON object_iti;
CREATE TRIGGER trg_cache_iti_track
BEFORE INSERT OR UPDATE ON object_iti
FOR EACH ROW EXECUTE FUNCTION regenerate_iti_track_cache();

-- =====================================================
-- Triggers for cached aggregate updates
-- =====================================================

-- Update cached min price when prices change
CREATE OR REPLACE FUNCTION update_object_cached_min_price()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_new_object_id TEXT;
  v_old_object_id TEXT;
BEGIN
  v_new_object_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.object_id ELSE NULL END;
  v_old_object_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.object_id ELSE NULL END;

  IF v_old_object_id IS NOT NULL THEN
    UPDATE object
    SET cached_min_price = (
      SELECT MIN(amount)
      FROM object_price
      WHERE object_id = v_old_object_id
        AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
    )
    WHERE id = v_old_object_id
      AND cached_min_price IS DISTINCT FROM (
        SELECT MIN(amount)
        FROM object_price
        WHERE object_id = v_old_object_id
          AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      );
  END IF;

  IF v_new_object_id IS NOT NULL AND v_new_object_id IS DISTINCT FROM v_old_object_id THEN
    UPDATE object
    SET cached_min_price = (
      SELECT MIN(amount)
      FROM object_price
      WHERE object_id = v_new_object_id
        AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
    )
    WHERE id = v_new_object_id
      AND cached_min_price IS DISTINCT FROM (
        SELECT MIN(amount)
        FROM object_price
        WHERE object_id = v_new_object_id
          AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cached_min_price ON object_price;
CREATE TRIGGER trg_update_cached_min_price
AFTER INSERT OR UPDATE OR DELETE ON object_price
FOR EACH ROW EXECUTE FUNCTION update_object_cached_min_price();

-- Update cached main image when media changes
CREATE OR REPLACE FUNCTION update_object_cached_main_image()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_new_object_id TEXT;
  v_old_object_id TEXT;
BEGIN
  v_new_object_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.object_id ELSE NULL END;
  v_old_object_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.object_id ELSE NULL END;

  IF v_old_object_id IS NOT NULL THEN
    UPDATE object
    SET cached_main_image_url = (
      SELECT url
      FROM media
      WHERE object_id = v_old_object_id
        AND is_published = TRUE
        AND is_main = TRUE
        AND (kind IS NULL OR kind = 'illustration')
      ORDER BY position NULLS LAST
      LIMIT 1
    )
    WHERE id = v_old_object_id
      AND cached_main_image_url IS DISTINCT FROM (
        SELECT url
        FROM media
        WHERE object_id = v_old_object_id
          AND is_published = TRUE
          AND is_main = TRUE
          AND (kind IS NULL OR kind = 'illustration')
        ORDER BY position NULLS LAST
        LIMIT 1
      );
  END IF;

  IF v_new_object_id IS NOT NULL AND v_new_object_id IS DISTINCT FROM v_old_object_id THEN
    UPDATE object
    SET cached_main_image_url = (
      SELECT url
      FROM media
      WHERE object_id = v_new_object_id
        AND is_published = TRUE
        AND is_main = TRUE
        AND (kind IS NULL OR kind = 'illustration')
      ORDER BY position NULLS LAST
      LIMIT 1
    )
    WHERE id = v_new_object_id
      AND cached_main_image_url IS DISTINCT FROM (
        SELECT url
        FROM media
        WHERE object_id = v_new_object_id
          AND is_published = TRUE
          AND is_main = TRUE
          AND (kind IS NULL OR kind = 'illustration')
        ORDER BY position NULLS LAST
        LIMIT 1
      );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cached_main_image ON media;
CREATE TRIGGER trg_update_cached_main_image
AFTER INSERT OR UPDATE OR DELETE ON media
FOR EACH ROW EXECUTE FUNCTION update_object_cached_main_image();

-- Update cached rating metrics when reviews change
CREATE OR REPLACE FUNCTION update_object_cached_rating_metrics()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_new_object_id TEXT;
  v_old_object_id TEXT;
BEGIN
  v_new_object_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.object_id ELSE NULL END;
  v_old_object_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.object_id ELSE NULL END;

  IF v_old_object_id IS NOT NULL THEN
    UPDATE object
    SET
      cached_rating = (
        SELECT ROUND(AVG(r.rating)::numeric, 2)
        FROM object_review r
        WHERE r.object_id = v_old_object_id
          AND r.is_published = TRUE
          AND r.rating IS NOT NULL
      ),
      cached_review_count = (
        SELECT COUNT(*)
        FROM object_review r
        WHERE r.object_id = v_old_object_id
          AND r.is_published = TRUE
      )
    WHERE id = v_old_object_id
      AND (
        cached_rating IS DISTINCT FROM (
          SELECT ROUND(AVG(r.rating)::numeric, 2)
          FROM object_review r
          WHERE r.object_id = v_old_object_id
            AND r.is_published = TRUE
            AND r.rating IS NOT NULL
        )
        OR cached_review_count IS DISTINCT FROM (
          SELECT COUNT(*)
          FROM object_review r
          WHERE r.object_id = v_old_object_id
            AND r.is_published = TRUE
        )
      );
  END IF;

  IF v_new_object_id IS NOT NULL AND v_new_object_id IS DISTINCT FROM v_old_object_id THEN
    UPDATE object
    SET
      cached_rating = (
        SELECT ROUND(AVG(r.rating)::numeric, 2)
        FROM object_review r
        WHERE r.object_id = v_new_object_id
          AND r.is_published = TRUE
          AND r.rating IS NOT NULL
      ),
      cached_review_count = (
        SELECT COUNT(*)
        FROM object_review r
        WHERE r.object_id = v_new_object_id
          AND r.is_published = TRUE
      )
    WHERE id = v_new_object_id
      AND (
        cached_rating IS DISTINCT FROM (
          SELECT ROUND(AVG(r.rating)::numeric, 2)
          FROM object_review r
          WHERE r.object_id = v_new_object_id
            AND r.is_published = TRUE
            AND r.rating IS NOT NULL
        )
        OR cached_review_count IS DISTINCT FROM (
          SELECT COUNT(*)
          FROM object_review r
          WHERE r.object_id = v_new_object_id
            AND r.is_published = TRUE
        )
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cached_rating_metrics ON object_review;
CREATE TRIGGER trg_update_cached_rating_metrics
AFTER INSERT OR UPDATE OR DELETE ON object_review
FOR EACH ROW EXECUTE FUNCTION update_object_cached_rating_metrics();

-- Refresh denormalized filter caches used by hot-path filtered listing.
CREATE OR REPLACE FUNCTION api.refresh_object_filter_caches(p_object_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_cached_amenity_codes TEXT[];
  v_cached_payment_codes TEXT[];
  v_cached_environment_tags TEXT[];
  v_cached_language_codes TEXT[];
  v_cached_classification_codes TEXT[];
BEGIN
  IF p_object_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT ra.code ORDER BY ra.code)
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    WHERE oa.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_amenity_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT pm.code ORDER BY pm.code)
    FROM object_payment_method opm
    JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
    WHERE opm.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_payment_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT et.code ORDER BY et.code)
    FROM object_environment_tag oet
    JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
    WHERE oet.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_environment_tags;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT rl.code ORDER BY rl.code)
    FROM object_language ol
    JOIN ref_language rl ON rl.id = ol.language_id
    WHERE ol.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_language_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT (s.code || ':' || v.code) ORDER BY (s.code || ':' || v.code))
    FROM object_classification oc
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    WHERE oc.object_id = p_object_id
      AND oc.status = 'granted'
  ), ARRAY[]::TEXT[])
  INTO v_cached_classification_codes;

  UPDATE object o
  SET
    cached_amenity_codes = v_cached_amenity_codes,
    cached_payment_codes = v_cached_payment_codes,
    cached_environment_tags = v_cached_environment_tags,
    cached_language_codes = v_cached_language_codes,
    cached_classification_codes = v_cached_classification_codes
  WHERE o.id = p_object_id
    AND (
      o.cached_amenity_codes IS DISTINCT FROM v_cached_amenity_codes
      OR o.cached_payment_codes IS DISTINCT FROM v_cached_payment_codes
      OR o.cached_environment_tags IS DISTINCT FROM v_cached_environment_tags
      OR o.cached_language_codes IS DISTINCT FROM v_cached_language_codes
      OR o.cached_classification_codes IS DISTINCT FROM v_cached_classification_codes
    );
END;
$$;

CREATE OR REPLACE FUNCTION api.trg_refresh_object_filter_caches_from_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_new_object_id TEXT;
  v_old_object_id TEXT;
BEGIN
  v_new_object_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.object_id ELSE NULL END;
  v_old_object_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.object_id ELSE NULL END;

  IF v_old_object_id IS NOT NULL THEN
    PERFORM api.refresh_object_filter_caches(v_old_object_id);
  END IF;

  IF v_new_object_id IS NOT NULL AND v_new_object_id IS DISTINCT FROM v_old_object_id THEN
    PERFORM api.refresh_object_filter_caches(v_new_object_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_amenity ON object_amenity;
CREATE TRIGGER trg_refresh_object_filter_caches_object_amenity
AFTER INSERT OR UPDATE OR DELETE ON object_amenity
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_payment_method ON object_payment_method;
CREATE TRIGGER trg_refresh_object_filter_caches_object_payment_method
AFTER INSERT OR UPDATE OR DELETE ON object_payment_method
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_environment_tag ON object_environment_tag;
CREATE TRIGGER trg_refresh_object_filter_caches_object_environment_tag
AFTER INSERT OR UPDATE OR DELETE ON object_environment_tag
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_language ON object_language;
CREATE TRIGGER trg_refresh_object_filter_caches_object_language
AFTER INSERT OR UPDATE OR DELETE ON object_language
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_classification ON object_classification;
CREATE TRIGGER trg_refresh_object_filter_caches_object_classification
AFTER INSERT OR UPDATE OR DELETE ON object_classification
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

-- One-time/upgrade backfill for existing object rows
UPDATE object o
SET
  cached_amenity_codes = COALESCE((
    SELECT array_agg(DISTINCT ra.code::text ORDER BY ra.code::text)
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    WHERE oa.object_id = o.id
  ), ARRAY[]::TEXT[]),
  cached_payment_codes = COALESCE((
    SELECT array_agg(DISTINCT pm.code::text ORDER BY pm.code::text)
    FROM object_payment_method opm
    JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
    WHERE opm.object_id = o.id
  ), ARRAY[]::TEXT[]),
  cached_environment_tags = COALESCE((
    SELECT array_agg(DISTINCT et.code::text ORDER BY et.code::text)
    FROM object_environment_tag oet
    JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
    WHERE oet.object_id = o.id
  ), ARRAY[]::TEXT[]),
  cached_language_codes = COALESCE((
    SELECT array_agg(DISTINCT rl.code::text ORDER BY rl.code::text)
    FROM object_language ol
    JOIN ref_language rl ON rl.id = ol.language_id
    WHERE ol.object_id = o.id
  ), ARRAY[]::TEXT[]),
  cached_classification_codes = COALESCE((
    SELECT array_agg(DISTINCT (s.code || ':' || v.code) ORDER BY (s.code || ':' || v.code))
    FROM object_classification oc
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    WHERE oc.object_id = o.id
      AND oc.status = 'granted'
  ), ARRAY[]::TEXT[])
WHERE
  o.cached_amenity_codes IS DISTINCT FROM COALESCE((
    SELECT array_agg(DISTINCT ra.code::text ORDER BY ra.code::text)
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    WHERE oa.object_id = o.id
  ), ARRAY[]::TEXT[])
  OR o.cached_payment_codes IS DISTINCT FROM COALESCE((
    SELECT array_agg(DISTINCT pm.code::text ORDER BY pm.code::text)
    FROM object_payment_method opm
    JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
    WHERE opm.object_id = o.id
  ), ARRAY[]::TEXT[])
  OR o.cached_environment_tags IS DISTINCT FROM COALESCE((
    SELECT array_agg(DISTINCT et.code::text ORDER BY et.code::text)
    FROM object_environment_tag oet
    JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
    WHERE oet.object_id = o.id
  ), ARRAY[]::TEXT[])
  OR o.cached_language_codes IS DISTINCT FROM COALESCE((
    SELECT array_agg(DISTINCT rl.code::text ORDER BY rl.code::text)
    FROM object_language ol
    JOIN ref_language rl ON rl.id = ol.language_id
    WHERE ol.object_id = o.id
  ), ARRAY[]::TEXT[])
  OR o.cached_classification_codes IS DISTINCT FROM COALESCE((
    SELECT array_agg(DISTINCT (s.code || ':' || v.code) ORDER BY (s.code || ':' || v.code))
    FROM object_classification oc
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    WHERE oc.object_id = o.id
      AND oc.status = 'granted'
  ), ARRAY[]::TEXT[]);

-- Backfill cached review metrics
UPDATE object o
SET
  cached_rating = sub.avg_rating,
  cached_review_count = sub.review_count
FROM (
  SELECT
    object_id,
    ROUND((AVG(rating) FILTER (WHERE rating IS NOT NULL))::numeric, 2) AS avg_rating,
    COUNT(*) AS review_count
  FROM object_review
  WHERE is_published = TRUE
  GROUP BY object_id
) sub
WHERE o.id = sub.object_id;

UPDATE object o
SET
  cached_rating = NULL,
  cached_review_count = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM object_review r
  WHERE r.object_id = o.id
    AND r.is_published = TRUE
);

-- Batch refresh cached_is_open_now for all objects
-- Should be called via pg_cron every 5 minutes:
-- SELECT cron.schedule('refresh-open-status', '*/5 * * * *', $$SELECT api.refresh_open_status()$$);
CREATE OR REPLACE FUNCTION api.is_opening_period_active_on_date(
  p_all_years BOOLEAN,
  p_date_start DATE,
  p_date_end DATE,
  p_local_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT
    CASE
      WHEN COALESCE(p_all_years, FALSE) = FALSE THEN
        (p_date_start IS NULL OR p_date_start <= p_local_date)
        AND (p_date_end IS NULL OR p_date_end >= p_local_date)
      ELSE
        CASE
          WHEN p_date_start IS NULL OR p_date_end IS NULL THEN TRUE
          WHEN to_char(p_date_start, 'MMDD') <= to_char(p_date_end, 'MMDD') THEN
            to_char(p_local_date, 'MMDD') BETWEEN to_char(p_date_start, 'MMDD') AND to_char(p_date_end, 'MMDD')
          ELSE
            to_char(p_local_date, 'MMDD') >= to_char(p_date_start, 'MMDD')
            OR to_char(p_local_date, 'MMDD') <= to_char(p_date_end, 'MMDD')
        END
    END;
$$;

CREATE OR REPLACE FUNCTION api.is_opening_period_active_today(
  p_all_years BOOLEAN,
  p_date_start DATE,
  p_date_end DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.is_opening_period_active_on_date(
    p_all_years,
    p_date_start,
    p_date_end,
    CURRENT_DATE
  );
$$;

CREATE OR REPLACE FUNCTION api.get_local_now_for_timezone(
  p_business_timezone TEXT
)
RETURNS TABLE (
  local_date DATE,
  local_time TIME WITHOUT TIME ZONE,
  local_isodow INT,
  business_timezone TEXT
)
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT
    (CURRENT_TIMESTAMP AT TIME ZONE tz.zone_name)::DATE AS local_date,
    (CURRENT_TIMESTAMP AT TIME ZONE tz.zone_name)::TIME AS local_time,
    EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE tz.zone_name))::INT AS local_isodow,
    tz.zone_name AS business_timezone
  FROM (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM pg_timezone_names tzn
        WHERE tzn.name = COALESCE(NULLIF(btrim(p_business_timezone), ''), 'Indian/Reunion')
      ) THEN COALESCE(NULLIF(btrim(p_business_timezone), ''), 'Indian/Reunion')
      ELSE 'Indian/Reunion'
    END AS zone_name
  ) tz;
$$;

CREATE OR REPLACE FUNCTION api.get_object_local_now(
  p_object_id TEXT
)
RETURNS TABLE (
  local_date DATE,
  local_time TIME WITHOUT TIME ZONE,
  local_isodow INT,
  business_timezone TEXT
)
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT ln.local_date, ln.local_time, ln.local_isodow, ln.business_timezone
  FROM object o
  CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
  WHERE o.id = p_object_id;
$$;

CREATE OR REPLACE FUNCTION api.refresh_open_status()
RETURNS void
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  WITH open_state AS (
    SELECT
      o.id,
      (
        EXISTS (
          SELECT 1
          FROM opening_period p
          JOIN opening_schedule s ON s.period_id = p.id
          JOIN opening_time_period tp ON tp.schedule_id = s.id
          JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
          JOIN opening_time_frame tf ON tf.time_period_id = tp.id
          JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
          CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
          WHERE p.object_id = o.id
            AND tp.closed = FALSE
            AND api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, ln.local_date)
            AND COALESCE(
              wd.dow_number,
              CASE wd.code
                WHEN 'monday' THEN 1
                WHEN 'tuesday' THEN 2
                WHEN 'wednesday' THEN 3
                WHEN 'thursday' THEN 4
                WHEN 'friday' THEN 5
                WHEN 'saturday' THEN 6
                WHEN 'sunday' THEN 7
                ELSE NULL
              END
            ) = ln.local_isodow
            AND (tf.start_time IS NULL OR tf.start_time <= ln.local_time)
            AND (tf.end_time IS NULL OR tf.end_time > ln.local_time)
        )
        OR EXISTS (
          SELECT 1
          FROM opening_period p
          JOIN opening_schedule s ON s.period_id = p.id
          JOIN opening_time_period tp ON tp.schedule_id = s.id
          JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
          JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
          CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
          WHERE p.object_id = o.id
            AND tp.closed = FALSE
            AND api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, ln.local_date)
            AND COALESCE(
              wd.dow_number,
              CASE wd.code
                WHEN 'monday' THEN 1
                WHEN 'tuesday' THEN 2
                WHEN 'wednesday' THEN 3
                WHEN 'thursday' THEN 4
                WHEN 'friday' THEN 5
                WHEN 'saturday' THEN 6
                WHEN 'sunday' THEN 7
                ELSE NULL
              END
            ) = ln.local_isodow
            AND NOT EXISTS (SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id = tp.id)
        )
      ) AS new_is_open_now
    FROM object o
    WHERE o.status = 'published'
  )
  UPDATE object o
  SET cached_is_open_now = s.new_is_open_now
  FROM open_state s
  WHERE o.id = s.id
    AND o.cached_is_open_now IS DISTINCT FROM s.new_is_open_now;
END;
$$;

CREATE OR REPLACE FUNCTION api.disable_cache_triggers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SET LOCAL session_replication_role = replica;
END;
$$;

CREATE OR REPLACE FUNCTION api.enable_cache_triggers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('service_role', 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SET LOCAL session_replication_role = DEFAULT;
END;
$$;

-- =====================================================
-- Triggers updated_at sur les tables clés
-- =====================================================
DROP TRIGGER IF EXISTS update_ref_language_updated_at ON ref_language;
CREATE TRIGGER update_ref_language_updated_at BEFORE UPDATE ON ref_language FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_code_updated_at ON ref_code;
CREATE TRIGGER update_ref_code_updated_at BEFORE UPDATE ON ref_code FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_amenity_updated_at ON ref_amenity;
CREATE TRIGGER update_ref_amenity_updated_at BEFORE UPDATE ON ref_amenity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_sustainability_action_category_updated_at ON ref_sustainability_action_category;
CREATE TRIGGER update_ref_sustainability_action_category_updated_at BEFORE UPDATE ON ref_sustainability_action_category FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_sustainability_action_updated_at ON ref_sustainability_action;
CREATE TRIGGER update_ref_sustainability_action_updated_at BEFORE UPDATE ON ref_sustainability_action FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_document_updated_at ON ref_document;
CREATE TRIGGER update_ref_document_updated_at BEFORE UPDATE ON ref_document FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_tag_updated_at ON ref_tag;
CREATE TRIGGER update_ref_tag_updated_at BEFORE UPDATE ON ref_tag FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_classification_scheme_updated_at ON ref_classification_scheme;
CREATE TRIGGER update_ref_classification_scheme_updated_at BEFORE UPDATE ON ref_classification_scheme FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_classification_value_updated_at ON ref_classification_value;
CREATE TRIGGER update_ref_classification_value_updated_at BEFORE UPDATE ON ref_classification_value FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_org_role_updated_at ON ref_org_role;
CREATE TRIGGER update_ref_org_role_updated_at BEFORE UPDATE ON ref_org_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_contact_role_updated_at ON ref_contact_role;
CREATE TRIGGER update_ref_contact_role_updated_at BEFORE UPDATE ON ref_contact_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_capacity_metric_updated_at ON ref_capacity_metric;
CREATE TRIGGER update_ref_capacity_metric_updated_at BEFORE UPDATE ON ref_capacity_metric FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_iti_assoc_role_updated_at ON ref_iti_assoc_role;
CREATE TRIGGER update_ref_iti_assoc_role_updated_at BEFORE UPDATE ON ref_iti_assoc_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_object_relation_type_updated_at ON ref_object_relation_type;
CREATE TRIGGER update_ref_object_relation_type_updated_at BEFORE UPDATE ON ref_object_relation_type FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_object_updated_at ON object;
CREATE TRIGGER update_object_updated_at BEFORE UPDATE ON object FOR EACH ROW EXECUTE FUNCTION update_object_updated_at_business();

-- Increment version number on INSERT/UPDATE (BEFORE trigger so version is available for save_object_version)
CREATE OR REPLACE FUNCTION increment_object_version()
RETURNS TRIGGER 
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.current_version := 1;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (
      to_jsonb(NEW) - ARRAY[
        'updated_at',
        'is_editing',
        'cached_min_price',
        'cached_main_image_url',
        'cached_rating',
        'cached_review_count',
        'cached_is_open_now',
        'cached_amenity_codes',
        'cached_payment_codes',
        'cached_environment_tags',
        'cached_language_codes',
        'cached_classification_codes',
        'current_version'
      ]
    ) IS NOT DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'updated_at',
        'is_editing',
        'cached_min_price',
        'cached_main_image_url',
        'cached_rating',
        'cached_review_count',
        'cached_is_open_now',
        'cached_amenity_codes',
        'cached_payment_codes',
        'cached_environment_tags',
        'cached_language_codes',
        'cached_classification_codes',
        'current_version'
      ]
    ) THEN
      NEW.current_version := COALESCE(OLD.current_version, 0);
      RETURN NEW;
    END IF;
    NEW.current_version := COALESCE(OLD.current_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_object_version ON object;
CREATE TRIGGER trg_increment_object_version 
BEFORE INSERT OR UPDATE ON object 
FOR EACH ROW 
EXECUTE FUNCTION increment_object_version();

-- Address trigger removed with table drop
DROP TRIGGER IF EXISTS update_object_location_updated_at ON object_location;
CREATE TRIGGER update_object_location_updated_at BEFORE UPDATE ON object_location FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_place_updated_at ON object_place;
CREATE TRIGGER update_object_place_updated_at BEFORE UPDATE ON object_place FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_contact_channel_updated_at ON contact_channel;
CREATE TRIGGER update_contact_channel_updated_at BEFORE UPDATE ON contact_channel FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_media_updated_at ON media;
CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_place_description_updated_at ON object_place_description;
CREATE TRIGGER update_object_place_description_updated_at BEFORE UPDATE ON object_place_description FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_private_description_updated_at ON object_private_description;
CREATE TRIGGER update_object_private_description_updated_at BEFORE UPDATE ON object_private_description FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_classification_updated_at ON object_classification;
CREATE TRIGGER update_object_classification_updated_at BEFORE UPDATE ON object_classification FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_enforce_classification_single_selection ON object_classification;
CREATE TRIGGER trg_enforce_classification_single_selection
BEFORE INSERT OR UPDATE ON object_classification
FOR EACH ROW EXECUTE FUNCTION enforce_classification_single_selection();
-- Legacy legal triggers removed (using object_legal only)
-- Simple opening table triggers removed
DROP TRIGGER IF EXISTS update_object_fma_updated_at ON object_fma;
CREATE TRIGGER update_object_fma_updated_at BEFORE UPDATE ON object_fma FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_fma_occurrence_updated_at ON object_fma_occurrence;
CREATE TRIGGER update_object_fma_occurrence_updated_at BEFORE UPDATE ON object_fma_occurrence FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_updated_at ON object_iti;
CREATE TRIGGER update_object_iti_updated_at BEFORE UPDATE ON object_iti FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_practice_updated_at ON object_iti_practice;
CREATE TRIGGER update_object_iti_practice_updated_at BEFORE UPDATE ON object_iti_practice FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_stage_updated_at ON object_iti_stage;
CREATE TRIGGER update_object_iti_stage_updated_at BEFORE UPDATE ON object_iti_stage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_stage_media_updated_at ON object_iti_stage_media;
CREATE TRIGGER update_object_iti_stage_media_updated_at BEFORE UPDATE ON object_iti_stage_media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_section_updated_at ON object_iti_section;
CREATE TRIGGER update_object_iti_section_updated_at BEFORE UPDATE ON object_iti_section FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_associated_object_updated_at ON object_iti_associated_object;
CREATE TRIGGER update_object_iti_associated_object_updated_at BEFORE UPDATE ON object_iti_associated_object FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_iti_info_updated_at ON object_iti_info;
CREATE TRIGGER update_object_iti_info_updated_at BEFORE UPDATE ON object_iti_info FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_zone_updated_at ON object_zone;
CREATE TRIGGER update_object_zone_updated_at BEFORE UPDATE ON object_zone FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_external_id_updated_at ON object_external_id;
CREATE TRIGGER update_object_external_id_updated_at BEFORE UPDATE ON object_external_id FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_validate_org_object_type_object_org_link ON object_org_link;
CREATE TRIGGER trg_validate_org_object_type_object_org_link
BEFORE INSERT OR UPDATE ON object_org_link
FOR EACH ROW EXECUTE FUNCTION validate_org_object_type('org_object_id');
DROP TRIGGER IF EXISTS trg_validate_org_object_type_object_membership ON object_membership;
CREATE TRIGGER trg_validate_org_object_type_object_membership
BEFORE INSERT OR UPDATE ON object_membership
FOR EACH ROW EXECUTE FUNCTION validate_org_object_type('org_object_id');
DROP TRIGGER IF EXISTS trg_validate_org_object_type_object_external_id ON object_external_id;
CREATE TRIGGER trg_validate_org_object_type_object_external_id
BEFORE INSERT OR UPDATE ON object_external_id
FOR EACH ROW EXECUTE FUNCTION validate_org_object_type('organization_object_id');
DROP TRIGGER IF EXISTS trg_validate_org_object_type_object_description ON object_description;
CREATE TRIGGER trg_validate_org_object_type_object_description
BEFORE INSERT OR UPDATE ON object_description
FOR EACH ROW EXECUTE FUNCTION validate_org_object_type('org_object_id');
DROP TRIGGER IF EXISTS update_object_origin_updated_at ON object_origin;
CREATE TRIGGER update_object_origin_updated_at BEFORE UPDATE ON object_origin FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_sustainability_action_updated_at ON object_sustainability_action;
CREATE TRIGGER update_object_sustainability_action_updated_at BEFORE UPDATE ON object_sustainability_action FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_capacity_updated_at ON object_capacity;
CREATE TRIGGER update_object_capacity_updated_at BEFORE UPDATE ON object_capacity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_i18n_translation_updated_at ON i18n_translation;
CREATE TRIGGER update_i18n_translation_updated_at BEFORE UPDATE ON i18n_translation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_crm_interaction_updated_at ON crm_interaction;
CREATE TRIGGER update_crm_interaction_updated_at BEFORE UPDATE ON crm_interaction FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_crm_task_updated_at ON crm_task;
CREATE TRIGGER update_crm_task_updated_at BEFORE UPDATE ON crm_task FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_price_updated_at ON object_price;
CREATE TRIGGER update_object_price_updated_at BEFORE UPDATE ON object_price FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_price_period_updated_at ON object_price_period;
CREATE TRIGGER update_object_price_period_updated_at BEFORE UPDATE ON object_price_period FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_discount_updated_at ON object_discount;
CREATE TRIGGER update_object_discount_updated_at BEFORE UPDATE ON object_discount FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_group_policy_updated_at ON object_group_policy;
CREATE TRIGGER update_object_group_policy_updated_at BEFORE UPDATE ON object_group_policy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_pet_policy_updated_at ON object_pet_policy;
CREATE TRIGGER update_object_pet_policy_updated_at BEFORE UPDATE ON object_pet_policy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_meeting_room_updated_at ON object_meeting_room;
CREATE TRIGGER update_object_meeting_room_updated_at BEFORE UPDATE ON object_meeting_room FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_relation_updated_at ON object_relation;
CREATE TRIGGER update_object_relation_updated_at BEFORE UPDATE ON object_relation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_opening_period_updated_at ON opening_period;
CREATE TRIGGER update_opening_period_updated_at BEFORE UPDATE ON opening_period FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_opening_schedule_updated_at ON opening_schedule;
CREATE TRIGGER update_opening_schedule_updated_at BEFORE UPDATE ON opening_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_opening_time_period_updated_at ON opening_time_period;
CREATE TRIGGER update_opening_time_period_updated_at BEFORE UPDATE ON opening_time_period FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_opening_time_period_weekday_updated_at ON opening_time_period_weekday;
CREATE TRIGGER update_opening_time_period_weekday_updated_at BEFORE UPDATE ON opening_time_period_weekday FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_opening_time_frame_updated_at ON opening_time_frame;
CREATE TRIGGER update_opening_time_frame_updated_at BEFORE UPDATE ON opening_time_frame FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PHASE 2: Missing updated_at triggers
-- =====================================================
DROP TRIGGER IF EXISTS update_ref_review_source_updated_at ON ref_review_source;
CREATE TRIGGER update_ref_review_source_updated_at BEFORE UPDATE ON ref_review_source FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_description_updated_at ON object_description;
CREATE TRIGGER update_object_description_updated_at BEFORE UPDATE ON object_description FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_review_updated_at ON object_review;
CREATE TRIGGER update_object_review_updated_at BEFORE UPDATE ON object_review FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_org_link_updated_at ON object_org_link;
CREATE TRIGGER update_object_org_link_updated_at BEFORE UPDATE ON object_org_link FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_actor_role_updated_at ON ref_actor_role;
CREATE TRIGGER update_ref_actor_role_updated_at BEFORE UPDATE ON ref_actor_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_actor_updated_at ON actor;
CREATE TRIGGER update_actor_updated_at BEFORE UPDATE ON actor FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_actor_channel_updated_at ON actor_channel;
CREATE TRIGGER update_actor_channel_updated_at BEFORE UPDATE ON actor_channel FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_actor_object_role_updated_at ON actor_object_role;
CREATE TRIGGER update_actor_object_role_updated_at BEFORE UPDATE ON actor_object_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_object_room_type_updated_at ON object_room_type;
CREATE TRIGGER update_object_room_type_updated_at BEFORE UPDATE ON object_room_type FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_promotion_updated_at ON promotion;
CREATE TRIGGER update_promotion_updated_at BEFORE UPDATE ON promotion FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_app_user_profile_updated_at ON app_user_profile;
CREATE TRIGGER update_app_user_profile_updated_at BEFORE UPDATE ON app_user_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS enforce_app_user_profile_role_change ON app_user_profile;
CREATE TRIGGER enforce_app_user_profile_role_change
  BEFORE INSERT OR UPDATE ON app_user_profile
  FOR EACH ROW
  EXECUTE FUNCTION api.enforce_app_user_profile_role_change();
DROP TRIGGER IF EXISTS update_object_iti_profile_updated_at ON object_iti_profile;
CREATE TRIGGER update_object_iti_profile_updated_at BEFORE UPDATE ON object_iti_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Fin du schéma monolithique
-- =====================================================



-- Indexes for object_classification (idempotent)
CREATE INDEX IF NOT EXISTS idx_object_classification_object_id ON object_classification(object_id);
CREATE INDEX IF NOT EXISTS idx_object_classification_scheme_id ON object_classification(scheme_id);
CREATE INDEX IF NOT EXISTS idx_object_classification_value_id ON object_classification(value_id);
CREATE INDEX IF NOT EXISTS idx_object_classification_subvalue_ids_gin ON object_classification USING GIN (subvalue_ids);
CREATE INDEX IF NOT EXISTS idx_object_classification_document_id ON object_classification(document_id);


-- =====================================================
-- MENUS (canonical; parent first, then child)
-- =====================================================
CREATE TABLE IF NOT EXISTS object_menu (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  category_id UUID REFERENCES ref_code_menu_category(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  visibility TEXT CHECK (visibility IN ('public','private','partners')),
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_object_menu_object_id ON object_menu(object_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_category_id ON object_menu(category_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_is_active ON object_menu(is_active);
CREATE INDEX IF NOT EXISTS idx_object_menu_position ON object_menu(position);

DROP TRIGGER IF EXISTS update_object_menu_updated_at ON object_menu;
CREATE TRIGGER update_object_menu_updated_at
BEFORE UPDATE ON object_menu
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS object_menu_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_id UUID NOT NULL REFERENCES object_menu(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) CHECK (price IS NULL OR price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  kind_id UUID REFERENCES ref_code_price_kind(id) ON DELETE RESTRICT,
  unit_id UUID REFERENCES ref_code_price_unit(id) ON DELETE RESTRICT,
  media_id UUID REFERENCES media(id) ON DELETE SET NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_object_menu_item_menu_id ON object_menu_item(menu_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_position ON object_menu_item(position);

DROP TRIGGER IF EXISTS update_object_menu_item_updated_at ON object_menu_item;
CREATE TRIGGER update_object_menu_item_updated_at
BEFORE UPDATE ON object_menu_item
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Menu item dietary tags (vegan, organic, paleo, etc.)
CREATE TABLE IF NOT EXISTS object_menu_item_dietary_tag (
  menu_item_id UUID NOT NULL REFERENCES object_menu_item(id) ON DELETE CASCADE,
  dietary_tag_id UUID NOT NULL REFERENCES ref_code_dietary_tag(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, dietary_tag_id)
);

-- Menu item allergens (dairy, nuts, gluten, etc.)
CREATE TABLE IF NOT EXISTS object_menu_item_allergen (
  menu_item_id UUID NOT NULL REFERENCES object_menu_item(id) ON DELETE CASCADE,
  allergen_id UUID NOT NULL REFERENCES ref_code_allergen(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, allergen_id)
);

-- Menu item cuisine types (creole, metropolitan, chinese, traditional, etc.)
CREATE TABLE IF NOT EXISTS object_menu_item_cuisine_type (
  menu_item_id UUID NOT NULL REFERENCES object_menu_item(id) ON DELETE CASCADE,
  cuisine_type_id UUID NOT NULL REFERENCES ref_code_cuisine_type(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, cuisine_type_id)
);

-- Menu item media (many-to-many relationship)
CREATE TABLE IF NOT EXISTS object_menu_item_media (
  menu_item_id UUID NOT NULL REFERENCES object_menu_item(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_item_id, media_id)
);

-- Indexes for menu item tags
CREATE INDEX IF NOT EXISTS idx_menu_item_dietary_tag_item ON object_menu_item_dietary_tag(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_dietary_tag_tag ON object_menu_item_dietary_tag(dietary_tag_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_allergen_item ON object_menu_item_allergen(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_allergen_allergen ON object_menu_item_allergen(allergen_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_cuisine_type_item ON object_menu_item_cuisine_type(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_cuisine_type_type ON object_menu_item_cuisine_type(cuisine_type_id);

-- Indexes for menu item media
CREATE INDEX IF NOT EXISTS idx_menu_item_media_item ON object_menu_item_media(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_media_media ON object_menu_item_media(media_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_media_position ON object_menu_item_media(position);

DROP TRIGGER IF EXISTS update_object_menu_item_media_updated_at ON object_menu_item_media;
CREATE TRIGGER update_object_menu_item_media_updated_at
BEFORE UPDATE ON object_menu_item_media
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- UNIFIED LEGAL SYSTEM
-- =====================================================

-- =====================================================
-- 1. Create legal validity mode enum
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'legal_validity_mode'
  ) THEN
    CREATE TYPE legal_validity_mode AS ENUM (
      'forever',           -- Open ended, valid_to must be null
      'tacit_renewal',     -- Considered valid unless revoked, valid_to can be null
      'fixed_end_date'     -- Requires a non-null valid_to
    );
  END IF;
END $$;

-- =====================================================
-- 2. Create reference table for legal record types
-- =====================================================
CREATE TABLE IF NOT EXISTS ref_legal_type (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- e.g., 'business', 'accommodation', 'tax', 'insurance'
  is_required BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE, -- Whether the document can be public or only for parent org
  review_interval_days INTEGER, -- For tacit_renewal types, how often to review
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert common legal types
INSERT INTO ref_legal_type (code, name, description, category, is_required, is_public, review_interval_days) VALUES
  -- Business legal types
  ('siret', 'SIRET', 'Système d''identification du répertoire des établissements', 'business', true, true, NULL),
  ('siren', 'SIREN', 'Système d''identification du répertoire des entreprises', 'business', true, true, NULL),
  ('vat_number', 'Numéro TVA', 'Numéro de TVA intracommunautaire', 'business', false, false, NULL),
  ('business_license', 'Licence commerciale', 'Licence d''exploitation commerciale', 'business', false, true, 365),
  
  -- Accommodation legal types
  ('tourist_tax', 'Taxe de séjour', 'Autorisation de collecte de la taxe de séjour', 'accommodation', true, true, 365),
  ('accommodation_license', 'Licence d''hébergement', 'Licence d''exploitation d''hébergement', 'accommodation', true, true, 1095), -- 3 years
  ('safety_certificate', 'Certificat de sécurité', 'Certificat de conformité sécurité', 'accommodation', true, true, 365),
  ('fire_safety', 'Sécurité incendie', 'Attestation de sécurité incendie', 'accommodation', true, true, 365),
  ('accessibility', 'Accessibilité', 'Attestation d''accessibilité', 'accommodation', false, true, 1095),
  
  -- Insurance types
  ('liability_insurance', 'Assurance responsabilité civile', 'Assurance responsabilité civile professionnelle', 'insurance', true, false, 365),
  ('property_insurance', 'Assurance biens', 'Assurance des biens et équipements', 'insurance', true, false, 365),
  ('cyber_insurance', 'Assurance cyber', 'Assurance cybersécurité', 'insurance', false, false, 365),
  
  -- Environmental types
  ('environmental_permit', 'Permis environnemental', 'Autorisation environnementale', 'environment', false, true, 1095),
  ('waste_management', 'Gestion des déchets', 'Autorisation de gestion des déchets', 'environment', false, true, 365),
  
  -- Tourism specific
  ('tourism_license', 'Licence tourisme', 'Licence d''exploitation touristique', 'tourism', false, true, 1095),
  ('guide_license', 'Licence guide', 'Licence de guide touristique', 'tourism', false, true, 365)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 3. Create unified object_legal table
-- =====================================================
CREATE TABLE IF NOT EXISTS object_legal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  type_id UUID NOT NULL REFERENCES ref_legal_type(id) ON DELETE RESTRICT,
  value JSONB NOT NULL, -- Flexible storage for different value types
  document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  validity_mode legal_validity_mode NOT NULL DEFAULT 'fixed_end_date',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'revoked', 'requested')),
  document_requested_at TIMESTAMPTZ,
  document_delivered_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_forever_validity CHECK (
    (validity_mode = 'forever' AND valid_to IS NULL) OR
    (validity_mode != 'forever')
  ),
  CONSTRAINT chk_fixed_end_date_validity CHECK (
    (validity_mode = 'fixed_end_date' AND valid_to IS NOT NULL) OR
    (validity_mode != 'fixed_end_date')
  ),
  CONSTRAINT chk_valid_date_range CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT chk_document_delivery_date CHECK (document_delivered_at IS NULL OR document_delivered_at >= document_requested_at),
  CONSTRAINT chk_requested_status CHECK (
    (status = 'requested' AND document_requested_at IS NOT NULL) OR
    (status != 'requested')
  ),
  
  -- Optional uniqueness to avoid duplicates
  UNIQUE(object_id, type_id, valid_from)
);

-- =====================================================
-- 4. Create indexes for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_object_legal_object_type ON object_legal(object_id, type_id);
CREATE INDEX IF NOT EXISTS idx_object_legal_valid_to ON object_legal(valid_to) WHERE valid_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_legal_validity_mode ON object_legal(validity_mode);
CREATE INDEX IF NOT EXISTS idx_object_legal_status ON object_legal(status);
CREATE INDEX IF NOT EXISTS idx_object_legal_expiring ON object_legal(valid_to, status) 
  WHERE valid_to IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_object_legal_requested ON object_legal(status, document_requested_at) 
  WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_object_legal_document_dates ON object_legal(document_requested_at, document_delivered_at);

-- =====================================================
-- 5. Create trigger for updated_at
-- =====================================================
DROP TRIGGER IF EXISTS update_ref_legal_type_updated_at ON ref_legal_type;
CREATE TRIGGER update_ref_legal_type_updated_at
  BEFORE UPDATE ON ref_legal_type
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_object_legal_updated_at ON object_legal;
CREATE TRIGGER update_object_legal_updated_at 
  BEFORE UPDATE ON object_legal 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. Create views for easy querying
-- =====================================================

-- View for active legal records
CREATE OR REPLACE VIEW v_active_legal_records
WITH (security_invoker = true) AS
SELECT 
  ol.id,
  ol.object_id,
  o.name as object_name,
  o.object_type,
  rlt.code as type_code,
  rlt.name as type_name,
  rlt.category,
  ol.value,
  ol.document_id,
  ol.valid_from,
  ol.valid_to,
  ol.validity_mode,
  ol.status,
  ol.document_requested_at,
  ol.document_delivered_at,
  ol.note,
  CASE 
    WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
    ELSE NULL
  END as days_until_expiry
FROM object_legal ol
JOIN object o ON o.id = ol.object_id
JOIN ref_legal_type rlt ON rlt.id = ol.type_id
WHERE ol.status = 'active';

-- View for expiring legal records (next 30 days)
CREATE OR REPLACE VIEW v_expiring_legal_records
WITH (security_invoker = true) AS
SELECT *
FROM v_active_legal_records
WHERE valid_to IS NOT NULL 
  AND valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
ORDER BY valid_to ASC;

-- =====================================================
-- 7. Comments and documentation
-- =====================================================

COMMENT ON TABLE object_legal IS 'Unified legal records for all object types. Each record represents one legal aspect (permit, license, etc.) for one object.';
COMMENT ON COLUMN object_legal.value IS 'Flexible JSONB storage for different value types (numbers, text, structured data)';
COMMENT ON COLUMN object_legal.validity_mode IS 'How the validity period is managed: forever (no expiry), tacit_renewal (renewed unless revoked), fixed_end_date (specific end date)';
COMMENT ON COLUMN object_legal.status IS 'Current status: active, expired, suspended, revoked, requested';
COMMENT ON COLUMN object_legal.document_requested_at IS 'Timestamp when the supporting document was requested';
COMMENT ON COLUMN object_legal.document_delivered_at IS 'Timestamp when the supporting document was delivered';

COMMENT ON TABLE ref_legal_type IS 'Reference table for legal record types. Defines what types of legal documents can be stored for objects.';
COMMENT ON COLUMN ref_legal_type.is_public IS 'Whether documents of this type can be public (true) or should only be visible to parent organization (false)';

-- Run audit attachment after all table creations (including late sections).
SELECT audit.attach_missing_triggers();

