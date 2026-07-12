-- =====================================================================
-- migration_trail_referential.sql — Référentiel des sentiers de randonnée
-- ---------------------------------------------------------------------
-- Design : docs/superpowers/specs/2026-07-12-referentiel-sentiers-randonnee-design.md
-- Plan   : docs/superpowers/plans/2026-07-12-referentiel-sentiers-migration-phase3.md
-- Décisions verrouillées PO (§24, 2026-07-12) : référentiel autonome `trail_*` hors
-- modèle objet ; vocabulaire de statut = domaine Bertel existant `iti_open_status`
-- étendu (PAS de domaine `trail_status` parallèle) ; « hors gestion » -> `not_managed`
-- -> consolidé `unknown + not_guaranteed` (JAMAIS ouvert) ; back-office v1 superuser
-- seul ; aucune suppression automatique, jamais.
-- Idempotent / re-runnable. Rollback : voir le bloc commenté en pied de fichier.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Vocabulaire — extension iti_open_status + nouvelle partition trail_link_role
-- ---------------------------------------------------------------------

INSERT INTO ref_code (domain, code, name, description, position)
SELECT v.domain, v.code, v.name, v.description, v.position
FROM (VALUES
  ('iti_open_status','not_managed','Hors gestion',
   'Hors gestion de la source (état non garanti — jamais traduit en ouvert)', 5),
  ('iti_open_status','unknown','Inconnu',
   'État inconnu, non renseigné ou valeur source non reconnue', 6),
  ('iti_open_status','archived','Archivé',
   'Sentier archivé (décision humaine) — miroir de trail.archived_at', 7)
) AS v(domain, code, name, description, position)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code r WHERE r.domain = v.domain AND r.code = v.code
);

CREATE TABLE IF NOT EXISTS ref_code_trail_link_role
  PARTITION OF ref_code FOR VALUES IN ('trail_link_role');

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_trail_link_role_id
  ON ref_code_trail_link_role (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_trail_link_role_code
  ON ref_code_trail_link_role (code);

ALTER TABLE ref_code_trail_link_role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_trail_link_role;
CREATE POLICY "pub_ref_code_read" ON ref_code_trail_link_role FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_trail_link_role;
CREATE POLICY "admin_ref_code_write" ON ref_code_trail_link_role FOR ALL
  USING ((SELECT auth.role()) IN ('service_role','admin'));

INSERT INTO ref_code (domain, code, name, description, position)
SELECT v.domain, v.code, v.name, v.description, v.position
FROM (VALUES
  ('trail_link_role','itinerary_uses','Utilisé par un itinéraire','Le sentier compose un itinéraire ITI éditorial',1),
  ('trail_link_role','segment_of','Tronçon de','Le sentier est un tronçon d''un itinéraire ITI plus large',2),
  ('trail_link_role','starts_at','Point de départ','L''objet est le point de départ du sentier',3),
  ('trail_link_role','parking','Parking','L''objet est un stationnement associé au sentier',4),
  ('trail_link_role','poi_nearby','Point d''intérêt à proximité','L''objet est un point d''intérêt proche du sentier',5),
  ('trail_link_role','crosses','Traverse','Le sentier traverse ou dessert l''objet (ex. aire d''accueil)',6)
) AS v(domain, code, name, description, position)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code r WHERE r.domain = v.domain AND r.code = v.code
);

-- ---------------------------------------------------------------------
-- 2. Sources techniques + gestionnaires (racines du référentiel)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_trail_source (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('arcgis_featureserver','manual','file','api')),
  endpoint_url   TEXT,
  layer_ref      TEXT,
  default_trust  SMALLINT NOT NULL DEFAULT 50 CHECK (default_trust BETWEEN 1 AND 100),
  licence_note   TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ref_trail_source IS
'Source technique de données pour le référentiel de sentiers (§4.2 design 2026-07-12). '
'default_trust départage les statuts contradictoires à fiabilité déclarée (internal.recompute_trail_status).';

CREATE TABLE IF NOT EXISTS ref_trail_manager (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('public_agency','local_authority','association','oti','platform','other')),
  org_object_id  TEXT REFERENCES object(id) ON DELETE SET NULL,
  website        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ref_trail_manager IS
'Organisme gestionnaire d''un sentier (§4.2 design). org_object_id est un pont OPTIONNEL vers '
'une ORG Bertel (NULL pour un gestionnaire externe comme l''ONF qui n''est pas une ORG Bertel).';

DROP TRIGGER IF EXISTS update_ref_trail_source_updated_at ON ref_trail_source;
CREATE TRIGGER update_ref_trail_source_updated_at BEFORE UPDATE ON ref_trail_source
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ref_trail_manager_updated_at ON ref_trail_manager;
CREATE TRIGGER update_ref_trail_manager_updated_at BEFORE UPDATE ON ref_trail_manager
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE ref_trail_source  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_trail_manager ENABLE ROW LEVEL SECURITY;

INSERT INTO ref_trail_source (code, label, kind, endpoint_url, layer_ref, default_trust, licence_note, is_active)
VALUES (
  'onf_arcgis_reunion',
  'ONF — Sentiers de randonnée pédestre (La Réunion)',
  'arcgis_featureserver',
  'https://services1.arcgis.com/Y4HgaQpzkE7kenlE/arcgis/rest/services/Sentiers_La_Reunion_public/FeatureServer',
  '5',
  80,
  'Donnée publique factuelle réutilisée ; ONF cité uniquement comme source du STATUT (arbitré §24-3). '
  'Contenus publiés (descriptions, photos) = contenus propres Bertel ajoutés avant publication.',
  TRUE
) ON CONFLICT (code) DO NOTHING;

INSERT INTO ref_trail_manager (code, label, kind, website) VALUES
  ('onf',          'Office National des Forêts', 'public_agency',    'https://www.onf.fr'),
  ('parc_national', 'Parc national de La Réunion', 'public_agency',   'https://www.reunion-parcnational.fr'),
  ('departement',  'Département de La Réunion',   'local_authority',  NULL),
  ('commune',      'Commune',                     'local_authority',  NULL),
  ('oti',          'Office de Tourisme Intercommunal', 'oti',         NULL),
  ('association',  'Association',                 'association',      NULL),
  ('bertel',       'Bertel (plateforme)',         'platform',         NULL),
  ('autre',        'Autre / non catégorisé',      'other',            NULL)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. trail (sentier métier Bertel) + trail_manager_link
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trail (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  name_alt             TEXT[] NOT NULL DEFAULT '{}',
  origin               TEXT NOT NULL CHECK (origin IN ('imported','manual')),
  visibility           TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','internal','public')),
  editorial_geom       GEOGRAPHY(MULTILINESTRING, 4326),
  editorial_length_m   NUMERIC,
  description_md       TEXT,
  public_status        UUID REFERENCES ref_code_iti_open_status(id),
  public_status_flags  JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at          TIMESTAMPTZ,
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE trail IS
'Sentier métier Bertel (§4.2 design 2026-07-12). Sentier physique / tronçon publié, PAS un itinéraire '
'éditorial (= objet ITI, pont futur via trail_object_link, §12). public_status/public_status_flags sont '
'un CACHE recalculé par internal.recompute_trail_status (§9) — jamais écrit directement hors de cette fonction.';

CREATE INDEX IF NOT EXISTS idx_trail_editorial_geom ON trail USING GIST (editorial_geom);
CREATE INDEX IF NOT EXISTS idx_trail_public_status   ON trail (public_status);
CREATE INDEX IF NOT EXISTS idx_trail_visibility       ON trail (visibility);

DROP TRIGGER IF EXISTS update_trail_updated_at ON trail;
CREATE TRIGGER update_trail_updated_at BEFORE UPDATE ON trail
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE trail ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trail_manager_link (
  trail_id    UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  manager_id  UUID NOT NULL REFERENCES ref_trail_manager(id) ON DELETE RESTRICT,
  role        TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','secondary','historical')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trail_id, manager_id)
);
COMMENT ON TABLE trail_manager_link IS
'Lien n-n sentier <-> gestionnaire (§4.2). role=''primary'' est la source d''autorité utilisée par '
'internal.recompute_trail_status pour distinguer un statut ''open'' garanti (source gestionnaire) '
'd''un statut ''open'' non garanti (source non gestionnaire, §9 règle 5).';

CREATE INDEX IF NOT EXISTS idx_trail_manager_link_manager ON trail_manager_link (manager_id);

DROP TRIGGER IF EXISTS update_trail_manager_link_updated_at ON trail_manager_link;
CREATE TRIGGER update_trail_manager_link_updated_at BEFORE UPDATE ON trail_manager_link
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE trail_manager_link ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. trail_sync_run (journal d'exécution + lease anti-concurrence, §8.2)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trail_sync_run (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id              UUID NOT NULL REFERENCES ref_trail_source(id) ON DELETE RESTRICT,
  trigger                TEXT NOT NULL CHECK (trigger IN ('cron','manual','initial')),
  dry_run                BOOLEAN NOT NULL DEFAULT FALSE,
  status                 TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','no_op')),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at            TIMESTAMPTZ,
  requested_by           UUID REFERENCES auth.users(id),
  edge_execution_id      TEXT,
  error                  TEXT,
  http_status            INTEGER,
  layer_last_edit_date   TIMESTAMPTZ,
  counts                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  report                 JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE trail_sync_run IS
'Journal d''exécution de la synchronisation (§8 design). Le lease anti-concurrence est '
'uq_trail_sync_run_running_per_source : au plus UN run status=''running'' par source à tout instant. '
'Un run bloqué (heartbeat_at périmé) est récupérable par api.trail_sync_begin (Task 10).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_trail_sync_run_running_per_source
  ON trail_sync_run (source_id) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_trail_sync_run_source_started ON trail_sync_run (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trail_sync_run_status ON trail_sync_run (status);

ALTER TABLE trail_sync_run ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. trail_source_record (état courant par source) + trail_geometry_version
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trail_source_record (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trail_id              UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  source_id             UUID NOT NULL REFERENCES ref_trail_source(id) ON DELETE RESTRICT,
  external_id           TEXT NOT NULL,
  name_raw              TEXT,
  raw_attributes        JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_geom              GEOGRAPHY(MULTILINESTRING, 4326),
  geom_hash             TEXT,
  attrs_hash            TEXT,
  length_m_source       NUMERIC,
  length_m_computed     NUMERIC,
  status_raw            TEXT,
  status_normalized     UUID REFERENCES ref_code_iti_open_status(id),
  status_reason_raw     TEXT,
  reopening_raw         TEXT,
  reopening_date        DATE,
  reopening_precision   TEXT CHECK (reopening_precision IN ('day','month','year','text_only','none_planned')),
  status_published_by   UUID REFERENCES ref_trail_manager(id) ON DELETE SET NULL,
  trust                 SMALLINT NOT NULL DEFAULT 50 CHECK (trust BETWEEN 1 AND 100),
  presence              TEXT NOT NULL DEFAULT 'present' CHECK (presence IN ('present','missing','source_error','retired')),
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  missing_since         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, external_id)
);
COMMENT ON TABLE trail_source_record IS
'État COURANT d''un sentier tel que vu par une source (§4.2/§6 design). Clé externe = '
'(source_id, external_id=''objectid:<OBJECTID>''). raw_attributes/raw_geom = brut JAMAIS retouché. '
'presence=''missing'' + missing_since : JAMAIS de DELETE (§8.3 — aucune suppression automatique).';

CREATE INDEX IF NOT EXISTS idx_trail_source_record_trail     ON trail_source_record (trail_id);
CREATE INDEX IF NOT EXISTS idx_trail_source_record_presence  ON trail_source_record (presence);
CREATE INDEX IF NOT EXISTS idx_trail_source_record_status    ON trail_source_record (status_normalized);
CREATE INDEX IF NOT EXISTS idx_trail_source_record_raw_geom  ON trail_source_record USING GIST (raw_geom);

DROP TRIGGER IF EXISTS update_trail_source_record_updated_at ON trail_source_record;
CREATE TRIGGER update_trail_source_record_updated_at BEFORE UPDATE ON trail_source_record
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE trail_source_record ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trail_geometry_version (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id    UUID NOT NULL REFERENCES trail_source_record(id) ON DELETE CASCADE,
  version_no          INTEGER NOT NULL,
  geom                GEOGRAPHY(MULTILINESTRING, 4326) NOT NULL,
  geom_hash           TEXT NOT NULL,
  length_m_computed   NUMERIC,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_run_id         UUID REFERENCES trail_sync_run(id) ON DELETE SET NULL,
  UNIQUE (source_record_id, version_no)
);
COMMENT ON TABLE trail_geometry_version IS
'Versions successives du tracé BRUT d''un record source (§10 design). INSERT uniquement quand '
'geom_hash change (hash sur coordonnées arrondies 7 décimales).';

CREATE INDEX IF NOT EXISTS idx_trail_geometry_version_record ON trail_geometry_version (source_record_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_trail_geometry_version_geom   ON trail_geometry_version USING GIST (geom);

ALTER TABLE trail_geometry_version ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 6. trail_status_history (insert-only) + trail_status_override (append-only)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trail_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trail_id           UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  source_record_id   UUID REFERENCES trail_source_record(id) ON DELETE SET NULL,
  sync_run_id        UUID REFERENCES trail_sync_run(id) ON DELETE SET NULL,
  event_type         TEXT NOT NULL CHECK (event_type IN (
                        'status_change','reason_change','reopening_change','geometry_change',
                        'attrs_change','appeared','disappeared','reappeared','manual_override',
                        'override_expired','visibility_change','consolidation_change')),
  old                JSONB,
  new                JSONB,
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  author             UUID REFERENCES auth.users(id)
);
COMMENT ON TABLE trail_status_history IS
'Historique INSERT-ONLY (§11 design). Émis uniquement si un hash/valeur change réellement.';

CREATE INDEX IF NOT EXISTS idx_trail_status_history_trail    ON trail_status_history (trail_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_trail_status_history_sync_run ON trail_status_history (sync_run_id);
CREATE INDEX IF NOT EXISTS idx_trail_status_history_event    ON trail_status_history (event_type);

ALTER TABLE trail_status_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trail_status_override (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trail_id       UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  forced_status  UUID NOT NULL REFERENCES ref_code_iti_open_status(id),
  reason         TEXT NOT NULL,
  author         UUID NOT NULL REFERENCES auth.users(id),
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_by     UUID REFERENCES auth.users(id),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (revoked_at IS NULL OR revoked_by IS NOT NULL)
);
COMMENT ON TABLE trail_status_override IS
'Forçage manuel du statut consolidé (§9 design). APPEND-ONLY : révocation = revoked_at/revoked_by.';

CREATE INDEX IF NOT EXISTS idx_trail_status_override_trail_active
  ON trail_status_override (trail_id, starts_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE trail_status_override ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7. trail_object_link (pont vers le modèle objet) + trail_commune
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trail_object_link (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trail_id    UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  object_id   TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES ref_code_trail_link_role(id) ON DELETE RESTRICT,
  position    INTEGER,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trail_id, object_id, role_id)
);
COMMENT ON TABLE trail_object_link IS
'Pont FUTUR entre le référentiel et le modèle objet (§12 design) — VIDE en v1. Aucune RPC d''écriture '
'fournie par cette migration (le chantier « pont ITI » est séparé, §21 phase 12+13).';

CREATE INDEX IF NOT EXISTS idx_trail_object_link_object ON trail_object_link (object_id);
CREATE INDEX IF NOT EXISTS idx_trail_object_link_trail  ON trail_object_link (trail_id);

ALTER TABLE trail_object_link ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trail_commune (
  trail_id    UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  insee_code  VARCHAR(5) NOT NULL REFERENCES ref_commune(insee_code) ON DELETE RESTRICT,
  method      TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','spatial')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trail_id, insee_code)
);
COMMENT ON TABLE trail_commune IS
'Rattachement communes (§10 design). method=''manual'' en v1 (arbitré §24-5).';

CREATE INDEX IF NOT EXISTS idx_trail_commune_insee ON trail_commune (insee_code);

ALTER TABLE trail_commune ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 8. internal.recompute_trail_status (consolidation, §9 design) + triggers
-- ---------------------------------------------------------------------
-- Priorité (§9) : 1) override manuel actif  2) archived (masque tout)  3) closed
-- 4) partially_closed  5) warning  6) open (source gestionnaire)  7) open + not_guaranteed
-- (source non gestionnaire)  8) unknown + not_guaranteed (sinon).
-- "Gestionnaire" = trail_manager_link(trail_id, manager_id=status_published_by) existe.

CREATE OR REPLACE FUNCTION internal.recompute_trail_status(p_trail_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, api, internal
AS $fn$
DECLARE
  v_old_status          uuid;
  v_old_flags           jsonb;
  v_archived            timestamptz;
  v_override            trail_status_override%ROWTYPE;
  v_new_status           uuid;
  v_new_flags            jsonb := '{}'::jsonb;
  v_has_closed           boolean;
  v_has_partial          boolean;
  v_has_warning          boolean;
  v_has_open_managed     boolean;
  v_has_open_unmanaged   boolean;
  v_has_any_present      boolean;
  v_has_any_record       boolean;
  v_conflicting          boolean;
  v_status_code          text;
BEGIN
  SELECT public_status, public_status_flags, archived_at
    INTO v_old_status, v_old_flags, v_archived
  FROM trail WHERE id = p_trail_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_override FROM trail_status_override
  WHERE trail_id = p_trail_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
  ORDER BY starts_at DESC LIMIT 1;

  IF FOUND THEN
    v_new_status := v_override.forced_status;
    v_new_flags := jsonb_build_object('manual', true, 'reason', v_override.reason,
      'author', v_override.author, 'expires_at', v_override.expires_at, 'computed_at', now());
  ELSIF v_archived IS NOT NULL THEN
    SELECT id INTO v_new_status FROM ref_code_iti_open_status WHERE code = 'archived';
    v_new_flags := jsonb_build_object('archived_at', v_archived, 'computed_at', now());
  ELSE
    SELECT
      COALESCE(bool_or(rc.code = 'closed'), false),
      COALESCE(bool_or(rc.code = 'partially_closed'), false),
      COALESCE(bool_or(rc.code = 'warning'), false),
      COALESCE(bool_or(rc.code = 'open' AND tml.manager_id IS NOT NULL), false),
      COALESCE(bool_or(rc.code = 'open' AND tml.manager_id IS NULL), false),
      COALESCE(bool_or(true), false)
    INTO v_has_closed, v_has_partial, v_has_warning, v_has_open_managed, v_has_open_unmanaged, v_has_any_present
    FROM trail_source_record tsr
    JOIN ref_code_iti_open_status rc ON rc.id = tsr.status_normalized
    LEFT JOIN trail_manager_link tml ON tml.trail_id = p_trail_id AND tml.manager_id = tsr.status_published_by
    WHERE tsr.trail_id = p_trail_id
      AND (tsr.presence = 'present' OR (tsr.presence = 'missing' AND tsr.missing_since > now() - interval '7 days'));

    SELECT EXISTS (SELECT 1 FROM trail_source_record WHERE trail_id = p_trail_id) INTO v_has_any_record;

    IF v_has_closed THEN v_status_code := 'closed';
    ELSIF v_has_partial THEN v_status_code := 'partially_closed';
    ELSIF v_has_warning THEN v_status_code := 'warning';
    ELSIF v_has_open_managed THEN v_status_code := 'open';
    ELSIF v_has_open_unmanaged THEN
      v_status_code := 'open';
      v_new_flags := jsonb_build_object('not_guaranteed', true);
    ELSE
      v_status_code := 'unknown';
      v_new_flags := jsonb_build_object('not_guaranteed', true);
      IF v_has_any_record AND NOT v_has_any_present THEN
        -- ponytail: 'stale' est un booléen simple (pas d'audit détaillé des records concernés) —
        -- suffisant pour le badge back-office §14 ; enrichir seulement si un besoin réel apparaît.
        v_new_flags := v_new_flags || jsonb_build_object('stale', true);
      END IF;
    END IF;

    SELECT id INTO v_new_status FROM ref_code_iti_open_status WHERE code = v_status_code;

    SELECT COALESCE(count(DISTINCT tsr.status_published_by) > 1, false) INTO v_conflicting
    FROM trail_source_record tsr
    JOIN ref_code_iti_open_status rc ON rc.id = tsr.status_normalized
    WHERE tsr.trail_id = p_trail_id
      AND (tsr.presence = 'present' OR (tsr.presence = 'missing' AND tsr.missing_since > now() - interval '7 days'))
      AND rc.code = v_status_code;
    IF v_conflicting THEN
      v_new_flags := v_new_flags || jsonb_build_object('conflicting_sources', true);
    END IF;
    v_new_flags := v_new_flags || jsonb_build_object('computed_at', now());
  END IF;

  UPDATE trail SET public_status = v_new_status, public_status_flags = v_new_flags WHERE id = p_trail_id;

  IF v_old_status IS DISTINCT FROM v_new_status THEN
    INSERT INTO trail_status_history (trail_id, event_type, old, new)
    VALUES (p_trail_id, 'consolidation_change',
      jsonb_build_object('status_id', v_old_status, 'flags', v_old_flags),
      jsonb_build_object('status_id', v_new_status, 'flags', v_new_flags));
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION internal.recompute_trail_status(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION internal.trail_recompute_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, api, internal
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM internal.recompute_trail_status(OLD.trail_id);
    RETURN OLD;
  ELSE
    PERFORM internal.recompute_trail_status(NEW.trail_id);
    RETURN NEW;
  END IF;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_recompute_status_on_source_record ON trail_source_record;
CREATE TRIGGER trg_recompute_status_on_source_record
  AFTER INSERT OR UPDATE OR DELETE ON trail_source_record
  FOR EACH ROW EXECUTE FUNCTION internal.trail_recompute_status_trigger();

DROP TRIGGER IF EXISTS trg_recompute_status_on_override ON trail_status_override;
CREATE TRIGGER trg_recompute_status_on_override
  AFTER INSERT OR UPDATE OR DELETE ON trail_status_override
  FOR EACH ROW EXECUTE FUNCTION internal.trail_recompute_status_trigger();

DROP TRIGGER IF EXISTS trg_recompute_status_on_manager_link ON trail_manager_link;
CREATE TRIGGER trg_recompute_status_on_manager_link
  AFTER INSERT OR UPDATE OR DELETE ON trail_manager_link
  FOR EACH ROW EXECUTE FUNCTION internal.trail_recompute_status_trigger();

CREATE OR REPLACE FUNCTION internal.trail_recompute_status_self_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, api, internal
AS $fn$
BEGIN
  PERFORM internal.recompute_trail_status(NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_recompute_status_on_archive ON trail;
CREATE TRIGGER trg_recompute_status_on_archive
  AFTER UPDATE OF archived_at ON trail
  FOR EACH ROW EXECUTE FUNCTION internal.trail_recompute_status_self_trigger();

-- ---------------------------------------------------------------------
-- 9. internal.trail_sync_apply (diff set-based idempotent, §8.1) +
--    internal.trail_expire_overrides (§8.3/§9 — expirations + délai de grâce)
-- ---------------------------------------------------------------------
-- ponytail: implémenté en boucle PL/pgSQL sur jsonb_array_elements plutôt qu'en SQL pur
-- multi-CTE — le volume (374 features, tolérant ×10 par design §25) ne justifie pas la
-- complexité d'un set-based pur multi-jointures. Reste dans UNE transaction (atomique) et
-- idempotent (tout write est gated par un hash/valeur qui doit RÉELLEMENT changer).

CREATE OR REPLACE FUNCTION internal.trail_sync_apply(
  p_sync_run_id uuid,
  p_features    jsonb,
  p_options     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, api, internal, extensions
AS $fn$
DECLARE
  v_run                  trail_sync_run%ROWTYPE;
  v_dry_run               boolean;
  v_min_ratio             numeric := COALESCE((p_options->>'min_expected_ratio')::numeric, 0.5);
  v_prev_fetched          integer;
  v_fetched               integer := jsonb_array_length(COALESCE(p_features,'[]'::jsonb));
  v_feature               jsonb;
  v_external_id           text;
  v_name_raw              text;
  v_name_normalized       text;
  v_raw_attrs             jsonb;
  v_geom_geojson          jsonb;
  v_geom                  geography;
  v_geom_hash             text;
  v_length_source         numeric;
  v_length_computed       numeric;
  v_status_raw            text;
  v_status_code           text;
  v_status_id             uuid;
  v_unknown_id            uuid;
  v_reason_raw            text;
  v_reopening_raw         text;
  v_reopening_date        date;
  v_reopening_precision   text;
  v_manager_onf           uuid;
  v_existing              trail_source_record%ROWTYPE;
  v_trail_id              uuid;
  v_slug                  text;
  v_seen_external_ids     text[] := '{}';
  v_counts                jsonb := jsonb_build_object(
    'fetched', v_fetched, 'created', 0, 'status_changed', 0, 'geom_changed', 0,
    'attrs_changed', 0, 'unchanged', 0, 'missing', 0, 'reappeared', 0, 'errors', 0);
  v_anomalies             jsonb := '[]'::jsonb;
  v_new_attrs_hash        text;
BEGIN
  SELECT * INTO v_run FROM trail_sync_run WHERE id = p_sync_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trail_sync_apply: sync_run % introuvable', p_sync_run_id USING ERRCODE = '22023';
  END IF;
  IF v_run.status <> 'running' THEN
    RAISE EXCEPTION 'trail_sync_apply: sync_run % n''est pas running (status=%)', p_sync_run_id, v_run.status USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('trail_sync:' || v_run.source_id::text));

  v_dry_run := COALESCE((p_options->>'dry_run')::boolean, v_run.dry_run, false);

  SELECT id INTO v_unknown_id FROM ref_code_iti_open_status WHERE code = 'unknown';
  SELECT id INTO v_manager_onf FROM ref_trail_manager WHERE code = 'onf';

  SELECT (counts->>'fetched')::integer INTO v_prev_fetched
  FROM trail_sync_run
  WHERE source_id = v_run.source_id AND status = 'succeeded' AND dry_run = false AND id <> p_sync_run_id
  ORDER BY started_at DESC LIMIT 1;

  IF v_prev_fetched IS NOT NULL AND v_prev_fetched > 0 AND v_fetched < v_prev_fetched * v_min_ratio THEN
    RETURN jsonb_build_object(
      'status', 'source_error', 'counts', v_counts, 'dry_run', v_dry_run,
      'anomalies', jsonb_build_array(jsonb_build_object(
        'type', 'payload_too_small', 'fetched', v_fetched,
        'previous_fetched', v_prev_fetched, 'min_ratio', v_min_ratio)));
  END IF;

  FOR v_feature IN SELECT * FROM jsonb_array_elements(COALESCE(p_features, '[]'::jsonb))
  LOOP
    v_external_id := v_feature->>'external_id';
    IF v_external_id IS NULL OR btrim(v_external_id) = '' THEN
      v_counts := jsonb_set(v_counts, '{errors}', to_jsonb((v_counts->>'errors')::int + 1));
      v_anomalies := v_anomalies || jsonb_build_object('type','missing_external_id','feature', v_feature);
      CONTINUE;
    END IF;
    v_seen_external_ids := v_seen_external_ids || v_external_id;

    v_name_raw            := v_feature->>'name_raw';
    v_name_normalized     := COALESCE(NULLIF(btrim(v_feature->>'name_normalized'), ''), v_name_raw, v_external_id);
    v_raw_attrs            := COALESCE(v_feature->'raw_attributes', '{}'::jsonb);
    v_geom_geojson          := v_feature->'geom_geojson';
    v_length_source          := NULLIF(v_feature->>'length_m_source','')::numeric;
    v_status_raw              := v_feature->>'status_raw';
    v_status_code              := v_feature->>'status_normalized_code';
    v_reason_raw                := NULLIF(btrim(COALESCE(v_feature->>'status_reason_raw','')), '');
    v_reopening_raw               := NULLIF(btrim(COALESCE(v_feature->>'reopening_raw','')), '');
    v_reopening_date                := NULLIF(v_feature->>'reopening_date','')::date;
    v_reopening_precision             := v_feature->>'reopening_precision';
    v_new_attrs_hash                   := md5(v_raw_attrs::text);

    SELECT id INTO v_status_id FROM ref_code_iti_open_status WHERE code = v_status_code;
    IF v_status_id IS NULL THEN
      v_anomalies := v_anomalies || jsonb_build_object('type','unknown_status','external_id', v_external_id,
        'status_raw', v_status_raw, 'status_code', v_status_code);
      v_status_id := v_unknown_id;
      v_status_code := 'unknown';
    END IF;

    v_geom := NULL; v_geom_hash := NULL; v_length_computed := NULL;
    IF v_geom_geojson IS NOT NULL THEN
      BEGIN
        v_geom := ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(v_geom_geojson::text), 4326))::geography;
      EXCEPTION WHEN OTHERS THEN
        v_geom := NULL;
      END;
      IF v_geom IS NULL OR NOT ST_IsValid(v_geom::geometry) OR ST_NPoints(v_geom::geometry) < 2 THEN
        v_anomalies := v_anomalies || jsonb_build_object('type','invalid_geometry','external_id', v_external_id);
        v_counts := jsonb_set(v_counts, '{errors}', to_jsonb((v_counts->>'errors')::int + 1));
        CONTINUE;
      END IF;
      IF NOT ST_Within(v_geom::geometry, ST_MakeEnvelope(54.9, -21.6, 56.1, -20.7, 4326)) THEN
        v_anomalies := v_anomalies || jsonb_build_object('type','geometry_out_of_bounds','external_id', v_external_id);
      END IF;
      v_geom_hash       := COALESCE(v_feature->>'geom_hash', md5(ST_AsText(v_geom::geometry)));
      v_length_computed := ST_Length(v_geom);
      IF v_length_source IS NOT NULL AND v_length_source > 0
         AND abs(v_length_computed - v_length_source) / v_length_source > 0.10 THEN
        v_anomalies := v_anomalies || jsonb_build_object('type','length_mismatch','external_id', v_external_id,
          'length_m_source', v_length_source, 'length_m_computed', v_length_computed);
      END IF;
    END IF;

    SELECT * INTO v_existing FROM trail_source_record WHERE source_id = v_run.source_id AND external_id = v_external_id;

    IF NOT FOUND THEN
      v_counts := jsonb_set(v_counts, '{created}', to_jsonb((v_counts->>'created')::int + 1));
      IF NOT v_dry_run THEN
        v_slug := regexp_replace(lower(coalesce(unaccent(v_name_normalized), v_external_id)), '[^a-z0-9]+', '-', 'g');
        v_slug := trim(both '-' from v_slug) || '-' || left(md5(v_run.source_id::text || ':' || v_external_id), 6);

        INSERT INTO trail (slug, name, origin, visibility)
        VALUES (v_slug, v_name_normalized, 'imported', 'private')
        RETURNING id INTO v_trail_id;

        INSERT INTO trail_source_record (
          trail_id, source_id, external_id, name_raw, raw_attributes, raw_geom, geom_hash, attrs_hash,
          length_m_source, length_m_computed, status_raw, status_normalized, status_reason_raw,
          reopening_raw, reopening_date, reopening_precision, status_published_by, trust, presence)
        VALUES (
          v_trail_id, v_run.source_id, v_external_id, v_name_raw, v_raw_attrs, v_geom, v_geom_hash, v_new_attrs_hash,
          v_length_source, v_length_computed, v_status_raw, v_status_id, v_reason_raw,
          v_reopening_raw, v_reopening_date, v_reopening_precision,
          CASE WHEN v_status_code <> 'not_managed' THEN v_manager_onf ELSE NULL END,
          (SELECT default_trust FROM ref_trail_source WHERE id = v_run.source_id), 'present');

        IF v_status_code <> 'not_managed' THEN
          INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail_id, v_manager_onf, 'primary')
          ON CONFLICT (trail_id, manager_id) DO NOTHING;
        END IF;

        IF v_geom IS NOT NULL THEN
          INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash, length_m_computed, sync_run_id)
          SELECT id, 1, v_geom, v_geom_hash, v_length_computed, p_sync_run_id
          FROM trail_source_record WHERE source_id = v_run.source_id AND external_id = v_external_id;
        END IF;

        INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
        SELECT v_trail_id, id, p_sync_run_id, 'appeared', NULL,
               jsonb_build_object('status_code', v_status_code, 'name', v_name_normalized)
        FROM trail_source_record WHERE source_id = v_run.source_id AND external_id = v_external_id;
      END IF;
      CONTINUE;
    END IF;

    DECLARE
      v_status_changed     boolean := v_existing.status_normalized IS DISTINCT FROM v_status_id;
      v_reason_changed     boolean := v_existing.status_reason_raw IS DISTINCT FROM v_reason_raw;
      v_reopening_changed  boolean := v_existing.reopening_raw IS DISTINCT FROM v_reopening_raw
                                       OR v_existing.reopening_date IS DISTINCT FROM v_reopening_date;
      v_geom_changed       boolean := v_geom IS NOT NULL AND v_existing.geom_hash IS DISTINCT FROM v_geom_hash;
      v_attrs_changed      boolean := v_existing.attrs_hash IS DISTINCT FROM v_new_attrs_hash;
      v_was_missing        boolean := v_existing.presence <> 'present';
      v_any_changed        boolean := v_status_changed OR v_reason_changed OR v_reopening_changed
                                       OR v_geom_changed OR v_attrs_changed OR v_was_missing;
      v_next_version       integer;
    BEGIN
      IF v_status_changed THEN v_counts := jsonb_set(v_counts, '{status_changed}', to_jsonb((v_counts->>'status_changed')::int + 1)); END IF;
      IF v_geom_changed THEN v_counts := jsonb_set(v_counts, '{geom_changed}', to_jsonb((v_counts->>'geom_changed')::int + 1)); END IF;
      IF v_attrs_changed AND NOT v_status_changed THEN v_counts := jsonb_set(v_counts, '{attrs_changed}', to_jsonb((v_counts->>'attrs_changed')::int + 1)); END IF;
      IF v_was_missing THEN v_counts := jsonb_set(v_counts, '{reappeared}', to_jsonb((v_counts->>'reappeared')::int + 1)); END IF;
      IF NOT v_any_changed THEN v_counts := jsonb_set(v_counts, '{unchanged}', to_jsonb((v_counts->>'unchanged')::int + 1)); END IF;

      IF v_any_changed AND NOT v_dry_run THEN
        IF v_geom_changed THEN
          SELECT COALESCE(max(version_no),0) + 1 INTO v_next_version FROM trail_geometry_version WHERE source_record_id = v_existing.id;
          INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash, length_m_computed, sync_run_id)
          VALUES (v_existing.id, v_next_version, v_geom, v_geom_hash, v_length_computed, p_sync_run_id);
        END IF;

        UPDATE trail_source_record SET
          name_raw = v_name_raw, raw_attributes = v_raw_attrs,
          raw_geom = COALESCE(v_geom, raw_geom), geom_hash = COALESCE(v_geom_hash, geom_hash),
          attrs_hash = v_new_attrs_hash,
          length_m_source = v_length_source, length_m_computed = COALESCE(v_length_computed, length_m_computed),
          status_raw = v_status_raw, status_normalized = v_status_id, status_reason_raw = v_reason_raw,
          reopening_raw = v_reopening_raw, reopening_date = v_reopening_date, reopening_precision = v_reopening_precision,
          status_published_by = CASE WHEN v_status_code <> 'not_managed' THEN v_manager_onf ELSE NULL END,
          presence = 'present', last_seen_at = now(),
          last_changed_at = CASE WHEN v_any_changed THEN now() ELSE last_changed_at END,
          missing_since = NULL
        WHERE id = v_existing.id;

        IF v_status_code <> 'not_managed' THEN
          INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_existing.trail_id, v_manager_onf, 'primary')
          ON CONFLICT (trail_id, manager_id) DO NOTHING;
        END IF;

        IF v_status_changed THEN
          INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
          VALUES (v_existing.trail_id, v_existing.id, p_sync_run_id, 'status_change',
            jsonb_build_object('status_id', v_existing.status_normalized), jsonb_build_object('status_id', v_status_id));
        END IF;
        IF v_reason_changed THEN
          INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
          VALUES (v_existing.trail_id, v_existing.id, p_sync_run_id, 'reason_change',
            jsonb_build_object('reason', v_existing.status_reason_raw), jsonb_build_object('reason', v_reason_raw));
        END IF;
        IF v_reopening_changed THEN
          INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
          VALUES (v_existing.trail_id, v_existing.id, p_sync_run_id, 'reopening_change',
            jsonb_build_object('reopening_raw', v_existing.reopening_raw, 'reopening_date', v_existing.reopening_date),
            jsonb_build_object('reopening_raw', v_reopening_raw, 'reopening_date', v_reopening_date));
        END IF;
        IF v_geom_changed THEN
          INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
          VALUES (v_existing.trail_id, v_existing.id, p_sync_run_id, 'geometry_change',
            jsonb_build_object('geom_hash', v_existing.geom_hash), jsonb_build_object('geom_hash', v_geom_hash));
        END IF;
        IF v_was_missing THEN
          INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
          VALUES (v_existing.trail_id, v_existing.id, p_sync_run_id, 'reappeared',
            jsonb_build_object('presence', v_existing.presence), jsonb_build_object('presence','present'));
        END IF;
      END IF;
    END;
  END LOOP;

  DECLARE
    v_missing_id    uuid;
    v_missing_trail uuid;
  BEGIN
    FOR v_missing_id, v_missing_trail IN
      SELECT id, trail_id FROM trail_source_record
      WHERE source_id = v_run.source_id AND presence = 'present'
        AND NOT (external_id = ANY(v_seen_external_ids))
    LOOP
      v_counts := jsonb_set(v_counts, '{missing}', to_jsonb((v_counts->>'missing')::int + 1));
      IF NOT v_dry_run THEN
        UPDATE trail_source_record SET presence = 'missing', missing_since = now() WHERE id = v_missing_id;
        INSERT INTO trail_status_history (trail_id, source_record_id, sync_run_id, event_type, old, new)
        VALUES (v_missing_trail, v_missing_id, p_sync_run_id, 'disappeared',
          jsonb_build_object('presence','present'), jsonb_build_object('presence','missing'));
      END IF;
    END LOOP;
  END;

  RETURN jsonb_build_object('status','ok', 'counts', v_counts, 'anomalies', v_anomalies, 'dry_run', v_dry_run);
END;
$fn$;

REVOKE ALL ON FUNCTION internal.trail_sync_apply(uuid, jsonb, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION internal.trail_expire_overrides()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, api, internal
AS $fn$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT o.id, o.trail_id
    FROM trail_status_override o
    JOIN trail t ON t.id = o.trail_id
    WHERE o.revoked_at IS NULL
      AND o.expires_at IS NOT NULL
      AND o.expires_at <= now()
      AND t.public_status = o.forced_status
      AND (t.public_status_flags->>'manual')::boolean IS TRUE
  LOOP
    INSERT INTO trail_status_history (trail_id, event_type, old, new)
    VALUES (v_rec.trail_id, 'override_expired',
      jsonb_build_object('override_id', v_rec.id), jsonb_build_object('expired_at', now()));
    PERFORM internal.recompute_trail_status(v_rec.trail_id);
  END LOOP;

  FOR v_rec IN
    SELECT DISTINCT trail_id FROM trail_source_record
    WHERE presence = 'missing'
      AND missing_since <= now() - interval '7 days'
      AND missing_since >  now() - interval '8 days'
  LOOP
    PERFORM internal.recompute_trail_status(v_rec.trail_id);
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION internal.trail_expire_overrides() FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 10. Frontière technique service_role-only (§8.2/§15/§18.4 design)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.trail_sync_begin(
  p_source_code   text,
  p_trigger       text,
  p_dry_run       boolean DEFAULT false,
  p_requested_by  uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $fn$
DECLARE
  v_source_id uuid;
  v_run_id    uuid;
BEGIN
  SELECT id INTO v_source_id FROM ref_trail_source WHERE code = p_source_code AND is_active;
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'trail_sync_begin: source inconnue ou inactive: %', p_source_code USING ERRCODE = '22023';
  END IF;
  IF p_trigger NOT IN ('cron','manual','initial') THEN
    RAISE EXCEPTION 'trail_sync_begin: trigger invalide: %', p_trigger USING ERRCODE = '22023';
  END IF;

  UPDATE trail_sync_run
     SET status = 'failed', finished_at = now(),
         error = COALESCE(error, '') || ' [lease expirée récupérée par trail_sync_begin]'
   WHERE source_id = v_source_id AND status = 'running' AND heartbeat_at < now() - interval '30 minutes';

  INSERT INTO trail_sync_run (source_id, trigger, dry_run, requested_by, status)
  VALUES (v_source_id, p_trigger, COALESCE(p_dry_run,false), p_requested_by, 'running')
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_sync_begin(text,text,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.trail_sync_begin(text,text,boolean,uuid) TO service_role;

CREATE OR REPLACE FUNCTION api.trail_sync_apply_service(
  p_sync_run_id uuid,
  p_features    jsonb,
  p_options     jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE trail_sync_run SET heartbeat_at = now() WHERE id = p_sync_run_id;
  v_result := internal.trail_sync_apply(p_sync_run_id, p_features, p_options);
  UPDATE trail_sync_run SET heartbeat_at = now() WHERE id = p_sync_run_id;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_sync_apply_service(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.trail_sync_apply_service(uuid,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION api.trail_sync_finalize(
  p_sync_run_id          uuid,
  p_status               text,
  p_report               jsonb DEFAULT NULL,
  p_http_status          integer DEFAULT NULL,
  p_error                text DEFAULT NULL,
  p_layer_last_edit_date timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $fn$
BEGIN
  IF p_status NOT IN ('succeeded','failed','no_op') THEN
    RAISE EXCEPTION 'trail_sync_finalize: status invalide: %', p_status USING ERRCODE = '22023';
  END IF;
  UPDATE trail_sync_run SET
    status = p_status,
    finished_at = now(),
    heartbeat_at = now(),
    report = COALESCE(p_report, report),
    counts = COALESCE(p_report->'counts', counts),
    http_status = COALESCE(p_http_status, http_status),
    error = COALESCE(p_error, error),
    layer_last_edit_date = COALESCE(p_layer_last_edit_date, layer_last_edit_date)
  WHERE id = p_sync_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trail_sync_finalize: sync_run % introuvable', p_sync_run_id USING ERRCODE = '22023';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_sync_finalize(uuid,text,jsonb,integer,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.trail_sync_finalize(uuid,text,jsonb,integer,text,timestamptz) TO service_role;

-- ---------------------------------------------------------------------
-- 11. Lecture admin (superuser) + lecture publique (anon, champs restreints §17)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.list_trails(
  p_status_code   text    DEFAULT NULL,
  p_presence      text    DEFAULT NULL,
  p_visibility    text    DEFAULT NULL,
  p_search        text    DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
) RETURNS TABLE (
  id uuid, slug text, name text, origin text, visibility text,
  public_status_code text, public_status_flags jsonb,
  manager_codes text[], source_count integer, presence_summary jsonb,
  archived_at timestamptz, created_at timestamptz, updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $fn$
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;
  RETURN QUERY
  WITH filtered AS (
    SELECT t.*, rc.code AS status_code
    FROM trail t
    LEFT JOIN ref_code_iti_open_status rc ON rc.id = t.public_status
    WHERE (p_status_code IS NULL OR rc.code = p_status_code)
      AND (p_visibility IS NULL OR t.visibility = p_visibility)
      AND (p_search IS NULL OR t.name ILIKE '%'||p_search||'%' OR t.slug ILIKE '%'||p_search||'%')
      AND (p_presence IS NULL OR EXISTS (
            SELECT 1 FROM trail_source_record tsr WHERE tsr.trail_id = t.id AND tsr.presence = p_presence))
  ),
  counted AS (SELECT count(*) AS n FROM filtered)
  SELECT f.id, f.slug, f.name, f.origin, f.visibility, f.status_code, f.public_status_flags,
    COALESCE((SELECT array_agg(m.code ORDER BY m.code) FROM trail_manager_link tml JOIN ref_trail_manager m ON m.id = tml.manager_id WHERE tml.trail_id = f.id), '{}'),
    (SELECT count(*)::integer FROM trail_source_record tsr WHERE tsr.trail_id = f.id),
    COALESCE((SELECT jsonb_object_agg(presence, n) FROM (SELECT presence, count(*) n FROM trail_source_record WHERE trail_id=f.id GROUP BY presence) s), '{}'::jsonb),
    f.archived_at, f.created_at, f.updated_at, counted.n
  FROM filtered f, counted
  ORDER BY f.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

REVOKE ALL ON FUNCTION api.list_trails(text,text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_trails(text,text,text,text,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_trail(p_trail_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, extensions
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name, 'name_alt', to_jsonb(t.name_alt),
    'origin', t.origin, 'visibility', t.visibility,
    'editorial_geom', CASE WHEN t.editorial_geom IS NOT NULL THEN ST_AsGeoJSON(t.editorial_geom)::jsonb ELSE NULL END,
    'editorial_length_m', t.editorial_length_m, 'description_md', t.description_md,
    'public_status_code', rc.code, 'public_status_flags', t.public_status_flags,
    'archived_at', t.archived_at, 'created_at', t.created_at, 'updated_at', t.updated_at,
    'managers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('manager_id', m.id, 'code', m.code, 'label', m.label, 'role', tml.role) ORDER BY tml.role), '[]'::jsonb)
                 FROM trail_manager_link tml JOIN ref_trail_manager m ON m.id = tml.manager_id WHERE tml.trail_id = t.id),
    'communes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('insee_code', tc.insee_code, 'name', c.name, 'method', tc.method)), '[]'::jsonb)
                 FROM trail_commune tc JOIN ref_commune c ON c.insee_code = tc.insee_code WHERE tc.trail_id = t.id),
    'source_records', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', tsr.id, 'source_code', rs.code, 'external_id', tsr.external_id, 'name_raw', tsr.name_raw,
        'raw_attributes', tsr.raw_attributes,
        'geom', CASE WHEN tsr.raw_geom IS NOT NULL THEN ST_AsGeoJSON(tsr.raw_geom)::jsonb ELSE NULL END,
        'length_m_source', tsr.length_m_source, 'length_m_computed', tsr.length_m_computed,
        'status_raw', tsr.status_raw, 'status_code', src_status.code, 'status_reason_raw', tsr.status_reason_raw,
        'reopening_raw', tsr.reopening_raw, 'reopening_date', tsr.reopening_date, 'reopening_precision', tsr.reopening_precision,
        'status_published_by', pub.code, 'trust', tsr.trust, 'presence', tsr.presence,
        'first_seen_at', tsr.first_seen_at, 'last_seen_at', tsr.last_seen_at, 'last_changed_at', tsr.last_changed_at,
        'missing_since', tsr.missing_since
      ) ORDER BY tsr.first_seen_at), '[]'::jsonb)
      FROM trail_source_record tsr
      JOIN ref_trail_source rs ON rs.id = tsr.source_id
      LEFT JOIN ref_code_iti_open_status src_status ON src_status.id = tsr.status_normalized
      LEFT JOIN ref_trail_manager pub ON pub.id = tsr.status_published_by
      WHERE tsr.trail_id = t.id),
    'overrides', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id, 'forced_status_code', ors.code, 'reason', o.reason, 'author', o.author,
        'starts_at', o.starts_at, 'expires_at', o.expires_at, 'revoked_at', o.revoked_at, 'revoked_by', o.revoked_by, 'note', o.note
      ) ORDER BY o.starts_at DESC), '[]'::jsonb)
      FROM trail_status_override o JOIN ref_code_iti_open_status ors ON ors.id = o.forced_status WHERE o.trail_id = t.id),
    'history', (SELECT COALESCE(jsonb_agg(row_to_json(h)), '[]'::jsonb) FROM (
        SELECT h.id, h.event_type, h.old, h.new, h.detected_at, h.author, h.sync_run_id
        FROM trail_status_history h WHERE h.trail_id = t.id ORDER BY h.detected_at DESC LIMIT 200
      ) h)
  ) INTO v_result
  FROM trail t
  LEFT JOIN ref_code_iti_open_status rc ON rc.id = t.public_status
  WHERE t.id = p_trail_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'get_trail: sentier % introuvable', p_trail_id USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION api.get_trail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_trail(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.list_trail_sync_runs(p_source_code text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, source_code text, trigger text, dry_run boolean, status text,
  started_at timestamptz, finished_at timestamptz, http_status integer, error text,
  layer_last_edit_date timestamptz, counts jsonb, report jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $fn$
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, rs.code, r.trigger, r.dry_run, r.status, r.started_at, r.finished_at,
         r.http_status, r.error, r.layer_last_edit_date, r.counts, r.report
  FROM trail_sync_run r JOIN ref_trail_source rs ON rs.id = r.source_id
  WHERE p_source_code IS NULL OR rs.code = p_source_code
  ORDER BY r.started_at DESC
  LIMIT p_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION api.list_trail_sync_runs(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_trail_sync_runs(text,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.list_public_trails(
  p_status_code text    DEFAULT NULL,
  p_simplify    boolean DEFAULT true,
  p_tolerance   numeric DEFAULT 0.0001,
  p_limit       integer DEFAULT 100,
  p_offset      integer DEFAULT 0
) RETURNS TABLE (
  id uuid, slug text, name text, status_code text, status_label text,
  not_guaranteed boolean, manager_labels text[], source_label text, source_website text,
  last_update timestamptz, length_m numeric, geom jsonb
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, extensions
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.slug, t.name, rc.code, rc.name,
    COALESCE((t.public_status_flags->>'not_guaranteed')::boolean, false),
    COALESCE((SELECT array_agg(DISTINCT m.label) FROM trail_manager_link tml JOIN ref_trail_manager m ON m.id = tml.manager_id WHERE tml.trail_id = t.id), '{}'),
    (SELECT rs.label FROM trail_source_record tsr JOIN ref_trail_source rs ON rs.id = tsr.source_id WHERE tsr.trail_id = t.id ORDER BY tsr.trust DESC LIMIT 1),
    (SELECT rs.endpoint_url FROM trail_source_record tsr JOIN ref_trail_source rs ON rs.id = tsr.source_id WHERE tsr.trail_id = t.id ORDER BY tsr.trust DESC LIMIT 1),
    GREATEST(t.updated_at, (SELECT max(tsr.last_changed_at) FROM trail_source_record tsr WHERE tsr.trail_id = t.id)),
    COALESCE(t.editorial_length_m, (SELECT max(tsr.length_m_computed) FROM trail_source_record tsr WHERE tsr.trail_id = t.id)),
    CASE
      WHEN t.editorial_geom IS NOT NULL THEN
        ST_AsGeoJSON(CASE WHEN p_simplify THEN ST_SimplifyPreserveTopology(t.editorial_geom::geometry, p_tolerance) ELSE t.editorial_geom::geometry END)::jsonb
      ELSE (
        SELECT ST_AsGeoJSON(CASE WHEN p_simplify THEN ST_SimplifyPreserveTopology(ST_Collect(tsr.raw_geom::geometry), p_tolerance) ELSE ST_Collect(tsr.raw_geom::geometry) END)::jsonb
        FROM trail_source_record tsr WHERE tsr.trail_id = t.id AND tsr.presence = 'present'
      )
    END
  FROM trail t
  LEFT JOIN ref_code_iti_open_status rc ON rc.id = t.public_status
  WHERE t.visibility = 'public'
    AND (p_status_code IS NULL OR rc.code = p_status_code)
  ORDER BY t.name
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

REVOKE ALL ON FUNCTION api.list_public_trails(text,boolean,numeric,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.list_public_trails(text,boolean,numeric,integer,integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_public_trail(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, extensions
AS $fn$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.name,
    'status_code', rc.code, 'status_label', rc.name,
    'not_guaranteed', COALESCE((t.public_status_flags->>'not_guaranteed')::boolean, false),
    'description_md', t.description_md,
    'managers', (SELECT COALESCE(jsonb_agg(DISTINCT m.label), '[]'::jsonb) FROM trail_manager_link tml JOIN ref_trail_manager m ON m.id = tml.manager_id WHERE tml.trail_id = t.id),
    'source', (SELECT jsonb_build_object('label', rs.label, 'website', rs.endpoint_url, 'licence_note', rs.licence_note)
               FROM trail_source_record tsr JOIN ref_trail_source rs ON rs.id = tsr.source_id
               WHERE tsr.trail_id = t.id ORDER BY tsr.trust DESC LIMIT 1),
    'last_update', GREATEST(t.updated_at, (SELECT max(tsr.last_changed_at) FROM trail_source_record tsr WHERE tsr.trail_id = t.id)),
    'closure_reason', (SELECT tsr.status_reason_raw FROM trail_source_record tsr WHERE tsr.trail_id = t.id AND tsr.status_reason_raw IS NOT NULL ORDER BY tsr.trust DESC LIMIT 1),
    'reopening_raw', (SELECT tsr.reopening_raw FROM trail_source_record tsr WHERE tsr.trail_id = t.id AND tsr.reopening_raw IS NOT NULL ORDER BY tsr.trust DESC LIMIT 1),
    'reopening_date', (SELECT tsr.reopening_date FROM trail_source_record tsr WHERE tsr.trail_id = t.id AND tsr.reopening_precision = 'day' ORDER BY tsr.trust DESC LIMIT 1),
    'length_m', COALESCE(t.editorial_length_m, (SELECT max(tsr.length_m_computed) FROM trail_source_record tsr WHERE tsr.trail_id = t.id)),
    'geom', CASE
      WHEN t.editorial_geom IS NOT NULL THEN ST_AsGeoJSON(t.editorial_geom)::jsonb
      ELSE (SELECT ST_AsGeoJSON(ST_Collect(tsr.raw_geom::geometry))::jsonb FROM trail_source_record tsr WHERE tsr.trail_id = t.id AND tsr.presence = 'present')
    END
  ) INTO v_result
  FROM trail t
  LEFT JOIN ref_code_iti_open_status rc ON rc.id = t.public_status
  WHERE t.slug = p_slug AND t.visibility = 'public';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'get_public_trail: sentier public introuvable: %', p_slug USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION api.get_public_trail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.get_public_trail(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. Écriture admin (superuser v1, §15/§24-2 design)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION api.trail_force_status(
  p_trail_id            uuid,
  p_forced_status_code  text,
  p_reason              text,
  p_expires_at          timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $fn$
DECLARE v_status_id uuid; v_override_id uuid;
BEGIN
  IF NOT api.is_platform_superuser() THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trail WHERE id = p_trail_id) THEN
    RAISE EXCEPTION 'trail_force_status: sentier introuvable' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'trail_force_status: motif requis' USING ERRCODE = '22000';
  END IF;
  SELECT id INTO v_status_id FROM ref_code_iti_open_status WHERE code = p_forced_status_code;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'trail_force_status: statut inconnu: %', p_forced_status_code USING ERRCODE = '22023';
  END IF;

  INSERT INTO trail_status_override (trail_id, forced_status, reason, author, expires_at)
  VALUES (p_trail_id, v_status_id, btrim(p_reason), auth.uid(), p_expires_at)
  RETURNING id INTO v_override_id;

  INSERT INTO trail_status_history (trail_id, event_type, old, new, author)
  VALUES (p_trail_id, 'manual_override', NULL,
    jsonb_build_object('override_id', v_override_id, 'forced_status_code', p_forced_status_code, 'reason', p_reason),
    auth.uid());

  RETURN v_override_id;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_force_status(uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.trail_force_status(uuid,text,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.trail_revoke_override(p_override_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $fn$
DECLARE v_trail_id uuid;
BEGIN
  IF NOT api.is_platform_superuser() THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501'; END IF;

  UPDATE trail_status_override
     SET revoked_at = now(), revoked_by = auth.uid(), note = COALESCE(p_note, note)
   WHERE id = p_override_id AND revoked_at IS NULL
  RETURNING trail_id INTO v_trail_id;

  IF v_trail_id IS NULL THEN
    RAISE EXCEPTION 'trail_revoke_override: override introuvable ou déjà révoqué' USING ERRCODE = '22023';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_revoke_override(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.trail_revoke_override(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.trail_set_visibility(p_trail_id uuid, p_visibility text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $fn$
DECLARE v_old text;
BEGIN
  IF NOT api.is_platform_superuser() THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501'; END IF;
  IF p_visibility NOT IN ('private','internal','public') THEN
    RAISE EXCEPTION 'trail_set_visibility: visibility invalide: %', p_visibility USING ERRCODE = '22023';
  END IF;

  SELECT visibility INTO v_old FROM trail WHERE id = p_trail_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'trail_set_visibility: sentier introuvable' USING ERRCODE = '22023'; END IF;
  IF v_old = p_visibility THEN RETURN; END IF;

  UPDATE trail SET visibility = p_visibility WHERE id = p_trail_id;
  INSERT INTO trail_status_history (trail_id, event_type, old, new, author)
  VALUES (p_trail_id, 'visibility_change', jsonb_build_object('visibility', v_old), jsonb_build_object('visibility', p_visibility), auth.uid());
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_set_visibility(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.trail_set_visibility(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.trail_update_editorial(
  p_trail_id                 uuid,
  p_name                     text DEFAULT NULL,
  p_description_md           text DEFAULT NULL,
  p_editorial_geom_geojson   jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, extensions
AS $fn$
DECLARE v_geom geography; v_length numeric;
BEGIN
  IF NOT api.is_platform_superuser() THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trail WHERE id = p_trail_id) THEN
    RAISE EXCEPTION 'trail_update_editorial: sentier introuvable' USING ERRCODE = '22023';
  END IF;

  IF p_editorial_geom_geojson IS NOT NULL THEN
    v_geom := ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(p_editorial_geom_geojson::text), 4326))::geography;
    IF NOT ST_IsValid(v_geom::geometry) THEN
      RAISE EXCEPTION 'trail_update_editorial: géométrie éditoriale invalide' USING ERRCODE = '22023';
    END IF;
    v_length := ST_Length(v_geom);
  END IF;

  UPDATE trail SET
    name                = COALESCE(NULLIF(btrim(p_name), ''), name),
    description_md      = COALESCE(p_description_md, description_md),
    editorial_geom       = COALESCE(v_geom, editorial_geom),
    editorial_length_m    = COALESCE(v_length, editorial_length_m)
  WHERE id = p_trail_id;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_update_editorial(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.trail_update_editorial(uuid,text,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.trail_create_manual(
  p_name             text,
  p_visibility       text DEFAULT 'private',
  p_description_md   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, extensions, auth
AS $fn$
DECLARE v_slug text; v_id uuid;
BEGIN
  IF NOT api.is_platform_superuser() THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501'; END IF;
  IF coalesce(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'trail_create_manual: name requis' USING ERRCODE = '22000'; END IF;
  IF p_visibility NOT IN ('private','internal','public') THEN
    RAISE EXCEPTION 'trail_create_manual: visibility invalide: %', p_visibility USING ERRCODE = '22023';
  END IF;

  v_slug := regexp_replace(lower(unaccent(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug) || '-' || left(md5(gen_random_uuid()::text), 6);

  INSERT INTO trail (slug, name, origin, visibility, description_md, created_by)
  VALUES (v_slug, btrim(p_name), 'manual', p_visibility, p_description_md, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_create_manual(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.trail_create_manual(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.trail_link_source_record(p_source_record_id uuid, p_trail_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $fn$
DECLARE v_old_trail uuid;
BEGIN
  IF NOT api.is_platform_superuser() THEN RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501'; END IF;
  SELECT trail_id INTO v_old_trail FROM trail_source_record WHERE id = p_source_record_id;
  IF v_old_trail IS NULL THEN RAISE EXCEPTION 'trail_link_source_record: record introuvable' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trail WHERE id = p_trail_id) THEN
    RAISE EXCEPTION 'trail_link_source_record: trail cible introuvable' USING ERRCODE = '22023';
  END IF;

  UPDATE trail_source_record SET trail_id = p_trail_id WHERE id = p_source_record_id;

  INSERT INTO trail_status_history (trail_id, source_record_id, event_type, old, new, author)
  VALUES (p_trail_id, p_source_record_id, 'manual_override',
    jsonb_build_object('trail_id', v_old_trail), jsonb_build_object('trail_id', p_trail_id), auth.uid());

  IF v_old_trail <> p_trail_id THEN
    PERFORM internal.recompute_trail_status(v_old_trail);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION api.trail_link_source_record(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.trail_link_source_record(uuid,uuid) TO authenticated, service_role;

COMMIT;

-- =====================================================================
-- ROLLBACK (§18 design) — retrait complet du référentiel. À exécuter MANUELLEMENT
-- (jamais automatique) et UNIQUEMENT si trail_object_link est vide (aucun pont ITI
-- construit) et qu'aucune fiche object_iti n'utilise encore les 3 codes ajoutés.
-- =====================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS api.trail_link_source_record(uuid,uuid);
-- DROP FUNCTION IF EXISTS api.trail_create_manual(text,text,text);
-- DROP FUNCTION IF EXISTS api.trail_update_editorial(uuid,text,text,jsonb);
-- DROP FUNCTION IF EXISTS api.trail_set_visibility(uuid,text);
-- DROP FUNCTION IF EXISTS api.trail_revoke_override(uuid,text);
-- DROP FUNCTION IF EXISTS api.trail_force_status(uuid,text,text,timestamptz);
-- DROP FUNCTION IF EXISTS api.get_public_trail(text);
-- DROP FUNCTION IF EXISTS api.list_public_trails(text,boolean,numeric,integer,integer);
-- DROP FUNCTION IF EXISTS api.list_trail_sync_runs(text,integer);
-- DROP FUNCTION IF EXISTS api.get_trail(uuid);
-- DROP FUNCTION IF EXISTS api.list_trails(text,text,text,text,integer,integer);
-- DROP FUNCTION IF EXISTS api.trail_sync_finalize(uuid,text,jsonb,integer,text,timestamptz);
-- DROP FUNCTION IF EXISTS api.trail_sync_apply_service(uuid,jsonb,jsonb);
-- DROP FUNCTION IF EXISTS api.trail_sync_begin(text,text,boolean,uuid);
-- DROP FUNCTION IF EXISTS internal.trail_expire_overrides();
-- DROP FUNCTION IF EXISTS internal.trail_sync_apply(uuid,jsonb,jsonb);
-- DROP TRIGGER IF EXISTS trg_recompute_status_on_archive ON trail;
-- DROP TRIGGER IF EXISTS trg_recompute_status_on_manager_link ON trail_manager_link;
-- DROP TRIGGER IF EXISTS trg_recompute_status_on_override ON trail_status_override;
-- DROP TRIGGER IF EXISTS trg_recompute_status_on_source_record ON trail_source_record;
-- DROP FUNCTION IF EXISTS internal.trail_recompute_status_self_trigger();
-- DROP FUNCTION IF EXISTS internal.trail_recompute_status_trigger();
-- DROP FUNCTION IF EXISTS internal.recompute_trail_status(uuid);
-- DROP TABLE IF EXISTS trail_commune;
-- DROP TABLE IF EXISTS trail_object_link;
-- DROP TABLE IF EXISTS trail_status_override;
-- DROP TABLE IF EXISTS trail_status_history;
-- DROP TABLE IF EXISTS trail_geometry_version;
-- DROP TABLE IF EXISTS trail_source_record;
-- DROP TABLE IF EXISTS trail_sync_run;
-- DROP TABLE IF EXISTS trail_manager_link;
-- DROP TABLE IF EXISTS trail;
-- DROP TABLE IF EXISTS ref_trail_manager;
-- DROP TABLE IF EXISTS ref_trail_source;
-- DROP TABLE IF EXISTS ref_code_trail_link_role;
-- DELETE FROM ref_code WHERE domain='iti_open_status' AND code IN ('not_managed','unknown','archived')
--   AND NOT EXISTS (SELECT 1 FROM object_iti WHERE open_status IS NOT NULL);
-- COMMIT;
