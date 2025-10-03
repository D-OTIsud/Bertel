

-- Classements/labels extensibles par schéma (moved to after object table creation)


-- =====================================================
-- TOURISM CRM - SCHÉMA UNIFIÉ (MONOLITHIQUE)
-- Fichier : tourism_crm_schema_updated (2).sql
-- Description : Schéma complet, idempotent, incluant toutes les tables (y compris celles qui manquaient)
-- =====================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Schémas
CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS crm;

-- Séquence pour ID fonctionnels
CREATE SEQUENCE IF NOT EXISTS object_id_seq START 1;

-- =====================================================
-- Fonctions utilitaires
-- =====================================================

-- immutable_unaccent
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT unaccent($1);
$$;

-- to_base36
CREATE OR REPLACE FUNCTION api.to_base36(n BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
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
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- Types
-- =====================================================

CREATE TYPE object_type AS ENUM (
  'RES','PCU','PNA','ORG','ITI','VIL','HPA','ASC','COM','HOT','HLO','LOI','FMA','CAMP'
);

CREATE TYPE object_status AS ENUM ('draft','published','archived','hidden');

CREATE TYPE crm_interaction_type AS ENUM ('call','email','meeting','visit','whatsapp','sms','note','other');
CREATE TYPE crm_direction AS ENUM ('inbound','outbound','internal');
CREATE TYPE crm_status AS ENUM ('planned','done','canceled');
CREATE TYPE crm_task_status AS ENUM ('todo','in_progress','done','canceled','blocked');
CREATE TYPE crm_task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE crm_consent_channel AS ENUM ('email','phone','sms','whatsapp','postal');

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
CREATE TABLE IF NOT EXISTS ref_code_amenity_type PARTITION OF ref_code FOR VALUES IN ('amenity_type');

-- Index d'unicité nécessaires sur chaque partition (id & code)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_contact_kind_id ON ref_code_contact_kind (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_media_type_id ON ref_code_media_type (id);
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_amenity_type_id ON ref_code_amenity_type (id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_contact_kind_code ON ref_code_contact_kind(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_media_type_code ON ref_code_media_type(code);
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_amenity_type_code ON ref_code_amenity_type(code);

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
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position IS NULL THEN
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
  family_id UUID NOT NULL REFERENCES ref_code_amenity_family(id),
  scope TEXT DEFAULT 'object' CHECK (scope IN ('object','meeting_room','both')),
  description TEXT,
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name_i18n JSONB
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
  name_i18n JSONB
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
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
  created_by UUID REFERENCES auth.users(id),
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
  region_code TEXT CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9]{3}$'),
  updated_at_source TIMESTAMPTZ,
  status object_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  is_editing BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  name_normalized TEXT GENERATED ALWAYS AS (immutable_unaccent(lower(name))) STORED,
  extra JSONB,
  name_i18n JSONB,
  CONSTRAINT chk_object_id_shape CHECK (id ~ '^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$'),
  CONSTRAINT chk_object_status CHECK (status IN ('draft','published','archived','hidden'))
);

-- Génération d'ID si absent
CREATE OR REPLACE FUNCTION api.before_insert_object_generate_id()
RETURNS TRIGGER AS $$
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

-- Mise à jour published_at
CREATE OR REPLACE FUNCTION api.manage_object_published_at()
RETURNS TRIGGER AS $$
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

CREATE TABLE IF NOT EXISTS location (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  altitude_m INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geog2 GEOGRAPHY(POINT,4326) GENERATED ALWAYS AS (
    CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8),4326)::geography
    END
  ) STORED,
  extra JSONB,
  CONSTRAINT chk_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT chk_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT chk_latlon_both_or_none CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT chk_reunion_bbox CHECK (latitude IS NULL OR longitude IS NULL OR (latitude BETWEEN -22.0 AND -20.5 AND longitude BETWEEN 55.0 AND 56.0))
);

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
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  applied_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_change_object_status ON pending_change(object_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_change_target ON pending_change(target_table, target_pk);

CREATE TRIGGER update_pending_change_updated_at BEFORE UPDATE ON pending_change FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Maintain object.is_editing based on pending changes lifecycle
CREATE OR REPLACE FUNCTION pending_change_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.object_id IS NOT NULL THEN
    UPDATE object SET is_editing = TRUE WHERE id = NEW.object_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pending_change_after_update()
RETURNS TRIGGER AS $$
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
RETURNS TRIGGER AS $$
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
  kind_id UUID NOT NULL REFERENCES ref_code_contact_kind(id),
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
  media_type_id UUID NOT NULL REFERENCES ref_code_media_type(id),
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
  CONSTRAINT chk_media_target_present CHECK (object_id IS NOT NULL OR place_id IS NOT NULL),
  CONSTRAINT chk_media_url_shape CHECK (url ~* '^https?://')
);

-- Valider dimensions médias selon type
CREATE OR REPLACE FUNCTION validate_media_dimensions()
RETURNS TRIGGER AS $$
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

-- Backfill duplicates: keep most recent canonical row per object and attach others to the object itself
-- (safe at this stage without needing object_org_link to exist yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'object_description' AND column_name = 'org_object_id'
  ) THEN
    WITH dups AS (
      SELECT id, object_id,
             ROW_NUMBER() OVER (PARTITION BY object_id ORDER BY created_at DESC, id) AS rn
      FROM object_description
      WHERE org_object_id IS NULL
    )
    UPDATE object_description d
    SET org_object_id = d.object_id
    FROM dups
    WHERE d.id = dups.id AND dups.rn > 1;
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
  visibility TEXT,
  position INTEGER DEFAULT 0,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_object_place_description_visibility CHECK (visibility IS NULL OR visibility IN ('public','private','partners'))
);
CREATE TABLE IF NOT EXISTS object_private_description (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  object_id TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
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
  external_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_object_id, external_id),
  CONSTRAINT uq_object_org UNIQUE (object_id, organization_object_id)
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
CREATE TABLE IF NOT EXISTS legal (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  siret VARCHAR(14) CHECK (LENGTH(siret) = 14 AND siret ~ '^[0-9]+$'),
  siren VARCHAR(9),
  vat_number VARCHAR(20),
  document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_siren_shape CHECK (siren IS NULL OR (LENGTH(siren) = 9 AND siren ~ '^[0-9]+$'))
);
CREATE TABLE IF NOT EXISTS accommodation_legal (
  object_id TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  tourist_tax_number VARCHAR(50),
  tourist_tax_issued_date DATE,
  tourist_tax_valid_until DATE,
  accommodation_license_number VARCHAR(50),
  accommodation_license_issued_date DATE,
  accommodation_license_valid_until DATE,
  document_id UUID REFERENCES ref_document(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Applicabilité aux hébergements
CREATE OR REPLACE FUNCTION api.ensure_accommodation_legal_applicable()
RETURNS TRIGGER AS $$
DECLARE v_type object_type;
BEGIN
  SELECT object_type INTO v_type FROM object WHERE id = NEW.object_id;
  IF v_type NOT IN ('HOT','HLO','HPA','VIL','CAMP') THEN
    RAISE EXCEPTION 'accommodation_legal applicable uniquement aux objets HOT/HLO/HPA/VIL/CAMP (id=%)', NEW.object_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_accommodation_legal_applicable ON accommodation_legal;
CREATE TRIGGER trg_accommodation_legal_applicable BEFORE INSERT OR UPDATE ON accommodation_legal FOR EACH ROW EXECUTE FUNCTION api.ensure_accommodation_legal_applicable();

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
  level_id UUID REFERENCES ref_code_language_level(id),
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
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS actor_channel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES actor(id) ON DELETE CASCADE,
  kind_id UUID NOT NULL REFERENCES ref_code_contact_kind(id) ON DELETE RESTRICT,
  value TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  role_id UUID REFERENCES ref_contact_role(id),
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
RETURNS TRIGGER AS $$
DECLARE v_is_email BOOLEAN;
BEGIN
  SELECT lower(code) = 'email' INTO v_is_email FROM ref_code_contact_kind WHERE id = NEW.kind_id;
  IF v_is_email AND NEW.value IS NOT NULL AND NEW.value !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format for contact kind=email: %', NEW.value;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_contact_channel_email ON contact_channel;
CREATE TRIGGER trg_contact_channel_email BEFORE INSERT OR UPDATE ON contact_channel FOR EACH ROW EXECUTE FUNCTION api.enforce_contact_email_shape();

CREATE OR REPLACE FUNCTION api.enforce_actor_channel_email_shape()
RETURNS TRIGGER AS $$
DECLARE v_is_email BOOLEAN;
BEGIN
  SELECT lower(code) = 'email' INTO v_is_email FROM ref_code_contact_kind WHERE id = NEW.kind_id;
  IF v_is_email AND NEW.value IS NOT NULL AND NEW.value !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format for actor channel kind=email: %', NEW.value;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_actor_channel_email ON actor_channel;
CREATE TRIGGER trg_actor_channel_email BEFORE INSERT OR UPDATE ON actor_channel FOR EACH ROW EXECUTE FUNCTION api.enforce_actor_channel_email_shape();

-- Unicité email cross-actors
CREATE OR REPLACE FUNCTION api.prevent_duplicate_actor_email()
RETURNS TRIGGER AS $$
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
  owner UUID REFERENCES auth.users(id),
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
RETURNS TRIGGER AS $$
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
  owner UUID REFERENCES auth.users(id),
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
RETURNS TRIGGER AS $$
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
RETURNS TRIGGER AS $$
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS meeting_room_equipment (
  room_id UUID NOT NULL REFERENCES object_meeting_room(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES ref_code_meeting_equipment(id) ON DELETE RESTRICT,
  position INTEGER DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, equipment_id)
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
  CONSTRAINT chk_opening_period_dates CHECK (date_end IS NULL OR date_start IS NULL OR date_end >= date_start)
);
CREATE TABLE IF NOT EXISTS opening_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_id UUID NOT NULL REFERENCES opening_period(id) ON DELETE CASCADE,
  schedule_type_id UUID NOT NULL REFERENCES ref_code_opening_schedule_type(id) ON DELETE RESTRICT,
  name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
RETURNS TEXT AS $$
BEGIN
  RETURN 'audit_log_' || to_char(partition_date, 'YYYY_MM');
END; $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION audit.create_monthly_partition(partition_date TIMESTAMPTZ)
RETURNS TEXT AS $$
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

CREATE OR REPLACE FUNCTION audit.ensure_future_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS TEXT AS $$
DECLARE i INTEGER; result_text TEXT := ''; partition_date TIMESTAMPTZ;
BEGIN
  FOR i IN 0..months_ahead-1 LOOP
    partition_date := date_trunc('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
    result_text := result_text || audit.create_monthly_partition(partition_date) || E'\n';
  END LOOP;
  RETURN result_text;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit.drop_old_partitions(months_to_keep INTEGER DEFAULT 12)
RETURNS TEXT AS $$
DECLARE partition_name TEXT; cutoff_date TIMESTAMPTZ; result_text TEXT := ''; r RECORD;
BEGIN
  cutoff_date := date_trunc('month', CURRENT_DATE) - (months_to_keep || ' months')::INTERVAL;
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname='audit' AND tablename LIKE 'audit_log_%'
  LOOP
    IF r.tablename ~ '^audit_log_[0-9]{4}_[0-9]{2}$' THEN
      partition_name := r.tablename;
      IF to_timestamp(split_part(split_part(partition_name, '_', 3), '_', 1) || '-' || split_part(split_part(partition_name, '_', 3), '_', 2) || '-01','YYYY-MM-DD') < cutoff_date THEN
        EXECUTE 'DROP TABLE IF EXISTS audit.' || quote_ident(partition_name);
        result_text := result_text || 'Dropped old partition: ' || partition_name || E'\n';
      END IF;
    END IF;
  END LOOP;
  IF result_text = '' THEN result_text := 'No old partitions to drop'; END IF;
  RETURN result_text;
END; $$ LANGUAGE plpgsql;

SELECT audit.ensure_future_partitions(3);

CREATE OR REPLACE FUNCTION audit.maintain_partitions()
RETURNS TEXT AS $$
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
RETURNS TRIGGER AS $$
DECLARE v_pk JSONB := NULL; v_changed_by TEXT := NULL;
BEGIN
  v_changed_by := COALESCE(NULLIF(current_setting('request.jwt.claim.email', true), ''), NULLIF(current_setting('request.jwt.claim.sub', true), ''), current_user);
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT NULL AND to_jsonb(NEW) ? 'id' THEN v_pk := jsonb_build_object('id', to_jsonb(NEW)->'id');
    ELSIF OLD IS NOT NULL AND to_jsonb(OLD) ? 'id' THEN v_pk := jsonb_build_object('id', to_jsonb(OLD)->'id'); END IF;
    INSERT INTO audit.audit_log(table_name, operation, row_pk, before_data, after_data, changed_by) VALUES (TG_TABLE_NAME, TG_OP, v_pk, to_jsonb(OLD), to_jsonb(NEW), v_changed_by);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD IS NOT NULL AND to_jsonb(OLD) ? 'id' THEN v_pk := jsonb_build_object('id', to_jsonb(OLD)->'id'); END IF;
    INSERT INTO audit.audit_log(table_name, operation, row_pk, before_data, after_data, changed_by) VALUES (TG_TABLE_NAME, TG_OP, v_pk, to_jsonb(OLD), NULL, v_changed_by);
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attacher triggers d'audit
DO $$
DECLARE r RECORD; trig_name TEXT;
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
END; $$;

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
RETURNS TEXT AS $$
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

CREATE TRIGGER trg_audit_object_version AFTER UPDATE OR DELETE ON object_version FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes();

CREATE OR REPLACE FUNCTION save_object_version()
RETURNS TRIGGER AS $$
DECLARE v_version_number INTEGER; v_change_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN v_change_type := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN v_change_type := 'update';
  ELSIF TG_OP = 'DELETE' THEN v_change_type := 'delete'; END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number FROM object_version WHERE object_id = COALESCE(NEW.id, OLD.id);

  INSERT INTO object_version (object_id, version_number, data, created_by, change_type)
  VALUES (COALESCE(NEW.id, OLD.id), v_version_number, to_jsonb(COALESCE(NEW, OLD)), COALESCE(NEW.created_by, OLD.created_by), v_change_type);

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
CREATE INDEX IF NOT EXISTS idx_object_updated_at_source ON object(updated_at_source);
-- Address indexes removed; see object_location indexes below
CREATE INDEX IF NOT EXISTS idx_location_object_id ON location(object_id);
CREATE INDEX IF NOT EXISTS idx_location_geog2 ON location USING GIST (geog2);
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
CREATE INDEX IF NOT EXISTS idx_media_place_id ON media(place_id);
CREATE INDEX IF NOT EXISTS idx_media_media_type_id ON media(media_type_id);
CREATE INDEX IF NOT EXISTS idx_media_is_published ON media(is_published);
CREATE INDEX IF NOT EXISTS idx_media_rights_expires_at ON media(rights_expires_at);
CREATE INDEX IF NOT EXISTS idx_media_analyse_data ON media USING GIN (analyse_data);
CREATE INDEX IF NOT EXISTS idx_media_is_main ON media(is_main);
CREATE INDEX IF NOT EXISTS idx_media_visibility ON media(visibility);
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_one_main_per_type ON media(object_id, media_type_id) WHERE is_main;
CREATE INDEX IF NOT EXISTS idx_media_title_normalized_trgm ON media USING GIN (title_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_media_description_normalized_trgm ON media USING GIN (description_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_description_object_id ON object_description(object_id);
CREATE INDEX IF NOT EXISTS idx_object_description_normalized_trgm ON object_description USING GIN (description_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_description_chapo_normalized_trgm ON object_description USING GIN (description_chapo_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_object_private_description_object ON object_private_description(object_id);
CREATE INDEX IF NOT EXISTS idx_object_external_id_object_id ON object_external_id(object_id);
CREATE INDEX IF NOT EXISTS idx_object_external_id_organization_object_id ON object_external_id(organization_object_id);
CREATE INDEX IF NOT EXISTS idx_object_origin_object_id ON object_origin(object_id);
CREATE INDEX IF NOT EXISTS idx_legal_object_id ON legal(object_id);
CREATE INDEX IF NOT EXISTS idx_legal_document_id ON legal(document_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_legal_object_id ON accommodation_legal(object_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_legal_document_id ON accommodation_legal(document_id);
-- Simple opening table indexes removed
CREATE INDEX IF NOT EXISTS idx_object_language_object_id ON object_language(object_id);
CREATE INDEX IF NOT EXISTS idx_object_language_language_id ON object_language(language_id);
CREATE INDEX IF NOT EXISTS idx_object_amenity_object_id ON object_amenity(object_id);
CREATE INDEX IF NOT EXISTS idx_object_amenity_amenity_id ON object_amenity(amenity_id);
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
CREATE INDEX IF NOT EXISTS idx_object_iti_practice_object_id ON object_iti_practice(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_practice_practice_id ON object_iti_practice(practice_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_object_id ON object_iti_stage(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_geom_gist ON object_iti_stage USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_media_stage_id ON object_iti_stage_media(stage_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_media_media_id ON object_iti_stage_media(media_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_section_parent_object_id ON object_iti_section(parent_object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_associated_object_object_id ON object_iti_associated_object(object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_associated_object_associated_object_id ON object_iti_associated_object(associated_object_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_profile_object ON object_iti_profile(object_id);
CREATE INDEX IF NOT EXISTS idx_i18n_translation_target ON i18n_translation(target_table, target_pk);
CREATE INDEX IF NOT EXISTS idx_i18n_translation_column_language ON i18n_translation(target_table, target_column, language_id);

-- =====================================================
-- Triggers updated_at sur les tables clés
-- =====================================================
CREATE TRIGGER update_ref_language_updated_at BEFORE UPDATE ON ref_language FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_code_updated_at BEFORE UPDATE ON ref_code FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_amenity_updated_at BEFORE UPDATE ON ref_amenity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_sustainability_action_category_updated_at BEFORE UPDATE ON ref_sustainability_action_category FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_sustainability_action_updated_at BEFORE UPDATE ON ref_sustainability_action FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_document_updated_at BEFORE UPDATE ON ref_document FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_tag_updated_at BEFORE UPDATE ON ref_tag FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_classification_scheme_updated_at BEFORE UPDATE ON ref_classification_scheme FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_classification_value_updated_at BEFORE UPDATE ON ref_classification_value FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_org_role_updated_at BEFORE UPDATE ON ref_org_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_contact_role_updated_at BEFORE UPDATE ON ref_contact_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_capacity_metric_updated_at BEFORE UPDATE ON ref_capacity_metric FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_iti_assoc_role_updated_at BEFORE UPDATE ON ref_iti_assoc_role FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ref_object_relation_type_updated_at BEFORE UPDATE ON ref_object_relation_type FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_object_updated_at BEFORE UPDATE ON object FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Address trigger removed with table drop
CREATE TRIGGER update_location_updated_at BEFORE UPDATE ON location FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_place_updated_at BEFORE UPDATE ON object_place FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_channel_updated_at BEFORE UPDATE ON contact_channel FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_place_description_updated_at BEFORE UPDATE ON object_place_description FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_private_description_updated_at BEFORE UPDATE ON object_private_description FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_classification_updated_at BEFORE UPDATE ON object_classification FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_legal_updated_at BEFORE UPDATE ON legal FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_accommodation_legal_updated_at BEFORE UPDATE ON accommodation_legal FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Simple opening table triggers removed
CREATE TRIGGER update_object_fma_updated_at BEFORE UPDATE ON object_fma FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_fma_occurrence_updated_at BEFORE UPDATE ON object_fma_occurrence FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_updated_at BEFORE UPDATE ON object_iti FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_practice_updated_at BEFORE UPDATE ON object_iti_practice FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_stage_updated_at BEFORE UPDATE ON object_iti_stage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_stage_media_updated_at BEFORE UPDATE ON object_iti_stage_media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_section_updated_at BEFORE UPDATE ON object_iti_section FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_associated_object_updated_at BEFORE UPDATE ON object_iti_associated_object FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_iti_info_updated_at BEFORE UPDATE ON object_iti_info FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_zone_updated_at BEFORE UPDATE ON object_zone FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_external_id_updated_at BEFORE UPDATE ON object_external_id FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_origin_updated_at BEFORE UPDATE ON object_origin FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_sustainability_action_updated_at BEFORE UPDATE ON object_sustainability_action FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_capacity_updated_at BEFORE UPDATE ON object_capacity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_i18n_translation_updated_at BEFORE UPDATE ON i18n_translation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_interaction_updated_at BEFORE UPDATE ON crm_interaction FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_crm_task_updated_at BEFORE UPDATE ON crm_task FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_price_updated_at BEFORE UPDATE ON object_price FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_price_period_updated_at BEFORE UPDATE ON object_price_period FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_discount_updated_at BEFORE UPDATE ON object_discount FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_group_policy_updated_at BEFORE UPDATE ON object_group_policy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_pet_policy_updated_at BEFORE UPDATE ON object_pet_policy FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_meeting_room_updated_at BEFORE UPDATE ON object_meeting_room FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_object_relation_updated_at BEFORE UPDATE ON object_relation FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_opening_period_updated_at BEFORE UPDATE ON opening_period FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_opening_schedule_updated_at BEFORE UPDATE ON opening_schedule FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_opening_time_period_updated_at BEFORE UPDATE ON opening_time_period FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_opening_time_period_weekday_updated_at BEFORE UPDATE ON opening_time_period_weekday FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_opening_time_frame_updated_at BEFORE UPDATE ON opening_time_frame FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Fin du schéma monolithique
-- =====================================================


-- =====================================================
-- Menus (for RES / FMA etc.)
-- =====================================================




-- =====================================================
-- MENUS (for RES/PCU/FMA etc.)
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
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_object_menu_item_menu_id ON object_menu_item(menu_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_position ON object_menu_item(position);

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

-- Indexes for menu item tags
CREATE INDEX IF NOT EXISTS idx_menu_item_dietary_tag_item ON object_menu_item_dietary_tag(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_dietary_tag_tag ON object_menu_item_dietary_tag(dietary_tag_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_allergen_item ON object_menu_item_allergen(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_allergen_allergen ON object_menu_item_allergen(allergen_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_cuisine_type_item ON object_menu_item_cuisine_type(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_cuisine_type_type ON object_menu_item_cuisine_type(cuisine_type_id);

-- =====================================================
-- UNIFIED LEGAL SYSTEM
-- =====================================================

-- =====================================================
-- 1. Create legal validity mode enum
-- =====================================================
CREATE TYPE legal_validity_mode AS ENUM (
  'forever',           -- Open ended, valid_to must be null
  'tacit_renewal',     -- Considered valid unless revoked, valid_to can be null
  'fixed_end_date'     -- Requires a non-null valid_to
);

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
CREATE TRIGGER update_object_legal_updated_at 
  BEFORE UPDATE ON object_legal 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. Create views for easy querying
-- =====================================================

-- View for active legal records
CREATE OR REPLACE VIEW v_active_legal_records AS
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
CREATE OR REPLACE VIEW v_expiring_legal_records AS
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

