# Référentiel sentiers — Migration SQL (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le référentiel autonome `trail_*` (sources, gestionnaires, sentiers, records par source, historique, overrides, journal de sync, ponts objet/commune) avec RLS deny-all-direct + RPC `SECURITY DEFINER`, prêt à recevoir des données via Edge Function (Phase 4, plan séparé).

**Architecture:** Option B du design (`docs/superpowers/specs/2026-07-12-referentiel-sentiers-randonnee-design.md`) — référentiel hors modèle `object`, vocabulaire de statut = domaine `iti_open_status` étendu (3 seeds), consolidation en base (`internal.recompute_trail_status`), diff de sync set-based et idempotent (`internal.trail_sync_apply`), frontière technique `service_role`-only pour la sync, RPC `SECURITY DEFINER` pour les lectures admin/publiques et les écritures gated superuser.

**Tech Stack:** PostgreSQL 15 + PostGIS 3.3.7 (schéma `extensions`), Supabase (RLS, `auth.uid()`, `vault`), pattern maison `ref_code` PARTITION BY LIST, migrations idempotentes `\ir`-incluses dans `ci_fresh_apply.sql`.

## Global Constraints

- Géométries : `GEOGRAPHY(MULTILINESTRING, 4326)` uniquement (jamais `geometry`) — CLAUDE.md, confirmé `schema_unified.sql:2811` (`GEOGRAPHY(LINESTRING, 4326)` sur `object_iti.geom`).
- UUID : `gen_random_uuid()` partout (jamais `uuid_generate_v4()` — invariant CLAUDE.md « UUID generation in restricted-search_path functions », `uuid-ossp` absent du search_path des fonctions à `search_path` restreint).
- Toute migration = fichier + entrée `ci_fresh_apply.sql` + entrée `docs/SQL_ROLLOUT_RUNBOOK.md` + test `tests/test_*.sql` (gate CI fresh-apply) — invariant CLAUDE.md « Deploy integrity ».
- Idempotence : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` avant `CREATE POLICY`, seeds via `INSERT … WHERE NOT EXISTS` (le PK `ref_code` est `(id,domain)` avec `id` random-généré ⇒ pas de cible `ON CONFLICT` réutilisable pour les nouveaux domaines) ou `ON CONFLICT (code) DO NOTHING` sur les tables avec `UNIQUE(code)` dédiée.
- RLS : toutes les tables `trail_*`/`ref_trail_*` sont **deny-all en direct** (RLS activée, ZÉRO policy, ZÉRO grant à `anon`/`authenticated`) — pattern exact de `app_ai_provider_config` (`migration_ai_provider_config.sql`). Tout accès passe par une RPC `SECURITY DEFINER`. Ce n'est PAS le pattern per-command des tables enfant d'objet (CLAUDE.md) — le référentiel n'est PAS une table enfant d'objet (§2.3 du design).
- Vocabulaire de statut = domaine **existant** `iti_open_status` (partition `ref_code_iti_open_status`, créée par `migration_iti_section06_vocab.sql`, manifest 15e) étendu de 3 codes (`not_managed`, `unknown`, `archived`) par simple `INSERT`. **Aucune** nouvelle partition de statut. Seul nouveau domaine : `trail_link_role`.
- `object_iti.open_status` (colonne `TEXT CHECK (… IN ('open','closed','partially_closed','warning'))`, `schema_unified.sql:2817`) N'EST PAS touchée par cette migration — le pont ITI (`trail_object_link`) est un chantier séparé après la v1 (§12 design). `trail.public_status`/`trail_source_record.status_normalized` référencent `ref_code_iti_open_status(id)` par FK, indépendamment de ce CHECK.
- `object.id` est `TEXT PRIMARY KEY` (format 16 chars `generate_object_id`) — jamais réutilisé pour les ids du référentiel (qui sont tous `uuid`), seulement référencé en FK (`trail_object_link.object_id`, `ref_trail_manager.org_object_id`).
- Fonctions internes : schéma `internal` (existe déjà), `SET search_path = public, api, internal[, extensions]` selon besoin PostGIS.
- Tests CI (`tests/test_trail_referential.sql`) : transactionnels, `BEGIN; DO $$ … $$; ROLLBACK;` — jamais de fixture persistée (pattern exact `tests/test_room_type_read_gate.sql`).
- Vérification locale sans Docker : appliquer transitoirement via Supabase MCP `execute_sql` dans un bloc que l'on `ROLLBACK`, puis `apply_migration` seulement une fois la section validée (pattern déjà utilisé sur ce projet — mémoire `ranked-label-search-2026-06`).

---

## Fichiers

- Créer : `Base de donnée DLL et API/migration_trail_referential.sql` — un seul fichier de migration, assemblé section par section à travers les tâches 1 à 8 (matche la convention du projet : les migrations volumineuses comme `migration_crm_module.sql` ou `migration_moderation_rpcs.sql` sont mono-fichier).
- Créer : `Base de donnée DLL et API/tests/test_trail_referential.sql` — assemblé section par section à travers les tâches 1 à 8, exécuté en entier à la tâche 9.
- Modifier : `Base de donnée DLL et API/ci_fresh_apply.sql` (tâche 9, ajout du slot `TRAIL1`).
- Modifier : `docs/SQL_ROLLOUT_RUNBOOK.md` (tâche 9, entrée manifest).

Chaque tâche 1-8 AJOUTE une section au fichier de migration (jamais de réécriture) via l'outil Edit, avec un `\i` commentaire de section délimitant clairement le bloc. Chaque tâche vérifie sa section par application transitoire (MCP `execute_sql`, `BEGIN … ROLLBACK`) avant de passer à la suivante — pas de `psql`/Docker local requis.

---

### Task 1: Vocabulaire — extension `iti_open_status` + nouvelle partition `trail_link_role`

**Files:**
- Create: `Base de donnée DLL et API/migration_trail_referential.sql` (nouveau fichier, section 1)
- Test: `Base de donnée DLL et API/tests/test_trail_referential.sql` (nouveau fichier, section 1)

**Interfaces:**
- Produces: 3 nouvelles lignes dans `ref_code_iti_open_status` (`not_managed`, `unknown`, `archived`) ; partition `ref_code_trail_link_role` avec 6 codes (`itinerary_uses`, `segment_of`, `starts_at`, `parking`, `poi_nearby`, `crosses`).

- [ ] **Step 1: Écrire la section 1 du fichier de migration**

```sql
-- =====================================================================
-- migration_trail_referential.sql — Référentiel des sentiers de randonnée
-- ---------------------------------------------------------------------
-- Design : docs/superpowers/specs/2026-07-12-referentiel-sentiers-randonnee-design.md
-- Décisions verrouillées PO (§24, 2026-07-12) : référentiel autonome `trail_*` hors
-- modèle objet ; vocabulaire de statut = domaine Bertel existant `iti_open_status`
-- étendu (PAS de domaine `trail_status` parallèle) ; « hors gestion » -> `not_managed`
-- -> consolidé `unknown + not_guaranteed` (JAMAIS ouvert) ; back-office v1 superuser
-- seul ; aucune suppression automatique, jamais.
-- Idempotent / re-runnable. Rollback : voir le bloc en pied de fichier (DROP des
-- objets trail_*, ref_trail_*, ref_code_trail_link_role, retrait des 3 seeds ajoutés
-- à iti_open_status s'ils ne sont pas encore consommés).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Vocabulaire — extension iti_open_status + nouvelle partition trail_link_role
-- ---------------------------------------------------------------------

-- 1.1 iti_open_status existe déjà (migration_iti_section06_vocab.sql, manifest 15e) :
--     open(1) / partially_closed(2) / warning(3) / closed(4). On ajoute 3 codes.
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

-- 1.2 Nouvelle partition ref_code_trail_link_role (pattern exact
--     migration_iti_section06_vocab.sql / migration_crm_module.sql §1).
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

COMMIT;
```

- [ ] **Step 2: Vérifier via application transitoire (Supabase MCP)**

Exécuter via `mcp__supabase__execute_sql` (ou l'équivalent connecté à ce projet) le contenu ci-dessus MOINS le `COMMIT;` final, remplacé par :

```sql
SELECT code, name, position FROM ref_code WHERE domain = 'iti_open_status' ORDER BY position;
SELECT code, name, position FROM ref_code WHERE domain = 'trail_link_role' ORDER BY position;
ROLLBACK;
```

Expected: la première requête retourne 7 lignes (`open`..`archived`), la seconde 6 lignes (`itinerary_uses`..`crosses`). Si erreur de syntaxe ou de contrainte, corriger avant de continuer — rien n'est persisté (`ROLLBACK`).

- [ ] **Step 3: Écrire la section 1 du fichier de test**

```sql
-- test_trail_referential.sql
-- Couvre migration_trail_referential.sql (référentiel sentiers, design
-- docs/superpowers/specs/2026-07-12-referentiel-sentiers-randonnee-design.md).
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste). Pattern exact
-- tests/test_room_type_read_gate.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_count integer;
BEGIN
  -- ---------- 1. Vocabulaire ----------
  SELECT count(*) INTO v_count FROM ref_code
    WHERE domain = 'iti_open_status' AND code IN ('not_managed','unknown','archived');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'iti_open_status: attendu 3 nouveaux codes, trouvé %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM ref_code WHERE domain = 'trail_link_role';
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'trail_link_role: attendu 6 codes, trouvé %', v_count;
  END IF;

  RAISE NOTICE 'Task 1 OK: vocabulaire iti_open_status étendu + trail_link_role seedé';
END $$;
ROLLBACK;
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): vocabulaire iti_open_status étendu + trail_link_role (§181 Phase 3, task /13)"
```

---

### Task 2: `ref_trail_source` + `ref_trail_manager` (tables + RLS deny-all + seeds)

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 2, avant le `COMMIT;` de fin de fichier)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 2, dans le même bloc `DO $$`)

**Interfaces:**
- Consumes: rien (tables racines).
- Produces: `ref_trail_source(id uuid, code text unique, label, kind, endpoint_url, layer_ref, default_trust smallint, licence_note, is_active, created_at, updated_at)` ; `ref_trail_manager(id uuid, code text unique, label, kind, org_object_id text NULL, website, created_at, updated_at)` ; seed source `onf_arcgis_reunion` ; seeds gestionnaires `onf`/`parc_national`/`departement`/`oti`/`bertel`/`commune`/`association`/`autre`.

- [ ] **Step 1: Ajouter la section 2 au fichier de migration**

Insérer avant le `COMMIT;` final :

```sql
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

-- RLS deny-all-direct (pattern exact app_ai_provider_config, migration_ai_provider_config.sql) :
-- RLS activée, ZÉRO policy, ZÉRO grant anon/authenticated. Tout accès = RPC SECURITY DEFINER (tâches 6-9).
ALTER TABLE ref_trail_source  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_trail_manager ENABLE ROW LEVEL SECURITY;

-- Seeds (idempotents, UNIQUE(code) -> ON CONFLICT réutilisable ici, à la différence de ref_code).
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
```

- [ ] **Step 2: Vérifier via application transitoire**

`BEGIN;` + le bloc ci-dessus (sans le `COMMIT` du fichier complet) + :

```sql
SELECT code, kind, default_trust FROM ref_trail_source;
SELECT code, kind FROM ref_trail_manager ORDER BY code;
SELECT relrowsecurity FROM pg_class WHERE relname IN ('ref_trail_source','ref_trail_manager');
ROLLBACK;
```

Expected: 1 ligne source (`onf_arcgis_reunion`, trust 80), 8 lignes gestionnaire, `relrowsecurity = true` sur les deux tables.

- [ ] **Step 3: Ajouter la section 2 au fichier de test**

Insérer dans le bloc `DO $$` existant, avant `RAISE NOTICE 'Task 1 OK…'` (le renommer en assertions cumulatives — chaque tâche ajoute ses propres `RAISE NOTICE` de fin de section) :

```sql
  -- ---------- 2. Sources + gestionnaires ----------
  SELECT count(*) INTO v_count FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ref_trail_source: seed onf_arcgis_reunion manquant'; END IF;

  SELECT count(*) INTO v_count FROM ref_trail_manager WHERE code = 'onf';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ref_trail_manager: seed onf manquant'; END IF;

  SELECT count(*) INTO v_count FROM ref_trail_manager;
  IF v_count <> 8 THEN RAISE EXCEPTION 'ref_trail_manager: attendu 8 gestionnaires, trouvé %', v_count; END IF;

  -- RLS deny-all-direct : aucune policy, RLS activée.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('ref_trail_source','ref_trail_manager')) THEN
    RAISE EXCEPTION 'ref_trail_source/ref_trail_manager: policy trouvée — attendu deny-all-direct (zéro policy)';
  END IF;

  RAISE NOTICE 'Task 2 OK: ref_trail_source + ref_trail_manager + seeds + RLS deny-all';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): ref_trail_source + ref_trail_manager + seeds (§181 Phase 3, task /13)"
```

---

### Task 3: `trail` + `trail_manager_link`

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 3)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 3)

**Interfaces:**
- Consumes: `ref_trail_manager(id)` (Task 2), `ref_code_iti_open_status(id)` (Task 1).
- Produces: `trail(id uuid, slug text unique, name, name_alt text[], origin, visibility, editorial_geom geography(MultiLineString,4326) NULL, editorial_length_m numeric, description_md, public_status uuid NULL, public_status_flags jsonb, archived_at, created_by, created_at, updated_at)` ; `trail_manager_link(trail_id, manager_id, role, note, created_at, updated_at, PK(trail_id,manager_id))`.

- [ ] **Step 1: Ajouter la section 3 au fichier de migration**

```sql
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
-- Deny-all-direct (voir Task 2) — la lecture superuser/admin ET publique passe par les RPC
-- api.list_trails / api.get_trail / api.list_public_trails / api.get_public_trail (tâches 6-7).

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
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
INSERT INTO trail (slug, name, origin, visibility) VALUES ('test-sentier', 'Sentier de test', 'manual', 'private');
INSERT INTO trail_manager_link (trail_id, manager_id, role)
  SELECT t.id, m.id, 'primary' FROM trail t, ref_trail_manager m WHERE t.slug='test-sentier' AND m.code='onf';
SELECT t.slug, m.code, tml.role FROM trail t JOIN trail_manager_link tml ON tml.trail_id=t.id JOIN ref_trail_manager m ON m.id=tml.manager_id;
ROLLBACK;
```

Expected: une ligne `test-sentier | onf | primary`.

- [ ] **Step 3: Ajouter la section 3 au fichier de test**

```sql
  -- ---------- 3. trail + trail_manager_link ----------
  DECLARE
    v_trail_id uuid;
    v_manager_id uuid;
  BEGIN
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task3', 'Test Task 3', 'manual', 'private')
      RETURNING id INTO v_trail_id;
    SELECT id INTO v_manager_id FROM ref_trail_manager WHERE code = 'onf';
    INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail_id, v_manager_id, 'primary');

    SELECT count(*) INTO v_count FROM trail_manager_link WHERE trail_id = v_trail_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_manager_link: lien non créé'; END IF;

    -- Contrainte unique (trail_id, manager_id) : un second lien identique doit échouer.
    BEGIN
      INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail_id, v_manager_id, 'secondary');
      RAISE EXCEPTION 'trail_manager_link: doublon (trail_id,manager_id) accepté à tort';
    EXCEPTION WHEN unique_violation THEN
      NULL; -- attendu
    END;
  END;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('trail','trail_manager_link')) THEN
    RAISE EXCEPTION 'trail/trail_manager_link: policy trouvée — attendu deny-all-direct';
  END IF;

  RAISE NOTICE 'Task 3 OK: trail + trail_manager_link + contrainte unique + RLS deny-all';
```

Note : ce bloc `DECLARE … BEGIN … END;` imbriqué est légal en PL/pgSQL (sous-bloc dans le `DO $$` principal) — nécessaire ici car `v_trail_id`/`v_manager_id` ne sont utiles qu'à cette section.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): table trail + trail_manager_link (§181 Phase 3, task /13)"
```

---

### Task 4: `trail_sync_run` (journal + lease anti-concurrence)

Créée AVANT `trail_source_record`/`trail_geometry_version`/`trail_status_history` car ces trois tables référencent `trail_sync_run(id)`.

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 4)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 4)

**Interfaces:**
- Consumes: `ref_trail_source(id)` (Task 2).
- Produces: `trail_sync_run(id uuid, source_id, trigger, dry_run, status, started_at, heartbeat_at, finished_at, requested_by, edge_execution_id, error, http_status, layer_last_edit_date, counts jsonb, report jsonb)` + index unique partiel « au plus un run `running` par source ».

- [ ] **Step 1: Ajouter la section 4 au fichier de migration**

```sql
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
'Un run bloqué (heartbeat_at périmé) est récupérable par internal.trail_sync_apply / trail_sync_begin '
'(Task 8) qui le repasse en failed avant d''en ouvrir un nouveau.';

-- Lease : au plus un run "running" par source. Un lease périmé (heartbeat_at trop ancien) est
-- récupéré par api.trail_sync_begin (Task 6), pas par cette contrainte — la contrainte protège
-- seulement contre DEUX runs "running" simultanés pour la même source.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trail_sync_run_running_per_source
  ON trail_sync_run (source_id) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_trail_sync_run_source_started ON trail_sync_run (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trail_sync_run_status ON trail_sync_run (status);

ALTER TABLE trail_sync_run ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — lecture via api.list_trail_sync_runs (Task 7), écriture via
-- api.trail_sync_begin/apply_service/finalize (Task 6, service_role uniquement).
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
INSERT INTO trail_sync_run (source_id, trigger, dry_run)
  SELECT id, 'manual', true FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
-- Un second run "running" pour la même source doit être refusé par l'index unique partiel.
DO $$ BEGIN
  INSERT INTO trail_sync_run (source_id, trigger)
    SELECT id, 'cron' FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
  RAISE EXCEPTION 'lease: second run running accepté à tort';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'lease OK: second run running refusé';
END $$;
ROLLBACK;
```

Expected: `NOTICE: lease OK: second run running refusé`.

- [ ] **Step 3: Ajouter la section 4 au fichier de test**

```sql
  -- ---------- 4. trail_sync_run + lease ----------
  DECLARE
    v_source_id uuid;
    v_run1_id uuid;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
    INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'manual') RETURNING id INTO v_run1_id;

    BEGIN
      INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'cron');
      RAISE EXCEPTION 'trail_sync_run: deux runs running simultanés acceptés à tort';
    EXCEPTION WHEN unique_violation THEN
      NULL; -- attendu : lease respectée
    END;

    UPDATE trail_sync_run SET status = 'succeeded', finished_at = now() WHERE id = v_run1_id;
    -- Une fois le premier run terminé, un nouveau run "running" doit être accepté.
    INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'cron');
  END;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trail_sync_run') THEN
    RAISE EXCEPTION 'trail_sync_run: policy trouvée — attendu deny-all-direct';
  END IF;

  RAISE NOTICE 'Task 4 OK: trail_sync_run + lease un-running-par-source';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): trail_sync_run + lease anti-concurrence (§181 Phase 3, task /13)"
```

---

### Task 5: `trail_source_record` + `trail_geometry_version`

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 5)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 5)

**Interfaces:**
- Consumes: `trail(id)` (Task 3), `ref_trail_source(id)` (Task 2), `ref_trail_manager(id)` (Task 2), `ref_code_iti_open_status(id)` (Task 1), `trail_sync_run(id)` (Task 4).
- Produces: `trail_source_record(id, trail_id, source_id, external_id, name_raw, raw_attributes jsonb, raw_geom geography, geom_hash, attrs_hash, length_m_source, length_m_computed, status_raw, status_normalized, status_reason_raw, reopening_raw, reopening_date, reopening_precision, status_published_by, trust, presence, first_seen_at, last_seen_at, last_changed_at, missing_since, UNIQUE(source_id,external_id))` ; `trail_geometry_version(id, source_record_id, version_no, geom, geom_hash, length_m_computed, captured_at, sync_run_id, UNIQUE(source_record_id,version_no))`.

- [ ] **Step 1: Ajouter la section 5 au fichier de migration**

```sql
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
'(source_id, external_id=''objectid:<OBJECTID>'') — GlobalID indisponible sur la vue ONF publique '
'(vérifié 2026-07-12). raw_attributes/raw_geom = brut JAMAIS retouché. status_normalized référence '
'le domaine iti_open_status étendu (Task 1) ; le mapping WS_Statut -> status_normalized est appliqué '
'côté Edge Function (Phase 4), jamais ici. presence=''missing'' + missing_since : JAMAIS de DELETE '
'(§8.3 design — aucune suppression automatique).';

CREATE INDEX IF NOT EXISTS idx_trail_source_record_trail     ON trail_source_record (trail_id);
CREATE INDEX IF NOT EXISTS idx_trail_source_record_presence  ON trail_source_record (presence);
CREATE INDEX IF NOT EXISTS idx_trail_source_record_status    ON trail_source_record (status_normalized);
CREATE INDEX IF NOT EXISTS idx_trail_source_record_raw_geom  ON trail_source_record USING GIST (raw_geom);

DROP TRIGGER IF EXISTS update_trail_source_record_updated_at ON trail_source_record;
CREATE TRIGGER update_trail_source_record_updated_at BEFORE UPDATE ON trail_source_record
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE trail_source_record ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — écriture réservée à internal.trail_sync_apply (Task 8, appelée par la
-- frontière service_role-only) + aux RPC de re-liaison manuelle (Task 9).

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
'geom_hash change (hash sur coordonnées arrondies 7 décimales — le service ONF renvoie 13 décimales '
'de bruit de reprojection, §10). version_no croissant par source_record_id, calculé côté appelant '
'(internal.trail_sync_apply, Task 8) via max(version_no)+1.';

CREATE INDEX IF NOT EXISTS idx_trail_geometry_version_record ON trail_geometry_version (source_record_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_trail_geometry_version_geom   ON trail_geometry_version USING GIST (geom);

ALTER TABLE trail_geometry_version ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — insert-only via internal.trail_sync_apply.
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
DO $$
DECLARE
  v_trail_id uuid; v_source_id uuid; v_status_id uuid; v_record_id uuid;
BEGIN
  INSERT INTO trail (slug, name, origin, visibility) VALUES ('t5', 'T5', 'imported', 'private') RETURNING id INTO v_trail_id;
  SELECT id INTO v_source_id FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
  SELECT id INTO v_status_id FROM ref_code_iti_open_status WHERE code = 'open';
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence)
    VALUES (v_trail_id, v_source_id, 'objectid:1', v_status_id, 'present') RETURNING id INTO v_record_id;
  INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash)
    VALUES (v_record_id, 1, ST_Multi(ST_MakeLine(ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)))::geography, 'hash1');
  RAISE NOTICE 'insert OK';
  -- Doublon (source_id, external_id) doit échouer.
  BEGIN
    INSERT INTO trail_source_record (trail_id, source_id, external_id) VALUES (v_trail_id, v_source_id, 'objectid:1');
    RAISE EXCEPTION 'doublon (source_id,external_id) accepté à tort';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'unique OK'; END;
END $$;
ROLLBACK;
```

Expected: `insert OK` puis `unique OK`.

- [ ] **Step 3: Ajouter la section 5 au fichier de test**

```sql
  -- ---------- 5. trail_source_record + trail_geometry_version ----------
  DECLARE
    v_trail5_id uuid; v_source_id uuid; v_open_id uuid; v_record5_id uuid;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';
    SELECT id INTO v_open_id FROM ref_code_iti_open_status WHERE code = 'open';
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task5', 'Test Task 5', 'imported', 'private') RETURNING id INTO v_trail5_id;
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence, trust)
      VALUES (v_trail5_id, v_source_id, 'objectid:9001', v_open_id, 'present', 80)
      RETURNING id INTO v_record5_id;

    INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash)
      VALUES (v_record5_id, 1, ST_Multi(ST_MakeLine(ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)))::geography, 'hash-v1');

    SELECT count(*) INTO v_count FROM trail_geometry_version WHERE source_record_id = v_record5_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_geometry_version: insertion échouée'; END IF;

    -- Doublon (source_id, external_id) refusé.
    BEGIN
      INSERT INTO trail_source_record (trail_id, source_id, external_id) VALUES (v_trail5_id, v_source_id, 'objectid:9001');
      RAISE EXCEPTION 'trail_source_record: doublon (source_id,external_id) accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL; END;

    -- Doublon (source_record_id, version_no) refusé.
    BEGIN
      INSERT INTO trail_geometry_version (source_record_id, version_no, geom, geom_hash)
        VALUES (v_record5_id, 1, ST_MakeLine(ST_MakePoint(0,0), ST_MakePoint(1,1))::geography, 'hash-dup');
      RAISE EXCEPTION 'trail_geometry_version: doublon (source_record_id,version_no) accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('trail_source_record','trail_geometry_version')) THEN
    RAISE EXCEPTION 'trail_source_record/trail_geometry_version: policy trouvée — attendu deny-all-direct';
  END IF;

  RAISE NOTICE 'Task 5 OK: trail_source_record + trail_geometry_version + contraintes uniques';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): trail_source_record + trail_geometry_version (§181 Phase 3, task 5/13)"
```

---

### Task 6: `trail_status_history` + `trail_status_override`

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 6)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 6)

**Interfaces:**
- Consumes: `trail(id)` (Task 3), `trail_source_record(id)` (Task 5), `trail_sync_run(id)` (Task 4), `ref_code_iti_open_status(id)` (Task 1).
- Produces: `trail_status_history(id, trail_id, source_record_id, sync_run_id, event_type, old jsonb, new jsonb, detected_at, author)` (insert-only) ; `trail_status_override(id, trail_id, forced_status, reason, author, starts_at, expires_at, revoked_at, revoked_by, note, created_at)` (append-only).

- [ ] **Step 1: Ajouter la section 6 au fichier de migration**

```sql
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
'Historique INSERT-ONLY (§11 design). Émis uniquement si un hash/valeur change réellement — une '
're-synchro identique n''écrit rien (idempotence testée §17/Task 9). geometry_change référence les '
'trail_geometry_version old/new PAR ID dans old/new jsonb (pas de blob dupliqué). Aucune table '
'référence trail_status_history en FK -> DELETE possible en amont sans contrainte bloquante '
'(trail_id ON DELETE CASCADE reste la seule voie de perte, cohérent avec la suppression d''un trail).';

CREATE INDEX IF NOT EXISTS idx_trail_status_history_trail    ON trail_status_history (trail_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_trail_status_history_sync_run ON trail_status_history (sync_run_id);
CREATE INDEX IF NOT EXISTS idx_trail_status_history_event    ON trail_status_history (event_type);

ALTER TABLE trail_status_history ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — écriture réservée à internal.trail_sync_apply / internal.recompute_trail_status /
-- les RPC d'écriture admin (Task 9/10/13) ; lecture via api.get_trail (Task 11, historique inclus).

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
'Forçage manuel du statut consolidé (§9 design). APPEND-ONLY : révocation = revoked_at/revoked_by '
'(jamais de DELETE ni d''UPDATE de forced_status/reason). L''override ACTIF pour un trail = la ligne '
'la plus récente avec revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) — calculé par '
'internal.recompute_trail_status (Task 8), jamais mis en cache ici.';

CREATE INDEX IF NOT EXISTS idx_trail_status_override_trail_active
  ON trail_status_override (trail_id, starts_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE trail_status_override ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — écriture réservée à api.trail_force_status / api.trail_revoke_override (Task 13).
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
DO $$
DECLARE v_trail_id uuid; v_closed_id uuid; v_user uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user, 'trail-task6@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO trail (slug, name, origin, visibility) VALUES ('t6', 'T6', 'manual', 'private') RETURNING id INTO v_trail_id;
  SELECT id INTO v_closed_id FROM ref_code_iti_open_status WHERE code = 'closed';
  INSERT INTO trail_status_history (trail_id, event_type, old, new)
    VALUES (v_trail_id, 'appeared', NULL, jsonb_build_object('status','open'));
  INSERT INTO trail_status_override (trail_id, forced_status, reason, author, expires_at)
    VALUES (v_trail_id, v_closed_id, 'Arrêté municipal saisi manuellement', v_user, now() + interval '30 days');
  RAISE NOTICE 'insert OK';
  -- reason NOT NULL doit bloquer un override sans motif.
  BEGIN
    INSERT INTO trail_status_override (trail_id, forced_status, reason, author) VALUES (v_trail_id, v_closed_id, NULL, v_user);
    RAISE EXCEPTION 'override sans reason accepté à tort';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'not-null OK'; END;
END $$;
ROLLBACK;
```

Expected: `insert OK` puis `not-null OK`.

- [ ] **Step 3: Ajouter la section 6 au fichier de test**

```sql
  -- ---------- 6. trail_status_history + trail_status_override ----------
  DECLARE
    v_trail6_id uuid; v_closed_id uuid; v_override_id uuid;
  BEGIN
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task6', 'Test Task 6', 'manual', 'private') RETURNING id INTO v_trail6_id;
    SELECT id INTO v_closed_id FROM ref_code_iti_open_status WHERE code = 'closed';

    INSERT INTO trail_status_history (trail_id, event_type, old, new)
      VALUES (v_trail6_id, 'manual_override', NULL, jsonb_build_object('forced_status','closed'));

    INSERT INTO trail_status_override (trail_id, forced_status, reason, author, expires_at)
      VALUES (v_trail6_id, v_closed_id, 'Test override', v_test_user, now() + interval '1 day')
      RETURNING id INTO v_override_id;

    -- révocation : jamais de DELETE, seulement revoked_at/revoked_by.
    UPDATE trail_status_override SET revoked_at = now(), revoked_by = v_test_user WHERE id = v_override_id;
    SELECT count(*) INTO v_count FROM trail_status_override WHERE id = v_override_id AND revoked_at IS NOT NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_status_override: révocation échouée'; END IF;

    -- CHECK revoked_at/revoked_by cohérents.
    BEGIN
      UPDATE trail_status_override SET revoked_at = now(), revoked_by = NULL WHERE id = v_override_id;
      RAISE EXCEPTION 'trail_status_override: revoked_at sans revoked_by accepté à tort';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('trail_status_history','trail_status_override')) THEN
    RAISE EXCEPTION 'trail_status_history/trail_status_override: policy trouvée — attendu deny-all-direct';
  END IF;

  RAISE NOTICE 'Task 6 OK: trail_status_history (insert-only) + trail_status_override (append-only)';
```

Ajouter en tête du bloc `DO $$` (avant la section 2) la déclaration et le fixture utilisateur partagés par toutes les sections suivantes :

```sql
DECLARE
  v_count integer;
  v_test_user uuid := '00000000-0000-4000-a000-0000000000f1';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_test_user, 'trail-referential-test@test.local')
    ON CONFLICT (id) DO NOTHING;
```

(Remplace la ligne `DECLARE v_count integer; BEGIN` du Step 3 de la Task 1 — `v_test_user` est réutilisé par les sections 6, 12, 13.)

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): trail_status_history + trail_status_override (§181 Phase 3, task 6/13)"
```

---

### Task 7: `trail_object_link` (pont futur vers l'objet) + `trail_commune`

Ces deux tables ferment le schéma des 13 tables (`ref_trail_source`, `ref_trail_manager`, `trail`, `trail_manager_link`, `trail_source_record`, `trail_geometry_version`, `trail_status_history`, `trail_status_override`, `trail_sync_run`, `trail_object_link`, `trail_commune`, + les 2 partitions `ref_code`).

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 7)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 7)

**Interfaces:**
- Consumes: `trail(id)` (Task 3), `object(id)` (existant), `ref_code_trail_link_role(id)` (Task 1), `ref_commune(insee_code)` (existant, `migration_ref_commune.sql`).
- Produces: `trail_object_link(id, trail_id, object_id, role_id, position, note, created_at, UNIQUE(trail_id,object_id,role_id))` ; `trail_commune(trail_id, insee_code, method, created_at, PK(trail_id,insee_code))`.

- [ ] **Step 1: Ajouter la section 7 au fichier de migration**

```sql
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
'Pont FUTUR entre le référentiel et le modèle objet (§12 design) — VIDE en v1 (0 objet ITI existant, '
'0 pont construit). Rôles : itinerary_uses/segment_of (composition ITI), starts_at/parking/poi_nearby/ '
'crosses (rattachements PNA/SPU). Créée maintenant pour que le schéma soit complet et testable, mais '
'aucune RPC d''écriture n''est fournie par cette migration (le chantier « pont ITI » est séparé, §21 '
'phase 12+13) — insertion manuelle uniquement (superuser direct) tant qu''aucune RPC n''existe.';

CREATE INDEX IF NOT EXISTS idx_trail_object_link_object ON trail_object_link (object_id);
CREATE INDEX IF NOT EXISTS idx_trail_object_link_trail  ON trail_object_link (trail_id);

ALTER TABLE trail_object_link ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — pas de RPC d'écriture en Phase 3 (table vide, pont différé) ; lecture superuser
-- future via une RPC dédiée quand le pont ITI sera construit (hors périmètre de ce plan).

CREATE TABLE IF NOT EXISTS trail_commune (
  trail_id    UUID NOT NULL REFERENCES trail(id) ON DELETE CASCADE,
  insee_code  VARCHAR(5) NOT NULL REFERENCES ref_commune(insee_code) ON DELETE RESTRICT,
  method      TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','spatial')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trail_id, insee_code)
);
COMMENT ON TABLE trail_commune IS
'Rattachement communes (§10 design). method=''manual'' en v1 (arbitré §24-5) — pas de polygones '
'communaux en base (ref_commune n''a pas de géométrie), le rattachement spatial est une passe '
'ultérieure (Admin Express IGN).';

CREATE INDEX IF NOT EXISTS idx_trail_commune_insee ON trail_commune (insee_code);

ALTER TABLE trail_commune ENABLE ROW LEVEL SECURITY;
-- Deny-all-direct — écriture via api.trail_update_editorial ou une RPC dédiée future ;
-- v1 : insertion superuser directe (hors PostgREST) faute de volume/besoin RPC immédiat.
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
DO $$
DECLARE v_trail_id uuid; v_role_id uuid; v_commune text;
BEGIN
  INSERT INTO trail (slug, name, origin, visibility) VALUES ('t7', 'T7', 'manual', 'private') RETURNING id INTO v_trail_id;
  SELECT id INTO v_role_id FROM ref_code_trail_link_role WHERE code = 'starts_at';
  SELECT insee_code INTO v_commune FROM ref_commune LIMIT 1;
  IF v_commune IS NULL THEN RAISE EXCEPTION 'fixture: ref_commune vide — migration_ref_commune.sql non appliquée'; END IF;
  INSERT INTO trail_commune (trail_id, insee_code, method) VALUES (v_trail_id, v_commune, 'manual');
  RAISE NOTICE 'trail_commune OK avec commune %', v_commune;
END $$;
ROLLBACK;
```

Expected: `NOTICE: trail_commune OK avec commune <code INSEE>`.

- [ ] **Step 3: Ajouter la section 7 au fichier de test**

```sql
  -- ---------- 7. trail_object_link + trail_commune ----------
  DECLARE
    v_trail7_id uuid; v_role_id uuid; v_commune_code varchar(5); v_object_id text;
  BEGIN
    INSERT INTO trail (slug, name, origin, visibility)
      VALUES ('__test_trail_task7', 'Test Task 7', 'manual', 'private') RETURNING id INTO v_trail7_id;
    SELECT id INTO v_role_id FROM ref_code_trail_link_role WHERE code = 'starts_at';
    SELECT insee_code INTO v_commune_code FROM ref_commune LIMIT 1;
    IF v_commune_code IS NULL THEN RAISE EXCEPTION 'fixture: ref_commune vide (migration_ref_commune.sql requise avant ce test)'; END IF;

    INSERT INTO trail_commune (trail_id, insee_code, method) VALUES (v_trail7_id, v_commune_code, 'manual');
    SELECT count(*) INTO v_count FROM trail_commune WHERE trail_id = v_trail7_id;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_commune: insertion échouée'; END IF;

    -- trail_object_link : besoin d'un object existant — on en crée un minimal si le fixture
    -- object_type/status le permet (sinon on saute silencieusement ce sous-test, la table restant
    -- volontairement vide en v1, cf. commentaire schéma).
    SELECT id INTO v_object_id FROM object LIMIT 1;
    IF v_object_id IS NOT NULL THEN
      INSERT INTO trail_object_link (trail_id, object_id, role_id) VALUES (v_trail7_id, v_object_id, v_role_id);
      SELECT count(*) INTO v_count FROM trail_object_link WHERE trail_id = v_trail7_id;
      IF v_count <> 1 THEN RAISE EXCEPTION 'trail_object_link: insertion échouée'; END IF;
    ELSE
      RAISE NOTICE 'trail_object_link: aucun object en fixture, sous-test sauté (schéma seul vérifié)';
    END IF;
  END;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename IN ('trail_object_link','trail_commune')) THEN
    RAISE EXCEPTION 'trail_object_link/trail_commune: policy trouvée — attendu deny-all-direct';
  END IF;

  RAISE NOTICE 'Task 7 OK: trail_object_link + trail_commune — schéma des 13 tables COMPLET';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): trail_object_link + trail_commune — schéma complet (§181 Phase 3, task 7/13)"
```

---

### Task 8: `internal.recompute_trail_status` (consolidation §9) + triggers

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 8)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 8)

**Interfaces:**
- Consumes: tout le schéma des Tasks 1-7.
- Produces: `internal.recompute_trail_status(p_trail_id uuid) RETURNS void` — recalcule `trail.public_status`/`public_status_flags`, émet `trail_status_history(event_type='consolidation_change')` si le statut change. Triggers `AFTER INSERT OR UPDATE OR DELETE` sur `trail_source_record`, `trail_status_override`, `trail_manager_link` + `AFTER UPDATE OF archived_at` sur `trail`.

**Choix d'interprétation (à documenter en commentaire SQL)** : le design §9 liste 7 règles de priorité et place `archived` en position 7, mais précise « masque tout sauf l'historique ». Le diagramme mermaid ne montre `archived` accessible QUE depuis la branche `unknown`, ce qui contredirait « masque tout ». Interprétation retenue : `archived` est un état ÉDITORIAL au même titre que l'override manuel (rule 1) — vérifié en second, AVANT le scan des records — pour respecter « masque tout ». Documenté en commentaire SQL pour qu'un reviewer humain puisse challenger ce choix.

- [ ] **Step 1: Ajouter la section 8 au fichier de migration**

```sql
-- ---------------------------------------------------------------------
-- 8. internal.recompute_trail_status (consolidation, §9 design) + triggers
-- ---------------------------------------------------------------------
-- Priorité (§9) : 1) override manuel actif  2) archived (masque tout — voir note
-- d'interprétation dans le plan d'implémentation, le diagramme mermaid du design place
-- archived différemment mais le texte dit explicitement "masque tout sauf l'historique")
-- 3) closed  4) partially_closed  5) warning  6) open (source gestionnaire)
-- 7) open + not_guaranteed (source non gestionnaire)  8) unknown + not_guaranteed (sinon,
-- couvre not_managed et missing au-delà du délai de grâce -> flag stale additionnel).
-- "Gestionnaire" = trail_manager_link(trail_id, manager_id=status_published_by) existe.
-- Éligibilité d'un record : presence='present' OU (presence='missing' AND missing_since
-- dans les 7 derniers jours — délai de grâce §8.3).

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

-- Trigger colonne-ciblée : ne se refire PAS quand recompute_trail_status écrit
-- public_status/public_status_flags (ces colonnes ne sont pas dans la clause OF) -> pas de boucle.
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
```

- [ ] **Step 2: Vérifier via application transitoire — les 7 scénarios clés**

```sql
DO $$
DECLARE
  v_trail uuid; v_source_id uuid; v_onf uuid; v_open uuid; v_closed uuid; v_not_managed uuid;
  v_status uuid; v_flags jsonb;
BEGIN
  SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
  SELECT id INTO v_onf FROM ref_trail_manager WHERE code='onf';
  SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';
  SELECT id INTO v_closed FROM ref_code_iti_open_status WHERE code='closed';
  SELECT id INTO v_not_managed FROM ref_code_iti_open_status WHERE code='not_managed';

  -- Scénario A: 1 record open, source gestionnaire (onf lié) -> open, PAS de not_guaranteed.
  INSERT INTO trail (slug,name,origin,visibility) VALUES ('scn-a','A','imported','private') RETURNING id INTO v_trail;
  INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail, v_onf, 'primary');
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence)
    VALUES (v_trail, v_source_id, 'objectid:A', v_open, v_onf, 'present');
  SELECT public_status, public_status_flags INTO v_status, v_flags FROM trail WHERE id=v_trail;
  IF v_status <> v_open OR v_flags ? 'not_guaranteed' THEN RAISE EXCEPTION 'Scénario A échoué: %,%', v_status, v_flags; END IF;
  RAISE NOTICE 'Scénario A OK: open garanti';

  -- Scénario B: not_managed (hors gestion) SANS lien gestionnaire -> unknown + not_guaranteed, JAMAIS open.
  INSERT INTO trail (slug,name,origin,visibility) VALUES ('scn-b','B','imported','private') RETURNING id INTO v_trail;
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence)
    VALUES (v_trail, v_source_id, 'objectid:B', v_not_managed, 'present');
  SELECT public_status, public_status_flags INTO v_status, v_flags FROM trail WHERE id=v_trail;
  IF v_status = v_open THEN RAISE EXCEPTION 'RÉGRESSION CRITIQUE: hors gestion traduit en open (%)', v_flags; END IF;
  IF NOT (v_flags ? 'not_guaranteed') THEN RAISE EXCEPTION 'Scénario B: not_guaranteed manquant'; END IF;
  RAISE NOTICE 'Scénario B OK: hors gestion -> unknown + not_guaranteed, jamais open';

  -- Scénario C: closed prime sur open (même trail, deux records).
  INSERT INTO trail (slug,name,origin,visibility) VALUES ('scn-c','C','imported','private') RETURNING id INTO v_trail;
  INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail, v_onf, 'primary');
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence, trust)
    VALUES (v_trail, v_source_id, 'objectid:C1', v_open, v_onf, 'present', 90);
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence, trust)
    VALUES (v_trail, v_source_id, 'objectid:C2', v_closed, v_onf, 'present', 20);
  SELECT public_status INTO v_status FROM trail WHERE id=v_trail;
  IF v_status <> v_closed THEN RAISE EXCEPTION 'Scénario C échoué: closed (trust 20) devait battre open (trust 90)'; END IF;
  RAISE NOTICE 'Scénario C OK: closed prime toujours sur open, indépendamment du trust';

  -- Scénario D: override manuel prime sur tout (même avec un closed source).
  INSERT INTO trail_status_override (trail_id, forced_status, reason, author)
    VALUES (v_trail, v_open, 'Réouverture confirmée sur site par l''OTI', '00000000-0000-4000-a000-0000000000f1');
  SELECT public_status INTO v_status FROM trail WHERE id=v_trail;
  IF v_status <> v_open THEN RAISE EXCEPTION 'Scénario D échoué: override actif devait forcer open'; END IF;
  RAISE NOTICE 'Scénario D OK: override manuel prime sur les sources';
END $$;
ROLLBACK;
```

Expected: 4 `NOTICE` de succès, aucune exception. **Le scénario B est le test critique de la sémantique « hors gestion ONF » (§181 mémoire, risque majeur §23 design) — s'il échoue, ne PAS continuer le plan.**

- [ ] **Step 3: Ajouter la section 8 au fichier de test**

Reprendre exactement les 4 scénarios du Step 2 (A/B/C/D) comme sous-bloc `DECLARE … BEGIN … END;` dans le `DO $$` principal du fichier de test, avec `RAISE EXCEPTION` (pas de `RAISE NOTICE` de succès individuel — un seul `RAISE NOTICE 'Task 8 OK: …'` final) :

```sql
  -- ---------- 8. internal.recompute_trail_status — les 4 scénarios critiques ----------
  DECLARE
    v_trail8 uuid; v_source_id uuid; v_onf uuid; v_open uuid; v_closed uuid; v_not_managed uuid;
    v_status uuid; v_flags jsonb;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
    SELECT id INTO v_onf FROM ref_trail_manager WHERE code='onf';
    SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';
    SELECT id INTO v_closed FROM ref_code_iti_open_status WHERE code='closed';
    SELECT id INTO v_not_managed FROM ref_code_iti_open_status WHERE code='not_managed';

    -- A: source gestionnaire -> open garanti.
    INSERT INTO trail (slug,name,origin,visibility) VALUES ('__test_scn_a','A','imported','private') RETURNING id INTO v_trail8;
    INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail8, v_onf, 'primary');
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence)
      VALUES (v_trail8, v_source_id, 'objectid:testA', v_open, v_onf, 'present');
    SELECT public_status, public_status_flags INTO v_status, v_flags FROM trail WHERE id=v_trail8;
    IF v_status <> v_open OR (v_flags ? 'not_guaranteed') THEN
      RAISE EXCEPTION 'consolidation A: attendu open garanti, obtenu %/%', v_status, v_flags;
    END IF;

    -- B (CRITIQUE §181/§23): hors gestion -> JAMAIS open.
    INSERT INTO trail (slug,name,origin,visibility) VALUES ('__test_scn_b','B','imported','private') RETURNING id INTO v_trail8;
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence)
      VALUES (v_trail8, v_source_id, 'objectid:testB', v_not_managed, 'present');
    SELECT public_status, public_status_flags INTO v_status, v_flags FROM trail WHERE id=v_trail8;
    IF v_status = v_open THEN
      RAISE EXCEPTION 'RÉGRESSION CRITIQUE §181: hors gestion ONF traduit en open';
    END IF;
    IF NOT (v_flags ? 'not_guaranteed') THEN
      RAISE EXCEPTION 'consolidation B: flag not_guaranteed manquant pour un statut non garanti';
    END IF;

    -- C: closed prime sur open, trust ignoré entre échelons.
    INSERT INTO trail (slug,name,origin,visibility) VALUES ('__test_scn_c','C','imported','private') RETURNING id INTO v_trail8;
    INSERT INTO trail_manager_link (trail_id, manager_id, role) VALUES (v_trail8, v_onf, 'primary');
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence, trust)
      VALUES (v_trail8, v_source_id, 'objectid:testC1', v_open, v_onf, 'present', 90);
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, status_published_by, presence, trust)
      VALUES (v_trail8, v_source_id, 'objectid:testC2', v_closed, v_onf, 'present', 20);
    SELECT public_status INTO v_status FROM trail WHERE id=v_trail8;
    IF v_status <> v_closed THEN
      RAISE EXCEPTION 'consolidation C: closed (trust 20) devait battre open (trust 90)';
    END IF;

    -- D: override manuel prime sur un closed source.
    INSERT INTO trail_status_override (trail_id, forced_status, reason, author)
      VALUES (v_trail8, v_open, 'Test override prioritaire', v_test_user);
    SELECT public_status INTO v_status FROM trail WHERE id=v_trail8;
    IF v_status <> v_open THEN
      RAISE EXCEPTION 'consolidation D: override actif devait forcer open malgré un closed source';
    END IF;

    -- Historique : le dernier changement de statut doit avoir émis consolidation_change.
    SELECT count(*) INTO v_count FROM trail_status_history
      WHERE trail_id = v_trail8 AND event_type = 'consolidation_change';
    IF v_count = 0 THEN RAISE EXCEPTION 'trail_status_history: aucun consolidation_change émis'; END IF;
  END;

  RAISE NOTICE 'Task 8 OK: internal.recompute_trail_status — 4 scénarios de consolidation (dont B critique §181)';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): internal.recompute_trail_status + triggers consolidation §9 (§181 Phase 3, task 8/13)"
```

---

### Task 9: `internal.trail_sync_apply` (diff engine §8.1) + `internal.trail_expire_overrides` (§8.3/§9)

Le cœur du moteur de synchronisation. **Reçoit un payload DÉJÀ normalisé** (mapping statut, dates de réouverture, nom nettoyé — fait côté Edge Function, Phase 4/Plan B) : cette fonction ne fait QUE le diff/écriture/consolidation, jamais le parsing ONF brut.

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 9)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 9)

**Interfaces:**
- Consumes: schéma Tasks 1-7, `internal.recompute_trail_status` (Task 8, déclenché par trigger — PAS appelé explicitement ici).
- Produces: `internal.trail_sync_apply(p_sync_run_id uuid, p_features jsonb, p_options jsonb DEFAULT '{}'::jsonb) RETURNS jsonb` — le contrat `p_features` (array d'objets) et le retour (`{status, counts, anomalies, dry_run}`) sont l'interface que l'Edge Function `trail-sync` (Plan B, Phase 4) devra respecter EXACTEMENT :
  ```
  p_features[i] = {
    external_id: text ("objectid:<OBJECTID>"), name_raw: text|null, name_normalized: text|null,
    raw_attributes: jsonb, geom_geojson: jsonb|null (GeoJSON déjà en SRID 4326, coord. arrondies 7 décimales),
    geom_hash: text|null (si absent, calculé ici via md5(ST_AsText)), length_m_source: numeric|null,
    status_raw: text|null, status_normalized_code: text (doit exister dans ref_code_iti_open_status —
      sinon fallback 'unknown' + anomalie), status_reason_raw: text|null, reopening_raw: text|null,
      reopening_date: date|null (format ISO 'YYYY-MM-DD'), reopening_precision: text|null
  }
  p_options = { dry_run: boolean, min_expected_ratio: numeric (défaut 0.5) }
  RETURNS { status: 'ok'|'source_error', counts: {fetched,created,status_changed,geom_changed,
    attrs_changed,unchanged,missing,reappeared,errors}, anomalies: [...], dry_run: boolean }
  ```
- Produces: `internal.trail_expire_overrides() RETURNS void` — appelée par le cron quotidien (Task 10/Plan D), gère les expirations d'override et le passage `unknown+stale` après le délai de grâce de 7 jours.

- [ ] **Step 1: Ajouter la section 9 au fichier de migration**

```sql
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

  -- Verrou transactionnel par source, en complément du lease trail_sync_run (§8.2 design).
  PERFORM pg_advisory_xact_lock(hashtext('trail_sync:' || v_run.source_id::text));

  v_dry_run := COALESCE((p_options->>'dry_run')::boolean, v_run.dry_run, false);

  SELECT id INTO v_unknown_id FROM ref_code_iti_open_status WHERE code = 'unknown';
  SELECT id INTO v_manager_onf FROM ref_trail_manager WHERE code = 'onf';

  -- Garde-fou payload anormal (§8.3) : comparé au dernier run RÉUSSI non-dry-run de cette source.
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

    -- Géométrie : validation AVANT toute écriture (§10 — rejet en anomalie, jamais d'écriture silencieuse).
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
        CONTINUE; -- pas d'écriture pour ce feature ; l'état existant (s'il existe) reste inchangé.
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

    -- Record existant : classification du diff, puis écriture gated par v_dry_run.
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

  -- Disparitions (§8.3) : records present-jusque-là de cette source, absents du payload courant.
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

-- ---------------------------------------------------------------------
-- internal.trail_expire_overrides — repasse quotidienne (§8.3/§9/§14)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.trail_expire_overrides()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, api, internal
AS $fn$
DECLARE
  v_rec record;
BEGIN
  -- 1. Overrides dont l'expiration est dépassée ET encore appliqués (public_status_flags.manual) :
  --    signale + recalcule (le recalcul lui-même ignore l'override expiré via son filtre WHERE).
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

  -- 2. Délai de grâce "missing" de 7 jours franchi depuis la veille : recalcule (idempotent,
  --    coût trivial au volume actuel — voir ponytail sur le choix de fenêtre 7-8j vs full-scan).
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
```

- [ ] **Step 2: Vérifier via application transitoire — scénarios clés du diff engine**

```sql
DO $$
DECLARE
  v_source_id uuid; v_run1 uuid; v_run2 uuid; v_run3 uuid; v_result jsonb; v_trail_id uuid;
  v_payload jsonb;
BEGIN
  SELECT id INTO v_source_id FROM ref_trail_source WHERE code = 'onf_arcgis_reunion';

  -- Run 1 : import initial de 2 features (1 open géré, 1 hors gestion).
  INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'initial') RETURNING id INTO v_run1;
  v_payload := jsonb_build_array(
    jsonb_build_object('external_id','objectid:t1','name_normalized','Sentier T1',
      'raw_attributes', jsonb_build_object('WS_NomIti','Sentier T1'),
      'geom_geojson', jsonb_build_object('type','MultiLineString','coordinates', jsonb_build_array(jsonb_build_array(jsonb_build_array(55.5,-21.1), jsonb_build_array(55.51,-21.11)))),
      'length_m_source', 1200, 'status_raw','Sentier ouvert', 'status_normalized_code','open'),
    jsonb_build_object('external_id','objectid:t2','name_normalized','Sentier T2 (hors gestion ONF)',
      'raw_attributes', jsonb_build_object('WS_NomIti','Sentier T2 (hors gestion ONF)'),
      'geom_geojson', jsonb_build_object('type','MultiLineString','coordinates', jsonb_build_array(jsonb_build_array(jsonb_build_array(55.6,-21.2), jsonb_build_array(55.61,-21.21)))),
      'length_m_source', 800, 'status_raw','Sentier hors gestion ONF', 'status_normalized_code','not_managed')
  );
  v_result := internal.trail_sync_apply(v_run1, v_payload, '{}'::jsonb);
  UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_result->'counts' WHERE id = v_run1;
  IF (v_result->'counts'->>'created')::int <> 2 THEN RAISE EXCEPTION 'run1: attendu 2 créations, obtenu %', v_result; END IF;
  RAISE NOTICE 'Run 1 OK: 2 créés, %', v_result->'counts';

  -- Rejeu STRICTEMENT identique : idempotence (0 événement, tout en unchanged).
  INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'manual') RETURNING id INTO v_run2;
  v_result := internal.trail_sync_apply(v_run2, v_payload, '{}'::jsonb);
  IF (v_result->'counts'->>'unchanged')::int <> 2 OR (v_result->'counts'->>'created')::int <> 0 THEN
    RAISE EXCEPTION 'idempotence échouée: %', v_result;
  END IF;
  RAISE NOTICE 'Run 2 OK (idempotent): %', v_result->'counts';

  -- Vérifier : t2 (not_managed) n'a AUCUN lien gestionnaire, t1 (open) en a un.
  SELECT trail_id INTO v_trail_id FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:t2';
  IF EXISTS (SELECT 1 FROM trail_manager_link WHERE trail_id = v_trail_id) THEN
    RAISE EXCEPTION 'RÉGRESSION: sentier hors gestion a reçu un lien gestionnaire';
  END IF;
  SELECT trail_id INTO v_trail_id FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:t1';
  IF NOT EXISTS (SELECT 1 FROM trail_manager_link WHERE trail_id = v_trail_id AND role='primary') THEN
    RAISE EXCEPTION 'sentier géré ONF sans lien gestionnaire';
  END IF;

  -- Run 3 : payload réduit à 0 feature -> garde-fou (< 50% de 2) -> source_error, RIEN de missing.
  INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'manual') RETURNING id INTO v_run3;
  v_result := internal.trail_sync_apply(v_run3, '[]'::jsonb, '{}'::jsonb);
  IF v_result->>'status' <> 'source_error' THEN RAISE EXCEPTION 'garde-fou non déclenché sur payload vide: %', v_result; END IF;
  IF EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND presence='missing') THEN
    RAISE EXCEPTION 'garde-fou déclenché mais des records ont quand même été marqués missing';
  END IF;
  RAISE NOTICE 'Run 3 OK: garde-fou payload vide -> source_error, 0 missing';
END $$;
ROLLBACK;
```

Expected: 3 `NOTICE` de succès, aucune exception.

- [ ] **Step 3: Ajouter la section 9 au fichier de test**

Reprendre le Step 2 tel quel comme sous-bloc `DECLARE … BEGIN … END;` (remplacer les `RAISE NOTICE` intermédiaires par des `IF … THEN RAISE EXCEPTION` uniquement — garder UN SEUL `RAISE NOTICE 'Task 9 OK…'` en fin de section, pattern identique aux tâches précédentes). Ajouter en plus, dans le même bloc, le test de géométrie invalide et de disparition/réapparition :

```sql
    -- Géométrie invalide : AUCUNE écriture, anomalie journalisée, presence inchangée si record existant.
    DECLARE
      v_run_bad uuid; v_bad_result jsonb; v_bad_payload jsonb;
    BEGIN
      INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'manual') RETURNING id INTO v_run_bad;
      v_bad_payload := jsonb_build_array(jsonb_build_object(
        'external_id','objectid:bad1','name_normalized','Sentier invalide',
        'raw_attributes','{}'::jsonb,
        'geom_geojson', jsonb_build_object('type','MultiLineString','coordinates', jsonb_build_array(jsonb_build_array(jsonb_build_array(55.5,-21.1)))), -- 1 seul point -> invalide
        'status_normalized_code','open'));
      v_bad_result := internal.trail_sync_apply(v_run_bad, v_bad_payload, '{}'::jsonb);
      IF (v_bad_result->'counts'->>'errors')::int <> 1 THEN
        RAISE EXCEPTION 'géométrie invalide: attendu 1 erreur, obtenu %', v_bad_result;
      END IF;
      IF EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:bad1') THEN
        RAISE EXCEPTION 'géométrie invalide: un record a quand même été écrit';
      END IF;
    END;

    -- Disparition puis réapparition.
    DECLARE
      v_run_gone uuid; v_run_back uuid; v_gone_result jsonb; v_back_result jsonb;
    BEGIN
      -- Un payload avec SEULEMENT t1 (t2 absent) -> t2 doit devenir missing (ratio 1/2 = 0.5, pas < 0.5, garde-fou NON déclenché).
      INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'manual') RETURNING id INTO v_run_gone;
      v_gone_result := internal.trail_sync_apply(v_run_gone,
        jsonb_build_array(v_payload->0), '{}'::jsonb); -- v_payload->0 = feature t1 seul
      UPDATE trail_sync_run SET status='succeeded', finished_at=now(), counts = v_gone_result->'counts' WHERE id = v_run_gone;
      IF (v_gone_result->'counts'->>'missing')::int <> 1 THEN
        RAISE EXCEPTION 'disparition: attendu 1 missing, obtenu %', v_gone_result;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:t2' AND presence='missing' AND missing_since IS NOT NULL) THEN
        RAISE EXCEPTION 'disparition: objectid:t2 devrait être presence=missing avec missing_since renseigné';
      END IF;

      -- Réapparition : rejouer le payload complet -> t2 redevient present, événement reappeared.
      INSERT INTO trail_sync_run (source_id, trigger) VALUES (v_source_id, 'manual') RETURNING id INTO v_run_back;
      v_back_result := internal.trail_sync_apply(v_run_back, v_payload, '{}'::jsonb);
      IF (v_back_result->'counts'->>'reappeared')::int <> 1 THEN
        RAISE EXCEPTION 'réapparition: attendu 1 reappeared, obtenu %', v_back_result;
      END IF;
      IF EXISTS (SELECT 1 FROM trail_source_record WHERE source_id=v_source_id AND external_id='objectid:t2' AND presence <> 'present') THEN
        RAISE EXCEPTION 'réapparition: objectid:t2 devrait être presence=present';
      END IF;
    END;
```

Terminer par :

```sql
  RAISE NOTICE 'Task 9 OK: internal.trail_sync_apply — idempotence, hors-gestion sans gestionnaire, garde-fou, géométrie invalide, disparition/réapparition';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): internal.trail_sync_apply diff engine + trail_expire_overrides (§181 Phase 3, task 9/13)"
```

---

### Task 10: RPC frontière technique `service_role`-only (`trail_sync_begin` / `trail_sync_apply_service` / `trail_sync_finalize`)

Pattern exact `api.get_active_ai_provider_secret` (`migration_ai_provider_config.sql:205-223`) : `REVOKE ALL … FROM PUBLIC, anon, authenticated` puis `GRANT EXECUTE … TO service_role` uniquement. C'est la frontière que l'Edge Function `trail-sync` (Plan B, Phase 4) appellera avec la clé service-role.

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 10)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 10)

**Interfaces:**
- Consumes: `internal.trail_sync_apply` (Task 9), `trail_sync_run` (Task 4).
- Produces: `api.trail_sync_begin(p_source_code text, p_trigger text, p_dry_run boolean DEFAULT false, p_requested_by uuid DEFAULT NULL) RETURNS uuid` (sync_run_id) ; `api.trail_sync_apply_service(p_sync_run_id uuid, p_features jsonb, p_options jsonb DEFAULT '{}'::jsonb) RETURNS jsonb` ; `api.trail_sync_finalize(p_sync_run_id uuid, p_status text, p_report jsonb DEFAULT NULL, p_http_status integer DEFAULT NULL, p_error text DEFAULT NULL, p_layer_last_edit_date timestamptz DEFAULT NULL) RETURNS void`.

- [ ] **Step 1: Ajouter la section 10 au fichier de migration**

```sql
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

  -- Récupération de lease périmée (§8.2) : un run "running" dont le heartbeat n'a pas bougé
  -- depuis > 30 minutes est considéré mort (Edge Function crashée/timeout) et repassé failed
  -- AVANT toute tentative de nouveau run — sinon l'index unique partiel bloquerait indéfiniment.
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
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
DO $$
DECLARE v_run_id uuid; v_result jsonb;
BEGIN
  v_run_id := api.trail_sync_begin('onf_arcgis_reunion', 'manual', false, NULL);
  RAISE NOTICE 'begin OK: %', v_run_id;

  -- Un second begin doit récupérer/refuser correctement : ici heartbeat frais -> l'INSERT échoue
  -- (lease active), la fonction lève l'exception unique_violation du index partiel.
  BEGIN
    PERFORM api.trail_sync_begin('onf_arcgis_reunion', 'manual', false, NULL);
    RAISE EXCEPTION 'second begin accepté à tort alors qu''un run running existe déjà';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'lease OK: second begin refusé'; END;

  v_result := api.trail_sync_apply_service(v_run_id, '[]'::jsonb, jsonb_build_object('dry_run', true));
  RAISE NOTICE 'apply_service OK (dry_run): %', v_result;

  PERFORM api.trail_sync_finalize(v_run_id, 'succeeded', v_result);
  IF (SELECT status FROM trail_sync_run WHERE id = v_run_id) <> 'succeeded' THEN
    RAISE EXCEPTION 'finalize: status non mis à jour';
  END IF;
  RAISE NOTICE 'finalize OK';
END $$;
ROLLBACK;
```

Expected: `begin OK`, `lease OK`, `apply_service OK`, `finalize OK` — aucune exception non attrapée.

- [ ] **Step 3: Ajouter la section 10 au fichier de test**

```sql
  -- ---------- 10. Frontière service_role (trail_sync_begin/apply_service/finalize) ----------
  DECLARE
    v_run10_id uuid; v_result10 jsonb;
  BEGIN
    v_run10_id := api.trail_sync_begin('onf_arcgis_reunion', 'manual', true, NULL);
    IF v_run10_id IS NULL THEN RAISE EXCEPTION 'trail_sync_begin: aucun id retourné'; END IF;

    BEGIN
      PERFORM api.trail_sync_begin('onf_arcgis_reunion', 'manual', false, NULL);
      RAISE EXCEPTION 'trail_sync_begin: second run running accepté à tort';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    v_result10 := api.trail_sync_apply_service(v_run10_id, '[]'::jsonb, jsonb_build_object('dry_run', true));
    IF v_result10->>'dry_run' <> 'true' THEN RAISE EXCEPTION 'trail_sync_apply_service: dry_run non respecté'; END IF;

    PERFORM api.trail_sync_finalize(v_run10_id, 'succeeded', v_result10);
    SELECT count(*) INTO v_count FROM trail_sync_run WHERE id = v_run10_id AND status = 'succeeded' AND finished_at IS NOT NULL;
    IF v_count <> 1 THEN RAISE EXCEPTION 'trail_sync_finalize: run non finalisé correctement'; END IF;
  END;

  -- Grants : ces 3 RPC ne doivent JAMAIS être exécutables par anon/authenticated (frontière service_role).
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'api' AND routine_name IN ('trail_sync_begin','trail_sync_apply_service','trail_sync_finalize')
      AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'frontière service_role violée: anon/authenticated ont EXECUTE sur une RPC de sync';
  END IF;

  RAISE NOTICE 'Task 10 OK: frontière service_role-only (begin/apply_service/finalize) + lease';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): RPC frontière service_role trail_sync_begin/apply_service/finalize (§181 Phase 3, task 10/13)"
```

---

### Task 11: RPC lecture admin (`list_trails`/`get_trail`/`list_trail_sync_runs`) + lecture publique (`list_public_trails`/`get_public_trail`)

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 11)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 11)

**Interfaces:**
- Consumes: schéma complet (Tasks 1-7), `api.is_platform_superuser()` (existant, `rls_policies.sql:1838`).
- Produces: 5 RPC `SECURITY DEFINER`. Admin (`api.is_platform_superuser()` gated, `authenticated`+`service_role`) : `list_trails(...)`, `get_trail(uuid)`, `list_trail_sync_runs(...)`. Publiques (`anon`+`authenticated`+`service_role`, filtrées `visibility='public'`) : `list_public_trails(...)`, `get_public_trail(text)` — **n'exposent JAMAIS** `raw_attributes`, l'historique, les overrides ou les journaux (§17 design).

- [ ] **Step 1: Ajouter la section 11 au fichier de migration**

```sql
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
    -- Historique borné à 200 événements : agrégation sur une sous-requête ORDER BY + LIMIT
    -- (un LIMIT au même niveau que jsonb_agg ne bornerait PAS les lignes agrégées).
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
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
DO $$
DECLARE v_trail_id uuid; v_source_id uuid; v_open uuid; v_detail jsonb; v_public jsonb; v_list_count integer;
BEGIN
  SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
  SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';
  INSERT INTO trail (slug, name, origin, visibility, public_status)
    VALUES ('t11-public', 'T11 Public', 'imported', 'public', v_open) RETURNING id INTO v_trail_id;
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence, raw_geom, length_m_computed)
    VALUES (v_trail_id, v_source_id, 'objectid:t11', v_open, 'present',
      ST_Multi(ST_MakeLine(ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)))::geography, 1000);

  -- Admin (simuler superuser en bypassant RLS — l'appel direct depuis une session postgres/superuser
  -- de test bypass déjà RLS ; is_platform_superuser() lit app_user_profile/auth.role(), à vérifier
  -- que la fonction ne lève pas 42501 dans ce contexte transitoire (owner de la fonction = postgres,
  -- SECURITY DEFINER + is_platform_superuser() renvoie true pour auth.role()='service_role'/'admin'
  -- côté MCP/psql direct).
  SELECT count(*) INTO v_list_count FROM api.list_trails(NULL,NULL,NULL,'T11',10,0);
  IF v_list_count <> 1 THEN RAISE EXCEPTION 'list_trails: attendu 1 résultat pour la recherche T11, obtenu %', v_list_count; END IF;
  v_detail := api.get_trail(v_trail_id);
  IF v_detail->>'slug' <> 't11-public' THEN RAISE EXCEPTION 'get_trail: slug inattendu'; END IF;
  IF NOT (v_detail ? 'source_records') THEN RAISE EXCEPTION 'get_trail: source_records manquant'; END IF;
  RAISE NOTICE 'lecture admin OK';

  -- Public : doit renvoyer le sentier (visibility=public) SANS raw_attributes/history/overrides.
  v_public := api.get_public_trail('t11-public');
  IF v_public ? 'raw_attributes' OR v_public ? 'history' OR v_public ? 'overrides' THEN
    RAISE EXCEPTION 'FUITE §17: get_public_trail expose des champs internes';
  END IF;
  IF v_public->>'status_code' <> 'open' THEN RAISE EXCEPTION 'get_public_trail: statut inattendu'; END IF;
  RAISE NOTICE 'lecture publique OK, aucune fuite de champ interne';
END $$;
ROLLBACK;
```

Expected: `lecture admin OK`, `lecture publique OK, aucune fuite de champ interne`.

- [ ] **Step 3: Ajouter la section 11 au fichier de test**

```sql
  -- ---------- 11. Lecture admin + lecture publique (aucune fuite §17) ----------
  DECLARE
    v_trail11_id uuid; v_source_id uuid; v_open uuid; v_detail jsonb; v_public jsonb;
  BEGIN
    SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
    SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';
    INSERT INTO trail (slug, name, origin, visibility, public_status)
      VALUES ('__test_trail11_public', 'Test Task 11', 'imported', 'public', v_open) RETURNING id INTO v_trail11_id;
    INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence, raw_geom, length_m_computed, raw_attributes)
      VALUES (v_trail11_id, v_source_id, 'objectid:test11', v_open, 'present',
        ST_Multi(ST_MakeLine(ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)))::geography, 1000,
        jsonb_build_object('WS_NomIti','secret interne non exposable'));

    v_detail := api.get_trail(v_trail11_id);
    IF v_detail->>'slug' <> '__test_trail11_public' THEN RAISE EXCEPTION 'get_trail: résultat inattendu'; END IF;
    IF (v_detail->'source_records'->0->'raw_attributes'->>'WS_NomIti') IS NULL THEN
      RAISE EXCEPTION 'get_trail: raw_attributes absent alors qu''attendu côté ADMIN';
    END IF;

    v_public := api.get_public_trail('__test_trail11_public');
    IF v_public ? 'raw_attributes' OR v_public ? 'history' OR v_public ? 'overrides' OR v_public ? 'source_records' THEN
      RAISE EXCEPTION 'RÉGRESSION §17: get_public_trail expose raw_attributes/history/overrides/source_records';
    END IF;
    IF v_public->>'name' <> 'Test Task 11' THEN RAISE EXCEPTION 'get_public_trail: name inattendu'; END IF;

    -- Un trail PRIVATE ne doit jamais apparaître dans les lectures publiques.
    UPDATE trail SET visibility = 'private' WHERE id = v_trail11_id;
    BEGIN
      PERFORM api.get_public_trail('__test_trail11_public');
      RAISE EXCEPTION 'FUITE: un trail visibility=private est lisible via get_public_trail';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%introuvable%' THEN RAISE; END IF; -- attendu : introuvable
    END;
  END;

  RAISE NOTICE 'Task 11 OK: lecture admin complète + lecture publique restreinte (§17, aucune fuite)';
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): RPC lecture admin + lecture publique restreinte §17 (§181 Phase 3, task 11/13)"
```

---

### Task 12: RPC écriture admin (`trail_force_status` / `trail_revoke_override` / `trail_set_visibility` / `trail_update_editorial` / `trail_create_manual` / `trail_link_source_record`)

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append section 12)
- Modify: `Base de donnée DLL et API/tests/test_trail_referential.sql` (append section 12)

**Interfaces:**
- Consumes: `internal.recompute_trail_status` (Task 8, déclenché par trigger sauf cas explicite `trail_link_source_record`), `api.is_platform_superuser()`.
- Produces: 6 RPC `SECURITY DEFINER`, toutes gated `api.is_platform_superuser()`, `REVOKE … FROM PUBLIC, anon` / `GRANT … TO authenticated, service_role` (écriture admin v1, §15/§24-2 design — élargissement OTI différé).

- [ ] **Step 1: Ajouter la section 12 au fichier de migration**

```sql
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
  RETURNING id INTO v_override_id; -- déclenche trg_recompute_status_on_override (Task 8)

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
  RETURNING trail_id INTO v_trail_id; -- déclenche trg_recompute_status_on_override (Task 8)

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
  -- déclenche trg_recompute_status_on_source_record (Task 8) pour p_trail_id (NEW) uniquement —
  -- l'ancien trail (v_old_trail) doit être recalculé explicitement (il a PERDU ce record).

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
```

- [ ] **Step 2: Vérifier via application transitoire**

```sql
DO $$
DECLARE
  v_trail_a uuid; v_trail_b uuid; v_source_id uuid; v_open uuid; v_record_id uuid;
  v_override_id uuid; v_status_code text;
BEGIN
  SELECT id INTO v_source_id FROM ref_trail_source WHERE code='onf_arcgis_reunion';
  SELECT id INTO v_open FROM ref_code_iti_open_status WHERE code='open';

  v_trail_a := api.trail_create_manual('Sentier manuel A', 'private', 'Test');
  RAISE NOTICE 'create_manual OK: %', v_trail_a;

  PERFORM api.trail_force_status(v_trail_a, 'closed', 'Test fermeture manuelle', now() + interval '1 day');
  SELECT rc.code INTO v_status_code FROM trail t JOIN ref_code_iti_open_status rc ON rc.id=t.public_status WHERE t.id=v_trail_a;
  IF v_status_code <> 'closed' THEN RAISE EXCEPTION 'force_status: statut non appliqué (%)', v_status_code; END IF;
  RAISE NOTICE 'force_status OK';

  SELECT id INTO v_override_id FROM trail_status_override WHERE trail_id=v_trail_a AND revoked_at IS NULL;
  PERFORM api.trail_revoke_override(v_override_id, 'Test révocation');
  SELECT rc.code INTO v_status_code FROM trail t JOIN ref_code_iti_open_status rc ON rc.id=t.public_status WHERE t.id=v_trail_a;
  IF v_status_code = 'closed' THEN RAISE EXCEPTION 'revoke_override: statut toujours forcé après révocation'; END IF;
  RAISE NOTICE 'revoke_override OK (retombé à %)', v_status_code;

  PERFORM api.trail_set_visibility(v_trail_a, 'public');
  IF (SELECT visibility FROM trail WHERE id=v_trail_a) <> 'public' THEN RAISE EXCEPTION 'set_visibility échoué'; END IF;
  RAISE NOTICE 'set_visibility OK';

  PERFORM api.trail_update_editorial(v_trail_a, 'Sentier manuel A (renommé)', 'Nouvelle description', NULL);
  IF (SELECT name FROM trail WHERE id=v_trail_a) <> 'Sentier manuel A (renommé)' THEN RAISE EXCEPTION 'update_editorial échoué'; END IF;
  RAISE NOTICE 'update_editorial OK';

  -- link_source_record : déplacer un record de trail_a vers un nouveau trail_b, vérifier le recalcul des DEUX.
  INSERT INTO trail_source_record (trail_id, source_id, external_id, status_normalized, presence)
    VALUES (v_trail_a, v_source_id, 'objectid:link1', v_open, 'present') RETURNING id INTO v_record_id;
  v_trail_b := api.trail_create_manual('Sentier manuel B (cible reliaison)', 'private', NULL);
  PERFORM api.trail_link_source_record(v_record_id, v_trail_b);
  IF (SELECT trail_id FROM trail_source_record WHERE id=v_record_id) <> v_trail_b THEN
    RAISE EXCEPTION 'link_source_record: record non déplacé';
  END IF;
  IF (SELECT public_status FROM trail WHERE id=v_trail_b) IS NULL THEN
    RAISE EXCEPTION 'link_source_record: trail cible non recalculé';
  END IF;
  RAISE NOTICE 'link_source_record OK';
END $$;
ROLLBACK;
```

Expected: 6 `NOTICE` de succès, aucune exception.

- [ ] **Step 3: Ajouter la section 12 au fichier de test**

Reprendre le Step 2 intégralement comme sous-bloc `DECLARE … BEGIN … END;`, en remplaçant les `RAISE NOTICE` intermédiaires par des assertions silencieuses (garder uniquement les `IF … RAISE EXCEPTION`) et terminer par un unique :

```sql
  RAISE NOTICE 'Task 12 OK: 6 RPC écriture admin (force_status/revoke_override/set_visibility/update_editorial/create_manual/link_source_record)';
```

Ajouter en plus l'assertion de gate superuser (aucune des 6 RPC exécutable par `anon`) :

```sql
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'api'
      AND routine_name IN ('trail_force_status','trail_revoke_override','trail_set_visibility',
                            'trail_update_editorial','trail_create_manual','trail_link_source_record')
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'gate superuser violée: anon a EXECUTE sur une RPC d''écriture admin';
  END IF;
```

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql"
git commit -m "feat(sentiers): 6 RPC écriture admin superuser-gated (§181 Phase 3, task 12/13)"
```

---

### Task 13: Rollback script + manifest (`ci_fresh_apply.sql` + `SQL_ROLLOUT_RUNBOOK.md`) + exécution complète de la suite de tests

Dernière tâche — ferme le fichier de migration, l'entre dans le manifest CI (invariant CLAUDE.md « Deploy integrity »), puis exécute la suite `test_trail_referential.sql` COMPLÈTE (sections 1-12 assemblées) pour valider l'ensemble avant de déployer réellement (`apply_migration`).

**Files:**
- Modify: `Base de donnée DLL et API/migration_trail_referential.sql` (append le script de rollback commenté en pied de fichier, après le `COMMIT;` — §18 design)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (ajout slot `TRAIL1`)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée manifest correspondante)
- Read: `Base de donnée DLL et API/tests/test_trail_referential.sql` (exécution complète, aucune modification)

- [ ] **Step 1: Ajouter le script de rollback en pied de fichier de migration**

Après le `COMMIT;` final (qui clôt maintenant les sections 1 à 12) :

```sql
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
-- DROP TABLE IF EXISTS ref_code_trail_link_role; -- détache la partition ref_code
-- DELETE FROM ref_code WHERE domain='iti_open_status' AND code IN ('not_managed','unknown','archived')
--   AND NOT EXISTS (SELECT 1 FROM object_iti WHERE open_status IS NOT NULL); -- garde-fou : retire SEULEMENT si non consommé
-- COMMIT;
```

- [ ] **Step 2: Ajouter le slot `TRAIL1` à `ci_fresh_apply.sql`**

Insérer après le bloc `ORG2` (`migration_org_branding.sql`) et avant `taxo` (`Base de donnée DLL et API/ci_fresh_apply.sql:236-238` actuellement) :

```
\echo '== TRAIL1  migration_trail_referential.sql  (§181 Référentiel sentiers de randonnée : trail_* autonome hors modèle objet, vocabulaire iti_open_status étendu de 3 codes (not_managed/unknown/archived) + partition trail_link_role, consolidation internal.recompute_trail_status, diff idempotent internal.trail_sync_apply, frontière service_role-only trail_sync_begin/apply_service/finalize, RPC lecture admin + publique restreinte §17, 6 RPC écriture superuser ; dépend de ref_commune (8l) + is_platform_superuser (rls_policies.sql) + ref_code_iti_open_status (15e) + object (schema_unified) ; auto-contenu, RLS deny-all-direct sur toutes les tables trail_*/ref_trail_*) =='
\ir migration_trail_referential.sql
```

- [ ] **Step 3: Ajouter l'entrée dans `docs/SQL_ROLLOUT_RUNBOOK.md`**

Localiser la section « Fresh Database — Complete Ordered Manifest » (ligne 23) et ajouter, dans le même style que les entrées voisines (`ORG1`/`ORG2`), une ligne `TRAIL1` documentant : fichier, rôle en une phrase, dépendances, non-foldé (référentiel autonome, pas de modification de `schema_unified.sql`).

- [ ] **Step 4: Assembler et exécuter la suite de tests complète**

1. Lire le fichier `Base de donnée DLL et API/tests/test_trail_referential.sql` assemblé (sections 1-12).
2. L'exécuter contre le projet Supabase de développement via `mcp__supabase__execute_sql` (ou l'outil MCP équivalent connecté) — le fichier se termine par `ROLLBACK;`, donc AUCUNE donnée ne persiste, sûr à lancer contre un projet partagé.
3. Vérifier dans la sortie qu'AUCUNE exception n'est levée et que les 12 `RAISE NOTICE 'Task N OK: …'` apparaissent.
4. Si un test échoue : corriger la section de migration concernée (retour à la tâche correspondante), PAS le test (sauf si le test lui-même contient une erreur de rédaction).

- [ ] **Step 5: Appliquer réellement la migration (hors ROLLBACK)**

Une fois la suite verte : appliquer `migration_trail_referential.sql` pour de vrai (`mcp__supabase__apply_migration` avec le contenu complet du fichier, ou `psql` si un accès direct existe). Puis ré-exécuter `tests/test_trail_referential.sql` tel quel contre la base réellement migrée (toujours `ROLLBACK`-terminé, donc sans effet de bord) pour confirmer que le schéma déployé est identique à celui testé transitoirement.

- [ ] **Step 6: Vérifier `get_advisors` (sécurité)**

Appeler `mcp__supabase__get_advisors` (type `security`) et confirmer qu'aucune nouvelle alerte `rls_disabled_in_public` n'apparaît sur les tables `trail_*`/`ref_trail_*` (elles doivent toutes avoir RLS activée — Tasks 2-7). Une alerte `security_definer_view`/`function_search_path_mutable` sur les nouvelles RPC est **attendue et acceptable** (pattern authorize-once documenté CLAUDE.md §36, comme `api.get_object_cards_batch`) — ne pas la « corriger » en retirant `SECURITY DEFINER`.

- [ ] **Step 7: Commit final**

```bash
git add "Base de donnée DLL et API/migration_trail_referential.sql" "Base de donnée DLL et API/tests/test_trail_referential.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" "docs/SQL_ROLLOUT_RUNBOOK.md"
git commit -m "feat(sentiers): wiring manifest TRAIL1 + rollback script + suite de tests validée (§181 Phase 3, task 13/13 — schéma complet)"
```

---

## Fin de Phase 3

À l'issue de ce plan : les 13 tables du référentiel (`ref_trail_source`, `ref_trail_manager`, `trail`, `trail_manager_link`, `trail_source_record`, `trail_geometry_version`, `trail_status_history`, `trail_status_override`, `trail_sync_run`, `trail_object_link`, `trail_commune`, `ref_code_iti_open_status` étendu, `ref_code_trail_link_role`) existent, sont RLS deny-all-direct, testées (12 sections CI), et exposent 14 RPC `SECURITY DEFINER` (3 service_role-only, 3 lecture admin, 2 lecture publique, 6 écriture admin). **Aucune donnée réelle n'est encore importée** (table vide en sortie de Phase 3 — c'est le rôle de la Phase 4).

**Prochaine étape (Plan B, à écrire une fois ce plan exécuté et vérifié)** : Edge Function `trail-sync` (Supabase, Deno) — fetch ArcGIS paginé, normalisation (mapping `WS_Statut`→code, parsing `WS_InfDate`, nettoyage nom), appel à `api.trail_sync_begin`/`trail_sync_apply_service`/`trail_sync_finalize`, benchmark sur le payload réel (4,6 Mo/~122k sommets), puis import initial `dry_run=true` suivi de l'import réel `visibility=private` (§7/§8 design, Phase 4-5 du plan de déploiement §21).
