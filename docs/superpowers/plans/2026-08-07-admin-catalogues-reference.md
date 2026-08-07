# Administration générée des catalogues de référence — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** donner une surface d'administration à **tous** les catalogues de référence du projet (**103** : 71 domaines de `ref_code` — 52 plats, 19 taxonomiques verrouillés — et 32 tables `public.ref_*` autonomes), générée depuis le catalogue PostgreSQL plutôt qu'écrite catalogue par catalogue.

**Architecture:** une vue d'introspection `internal.v_ref_catalog` découvre les catalogues et leur forme (colonnes, types, clés étrangères entrantes et sortantes, énumérés) sans configuration ; une petite table `ref_catalog_registry` porte l'éditorial (nom lisible, famille, section d'usage, verrouillage motivé). Quatre RPC `SECURITY DEFINER` gated super-admin lisent et écrivent — l'écriture est du SQL dynamique dont **la liste blanche est la vue, jamais le registre**. Les 52 domaines plats de `ref_code` ne sont pas réimplémentés : le RPC générique délègue aux fonctions éprouvées de la phase 7.5.

**Tech Stack:** PostgreSQL 17 / Supabase (PL/pgSQL, `format(%I)`, `EXECUTE … USING`), PostgREST, Next.js 15 + React 19 + TanStack Query, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-07-admin-catalogues-reference-design.md` — validée section par section avec le PO le 2026-08-07.

## Global Constraints

- **Numéro de décision : §211.** §209 (catalogue juridique) et §210 (incident Exploreur) sont pris. Re-grepper `^## §` dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` avant de figer le numéro — d'autres sessions peuvent avoir consommé un numéro entre-temps.
- **Étape de manifeste : `16u`.** À déclarer dans `docs/SQL_ROLLOUT_RUNBOOK.md` ET dans `Base de donnée DLL et API/ci_fresh_apply.sql`, sinon la migration est une dérive PROD-only (traitée comme un incident, cf. CLAUDE.md « Deploy integrity »).
- **Toute fonction `SECURITY DEFINER` neuve porte `REVOKE ALL ON FUNCTION … FROM PUBLIC`** — PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut et un `GRANT` ciblé ne le retire pas.
- **`SET search_path = pg_catalog, public, api, internal`** sur toutes les fonctions neuves, donc **`gen_random_uuid()`** et jamais `uuid_generate_v4()` (non résolvable sous ce `search_path`).
- **Garde d'autorisation fail-closed : `IF api.is_platform_superuser() IS NOT TRUE THEN RAISE`** — `IS NOT TRUE`, pas `NOT`, car la fonction rend `NULL` hors contexte HTTP.
- **Aucune écriture PostgREST directe sur `ref_*` depuis le front** (invariant phase 7.5). Tout passe par les RPC.
- **Le flag advisor `0028/0029_*_security_definer_function_executable`** sur les nouvelles RPC est **attendu** (classe §36 : fonction publique-exécutable qui s'auto-autorise). Ne pas « corriger ».
- Le SQL du projet vit dans `Base de donnée DLL et API/` (espaces dans le chemin : toujours entre guillemets en shell).
- Commandes front, depuis `bertel-tourism-ui/` : `npx tsc --noEmit -p tsconfig.json` et `npx jest <chemin>`.
- **Identité d'une ligne = `p_key jsonb`, jamais `p_id uuid`.** Mesuré : 10 des 32 tables sortent du moule `uuid` simple — `ref_commune` a une PK `varchar(5)`, cinq matrices ont une PK composite (2 ou 3 colonnes), `ref_facet_registry` et `ref_code_domain_registry` ont une PK `text`, et **`ref_interop_crosswalk` n'a aucune clé primaire**. Un `p_id uuid` rendrait non éditables au moins dix catalogues, dont quatre que la spec annonce éditables.
- **Une relation sans clé primaire est en lecture seule d'office**, par règle DÉRIVÉE (`is_identifiable = false`), pas par une ligne de registre qu'on pourrait oublier.
- **Tout appel aux RPC de la phase 7.5 se fait en arguments NOMMÉS.** La signature réelle est `api.rpc_upsert_ref_code(p_domain, p_name, p_id, p_code, p_name_i18n, p_position)` — `p_name` **avant** `p_code`. Un appel positionnel qui suppose l'inverse écrit le code dans le libellé et le libellé dans le code, **sans lever d'erreur SQL**.
- **La colonne de libellé se résout par CASCADE**, pas par déclaration : 12 des 32 tables n'ont pas de colonne `name`. Ordre : surcharge du registre → première colonne texte parmi `name`, `label`, `title`, `libelle` → `code` → concaténation des colonnes de clé primaire.
- **Aucune assertion de test en `>=` sur un compte de catalogues**, et aucune assertion satisfaite par un ensemble non vide. Le compte attendu se calcule dans le test.
- Messages de commit : conventional, **sans** ligne `Co-Authored-By` (préférence du dépôt).

---

## Structure des fichiers

**Créés — SQL**
| Fichier | Responsabilité |
|---|---|
| `Base de donnée DLL et API/migration_ref_catalog_admin.sql` | tout le SQL de la fonctionnalité : vue, registre, seed, 4 RPC. Non foldé dans `schema_unified.sql` (les RPC référencent `api.is_platform_superuser` de `rls_policies.sql`) ⇒ étape de manifeste `16u`. |
| `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql` | garde CI permanente, 3 assertions non vacantes. |

**Créés — front**
| Fichier | Responsabilité |
|---|---|
| `bertel-tourism-ui/src/features/settings/catalog-fields.ts` | **pur** : traduction colonne → contrôle, et détection du blocage d'ajout. Zéro import React. |
| `bertel-tourism-ui/src/features/settings/catalog-fields.test.ts` | tests de la fonction pure. |
| `bertel-tourism-ui/src/services/ref-catalogs.ts` | appels aux 4 RPC + normalisation. |
| `bertel-tourism-ui/src/services/ref-catalogs.test.ts` | tests du service (client Supabase simulé). |
| `bertel-tourism-ui/src/views/RefCatalogAdmin.tsx` | l'écran maître/détail. |
| `bertel-tourism-ui/src/views/RefCatalogAdmin.test.tsx` | tests de rendu. |

**Modifiés**
| Fichier | Modification |
|---|---|
| `Base de donnée DLL et API/ci_fresh_apply.sql` | étape `16u` + `16u-test`, avant `I4f-final-test`. |
| `docs/SQL_ROLLOUT_RUNBOOK.md` | entrée de manifeste `16u` (liste) + section détaillée. |
| `bertel-tourism-ui/src/views/SettingsPage.tsx:786` | `<RefCodeEditor />` → `<RefCatalogAdmin />` + texte du bandeau. |
| `bertel-tourism-ui/src/views/RefCodeEditor.tsx` | **supprimé** — absorbé (cf. tâche 8). Son service `ref-codes.ts` reste : les RPC génériques délèguent, mais `ref-code-reorder.ts` et la modale i18n sont réutilisés. |

---

### Task 1: Vue d'introspection `internal.v_ref_catalog`

**Files:**
- Create: `Base de donnée DLL et API/migration_ref_catalog_admin.sql`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: la vue `internal.v_ref_catalog`, colonnes `kind text`, `catalog_key text`, `table_name text`, `domain text`, `columns jsonb`, **`primary_key_columns jsonb`** (tableau `[{name, type}]`, pas un scalaire), **`is_identifiable boolean`**, `outgoing_fk jsonb`, `incoming_fk jsonb`. Les tâches 3 et 4 la lisent.
- Deux exigences que la première rédaction de ce plan avait manquées, confirmées en base :
  1. `primary_key_columns` est un **tableau** — 5 matrices ont une PK composite, `ref_code_taxonomy_closure` en a trois, et `ref_interop_crosswalk` n'en a aucune (`is_identifiable = false`) ;
  2. pour l'espèce `ref_code_domain`, `columns` est **synthétisée** (un domaine n'est pas une relation, son `reloid` est NULL) : sans cela 71 catalogues sur 103 seraient décrits sans aucune colonne et l'écran ne produirait aucun champ de saisie.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql` avec ce seul bloc pour l'instant :

```sql
-- test_ref_catalog_admin.sql
-- Garde permanente §211 — administration générée des catalogues de référence.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_n integer;
  v_cols jsonb;
BEGIN
  -- La vue découvre les deux espèces de catalogue.
  -- ref_code lui-même n'est pas un catalogue (il est servi par domaine), ses partitions non plus.
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE table_name = 'ref_code' AND kind = 'table'),
         'ref_code ne doit pas apparaître comme table-catalogue : il est servi domaine par domaine';
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_media_type'),
         'les partitions de ref_code ne sont pas des catalogues autonomes';

  -- Le compte est EXACT, pas « au moins » : un >= masquerait la disparition de 20 catalogues.
  SELECT count(*) INTO v_n FROM internal.v_ref_catalog;
  ASSERT v_n = (
      (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ref\_%'
         AND c.relname <> 'ref_code'
         AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid))
    + (SELECT count(DISTINCT domain) FROM public.ref_code)),
    format('la vue doit émettre exactement une entrée par table et par domaine ; obtenu %s', v_n);

  -- Clé primaire COMPOSITE : ref_capacity_applicability en a deux (metric_id, object_type).
  ASSERT jsonb_array_length(
           (SELECT primary_key_columns FROM internal.v_ref_catalog
            WHERE catalog_key = 'ref_capacity_applicability')) = 2,
         'une PK composite doit être décrite en entier, sinon la ligne n''est pas identifiable';

  -- Clé primaire NATURELLE non-uuid : ref_commune.insee_code varchar(5).
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_commune') = 'insee_code',
         'ref_commune s''identifie par insee_code, pas par un uuid';

  -- AUCUNE clé primaire : la relation doit être marquée non identifiable (⇒ lecture seule dérivée).
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_interop_crosswalk') = false,
         'une relation sans clé primaire doit être marquée non identifiable';

  -- Les domaines ref_code portent des colonnes SYNTHÉTISÉES : sans elles, 71 catalogues
  -- sur 103 n''afficheraient aucun champ de saisie.
  ASSERT jsonb_array_length(
           (SELECT columns FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type')) = 5,
         'un domaine ref_code doit être décrit par la forme éditable synthétisée de ref_code';

  -- La forme d'un catalogue connu est correctement décrite.
  SELECT columns INTO v_cols FROM internal.v_ref_catalog WHERE catalog_key = 'ref_legal_type';
  ASSERT v_cols @> '[{"name":"is_required","is_required":false}]'::jsonb
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) c WHERE c->>'name' = 'is_required'),
         'la colonne is_required de ref_legal_type doit être décrite';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) c
                 WHERE c->>'name' = 'review_interval_days' AND c->>'type' = 'integer'),
         'le type PostgreSQL doit remonter tel quel';

  -- Les clés étrangères entrantes sont découvertes (elles portent le compteur d'usage).
  ASSERT EXISTS (
    SELECT 1 FROM internal.v_ref_catalog v,
         jsonb_array_elements(v.incoming_fk) f
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

Sans `psql` local, exécuter le corps du `DO` via le MCP Supabase entre `BEGIN;` et `ROLLBACK;` — même résultat attendu.

- [ ] **Step 3: Écrire la vue**

Créer `Base de donnée DLL et API/migration_ref_catalog_admin.sql` :

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
-- Manifeste 16u. NON foldé dans schema_unified.sql (les RPC référencent
-- api.is_platform_superuser de rls_policies.sql). Idempotent.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La découverte
--
-- Espèce 'table'  : une relation ordinaire public.ref_* qui n'est PAS une partition.
--   Le test « pas une partition » (pg_inherits) est ce qui écarte les 55 partitions
--   ref_code_<domain> TOUT EN GARDANT ref_code_domain_registry et
--   ref_code_taxonomy_closure, qui portent le même préfixe sans être des partitions.
--   Un filtre par nom (NOT LIKE 'ref\_code\_%') les aurait perdues en silence.
-- Espèce 'ref_code_domain' : un domaine de ref_code, présenté comme catalogue entier.
--   Ses FK entrantes ne sont PAS émises : elles pointent vers la partition, pas vers
--   ref_code. Le comptage d'usage d'un domaine est délégué à api.ref_code_usage_counts
--   (phase 7.5), qui résout déjà ce cas par un balayage de catalogue mesuré.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW internal.v_ref_catalog AS
WITH cat AS (
  SELECT 'table'::text                AS kind,
         c.relname::text              AS catalog_key,
         c.relname::text              AS table_name,
         NULL::text                   AS domain,
         c.oid                        AS reloid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname LIKE 'ref\_%'
    AND c.relname <> 'ref_code'
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  UNION ALL
  SELECT 'ref_code_domain'::text,
         'ref_code:' || d.domain,
         'ref_code'::text,
         d.domain,
         NULL::oid
  FROM (SELECT DISTINCT domain FROM public.ref_code) d
)
SELECT
  cat.kind,
  cat.catalog_key,
  cat.table_name,
  cat.domain,
  CASE WHEN cat.kind = 'ref_code_domain' THEN
    -- Un domaine n'est PAS une relation : reloid est NULL et pg_attribute ne rendrait rien.
    -- On synthétise la forme ÉDITABLE de ref_code (celle que la phase 7.5 sait écrire).
    -- Sans ce bras, 71 catalogues sur 103 seraient décrits sans colonne et l'écran
    -- n'afficherait aucun champ de saisie — la panne serait totale et silencieuse.
    '[{"name":"code","type":"text","is_required":true,"has_default":false,"position":1,"enum_values":null},
      {"name":"name","type":"text","is_required":true,"has_default":false,"position":2,"enum_values":null},
      {"name":"name_i18n","type":"jsonb","is_required":false,"has_default":true,"position":3,"enum_values":null},
      {"name":"position","type":"integer","is_required":false,"has_default":true,"position":4,"enum_values":null},
      {"name":"is_active","type":"boolean","is_required":false,"has_default":true,"position":5,"enum_values":null}]'::jsonb
  ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'name',        a.attname,
             'type',        format_type(a.atttypid, a.atttypmod),
             'is_required', a.attnotnull,
             'has_default', (a.atthasdef OR a.attidentity <> ''),
             'position',    a.attnum,
             'enum_values', CASE WHEN t.typtype = 'e' THEN (
                              SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                              FROM pg_enum e WHERE e.enumtypid = t.oid)
                            ELSE NULL END
           ) ORDER BY a.attnum)
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = cat.reloid AND a.attnum > 0 AND NOT a.attisdropped
  ), '[]'::jsonb) END AS columns,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'name', a.attname,
             'type', format_type(a.atttypid, a.atttypmod)) ORDER BY x.ord)
    FROM pg_constraint k
    CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS x(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = x.attnum
    WHERE k.conrelid = cat.reloid AND k.contype = 'p'
  ), '[]'::jsonb) AS primary_key_columns,
  EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = cat.reloid AND k.contype = 'p')
    AS is_identifiable,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'column', a.attname,
             'target', pt.relname))
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    JOIN pg_class pt ON pt.oid = k.confrelid
    WHERE k.conrelid = cat.reloid AND k.contype = 'f' AND array_length(k.conkey, 1) = 1
  ), '[]'::jsonb) AS outgoing_fk,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'table',  ct.relname,
             'column', a.attname))
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

- [ ] **Step 4: Appliquer et relancer le test**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: v_ref_catalog assertions passed` puis `ROLLBACK`.

- [ ] **Step 5: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(§211): vue d'introspection des catalogues de reference

internal.v_ref_catalog decouvre les 30 tables ref_* autonomes et les 71 domaines
de ref_code, avec leurs colonnes, cles etrangeres entrantes/sortantes et enumeres.
Le test « pas une partition » (pg_inherits) ecarte les 55 partitions ref_code_*
tout en gardant ref_code_domain_registry et ref_code_taxonomy_closure, qu'un
filtre par nom aurait perdus en silence."
```

---

### Task 2: Registre éditorial `ref_catalog_registry` + seed

**Files:**
- Modify: `Base de donnée DLL et API/migration_ref_catalog_admin.sql` (ajout en fin de fichier, avant `COMMIT`)
- Modify: `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql`

**Interfaces:**
- Consumes: `internal.v_ref_catalog` (tâche 1).
- Produces: table `public.ref_catalog_registry(catalog_key text PK, label text, family text, used_in text, label_column text, access text, readonly_reason text, position integer)`. Lue par les tâches 3, 4, 5.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter ce bloc dans `tests/test_ref_catalog_admin.sql`, avant le `ROLLBACK` final :

```sql
DO $$
BEGIN
  -- Un verrouillage sans motif est refusé : un écran qui dit « lecture seule »
  -- sans dire pourquoi transforme une décision en mystère.
  BEGIN
    INSERT INTO ref_catalog_registry (catalog_key, label, family, access)
    VALUES ('ref_legal_type', 'Test', 'Juridique', 'readonly');
    RAISE EXCEPTION 'GARDE VACANTE : un access=readonly sans readonly_reason a été accepté';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Le seed verrouille bien les catalogues sensibles, avec un motif lisible.
  ASSERT (SELECT access FROM ref_catalog_registry WHERE catalog_key = 'ref_permission') = 'readonly',
         'ref_permission doit être verrouillée : ses codes sont lus en dur par le contrôle d''accès';
  ASSERT (SELECT length(readonly_reason) FROM ref_catalog_registry WHERE catalog_key = 'ref_permission') > 20,
         'le motif de verrouillage doit être une phrase affichable, pas un mot';
  ASSERT (SELECT access FROM ref_catalog_registry WHERE catalog_key = 'ref_code:taxonomy_hlo') = 'readonly',
         'les taxonomies s''éditent par migration (triggers d''applicabilité + closure)';

  -- Le registre ne référence QUE des catalogues réels : une ligne orpheline
  -- afficherait un catalogue fantôme dans le maître.
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

Insérer dans `migration_ref_catalog_admin.sql`, avant le `COMMIT` :

```sql
-- ---------------------------------------------------------------------------
-- 2. L'éditorial
--
-- Ce que la base ne peut PAS deviner. Une table absente d'ici reste VISIBLE et
-- ÉDITABLE, famille « À classer » : un catalogue oublié doit gêner, pas disparaître.
-- Le registre ne peut que RESTREINDRE (verrouiller), jamais élargir.
-- ---------------------------------------------------------------------------
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
  -- Un verrouillage sans motif transforme une décision en mystère à l'écran.
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

-- Verrouillages motivés (annexe A de la spec).
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
   'Ce ne sont pas des valeurs de vocabulaire mais les fichiers déposés par les rédacteurs.'),
  ('ref_interop_crosswalk', 'Table de correspondance interop', 'Structure', NULL, 'readonly',
   'Correspondances vers les référentiels partenaires : se modifient avec le contrat d''export.')
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family, used_in = EXCLUDED.used_in,
  access = EXCLUDED.access, readonly_reason = EXCLUDED.readonly_reason, updated_at = now();

-- Les 19 taxonomies : verrouillées en bloc, motif commun.
INSERT INTO public.ref_catalog_registry (catalog_key, label, family, access, readonly_reason)
SELECT 'ref_code:' || reg.domain,
       reg.name,
       'Structure',
       'readonly',
       'Les taxonomies sont régies par les triggers d''applicabilité et la closure de parenté. Elles s''éditent par migration.'
FROM public.ref_code_domain_registry reg
WHERE reg.is_taxonomy
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family,
  access = EXCLUDED.access, readonly_reason = EXCLUDED.readonly_reason, updated_at = now();

-- Colonne de libellé quand ce n'est pas `name`.
INSERT INTO public.ref_catalog_registry (catalog_key, label, family, label_column) VALUES
  ('ref_sustainability_action', 'Actions de durabilité', 'Labels, classements, durabilité', 'title')
ON CONFLICT (catalog_key) DO UPDATE SET label_column = EXCLUDED.label_column, updated_at = now();
```

> **Vérification à faire avant d'écrire cette dernière ligne :** confirmer le nom réel de la colonne de libellé de `ref_sustainability_action` (`SELECT column_name FROM information_schema.columns WHERE table_name='ref_sustainability_action'`). La table n'a pas de `name` ; si la colonne s'appelle autrement que `title`, corriger le seed.

- [ ] **Step 4: Appliquer et relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: ref_catalog_registry assertions passed`.

- [ ] **Step 5: Compléter le seed des familles**

Ajouter au fichier un `INSERT … ON CONFLICT DO UPDATE` couvrant les 13 familles de l'annexe A de la spec (nom lisible + famille + `used_in`). Tout catalogue non listé reste dans « À classer » par construction — c'est voulu, ce n'est pas une omission à corriger.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(§211): registre editorial des catalogues + seed des verrouillages

ref_catalog_registry porte le nom lisible, la famille, la section d'usage et le
verrouillage motive. CHECK : un access=readonly sans readonly_reason est refuse
— un ecran qui dit « lecture seule » sans dire pourquoi transforme une decision
en mystere. Une table absente du registre reste visible et editable, famille
« A classer » : un catalogue oublie doit gener, pas disparaitre."
```

---

### Task 3: RPC de lecture

**Files:**
- Modify: `Base de donnée DLL et API/migration_ref_catalog_admin.sql`
- Modify: `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql`

**Interfaces:**
- Consumes: `internal.v_ref_catalog`, `public.ref_catalog_registry`, `api.list_ref_code_domains()`, `api.ref_code_usage_counts(text)`.
- Produces:
  - `api.list_ref_catalogs() RETURNS jsonb` — tableau `[{catalog_key, kind, label, family, used_in, access, readonly_reason, n_values}]`.
  - `api.get_ref_catalog(p_catalog_key text) RETURNS jsonb` — `{catalog_key, kind, label, family, used_in, access, readonly_reason, is_identifiable, primary_key_columns[], label_column, columns[], **outgoing_fk[]**, rows[], usage{clé: n}}`.
- **`outgoing_fk` est obligatoire dans le retour.** Le front en a besoin pour alimenter les listes déroulantes de référence ; sans lui, une colonne pointant vers un autre catalogue retombe en champ texte libre, c'est-à-dire en saisie d'UUID à la main. La première rédaction de ce plan l'avait omis alors que le type front l'attendait.
- **`usage` est clé par l'identité JSON de la ligne** (`{"metric_id":"…","object_type":"HLO"}` sérialisé), pas par un uuid : une matrice à clé composite n'a pas d'`id`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `tests/test_ref_catalog_admin.sql` :

```sql
DO $$
DECLARE
  v_list jsonb;
  v_cat  jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_list := api.list_ref_catalogs();
  ASSERT jsonb_array_length(v_list) = (SELECT count(*) FROM internal.v_ref_catalog),
         format('le maître doit lister TOUS les catalogues découverts ; obtenu %s pour %s découverts',
                jsonb_array_length(v_list), (SELECT count(*) FROM internal.v_ref_catalog));

  -- Les listes déroulantes de référence dépendent de outgoing_fk : sans lui, une colonne
  -- pointant vers un autre catalogue retombe en saisie d'UUID à la main.
  ASSERT jsonb_array_length(api.get_ref_catalog('ref_amenity')->'outgoing_fk') > 0,
         'get_ref_catalog doit émettre outgoing_fk (ref_amenity pointe vers une famille)';

  -- Libellé résolu par cascade : ref_sustainability_action n'a pas de `name`, elle a `label`.
  ASSERT api.get_ref_catalog('ref_sustainability_action')->>'label_column' = 'label',
         'la cascade de libellé doit trouver `label` quand `name` est absente';

  -- Verrouillages DÉRIVÉS, sans ligne de registre.
  ASSERT api.get_ref_catalog('ref_interop_crosswalk')->>'access' = 'readonly',
         'une relation sans clé primaire est en lecture seule d''office';
  ASSERT api.get_ref_catalog('ref_code:taxonomy_hlo')->>'access' = 'readonly',
         'un domaine non éditable selon api.ref_code_domain_is_editable est en lecture seule';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) c
                 WHERE c->>'catalog_key' = 'ref_legal_type' AND c->>'label' = 'Documents juridiques'),
         'le nom lisible du registre doit remplacer le nom technique';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) c
                 WHERE c->>'catalog_key' = 'ref_permission' AND c->>'access' = 'readonly'
                   AND length(c->>'readonly_reason') > 20),
         'un catalogue verrouillé doit porter son motif jusqu''à l''écran';

  -- BALAYAGE EXHAUSTIF : chaque catalogue découvert doit se décrire sans erreur. C'est ce qui
  -- attrape une table dont la forme casse le générateur (PK composite, PK absente, type exotique).
  DECLARE r record;
  BEGIN
    FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
      BEGIN
        PERFORM api.get_ref_catalog(r.catalog_key);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'get_ref_catalog casse sur % : % (%)', r.catalog_key, SQLERRM, SQLSTATE;
      END;
    END LOOP;
  END;

  v_cat := api.get_ref_catalog('ref_legal_type');
  ASSERT jsonb_array_length(v_cat->'rows') = 20,
         format('ref_legal_type porte 20 valeurs ; obtenu %s', jsonb_array_length(v_cat->'rows'));
  ASSERT (v_cat->'usage'->>(
            SELECT id::text FROM ref_legal_type WHERE code = 'siret'))::integer = 2,
         'le compteur d''usage doit voir les 2 lignes object_legal de type siret';

  RAISE NOTICE 'lecture assertions passed';
END$$;
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `ERROR: function api.list_ref_catalogs() does not exist`.

- [ ] **Step 3: Écrire les deux fonctions**

Ajouter dans `migration_ref_catalog_admin.sql` :

```sql
-- ---------------------------------------------------------------------------
-- 3. Lecture. DEFINER : la vue lit pg_catalog et internal, hors de portée d'anon.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.list_ref_catalogs()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'family', x->>'label'), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'catalog_key',     v.catalog_key,
      'kind',            v.kind,
      'label',           COALESCE(r.label, v.catalog_key),
      'family',          COALESCE(r.family, 'À classer'),
      'used_in',         r.used_in,
      'access',          COALESCE(r.access, 'editable'),
      'readonly_reason', r.readonly_reason,
      'n_values',        CASE
                           WHEN v.kind = 'ref_code_domain'
                             THEN (SELECT count(*) FROM public.ref_code rc WHERE rc.domain = v.domain)
                           ELSE internal.ref_catalog_row_count(v.table_name)
                         END
    ) AS x
    FROM internal.v_ref_catalog v
    LEFT JOIN public.ref_catalog_registry r ON r.catalog_key = v.catalog_key
  ) s;

  RETURN v_out;
END $$;

-- Compte les lignes d'une table-catalogue. Isolée pour garder list_ref_catalogs lisible ;
-- la table est résolue par regclass depuis la vue, jamais depuis l'appelant.
CREATE OR REPLACE FUNCTION internal.ref_catalog_row_count(p_table text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE v_n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE table_name = p_table AND kind = 'table') THEN
    RETURN 0;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_n;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION api.get_ref_catalog(p_catalog_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v      record;
  v_reg  record;
  v_rows jsonb := '[]'::jsonb;
  v_use  jsonb := '{}'::jsonb;
  f      record;
  v_n    bigint;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'Réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CATALOG: %', p_catalog_key USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_reg FROM public.ref_catalog_registry WHERE catalog_key = p_catalog_key;

  IF v.kind = 'ref_code_domain' THEN
    -- Délégation phase 7.5 : les domaines ont déjà leur lecture et leur comptage éprouvés.
    SELECT COALESCE(jsonb_agg(to_jsonb(rc) ORDER BY rc.position NULLS LAST, rc.name), '[]'::jsonb)
      INTO v_rows
    FROM public.ref_code rc WHERE rc.domain = v.domain;
    v_use := api.ref_code_usage_counts(v.domain);
  ELSE
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t', v.table_name)
      INTO v_rows;

    -- Compteur d'usage : SOMME de TOUTES les FK entrantes découvertes, pas une choisie
    -- à la main. C'est ce qui rend la corbeille honnête sur un catalogue référencé
    -- depuis plusieurs tables (ref_classification_scheme en a six).
    -- Le compteur ne sait travailler que sur une clé SIMPLE : une matrice à clé
    -- composite n'est référencée par personne, son compteur reste vide.
    IF jsonb_array_length(v.primary_key_columns) = 1 THEN
      FOR f IN SELECT * FROM jsonb_to_recordset(v.incoming_fk) AS x("table" text, "column" text) LOOP
        EXECUTE format(
          'SELECT COALESCE(jsonb_object_agg(k, n), ''{}''::jsonb) FROM ('
          '  SELECT %I::text AS k, count(*) AS n FROM public.%I WHERE %I IS NOT NULL GROUP BY 1) s',
          f."column", f."table", f."column")
        INTO v_use
        USING NULL;
        -- fusion additive avec l'accumulateur
        SELECT COALESCE(jsonb_object_agg(key, val), '{}'::jsonb) INTO v_use
        FROM (
          SELECT key, SUM(value::bigint) AS val
          FROM (
            SELECT key, value FROM jsonb_each_text(v_use)
          ) u GROUP BY key
        ) m;
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
    -- Cascade, pas déclaration : 12 des 32 tables n'ont pas de colonne `name`.
    'label_column',        internal.ref_catalog_label_column(v.catalog_key),
    'columns',             v.columns,
    'outgoing_fk',         v.outgoing_fk,
    'rows',                v_rows,
    'usage',               v_use
  );
END $$;

-- Résolution du libellé par CASCADE. Une déclaration par table serait la règle et non
-- l'exception (12 tables sur 32 n'ont pas de `name`), et chaque oubli produirait une ligne
-- sans libellé à l'écran.
CREATE OR REPLACE FUNCTION internal.ref_catalog_label_column(p_catalog_key text)
RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, internal
AS $$
  SELECT COALESCE(
    (SELECT r.label_column FROM public.ref_catalog_registry r
     WHERE r.catalog_key = p_catalog_key AND NULLIF(TRIM(r.label_column), '') IS NOT NULL),
    (SELECT c->>'name'
     FROM internal.v_ref_catalog v, jsonb_array_elements(v.columns) c
     WHERE v.catalog_key = p_catalog_key
       AND c->>'name' = ANY (ARRAY['name','label','title','libelle'])
     ORDER BY array_position(ARRAY['name','label','title','libelle'], c->>'name')
     LIMIT 1),
    (SELECT 'code' FROM internal.v_ref_catalog v, jsonb_array_elements(v.columns) c
     WHERE v.catalog_key = p_catalog_key AND c->>'name' = 'code' LIMIT 1)
  );
$$;

-- Accès EFFECTIF = verrouillages dérivés d'abord, registre ensuite. Les dérivés ne peuvent
-- pas être oubliés au seed : une relation sans clé primaire, ou un domaine ref_code jugé
-- non éditable par la fonction que l'écran actuel utilise déjà, sont fermés d'office.
CREATE OR REPLACE FUNCTION internal.ref_catalog_access(p_catalog_key text)
RETURNS text
LANGUAGE sql STABLE
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
RETURNS text
LANGUAGE sql STABLE
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

REVOKE ALL ON FUNCTION internal.ref_catalog_label_column(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_readonly_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.list_ref_catalogs() FROM PUBLIC;
REVOKE ALL ON FUNCTION api.get_ref_catalog(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_row_count(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.list_ref_catalogs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_ref_catalog(text) TO authenticated, service_role;
```

> **À corriger pendant l'implémentation :** la boucle de fusion des compteurs ci-dessus est écrite en deux temps (calcul puis fusion) et l'écrasement de `v_use` à chaque tour est un bug — le premier `EXECUTE … INTO v_use` doit écrire dans une variable temporaire `v_part jsonb`, et la fusion additive doit combiner `v_use` et `v_part`. Écrire d'abord le test « un catalogue référencé depuis DEUX tables affiche la somme » (par exemple `ref_language`, référencé 4 fois), le voir échouer, puis corriger. C'est le point le plus facile à rater de cette tâche.

- [ ] **Step 4: Écrire le test de la somme multi-FK**

```sql
DO $$
DECLARE
  v_cat  jsonb;
  v_key  text;
  v_type uuid;
  v_before bigint;
  v_after  bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- NON VACANT : on POSE des références sur DEUX tables différentes et on exige la SOMME
  -- exacte. L'assertion « la clé existe OU il y a des lignes » de la première rédaction
  -- était vraie dès qu'un catalogue n'était pas vide : elle ne testait rien.
  SELECT id INTO v_type FROM ref_legal_type WHERE code = 'kbis';
  v_key := jsonb_build_object('id', v_type)::text;

  v_cat := api.get_ref_catalog('ref_legal_type');
  v_before := COALESCE((v_cat->'usage'->>v_key)::bigint, 0);

  INSERT INTO object (id, object_type, name, status)
    VALUES ('CATMFK9999999901', 'HLO', 'Témoin multi-FK', 'draft');
  INSERT INTO object_legal (object_id, type_id, value)
    VALUES ('CATMFK9999999901', v_type, '{}'::jsonb);
  INSERT INTO object_legal (object_id, type_id, value)
    VALUES ('CATMFK9999999901', v_type, '{"value":"2"}'::jsonb);

  v_cat := api.get_ref_catalog('ref_legal_type');
  v_after := COALESCE((v_cat->'usage'->>v_key)::bigint, 0);

  ASSERT v_after = v_before + 2,
         format('le compteur doit SOMMER les références ; avant %s, après %s (attendu %s)',
                v_before, v_after, v_before + 2);

  RAISE NOTICE 'compteur multi-FK assertion passed';
END$$;
```

- [ ] **Step 5: Lancer, corriger la fusion, relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: lecture assertions passed` et `NOTICE: compteur multi-FK assertion passed`.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(§211): RPC de lecture des catalogues (maitre + detail)

list_ref_catalogs assemble decouverte et editorial ; get_ref_catalog decrit un
catalogue, ses valeurs et son compteur d'usage. Le compteur SOMME toutes les FK
entrantes decouvertes (ref_classification_scheme en a six) au lieu d'une choisie
a la main. Les domaines ref_code delegent a la phase 7.5, deja eprouvee.
Le test balaie les 103 catalogues : c'est lui qui attrapera une table dont la
forme casse le generateur."
```

---

### Task 4: RPC d'écriture

**Files:**
- Modify: `Base de donnée DLL et API/migration_ref_catalog_admin.sql`
- Modify: `Base de donnée DLL et API/tests/test_ref_catalog_admin.sql`

**Interfaces:**
- Consumes: `internal.v_ref_catalog`, `ref_catalog_registry`, les RPC phase 7.5.
- Produces:
  - `api.rpc_upsert_ref_row(p_catalog_key text, p_key jsonb, p_values jsonb) RETURNS jsonb` (la ligne écrite). `p_key` NULL ⇒ création ; sinon la clé complète de la ligne, `{"metric_id":"…","object_type":"HLO"}` pour une matrice.
  - `api.rpc_delete_ref_row(p_catalog_key text, p_key jsonb) RETURNS void`.

**Quatre exigences que la première rédaction avait manquées, toutes confirmées en base :**

1. **`p_key jsonb`, jamais `p_id uuid`.** 10 des 32 tables sortent du moule uuid simple. La clause `WHERE` se bâtit depuis **toutes** les colonnes de `primary_key_columns`, chacune citée `format(%I)` et castée au type découvert.
2. **Délégation `ref_code` en arguments NOMMÉS et sur QUATRE fonctions.** La signature est `(p_domain, p_name, p_id, p_code, …)` — `p_name` avant `p_code`. Un appel positionnel inversé écrit le code dans le libellé sans lever d'erreur. Et déléguer la seule `rpc_upsert_ref_code` perdrait l'activation et le réordonnancement des 52 domaines au moment où `RefCodeEditor` est absorbé : câbler aussi `rpc_set_ref_code_active` (quand `p_values` porte `is_active`), `rpc_reorder_ref_code` et `rpc_delete_ref_code`.
3. **`REQUIRED_HIDDEN_COLUMN` est une garde serveur réelle**, pas seulement un bouton grisé : à la création, une colonne obligatoire sans défaut absente du payload lève cette erreur. Sans elle, le code figurait dans la liste des erreurs de la spec sans exister nulle part.
4. **Le `DELETE` intercepte `foreign_key_violation`.** Une référence peut naître entre le comptage et la suppression — le compteur est le message lisible, la contrainte est la garde. Zéro ligne supprimée ⇒ `ROW_NOT_FOUND`, jamais un succès silencieux.

- [ ] **Step 1: Écrire les tests qui échouent — dont l'assertion de sécurité**

```sql
DO $$
DECLARE
  v_id  uuid;
  v_key jsonb;
  v_ok  boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- (1) CYCLE RÉEL sur un catalogue à clé uuid simple.
  v_id := (api.rpc_upsert_ref_row('ref_legal_type', NULL,
            '{"code":"temoin_211","name":"Témoin §211","category":"business","is_required":false}'::jsonb)
           ->>'id')::uuid;
  ASSERT v_id IS NOT NULL, 'la création doit rendre la ligne écrite';
  v_key := jsonb_build_object('id', v_id);

  -- Le cast typé fonctionne : sans lui, is_required (boolean) refuserait le texte de ->>.
  ASSERT (SELECT is_required FROM ref_legal_type WHERE id = v_id) = false,
         'une colonne booléenne doit être castée au type découvert, pas écrite en texte';

  PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"name":"Témoin §211 modifié"}'::jsonb);
  ASSERT (SELECT name FROM ref_legal_type WHERE id = v_id) = 'Témoin §211 modifié',
         'l''édition doit persister';

  -- Le code RENVOYÉ À L'IDENTIQUE est toléré : sinon aucun formulaire pré-rempli n'enregistre.
  PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key,
            '{"code":"temoin_211","name":"Témoin §211 bis"}'::jsonb);
  ASSERT (SELECT name FROM ref_legal_type WHERE id = v_id) = 'Témoin §211 bis',
         'renvoyer le même code ne doit pas bloquer l''enregistrement';

  -- Un code DIFFÉRENT est refusé.
  v_ok := false;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"code":"autre_code"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%CODE_IMMUTABLE%';
  END;
  ASSERT v_ok, 'changer le code d''une ligne existante doit lever CODE_IMMUTABLE';

  -- Colonne inconnue : ÉCHOUE, jamais ignorée en silence (piège d'écriture).
  v_ok := false;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"colonne_qui_nexiste_pas":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%UNKNOWN_COLUMN%';
  END;
  ASSERT v_ok, 'une colonne inconnue doit faire échouer l''appel, pas être ignorée';

  -- Colonne obligatoire sans défaut absente à la création ⇒ garde SERVEUR.
  v_ok := false;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_legal_type', NULL, '{"name":"Sans code"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%REQUIRED_HIDDEN_COLUMN%';
  END;
  ASSERT v_ok, 'une colonne obligatoire sans défaut absente doit lever REQUIRED_HIDDEN_COLUMN';

  -- Suppression refusée tant que référencée, puis acceptée à 0.
  INSERT INTO object (id, object_type, name, status) VALUES ('CATTST9999999901', 'HLO', 'Témoin', 'draft');
  INSERT INTO object_legal (object_id, type_id, value) VALUES ('CATTST9999999901', v_id, '{}'::jsonb);
  v_ok := false;
  BEGIN
    PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%STILL_REFERENCED%';
  END;
  ASSERT v_ok, 'supprimer une valeur référencée doit lever STILL_REFERENCED';

  DELETE FROM object_legal WHERE type_id = v_id;
  PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  ASSERT NOT EXISTS (SELECT 1 FROM ref_legal_type WHERE id = v_id),
         'à 0 référence, la suppression doit passer';

  -- Une seconde suppression ne doit PAS réussir en silence.
  v_ok := false;
  BEGIN
    PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ROW_NOT_FOUND%';
  END;
  ASSERT v_ok, 'supprimer une ligne inexistante doit lever ROW_NOT_FOUND';

  RAISE NOTICE 'cycle uuid assertions passed';
END$$;

-- Le test qui prouve que p_key jsonb tient : clé NATURELLE non-uuid, et clé COMPOSITE.
DO $$
DECLARE v_ok boolean; v_metric uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- (a) clé naturelle varchar(5) — ref_commune. Un p_id uuid rendrait ce catalogue inéditable.
  PERFORM api.rpc_upsert_ref_row('ref_commune', NULL,
            '{"insee_code":"97499","name":"Commune témoin §211"}'::jsonb);
  PERFORM api.rpc_upsert_ref_row('ref_commune', '{"insee_code":"97499"}'::jsonb,
            '{"name":"Commune témoin modifiée"}'::jsonb);
  ASSERT (SELECT name FROM ref_commune WHERE insee_code = '97499') = 'Commune témoin modifiée',
         'une clé primaire naturelle varchar doit permettre l''édition';
  PERFORM api.rpc_delete_ref_row('ref_commune', '{"insee_code":"97499"}'::jsonb);
  ASSERT NOT EXISTS (SELECT 1 FROM ref_commune WHERE insee_code = '97499'),
         'une clé primaire naturelle varchar doit permettre la suppression';

  -- (b) clé COMPOSITE — ref_capacity_applicability (metric_id, object_type).
  SELECT id INTO v_metric FROM ref_capacity_metric LIMIT 1;
  PERFORM api.rpc_delete_ref_row('ref_capacity_applicability',
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'))
    WHERE EXISTS (SELECT 1 FROM ref_capacity_applicability
                  WHERE metric_id = v_metric AND object_type = 'PRD');
  PERFORM api.rpc_upsert_ref_row('ref_capacity_applicability', NULL,
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'));
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability
                 WHERE metric_id = v_metric AND object_type = 'PRD'),
         'une matrice à clé composite doit être créable';
  PERFORM api.rpc_delete_ref_row('ref_capacity_applicability',
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'));
  ASSERT NOT EXISTS (SELECT 1 FROM ref_capacity_applicability
                     WHERE metric_id = v_metric AND object_type = 'PRD'),
         'une matrice à clé composite doit être supprimable';

  -- (c) relation SANS clé primaire : verrouillée d'office, sans ligne de registre.
  v_ok := false;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_interop_crosswalk', NULL, '{"source_system":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%LOCKED_CATALOG%';
  END;
  ASSERT v_ok, 'une relation sans clé primaire doit être verrouillée d''office';

  RAISE NOTICE 'identité générique (naturelle, composite, absente) assertions passed';
END$$;

-- Délégation ref_code : le NOM et le CODE ne doivent pas être inversés.
DO $$
DECLARE v_out jsonb; v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_out := api.rpc_upsert_ref_row('ref_code:cuisine_type', NULL,
             '{"code":"temoin_211","name":"Cuisine témoin §211"}'::jsonb);
  v_id := (v_out->>'id')::uuid;
  ASSERT (SELECT code FROM ref_code WHERE id = v_id) = 'temoin_211',
         'le code doit atterrir dans `code` — un appel positionnel l''écrirait dans `name`';
  ASSERT (SELECT name FROM ref_code WHERE id = v_id) = 'Cuisine témoin §211',
         'le libellé doit atterrir dans `name`';

  -- L'activation passe par la délégation : sans elle, absorber RefCodeEditor la perdrait.
  PERFORM api.rpc_upsert_ref_row('ref_code:cuisine_type',
            jsonb_build_object('id', v_id), '{"is_active":false}'::jsonb);
  ASSERT (SELECT is_active FROM ref_code WHERE id = v_id) = false,
         'l''interrupteur « actif » des domaines ref_code doit rester câblé';

  PERFORM api.rpc_delete_ref_row('ref_code:cuisine_type', jsonb_build_object('id', v_id));
  RAISE NOTICE 'délégation ref_code assertions passed';
END$$;

-- ASSERTION DE SÉCURITÉ — la liste blanche refuse vraiment.
-- Si celle-ci disparaît, « un RPC en SQL dynamique » devient une écriture arbitraire.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  BEGIN
    PERFORM api.rpc_upsert_ref_row('object', NULL, '{"name":"pwn"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : une écriture sur `object` a été acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNKNOWN_CATALOG%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM api.rpc_delete_ref_row('auth.users', '{"id":"00000000-0000-0000-0000-000000000000"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : une suppression dans auth.users a été acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNKNOWN_CATALOG%' THEN RAISE; END IF;
  END;

  -- Un catalogue verrouillé par le REGISTRE refuse l'écriture.
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_permission', NULL, '{"code":"x","name":"x"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture acceptée sur un catalogue verrouillé';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LOCKED_CATALOG%' THEN RAISE; END IF;
  END;

  -- Un domaine verrouillé par DÉRIVATION (api.ref_code_domain_is_editable) aussi.
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_code:taxonomy_hlo', NULL, '{"code":"x","name":"x"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture acceptée sur une taxonomie';
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

- [ ] **Step 3: Écrire les deux fonctions**

```sql
-- ---------------------------------------------------------------------------
-- 4. Écriture. SQL DYNAMIQUE — la discipline est non négociable :
--   (a) la relation est résolue CONTRE LA VUE, jamais contre la chaîne de l'appelant ;
--   (b) chaque clé du payload est validée contre les colonnes DÉCOUVERTES ; une
--       colonne inconnue fait ÉCHOUER l'appel — une valeur silencieusement jetée
--       est un piège d'écriture ;
--   (c) les identifiants passent par format(%I), les valeurs par USING, et chaque
--       valeur est castée au TYPE DÉCOUVERT (sans quoi une colonne booléenne refuse
--       le texte que rend l'opérateur ->>) ;
--   (d) `code` est figé après création — mais renvoyer le MÊME code est toléré,
--       sinon aucun formulaire pré-rempli ne peut enregistrer ;
--   (e) l'identité d'une ligne est p_key jsonb sur TOUTES les colonnes de clé primaire.
-- ---------------------------------------------------------------------------

-- Fragment « valeur castée au type découvert », réutilisé par l'INSERT, le SET et le WHERE.
-- Sans lui, (p_values->>'is_required') rend du texte et PostgreSQL refuse une colonne booléenne.
CREATE OR REPLACE FUNCTION internal.ref_catalog_cast_expr(p_columns jsonb, p_name text, p_src text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT format('(%s->>%L)::%s', p_src, p_name,
                COALESCE((SELECT c->>'type' FROM jsonb_array_elements(p_columns) c
                          WHERE c->>'name' = p_name), 'text'));
$$;

CREATE OR REPLACE FUNCTION api.rpc_upsert_ref_row(
  p_catalog_key text,
  p_key         jsonb,
  p_values      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v      record;
  v_key  text;
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

  -- Délégation phase 7.5 — ARGUMENTS NOMMÉS OBLIGATOIRES : la signature réelle est
  -- (p_domain, p_name, p_id, p_code, …), p_name AVANT p_code. Un appel positionnel qui
  -- suppose l'ordre inverse écrit le code dans le libellé, SANS lever d'erreur SQL.
  -- La délégation couvre l'activation ET le libellé : ne câbler que rpc_upsert_ref_code
  -- ferait perdre l'interrupteur « actif » des 52 domaines au moment où RefCodeEditor
  -- est absorbé — une régression fonctionnelle déguisée en refonte.
  IF v.kind = 'ref_code_domain' THEN
    IF p_values ? 'is_active' AND p_key IS NOT NULL THEN
      PERFORM api.rpc_set_ref_code_active(
        (p_key->>'id')::uuid, v.domain, (p_values->>'is_active')::boolean);
    END IF;
    IF p_values ?| ARRAY['code', 'name', 'name_i18n', 'position'] THEN
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

  IF NOT v.is_identifiable THEN
    RAISE EXCEPTION 'LOCKED_CATALOG: % — aucune clé primaire, une ligne n''y est pas identifiable',
      p_catalog_key USING ERRCODE = '42501';
  END IF;

  -- (b) validation stricte des colonnes du payload
  FOR v_key IN SELECT jsonb_object_keys(p_values) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.columns) c WHERE c->>'name' = v_key) THEN
      RAISE EXCEPTION 'UNKNOWN_COLUMN: % sur %', v_key, p_catalog_key USING ERRCODE = '22023';
    END IF;
    IF v_key IN ('created_at', 'updated_at')
       OR (p_key IS NOT NULL AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(v.primary_key_columns) k
             WHERE k->>'name' = v_key)) THEN
      RAISE EXCEPTION 'UNKNOWN_COLUMN: % est verrouillée', v_key USING ERRCODE = '22023';
    END IF;

    -- (d) code figé — mais un renvoi À L'IDENTIQUE est toléré, sinon aucun formulaire
    -- pré-rempli ne peut enregistrer une modification de libellé.
    IF v_key = 'code' AND p_key IS NOT NULL THEN
      EXECUTE format('SELECT code::text FROM public.%I WHERE %s',
                     v.table_name,
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

    v_cols := v_cols || quote_ident(v_key);
    v_args := v_args || internal.ref_catalog_cast_expr(v.columns, v_key, '$1');
    v_sets := v_sets || format('%I = %s', v_key,
                               internal.ref_catalog_cast_expr(v.columns, v_key, '$1'));
  END LOOP;

  IF p_key IS NULL THEN
    -- Garde SERVEUR « ajout impossible » : une colonne obligatoire sans valeur par défaut
    -- absente du payload. Sans elle, REQUIRED_HIDDEN_COLUMN figurerait dans la liste des
    -- erreurs de la spec sans exister nulle part, et son test serait vacant.
    SELECT c->>'name' INTO v_miss
    FROM jsonb_array_elements(v.columns) c
    WHERE (c->>'is_required')::boolean
      AND NOT (c->>'has_default')::boolean
      AND NOT (p_values ? (c->>'name'))
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.primary_key_columns) k
                      WHERE k->>'name' = c->>'name')
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
      INTO v_cur
    FROM jsonb_array_elements(v.primary_key_columns) k;

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
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v       record;
  f       record;
  v_n     bigint;
  v_total bigint := 0;
  v_where text;
  v_del   bigint;
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

  -- Le compteur est le MESSAGE LISIBLE (« 3 fiches »), pas la garde. Il ne sait compter
  -- que sur une clé simple : une matrice à clé composite n'est référencée par personne.
  IF jsonb_array_length(v.primary_key_columns) = 1 THEN
    FOR f IN SELECT * FROM jsonb_to_recordset(v.incoming_fk) AS x(tbl text, col text) LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = %s',
                     f.tbl, f.col,
                     internal.ref_catalog_cast_expr(v.columns,
                       v.primary_key_columns->0->>'name', '$1'))
        INTO v_n USING p_key;
      v_total := v_total + v_n;
    END LOOP;
    IF v_total > 0 THEN
      RAISE EXCEPTION 'STILL_REFERENCED: % référence(s)', v_total USING ERRCODE = '23503';
    END IF;
  END IF;

  SELECT string_agg(format('%I = %s', k->>'name',
           internal.ref_catalog_cast_expr(v.columns, k->>'name', '$1')), ' AND ')
    INTO v_where
  FROM jsonb_array_elements(v.primary_key_columns) k;

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

REVOKE ALL ON FUNCTION internal.ref_catalog_cast_expr(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rpc_upsert_ref_row(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rpc_delete_ref_row(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_upsert_ref_row(text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_delete_ref_row(text, jsonb) TO authenticated, service_role;
```

> **Le point le plus facile à rater ici** : `internal.ref_catalog_cast_expr` doit être écrite AVANT
> les deux RPC, et le type qu'elle interpole vient de `v.columns` — donc de la vue, jamais de
> l'appelant. Un type fourni par le client serait une injection. Écrire d'abord le test qui pose
> `is_required = true` sur `ref_legal_type` : sans cast, PostgreSQL lève `column is_required is
> of type boolean but expression is of type text`.

- [ ] **Step 4: Vérifier que la garde d'ajout est bien SERVEUR**

Le bloc de l'étape 1 couvre déjà `REQUIRED_HIDDEN_COLUMN` en **appelant le RPC**. La première
rédaction de ce plan proposait ici un test qui interrogeait la vue sans appeler aucune fonction :
il aurait été vert quelle que soit l'implémentation. Vérifier simplement que l'assertion de
l'étape 1 rougit quand on retire le bloc `REQUIRED_HIDDEN_COLUMN` de la fonction.

- [ ] **Step 5: Appliquer et relancer**

```bash
psql "$TBLS_DSN" -f "Base de donnée DLL et API/migration_ref_catalog_admin.sql"
psql "$TBLS_DSN" -f "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
```

Attendu : `NOTICE: écriture assertions passed`.

- [ ] **Step 6: Vérifier la non-vacuité par sabotage**

Neutraliser temporairement la validation de colonne (commenter le `RAISE EXCEPTION 'UNKNOWN_COLUMN'`), réappliquer, relancer le test : il **doit** rougir. Puis remettre la garde et vérifier le vert. Même exercice en remplaçant la résolution `FROM internal.v_ref_catalog` par une acceptation directe de `p_catalog_key` : l'assertion de sécurité doit rougir.

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/migration_ref_catalog_admin.sql" "Base de donnée DLL et API/tests/test_ref_catalog_admin.sql"
git commit -m "feat(§211): RPC d'ecriture generique sur les catalogues

SQL dynamique dont la liste blanche est la VUE d'introspection, jamais le
registre : une relation absente de la vue n'est pas ecrivable, donc une erreur
de seed ne peut pas ouvrir une ecriture vers object ou auth.users. Colonne
inconnue = echec, jamais ignoree en silence. Code fige apres creation.
Suppression refusee tant que reference, re-evaluee serveur.
Garde verifiee non vacante par sabotage."
```

---

### Task 5: Manifeste, runbook, garde CI

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`

**Interfaces:**
- Consumes: la migration et le test des tâches 1 à 4.
- Produces: rien de programmatique — l'intégrité de déploiement.

- [ ] **Step 1: Déclarer l'étape dans le driver CI**

Dans `ci_fresh_apply.sql`, **avant** la ligne `\echo '== I4f-final-test …'` :

```sql
\echo '== 16u    migration_ref_catalog_admin.sql  (211 administration generee des catalogues de reference : vue d introspection internal.v_ref_catalog qui decouvre les 30 tables ref_* autonomes et les 71 domaines ref_code avec leur forme, registre editorial ref_catalog_registry (nom lisible, famille, verrouillage motive, CHECK readonly_reason obligatoire), 4 RPC DEFINER gated superuser dont deux en SQL dynamique dont la LISTE BLANCHE EST LA VUE et jamais le registre ; les domaines ref_code delegent aux fonctions de la phase 7.5) =='
\ir migration_ref_catalog_admin.sql

\echo '== 16u-test garde permanente 211 (decouverte des deux especes / registre coherent et verrouillages motives / balayage des 103 catalogues par get_ref_catalog / cycle reel creer-editer-refuser-supprimer / ASSERTION DE SECURITE : une ecriture visant object ou auth.users leve UNKNOWN_CATALOG) =='
\ir tests/test_ref_catalog_admin.sql
```

- [ ] **Step 2: Ajouter l'entrée de manifeste au runbook**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, ajouter une ligne `16u.` dans la liste numérotée (juste avant la ligne `14. REFRESH MATERIALIZED VIEW…`), puis une section détaillée `## 16u — …` en fin de fichier, sur le modèle de la section `16t` existante. La section doit dire : ce que fait la migration, l'invariant « liste blanche = la vue », les verrouillages seedés, le fait qu'elle n'est **pas foldée** dans `schema_unified.sql` (dépendance à `api.is_platform_superuser` de `rls_policies.sql`), et qu'un `NOTIFY pgrst, 'reload schema'` **est requis** (quatre fonctions `api` neuves).

- [ ] **Step 3: Vérifier la cohérence du manifeste**

```bash
grep -n "16u" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
```

Attendu : au moins 2 occurrences dans le driver, 2 dans le runbook.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "chore(§211): declare l'etape 16u au manifeste et au driver CI

Sans cette declaration la migration serait une derive PROD-only, traitee comme
un incident (CLAUDE.md, Deploy integrity)."
```

---

### Task 6: Front pur — traduction colonne → contrôle

**Files:**
- Create: `bertel-tourism-ui/src/features/settings/catalog-fields.ts`
- Test: `bertel-tourism-ui/src/features/settings/catalog-fields.test.ts`

**Interfaces:**
- Consumes: la forme JSON rendue par `api.get_ref_catalog` (tâche 3).
- Produces:
  - `type CatalogColumn = { name: string; type: string; isRequired: boolean; hasDefault: boolean; enumValues: string[] | null }`
  - `type CatalogFk = { column: string; target: string }`
  - `type CatalogField = { name: string; kind: 'text' | 'i18n-text' | 'boolean' | 'number' | 'date' | 'select' | 'reference'; options?: string[]; target?: string; locked: boolean }`
  - `buildCatalogFieldSpec(columns: CatalogColumn[], fks: CatalogFk[], primaryKeyColumns: string[]): CatalogField[]`
  - `computeAddBlocked(columns: CatalogColumn[], fields: CatalogField[], primaryKeyColumns: string[]): string | null`
  - `buildRowKey(row: Record<string, unknown>, primaryKeyColumns: string[]): Record<string, unknown>` — l'identité d'une ligne, à passer telle quelle en `p_key`.

> **`primaryKeyColumns` est un tableau, pas un scalaire.** Cinq matrices ont une clé composite et
> `ref_code_taxonomy_closure` en a trois. Une signature `primaryKey: string | null` rendrait ces
> catalogues non éditables — c'est l'erreur que la revue du plan a rattrapée.

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
import { buildCatalogFieldSpec, computeAddBlocked } from './catalog-fields';

const col = (over: Partial<Parameters<typeof buildCatalogFieldSpec>[0][number]> = {}) => ({
  name: 'name', type: 'text', isRequired: false, hasDefault: false, enumValues: null, ...over,
});

describe('buildCatalogFieldSpec', () => {
  it('rend un champ texte pour text et varchar', () => {
    const spec = buildCatalogFieldSpec([col({ name: 'label', type: 'character varying(50)' })], [], ['id']);
    expect(spec[0]).toMatchObject({ name: 'label', kind: 'text' });
  });

  it('rend un interrupteur pour boolean', () => {
    const spec = buildCatalogFieldSpec([col({ name: 'is_public', type: 'boolean' })], [], ['id']);
    expect(spec[0].kind).toBe('boolean');
  });

  it('rend un champ nombre pour integer et numeric', () => {
    const spec = buildCatalogFieldSpec([col({ name: 'review_interval_days', type: 'integer' })], [], ['id']);
    expect(spec[0].kind).toBe('number');
  });

  it('rend une liste deroulante pour un enumere', () => {
    const spec = buildCatalogFieldSpec(
      [col({ name: 'kind', type: 'object_type', enumValues: ['HLO', 'RES'] })], [], ['id']);
    expect(spec[0]).toMatchObject({ kind: 'select', options: ['HLO', 'RES'] });
  });

  it('rend une reference pour une colonne portant une cle etrangere', () => {
    const spec = buildCatalogFieldSpec(
      [col({ name: 'family_id', type: 'uuid' })],
      [{ column: 'family_id', target: 'ref_code_amenity_family' }], ['id']);
    expect(spec[0]).toMatchObject({ kind: 'reference', target: 'ref_code_amenity_family' });
  });

  it('associe un champ texte a son i18n frere', () => {
    const spec = buildCatalogFieldSpec(
      [col({ name: 'name' }), col({ name: 'name_i18n', type: 'jsonb' })], [], ['id']);
    expect(spec.find((f) => f.name === 'name')?.kind).toBe('i18n-text');
    expect(spec.find((f) => f.name === 'name_i18n')).toBeUndefined();
  });

  it('masque jsonb, tableaux et geometrie', () => {
    const spec = buildCatalogFieldSpec([
      col({ name: 'metadata', type: 'jsonb' }),
      col({ name: 'tags', type: 'text[]' }),
      col({ name: 'geom', type: 'geometry' }),
    ], [], ['id']);
    expect(spec).toHaveLength(0);
  });

  it('verrouille la cle primaire et les horodatages', () => {
    const spec = buildCatalogFieldSpec([
      col({ name: 'id', type: 'uuid' }),
      col({ name: 'created_at', type: 'timestamp with time zone' }),
      col({ name: 'code' }),
    ], [], ['id']);
    expect(spec.find((f) => f.name === 'id')).toBeUndefined();
    expect(spec.find((f) => f.name === 'created_at')).toBeUndefined();
    expect(spec.find((f) => f.name === 'code')?.locked).toBe(false);
  });
});

describe('computeAddBlocked', () => {
  it('rend null quand toute colonne obligatoire est rendable', () => {
    const columns = [col({ name: 'code', isRequired: true }), col({ name: 'name', isRequired: true })];
    expect(computeAddBlocked(columns, buildCatalogFieldSpec(columns, [], ['id']), 'id')).toBeNull();
  });

  it('nomme la colonne obligatoire non rendable qui bloque la creation', () => {
    const columns = [
      col({ name: 'name', isRequired: true }),
      col({ name: 'metadata', type: 'jsonb', isRequired: true, hasDefault: false }),
    ];
    expect(computeAddBlocked(columns, buildCatalogFieldSpec(columns, [], ['id']), 'id')).toBe('metadata');
  });

  it('ignore une colonne obligatoire qui a une valeur par defaut', () => {
    const columns = [
      col({ name: 'name', isRequired: true }),
      col({ name: 'metadata', type: 'jsonb', isRequired: true, hasDefault: true }),
    ];
    expect(computeAddBlocked(columns, buildCatalogFieldSpec(columns, [], ['id']), 'id')).toBeNull();
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
 * §211 — traduction PURE d'une colonne PostgreSQL en contrôle d'édition.
 *
 * C'est le « générateur » de l'administration des catalogues : aucune règle n'est
 * écrite par catalogue, tout se déduit du type remonté par api.get_ref_catalog.
 *
 * Les types non rendables (jsonb libre, tableaux, géométrie) sont MASQUÉS — arbitrage
 * PO du 2026-08-07. C'est ce qui rend `computeAddBlocked` indispensable : une colonne
 * masquée, obligatoire et sans valeur par défaut rendrait la création impossible, et
 * l'utilisateur buterait sur une erreur PostgreSQL brute. On désactive l'ajout en
 * nommant la colonne, plutôt que de laisser échouer l'enregistrement.
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
  /** Saisissable à la création puis figé (cas de `code`). */
  locked: boolean;
}

/** Colonnes jamais éditables, quel que soit le catalogue. */
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
): CatalogField[] {
  const pk = new Set(primaryKeyColumns);
  const fkByColumn = new Map(fks.map((fk) => [fk.column, fk.target]));
  const names = new Set(columns.map((c) => c.name));
  const i18nSiblings = new Set(
    columns.filter((c) => c.name.endsWith('_i18n') && names.has(c.name.slice(0, -5))).map((c) => c.name),
  );

  const fields: CatalogField[] = [];
  for (const column of columns) {
    if (pk.has(column.name)) continue;
    if (ALWAYS_HIDDEN.has(column.name)) continue;
    if (i18nSiblings.has(column.name)) continue;
    if (!isRenderable(column, new Set(fkByColumn.keys()))) continue;

    const target = fkByColumn.get(column.name);
    if (target) {
      fields.push({ name: column.name, kind: 'reference', target, locked: false });
      continue;
    }
    if (column.enumValues && column.enumValues.length > 0) {
      fields.push({ name: column.name, kind: 'select', options: column.enumValues, locked: false });
      continue;
    }
    if (column.type === 'boolean') {
      fields.push({ name: column.name, kind: 'boolean', locked: false });
      continue;
    }
    if (NUMBER_TYPES.test(column.type)) {
      fields.push({ name: column.name, kind: 'number', locked: false });
      continue;
    }
    if (DATE_TYPES.test(column.type)) {
      fields.push({ name: column.name, kind: 'date', locked: false });
      continue;
    }
    fields.push({
      name: column.name,
      kind: i18nSiblings.has(`${column.name}_i18n`) ? 'i18n-text' : 'text',
      locked: false,
    });
  }
  return fields;
}

/**
 * Nom de la colonne qui empêche la création depuis l'interface, ou null.
 * Bloquante = obligatoire, sans valeur par défaut, et non rendue.
 */
export function computeAddBlocked(
  columns: CatalogColumn[],
  fields: CatalogField[],
  primaryKeyColumns: string[],
): string | null {
  const rendered = new Set(fields.map((f) => f.name));
  const pk = new Set(primaryKeyColumns);
  const blocking = columns.find(
    (c) =>
      c.isRequired &&
      !c.hasDefault &&
      !pk.has(c.name) &&
      !ALWAYS_HIDDEN.has(c.name) &&
      !rendered.has(c.name),
  );
  return blocking ? blocking.name : null;
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx jest src/features/settings/catalog-fields.test.ts
```

Attendu : `Tests: 11 passed`.

- [ ] **Step 5: Vérifier les types**

```bash
npx tsc --noEmit -p tsconfig.json
```

Attendu : sortie vide.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/catalog-fields.ts src/features/settings/catalog-fields.test.ts
git commit -m "feat(§211): traduction pure colonne PostgreSQL vers controle d'edition

Aucune regle par catalogue : le type remonte par get_ref_catalog decide du
controle. Les types non rendables sont masques (arbitrage PO), d'ou
computeAddBlocked qui nomme la colonne obligatoire non rendue plutot que de
laisser l'utilisateur buter sur une erreur PostgreSQL a l'enregistrement."
```

---

### Task 7: Service front `ref-catalogs.ts`

**Files:**
- Create: `bertel-tourism-ui/src/services/ref-catalogs.ts`
- Test: `bertel-tourism-ui/src/services/ref-catalogs.test.ts`

**Interfaces:**
- Consumes: les 4 RPC (tâches 3-4), `CatalogColumn`/`CatalogFk` (tâche 6).
- Produces:
  - `listRefCatalogs(): Promise<RefCatalogSummary[]>` où `RefCatalogSummary = { catalogKey, kind, label, family, usedIn, access, readonlyReason, nValues }`
  - `getRefCatalog(key: string): Promise<RefCatalogDetail>` où `RefCatalogDetail = { catalogKey, label, access, readonlyReason, isIdentifiable, primaryKeyColumns: string[], labelColumn, columns: CatalogColumn[], fks: CatalogFk[], rows: Record<string, unknown>[], usage: Record<string, number> }`
  - `upsertRefRow(key: string, rowKey: Record<string, unknown> | null, values: Record<string, unknown>): Promise<void>`
  - `deleteRefRow(key: string, rowKey: Record<string, unknown>): Promise<void>`

> `fks` vient de la clé `outgoing_fk` du RPC — **vérifier qu'elle est bien émise** avant d'écrire le
> service : la première rédaction du plan l'attendait côté front sans que le SQL la renvoie, donc
> aucune liste déroulante de référence n'aurait fonctionné.
> `usage` est clé par l'identité JSON sérialisée de la ligne, pas par un uuid.
  - `groupByFamily(catalogs: RefCatalogSummary[]): { family: string; catalogs: RefCatalogSummary[] }[]` — **pure**, « À classer » toujours en dernier.

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
import { groupByFamily, type RefCatalogSummary } from './ref-catalogs';

const cat = (over: Partial<RefCatalogSummary>): RefCatalogSummary => ({
  catalogKey: 'ref_x', kind: 'table', label: 'X', family: 'Juridique et conformité',
  usedIn: null, access: 'editable', readonlyReason: null, nValues: 0, ...over,
});

describe('groupByFamily', () => {
  it('regroupe par famille et trie les familles alphabetiquement', () => {
    const groups = groupByFamily([
      cat({ label: 'B', family: 'Restauration' }),
      cat({ label: 'A', family: 'Hébergement' }),
    ]);
    expect(groups.map((g) => g.family)).toEqual(['Hébergement', 'Restauration']);
  });

  it('place « A classer » en dernier, quel que soit l alphabet', () => {
    const groups = groupByFamily([
      cat({ label: 'A', family: 'À classer' }),
      cat({ label: 'B', family: 'Restauration' }),
    ]);
    expect(groups.at(-1)?.family).toBe('À classer');
  });

  it('trie les catalogues par libelle dans une famille', () => {
    const groups = groupByFamily([
      cat({ label: 'Zèbre', family: 'Hébergement' }),
      cat({ label: 'Abeille', family: 'Hébergement' }),
    ]);
    expect(groups[0].catalogs.map((c) => c.label)).toEqual(['Abeille', 'Zèbre']);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/services/ref-catalogs.test.ts
```

Attendu : `Cannot find module './ref-catalogs'`.

- [ ] **Step 3: Écrire le service**

Suivre exactement le gabarit de `src/services/ref-codes.ts` : `requireClient()`, `.schema('api').rpc(...)`, `if (error) throw new Error(error.message)`, normalisation en camelCase. Ajouter :

```typescript
/** Ordre des familles : alphabétique, « À classer » toujours en dernier — un catalogue
 *  non classé doit se voir, sans polluer le haut de la liste. */
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

- [ ] **Step 4: Lancer les tests et le type-check**

```bash
npx jest src/services/ref-catalogs.test.ts && npx tsc --noEmit -p tsconfig.json
```

Attendu : `Tests: 3 passed`, puis sortie vide.

- [ ] **Step 5: Commit**

```bash
git add src/services/ref-catalogs.ts src/services/ref-catalogs.test.ts
git commit -m "feat(§211): service front des catalogues de reference

Appels aux 4 RPC + groupByFamily (pur) : familles alphabetiques, « A classer »
toujours en dernier — un catalogue non classe doit se voir sans polluer le haut
de la liste."
```

---

### Task 8: Écran `RefCatalogAdmin` et bascule dans les réglages

**Files:**
- Create: `bertel-tourism-ui/src/views/RefCatalogAdmin.tsx`
- Test: `bertel-tourism-ui/src/views/RefCatalogAdmin.test.tsx`
- Modify: `bertel-tourism-ui/src/views/SettingsPage.tsx:786`
- Delete: `bertel-tourism-ui/src/views/RefCodeEditor.tsx` et `src/views/RefCodeEditor.test.tsx` s'il existe

**Interfaces:**
- Consumes: `listRefCatalogs`, `getRefCatalog`, `upsertRefRow`, `deleteRefRow`, `groupByFamily` (tâche 7) ; `buildCatalogFieldSpec`, `computeAddBlocked` (tâche 6).
- Produces: le composant `RefCatalogAdmin`.

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
import { render, screen } from '@testing-library/react';
import { RefCatalogAdmin } from './RefCatalogAdmin';

jest.mock('../services/ref-catalogs', () => ({
  ...jest.requireActual('../services/ref-catalogs'),
  listRefCatalogs: jest.fn(),
  getRefCatalog: jest.fn(),
}));

// … monter avec un QueryClientProvider, cf. le gabarit des autres tests de vues.

describe('RefCatalogAdmin', () => {
  it('affiche les familles avec leur compte, « A classer » en dernier', async () => {
    // listRefCatalogs → 1 catalogue en « Juridique et conformité », 1 en « À classer »
    render(<RefCatalogAdmin />);
    const families = await screen.findAllByRole('button', { name: /catalogues$/ });
    expect(families.at(-1)).toHaveTextContent('À classer');
  });

  it('affiche le motif de verrouillage d un catalogue en lecture seule', async () => {
    render(<RefCatalogAdmin />);
    expect(await screen.findByText(/lues en dur par le contrôle d'accès/)).toBeInTheDocument();
  });

  it('desactive l ajout et nomme la colonne bloquante', async () => {
    // getRefCatalog → une colonne `metadata` jsonb obligatoire sans défaut
    render(<RefCatalogAdmin />);
    const add = await screen.findByRole('button', { name: /Ajouter/ });
    expect(add).toBeDisabled();
    expect(screen.getByText(/metadata/)).toBeInTheDocument();
  });

  it('grise la corbeille tant que la valeur est referencee', async () => {
    // getRefCatalog → usage { 'id-1': 3 }
    render(<RefCatalogAdmin />);
    expect(await screen.findByRole('button', { name: /Supprimer/ })).toBeDisabled();
    expect(screen.getByText('3 fiches')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/views/RefCatalogAdmin.test.tsx
```

Attendu : `Cannot find module './RefCatalogAdmin'`.

- [ ] **Step 3: Écrire le composant**

Structure — reprendre la mécanique de `RefCodeEditor.tsx` (mêmes `useQuery`/`useMutation`, mêmes primitives `EmptyState`, `ConfirmDialog`, `Modal`, mêmes icônes `lucide-react`) et remplacer le maître à un niveau par un maître à deux niveaux :

- colonne de gauche : `groupByFamily(catalogs)` → un bloc par famille, chaque catalogue cliquable, avec son compte ; « À classer » teinté avertissement ;
- panneau de droite : en-tête (libellé, nom technique en `mono`, `used_in` s'il existe, bandeau de verrouillage avec `readonlyReason` si `access === 'readonly'`) ;
- tableau des valeurs : libellé (colonne `labelColumn`), code en `mono`, « utilisé par N », boutons éditer / supprimer ;
- modale d'édition : les champs viennent de `buildCatalogFieldSpec(columns, fks, primaryKey)`, un contrôle par `kind` ; le champ `code` est désactivé en édition ;
- bouton « Ajouter » : désactivé si `access === 'readonly'`, ou si `computeAddBlocked(...)` rend un nom — dans ce cas afficher « Ajout impossible depuis l'interface : la colonne `<nom>` est obligatoire et non éditable ici » ;
- recherche : filtre sur le libellé du catalogue **et** sur les libellés de valeurs.

Après chaque mutation réussie : invalider `['ref-catalogs']`, `['ref-catalog', key]` **et** `REFERENCE_CATALOGS_QUERY_KEY` (cache de session d'une heure côté rédacteurs, persisté — sans cette invalidation ils continuent de voir l'ancien vocabulaire).

- [ ] **Step 4: Basculer les réglages**

Dans `src/views/SettingsPage.tsx`, remplacer l'import et l'usage :

```tsx
import { RefCatalogAdmin } from './RefCatalogAdmin';
```

```tsx
{activeSection === 'referentiels' && role === 'super_admin' && (
  <article className="panel-card panel-card--wide">
    <div className="panel-heading">
      <div>
        <h2>Listes &amp; référentiels</h2>
        <p>Tous les catalogues de référence, rangés par famille. Les listes structurelles (taxonomies, registres, permissions) restent en lecture seule, avec leur motif.</p>
      </div>
    </div>
    <RefCatalogAdmin />
  </article>
)}
```

Puis supprimer `src/views/RefCodeEditor.tsx` (et son test s'il existe). Conserver `src/services/ref-codes.ts` et `src/views/ref-code-reorder.ts` : le réordonnancement et la modale i18n y sont réutilisés.

- [ ] **Step 5: Lancer la suite complète**

```bash
npx tsc --noEmit -p tsconfig.json && npx jest --silent
```

Attendu : `tsc` sans sortie ; suite verte, avec un nombre de suites supérieur d'au moins 3 au point de départ.

- [ ] **Step 6: Commit**

```bash
git add src/views/RefCatalogAdmin.tsx src/views/RefCatalogAdmin.test.tsx src/views/SettingsPage.tsx
git rm src/views/RefCodeEditor.tsx
git commit -m "feat(§211): ecran d'administration de tous les catalogues de reference

Maitre a deux niveaux (famille, catalogue) + detail des valeurs. Les 103
catalogues sont ranges par famille metier, « A classer » en dernier ; un
catalogue verrouille affiche son motif ; l'ajout est desactive en nommant la
colonne bloquante plutot que de laisser echouer l'enregistrement.
RefCodeEditor est absorbe, pas conserve en double."
```

---

### Task 9: Déploiement live, vérification, documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (gitignored, local)
- Modify: `CLAUDE.md` (gitignored, local)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la trace de décision.

- [ ] **Step 1: Répétition sur la base live, annulée**

Exécuter la migration entre `BEGIN;` et `ROLLBACK;` via le MCP Supabase, puis le corps du test, avant tout apply définitif. C'est la pratique maison : on ne découvre pas une erreur de forme en production.

- [ ] **Step 2: Appliquer**

```
mcp__supabase__apply_migration  name: ref_catalog_admin
```

puis :

```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Vérifier sur la base live**

```sql
SELECT count(*) FROM internal.v_ref_catalog;                       -- attendu : 103
SELECT jsonb_array_length(api.list_ref_catalogs());                 -- attendu : identique
SELECT count(*) FROM internal.v_ref_catalog v WHERE internal.ref_catalog_access(v.catalog_key) = 'readonly';  -- verrouilles derives + seedes
```

Puis rejouer le fichier de test complet en transaction annulée.

- [ ] **Step 4: Vérifier l'advisor**

```
mcp__supabase__get_advisors  type: security
```

Attendu : les flags `0028/0029_*_security_definer_function_executable` sur les 4 nouvelles RPC — **c'est normal** (classe §36). Toute autre alerte neuve doit être traitée.

- [ ] **Step 5: Écrire la décision §211**

Ajouter une section `## §211 — …` au journal, couvrant : le constat de départ (l'éditeur existant ne couvrait que 52 des 103 catalogues), les six arbitrages PO du tableau §2 de la spec, l'invariant « liste blanche = la vue, jamais le registre » et pourquoi l'inverse serait un élargissement de privilège, la garde « ajout impossible » comme conséquence directe du masquage des colonnes techniques, et la vérification par sabotage.

- [ ] **Step 6: Proposer l'invariant CLAUDE.md**

Ajouter une section, avant « Un concept filtrable n'a qu'UNE surface de saisie » :

> ### Une écriture générique s'autorise par INTROSPECTION, jamais par configuration (§211)
> Toute fonction qui écrit dans une relation nommée par l'appelant doit résoudre cette relation
> **contre une vue d'introspection du catalogue PostgreSQL**, jamais contre une table de
> configuration. Une allowlist de configuration transforme une erreur de seed en élargissement de
> privilège : une ligne fautive ouvre l'écriture vers `object` ou `auth.users`. La configuration ne
> doit pouvoir que **restreindre** (verrouiller un catalogue), jamais élargir. Corollaires :
> `format(%I)` pour les identifiants et `USING` pour les valeurs — jamais de concaténation ; une clé
> de payload absente des colonnes découvertes fait **échouer** l'appel, jamais ignorée en silence
> (une valeur jetée sans bruit est un piège d'écriture) ; et la garde CI doit contenir l'assertion
> « une écriture visant `object` lève `UNKNOWN_CATALOG` » — si elle disparaît, le RPC générique
> devient une écriture arbitraire.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs(§211): journal de decision et invariant d'ecriture generique"
```

---

## Révision du 2026-08-07 — ce qu'une revue a rattrapé

La première rédaction de ce plan était **non exécutable**. Quatre défauts bloquants, tous confirmés
par requête sur la base avant correction. Ils sont consignés parce que chacun est un piège qui se
reproduira dans le prochain générateur écrit contre un catalogue système :

1. **Le modèle d'identité ne couvrait pas les tables réelles.** Les RPC imposaient `p_id uuid` et une
   clé primaire simple. Mesuré : 10 des 32 tables sortent de ce moule — `ref_commune` a une PK
   `varchar(5)`, cinq matrices sont composites, `ref_code_taxonomy_closure` a trois colonnes, et
   `ref_interop_crosswalk` **n'a aucune clé primaire**. Au moins quatre catalogues annoncés éditables
   par la spec ne l'auraient pas été. Corrigé par `p_key jsonb` + `primary_key_columns[]` +
   `is_identifiable`.
2. **La délégation `ref_code` inversait le nom et le code.** La signature réelle est
   `(p_domain, p_name, p_id, p_code, …)` ; l'appel positionnel du plan supposait l'inverse. Il aurait
   écrit le code dans le libellé et le libellé dans le code, **sans lever la moindre erreur SQL** —
   une corruption silencieuse sur 52 vocabulaires. Corrigé par des arguments nommés, désormais une
   contrainte globale de ce plan.
3. **Les domaines `ref_code` n'avaient aucune description de colonnes.** Leur `reloid` étant NULL,
   `columns` valait `[]` et le générateur front n'aurait produit aucun champ de saisie pour
   71 catalogues sur 103. Corrigé par la synthèse de la forme éditable de `ref_code`.
4. **Le contrat oubliait les clés étrangères sortantes.** Le type front attendait `fks`, le RPC ne
   renvoyait jamais `outgoing_fk` : toute colonne pointant vers un autre catalogue serait retombée en
   saisie d'UUID à la main. Corrigé.

Corrections importantes du même passage : le compte est **103** et non 101 (un filtre par nom perdait
`ref_code_domain_registry` et `ref_code_taxonomy_closure`) ; deux tests étaient **vacants** (le
compteur multi-FK passait dès qu'une ligne existait, et le test « ajout impossible » n'appelait aucune
fonction — `REQUIRED_HIDDEN_COLUMN` n'existait nulle part) ; la résolution du libellé est une
**cascade** et non une déclaration, puisque 12 tables sur 32 n'ont pas de colonne `name` et que
`ref_sustainability_action` porte `label`, pas `title` ; la suppression intercepte
`foreign_key_violation` pour la course entre comptage et `DELETE`, et rend `ROW_NOT_FOUND` plutôt
qu'un succès silencieux ; l'absorption de `RefCodeEditor` délègue **quatre** fonctions de la phase 7.5
et non une, sans quoi activation et réordonnancement disparaîtraient ; et le verrouillage des domaines
suit `api.ref_code_domain_is_editable`, la fonction que l'écran actuel utilise déjà, plutôt qu'un
critère `is_taxonomy` plus étroit qui aurait fait diverger l'écran du backend.

---

## Auto-revue

**Couverture de la spec.** §1 problème → contexte du plan. §2 arbitrages → contraintes globales + tâches 2, 4, 6. §3.1 vue → tâche 1. §3.2 registre → tâche 2. §3.3 invariant de sécurité → tâche 4 étapes 1 et 6, plus l'invariant CLAUDE.md de la tâche 9. §3.4 verrouillages → seed tâche 2. §4.1 traduction → tâche 6. §4.2 colonnes verrouillées → tâches 4 et 6. §4.3 gardes → tâches 4 (serveur) et 6 (client). §4.4 délégation ref_code → tâches 3 et 4. §5 RPC + discipline → tâches 3 et 4. §5.1 erreurs typées → tâche 4. §6 front → tâches 6, 7, 8. §7 tests → réparti, les trois assertions non vacantes sont aux tâches 3 (balayage) et 4 (cycle, sécurité). §8 hors périmètre → non implémenté, par construction.

**Pièges signalés en encadré.** Deux passages avertissent d'un piège plutôt que de le laisser découvrir : la fusion additive des compteurs multi-FK (tâche 3) et l'ordre d'écriture de `internal.ref_catalog_cast_expr`, dont le type interpolé doit venir de la vue et jamais de l'appelant sous peine d'injection (tâche 4).

**Cohérence des noms.** `catalog_key` partout (SQL, service, composant) ; `p_key` / `rowKey` / `buildRowKey` désignent la même identité de bout en bout ; `primary_key_columns` (SQL) ↔ `primaryKeyColumns` (front) est un tableau des deux côtés ; `buildCatalogFieldSpec` / `computeAddBlocked` identiques entre tâches 6 et 8 ; `groupByFamily` entre 7 et 8 ; les codes d'erreur `UNKNOWN_CATALOG` / `LOCKED_CATALOG` / `UNKNOWN_COLUMN` / `CODE_IMMUTABLE` / `REQUIRED_HIDDEN_COLUMN` / `STILL_REFERENCED` / `ROW_NOT_FOUND` sont les mêmes dans les fonctions de la tâche 4, dans ses tests et dans la liste de la spec §5.1.
