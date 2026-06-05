-- migration_ref_commune.sql
-- §41 (T1b zones). Seed the commune reference that backs object_zone authoring.
--
-- Adds public.ref_commune (the 24 communes of La Réunion, INSEE COG codes 97401-97424)
-- with the standard ref_* pub-read / admin-write RLS pair, and a FK
-- object_zone.insee_commune -> ref_commune.insee_code. The §16 editor "communes
-- desservies" multi-select reads this catalog (public read) and persists object_zone
-- via api.save_object_places (zones-only payload).
--
-- GREENFIELD-SAFE FK: object_zone had 0 rows on live (verified 2026-06-05), so the FK
-- adds without violating any existing row; a fresh DB has object_zone empty at this step.
--
-- PREREQUISITES: schema_unified.sql (object_zone); rls_policies.sql (api.is_platform_superuser).
--   APPLY AFTER rls_policies.sql -- manifest step 8l (ci_fresh_apply.sql).
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS; seed ON CONFLICT DO UPDATE; DROP POLICY IF EXISTS
--   + CREATE; FK drop-if-exists then add. Re-runnable; no-op on a DB that already has it.
-- REVERSIBLE: ALTER TABLE object_zone DROP CONSTRAINT object_zone_insee_commune_fkey;
--   DROP TABLE public.ref_commune;

BEGIN;

CREATE TABLE IF NOT EXISTS public.ref_commune (
  insee_code  VARCHAR(5)  PRIMARY KEY,
  name        TEXT        NOT NULL,
  region_code VARCHAR(3)  NOT NULL DEFAULT 'RE',
  position    INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true
);

COMMENT ON TABLE public.ref_commune IS
  'Commune reference (INSEE code). Seeded with the 24 communes of La Reunion (region RE). Source for object_zone authoring (lot1_mapping_decisions.md §41).';

-- Seed BEFORE enabling RLS (so the seed is not gated). The 24 communes of La Reunion,
-- INSEE COG codes 97401-97424 (authoritative; cross-checked vs object_location.city:
-- Le Tampon=97422, Saint-Joseph=97412, Entre-Deux=97403, Saint-Philippe=97417).
INSERT INTO public.ref_commune (insee_code, name, region_code, position) VALUES
  ('97401', 'Les Avirons',             'RE',  1),
  ('97402', 'Bras-Panon',              'RE',  2),
  ('97403', 'Entre-Deux',              'RE',  3),
  ('97404', 'L''Étang-Salé',           'RE',  4),
  ('97405', 'Petite-Île',              'RE',  5),
  ('97406', 'La Plaine-des-Palmistes', 'RE',  6),
  ('97407', 'Le Port',                 'RE',  7),
  ('97408', 'La Possession',           'RE',  8),
  ('97409', 'Saint-André',             'RE',  9),
  ('97410', 'Saint-Benoît',            'RE', 10),
  ('97411', 'Saint-Denis',             'RE', 11),
  ('97412', 'Saint-Joseph',            'RE', 12),
  ('97413', 'Saint-Leu',               'RE', 13),
  ('97414', 'Saint-Louis',             'RE', 14),
  ('97415', 'Saint-Paul',              'RE', 15),
  ('97416', 'Saint-Pierre',            'RE', 16),
  ('97417', 'Saint-Philippe',          'RE', 17),
  ('97418', 'Sainte-Marie',            'RE', 18),
  ('97419', 'Sainte-Rose',             'RE', 19),
  ('97420', 'Sainte-Suzanne',          'RE', 20),
  ('97421', 'Salazie',                 'RE', 21),
  ('97422', 'Le Tampon',               'RE', 22),
  ('97423', 'Les Trois-Bassins',       'RE', 23),
  ('97424', 'Cilaos',                  'RE', 24)
ON CONFLICT (insee_code) DO UPDATE
  SET name = EXCLUDED.name,
      region_code = EXCLUDED.region_code,
      position = EXCLUDED.position,
      is_active = true;

-- RLS: public read + admin/superuser write (mirrors the ref_* pair in rls_policies.sql / §27).
-- auth.role() wrapped as (select …) per the §39 initplan invariant. The USING(true) read policy
-- short-circuits the permissive OR, so anon SELECT never evaluates the admin predicate
-- (no P0.3 EXECUTE-grant needed on api.is_platform_superuser).
ALTER TABLE public.ref_commune ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_commune_read" ON public.ref_commune;
CREATE POLICY "pub_ref_commune_read" ON public.ref_commune
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_commune" ON public.ref_commune;
CREATE POLICY "admin_write_ref_commune" ON public.ref_commune
  FOR ALL USING (
    (select auth.role()) = 'service_role'
    OR (select auth.role()) = 'admin'
    OR api.is_platform_superuser()
  );

-- FK: a zone's commune must be a known commune. Greenfield-safe (object_zone empty).
ALTER TABLE public.object_zone DROP CONSTRAINT IF EXISTS object_zone_insee_commune_fkey;
ALTER TABLE public.object_zone
  ADD CONSTRAINT object_zone_insee_commune_fkey
  FOREIGN KEY (insee_commune) REFERENCES public.ref_commune(insee_code);

COMMIT;
