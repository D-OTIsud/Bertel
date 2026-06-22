# Section 06 ITI — Phase A (fondations backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Donner à la Section 06 ITI une voie d'écriture de la géométrie (tracé + point d'étape), les vocabulaires manquants, et l'exposition lecture nécessaire — sans toucher au frontend.

**Architecture:** 4 seeds de vocabulaire + 1 nouvel RPC PostGIS d'ingestion de tracé + déblocage du geom d'étape dans le RPC nested existant + 2 ajouts d'émission dans `get_object_resource`. Backend pur, vérifié sur l'unique ITI live (greenfield).

**Tech Stack:** PostgreSQL/PostGIS (Supabase), PL/pgSQL `SECURITY INVOKER`, `ref_code`/`ref_iti_assoc_role`.

## Global Constraints

- UUID dans toute fonction `search_path` restreint : `gen_random_uuid()`, jamais `uuid_generate_v4()` (CLAUDE.md §29).
- PostGIS vit dans le schéma `extensions` sur ce projet (le trigger `regenerate_iti_track_cache` met `extensions` sur son `search_path`) — toute fonction appelant `ST_*` doit avoir `extensions` sur son `search_path` (à VÉRIFIER à l'exécution : `SELECT extnamespace::regnamespace FROM pg_extension WHERE extname='postgis'`).
- Migrations idempotentes (`ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`), ajoutées au manifeste `lot1_mapping_decisions.md` §24 + runbook + foldées dans les fichiers source (`schema_unified.sql` / `seeds_data.sql` / `object_workspace_safe_write_rpcs.sql` / `api_views_functions.sql`). Fresh-apply == live.
- Écriture canonique gardée par `internal.workspace_assert_can_write_object` (déjà en place).
- Tout déployé sur live via Supabase MCP `apply_migration`, vérifié, PUIS foldé dans la source ; tests SQL `tests/test_*.sql` en CI.

---

### Task A1: Seeds de vocabulaire (4 jeux)

**Files:**
- Create: `Base de donnée DLL et API/migration_iti_section06_vocab.sql`
- Modify (fold): `Base de donnée DLL et API/seeds_data.sql` (ajouter les INSERT à la suite des seeds `iti_practice`)
- Test: `bertel-tourism-ui/tests/test_iti_section06_vocab.sql`

**Interfaces:**
- Produces: `ref_iti_assoc_role(code)` rows ; `ref_code` domaines `iti_difficulty` / `iti_open_status` / `iti_stage_kind`.

- [ ] **Step 1 — Migration SQL (idempotente)**

```sql
-- migration_iti_section06_vocab.sql — Section 06 ITI : vocabulaires manquants
BEGIN;

-- Rôles des objets liés (object_iti_associated_object.role_id → ref_iti_assoc_role)
INSERT INTO ref_iti_assoc_role (id, code, name, description, position) VALUES
  (gen_random_uuid(), 'sur_le_parcours',  'Sur le parcours',      'Objet situé sur le tracé',                 10),
  (gen_random_uuid(), 'a_proximite',      'À proximité',          'Objet à proximité immédiate du tracé',     20),
  (gen_random_uuid(), 'point_de_depart',  'Point de départ',      'Objet servant de point de départ',         30),
  (gen_random_uuid(), 'hebergement_etape','Hébergement d''étape', 'Hébergement sur l''itinéraire',            40),
  (gen_random_uuid(), 'restauration',     'Restauration',         'Point de restauration lié au parcours',    50),
  (gen_random_uuid(), 'parking',          'Parking',              'Stationnement conseillé',                  60),
  (gen_random_uuid(), 'point_interet',    'Point d''intérêt',     'Objet d''intérêt lié au parcours',         70),
  (gen_random_uuid(), 'prestataire',      'Prestataire',          'Prestataire associé à l''itinéraire',      80)
ON CONFLICT (code) DO NOTHING;

-- Difficulté 1-5 (object_iti.difficulty_level INTEGER ; ref pour libellés)
INSERT INTO ref_code (domain, code, name, description) VALUES
  ('iti_difficulty','1','Très facile','Niveau de difficulté 1/5'),
  ('iti_difficulty','2','Facile','Niveau de difficulté 2/5'),
  ('iti_difficulty','3','Moyen','Niveau de difficulté 3/5'),
  ('iti_difficulty','4','Difficile','Niveau de difficulté 4/5'),
  ('iti_difficulty','5','Très difficile','Niveau de difficulté 5/5')
ON CONFLICT (domain, code) DO NOTHING;

-- Statut d'ouverture (object_iti.open_status TEXT CHECK)
INSERT INTO ref_code (domain, code, name, description) VALUES
  ('iti_open_status','open','Ouvert','Itinéraire ouvert'),
  ('iti_open_status','partially_closed','Partiellement fermé','Itinéraire partiellement fermé'),
  ('iti_open_status','warning','Vigilance','Praticabilité à surveiller'),
  ('iti_open_status','closed','Fermé','Itinéraire fermé')
ON CONFLICT (domain, code) DO NOTHING;

-- Type d'étape (object_iti_stage.extra->>'kind')
INSERT INTO ref_code (domain, code, name, description) VALUES
  ('iti_stage_kind','depart','Départ','Point de départ'),
  ('iti_stage_kind','etape','Étape','Étape du parcours'),
  ('iti_stage_kind','point_interet','Point d''intérêt','Point d''intérêt'),
  ('iti_stage_kind','point_eau','Point d''eau','Source / ravitaillement en eau'),
  ('iti_stage_kind','panorama','Panorama','Point de vue'),
  ('iti_stage_kind','parking','Parking','Stationnement'),
  ('iti_stage_kind','ravitaillement','Ravitaillement','Point de ravitaillement'),
  ('iti_stage_kind','arrivee','Arrivée','Point d''arrivée')
ON CONFLICT (domain, code) DO NOTHING;

COMMIT;
```

> NB exécution : vérifier les colonnes réelles de `ref_iti_assoc_role` (id/code/name/description/position) ; si `position` absent, retirer. Vérifier que `ref_code` a bien `(domain, code)` en unique.

- [ ] **Step 2 — Test SQL** (`test_iti_section06_vocab.sql`) : asserts `count(*) ref_iti_assoc_role >= 8`, `count(*) ref_code WHERE domain='iti_difficulty' = 5`, `= 4` pour `iti_open_status`, `= 8` pour `iti_stage_kind` ; `RAISE EXCEPTION` si un compte ne correspond pas.
- [ ] **Step 3 — Appliquer live** via MCP `apply_migration` ; relire les comptes.
- [ ] **Step 4 — Fold** dans `seeds_data.sql` (après les seeds `iti_practice`) + entrée manifeste/runbook.
- [ ] **Step 5 — Commit** `feat(iti): seed Section 06 vocab (assoc roles, difficulty, open status, stage kind)`.

---

### Task A2: RPC `api.set_itinerary_track`

**Files:**
- Create: `Base de donnée DLL et API/migration_iti_set_track.sql`
- Modify (fold): `Base de donnée DLL et API/api_views_functions.sql` (à côté de `build_iti_track`)
- Test: `bertel-tourism-ui/tests/test_set_itinerary_track.sql`

**Interfaces:**
- Produces: `api.set_itinerary_track(p_object_id text, p_payload jsonb) RETURNS jsonb` — `p_payload = { geojson: <LineString|null> }` ; retour `{ success, distance_km, elevation_gain, elevation_loss, profile_points, has_3d }`.

- [ ] **Step 1 — RPC SQL** (search_path inclut `extensions`) :

```sql
CREATE OR REPLACE FUNCTION api.set_itinerary_track(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal, extensions
AS $$
DECLARE
  v_geojson jsonb;
  v_geom    geography(LineString,4326);
  v_g2d     geometry;
  v_dist_km numeric;
  v_gain    integer;
  v_loss    integer;
  v_has3d   boolean := false;
  v_pts     integer := 0;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);
  v_geojson := p_payload->'geojson';

  -- Effacement
  IF v_geojson IS NULL OR v_geojson = 'null'::jsonb THEN
    UPDATE public.object_iti
       SET geom = NULL, distance_km = NULL, elevation_gain = NULL, elevation_loss = NULL
     WHERE object_id = p_object_id;
    IF NOT FOUND THEN
      INSERT INTO public.object_iti (object_id) VALUES (p_object_id) ON CONFLICT (object_id) DO NOTHING;
    END IF;
    DELETE FROM public.object_iti_profile WHERE object_id = p_object_id;
    RETURN jsonb_build_object('success', true, 'distance_km', NULL, 'elevation_gain', NULL,
                              'elevation_loss', NULL, 'profile_points', 0, 'has_3d', false);
  END IF;

  -- Parse + SRID
  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(v_geojson::text), 4326)::geography(LineString,4326);
  v_g2d  := v_geom::geometry;
  v_has3d := ST_NDims(v_g2d) >= 3;
  v_dist_km := round((ST_Length(v_geom)::numeric) / 1000.0, 2);

  -- Dénivelé + profil (si 3D)
  IF v_has3d THEN
    WITH dp AS (
      SELECT (dpt).path[1] AS idx, (dpt).geom AS pt
      FROM ST_DumpPoints(v_g2d) AS dpt
    ),
    seq AS (
      SELECT idx, ST_Z(pt) AS z,
             ST_Distance(pt::geography, LAG(pt) OVER (ORDER BY idx)::geography) AS seg_m
      FROM dp
    ),
    cum AS (
      SELECT idx, z, COALESCE(SUM(seg_m) OVER (ORDER BY idx), 0) AS pos_m,
             z - LAG(z) OVER (ORDER BY idx) AS dz
      FROM seq
    )
    SELECT COALESCE(SUM(CASE WHEN dz > 0 THEN dz END),0)::integer,
           COALESCE(SUM(CASE WHEN dz < 0 THEN -dz END),0)::integer,
           COUNT(*)::integer
      INTO v_gain, v_loss, v_pts
      FROM cum;

    DELETE FROM public.object_iti_profile WHERE object_id = p_object_id;
    -- échantillonnage borné ~300 points
    INSERT INTO public.object_iti_profile (id, object_id, position_m, elevation_m)
    SELECT gen_random_uuid(), p_object_id, round(pos_m::numeric,2), round(z::numeric,2)
    FROM (
      WITH dp AS (SELECT (dpt).path[1] AS idx, (dpt).geom AS pt FROM ST_DumpPoints(v_g2d) AS dpt),
      seq AS (SELECT idx, ST_Z(pt) z, ST_Distance(pt::geography, LAG(pt) OVER (ORDER BY idx)::geography) seg_m FROM dp),
      cum AS (SELECT idx, z, COALESCE(SUM(seg_m) OVER (ORDER BY idx),0) pos_m,
                     row_number() OVER (ORDER BY idx) rn, count(*) OVER () n FROM seq)
      SELECT pos_m, z FROM cum
      WHERE n <= 300 OR (rn % GREATEST((n/300),1) = 0)
    ) s;
  ELSE
    v_gain := NULL; v_loss := NULL; v_pts := 0;
    DELETE FROM public.object_iti_profile WHERE object_id = p_object_id;
  END IF;

  -- Upsert tracé (trigger regenerate_iti_track_cache régénère cached_gpx/kml)
  INSERT INTO public.object_iti (object_id, geom, distance_km, elevation_gain, elevation_loss)
  VALUES (p_object_id, v_geom, v_dist_km, v_gain, v_loss)
  ON CONFLICT (object_id) DO UPDATE
    SET geom = EXCLUDED.geom, distance_km = EXCLUDED.distance_km,
        elevation_gain = EXCLUDED.elevation_gain, elevation_loss = EXCLUDED.elevation_loss,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'distance_km', v_dist_km, 'elevation_gain', v_gain,
                            'elevation_loss', v_loss, 'profile_points', v_pts, 'has_3d', v_has3d);
END;
$$;

GRANT EXECUTE ON FUNCTION api.set_itinerary_track(text, jsonb) TO authenticated, service_role;
```

- [ ] **Step 2 — Test SQL** : impersonifier le owner (SET request.jwt.claims) ou appeler en service_role contextualisé ; injecter une LineString 3D `{type:LineString,coordinates:[[lng,lat,ele],…]}` à dénivelé connu ; asserts distance ≈ `ST_Length`, `elevation_gain`/`loss` exacts, `profile_points>0`, geom non NULL, `cached_gpx` non NULL (trigger). Effacement → geom/distance/profil NULL. Garde : un non-autorisé → exception.
- [ ] **Step 3 — Appliquer live**, vérifier sur l'ITI test.
- [ ] **Step 4 — Fold** dans `api_views_functions.sql` + manifeste/runbook.
- [ ] **Step 5 — Commit** `feat(iti): api.set_itinerary_track (PostGIS geom + auto distance/elevation/profile)`.

---

### Task A3: Débloquer le geom d'étape dans `save_object_itinerary_nested`

**Files:**
- Modify: `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:846-892` (bloc `stages`) + `:788` (search_path)
- Test: `bertel-tourism-ui/tests/test_iti_stage_geom_roundtrip.sql`

**Interfaces:**
- Consumes: payload `stages[].lng`, `stages[].lat` (floats), `stages[].extra.kind` (déjà passé via `extra`).
- Produces: `object_iti_stage.geom` écrit (POINT) quand lng/lat présents.

- [ ] **Step 1 — Test (RED)** : `save_object_itinerary_nested` avec un stage `{name, position, extra:{kind:'panorama'}, lng:55.4, lat:-21.0}` → `object_iti_stage.geom` non NULL, `ST_X/ST_Y` corrects, `extra->>'kind'='panorama'`.
- [ ] **Step 2 — Éditer le RPC** :
  - `:788` → `SET search_path = public, api, internal, extensions`.
  - Remplacer le bloc skip-geom stage (`:847-853`) : ne plus warner ; lire `lng`/`lat`.
  - Ajouter `geom` à l'INSERT `object_iti_stage` (col list + valeur) :
    ```sql
    -- colonne ajoutée après extra
    , geom
    -- valeur ajoutée
    , CASE WHEN (v_row ? 'lng') AND (v_row ? 'lat')
             AND NULLIF(v_row->>'lng','') IS NOT NULL AND NULLIF(v_row->>'lat','') IS NOT NULL
           THEN ST_SetSRID(ST_MakePoint((v_row->>'lng')::float8, (v_row->>'lat')::float8),4326)::geography
           ELSE NULL END
    ```
- [ ] **Step 3 — Run test (GREEN)** sur live.
- [ ] **Step 4 — Vérifier** qu'aucune autre copie de cette fonction n'existe (grep `save_object_itinerary_nested` dans les migrations) ; si oui, synchroniser. Manifeste/runbook : noter le changement de search_path.
- [ ] **Step 5 — Commit** `feat(iti): persist stage GPS point (geom) + kind via save_object_itinerary_nested`.

---

### Task A4: Émission lecture (tracé GeoJSON + coordonnées d'étape)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (bloc `itinerary_details` ~4105-4191 de `get_object_resource`)
- Test: extension de `test_set_itinerary_track.sql` / `test_iti_stage_geom_roundtrip.sql` (round-trip lecture)

**Interfaces:**
- Produces: `get_object_resource → itinerary_details.track_geojson` (FeatureCollection ou Geometry du tracé) ; `itinerary_details.stages[].lng` / `.lat`.

- [ ] **Step 1 — Lire** le bloc exact `itinerary_details` (stages + niveau itinéraire) pour insérer proprement.
- [ ] **Step 2 — Stages** : dans le `jsonb_agg` des stages, ajouter `'lng', ST_X(st.geom::geometry)` et `'lat', ST_Y(st.geom::geometry)` (NULL si geom NULL).
- [ ] **Step 3 — Tracé** : ajouter `'track_geojson', (SELECT ST_AsGeoJSON(i.geom)::jsonb FROM object_iti i WHERE i.object_id = obj.id)` dans `itinerary_details` (NULL si pas de geom). Réutiliser `get_itinerary_track_geojson` si sa forme convient (vérifier).
- [ ] **Step 4 — Test** round-trip : après `set_itinerary_track`, `get_object_resource.itinerary_details.track_geojson` non NULL ; après stage avec point, `stages[0].lng/lat` corrects.
- [ ] **Step 5 — Appliquer live + `NOTIFY pgrst, 'reload schema'`**, fold, manifeste, commit `feat(iti): expose trace geojson + stage coordinates in get_object_resource`.

---

### Task A5: Libs front (préparation B/C)

**Files:**
- Modify: `bertel-tourism-ui/package.json`

- [ ] **Step 1** : `npm i @tmcw/togeojson @turf/point-to-line-distance @turf/nearest-point-on-line @turf/buffer @turf/helpers` (depuis `bertel-tourism-ui/`).
- [ ] **Step 2** : `npx tsc --noEmit` clean ; build inchangé.
- [ ] **Step 3 — Commit** `chore(iti): add gpx/kml parser + turf geo utils for Section 06`.

---

## Self-Review

- **Couverture spec §3 Phase A** : A1 seeds ✓, A2 set_itinerary_track ✓, A3 stage geom ✓, A4 lecture ✓, A5 libs ✓.
- **Placeholders** : aucun (SQL réel inline ; étapes de vérif live explicites).
- **Cohérence types** : `set_itinerary_track(text,jsonb)` ; payload `{geojson}` ; stage payload `{lng,lat,extra.kind}` cohérent A3↔C2 ; clé lecture `track_geojson` + `stages[].lng/lat` cohérente A4↔C.
- **Risque PostGIS schema** : tracé via search_path `…, extensions` ; vérif live de `pg_extension` avant apply (Global Constraints).
- **Risque copie RPC** : A3 step 4 grep de doublons.
