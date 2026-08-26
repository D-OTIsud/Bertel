# Administration générée des catalogues de référence — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** donner une surface d'administration à **tous** les catalogues de référence du projet (**103** : 71 domaines de `ref_code` et 32 tables `public.ref_*` autonomes), générée depuis le catalogue PostgreSQL plutôt qu'écrite catalogue par catalogue.

**Architecture:** une vue d'introspection `internal.v_ref_catalog` découvre les catalogues et leur forme ; une table `ref_catalog_registry` porte l'éditorial (nom lisible, famille, verrouillage motivé) ; cinq RPC `SECURITY DEFINER` gated super-admin lisent, écrivent, suppriment et réordonnent. L'écriture est du SQL dynamique dont **la liste blanche est la vue, jamais le registre**. Les domaines de `ref_code` délèguent aux quatre fonctions éprouvées de la phase 7.5.

**Tech Stack:** PostgreSQL 17 / Supabase (PL/pgSQL, `format(%I)`, `EXECUTE … USING`), PostgREST, Next.js 15 + React 19 + TanStack Query, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-07-admin-catalogues-reference-design.md`.

## Global Constraints

- **Numéro de décision : §211.** §209 et §210 sont pris. Re-grepper `^## §` dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` avant de figer le numéro.
- **Étape de manifeste : `16w`**, à déclarer dans `docs/SQL_ROLLOUT_RUNBOOK.md` ET dans `Base de donnée DLL et API/ci_fresh_apply.sql`. Sans cela la migration est une dérive PROD-only, traitée comme un incident (CLAUDE.md, « Deploy integrity »).
- **`REVOKE ALL ON FUNCTION … FROM PUBLIC`** sur chaque fonction neuve — PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut et un `GRANT` ciblé ne le retire pas.
- **`SET search_path = pg_catalog, public, api, internal`**, donc `gen_random_uuid()` et jamais `uuid_generate_v4()`.
- **Garde fail-closed : `IF api.is_platform_superuser() IS NOT TRUE THEN RAISE`** — `IS NOT TRUE`, pas `NOT` : la fonction rend `NULL` hors contexte HTTP.
- **Identité d'une ligne = `p_key jsonb`.** 10 des 32 tables sortent du moule `uuid` simple : `ref_commune` a une PK `varchar(5)`, cinq matrices sont composites, `ref_code_taxonomy_closure` a trois colonnes, `ref_facet_registry` et `ref_code_domain_registry` ont une PK `text`, et **`ref_interop_crosswalk` n'a aucune clé primaire**.
- **`usage` n'existe que pour les catalogues à clé SIMPLE** (une matrice n'est référencée par personne), et sa clé y est la **valeur de la clé primaire en texte**, écrite à l'identique par le serveur et par `rowKeyString`. Ce n'est délibérément PAS du JSON sérialisé : `jsonb::text` rend `{"id": "x"}` (avec une espace) là où `JSON.stringify` rend `{"id":"x"}`, et les deux ne se rejoindraient jamais. Si un jour `usage` couvre les clés composites, ne pas joindre par un séparateur — `U+001F` peut exister dans une clé textuelle — mais préfixer chaque segment de sa longueur.
- **Tout appel aux RPC de la phase 7.5 se fait en arguments NOMMÉS.** La signature est `api.rpc_upsert_ref_code(p_domain, p_name, p_id, p_code, p_name_i18n, p_position)` — `p_name` **avant** `p_code`. Un appel positionnel inversé écrit le code dans le libellé **sans lever d'erreur SQL**.
- **Aucune assertion de test en `>=` sur un compte de catalogues**, aucune assertion satisfaite par un ensemble non vide, aucune assertion qui ne fasse pas tourner le code testé.
- Le SQL vit dans `Base de donnée DLL et API/` (espaces dans le chemin : guillemets obligatoires en shell). Front depuis `bertel-tourism-ui/` : `npx tsc --noEmit -p tsconfig.json`, `npx jest <chemin>`.
- Commits conventional, **sans** ligne `Co-Authored-By`.

---

## Structure des fichiers

**Créés — SQL**

| Fichier | Responsabilité |
|---|---|
| `Base de donnée DLL et API/migration_ref_catalog_admin.sql` | vue, registre, seed, helpers dérivés, 5 RPC. **Non foldé** dans `schema_unified.sql` (dépend de `api.is_platform_superuser` de `rls_policies.sql`) ⇒ étape `16w`. |
| `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql` | garde CI permanente. |

**Créés — front**

| Fichier | Responsabilité |
|---|---|
| `bertel-tourism-ui/src/features/settings/catalog-fields.ts` | **pur** : colonne → contrôle, identité de ligne, libellé de secours, blocage d'ajout. Zéro import React. |
| `bertel-tourism-ui/src/features/settings/catalog-fields.test.ts` | tests de la partie pure. |
| `bertel-tourism-ui/src/services/ref-catalogs.ts` | appels aux 5 RPC + normalisation + `groupByFamily`. |
| `bertel-tourism-ui/src/services/ref-catalogs.test.ts` | tests du service. |
| `bertel-tourism-ui/src/views/RefCatalogAdmin.tsx` | l'écran maître/détail. |
| `bertel-tourism-ui/src/views/RefCatalogRowModal.tsx` | la modale d'édition d'une ligne (extraite : l'écran resterait sinon au-delà de 400 lignes). |
| `bertel-tourism-ui/src/views/RefCatalogAdmin.test.tsx` | rendu + mutations. |

**Modifiés** : `ci_fresh_apply.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`, `src/views/SettingsPage.tsx:786`. **Supprimé** : `src/views/RefCodeEditor.tsx` (absorbé). `src/services/ref-codes.ts` et `src/views/ref-code-reorder.ts` restent — `moveItem` sert au réordonnancement.

---

### Task 1: Vue d'introspection `internal.v_ref_catalog`

**Files:**
- Create: `Base de donnée DLL et API/migration_ref_catalog_admin.sql`
- Create: `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql`

**Interfaces:**
- Produces: `internal.v_ref_catalog(kind text, catalog_key text, table_name text, domain text, columns jsonb, primary_key_columns jsonb, is_identifiable boolean, outgoing_fk jsonb, incoming_fk jsonb)`.

**Trois pièges de cette vue, tous silencieux :**

1. **Les domaines `ref_code` n'ont pas de `reloid`.** Sans synthèse explicite, `columns` vaut `[]`, `primary_key_columns` vaut `[]` et `is_identifiable` vaut `false` — ce qui, combiné au helper d'accès de la tâche 3, **verrouille les 71 domaines** et n'affiche aucun champ de saisie. C'est le défaut le plus coûteux de tout ce chantier : il ne lève aucune erreur, l'écran est simplement inerte.
2. **Le tri « est-ce une partition » doit passer par `pg_inherits`**, pas par le nom : `ref_code_domain_registry` et `ref_code_taxonomy_closure` portent le préfixe `ref_code_` sans être des partitions.
3. **Les cibles de clé étrangère doivent être normalisées en `catalog_key`.** `ref_amenity.family_id` pointe vers `ref_code_amenity_family`, une partition **absente de la vue** : rendue telle quelle, la liste déroulante interrogerait un catalogue inexistant. La cible attendue est `ref_code:amenity_family`.

- [ ] **Step 1: Écrire le test qui échoue**

```sql
-- test_ref_catalog_admin.sql
-- Garde permanente §211 — administration générée des catalogues de référence.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_n integer; v_cols jsonb;
BEGIN
  -- Compte EXACT, calculé : un « >= 80 » masquerait la disparition de vingt catalogues.
  SELECT count(*) INTO v_n FROM internal.v_ref_catalog;
  ASSERT v_n = (
      (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ref\_%'
         AND c.relname <> 'ref_code'
         AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid))
    + (SELECT count(DISTINCT domain) FROM public.ref_code)),
    format('une entrée par table et par domaine ; obtenu %s', v_n);

  -- ref_code et ses partitions ne sont pas des catalogues autonomes…
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code'),
         'ref_code est servi domaine par domaine, pas comme table';
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_media_type'),
         'les partitions de ref_code ne sont pas des catalogues autonomes';
  -- … mais ces deux-là en sont, malgré leur préfixe : c'est pg_inherits qui tranche, pas le nom.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_domain_registry'),
         'ref_code_domain_registry porte le préfixe sans être une partition';
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_taxonomy_closure'),
         'ref_code_taxonomy_closure porte le préfixe sans être une partition';

  -- LE PIÈGE : un domaine DOIT être identifiable et décrit, sinon il est verrouillé en silence.
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type'),
         'un domaine ref_code doit être identifiable : sinon le helper d''accès le verrouille';
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_code:cuisine_type') = 'id',
         'un domaine ref_code s''identifie par ref_code.id';
  ASSERT jsonb_array_length(
           (SELECT columns FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type')) = 5,
         'un domaine ref_code doit porter la forme éditable synthétisée de ref_code';

  -- Formes de clé primaire réelles.
  ASSERT jsonb_array_length((SELECT primary_key_columns FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_capacity_applicability')) = 2,
         'une PK composite doit être décrite en entier';
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_commune') = 'insee_code',
         'ref_commune s''identifie par insee_code, pas par un uuid';
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_interop_crosswalk') = false,
         'une relation sans clé primaire doit être marquée non identifiable';

  -- Description des colonnes d'une table.
  SELECT columns INTO v_cols FROM internal.v_ref_catalog WHERE catalog_key = 'ref_legal_type';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) c
                 WHERE c->>'name' = 'review_interval_days' AND c->>'type' = 'integer'),
         'le type PostgreSQL doit remonter tel quel (il sert au cast du SQL dynamique)';

  -- Cible de FK NORMALISÉE en catalog_key, pas en nom de partition.
  ASSERT (SELECT f->>'target' FROM internal.v_ref_catalog v, jsonb_array_elements(v.outgoing_fk) f
          WHERE v.catalog_key = 'ref_amenity' AND f->>'column' = 'family_id')
         = 'ref_code:amenity_family',
         'une FK vers une partition de ref_code doit être normalisée en ref_code:<domaine>, '
         'sinon la liste déroulante interroge un catalogue qui n''existe pas';

  -- FK entrantes : elles portent le compteur d'usage.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog v, jsonb_array_elements(v.incoming_fk) f
                 WHERE v.catalog_key = 'ref_legal_type' AND f->>'table' = 'object_legal'),
         'object_legal référence ref_legal_type : la FK entrante doit être découverte';

  RAISE NOTICE 'v_ref_catalog assertions passed';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `ERROR: relation "internal.v_ref_catalog" does not exist`.

- [ ] **Step 3: Écrire la vue**

```sql
-- ============================================================================
-- migration_ref_catalog_admin.sql — §211 Administration générée des catalogues
--
-- Spec : docs/superpowers/specs/2026-08-07-admin-catalogues-reference-design.md
--
-- DEUX SOURCES, UNE LISTE. internal.v_ref_catalog DÉCOUVRE (zéro configuration) ;
-- ref_catalog_registry porte l'ÉDITORIAL (nom lisible, famille, verrouillage motivé).
--
-- INVARIANT DE SÉCURITÉ : la liste blanche du RPC d'écriture est la VUE, jamais le
-- registre. Un registre vide laisse le système fonctionnel (dégradé) ; un registre
-- corrompu ne peut PAS ouvrir une écriture hors public.ref_*. Inverser les deux
-- transformerait une erreur de seed en élargissement de privilège.
--
-- Manifeste 16w. NON foldé dans schema_unified.sql. Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW internal.v_ref_catalog AS
WITH cat AS (
  -- Espèce 'table' : relation ordinaire public.ref_* qui n'est PAS une partition.
  -- Le test pg_inherits est ce qui écarte les 55 partitions ref_code_<domain> TOUT EN
  -- GARDANT ref_code_domain_registry et ref_code_taxonomy_closure, qui portent le même
  -- préfixe sans être des partitions. Un filtre par nom les perdrait en silence.
  SELECT 'table'::text AS kind, c.relname::text AS catalog_key,
         c.relname::text AS table_name, NULL::text AS domain, c.oid AS reloid
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname LIKE 'ref\_%' AND c.relname <> 'ref_code'
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  UNION ALL
  SELECT 'ref_code_domain'::text, 'ref_code:' || d.domain, 'ref_code'::text, d.domain, NULL::oid
  FROM (SELECT DISTINCT domain FROM public.ref_code) d
)
SELECT
  cat.kind, cat.catalog_key, cat.table_name, cat.domain,

  -- Un domaine n'est PAS une relation : reloid est NULL et pg_attribute ne rendrait rien.
  -- On synthétise la forme ÉDITABLE de ref_code (celle que la phase 7.5 sait écrire).
  CASE WHEN cat.kind = 'ref_code_domain' THEN
    '[{"name":"id","type":"uuid","is_required":true,"has_default":true,"position":1,"enum_values":null},
      {"name":"code","type":"text","is_required":true,"has_default":false,"position":2,"enum_values":null},
      {"name":"name","type":"text","is_required":true,"has_default":false,"position":3,"enum_values":null},
      {"name":"name_i18n","type":"jsonb","is_required":false,"has_default":true,"position":4,"enum_values":null},
      {"name":"position","type":"integer","is_required":false,"has_default":true,"position":5,"enum_values":null},
      {"name":"is_active","type":"boolean","is_required":false,"has_default":true,"position":6,"enum_values":null}]'::jsonb
  ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'name', a.attname,
             'type', format_type(a.atttypid, a.atttypmod),
             'is_required', a.attnotnull,
             'has_default', (a.atthasdef OR a.attidentity <> ''),
             'position', a.attnum,
             'enum_values', CASE WHEN t.typtype = 'e' THEN (
                              SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                              FROM pg_enum e WHERE e.enumtypid = t.oid)
                            ELSE NULL END) ORDER BY a.attnum)
    FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = cat.reloid AND a.attnum > 0 AND NOT a.attisdropped
  ), '[]'::jsonb) END AS columns,

  -- SYNTHÈSE OBLIGATOIRE pour les domaines : sans elle, primary_key_columns vaut [] et
  -- is_identifiable vaut false, donc le helper d'accès de la tâche 3 verrouille les
  -- 71 domaines SANS AUCUNE ERREUR. C'est le défaut le plus silencieux de ce chantier.
  CASE WHEN cat.kind = 'ref_code_domain'
    THEN '[{"name":"id","type":"uuid"}]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) ORDER BY x.ord)
      FROM pg_constraint k
      CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS x(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = x.attnum
      WHERE k.conrelid = cat.reloid AND k.contype = 'p'
    ), '[]'::jsonb) END AS primary_key_columns,

  CASE WHEN cat.kind = 'ref_code_domain' THEN true
       ELSE EXISTS (SELECT 1 FROM pg_constraint k
                    WHERE k.conrelid = cat.reloid AND k.contype = 'p') END AS is_identifiable,

  -- Cible NORMALISÉE en catalog_key : une FK vers une partition de ref_code doit rendre
  -- 'ref_code:<domaine>', sinon le front interroge un catalogue absent de la vue.
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'column', a.attname,
             'target', CASE
               WHEN EXISTS (SELECT 1 FROM pg_inherits i
                            WHERE i.inhrelid = pt.oid AND i.inhparent = 'public.ref_code'::regclass)
                 THEN 'ref_code:' || substring(pt.relname from 10)
               ELSE pt.relname END))
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    JOIN pg_class pt ON pt.oid = k.confrelid
    WHERE k.conrelid = cat.reloid AND k.contype = 'f' AND array_length(k.conkey, 1) = 1
  ), '[]'::jsonb) AS outgoing_fk,

  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('table', ct.relname, 'column', a.attname))
    FROM pg_constraint k
    JOIN pg_class ct ON ct.oid = k.conrelid
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.confrelid = cat.reloid AND k.contype = 'f' AND array_length(k.conkey, 1) = 1
  ), '[]'::jsonb) AS incoming_fk
FROM cat;

COMMENT ON VIEW internal.v_ref_catalog IS
'§211 — découverte automatique des catalogues de référence et de leur forme. Liste blanche des RPC d''écriture : une relation absente d''ici n''est PAS écrivable.';

COMMIT;
```

- [ ] **Step 4: Appliquer et relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: v_ref_catalog assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(211): vue d'introspection des catalogues de reference

Decouvre les 32 tables ref_* autonomes et les 71 domaines de ref_code.
Trois pieges fermes explicitement : les domaines recoivent une forme et une cle
primaire SYNTHETISEES (sans quoi ils seraient tous non identifiables donc
verrouilles, en silence) ; le tri des partitions passe par pg_inherits et non
par le nom ; les cibles de FK vers une partition de ref_code sont normalisees
en ref_code:<domaine>."
```

---

### Task 2: Registre éditorial `ref_catalog_registry` + seed

**Files:** Modify `migration_ref_catalog_admin.sql` (avant `COMMIT`) et `tests/test_ref_catalog_admin.sql`.

**Interfaces:**
- Produces: `public.ref_catalog_registry(catalog_key text PK, label text, family text, used_in text, label_column text, access text, readonly_reason text, position integer)`.

> **Le registre ne seede QUE les verrouillages métier.** Les verrouillages *structurels* — relation sans clé primaire, domaine `ref_code` non éditable — sont **dérivés** par les helpers de la tâche 3 et n'ont aucune ligne ici : une future table sans PK ne peut donc pas passer entre les mailles d'un seed qu'on aurait oublié de mettre à jour.

- [ ] **Step 1: Écrire le test qui échoue**

```sql
DO $$
BEGIN
  -- Un verrouillage sans motif est refusé : un écran qui dit « lecture seule » sans
  -- dire pourquoi transforme une décision en mystère.
  BEGIN
    INSERT INTO ref_catalog_registry (catalog_key, label, family, access)
    VALUES ('ref_legal_type', 'Test', 'Juridique', 'readonly');
    RAISE EXCEPTION 'GARDE VACANTE : access=readonly sans readonly_reason accepté';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  ASSERT (SELECT access FROM ref_catalog_registry WHERE catalog_key = 'ref_permission') = 'readonly',
         'ref_permission : ses codes sont lus en dur par le contrôle d''accès';
  ASSERT (SELECT length(readonly_reason) FROM ref_catalog_registry
          WHERE catalog_key = 'ref_permission') > 20,
         'le motif doit être une phrase affichable, pas un mot';

  -- Les verrouillages DÉRIVÉS ne doivent PAS être seedés : les dupliquer ferait croire
  -- que le seed est la garde, et un oubli deviendrait une ouverture.
  ASSERT NOT EXISTS (SELECT 1 FROM ref_catalog_registry WHERE catalog_key = 'ref_interop_crosswalk'),
         'sans clé primaire = verrouillage DÉRIVÉ, pas une ligne de registre';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_catalog_registry WHERE catalog_key LIKE 'ref_code:taxonomy%'),
         'domaine non éditable = verrouillage DÉRIVÉ via api.ref_code_domain_is_editable';

  -- Le registre ne référence QUE des catalogues réels.
  ASSERT NOT EXISTS (
    SELECT 1 FROM ref_catalog_registry r
    WHERE NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog v WHERE v.catalog_key = r.catalog_key)),
    'le registre contient une clé qui ne correspond à aucun catalogue découvert';

  RAISE NOTICE 'ref_catalog_registry assertions passed';
END$$;
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `ERROR: relation "ref_catalog_registry" does not exist`.

- [ ] **Step 3: Créer la table, la policy et le seed**

```sql
CREATE TABLE IF NOT EXISTS public.ref_catalog_registry (
  catalog_key     text PRIMARY KEY,
  label           text NOT NULL,
  family          text NOT NULL,
  used_in         text,
  label_column    text,
  access          text NOT NULL DEFAULT 'editable',
  readonly_reason text,
  position        integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ref_catalog_access CHECK (access IN ('editable', 'readonly')),
  CONSTRAINT chk_ref_catalog_readonly_reason
    CHECK (access <> 'readonly' OR NULLIF(TRIM(readonly_reason), '') IS NOT NULL)
);

ALTER TABLE public.ref_catalog_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pub_ref_catalog_registry_read ON public.ref_catalog_registry;
CREATE POLICY pub_ref_catalog_registry_read ON public.ref_catalog_registry
  FOR SELECT USING (true);

DROP POLICY IF EXISTS admin_ref_catalog_registry_write ON public.ref_catalog_registry;
CREATE POLICY admin_ref_catalog_registry_write ON public.ref_catalog_registry
  FOR ALL USING ((SELECT api.is_platform_superuser()) IS TRUE)
           WITH CHECK ((SELECT api.is_platform_superuser()) IS TRUE);

GRANT SELECT ON public.ref_catalog_registry TO anon, authenticated;

DROP TRIGGER IF EXISTS update_ref_catalog_registry_updated_at ON public.ref_catalog_registry;
CREATE TRIGGER update_ref_catalog_registry_updated_at
  BEFORE UPDATE ON public.ref_catalog_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verrouillages MÉTIER uniquement. Les verrouillages structurels sont dérivés (tâche 3).
INSERT INTO public.ref_catalog_registry (catalog_key, label, family, used_in, access, readonly_reason) VALUES
  ('ref_permission', 'Permissions', 'Personnes et organisations', 'Administration de l''équipe', 'readonly',
   'Chaque code est lu en dur par le contrôle d''accès : en retirer un ferme des droits sans qu''aucun test ne rougisse.'),
  ('ref_facet_registry', 'Registre des facettes par type', 'Structure', NULL, 'readonly',
   'Source de vérité du trigger trg_assert_facet_applicable : la modifier ici ferait diverger l''écran et la contrainte en base.'),
  ('ref_facet_applicability', 'Applicabilité type → facette', 'Structure', NULL, 'readonly',
   'Source de vérité du trigger trg_assert_facet_applicable : la modifier ici ferait diverger l''écran et la contrainte en base.'),
  ('ref_code_domain_registry', 'Registre des domaines ref_code', 'Structure', NULL, 'readonly',
   'Décrit les domaines eux-mêmes (taxonomie, hiérarchie, type d''objet couplé) : se modifie par migration.'),
  ('ref_code_taxonomy_closure', 'Closure des taxonomies', 'Structure', NULL, 'readonly',
   'Table de fermeture reconstruite par trigger depuis parent_id : toute écriture manuelle serait écrasée.'),
  ('ref_document', 'Documents déposés', 'Juridique et conformité', '§08 Classements, §18 Juridique', 'readonly',
   'Ce ne sont pas des valeurs de vocabulaire mais les fichiers déposés par les rédacteurs.')
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family, used_in = EXCLUDED.used_in,
  access = EXCLUDED.access, readonly_reason = EXCLUDED.readonly_reason, updated_at = now();

-- Surcharge de libellé : ref_sustainability_action porte `label` (pas `name`, pas `title`).
-- La cascade de la tâche 3 la trouverait seule ; la ligne existe pour le nom lisible.
INSERT INTO public.ref_catalog_registry (catalog_key, label, family) VALUES
  ('ref_sustainability_action', 'Actions de durabilité', 'Labels, classements, durabilité')
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family, updated_at = now();
```

- [ ] **Step 4: Appliquer et relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: ref_catalog_registry assertions passed`.

- [ ] **Step 5: Compléter le seed des familles**

Ajouter un `INSERT … ON CONFLICT DO UPDATE` couvrant les 13 familles de l'annexe A de la spec (nom lisible + famille + `used_in`), pour les tables **et** pour les 52 domaines plats (`ref_code:<domaine>`). Tout catalogue non listé reste dans « À classer » par construction.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(211): registre editorial des catalogues + seed des verrouillages metier

CHECK : un access=readonly sans readonly_reason est refuse. Les verrouillages
STRUCTURELS (relation sans cle primaire, domaine ref_code non editable) ne sont
PAS seedes : ils sont derives, donc une future table sans PK ne peut pas passer
entre les mailles d'un seed oublie. Le test l'asserte."
```

---

### Task 3: RPC de lecture + helpers dérivés

**Files:** Modify `migration_ref_catalog_admin.sql` et `tests/test_ref_catalog_admin.sql`.

**Interfaces:**
- Produces:
  - `internal.ref_catalog_label_column(text) → text` — cascade `label_column` du registre → `name`/`label`/`title`/`libelle` → `code` → `NULL` (matrices : le libellé se compose côté front).
  - `internal.ref_catalog_access(text) → text` et `internal.ref_catalog_readonly_reason(text) → text` — verrouillages **dérivés d'abord**, registre ensuite.
  - `api.list_ref_catalogs() → jsonb` : `[{catalog_key, kind, label, family, used_in, access, readonly_reason, n_values}]`.
  - `api.get_ref_catalog(text) → jsonb` : `{catalog_key, kind, label, family, used_in, access, readonly_reason, is_identifiable, primary_key_columns[], label_column, columns[], outgoing_fk[], rows[], usage}`.

> **Le maître et le détail doivent lire le MÊME accès.** Si `list_ref_catalogs` rend `COALESCE(r.access,'editable')` pendant que `get_ref_catalog` passe par le helper dérivé, une table sans clé primaire s'affiche éditable dans la liste puis verrouillée à l'ouverture. Les deux appellent les helpers.

> **`usage` n'est calculé que pour les catalogues à clé SIMPLE**, et sa clé y est la valeur de la clé primaire en texte — la même que `rowKeyString` côté front. Les matrices n'ont pas de compteur : rien ne les référence.

- [ ] **Step 1: Écrire les tests qui échouent**

```sql
DO $$
DECLARE v_list jsonb; v_cat jsonb; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_list := api.list_ref_catalogs();
  ASSERT jsonb_array_length(v_list) = (SELECT count(*) FROM internal.v_ref_catalog),
         'le maître doit lister TOUS les catalogues découverts';

  -- Le maître et le détail ne doivent JAMAIS diverger sur l'accès.
  FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
    ASSERT (SELECT c->>'access' FROM jsonb_array_elements(v_list) c
            WHERE c->>'catalog_key' = r.catalog_key)
           = (api.get_ref_catalog(r.catalog_key)->>'access'),
           format('accès divergent entre maître et détail sur %s', r.catalog_key);
  END LOOP;

  -- LE PIÈGE : un domaine plat doit être ÉDITABLE.
  ASSERT api.get_ref_catalog('ref_code:cuisine_type')->>'access' = 'editable',
         'un domaine ref_code plat doit rester éditable — is_identifiable synthétisé';
  -- … et un domaine structurel verrouillé PAR DÉRIVATION.
  ASSERT api.get_ref_catalog('ref_code:taxonomy_hlo')->>'access' = 'readonly',
         'un domaine non éditable selon api.ref_code_domain_is_editable est verrouillé';
  ASSERT api.get_ref_catalog('ref_interop_crosswalk')->>'access' = 'readonly',
         'une relation sans clé primaire est verrouillée d''office';

  -- outgoing_fk émis ET normalisé : sans lui, saisie d'UUID à la main.
  ASSERT (SELECT f->>'target'
          FROM jsonb_array_elements(api.get_ref_catalog('ref_amenity')->'outgoing_fk') f
          WHERE f->>'column' = 'family_id') = 'ref_code:amenity_family',
         'la cible de FK doit être un catalog_key exploitable par le front';

  -- Cascade de libellé.
  ASSERT api.get_ref_catalog('ref_sustainability_action')->>'label_column' = 'label',
         'la cascade doit trouver `label` quand `name` est absente';
  ASSERT api.get_ref_catalog('ref_capacity_applicability')->>'label_column' IS NULL,
         'une matrice n''a pas de colonne de libellé : le front compose depuis la clé';

  -- BALAYAGE EXHAUSTIF : chaque catalogue doit se décrire sans erreur.
  FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
    BEGIN
      PERFORM api.get_ref_catalog(r.catalog_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'get_ref_catalog casse sur % : % (%)', r.catalog_key, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  v_cat := api.get_ref_catalog('ref_legal_type');
  ASSERT jsonb_array_length(v_cat->'rows') = 20,
         format('ref_legal_type porte 20 valeurs ; obtenu %s', jsonb_array_length(v_cat->'rows'));

  RAISE NOTICE 'lecture assertions passed';
END$$;

-- Compteur d'usage : NON VACANT, et sur DEUX tables consommatrices DISTINCTES.
-- ref_language est référencée par object_language ET object_review : c'est la FUSION
-- entre deux FK entrantes qu'on teste ici, pas deux lignes dans la même table.
DO $$
DECLARE
  v_lang uuid; v_key text; v_before bigint; v_after bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO v_lang FROM ref_language WHERE code = 'fr';
  v_key := v_lang::text;

  v_before := COALESCE((api.get_ref_catalog('ref_language')->'usage'->>v_key)::bigint, 0);

  INSERT INTO object (id, object_type, name, status)
    VALUES ('CATMFK9999999901', 'HLO', 'Témoin multi-FK', 'draft');
  INSERT INTO object_language (object_id, language_id) VALUES ('CATMFK9999999901', v_lang);
  INSERT INTO object_review (object_id, language_id, rating)
    VALUES ('CATMFK9999999901', v_lang, 5);

  v_after := COALESCE((api.get_ref_catalog('ref_language')->'usage'->>v_key)::bigint, 0);

  ASSERT v_after = v_before + 2,
         format('le compteur doit FUSIONNER deux FK entrantes distinctes ; avant %s, après %s',
                v_before, v_after);

  RAISE NOTICE 'compteur multi-FK assertion passed';
END$$;
```

> Vérifier les colonnes obligatoires de `object_review` avant d'écrire l'INSERT témoin (le schéma peut exiger davantage que `rating`) ; adapter sans changer l'intention : deux tables **différentes** référençant la même valeur.

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `ERROR: function api.list_ref_catalogs() does not exist`.

- [ ] **Step 3: Écrire les helpers dérivés**

```sql
-- Cascade de libellé. Une déclaration par table serait la RÈGLE et non l'exception
-- (12 des 32 tables n'ont pas de `name`), et chaque oubli produirait une ligne muette.
-- Rend NULL pour les matrices : leur libellé se compose depuis la clé, côté front.
CREATE OR REPLACE FUNCTION internal.ref_catalog_label_column(p_catalog_key text)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public, internal
AS $$
  SELECT COALESCE(
    (SELECT r.label_column FROM public.ref_catalog_registry r
     WHERE r.catalog_key = p_catalog_key AND NULLIF(TRIM(r.label_column), '') IS NOT NULL),
    (SELECT c->>'name' FROM internal.v_ref_catalog v, jsonb_array_elements(v.columns) c
     WHERE v.catalog_key = p_catalog_key
       AND c->>'name' = ANY (ARRAY['name','label','title','libelle'])
     ORDER BY array_position(ARRAY['name','label','title','libelle'], c->>'name') LIMIT 1),
    (SELECT 'code' FROM internal.v_ref_catalog v, jsonb_array_elements(v.columns) c
     WHERE v.catalog_key = p_catalog_key AND c->>'name' = 'code' LIMIT 1));
$$;

-- Accès EFFECTIF : DÉRIVÉ d'abord, registre ensuite. Les dérivés ne peuvent pas être
-- oubliés au seed. Consommé par le maître ET par le détail — sans quoi une table sans
-- clé primaire s'afficherait éditable dans la liste puis verrouillée à l'ouverture.
CREATE OR REPLACE FUNCTION internal.ref_catalog_access(p_catalog_key text)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, internal
AS $$
  SELECT CASE
    WHEN NOT v.is_identifiable THEN 'readonly'
    WHEN v.kind = 'ref_code_domain'
         AND api.ref_code_domain_is_editable(v.domain) IS NOT TRUE THEN 'readonly'
    ELSE COALESCE((SELECT r.access FROM public.ref_catalog_registry r
                   WHERE r.catalog_key = p_catalog_key), 'editable')
  END
  FROM internal.v_ref_catalog v WHERE v.catalog_key = p_catalog_key;
$$;

CREATE OR REPLACE FUNCTION internal.ref_catalog_readonly_reason(p_catalog_key text)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, internal
AS $$
  SELECT CASE
    WHEN NOT v.is_identifiable
      THEN 'Aucune clé primaire : une ligne n''y est pas identifiable.'
    WHEN v.kind = 'ref_code_domain' AND api.ref_code_domain_is_editable(v.domain) IS NOT TRUE
      THEN 'Domaine structurel (taxonomie, hiérarchie ou couplage à un type d''objet). S''édite par migration.'
    ELSE (SELECT r.readonly_reason FROM public.ref_catalog_registry r
          WHERE r.catalog_key = p_catalog_key AND r.access = 'readonly')
  END
  FROM internal.v_ref_catalog v WHERE v.catalog_key = p_catalog_key;
$$;

-- NOTE sur la CLÉ CANONIQUE d'une ligne. Le front et le serveur doivent l'écrire à
-- l'identique pour joindre `rows` et `usage`. Ce n'est délibérément PAS du JSON sérialisé :
-- jsonb::text rend {"id": "x"} (avec une espace) là où JSON.stringify rend {"id":"x"}, et
-- les deux ne se rejoindraient jamais. La règle est : joindre les valeurs de clé primaire,
-- dans l'ordre de primary_key_columns, par le séparateur d'unité U+001F. Or `usage` n'existe
-- que pour les catalogues à clé SIMPLE (une matrice n'est référencée par personne), donc la
-- clé s'y réduit à la valeur en texte — c'est ce qu'écrivent les requêtes ci-dessous.

-- Valeur castée au type découvert, réutilisée par l'INSERT, le SET et le WHERE.
-- Sans cast, (p_values->>'is_required') rend du texte et une colonne booléenne le refuse.
-- Le type vient de la VUE, jamais de l'appelant : un type fourni par le client serait une injection.
CREATE OR REPLACE FUNCTION internal.ref_catalog_cast_expr(p_columns jsonb, p_name text, p_src text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT format('(%s->>%L)::%s', p_src, p_name,
                COALESCE((SELECT c->>'type' FROM jsonb_array_elements(p_columns) c
                          WHERE c->>'name' = p_name), 'text'));
$$;

CREATE OR REPLACE FUNCTION internal.ref_catalog_row_count(p_table text)
RETURNS bigint LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, internal
AS $$
DECLARE v_n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog
                 WHERE table_name = p_table AND kind = 'table') THEN
    RETURN 0;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_n;
  RETURN v_n;
END $$;
```

- [ ] **Step 4: Écrire les deux RPC de lecture**

```sql
CREATE OR REPLACE FUNCTION api.list_ref_catalogs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE v_out jsonb;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'family', x->>'label'), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'catalog_key',     v.catalog_key,
      'kind',            v.kind,
      'label',           COALESCE(r.label, v.catalog_key),
      'family',          COALESCE(r.family, 'À classer'),
      'used_in',         r.used_in,
      -- Helpers DÉRIVÉS, comme le détail : sinon le maître et le détail divergent.
      'access',          internal.ref_catalog_access(v.catalog_key),
      'readonly_reason', internal.ref_catalog_readonly_reason(v.catalog_key),
      'n_values',        CASE WHEN v.kind = 'ref_code_domain'
                           THEN (SELECT count(*) FROM public.ref_code rc WHERE rc.domain = v.domain)
                           ELSE internal.ref_catalog_row_count(v.table_name) END
    ) AS x
    FROM internal.v_ref_catalog v
    LEFT JOIN public.ref_catalog_registry r ON r.catalog_key = v.catalog_key
  ) s;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION api.get_ref_catalog(p_catalog_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v      record;
  v_reg  record;
  v_rows jsonb := '[]'::jsonb;
  v_use  jsonb := '{}'::jsonb;
  v_part jsonb;
  f      record;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CATALOG: %', p_catalog_key USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_reg FROM public.ref_catalog_registry WHERE catalog_key = p_catalog_key;

  IF v.kind = 'ref_code_domain' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(rc) ORDER BY rc.position NULLS LAST, rc.name), '[]'::jsonb)
      INTO v_rows FROM public.ref_code rc WHERE rc.domain = v.domain;
    -- Comptage délégué à la phase 7.5 (balayage de catalogue déjà mesuré). Sa sortie est
    -- déjà indexée par ref_code.id, ce qui EST la clé canonique d'une clé primaire à une
    -- colonne : aucune re-clé n'est nécessaire.
    v_use := api.ref_code_usage_counts(v.domain);
  ELSE
    -- ORDER BY EXPLICITE. Sans lui, jsonb_agg rend l'ordre physique du heap : l'écran
    -- afficherait un ordre qui n'est pas celui de `position`, et les flèches
    -- monter/descendre enverraient une permutation fondée sur un ordre faux.
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY %s), ''[]''::jsonb) FROM public.%I t',
                   CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v.columns) c
                                     WHERE c->>'name' = 'position')
                     THEN 't.position NULLS LAST, ' ELSE '' END
                   || (SELECT string_agg(format('t.%I', k->>'name'), ', ')
                       FROM jsonb_array_elements(v.primary_key_columns) k),
                   v.table_name) INTO v_rows;

    -- Compteur : FUSION ADDITIVE de toutes les FK entrantes. L'écraser à chaque tour de
    -- boucle est l'erreur naturelle ici — d'où l'accumulateur v_use et la variable v_part.
    IF jsonb_array_length(v.primary_key_columns) = 1 THEN
      FOR f IN SELECT * FROM jsonb_to_recordset(v.incoming_fk) AS y(tbl text, col text) LOOP
        EXECUTE format(
          'SELECT COALESCE(jsonb_object_agg(k, n), ''{}''::jsonb) FROM ('
          '  SELECT x.%I::text AS k, count(*) AS n'
          '  FROM public.%I x WHERE x.%I IS NOT NULL GROUP BY 1) s',
          f.col, f.tbl, f.col)
          INTO v_part;
        SELECT COALESCE(jsonb_object_agg(key, total), '{}'::jsonb) INTO v_use
        FROM (SELECT key, SUM(value::bigint) AS total
              FROM (SELECT * FROM jsonb_each_text(v_use)
                    UNION ALL SELECT * FROM jsonb_each_text(v_part)) u
              GROUP BY key) m;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'catalog_key',         v.catalog_key,
    'kind',                v.kind,
    'label',               COALESCE(v_reg.label, v.catalog_key),
    'family',              COALESCE(v_reg.family, 'À classer'),
    'used_in',             v_reg.used_in,
    'access',              internal.ref_catalog_access(v.catalog_key),
    'readonly_reason',     internal.ref_catalog_readonly_reason(v.catalog_key),
    'is_identifiable',     v.is_identifiable,
    'primary_key_columns', v.primary_key_columns,
    'label_column',        internal.ref_catalog_label_column(v.catalog_key),
    'columns',             v.columns,
    'outgoing_fk',         v.outgoing_fk,
    'rows',                v_rows,
    'usage',               v_use);
END $$;

REVOKE ALL ON FUNCTION internal.ref_catalog_label_column(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_readonly_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_cast_expr(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_row_count(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.list_ref_catalogs() FROM PUBLIC;
REVOKE ALL ON FUNCTION api.get_ref_catalog(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.list_ref_catalogs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_ref_catalog(text) TO authenticated, service_role;
```

- [ ] **Step 5: Appliquer et relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: lecture assertions passed` et `NOTICE: compteur multi-FK assertion passed`.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(211): RPC de lecture des catalogues + helpers derives

Maitre ET detail lisent le MEME acces via internal.ref_catalog_access : sinon
une table sans cle primaire s'affiche editable dans la liste puis verrouillee a
l'ouverture. Les verrouillages structurels sont derives, le registre ne fait
que restreindre. usage est indexe par la cle CANONIQUE de la ligne, la meme des
deux cotes. Le compteur FUSIONNE toutes les FK entrantes (teste sur deux tables
consommatrices distinctes, pas deux lignes de la meme table)."
```

---

### Task 4: RPC d'écriture, de suppression et de réordonnancement

**Files:** Modify `migration_ref_catalog_admin.sql` et `tests/test_ref_catalog_admin.sql`.

**Interfaces:**
- Produces:
  - `api.rpc_upsert_ref_row(p_catalog_key text, p_key jsonb, p_values jsonb) → jsonb` — `p_key` NULL ⇒ création.
  - `api.rpc_delete_ref_row(p_catalog_key text, p_key jsonb) → void`.
  - `api.rpc_reorder_ref_rows(p_catalog_key text, p_keys jsonb) → void` — `p_keys` = tableau JSON de clés dans l'ordre voulu.

**Cinq exigences, toutes issues de la revue du plan :**

1. **`p_key jsonb`** — la clause `WHERE` se bâtit depuis **toutes** les colonnes de `primary_key_columns`.
2. **Les colonnes de clé primaire SANS valeur par défaut sont SAISISSABLES à la création.** `ref_commune.insee_code`, `ref_capacity_applicability.metric_id` et `object_type` doivent être fournis — les exclure de la garde `REQUIRED_HIDDEN_COLUMN` était une erreur : `has_default` protège déjà les UUID générés, et rien d'autre ne doit être exempté.
3. **Délégation `ref_code` en arguments nommés, sur les QUATRE fonctions** : upsert, activation, réordonnancement, suppression. En câbler trois ferait disparaître le réordonnancement au moment où `RefCodeEditor` est absorbé.
4. **Le `DELETE` intercepte `foreign_key_violation`** — une référence peut naître entre le comptage et la suppression. Le compteur est le message lisible, la contrainte est la garde. Zéro ligne supprimée ⇒ `ROW_NOT_FOUND`.
5. **`code` figé après création, mais renvoyer le MÊME code est toléré** — sinon aucun formulaire pré-rempli ne peut enregistrer.

- [ ] **Step 1: Écrire les tests qui échouent**

```sql
-- (1) CYCLE RÉEL, clé uuid simple.
DO $$
DECLARE v_id uuid; v_key jsonb; v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_id := (api.rpc_upsert_ref_row('ref_legal_type', NULL,
            '{"code":"temoin_211","name":"Témoin §211","category":"business","is_required":false}'::jsonb)
           ->>'id')::uuid;
  v_key := jsonb_build_object('id', v_id);
  -- Le cast typé fonctionne : sans lui, is_required (boolean) refuserait le texte de ->>.
  ASSERT (SELECT is_required FROM ref_legal_type WHERE id = v_id) = false,
         'une colonne booléenne doit être castée au type découvert';

  PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"name":"Témoin modifié"}'::jsonb);
  ASSERT (SELECT name FROM ref_legal_type WHERE id = v_id) = 'Témoin modifié', 'l''édition doit persister';

  -- Renvoyer le MÊME code est toléré (formulaire pré-rempli) ; un code différent est refusé.
  PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key,
            '{"code":"temoin_211","name":"Témoin bis"}'::jsonb);
  ASSERT (SELECT name FROM ref_legal_type WHERE id = v_id) = 'Témoin bis',
         'renvoyer le même code ne doit pas bloquer l''enregistrement';
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"code":"autre"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%CODE_IMMUTABLE%'; END;
  ASSERT v_ok, 'changer le code doit lever CODE_IMMUTABLE';

  -- Colonne inconnue : ÉCHOUE, jamais ignorée (piège d'écriture).
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"nexiste_pas":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%UNKNOWN_COLUMN%'; END;
  ASSERT v_ok, 'une colonne inconnue doit faire échouer l''appel';

  -- Colonne obligatoire sans défaut absente à la création : garde SERVEUR.
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_legal_type', NULL, '{"name":"Sans code"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%REQUIRED_HIDDEN_COLUMN%'; END;
  ASSERT v_ok, 'une colonne obligatoire sans défaut absente doit lever REQUIRED_HIDDEN_COLUMN';

  -- Suppression : refusée référencée, acceptée à 0, ROW_NOT_FOUND au second passage.
  INSERT INTO object (id, object_type, name, status) VALUES ('CATTST9999999901','HLO','T','draft');
  INSERT INTO object_legal (object_id, type_id, value) VALUES ('CATTST9999999901', v_id, '{}'::jsonb);
  v_ok := false;
  BEGIN PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%STILL_REFERENCED%'; END;
  ASSERT v_ok, 'supprimer une valeur référencée doit lever STILL_REFERENCED';

  DELETE FROM object_legal WHERE type_id = v_id;
  PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  ASSERT NOT EXISTS (SELECT 1 FROM ref_legal_type WHERE id = v_id), 'à 0 référence, la suppression passe';

  v_ok := false;
  BEGIN PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ROW_NOT_FOUND%'; END;
  ASSERT v_ok, 'supprimer une ligne inexistante doit lever ROW_NOT_FOUND, pas réussir en silence';

  RAISE NOTICE 'cycle uuid assertions passed';
END$$;

-- (2) L'IDENTITÉ GÉNÉRIQUE : clé naturelle non-uuid, clé composite, absence de clé.
DO $$
DECLARE v_ok boolean; v_metric uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Clé naturelle varchar(5). insee_code est une colonne de PK SANS défaut : elle doit
  -- être acceptée au payload de création, sinon ref_commune est inéditable.
  PERFORM api.rpc_upsert_ref_row('ref_commune', NULL,
            '{"insee_code":"97499","name":"Commune témoin §211"}'::jsonb);
  PERFORM api.rpc_upsert_ref_row('ref_commune', '{"insee_code":"97499"}'::jsonb,
            '{"name":"Commune modifiée"}'::jsonb);
  ASSERT (SELECT name FROM ref_commune WHERE insee_code = '97499') = 'Commune modifiée',
         'une clé primaire naturelle varchar doit permettre l''édition';
  PERFORM api.rpc_delete_ref_row('ref_commune', '{"insee_code":"97499"}'::jsonb);
  ASSERT NOT EXISTS (SELECT 1 FROM ref_commune WHERE insee_code = '97499'), 'et la suppression';

  -- Clé COMPOSITE.
  SELECT id INTO v_metric FROM ref_capacity_metric LIMIT 1;
  DELETE FROM ref_capacity_applicability WHERE metric_id = v_metric AND object_type = 'PRD';
  PERFORM api.rpc_upsert_ref_row('ref_capacity_applicability', NULL,
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'));
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability
                 WHERE metric_id = v_metric AND object_type = 'PRD'),
         'une matrice à clé composite doit être créable';
  PERFORM api.rpc_delete_ref_row('ref_capacity_applicability',
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'));
  ASSERT NOT EXISTS (SELECT 1 FROM ref_capacity_applicability
                     WHERE metric_id = v_metric AND object_type = 'PRD'), 'et supprimable';

  -- Sans clé primaire : verrouillée d'office, sans ligne de registre.
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_interop_crosswalk', NULL, '{"source_system":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%LOCKED_CATALOG%'; END;
  ASSERT v_ok, 'une relation sans clé primaire doit être verrouillée d''office';

  RAISE NOTICE 'identité générique assertions passed';
END$$;

-- (3) DÉLÉGATION ref_code : nom/code non inversés, activation ET réordonnancement câblés.
DO $$
DECLARE v_a uuid; v_b uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_a := (api.rpc_upsert_ref_row('ref_code:cuisine_type', NULL,
           '{"code":"temoin_a_211","name":"Témoin A"}'::jsonb)->>'id')::uuid;
  v_b := (api.rpc_upsert_ref_row('ref_code:cuisine_type', NULL,
           '{"code":"temoin_b_211","name":"Témoin B"}'::jsonb)->>'id')::uuid;

  ASSERT (SELECT code FROM ref_code WHERE id = v_a) = 'temoin_a_211',
         'le code doit atterrir dans `code` — un appel positionnel l''écrirait dans `name`';
  ASSERT (SELECT name FROM ref_code WHERE id = v_a) = 'Témoin A',
         'le libellé doit atterrir dans `name`';

  PERFORM api.rpc_upsert_ref_row('ref_code:cuisine_type',
            jsonb_build_object('id', v_a), '{"is_active":false}'::jsonb);
  ASSERT (SELECT is_active FROM ref_code WHERE id = v_a) = false,
         'l''interrupteur « actif » des domaines doit rester câblé après absorption de RefCodeEditor';

  PERFORM api.rpc_reorder_ref_rows('ref_code:cuisine_type',
            (SELECT jsonb_agg(jsonb_build_object('id', rc.id) ORDER BY rc.id)
             FROM ref_code rc WHERE rc.domain = 'cuisine_type'));
  ASSERT (SELECT count(DISTINCT position) FROM ref_code WHERE domain = 'cuisine_type')
       = (SELECT count(*) FROM ref_code WHERE domain = 'cuisine_type'),
         'le réordonnancement des domaines doit rester câblé et produire des rangs distincts';

  PERFORM api.rpc_delete_ref_row('ref_code:cuisine_type', jsonb_build_object('id', v_a));
  PERFORM api.rpc_delete_ref_row('ref_code:cuisine_type', jsonb_build_object('id', v_b));
  RAISE NOTICE 'délégation ref_code assertions passed';
END$$;

-- Réordonnancement d'une TABLE : permutation sous index unique partiel, et refus des
-- listes incomplètes, dupliquées ou porteuses d'une clé inconnue.
DO $$
DECLARE v_keys jsonb; v_ok boolean; v_first uuid; v_second uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ref_language porte uq_ref_language_position (UNIQUE partiel) : une écriture en une
  -- seule passe violerait l'unicité dès la première permutation. C'est CE test qui
  -- rougit si l'écriture en deux phases disparaît.
  SELECT jsonb_agg(jsonb_build_object('id', l.id) ORDER BY l.position NULLS LAST, l.id)
    INTO v_keys FROM ref_language l;
  SELECT (v_keys->0->>'id')::uuid, (v_keys->1->>'id')::uuid INTO v_first, v_second;

  PERFORM api.rpc_reorder_ref_rows('ref_language',
    jsonb_build_array(v_keys->1, v_keys->0) || (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
      FROM jsonb_array_elements(v_keys) WITH ORDINALITY AS t(e, ord) WHERE ord > 2));
  ASSERT (SELECT position FROM ref_language WHERE id = v_second)
       < (SELECT position FROM ref_language WHERE id = v_first),
         'la permutation doit passer malgré l''index unique partiel sur position';

  -- Liste INCOMPLÈTE : refusée, sinon on réordonnerait silencieusement de travers.
  v_ok := false;
  BEGIN PERFORM api.rpc_reorder_ref_rows('ref_language', jsonb_build_array(v_keys->0));
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%INCOMPLETE_ORDER%'; END;
  ASSERT v_ok, 'une liste partielle doit lever INCOMPLETE_ORDER';

  -- DOUBLON : refusé.
  v_ok := false;
  BEGIN PERFORM api.rpc_reorder_ref_rows('ref_language',
    (SELECT jsonb_agg(e) FROM jsonb_array_elements(v_keys || jsonb_build_array(v_keys->0)) e));
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%INCOMPLETE_ORDER%'; END;
  ASSERT v_ok, 'une liste avec doublon doit lever INCOMPLETE_ORDER';

  -- Clé INCONNUE : refusée.
  v_ok := false;
  BEGIN
    PERFORM api.rpc_reorder_ref_rows('ref_language',
      (SELECT jsonb_agg(e) FROM jsonb_array_elements(v_keys) WITH ORDINALITY AS t(e, ord)
       WHERE ord > 1) || jsonb_build_array(jsonb_build_object('id', gen_random_uuid())));
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%UNKNOWN_ROW%'; END;
  ASSERT v_ok, 'une clé inconnue doit lever UNKNOWN_ROW';

  RAISE NOTICE 'réordonnancement assertions passed';
END$$;

-- (4) ASSERTION DE SÉCURITÉ — si elle disparaît, le RPC devient une écriture arbitraire.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    PERFORM api.rpc_upsert_ref_row('object', NULL, '{"name":"pwn"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture sur `object` acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNKNOWN_CATALOG%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM api.rpc_delete_ref_row('auth.users', '{"id":"00000000-0000-0000-0000-000000000000"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : suppression dans auth.users acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNKNOWN_CATALOG%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_permission', NULL, '{"code":"x","name":"x"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture sur un catalogue verrouillé acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LOCKED_CATALOG%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_code:taxonomy_hlo', NULL, '{"code":"x","name":"x"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture sur une taxonomie acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LOCKED_CATALOG%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'écriture assertions passed';
END$$;
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `ERROR: function api.rpc_upsert_ref_row(...) does not exist`.

- [ ] **Step 3: Écrire les trois RPC**

```sql
CREATE OR REPLACE FUNCTION api.rpc_upsert_ref_row(
  p_catalog_key text, p_key jsonb, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v      record;
  v_col  text;
  v_cols text[] := ARRAY[]::text[];
  v_args text[] := ARRAY[]::text[];
  v_sets text[] := ARRAY[]::text[];
  v_miss text;
  v_cur  text;
  v_out  jsonb;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  -- (a) liste blanche = la vue
  SELECT * INTO v FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CATALOG: %', p_catalog_key USING ERRCODE = '22023';
  END IF;
  IF internal.ref_catalog_access(p_catalog_key) = 'readonly' THEN
    RAISE EXCEPTION 'LOCKED_CATALOG: % — %', p_catalog_key,
      COALESCE(internal.ref_catalog_readonly_reason(p_catalog_key), '') USING ERRCODE = '42501';
  END IF;

  -- Délégation phase 7.5 — ARGUMENTS NOMMÉS : la signature est
  -- (p_domain, p_name, p_id, p_code, …), p_name AVANT p_code. Un appel positionnel
  -- inversé écrit le code dans le libellé SANS lever d'erreur SQL.
  IF v.kind = 'ref_code_domain' THEN
    IF p_values ? 'is_active' AND p_key IS NOT NULL THEN
      PERFORM api.rpc_set_ref_code_active(
        (p_key->>'id')::uuid, v.domain, (p_values->>'is_active')::boolean);
    END IF;
    IF p_values ?| ARRAY['code','name','name_i18n','position'] THEN
      RETURN api.rpc_upsert_ref_code(
        p_domain    => v.domain,
        p_name      => p_values->>'name',
        p_id        => NULLIF(p_key->>'id', '')::uuid,
        p_code      => p_values->>'code',
        p_name_i18n => p_values->'name_i18n',
        p_position  => NULLIF(p_values->>'position', '')::integer);
    END IF;
    RETURN jsonb_build_object('id', p_key->>'id');
  END IF;

  -- (b) validation stricte du payload
  FOR v_col IN SELECT jsonb_object_keys(p_values) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.columns) c WHERE c->>'name' = v_col) THEN
      RAISE EXCEPTION 'UNKNOWN_COLUMN: % sur %', v_col, p_catalog_key USING ERRCODE = '22023';
    END IF;
    -- Une colonne de clé primaire est SAISISSABLE à la création (ref_commune.insee_code,
    -- ref_capacity_applicability.metric_id) et verrouillée seulement en édition.
    IF v_col IN ('created_at','updated_at')
       OR (p_key IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.primary_key_columns) k
                                         WHERE k->>'name' = v_col)) THEN
      RAISE EXCEPTION 'UNKNOWN_COLUMN: % est verrouillée', v_col USING ERRCODE = '22023';
    END IF;

    IF v_col = 'code' AND p_key IS NOT NULL THEN
      EXECUTE format('SELECT code::text FROM public.%I WHERE %s', v.table_name,
                (SELECT string_agg(format('%I = %s', k->>'name',
                          internal.ref_catalog_cast_expr(v.columns, k->>'name', '$1')), ' AND ')
                 FROM jsonb_array_elements(v.primary_key_columns) k))
        INTO v_cur USING p_key;
      IF v_cur IS DISTINCT FROM (p_values->>'code') THEN
        RAISE EXCEPTION 'CODE_IMMUTABLE: le code d''une valeur existante ne se change pas'
          USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;

    v_cols := v_cols || quote_ident(v_col);
    v_args := v_args || internal.ref_catalog_cast_expr(v.columns, v_col, '$1');
    v_sets := v_sets || format('%I = %s', v_col,
                               internal.ref_catalog_cast_expr(v.columns, v_col, '$1'));
  END LOOP;

  IF p_key IS NULL THEN
    -- Garde SERVEUR « ajout impossible ». AUCUNE exemption pour les colonnes de clé
    -- primaire : has_default protège déjà les UUID générés, et exempter les PK rendait
    -- ref_commune / les matrices insérables sans identité.
    SELECT c->>'name' INTO v_miss
    FROM jsonb_array_elements(v.columns) c
    WHERE (c->>'is_required')::boolean AND NOT (c->>'has_default')::boolean
      AND NOT (p_values ? (c->>'name'))
    LIMIT 1;
    IF v_miss IS NOT NULL THEN
      RAISE EXCEPTION 'REQUIRED_HIDDEN_COLUMN: % est obligatoire et absente', v_miss
        USING ERRCODE = '22023';
    END IF;
    IF array_length(v_cols, 1) IS NULL THEN
      RAISE EXCEPTION 'UNKNOWN_COLUMN: aucune colonne à écrire' USING ERRCODE = '22023';
    END IF;
    EXECUTE format('INSERT INTO public.%I (%s) VALUES (%s) RETURNING to_jsonb(public.%I.*)',
                   v.table_name, array_to_string(v_cols, ', '),
                   array_to_string(v_args, ', '), v.table_name)
      INTO v_out USING p_values;
  ELSE
    IF array_length(v_sets, 1) IS NULL THEN
      RAISE EXCEPTION 'UNKNOWN_COLUMN: aucune colonne à écrire' USING ERRCODE = '22023';
    END IF;
    SELECT string_agg(format('%I = %s', k->>'name',
             internal.ref_catalog_cast_expr(v.columns, k->>'name', '$2')), ' AND ')
      INTO v_cur FROM jsonb_array_elements(v.primary_key_columns) k;
    EXECUTE format('UPDATE public.%I SET %s WHERE %s RETURNING to_jsonb(public.%I.*)',
                   v.table_name, array_to_string(v_sets, ', '), v_cur, v.table_name)
      INTO v_out USING p_values, p_key;
    IF v_out IS NULL THEN
      RAISE EXCEPTION 'ROW_NOT_FOUND: % dans %', p_key, p_catalog_key USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION api.rpc_delete_ref_row(p_catalog_key text, p_key jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v record; f record; v_n bigint; v_total bigint := 0; v_where text; v_del bigint;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CATALOG: %', p_catalog_key USING ERRCODE = '22023';
  END IF;
  IF internal.ref_catalog_access(p_catalog_key) = 'readonly' THEN
    RAISE EXCEPTION 'LOCKED_CATALOG: % — %', p_catalog_key,
      COALESCE(internal.ref_catalog_readonly_reason(p_catalog_key), '') USING ERRCODE = '42501';
  END IF;

  IF v.kind = 'ref_code_domain' THEN
    PERFORM api.rpc_delete_ref_code(v.domain, (p_key->>'id')::uuid);
    RETURN;
  END IF;

  -- Le compteur est le MESSAGE LISIBLE (« 3 fiches »), pas la garde.
  IF jsonb_array_length(v.primary_key_columns) = 1 THEN
    FOR f IN SELECT * FROM jsonb_to_recordset(v.incoming_fk) AS y(tbl text, col text) LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = %s', f.tbl, f.col,
        internal.ref_catalog_cast_expr(v.columns, v.primary_key_columns->0->>'name', '$1'))
        INTO v_n USING p_key;
      v_total := v_total + v_n;
    END LOOP;
    IF v_total > 0 THEN
      RAISE EXCEPTION 'STILL_REFERENCED: % référence(s)', v_total USING ERRCODE = '23503';
    END IF;
  END IF;

  SELECT string_agg(format('%I = %s', k->>'name',
           internal.ref_catalog_cast_expr(v.columns, k->>'name', '$1')), ' AND ')
    INTO v_where FROM jsonb_array_elements(v.primary_key_columns) k;

  -- La CONTRAINTE est la garde : une référence peut naître entre le comptage et le DELETE.
  BEGIN
    EXECUTE format('DELETE FROM public.%I WHERE %s', v.table_name, v_where) USING p_key;
    GET DIAGNOSTICS v_del = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'STILL_REFERENCED: la valeur est référencée' USING ERRCODE = '23503';
  END;
  IF v_del = 0 THEN
    RAISE EXCEPTION 'ROW_NOT_FOUND: % dans %', p_key, p_catalog_key USING ERRCODE = '22023';
  END IF;
END $$;

-- Réordonnancement. Sans cette RPC, absorber RefCodeEditor ferait disparaître les flèches
-- monter/descendre des 52 domaines : une régression fonctionnelle déguisée en refonte.
--
-- DEUX PIÈGES, tous deux vérifiés en base :
--   (a) `ref_language` porte `uq_ref_language_position` — un index UNIQUE PARTIEL sur
--       position. Permuter 1↔2 par deux UPDATE successifs viole l'unicité au premier.
--       L'écriture est donc EN DEUX PHASES : on pousse d'abord tout le monde dans une
--       plage libre (1 000 000 + rang), puis on redescend sur le rang final.
--   (b) une liste partielle ou dupliquée réordonnerait silencieusement de travers : on
--       exige l'ensemble EXACT des lignes du catalogue, sans doublon.
CREATE OR REPLACE FUNCTION api.rpc_reorder_ref_rows(p_catalog_key text, p_keys jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v        record;
  v_where  text;
  v_n      bigint;
  v_given  integer;
  v_uniq   integer;
  v_found  bigint;
  i        integer := 0;
  k        jsonb;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CATALOG: %', p_catalog_key USING ERRCODE = '22023';
  END IF;
  IF internal.ref_catalog_access(p_catalog_key) = 'readonly' THEN
    RAISE EXCEPTION 'LOCKED_CATALOG: %', p_catalog_key USING ERRCODE = '42501';
  END IF;

  -- Aucun doublon dans la liste reçue.
  v_given := jsonb_array_length(p_keys);
  SELECT count(DISTINCT e::text) INTO v_uniq FROM jsonb_array_elements(p_keys) e;
  IF v_uniq <> v_given THEN
    RAISE EXCEPTION 'INCOMPLETE_ORDER: la liste contient des doublons' USING ERRCODE = '22023';
  END IF;

  IF v.kind = 'ref_code_domain' THEN
    SELECT count(*) INTO v_n FROM public.ref_code WHERE domain = v.domain;
    IF v_given <> v_n THEN
      RAISE EXCEPTION 'INCOMPLETE_ORDER: % clés pour % valeurs', v_given, v_n USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_found FROM public.ref_code rc
    WHERE rc.domain = v.domain
      AND rc.id IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_keys) e);
    IF v_found <> v_n THEN
      RAISE EXCEPTION 'UNKNOWN_ROW: une clé ne correspond à aucune valeur du domaine'
        USING ERRCODE = '22023';
    END IF;
    -- rpc_reorder_ref_code (phase 7.5) gère déjà sa propre écriture.
    PERFORM api.rpc_reorder_ref_code(v.domain,
      (SELECT array_agg((e->>'id')::uuid ORDER BY ord)
       FROM jsonb_array_elements(p_keys) WITH ORDINALITY AS t(e, ord)));
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.columns) c WHERE c->>'name' = 'position') THEN
    RAISE EXCEPTION 'UNKNOWN_COLUMN: % n''a pas de colonne position', p_catalog_key
      USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I', v.table_name) INTO v_n;
  IF v_given <> v_n THEN
    RAISE EXCEPTION 'INCOMPLETE_ORDER: % clés pour % lignes', v_given, v_n USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(format('%I = %s', kc->>'name',
           internal.ref_catalog_cast_expr(v.columns, kc->>'name', '$1')), ' AND ')
    INTO v_where FROM jsonb_array_elements(v.primary_key_columns) kc;

  -- PHASE 1 : plage libre. Le compteur de lignes touchées vérifie au passage que chaque
  -- clé désigne bien une ligne existante — une clé inconnue laisse ROW_COUNT à 0.
  FOR k IN SELECT * FROM jsonb_array_elements(p_keys) LOOP
    i := i + 1;
    EXECUTE format('UPDATE public.%I SET position = $2 WHERE %s', v.table_name, v_where)
      USING k, 1000000 + i;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    IF v_found = 0 THEN
      RAISE EXCEPTION 'UNKNOWN_ROW: % ne correspond à aucune ligne de %', k, p_catalog_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- PHASE 2 : rang final. Aucune collision possible, la plage 1..N est entièrement libre.
  i := 0;
  FOR k IN SELECT * FROM jsonb_array_elements(p_keys) LOOP
    i := i + 1;
    EXECUTE format('UPDATE public.%I SET position = $2 WHERE %s', v.table_name, v_where)
      USING k, i;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION api.rpc_upsert_ref_row(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rpc_delete_ref_row(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rpc_reorder_ref_rows(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_upsert_ref_row(text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_delete_ref_row(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_reorder_ref_rows(text, jsonb) TO authenticated, service_role;
```

- [ ] **Step 4: Appliquer et relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : les quatre `NOTICE` du bloc d'écriture.

- [ ] **Step 5: Vérifier la non-vacuité par sabotage**

Trois sabotages, chacun doit faire **rougir** un test précis, puis être annulé :

| Sabotage | Test qui doit tomber |
|---|---|
| commenter le `RAISE EXCEPTION 'UNKNOWN_COLUMN'` | cycle uuid, « colonne inconnue » |
| remplacer `FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key` par une acceptation directe | assertion de sécurité, écriture sur `object` |
| retirer la synthèse `primary_key_columns` **ET** `is_identifiable` des domaines (tâche 1) | `ref_code:cuisine_type` doit être éditable — **saboter `primary_key_columns` seul est VACANT** : aucune des trois RPC ne la consulte pour un domaine (upsert et delete court-circuitent vers la délégation, reorder interroge `ref_code` par `domain`), et c'est `is_identifiable` seul qui conditionne le verrouillage |

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(211): RPC d'ecriture, suppression et reordonnancement generiques

Liste blanche = la VUE, jamais le registre. Identite = p_key jsonb sur toutes
les colonnes de PK. Les colonnes de PK SANS defaut sont saisissables a la
creation (ref_commune.insee_code, les matrices) et verrouillees en edition ;
la garde REQUIRED_HIDDEN_COLUMN n'exempte plus les PK, has_default suffit.
Delegation ref_code en arguments NOMMES sur les QUATRE fonctions : ne pas
cabler le reordonnancement aurait fait disparaitre les fleches des 52 domaines.
DELETE intercepte foreign_key_violation (course avec le comptage) et rend
ROW_NOT_FOUND. Gardes verifiees non vacantes par trois sabotages."
```

---

### Task 5: Manifeste, runbook, garde CI

**Files:** Modify `ci_fresh_apply.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`.

- [ ] **Step 1: Déclarer l'étape dans le driver CI**

Dans `ci_fresh_apply.sql`, **avant** `\echo '== I4f-final-test …'` :

```sql
\echo '== 16w    migration_ref_catalog_admin.sql  (211 administration generee des catalogues : vue d introspection internal.v_ref_catalog (32 tables ref_* + 71 domaines ref_code, forme et cle primaire SYNTHETISEES pour les domaines sans quoi ils seraient tous verrouilles en silence), registre editorial, helpers d acces DERIVES, 5 RPC DEFINER gated superuser dont trois en SQL dynamique dont la LISTE BLANCHE EST LA VUE) =='
\ir migration_ref_catalog_admin.sql

\echo '== 16w-test garde permanente 211 (compte exact des catalogues / domaines editables et identifiables / cible de FK normalisee en catalog_key / maitre et detail jamais divergents / balayage exhaustif de get_ref_catalog / compteur fusionnant DEUX FK entrantes distinctes / cycle creer-editer-refuser-supprimer sur cle uuid, naturelle et composite / delegation ref_code non inversee avec activation et reordonnancement / ASSERTION DE SECURITE : une ecriture visant object ou auth.users leve UNKNOWN_CATALOG) =='
\ir tests/test_ref_catalog_admin.sql
```

- [ ] **Step 2: Ajouter l'entrée de manifeste au runbook**

Une ligne `16w.` dans la liste numérotée (avant `14. REFRESH MATERIALIZED VIEW…`), puis une section `## 16w — …` en fin de fichier sur le modèle de `16t`. Elle doit dire : ce que fait la migration, l'invariant « liste blanche = la vue », les verrouillages **dérivés** vs **seedés**, l'absence de fold dans `schema_unified.sql`, et qu'un `NOTIFY pgrst, 'reload schema'` est **requis** (cinq fonctions `api` neuves).

- [ ] **Step 3: Vérifier**

```bash
grep -n "16w" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
```

Attendu : 2 occurrences dans le driver, 2 dans le runbook.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "chore(211): declare l'etape 16w au manifeste et au driver CI"
```

---

### Task 6: Front pur — colonnes, identité, libellé

**Files:**
- Create: `bertel-tourism-ui/src/features/settings/catalog-fields.ts`
- Test: `bertel-tourism-ui/src/features/settings/catalog-fields.test.ts`

**Interfaces:**
- Produces:
  - `type CatalogColumn = { name: string; type: string; isRequired: boolean; hasDefault: boolean; enumValues: string[] | null }`
  - `type CatalogFk = { column: string; target: string }`
  - `type CatalogField = { name: string; kind: 'text' | 'i18n-text' | 'boolean' | 'number' | 'date' | 'select' | 'reference'; options?: string[]; target?: string; locked: boolean }`
  - `buildCatalogFieldSpec(columns, fks, primaryKeyColumns: string[], mode: 'create' | 'edit'): CatalogField[]`
  - `computeAddBlocked(columns, fields, primaryKeyColumns: string[]): string | null`
  - `buildRowKey(row, primaryKeyColumns: string[]): Record<string, unknown>`
  - `rowKeyString(row, primaryKeyColumns: string[]): string` — la clé canonique, **même forme que le serveur**
  - `formatRowLabel(row, labelColumn: string | null, primaryKeyColumns: string[]): string`

> **La clé canonique n'est PAS du JSON sérialisé.** `jsonb::text` rend `{"id": "x"}` (avec espace) là où `JSON.stringify` rend `{"id":"x"}` : les deux ne se rejoindraient jamais. Le serveur et le front joignent donc les valeurs de clé primaire, **dans l'ordre de `primary_key_columns`**, par le séparateur d'unité `U+001F` — un caractère qui ne peut pas apparaître dans une valeur.

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
import {
  buildCatalogFieldSpec, computeAddBlocked, buildRowKey, rowKeyString, formatRowLabel,
  type CatalogColumn,
} from './catalog-fields';

const col = (over: Partial<CatalogColumn> = {}): CatalogColumn => ({
  name: 'name', type: 'text', isRequired: false, hasDefault: false, enumValues: null, ...over,
});

describe('buildCatalogFieldSpec', () => {
  it('rend un champ texte pour text et varchar', () => {
    expect(buildCatalogFieldSpec([col({ name: 'label', type: 'character varying(50)' })], [], ['id'], 'edit')[0])
      .toMatchObject({ name: 'label', kind: 'text' });
  });

  it('rend un interrupteur, un nombre, une date', () => {
    const spec = buildCatalogFieldSpec([
      col({ name: 'is_public', type: 'boolean' }),
      col({ name: 'days', type: 'integer' }),
      col({ name: 'valid_to', type: 'date' }),
    ], [], ['id'], 'edit');
    expect(spec.map((f) => f.kind)).toEqual(['boolean', 'number', 'date']);
  });

  it('rend une liste deroulante pour un enumere', () => {
    expect(buildCatalogFieldSpec(
      [col({ name: 'kind', type: 'object_type', enumValues: ['HLO', 'RES'] })], [], ['id'], 'edit')[0])
      .toMatchObject({ kind: 'select', options: ['HLO', 'RES'] });
  });

  it('rend une reference pour une colonne portant une cle etrangere', () => {
    expect(buildCatalogFieldSpec(
      [col({ name: 'family_id', type: 'uuid' })],
      [{ column: 'family_id', target: 'ref_code:amenity_family' }], ['id'], 'edit')[0])
      .toMatchObject({ kind: 'reference', target: 'ref_code:amenity_family' });
  });

  it('associe un champ texte a son i18n frere et masque le jsonb', () => {
    const spec = buildCatalogFieldSpec(
      [col({ name: 'name' }), col({ name: 'name_i18n', type: 'jsonb' })], [], ['id'], 'edit');
    expect(spec).toHaveLength(1);
    expect(spec[0].kind).toBe('i18n-text');
  });

  it('masque jsonb libre, tableaux et geometrie', () => {
    expect(buildCatalogFieldSpec([
      col({ name: 'metadata', type: 'jsonb' }),
      col({ name: 'tags', type: 'text[]' }),
      col({ name: 'geom', type: 'geometry' }),
    ], [], ['id'], 'edit')).toHaveLength(0);
  });

  it('masque une cle primaire QUI A une valeur par defaut', () => {
    expect(buildCatalogFieldSpec(
      [col({ name: 'id', type: 'uuid', isRequired: true, hasDefault: true })], [], ['id'], 'create'))
      .toHaveLength(0);
  });

  it('rend une cle primaire SANS defaut a la creation, et la verrouille en edition', () => {
    const columns = [col({ name: 'insee_code', type: 'character varying(5)', isRequired: true })];
    expect(buildCatalogFieldSpec(columns, [], ['insee_code'], 'create')[0])
      .toMatchObject({ name: 'insee_code', locked: false });
    expect(buildCatalogFieldSpec(columns, [], ['insee_code'], 'edit')[0])
      .toMatchObject({ name: 'insee_code', locked: true });
  });

  it('rend une cle composite entierement saisissable a la creation', () => {
    const columns = [
      col({ name: 'metric_id', type: 'uuid', isRequired: true }),
      col({ name: 'object_type', type: 'object_type', isRequired: true, enumValues: ['HLO', 'PRD'] }),
    ];
    const spec = buildCatalogFieldSpec(columns, [{ column: 'metric_id', target: 'ref_capacity_metric' }],
      ['metric_id', 'object_type'], 'create');
    expect(spec.map((f) => f.name)).toEqual(['metric_id', 'object_type']);
  });

  it('verrouille le code en edition, pas a la creation', () => {
    const columns = [col({ name: 'code', isRequired: true })];
    expect(buildCatalogFieldSpec(columns, [], ['id'], 'create')[0].locked).toBe(false);
    expect(buildCatalogFieldSpec(columns, [], ['id'], 'edit')[0].locked).toBe(true);
  });

  it('masque toujours created_at et updated_at', () => {
    expect(buildCatalogFieldSpec([
      col({ name: 'created_at', type: 'timestamp with time zone' }),
      col({ name: 'updated_at', type: 'timestamp with time zone' }),
    ], [], ['id'], 'edit')).toHaveLength(0);
  });
});

describe('computeAddBlocked', () => {
  const spec = (columns: CatalogColumn[], pk: string[]) =>
    buildCatalogFieldSpec(columns, [], pk, 'create');

  it('rend null quand toute colonne obligatoire est rendable', () => {
    const columns = [col({ name: 'code', isRequired: true }), col({ name: 'name', isRequired: true })];
    expect(computeAddBlocked(columns, spec(columns, ['id']), ['id'])).toBeNull();
  });

  it('rend null pour une cle primaire naturelle, desormais saisissable', () => {
    const columns = [col({ name: 'insee_code', type: 'character varying(5)', isRequired: true }),
                     col({ name: 'name', isRequired: true })];
    expect(computeAddBlocked(columns, spec(columns, ['insee_code']), ['insee_code'])).toBeNull();
  });

  it('nomme la colonne obligatoire non rendable qui bloque la creation', () => {
    const columns = [col({ name: 'name', isRequired: true }),
                     col({ name: 'metadata', type: 'jsonb', isRequired: true })];
    expect(computeAddBlocked(columns, spec(columns, ['id']), ['id'])).toBe('metadata');
  });

  it('ignore une colonne obligatoire qui a une valeur par defaut', () => {
    const columns = [col({ name: 'name', isRequired: true }),
                     col({ name: 'metadata', type: 'jsonb', isRequired: true, hasDefault: true })];
    expect(computeAddBlocked(columns, spec(columns, ['id']), ['id'])).toBeNull();
  });
});

describe('identite de ligne', () => {
  it('buildRowKey extrait exactement les colonnes de cle primaire', () => {
    expect(buildRowKey({ metric_id: 'm1', object_type: 'HLO', label: 'X' }, ['metric_id', 'object_type']))
      .toEqual({ metric_id: 'm1', object_type: 'HLO' });
  });

  it('rowKeyString joint les valeurs dans l ordre de la cle, par le separateur d unite', () => {
    expect(rowKeyString({ metric_id: 'm1', object_type: 'HLO' }, ['metric_id', 'object_type']))
      .toBe('m1HLO');
  });

  it('rowKeyString ne depend pas de l ordre des cles de l objet', () => {
    const a = rowKeyString({ object_type: 'HLO', metric_id: 'm1' }, ['metric_id', 'object_type']);
    const b = rowKeyString({ metric_id: 'm1', object_type: 'HLO' }, ['metric_id', 'object_type']);
    expect(a).toBe(b);
  });
});

describe('formatRowLabel', () => {
  it('utilise la colonne de libelle quand elle existe', () => {
    expect(formatRowLabel({ name: 'Extrait KBIS', code: 'kbis' }, 'name', ['id'])).toBe('Extrait KBIS');
  });

  it('compose depuis la cle primaire quand aucune colonne de libelle n existe', () => {
    expect(formatRowLabel({ metric_id: 'm1', object_type: 'HLO' }, null, ['metric_id', 'object_type']))
      .toBe('m1 · HLO');
  });

  it('retombe sur la cle quand la colonne de libelle est vide', () => {
    expect(formatRowLabel({ name: '', insee_code: '97401' }, 'name', ['insee_code'])).toBe('97401');
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/features/settings/catalog-fields.test.ts
```

Attendu : `Cannot find module './catalog-fields'`.

- [ ] **Step 3: Écrire l'implémentation**

```typescript
/**
 * §211 — partie PURE de l'administration des catalogues : traduction d'une colonne
 * PostgreSQL en contrôle, identité d'une ligne, libellé de secours.
 *
 * Aucune règle n'est écrite par catalogue : tout se déduit de ce que rend
 * api.get_ref_catalog. Les types non rendables (jsonb libre, tableaux, géométrie) sont
 * MASQUÉS — arbitrage PO du 2026-08-07 — d'où `computeAddBlocked`, qui désactive l'ajout
 * en NOMMANT la colonne fautive plutôt que de laisser buter sur une erreur PostgreSQL.
 */

export interface CatalogColumn {
  name: string;
  type: string;
  isRequired: boolean;
  hasDefault: boolean;
  enumValues: string[] | null;
}

export interface CatalogFk {
  column: string;
  target: string;
}

export type CatalogFieldKind =
  | 'text' | 'i18n-text' | 'boolean' | 'number' | 'date' | 'select' | 'reference';

export interface CatalogField {
  name: string;
  kind: CatalogFieldKind;
  options?: string[];
  target?: string;
  /** Saisissable à la création, figé ensuite (clé primaire naturelle, `code`). */
  locked: boolean;
}

export type CatalogFormMode = 'create' | 'edit';

/** Séparateur d'unité : ne peut pas apparaître dans une valeur de clé primaire. */
export const ROW_KEY_SEPARATOR = '';

const ALWAYS_HIDDEN = new Set(['created_at', 'updated_at']);
const NUMBER_TYPES = /^(smallint|integer|bigint|numeric|real|double precision)/;
const DATE_TYPES = /^(date|timestamp)/;
const TEXT_TYPES = /^(text|character varying|character|citext)/;

function isRenderable(column: CatalogColumn, fkColumns: Set<string>): boolean {
  if (fkColumns.has(column.name)) return true;
  if (column.enumValues && column.enumValues.length > 0) return true;
  if (column.type === 'boolean') return true;
  if (NUMBER_TYPES.test(column.type)) return true;
  if (DATE_TYPES.test(column.type)) return true;
  return TEXT_TYPES.test(column.type);
}

export function buildCatalogFieldSpec(
  columns: CatalogColumn[],
  fks: CatalogFk[],
  primaryKeyColumns: string[],
  mode: CatalogFormMode,
): CatalogField[] {
  const fkByColumn = new Map(fks.map((fk) => [fk.column, fk.target]));
  const fkColumns = new Set(fkByColumn.keys());
  const pk = new Set(primaryKeyColumns);
  const names = new Set(columns.map((c) => c.name));
  const i18nSiblings = new Set(
    columns.filter((c) => c.name.endsWith('_i18n') && names.has(c.name.slice(0, -5))).map((c) => c.name),
  );

  const fields: CatalogField[] = [];
  for (const column of columns) {
    if (ALWAYS_HIDDEN.has(column.name)) continue;
    if (i18nSiblings.has(column.name)) continue;

    // Une clé primaire GÉNÉRÉE (uuid par défaut) n'a rien à saisir. Une clé primaire
    // SANS défaut — ref_commune.insee_code, les matrices — doit être saisie à la
    // création, sinon ces catalogues sont inéditables ; puis elle se fige.
    if (pk.has(column.name)) {
      if (column.hasDefault) continue;
      if (!isRenderable(column, fkColumns)) continue;
    } else if (!isRenderable(column, fkColumns)) {
      continue;
    }

    const locked = mode === 'edit' && (pk.has(column.name) || column.name === 'code');
    const target = fkByColumn.get(column.name);

    if (target) fields.push({ name: column.name, kind: 'reference', target, locked });
    else if (column.enumValues?.length)
      fields.push({ name: column.name, kind: 'select', options: column.enumValues, locked });
    else if (column.type === 'boolean') fields.push({ name: column.name, kind: 'boolean', locked });
    else if (NUMBER_TYPES.test(column.type)) fields.push({ name: column.name, kind: 'number', locked });
    else if (DATE_TYPES.test(column.type)) fields.push({ name: column.name, kind: 'date', locked });
    else
      fields.push({
        name: column.name,
        kind: names.has(`${column.name}_i18n`) ? 'i18n-text' : 'text',
        locked,
      });
  }
  return fields;
}

/**
 * Nom de la colonne qui empêche la création depuis l'interface, ou null.
 * Bloquante = obligatoire, sans valeur par défaut, et non rendue. AUCUNE exemption pour
 * les clés primaires : `hasDefault` protège déjà les UUID générés, et exempter les clés
 * rendrait `ref_commune` « créable » alors que l'insertion échouerait côté serveur.
 */
export function computeAddBlocked(
  columns: CatalogColumn[],
  fields: CatalogField[],
  _primaryKeyColumns: string[],
): string | null {
  const rendered = new Set(fields.map((f) => f.name));
  const blocking = columns.find(
    (c) => c.isRequired && !c.hasDefault && !ALWAYS_HIDDEN.has(c.name) && !rendered.has(c.name),
  );
  return blocking ? blocking.name : null;
}

/** L'identité d'une ligne, à passer telle quelle en `p_key`. */
export function buildRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: string[],
): Record<string, unknown> {
  const key: Record<string, unknown> = {};
  for (const name of primaryKeyColumns) key[name] = row[name];
  return key;
}

/**
 * Clé canonique d'une ligne — la MÊME que celle qui indexe `usage` côté serveur.
 * Volontairement pas du JSON : `jsonb::text` rend `{"id": "x"}` (avec espace) là où
 * `JSON.stringify` rend `{"id":"x"}`, et les deux ne se rejoindraient jamais.
 */
export function rowKeyString(row: Record<string, unknown>, primaryKeyColumns: string[]): string {
  return primaryKeyColumns.map((name) => String(row[name] ?? '')).join(ROW_KEY_SEPARATOR);
}

/**
 * Libellé affichable. Les matrices n'ont aucune colonne de libellé (`labelColumn` vaut
 * null) : leur nom se compose depuis la clé primaire — c'est bien la seule information
 * qu'elles portent.
 */
export function formatRowLabel(
  row: Record<string, unknown>,
  labelColumn: string | null,
  primaryKeyColumns: string[],
): string {
  if (labelColumn) {
    const value = row[labelColumn];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return primaryKeyColumns.map((name) => String(row[name] ?? '')).join(' · ');
}
```

- [ ] **Step 4: Lancer les tests et le type-check**

```bash
npx jest src/features/settings/catalog-fields.test.ts && npx tsc --noEmit -p tsconfig.json
```

Attendu : `Tests: 20 passed`, puis sortie vide.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/catalog-fields.ts src/features/settings/catalog-fields.test.ts
git commit -m "feat(211): partie pure de l'admin des catalogues

Colonne -> controle, identite de ligne, libelle de secours. Une cle primaire
SANS valeur par defaut est saisissable a la creation puis figee : sans cela
ref_commune et les cinq matrices restent ineditables. La cle canonique joint les
valeurs par U+001F et non par du JSON : jsonb::text et JSON.stringify ne
produisent pas la meme chaine et ne se rejoindraient jamais."
```

---

### Task 7: Service front `ref-catalogs.ts`

**Files:**
- Create: `bertel-tourism-ui/src/services/ref-catalogs.ts`
- Test: `bertel-tourism-ui/src/services/ref-catalogs.test.ts`

**Interfaces:**
- Produces:
  - `RefCatalogSummary = { catalogKey, kind, label, family, usedIn, access, readonlyReason, nValues }`
  - `RefCatalogDetail = { catalogKey, kind, label, family, usedIn, access, readonlyReason, isIdentifiable, primaryKeyColumns: string[], labelColumn: string | null, columns: CatalogColumn[], fks: CatalogFk[], rows: Record<string, unknown>[], usage: Record<string, number> }`
  - `listRefCatalogs(): Promise<RefCatalogSummary[]>`
  - `getRefCatalog(key: string): Promise<RefCatalogDetail>`
  - `upsertRefRow(key, rowKey: Record<string, unknown> | null, values: Record<string, unknown>): Promise<void>`
  - `deleteRefRow(key, rowKey: Record<string, unknown>): Promise<void>`
  - `reorderRefRows(key, rowKeys: Record<string, unknown>[]): Promise<void>`
  - `groupByFamily(catalogs): { family, catalogs }[]` — **pure**, « À classer » en dernier.

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
import { groupByFamily, type RefCatalogSummary } from './ref-catalogs';

const cat = (over: Partial<RefCatalogSummary>): RefCatalogSummary => ({
  catalogKey: 'ref_x', kind: 'table', label: 'X', family: 'Juridique et conformité',
  usedIn: null, access: 'editable', readonlyReason: null, nValues: 0, ...over,
});

describe('groupByFamily', () => {
  it('regroupe par famille et trie les familles alphabetiquement', () => {
    expect(groupByFamily([
      cat({ label: 'B', family: 'Restauration' }),
      cat({ label: 'A', family: 'Hébergement' }),
    ]).map((g) => g.family)).toEqual(['Hébergement', 'Restauration']);
  });

  it('place « A classer » en dernier, quel que soit l alphabet', () => {
    expect(groupByFamily([
      cat({ label: 'A', family: 'À classer' }),
      cat({ label: 'B', family: 'Restauration' }),
    ]).at(-1)?.family).toBe('À classer');
  });

  it('trie les catalogues par libelle dans une famille', () => {
    expect(groupByFamily([
      cat({ label: 'Zèbre', family: 'Hébergement' }),
      cat({ label: 'Abeille', family: 'Hébergement' }),
    ])[0].catalogs.map((c) => c.label)).toEqual(['Abeille', 'Zèbre']);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/services/ref-catalogs.test.ts
```

Attendu : `Cannot find module './ref-catalogs'`.

- [ ] **Step 3: Écrire le service**

Suivre le gabarit de `src/services/ref-codes.ts` (`requireClient()`, `.schema('api').rpc(...)`, `if (error) throw new Error(error.message)`), avec :

```typescript
export async function upsertRefRow(
  catalogKey: string,
  rowKey: Record<string, unknown> | null,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_upsert_ref_row', {
    p_catalog_key: catalogKey,
    p_key: rowKey,
    p_values: values,
  });
  if (error) throw new Error(error.message);
}

export async function reorderRefRows(
  catalogKey: string,
  rowKeys: Record<string, unknown>[],
): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_reorder_ref_rows', {
    p_catalog_key: catalogKey,
    p_keys: rowKeys,
  });
  if (error) throw new Error(error.message);
}

/** Familles alphabétiques, « À classer » toujours en dernier — un catalogue non classé
 *  doit se voir sans polluer le haut de la liste. */
export function groupByFamily(catalogs: RefCatalogSummary[]) {
  const byFamily = new Map<string, RefCatalogSummary[]>();
  for (const catalog of catalogs) {
    const list = byFamily.get(catalog.family) ?? [];
    list.push(catalog);
    byFamily.set(catalog.family, list);
  }
  return [...byFamily.entries()]
    .map(([family, list]) => ({
      family,
      catalogs: [...list].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    }))
    .sort((a, b) => {
      if (a.family === 'À classer') return 1;
      if (b.family === 'À classer') return -1;
      return a.family.localeCompare(b.family, 'fr');
    });
}
```

La normalisation de `getRefCatalog` mappe `outgoing_fk` → `fks`, `primary_key_columns` → `primaryKeyColumns: string[]` (extraire `name`), `label_column` → `labelColumn` (peut être `null`), et laisse `usage` tel quel — ses clés sont déjà la clé canonique.

- [ ] **Step 4: Lancer les tests et le type-check**

```bash
npx jest src/services/ref-catalogs.test.ts && npx tsc --noEmit -p tsconfig.json
```

Attendu : `Tests: 3 passed`, puis sortie vide.

- [ ] **Step 5: Commit**

```bash
git add src/services/ref-catalogs.ts src/services/ref-catalogs.test.ts
git commit -m "feat(211): service front des catalogues de reference"
```

---

### Task 8: Modale d'édition d'une ligne

**Files:**
- Create: `bertel-tourism-ui/src/views/RefCatalogRowModal.tsx`
- Test: couvert par `RefCatalogAdmin.test.tsx` (tâche 9)

**Interfaces:**
- Consumes: `buildCatalogFieldSpec`, `buildRowKey` (tâche 6), `getRefCatalog`, `upsertRefRow` (tâche 7).
- Produces: `RefCatalogRowModal({ catalog, row, onClose, onSaved })`.

> **Les options des listes déroulantes de référence se chargent depuis `catalog.fks`.** Chaque
> `target` est déjà un `catalog_key` exploitable (`ref_code:amenity_family`), grâce à la
> normalisation de la tâche 1. Sans elle, on interrogerait `ref_code_amenity_family`, absent de la vue.

- [ ] **Step 1: Écrire le composant**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueries } from '@tanstack/react-query';
import { Modal } from '../components/common/Modal';
import {
  buildCatalogFieldSpec, buildRowKey, formatRowLabel,
  type CatalogField,
} from '../features/settings/catalog-fields';
import { getRefCatalog, upsertRefRow, type RefCatalogDetail } from '../services/ref-catalogs';

/** Langues traduisibles, alignées sur RefCodeEditor (le libellé est le FR canonique). */
const I18N_LANGS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'Anglais (EN)' },
  { code: 'de', label: 'Allemand (DE)' },
];

interface Props {
  catalog: RefCatalogDetail;
  /** `null` ⇒ création. */
  row: Record<string, unknown> | null;
  /** `false` ⇒ la modale se ferme ; elle reste MONTÉE le temps de son animation de sortie. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function RefCatalogRowModal({ catalog, row, open, onOpenChange, onSaved }: Props) {
  const mode = row ? 'edit' : 'create';
  const fields = useMemo(
    () => buildCatalogFieldSpec(catalog.columns, catalog.fks, catalog.primaryKeyColumns, mode),
    [catalog.columns, catalog.fks, catalog.primaryKeyColumns, mode],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      initial[field.name] = row?.[field.name] ?? '';
      if (field.kind === 'i18n-text') {
        initial[`${field.name}_i18n`] = row?.[`${field.name}_i18n`] ?? {};
      }
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  // Options des références : une requête par catalogue cible, mise en cache par TanStack.
  // Chaque `target` est déjà un catalog_key exploitable (ref_code:amenity_family) grâce à
  // la normalisation de la vue — sans elle on interrogerait une partition absente.
  const referenceTargets = useMemo(
    () => [...new Set(fields.filter((f) => f.kind === 'reference').map((f) => f.target as string))],
    [fields],
  );
  const referenceQueries = useQueries({
    queries: referenceTargets.map((target) => ({
      queryKey: ['ref-catalog', target],
      queryFn: () => getRefCatalog(target),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const optionsByTarget = new Map<string, { value: string; label: string }[]>();
  referenceTargets.forEach((target, index) => {
    const data = referenceQueries[index].data;
    if (!data) return;
    optionsByTarget.set(target, data.rows.map((r) => ({
      value: String(r[data.primaryKeyColumns[0]] ?? ''),
      label: formatRowLabel(r, data.labelColumn, data.primaryKeyColumns),
    })));
  });

  const save = useMutation({
    mutationFn: async () => {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        // Une colonne verrouillée n'est pas renvoyée : le serveur lèverait UNKNOWN_COLUMN.
        if (field.locked) continue;
        const value = draft[field.name];
        // Un champ vidé doit partir en `null`, PAS en chaîne vide : `(p_values->>'x')::integer`
        // sur '' lève `invalid input syntax for type integer`. Une chaîne JSON null rend NULL.
        values[field.name] = coerceEmpty(field, value);
        if (field.kind === 'i18n-text') {
          values[`${field.name}_i18n`] = draft[`${field.name}_i18n`] ?? {};
        }
      }
      await upsertRefRow(
        catalog.catalogKey,
        row ? buildRowKey(row, catalog.primaryKeyColumns) : null,
        values,
      );
    },
    onSuccess: () => { setError(null); onSaved(); },
    onError: (err: Error) => setError(humaniseCatalogError(err.message)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={row ? 'Modifier la valeur' : 'Ajouter une valeur'}
      footer={
        <>
          <button type="button" onClick={() => onOpenChange(false)}>Annuler</button>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            Enregistrer
          </button>
        </>
      }
    >
      {error && <p role="alert" className="form-error">{error}</p>}
      {fields.map((field) => (
        <div key={field.name} className="field-block">
          <label htmlFor={`catalog-field-${field.name}`}>{field.name}</label>
          {renderControl(field, draft[field.name],
            (value) => setDraft((current) => ({ ...current, [field.name]: value })),
            optionsByTarget.get(field.target ?? ''))}

          {/* Traductions EN LIGNE plutôt qu'en modale imbriquée : Modal garde une modale
              sortante montée le temps de son animation, deux modales simultanées se
              marchent dessus. C'est ce qui préserve l'i18n de RefCodeEditor. */}
          {field.kind === 'i18n-text' && (
            <details className="field-block__i18n">
              <summary>Traductions</summary>
              {I18N_LANGS.map((lang) => (
                <div key={lang.code} className="field-block">
                  <label htmlFor={`i18n-${field.name}-${lang.code}`}>{lang.label}</label>
                  <input
                    id={`i18n-${field.name}-${lang.code}`}
                    aria-label={`${field.name} — ${lang.label}`}
                    value={String(
                      (draft[`${field.name}_i18n`] as Record<string, string>)?.[lang.code] ?? '')}
                    placeholder={String(draft[field.name] ?? '')}
                    onChange={(e) => setDraft((current) => ({
                      ...current,
                      [`${field.name}_i18n`]: {
                        ...(current[`${field.name}_i18n`] as Record<string, string>),
                        [lang.code]: e.target.value,
                      },
                    }))}
                  />
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
    </Modal>
  );
}

/** Un champ vidé rend `null` pour tout ce qui n'est pas du texte libre. */
function coerceEmpty(field: CatalogField, value: unknown): unknown {
  if (field.kind === 'boolean') return Boolean(value);
  if (value === '' || value === undefined) return null;
  return value;
}

function renderControl(
  field: CatalogField,
  value: unknown,
  onChange: (value: unknown) => void,
  options?: { value: string; label: string }[],
) {
  const id = `catalog-field-${field.name}`;
  if (field.kind === 'boolean') {
    return <input id={id} type="checkbox" checked={Boolean(value)} disabled={field.locked}
      aria-label={field.name} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.kind === 'select' || field.kind === 'reference') {
    const list = field.kind === 'select'
      ? (field.options ?? []).map((o) => ({ value: o, label: o }))
      : (options ?? []);
    return (
      <select id={id} value={String(value ?? '')} disabled={field.locked} aria-label={field.name}
        onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  const inputType = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text';
  return <input id={id} type={inputType} value={String(value ?? '')} disabled={field.locked}
    aria-label={field.name} onChange={(e) => onChange(e.target.value)} />;
}

/** Les codes d'erreur du RPC deviennent des phrases : une erreur PostgreSQL brute ne doit
 *  jamais remonter à l'utilisateur. */
export function humaniseCatalogError(message: string): string {
  if (message.includes('LOCKED_CATALOG')) return 'Ce catalogue est en lecture seule.';
  if (message.includes('CODE_IMMUTABLE')) return "Le code d'une valeur existante ne se change pas.";
  if (message.includes('STILL_REFERENCED')) return 'Cette valeur est utilisée par des fiches.';
  if (message.includes('ROW_NOT_FOUND')) return 'Cette valeur a été supprimée entre-temps.';
  if (message.includes('REQUIRED_HIDDEN_COLUMN')) return 'Une information obligatoire manque.';
  if (message.includes('UNKNOWN_COLUMN')) return 'Ce champ ne peut pas être enregistré ici.';
  if (message.includes('INCOMPLETE_ORDER')) return 'La liste a changé : rechargez avant de réordonner.';
  return "L'enregistrement a échoué.";
}
```

- [ ] **Step 2: Vérifier les types**

```bash
npx tsc --noEmit -p tsconfig.json
```

Attendu : sortie vide. (Adapter les props de `Modal` à sa signature réelle si elle diffère.)

- [ ] **Step 3: Commit**

```bash
git add src/views/RefCatalogRowModal.tsx
git commit -m "feat(211): modale d'edition d'une ligne de catalogue

Champs derives de la forme du catalogue ; les listes deroulantes de reference
se chargent depuis catalog.fks, dont la cible est deja un catalog_key. Les
colonnes verrouillees ne sont pas envoyees au serveur (elles y leveraient
UNKNOWN_COLUMN). Les codes d'erreur du RPC deviennent des phrases francaises."
```

---

### Task 9: Écran `RefCatalogAdmin` et bascule dans les réglages

**Files:**
- Create: `bertel-tourism-ui/src/views/RefCatalogAdmin.tsx`
- Test: `bertel-tourism-ui/src/views/RefCatalogAdmin.test.tsx`
- Modify: `bertel-tourism-ui/src/views/SettingsPage.tsx:786`
- Delete: `bertel-tourism-ui/src/views/RefCodeEditor.tsx`

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefCatalogAdmin } from './RefCatalogAdmin';
import * as service from '../services/ref-catalogs';

jest.mock('../services/ref-catalogs', () => ({
  ...jest.requireActual('../services/ref-catalogs'),
  listRefCatalogs: jest.fn(),
  getRefCatalog: jest.fn(),
  upsertRefRow: jest.fn(),
  deleteRefRow: jest.fn(),
  reorderRefRows: jest.fn(),
}));

const summary = (over = {}) => ({
  catalogKey: 'ref_legal_type', kind: 'table', label: 'Documents juridiques',
  family: 'Juridique et conformité', usedIn: '§18 Juridique', access: 'editable',
  readonlyReason: null, nValues: 2, ...over,
});

const detail = (over = {}) => ({
  catalogKey: 'ref_legal_type', kind: 'table', label: 'Documents juridiques',
  family: 'Juridique et conformité', usedIn: '§18 Juridique', access: 'editable',
  readonlyReason: null, isIdentifiable: true, primaryKeyColumns: ['id'], labelColumn: 'name',
  columns: [
    { name: 'id', type: 'uuid', isRequired: true, hasDefault: true, enumValues: null },
    { name: 'code', type: 'text', isRequired: true, hasDefault: false, enumValues: null },
    { name: 'name', type: 'text', isRequired: true, hasDefault: false, enumValues: null },
    // `position` est INDISPENSABLE au test de réordonnancement : sans cette colonne
    // `canReorder` est faux et les boutons Monter/Descendre ne sont jamais rendus —
    // le test passerait sur un bouton absent, donc ne testerait rien.
    { name: 'position', type: 'integer', isRequired: false, hasDefault: true, enumValues: null },
  ],
  fks: [],
  rows: [
    { id: 'u1', code: 'kbis', name: 'Extrait KBIS', position: 1 },
    { id: 'u2', code: 'siret', name: 'SIRET', position: 2 },
  ],
  usage: { u2: 2 },
  ...over,
});

function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RefCatalogAdmin /></QueryClientProvider>);
}

describe('RefCatalogAdmin', () => {
  beforeEach(() => {
    (service.listRefCatalogs as jest.Mock).mockResolvedValue([
      summary(),
      summary({ catalogKey: 'ref_orphan', label: 'Orphelin', family: 'À classer', nValues: 0 }),
      summary({ catalogKey: 'ref_permission', label: 'Permissions', family: 'Structure',
                access: 'readonly',
                readonlyReason: 'Chaque code est lu en dur par le contrôle d’accès.' }),
    ]);
    (service.getRefCatalog as jest.Mock).mockResolvedValue(detail());
    (service.upsertRefRow as jest.Mock).mockResolvedValue(undefined);
    (service.deleteRefRow as jest.Mock).mockResolvedValue(undefined);
  });

  it('range les catalogues par famille, « A classer » en dernier', async () => {
    renderAdmin();
    const families = await screen.findAllByRole('heading', { level: 3 });
    expect(families.at(-1)).toHaveTextContent('À classer');
  });

  it('affiche le motif de verrouillage d un catalogue en lecture seule', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: /Permissions/ }));
    (service.getRefCatalog as jest.Mock).mockResolvedValue(
      detail({ access: 'readonly', readonlyReason: 'Chaque code est lu en dur par le contrôle d’accès.' }));
    expect(await screen.findByText(/lu en dur par le contrôle/)).toBeInTheDocument();
  });

  it('grise la corbeille et affiche le compte tant que la valeur est referencee', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: /Documents juridiques/ }));
    expect(await screen.findByText('2 fiches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer SIRET' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Supprimer Extrait KBIS' })).toBeEnabled();
  });

  it('desactive l ajout et nomme la colonne bloquante', async () => {
    (service.getRefCatalog as jest.Mock).mockResolvedValue(detail({
      columns: [
        { name: 'id', type: 'uuid', isRequired: true, hasDefault: true, enumValues: null },
        { name: 'metadata', type: 'jsonb', isRequired: true, hasDefault: false, enumValues: null },
      ],
    }));
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: /Documents juridiques/ }));
    expect(await screen.findByRole('button', { name: /Ajouter/ })).toBeDisabled();
    expect(screen.getByText(/metadata/)).toBeInTheDocument();
  });

  it('cree une valeur sans cle et edite avec la cle de la ligne', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: /Documents juridiques/ }));

    fireEvent.click(await screen.findByRole('button', { name: /Ajouter/ }));
    fireEvent.change(screen.getByLabelText('code'), { target: { value: 'inpi' } });
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Extrait INPI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(service.upsertRefRow).toHaveBeenCalledWith(
      'ref_legal_type', null, expect.objectContaining({ code: 'inpi', name: 'Extrait INPI' })));

    fireEvent.click(screen.getByRole('button', { name: 'Modifier Extrait KBIS' }));
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'KBIS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(service.upsertRefRow).toHaveBeenCalledWith(
      'ref_legal_type', { id: 'u1' }, expect.objectContaining({ name: 'KBIS' })));
  });

  it('reordonne en envoyant les cles dans le nouvel ordre', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: /Documents juridiques/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descendre Extrait KBIS' }));
    await waitFor(() => expect(service.reorderRefRows).toHaveBeenCalledWith(
      'ref_legal_type', [{ id: 'u2' }, { id: 'u1' }]));
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/views/RefCatalogAdmin.test.tsx
```

Attendu : `Cannot find module './RefCatalogAdmin'`.

- [ ] **Step 3: Écrire l'écran**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { REFERENCE_CATALOGS_QUERY_KEY } from '../hooks/useReferenceCatalogsQuery';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import {
  buildCatalogFieldSpec, buildRowKey, computeAddBlocked, formatRowLabel, rowKeyString,
} from '../features/settings/catalog-fields';
import { moveItem } from './ref-code-reorder';
import {
  deleteRefRow, getRefCatalog, groupByFamily, listRefCatalogs, reorderRefRows,
} from '../services/ref-catalogs';
import { RefCatalogRowModal, humaniseCatalogError } from './RefCatalogRowModal';

export function RefCatalogAdmin() {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalRow, setModalRow] = useState<Record<string, unknown> | null | 'add'>(null);
  const [confirmRow, setConfirmRow] = useState<Record<string, unknown> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const catalogsQuery = useQuery({ queryKey: ['ref-catalogs'], queryFn: listRefCatalogs });
  const catalogs = useMemo(() => catalogsQuery.data ?? [], [catalogsQuery.data]);
  const activeKey = selectedKey ?? catalogs[0]?.catalogKey ?? null;

  const detailQuery = useQuery({
    queryKey: ['ref-catalog', activeKey],
    queryFn: () => getRefCatalog(activeKey as string),
    enabled: Boolean(activeKey),
  });
  const detail = detailQuery.data ?? null;

  const needle = search.trim().toLowerCase();
  const groups = useMemo(
    () => groupByFamily(needle
      ? catalogs.filter((c) => c.label.toLowerCase().includes(needle)
          || c.catalogKey.toLowerCase().includes(needle))
      : catalogs),
    [catalogs, needle],
  );

  // La recherche porte AUSSI sur les valeurs du catalogue ouvert. Elle ne peut pas porter
  // sur les valeurs des 103 catalogues à la fois : il faudrait un RPC de recherche
  // transverse, hors périmètre — la limite est dite à l'écran plutôt que devinée.
  const visibleRows = useMemo(() => {
    if (!detail) return [];
    if (!needle) return detail.rows;
    return detail.rows.filter((row) =>
      formatRowLabel(row, detail.labelColumn, detail.primaryKeyColumns).toLowerCase().includes(needle)
      || String(row.code ?? '').toLowerCase().includes(needle));
  }, [detail, needle]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['ref-catalogs'] });
    void queryClient.invalidateQueries({ queryKey: ['ref-catalog', activeKey] });
    // Les rédacteurs gardent les catalogues en cache de session une heure (persisté) :
    // sans cette invalidation ils continuent de voir l'ancien vocabulaire.
    void queryClient.invalidateQueries({ queryKey: REFERENCE_CATALOGS_QUERY_KEY });
  }

  const removeRow = useMutation({
    mutationFn: (row: Record<string, unknown>) =>
      deleteRefRow(detail!.catalogKey, buildRowKey(row, detail!.primaryKeyColumns)),
    onSuccess: () => { setActionError(null); setConfirmRow(null); refresh(); },
    onError: (err: Error) => setActionError(humaniseCatalogError(err.message)),
  });

  const reorder = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) =>
      reorderRefRows(detail!.catalogKey, rows.map((r) => buildRowKey(r, detail!.primaryKeyColumns))),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: (err: Error) => setActionError(humaniseCatalogError(err.message)),
  });

  const createFields = detail
    ? buildCatalogFieldSpec(detail.columns, detail.fks, detail.primaryKeyColumns, 'create')
    : [];
  const addBlocked = detail
    ? computeAddBlocked(detail.columns, createFields, detail.primaryKeyColumns) : null;
  const isReadonly = detail?.access === 'readonly';
  // Le réordonnancement porte sur la liste COMPLÈTE : l'offrir sur une liste filtrée
  // enverrait un ordre partiel, que le RPC refuse (INCOMPLETE_ORDER).
  const canReorder = Boolean(detail?.columns.some((c) => c.name === 'position'))
    && !isReadonly && !needle;

  return (
    <div className="ref-admin">
      <input type="search" value={search}
        placeholder="Rechercher un catalogue ou une valeur"
        aria-label="Rechercher un catalogue ou une valeur"
        onChange={(e) => setSearch(e.target.value)} />

      <div className="ref-admin__layout">
        <nav className="ref-admin__rail" aria-label="Familles de catalogues">
          {groups.map((group) => (
            <section key={group.family}>
              <h3>{group.family}</h3>
              {group.catalogs.map((catalog) => (
                <button key={catalog.catalogKey} type="button"
                  aria-current={catalog.catalogKey === activeKey}
                  onClick={() => setSelectedKey(catalog.catalogKey)}>
                  {catalog.access === 'readonly' && <Lock size={13} aria-hidden />}
                  {catalog.label}
                  <span className="muted">{catalog.nValues}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <section className="ref-admin__detail">
          {!detail && (
            <EmptyState mode="no-data" title="Choisissez un catalogue"
              description="La colonne de gauche range les 103 catalogues par famille." />
          )}
          {detail && (
            <>
              <header>
                <h2>{detail.label}</h2>
                <p className="mono muted">{detail.catalogKey}</p>
                {detail.usedIn && <p className="muted">Utilisé dans {detail.usedIn}</p>}
                {isReadonly && (
                  <p role="note" className="banner banner--warn">{detail.readonlyReason}</p>
                )}
              </header>

              {actionError && <p role="alert" className="form-error">{actionError}</p>}

              {visibleRows.length === 0 ? (
                <EmptyState
                  mode={needle ? 'filtered' : 'no-data'}
                  title={needle ? 'Aucune valeur ne correspond' : 'Ce catalogue est vide'}
                  description={needle
                    ? 'La recherche ne porte que sur le catalogue ouvert.'
                    : undefined} />
              ) : (
                <table>
                  <tbody>
                    {visibleRows.map((row, index) => {
                      const label = formatRowLabel(row, detail.labelColumn, detail.primaryKeyColumns);
                      const uses = detail.usage[rowKeyString(row, detail.primaryKeyColumns)] ?? 0;
                      return (
                        <tr key={rowKeyString(row, detail.primaryKeyColumns)}>
                          <td>{label}</td>
                          <td className="mono">{String(row.code ?? '')}</td>
                          <td>{uses > 0 ? `${uses} fiche${uses > 1 ? 's' : ''}` : '—'}</td>
                          <td>
                            {canReorder && (
                              <>
                                <button type="button" aria-label={`Monter ${label}`}
                                  disabled={index === 0}
                                  onClick={() => reorder.mutate(moveItem(detail.rows, index, index - 1))}>
                                  <ArrowUp size={14} aria-hidden />
                                </button>
                                <button type="button" aria-label={`Descendre ${label}`}
                                  disabled={index === detail.rows.length - 1}
                                  onClick={() => reorder.mutate(moveItem(detail.rows, index, index + 1))}>
                                  <ArrowDown size={14} aria-hidden />
                                </button>
                              </>
                            )}
                            <button type="button" aria-label={`Modifier ${label}`} disabled={isReadonly}
                              onClick={() => setModalRow(row)}>
                              <Pencil size={14} aria-hidden />
                            </button>
                            <button type="button" aria-label={`Supprimer ${label}`}
                              disabled={isReadonly || uses > 0}
                              onClick={() => setConfirmRow(row)}>
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {!isReadonly && (
                <>
                  <button type="button" disabled={Boolean(addBlocked)}
                    onClick={() => setModalRow('add')}>
                    <Plus size={14} aria-hidden /> Ajouter
                  </button>
                  {addBlocked && (
                    <p className="muted">
                      Ajout impossible depuis l&apos;interface : la colonne <code>{addBlocked}</code>{' '}
                      est obligatoire et ne peut pas être saisie ici.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* Modal et ConfirmDialog sont montés SANS condition et pilotés par `open` : les
          démonter aussitôt fermés supprimerait leur animation de sortie (cf. le commentaire
          d'en-tête de Modal.tsx). */}
      {detail && (
        <RefCatalogRowModal
          catalog={detail}
          row={modalRow === 'add' || modalRow === null ? null : modalRow}
          open={modalRow !== null}
          onOpenChange={(next) => { if (!next) setModalRow(null); }}
          onSaved={() => { setModalRow(null); refresh(); }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Supprimer définitivement cette valeur ?"
        tone="danger"
        confirmLabel="Supprimer définitivement"
        busy={removeRow.isPending}
        message={confirmRow && detail
          ? `La valeur « ${formatRowLabel(confirmRow, detail.labelColumn, detail.primaryKeyColumns)} » sera supprimée de façon irréversible. Cette action n'est possible que parce qu'aucune fiche ne la référence.`
          : ''}
        onCancel={() => setConfirmRow(null)}
        onConfirm={() => confirmRow && removeRow.mutate(confirmRow)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Basculer les réglages et supprimer l'ancien écran**

Dans `src/views/SettingsPage.tsx` : remplacer l'import `RefCodeEditor` par `RefCatalogAdmin`, l'usage à la ligne 786, et le texte du bandeau par « Tous les catalogues de référence, rangés par famille. Les listes structurelles (taxonomies, registres, permissions) restent en lecture seule, avec leur motif. »

Puis `git rm src/views/RefCodeEditor.tsx`. **Conserver** `src/services/ref-codes.ts` et `src/views/ref-code-reorder.ts` (`moveItem` est réutilisé).

- [ ] **Step 5: Lancer la suite complète**

```bash
npx tsc --noEmit -p tsconfig.json && npx jest --silent
```

Attendu : `tsc` sans sortie ; suite verte avec au moins 3 suites de plus qu'au départ.

- [ ] **Step 6: Commit**

```bash
git add src/views/RefCatalogAdmin.tsx src/views/RefCatalogAdmin.test.tsx src/views/SettingsPage.tsx
git rm src/views/RefCodeEditor.tsx
git commit -m "feat(211): ecran d'administration de tous les catalogues de reference

Maitre a deux niveaux (famille, catalogue) + detail des valeurs. Les 103
catalogues sont ranges par famille, « A classer » en dernier ; un catalogue
verrouille affiche son motif ; l'ajout est desactive en NOMMANT la colonne
bloquante ; la corbeille se grise sur le compte d'usage, et le refus est
re-evalue serveur. Le reordonnancement reste cable pour les domaines ref_code.
RefCodeEditor est absorbe, pas conserve en double."
```

---

### Task 10: Déploiement live, vérification, documentation

**Files:** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`, `CLAUDE.md` (tous deux gitignored, locaux).

- [ ] **Step 1: Répétition sur la base live, annulée**

Exécuter la migration entre `BEGIN;` et `ROLLBACK;` via le MCP Supabase, puis le fichier de test. On ne découvre pas une erreur de forme en production.

- [ ] **Step 2: Appliquer**

`mcp__supabase__apply_migration name: ref_catalog_admin`, puis `NOTIFY pgrst, 'reload schema';` (cinq fonctions `api` neuves).

- [ ] **Step 3: Vérifier sur la base live**

```sql
SELECT count(*) FROM internal.v_ref_catalog;                              -- attendu : 103
SELECT jsonb_array_length(api.list_ref_catalogs());                        -- identique
SELECT count(*) FROM internal.v_ref_catalog v
WHERE internal.ref_catalog_access(v.catalog_key) = 'readonly';             -- 19 taxos + 6 seeds + 1 sans PK
SELECT api.get_ref_catalog('ref_code:cuisine_type')->>'access';            -- attendu : editable
```

- [ ] **Step 4: Vérifier l'advisor**

`mcp__supabase__get_advisors type: security`. Les flags `0028/0029_*_security_definer_function_executable` sur les cinq RPC sont **attendus** (classe §36). Toute autre alerte neuve doit être traitée.

- [ ] **Step 5: Écrire la décision §211**

Couvrir : le constat (l'éditeur existant ne couvrait que 52 des 103 catalogues), les arbitrages PO, l'invariant « liste blanche = la vue », la séparation verrouillages dérivés / seedés, et **les quatre défauts rattrapés en revue** (§ ci-dessous) — c'est cette section qui a le plus de valeur pour la prochaine passe.

- [ ] **Step 6: Proposer l'invariant CLAUDE.md**

> ### Une écriture générique s'autorise par INTROSPECTION, jamais par configuration (§211)
> Toute fonction qui écrit dans une relation nommée par l'appelant doit résoudre cette relation
> **contre une vue d'introspection du catalogue PostgreSQL**, jamais contre une table de
> configuration. Une allowlist de configuration transforme une erreur de seed en élargissement de
> privilège. La configuration ne peut que **restreindre**. Corollaires : `format(%I)` pour les
> identifiants, `USING` pour les valeurs, et le **type de cast vient de la vue, jamais de
> l'appelant** ; une clé de payload absente des colonnes découvertes fait **échouer** l'appel, jamais
> ignorée en silence ; la garde CI doit contenir l'assertion « une écriture visant `object` lève
> `UNKNOWN_CATALOG` ». Et **tout ce qu'un générateur synthétise pour une espèce d'objet doit être
> synthétisé ENTIÈREMENT** : une forme partielle (colonnes décrites mais clé primaire absente) ne
> lève aucune erreur, elle rend simplement l'objet inerte — c'est le défaut le plus silencieux
> rencontré ici, il aurait verrouillé 71 catalogues sur 103.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(211): journal de decision et invariant d'ecriture generique"
```

---

## Révisions du 2026-08-07 — ce que deux revues ont rattrapé

Ce plan a été réécrit deux fois. Les défauts sont consignés parce que chacun est **silencieux** :
aucun ne lève d'erreur, tous rendent l'écran inerte ou les données fausses.

**Première revue — quatre bloquants.** (1) `p_id uuid` ne couvrait pas les tables réelles : 10 des
32 sortent du moule, et `ref_interop_crosswalk` n'a aucune clé primaire. (2) La délégation `ref_code`
inversait `p_name` et `p_code`, ce qui aurait écrit le code dans le libellé **sans erreur SQL** sur
52 vocabulaires. (3) Les domaines n'avaient aucune colonne décrite. (4) `outgoing_fk` n'était pas émis
alors que le front l'attendait.

**Seconde revue — six bloquants, tous nés de la correction précédente.** (1) La synthèse de forme des
domaines avait été faite pour `columns` mais **pas** pour `primary_key_columns` : `is_identifiable`
valait `false` et le helper d'accès verrouillait les 71 domaines, en silence. (2) `list_ref_catalogs`
lisait encore le registre brut alors que `get_ref_catalog` passait par le helper dérivé : le maître et
le détail auraient divergé. (3) Les colonnes de clé primaire étaient masquées dans le formulaire,
rendant `ref_commune` et les cinq matrices non créables. (4) Le réordonnancement n'était pas délégué.
(5) La cascade de libellé rendait `NULL` pour les matrices sans que rien ne compose de secours.
(6) Les cibles de FK pointaient vers des partitions absentes de la vue.

**Leçon transversale, désormais l'invariant CLAUDE.md de la tâche 10** : quand un générateur
synthétise la forme d'une espèce d'objet, la synthèse doit être **entière**. Une forme partielle ne
casse rien visiblement — elle rend l'objet inerte.

---

## Auto-revue

**Couverture de la spec.** §1 problème → contexte. §2 arbitrages → contraintes globales + tâches 2, 4,
6. §3.1 vue → tâche 1. §3.1 bis identité → tâches 1, 4, 6. §3.2 registre → tâche 2. §3.3 invariant de
sécurité → tâche 4 (test) + tâche 10 (CLAUDE.md). §3.4 verrouillages dérivés vs seedés → tâches 2 et 3.
§4.1 traduction → tâche 6. §4.2 colonnes verrouillées → tâches 4 et 6. §4.3 gardes → tâche 4 (serveur)
et 6 (client). §4.4 délégation → tâches 3 et 4. §5 RPC → tâches 3 et 4. §5.1 erreurs typées → tâche 4
+ `humaniseCatalogError` (tâche 8). §6 front → tâches 6 à 9. §7 tests → réparti. §8 hors périmètre →
non implémenté par construction.

**Cohérence des noms.** `catalog_key` partout ; `p_key` (SQL) ↔ `rowKey` / `buildRowKey` (front) ;
`primary_key_columns` ↔ `primaryKeyColumns`, tableau des deux côtés ; la clé canonique est le join
`U+001F` des deux côtés (`rowKeyString` ↔ la clé de `usage`) ; `label_column` ↔ `labelColumn`, nullable
des deux côtés ; codes d'erreur identiques entre les fonctions, leurs tests, `humaniseCatalogError` et
la liste de la spec §5.1.

**Props UI — vérifiées dans le code, plus supposées.** `Modal` prend `open` / `title` /
`onOpenChange` / `children` / `footer?` — **pas** `onClose`, et son en-tête avertit explicitement que
l'appelant ne doit PAS faire `if (!open) return null`, sinon l'animation de sortie ne joue jamais.
`ConfirmDialog` exige `message` (et accepte `tone`, `busy`, `confirmLabel`). `EmptyState` exige `mode`
(`no-data` / `filtered` / `coming-soon` / `error`) en plus de `title`. Les deux dialogues sont montés
**sans condition** et pilotés par `open`.

**Limites assumées.** La recherche porte sur tous les catalogues **et** sur les valeurs du catalogue
ouvert — pas sur les valeurs des 103 à la fois, ce qui demanderait un RPC de recherche transverse ; la
limite est écrite à l'écran. Le réordonnancement est masqué tant qu'une recherche filtre la liste : un
ordre partiel serait refusé par `INCOMPLETE_ORDER`. Les libellés de colonnes restent les noms
techniques ; une humanisation générique (`review_interval_days` → « Review interval days ») pourra
être ajoutée plus tard sans table de traduction.
