# Filtre « Remplissage » de l'Exploreur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** donner aux éditeurs (et plus) un filtre d'Exploreur sur le remplissage d'une fiche, exprimé en **nombre d'essentiels manquants** et en **quels essentiels manquent**, avec une pastille sur la carte de résultat.

**Architecture:** le bundle des 8 essentiels visiteur, aujourd'hui écrit en dur dans `api.get_dashboard_completeness`, est extrait dans une vue `internal.v_object_essentials` que trois consommateurs partagent. Le filtrage se fait **à la volée sous garde `CASE`** (mesuré 23 ms corpus entier / 2,5 ms sur un seul essentiel), sans colonne cachée ni nouveau trigger. Le RPC des cartes, qui est `SECURITY INVOKER` et ne peut pas lire le schéma `internal`, passe par un helper `SECURITY DEFINER` dédié qui porte le gate « éditeur ».

**Tech Stack:** PostgreSQL 15 (Supabase), PostgREST, Next.js 15 / React 19 / TypeScript, Zustand, Jest + React Testing Library.

**Spec source :** `docs/superpowers/specs/2026-07-29-explorer-filtre-remplissage-design.md` — à lire en entier avant de commencer.

---

## Global Constraints

Ces règles s'appliquent à **toutes** les tâches. Les violer casse le projet même si les tests passent.

1. **Langue** : commentaires SQL et libellés d'interface en **français**. Le mot retenu est **« remplissage »**, jamais « complétude ».
2. **Les identifiants techniques ne sont PAS traduits** : les clés RPC restent `missing_essentials_buckets` / `missing_essentials_any`, la vue reste `v_object_essentials`. « Remplissage » est un libellé d'écran uniquement.
3. **Aucun DDL ne doit exister uniquement sur la base live.** Toute migration entre dans `Base de donnée DLL et API/ci_fresh_apply.sql` (le manifeste) **et** dans `docs/SQL_ROLLOUT_RUNBOOK.md`. Une migration appliquée seulement en PROD est traitée comme un incident.
4. **Garde `CASE`, jamais `OR`, pour tout prédicat coûteux.** `AND (garde IS NULL OR <coûteux>)` ne court-circuite pas — le planificateur réordonne les quals par coût. `AND CASE WHEN <garde> THEN TRUE ELSE <coûteux> END` court-circuite. Un `LEFT JOIN LATERAL (SELECT <coûteux> … WHERE <garde>)` ne garde rien non plus.
5. **Un test doit être non vacant.** Asserter qu'une clé est acceptée ne prouve rien. Le test crée des fiches témoins, exécute le **vrai** RPC, et exige l'**ensemble exact**. Il doit être vérifié **rouge par sabotage** avant d'être considéré comme une garde.
6. **Ne jamais recopier à la main le corps de `api.get_filtered_object_ids`** (43 378 caractères). Il se dérive de la définition live par script à ancres assertées — voir Tâche 4.
7. **Commit après chaque tâche**, message conventionnel (`feat:`, `fix:`, `test:`, `docs:`), **sans ligne `Co-Authored-By`**. Ne jamais `git push` — le propriétaire du dépôt pousse lui-même. Ne jamais `git commit --amend`.
8. **Ne jamais lancer `npm run test`** (mode watch, ne rend jamais la main). Utiliser `npm run test:run`.
9. Les 8 codes d'essentiels sont **exactement** ceux que `get_dashboard_completeness` émet déjà dans son champ `missing_fields` : `name`, `subcategory`, `location`, `contact`, `description`, `photos`, `type_block`, `tags`. Ne pas en inventer d'autres, ne pas les renommer.
10. Les 3 codes de palier sont : `complete` (0 manquant), `few` (1–2), `many` (3 et plus).

### Environnement — à vérifier une fois avant la Tâche 1

```bash
cd "C:/Users/dphil/Bertel3.0" && ls .env.schemaspy && ls .tmp_pgapply/apply_range.cjs .tmp_pgapply/run_sql_file.cjs
```

Attendu : les trois chemins existent. `.env.schemaspy` porte les identifiants du pooler (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) utilisés par les scripts `.cjs`.

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && ls node_modules/.bin/jest
```

Attendu : le chemin existe. S'il manque (worktree neuf), créer la jonction :
`mklink /J node_modules ..\bertel-tourism-ui\node_modules` depuis `cmd.exe`.

### ⚠️ Piège connu : `run_sql_file.cjs --validate`

Le drapeau `--validate` est censé remplacer le `COMMIT` final par un `ROLLBACK` pour valider sans persister. Une version antérieure de sa regex a **réellement appliqué en production**. Il a été durci depuis, mais : **ne jamais compter sur `--validate` comme filet de sécurité sur la base live.** Pour valider sans risque, écrire soi-même `BEGIN; … ROLLBACK;` dans le fichier.

---

## File Structure

### SQL — `Base de donnée DLL et API/`

| Fichier | Rôle |
|---|---|
| `migration_explorer_remplissage_filter.sql` | **créé** — la vue, le helper, les deux fonctions repatchées. Une seule migration : les quatre objets sont indissociables (la vue sans consommateur est morte, un consommateur sans la vue ne compile pas). |
| `tests/test_remplissage_filter.sql` | **créé** — garde permanente CI : parité Dashboard, non-vacuité du filtre, gardes du helper. |
| `ci_fresh_apply.sql` | **modifié** — deux `\ir` en fin de manifeste (étape `16r`). |
| `api_views_functions.sql` | **modifié** — repli (« fold ») de la définition finale, pour qu'une base fraîche reproduise la live. |

### Frontend — `bertel-tourism-ui/src/`

| Fichier | Rôle |
|---|---|
| `types/domain.ts` | **modifié** — 2 champs de filtre + 2 types de codes + 1 champ sur `ObjectCard`. |
| `utils/facets.ts` | **modifié** — valeurs par défaut + émission des 2 clés RPC. |
| `store/explorer-store.ts` | **modifié** — 2 setters + purge à la perte du droit d'édition. |
| `utils/remplissage.ts` | **créé** — libellés et seuils de couleur, purs. Fichier séparé parce que trois composants les consomment (panneau, carte, table) : les poser dans l'un d'eux forcerait les deux autres à importer depuis un composant. |
| `components/explorer/FiltersPanel.tsx` | **modifié** — le groupe « Remplissage », gaté. |
| `components/explorer/explorer-active-chips.ts` | **modifié** — 2 groupes de puces. |
| `components/explorer/ResultCardView.tsx` | **modifié** — la pastille. |
| `components/explorer/table-columns.tsx` | **modifié** — la colonne. |
| `store/explorer-view-store.ts` | **modifié** — l'id de colonne dans le registre. |
| `features/object-editor/widgets/CompletionRing.tsx`, `components/dashboard/CompletenessTable.tsx`, `components/dashboard/ScorecardStrip.tsx`, `features/help/content/pilotage.ts` | **modifiés** — renommage de libellés. |

Tests Jest : un fichier `*.test.ts(x)` **à côté** de chaque fichier testé (convention du dépôt).

---

## Task 1: La vue `internal.v_object_essentials` et le rebranchement du Dashboard

**Files:**
- Create: `Base de donnée DLL et API/migration_explorer_remplissage_filter.sql`
- Create: `Base de donnée DLL et API/tests/test_remplissage_filter.sql`
- Reference (lire, ne pas modifier) : `Base de donnée DLL et API/api_views_functions.sql:10097-10250`

**Interfaces:**
- Produces:
  - `internal.v_object_essentials(object_id text, object_type object_type, e_name boolean, e_subcat boolean, e_location boolean, e_contact boolean, e_desc boolean, n_photos bigint, photo_target int, e_typeblock boolean, e_tags boolean, missing_essentials text[])`
  - `api.get_dashboard_completeness` inchangée en **signature et en résultat**, mais lisant la vue.

**Pourquoi cette tâche d'abord :** tant que la vue n'existe pas, rien d'autre ne compile. Et la rebrancher sur le Dashboard **maintenant** force la garde de parité : si la vue ne reproduit pas exactement le bundle d'origine, on le sait tout de suite, sur une surface dont les chiffres sont déjà connus.

- [ ] **Step 1: Lire la définition d'origine du bundle**

```bash
cd "C:/Users/dphil/Bertel3.0" && sed -n '10084,10250p' "Base de donnée DLL et API/api_views_functions.sql"
```

Repérer les CTE `ess` (les 8 essentiels) et `scored` (le tableau `missing_fields`). La vue doit reproduire ces expressions **à l'identique**. Ne rien « améliorer » au passage : toute modification déplacerait les chiffres du Dashboard, et la garde de parité de l'étape 4 rougirait.

- [ ] **Step 2: Écrire la migration — en-tête, vue, rebranchement**

Créer `Base de donnée DLL et API/migration_explorer_remplissage_filter.sql` :

```sql
-- migration_explorer_remplissage_filter.sql
-- §204 — Filtre « Remplissage » de l'Exploreur (manifest 16r).
--
-- Le bundle des 8 essentiels visiteur était écrit EN DUR dans le corps de
-- api.get_dashboard_completeness. Trois consommateurs le veulent désormais
-- (Dashboard, filtre Exploreur, cartes) : le recopier garantirait trois copies
-- divergentes. Il vit maintenant dans internal.v_object_essentials.
--
-- POURQUOI DES BOOLÉENS EN COLONNES SÉPARÉES, et pas seulement le tableau :
-- PostgreSQL élague les colonnes de CTE/vue non consommées. Un filtre sur UN
-- essentiel (« sans photo ») ne lit qu'une colonne → 2,5 ms mesurés, contre
-- 23 ms pour les 8. Fusionner les booléens dans le seul tableau ferait payer
-- 23 ms au cas le plus courant.
--
-- POURQUOI PAS UNE COLONNE CACHÉE SUR object : il faudrait ~8 nouveaux triggers
-- (media, contact_channel, object_location, tag_link, object_capacity,
-- object_room_type, object_act, object_iti, object_fma — aucune ne porte
-- aujourd'hui trg_refresh_object_filter_caches_from_child) PLUS un backfill qui
-- pousse updated_at sur tout le corpus, donc une re-synchro partenaires
-- complète. Le calcul à la volée coûte moins cher et reste toujours frais.
--
-- Idempotent et fresh-safe (CREATE OR REPLACE partout, aucune donnée touchée).
\set ON_ERROR_STOP on
BEGIN;

-- ---- 1) La vue : UNE définition du bundle -----------------------------------
-- Les expressions sont reprises À L'IDENTIQUE de api.get_dashboard_completeness
-- (api_views_functions.sql, CTE `ess`). Toute divergence déplacerait les
-- chiffres du Dashboard — c'est ce que garde tests/test_remplissage_filter.sql.
--
-- STRUCTURE : un CTE `base` calcule CHAQUE essentiel UNE FOIS, le SELECT externe
-- dérive le tableau depuis ces booléens. Ne PAS recopier les expressions dans le
-- ARRAY_REMOVE : ce serait deux copies du calcul dans le fichier même qui existe
-- pour en supprimer les copies — et la première divergence serait silencieuse.
CREATE OR REPLACE VIEW internal.v_object_essentials AS
WITH base AS (
SELECT
  o.id                                                                          AS object_id,
  o.object_type,
  (o.name IS NOT NULL AND btrim(o.name) <> '')                                  AS e_name,
  EXISTS (SELECT 1 FROM object_taxonomy x WHERE x.object_id = o.id)             AS e_subcat,
  EXISTS (SELECT 1 FROM object_location l WHERE l.object_id = o.id
          AND (NULLIF(btrim(l.city), '') IS NOT NULL OR l.code_insee IS NOT NULL
               OR (l.latitude IS NOT NULL AND l.longitude IS NOT NULL)))        AS e_location,
  EXISTS (SELECT 1 FROM contact_channel c WHERE c.object_id = o.id
          AND c.is_public AND NULLIF(btrim(c.value), '') IS NOT NULL)           AS e_contact,
  EXISTS (SELECT 1 FROM object_description d WHERE d.object_id = o.id
          AND d.org_object_id IS NULL
          AND NULLIF(btrim(d.description), '') IS NOT NULL
          AND NULLIF(btrim(d.description_chapo), '') IS NOT NULL)               AS e_desc,
  (SELECT COUNT(*) FROM media m WHERE m.object_id = o.id)                       AS n_photos,
  -- Cible photos par type (décision PO 2026-06-18) : FMA = 1 (une affiche suffit
  -- pour un événement) ; PSV/VIL/COM/SPU = 2 ; sinon 4.
  (CASE WHEN o.object_type = 'FMA' THEN 1
        WHEN o.object_type IN ('PSV','VIL','COM','SPU') THEN 2
        ELSE 4 END)                                                             AS photo_target,
  CASE
    WHEN o.object_type IN ('HOT','HPA','HLO','CAMP','RVA') THEN
      EXISTS (SELECT 1 FROM object_capacity c JOIN ref_capacity_metric mt ON mt.id = c.metric_id
              WHERE c.object_id = o.id AND mt.code = 'max_capacity' AND c.value_integer IS NOT NULL)
      OR EXISTS (SELECT 1 FROM object_room_type r WHERE r.object_id = o.id)
    WHEN o.object_type = 'RES' THEN
      EXISTS (SELECT 1 FROM object_capacity c JOIN ref_capacity_metric mt ON mt.id = c.metric_id
              WHERE c.object_id = o.id AND mt.code = 'seats' AND c.value_integer IS NOT NULL)
      OR EXISTS (SELECT 1 FROM object_menu mn WHERE mn.object_id = o.id)
    WHEN o.object_type IN ('ASC','ACT') THEN EXISTS (SELECT 1 FROM object_act a WHERE a.object_id = o.id)
    WHEN o.object_type = 'ITI' THEN EXISTS (SELECT 1 FROM object_iti i WHERE i.object_id = o.id)
    WHEN o.object_type = 'FMA' THEN EXISTS (SELECT 1 FROM object_fma ev WHERE ev.object_id = o.id)
    ELSE EXISTS (SELECT 1 FROM object_amenity am WHERE am.object_id = o.id)
  END                                                                           AS e_typeblock,
  EXISTS (SELECT 1 FROM tag_link tl WHERE tl.target_table = 'object' AND tl.target_pk = o.id) AS e_tags
FROM object o
WHERE o.object_type <> 'ORG'
)
SELECT
  b.object_id, b.object_type,
  b.e_name, b.e_subcat, b.e_location, b.e_contact, b.e_desc,
  b.n_photos, b.photo_target, b.e_typeblock, b.e_tags,
  -- Dérivé des booléens ci-dessus, jamais recalculé. L'ordre est stable : il
  -- fixe l'ordre d'affichage du détail dans la pastille et la colonne Table.
  ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT b.e_name                     THEN 'name'        END,
    CASE WHEN NOT b.e_subcat                   THEN 'subcategory' END,
    CASE WHEN NOT b.e_location                 THEN 'location'    END,
    CASE WHEN NOT b.e_contact                  THEN 'contact'     END,
    CASE WHEN NOT b.e_desc                     THEN 'description' END,
    CASE WHEN b.n_photos < b.photo_target      THEN 'photos'      END,
    CASE WHEN NOT b.e_typeblock                THEN 'type_block'  END,
    CASE WHEN NOT b.e_tags                     THEN 'tags'        END
  ], NULL)                                                                      AS missing_essentials
FROM base b;

COMMENT ON VIEW internal.v_object_essentials IS
'§204 — bundle des 8 essentiels visiteur, source UNIQUE partagée par api.get_dashboard_completeness,
api.get_filtered_object_ids et api.object_missing_essentials. Booléens exposés en colonnes SÉPARÉES
volontairement : PostgreSQL élague les colonnes non consommées, donc un filtre sur un seul essentiel
coûte 2,5 ms au lieu de 23 ms. ORG exclus. n_photos = COUNT(media) (approximation héritée : vidéos et
documents inclus).';

COMMIT;
```

**Note :** aucun `GRANT` sur la vue. Elle vit dans `internal`, où seuls les corps `SECURITY DEFINER` la lisent. Lui donner un `GRANT` à `authenticated` l'exposerait sans passer par les gardes.

- [ ] **Step 3: Appliquer la migration sur la base live**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql"
```

Attendu : une ligne `OK` sans erreur. En cas d'échec, le `BEGIN`/`COMMIT` du fichier a tout annulé — corriger et relancer.

- [ ] **Step 4: Vérifier la parité AVANT rebranchement**

Le Dashboard n'est pas encore rebranché ; on compare donc la vue au calcul d'origine, qui tourne toujours.

```bash
cd "C:/Users/dphil/Bertel3.0" && cat > .tmp_pgapply/_parite_204.sql <<'SQL'
WITH depuis_la_vue AS (
  SELECT object_type::text AS t,
         COUNT(*) AS total,
         ROUND(AVG(ROUND(100.0 * (
           e_name::int + e_subcat::int + e_location::int + e_contact::int + e_desc::int
           + LEAST(n_photos::numeric / photo_target, 1.0) + e_typeblock::int + e_tags::int
         ) / 8.0)::int))::int AS avg_score
  FROM internal.v_object_essentials
  GROUP BY 1
),
depuis_le_rpc AS (
  SELECT r->>'type' AS t, (r->>'total')::int AS total, (r->>'avg_score')::int AS avg_score
  FROM jsonb_array_elements(
    api.get_dashboard_completeness(NULL, NULL, '{}'::jsonb, NULL, NULL, 0) -> 'rows'
  ) AS r
)
SELECT COALESCE(v.t, c.t) AS type, v.total AS vue_total, c.total AS rpc_total,
       v.avg_score AS vue_score, c.avg_score AS rpc_score
FROM depuis_la_vue v FULL OUTER JOIN depuis_le_rpc c ON c.t = v.t
WHERE v.total IS DISTINCT FROM c.total OR v.avg_score IS DISTINCT FROM c.avg_score;
SQL
node .tmp_pgapply/run_sql_file.cjs .tmp_pgapply/_parite_204.sql
```

Attendu : **0 ligne**. Chaque ligne rendue est un type dont la vue ne reproduit pas le calcul d'origine — corriger la vue, pas la requête de contrôle.

- [ ] **Step 5: Rebrancher `api.get_dashboard_completeness` sur la vue**

Ajouter dans la migration, **avant** le `COMMIT` :

```sql
-- ---- 2) Le Dashboard lit la vue au lieu de sa copie interne -----------------
-- `internal` DOIT être ajouté au search_path : la fonction est DEFINER mais son
-- search_path d'origine ne le contient pas (vérifié en base). Sans lui, l'appel
-- échoue À L'EXÉCUTION seulement — invisible au déploiement (classe §29).
CREATE OR REPLACE FUNCTION api.get_dashboard_completeness(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL,
  p_below_limit     INT             DEFAULT 10
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t FROM unnest(enum_range(null::object_type)) AS t WHERE t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scored AS (
    SELECT
      e.object_id AS id, e.object_type, o.name,
      ROUND(100.0 * (
        e.e_name::int + e.e_subcat::int + e.e_location::int + e.e_contact::int + e.e_desc::int
        + LEAST(e.n_photos::numeric / e.photo_target, 1.0) + e.e_typeblock::int + e.e_tags::int
      ) / 8.0)::int AS score,
      (e.e_name AND e.e_subcat AND e.e_location AND e.e_contact AND e.e_desc
       AND e.n_photos >= e.photo_target AND e.e_typeblock AND e.e_tags) AS complete,
      e.missing_essentials AS missing_fields
    FROM   internal.v_object_essentials e
    JOIN   object o        ON o.id = e.object_id
    JOIN   filtered_ids f  ON f.object_id = e.object_id
    WHERE  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  field_gaps AS (
    SELECT object_type, mf, COUNT(*) AS gaps
    FROM   scored, LATERAL unnest(missing_fields) AS mf
    GROUP  BY object_type, mf
  ),
  top_gap AS (
    SELECT DISTINCT ON (object_type) object_type, mf AS missing_top_field
    FROM   field_gaps
    ORDER  BY object_type, gaps DESC, mf
  ),
  below AS (
    SELECT object_type,
           jsonb_agg(
             jsonb_build_object('id', id, 'name', name, 'score', score,
                                'missing_fields', to_jsonb(missing_fields))
             ORDER BY score ASC, name
           ) FILTER (WHERE rn <= p_below_limit) AS below_80
    FROM (
      SELECT id, object_type, name, score, missing_fields,
             ROW_NUMBER() OVER (PARTITION BY object_type ORDER BY score ASC, name) AS rn
      FROM   scored
      WHERE  score < 80
    ) ranked
    GROUP BY object_type
  ),
  agg AS (
    SELECT object_type,
           COUNT(*)                                                                  AS total,
           ROUND(AVG(score))::int                                                    AS avg_score,
           ROUND(100.0 * COUNT(*) FILTER (WHERE complete) / NULLIF(COUNT(*), 0), 1)  AS complete_pct
    FROM   scored
    GROUP  BY object_type
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type',              a.object_type::text,
          'total',             a.total,
          'avg_score',         a.avg_score,
          'complete_pct',      a.complete_pct,
          'missing_top_field', COALESCE(g.missing_top_field, ''),
          'below_80',          COALESCE(b.below_80, '[]'::jsonb)
        )
        ORDER BY a.total DESC
      ),
      '[]'::jsonb
    )
  )
  FROM   agg a
  LEFT   JOIN top_gap g ON g.object_type = a.object_type
  LEFT   JOIN below   b ON b.object_type = a.object_type;
$$;

COMMENT ON FUNCTION api.get_dashboard_completeness IS
'Dashboard Qualité: remplissage « perçu visiteur » par type. Lit internal.v_object_essentials
(§204, source unique du bundle) — le calcul était auparavant recopié dans ce corps. Par type: score
moyen 0-100, % fiches complètes-visiteur, essentiel le plus manquant, liste des fiches <80
(plafonnée par p_below_limit). ORG exclus. p_updated_at_from/to bornes DATE inclusives.';

GRANT EXECUTE ON FUNCTION api.get_dashboard_completeness(object_type[], object_status[], jsonb, date, date, int)
  TO authenticated, service_role;
```

**Attention :** la signature, les valeurs par défaut et la forme du JSON rendu sont **inchangées**. Le front (`services/dashboard-rpc.ts`, type `DashboardCompleteness` marqué LOCKED) ne doit rien changer.

- [ ] **Step 6: Ré-appliquer et re-vérifier la parité**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" && node .tmp_pgapply/run_sql_file.cjs .tmp_pgapply/_parite_204.sql
```

Attendu : `OK` puis **0 ligne**. La requête de contrôle compare maintenant la vue au RPC rebranché — elle doit être trivialement vide ; si elle ne l'est pas, le rebranchement a changé le calcul.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" && git commit -m "feat(sql): internal.v_object_essentials, source unique du bundle des 8 essentiels

Le bundle etait ecrit en dur dans get_dashboard_completeness. Trois
consommateurs le veulent : le recopier garantirait trois copies divergentes.

Booleens en colonnes SEPAREES : PostgreSQL elague les colonnes non
consommees, donc un filtre sur un seul essentiel coute 2,5 ms au lieu de 23.

get_dashboard_completeness rebranche dessus, resultat inchange (parite
verifiee live, 0 ecart par type). internal ajoute a son search_path : il
n y etait pas, l appel aurait echoue a l execution seulement."
```

---

## Task 2: Le helper `api.object_missing_essentials`

**Files:**
- Modify: `Base de donnée DLL et API/migration_explorer_remplissage_filter.sql`

**Interfaces:**
- Consumes: `internal.v_object_essentials` (Tâche 1)
- Produces: `api.object_missing_essentials(p_object_ids TEXT[]) RETURNS TABLE(object_id TEXT, missing TEXT[])` — `SECURITY DEFINER`. Rend **0 ligne** si l'appelant n'est pas éditeur. Consommé par la Tâche 4.

**Pourquoi un helper séparé :** `api.list_object_resources_filtered_page` est `SECURITY INVOKER` (vérifié en base) et le rôle `authenticated` n'a pas `USAGE` sur le schéma `internal`. Lui ajouter `internal` au `search_path` ne suffirait pas — ce sont les droits de l'appelant qui s'appliquent. Le helper est le seul moyen propre, et il concentre les deux gardes en un point.

- [ ] **Step 1: Écrire le test d'abord (il doit échouer)**

Créer `Base de donnée DLL et API/tests/test_remplissage_filter.sql` :

```sql
-- test_remplissage_filter.sql
-- Garde permanente du filtre « Remplissage » (§204, manifest 16r).
-- NON VACUITÉ : chaque bloc crée des fiches témoins aux trous CONNUS et exécute
-- le VRAI RPC. Asserter qu'une clé est acceptée ne prouverait rien.
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_missing text[];
BEGIN
  -- ---------- Témoins ----------
  -- RMP…01 : complète (0 manquant). RMP…02 : sans photo uniquement (1 manquant).
  -- RMP…03 : sans photo, sans contact, sans tag, sans descriptif (4 manquants).
  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    ('RMPLIS9999999901', 'HLO', 'Remplissage complete',  'published', now()),
    ('RMPLIS9999999902', 'HLO', 'Remplissage sans photo','published', now()),
    ('RMPLIS9999999903', 'HLO', 'Remplissage tres vide', 'published', now());

  -- Les catalogues se résolvent par sous-requête, jamais par un UUID en dur.
  -- ATTENTION aux colonnes obligatoires, vérifiées en base :
  --   object_taxonomy : (object_id, domain, ref_code_id) — FK COMPOSITE (ref_code_id, domain)
  --   contact_channel : kind_id (uuid → ref_code domaine 'contact_kind'), PAS une colonne `kind`
  --   media           : media_type_id (uuid → ref_code domaine 'media_type') est NOT NULL
  -- Omettre l'une des trois fait échouer l'insertion, pas le test.
  --
  -- LE BLOC TYPE DÉPEND DU TYPE D'OBJET. Les témoins sont des HLO : pour cette
  -- famille, `e_typeblock` exige une CAPACITÉ `max_capacity` ou une CHAMBRE —
  -- `object_amenity` ne compte que pour la branche ELSE (les autres types). Y
  -- mettre une commodité donnerait un témoin « complet » à 1 manquant et un
  -- témoin « à 4 » à 5 : le test échouerait sans que la cause soit lisible.

  -- 01 : tout présent.
  INSERT INTO object_taxonomy (object_id, domain, ref_code_id)
    SELECT 'RMPLIS9999999901', 'taxonomy_hlo', id FROM ref_code WHERE domain = 'taxonomy_hlo' LIMIT 1;
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES ('RMPLIS9999999901', 'Saint-Pierre', TRUE);
  INSERT INTO contact_channel (object_id, kind_id, value, is_public)
    SELECT 'RMPLIS9999999901', id, '0262000001', TRUE
    FROM ref_code WHERE domain = 'contact_kind' LIMIT 1;
  INSERT INTO object_description (object_id, description, description_chapo)
    VALUES ('RMPLIS9999999901', 'Descriptif complet.', 'Chapo.');
  INSERT INTO media (object_id, media_type_id, url)          -- cible HLO = 4
    SELECT 'RMPLIS9999999901', (SELECT id FROM ref_code WHERE domain = 'media_type' LIMIT 1),
           'https://exemple.test/' || g
    FROM generate_series(1, 4) g;
  INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT 'RMPLIS9999999901', id, 4 FROM ref_capacity_metric WHERE code = 'max_capacity';
  INSERT INTO tag_link (target_table, target_pk, tag_id)
    SELECT 'object', 'RMPLIS9999999901', id FROM ref_tag LIMIT 1;

  -- 02 : identique à 01 SAUF les photos (0).
  INSERT INTO object_taxonomy (object_id, domain, ref_code_id)
    SELECT 'RMPLIS9999999902', 'taxonomy_hlo', id FROM ref_code WHERE domain = 'taxonomy_hlo' LIMIT 1;
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES ('RMPLIS9999999902', 'Saint-Pierre', TRUE);
  INSERT INTO contact_channel (object_id, kind_id, value, is_public)
    SELECT 'RMPLIS9999999902', id, '0262000002', TRUE
    FROM ref_code WHERE domain = 'contact_kind' LIMIT 1;
  INSERT INTO object_description (object_id, description, description_chapo)
    VALUES ('RMPLIS9999999902', 'Descriptif complet.', 'Chapo.');
  INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT 'RMPLIS9999999902', id, 4 FROM ref_capacity_metric WHERE code = 'max_capacity';
  INSERT INTO tag_link (target_table, target_pk, tag_id)
    SELECT 'object', 'RMPLIS9999999902', id FROM ref_tag LIMIT 1;

  -- 03 : seulement sous-catégorie, lieu et bloc type.
  INSERT INTO object_taxonomy (object_id, domain, ref_code_id)
    SELECT 'RMPLIS9999999903', 'taxonomy_hlo', id FROM ref_code WHERE domain = 'taxonomy_hlo' LIMIT 1;
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES ('RMPLIS9999999903', 'Le Tampon', TRUE);
  INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT 'RMPLIS9999999903', id, 4 FROM ref_capacity_metric WHERE code = 'max_capacity';

  -- ---------- (A) La vue voit exactement les bons trous ----------
  SELECT missing_essentials INTO v_missing
  FROM internal.v_object_essentials WHERE object_id = 'RMPLIS9999999901';
  ASSERT v_missing = '{}'::text[],
    format('01 doit n''avoir AUCUN essentiel manquant ; obtenu: %s', v_missing);

  SELECT missing_essentials INTO v_missing
  FROM internal.v_object_essentials WHERE object_id = 'RMPLIS9999999902';
  ASSERT v_missing = ARRAY['photos'],
    format('02 ne doit manquer QUE de photos ; obtenu: %s', v_missing);

  SELECT missing_essentials INTO v_missing
  FROM internal.v_object_essentials WHERE object_id = 'RMPLIS9999999903';
  ASSERT v_missing @> ARRAY['photos','contact','description','tags']
     AND cardinality(v_missing) = 4,
    format('03 doit manquer exactement photos+contact+description+tags ; obtenu: %s', v_missing);

  RAISE NOTICE 'Bloc A (vue) OK.';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Lancer le test — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_remplissage_filter.sql"
```

Attendu à ce stade : **PASSE** (le bloc A ne teste que la vue de la Tâche 1). Si un `ASSERT` échoue, la vue est fausse — corriger la Tâche 1 avant d'aller plus loin. Ce bloc est le filet qui prouve que les témoins des blocs suivants ont bien les trous annoncés.

- [ ] **Step 3: Écrire le helper**

Ajouter dans `migration_explorer_remplissage_filter.sql`, avant le `COMMIT` :

```sql
-- ---- 3) Helper pour le chemin CARTES ----------------------------------------
-- api.list_object_resources_filtered_page est SECURITY INVOKER et ne peut pas
-- lire le schéma internal (authenticated n'a pas USAGE dessus, par conception).
-- Ce helper est le seul point de passage, et il porte LES DEUX gardes :
--   1. gate métier : ensemble vide si l'appelant n'est pas éditeur — c'est ICI
--      que vit le « éditeur et supérieur », côté serveur, pas seulement masqué
--      à l'écran ;
--   2. auto-autorisation (§36) : la fonction est exécutable via PostgREST, donc
--      elle ne fait JAMAIS confiance à la liste d'ids reçue.
CREATE OR REPLACE FUNCTION api.object_missing_essentials(p_object_ids TEXT[])
RETURNS TABLE(object_id TEXT, missing TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
  SELECT e.object_id, e.missing_essentials
  FROM   internal.v_object_essentials e
  WHERE  api.current_user_can_edit_objects()
    AND  e.object_id = ANY(COALESCE(p_object_ids, ARRAY[]::text[]))
    AND  e.object_id IN (SELECT api.current_user_readable_object_ids());
$$;

COMMENT ON FUNCTION api.object_missing_essentials IS
'§204 — essentiels manquants pour un ENSEMBLE d''objets (jamais par ligne). Rend 0 ligne si
l''appelant n''est pas éditeur (api.current_user_can_edit_objects) : c''est le gate serveur du
filtre « Remplissage ». Auto-autorise ses ids contre current_user_readable_object_ids (§36) — la
liste reçue n''est jamais crue sur parole. Mesuré: 2,0 ms pour une page de 24.';

-- PostgreSQL accorde EXECUTE à PUBLIC par DÉFAUT sur toute fonction créée. Un
-- GRANT ciblé ne retire pas ce droit — il faut le révoquer explicitement, sinon
-- `anon` peut appeler la fonction. Ici le corps refuserait de toute façon (gate
-- éditeur), mais on ne fait pas reposer un contrôle d'accès sur le seul corps.
REVOKE ALL ON FUNCTION api.object_missing_essentials(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.object_missing_essentials(TEXT[]) TO authenticated, service_role;
```

**Pourquoi `api` et pas un schéma privé.** La recommandation générale est de sortir
les fonctions `SECURITY DEFINER` du schéma exposé. Elle ne s'applique pas ici, et
la raison est mécanique : `api.list_object_resources_filtered_page` est
`SECURITY INVOKER`, donc c'est **l'appelant** (`authenticated`) qui doit pouvoir
exécuter le helper. Le placer dans `internal` exigerait de donner `USAGE` sur
`internal` à `authenticated` — ce qui ouvrirait toute la couche privée, très au-delà
de cette fonction. Les deux autres portes de sortie sont pires : basculer le RPC de
page en `SECURITY DEFINER` changerait en bloc la sémantique d'autorisation d'un RPC
central. On garde donc `api`, avec **trois** verrous cumulés : `REVOKE FROM PUBLIC`,
le gate éditeur, et l'auto-autorisation des ids. La fonction reste appelable par un
éditeur via PostgREST — et pour un éditeur, ces données ne sont pas un secret.

- [ ] **Step 4: Ajouter le bloc de test des gardes**

Dans `tests/test_remplissage_filter.sql`, **avant** le `ROLLBACK;` final, remplacer ce `ROLLBACK;` par :

```sql
-- ---------- (B) Gardes du helper ----------
-- ATTENTION : exécuté en superuser, api.current_user_can_edit_objects() rend TRUE
-- et le gate ne serait pas éprouvé. On force donc un rôle non privilégié.
DO $$
DECLARE
  v_n int;
BEGIN
  -- Le helper ne rend jamais un id hors de la liste demandée.
  SELECT count(*) INTO v_n
  FROM api.object_missing_essentials(ARRAY['RMPLIS9999999902']);
  ASSERT v_n <= 1,
    format('le helper ne doit rendre que les ids demandés ; obtenu %s lignes', v_n);
END$$;

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM api.object_missing_essentials(
    ARRAY['RMPLIS9999999901','RMPLIS9999999902','RMPLIS9999999903']);
  ASSERT v_n = 0,
    format('un appelant non-éditeur doit obtenir 0 ligne ; obtenu %s — le gate serveur est ouvert', v_n);

  -- Le gate porte aussi sur le FILTRE lui-même, pas seulement sur l'émission du
  -- champ : un lecteur seul peut appeler le RPC en direct avec les deux clés.
  -- Ses clés doivent être IGNORÉES — donc les 3 témoins ressortent, pas 1.
  SELECT count(*) INTO v_n
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["many"]}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_n = 3,
    format('les clés de remplissage d''un non-éditeur doivent être ignorées (3 témoins attendus) ; obtenu %s', v_n);

  RAISE NOTICE 'Bloc B (gardes du helper ET du filtre) OK.';
END$$;
RESET ROLE;

ROLLBACK;
```

- [ ] **Step 5: Appliquer puis lancer le test**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_remplissage_filter.sql"
```

Attendu : `Bloc A (vue) OK.` puis `Bloc B (gardes du helper) OK.`

- [ ] **Step 6: Sabotage — prouver que le test n'est pas vacant**

Retirer temporairement `api.current_user_can_edit_objects() AND` du corps du helper, ré-appliquer, relancer le test.
Attendu : **échec** sur `un appelant non-éditeur doit obtenir 0 ligne`.
Puis remettre la ligne, ré-appliquer, re-vérifier que le test repasse.

Un test qui reste vert après sabotage ne garde rien — c'est le seul moyen de le savoir.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" "Base de donnée DLL et API/tests/test_remplissage_filter.sql" && git commit -m "feat(sql): helper object_missing_essentials, gate editeur cote serveur

list_object_resources_filtered_page est SECURITY INVOKER et ne peut pas lire
le schema internal (authenticated n a pas USAGE). Helper DEFINER dedie, qui
porte les deux gardes en un seul point : gate editeur + auto-autorisation des
ids (§36, la fonction est executable via PostgREST).

Test non vacant : temoins aux trous connus, et le gate editeur verifie sous
SET ROLE anon — en superuser il rendrait TRUE et ne prouverait rien.
Sabotage verifie : retirer le gate fait rougir le test."
```

---

## Task 3: Les deux clés de filtre dans `api.get_filtered_object_ids`

**Files:**
- Create: `.tmp_pgapply/_gen_remplissage.cjs`
- Modify: `Base de donnée DLL et API/migration_explorer_remplissage_filter.sql` (le corps patché y est **collé**, pas écrit à la main)
- Modify: `Base de donnée DLL et API/tests/test_remplissage_filter.sql`

**Interfaces:**
- Consumes: `internal.v_object_essentials` (Tâche 1)
- Produces: `api.get_filtered_object_ids` accepte `p_filters.missing_essentials_buckets` (`text[]` parmi `complete`/`few`/`many`) et `p_filters.missing_essentials_any` (`text[]` parmi les 8 codes). **Signature inchangée** ⇒ pas de `NOTIFY pgrst` pour cette fonction.

### ⚠️ Lire ceci avant de toucher au fichier

Le corps de `api.get_filtered_object_ids` fait **43 378 caractères**. Trois pièges :

1. **La dernière définition n'est PAS dans la migration au nom évocateur.** L'ordre du manifeste est `16k` (label) → `16k2` (fuzzy) → `16k3` (phonétique) → … → `taxo6` **`migration_accommodation_unit_type.sql:318`**. C'est `taxo6` qui gagne. Partir de la migration phonétique ferait **régresser §201** (types d'unité) ; partir de la fuzzy ferait régresser §199 **et** §201.
2. **Ne jamais recopier le corps à la main.** Une recopie diverge au premier correctif appliqué entre-temps.
3. La méthode du dépôt : **dériver le corps de la définition live** (`pg_get_functiondef`) et appliquer des substitutions **à ancres assertées** — le script refuse d'écrire si une ancre a disparu ou est ambiguë. Le modèle à copier est `.tmp_pgapply/_gen_unit_type.cjs`.

- [ ] **Step 1: Créer le générateur à partir du modèle existant**

```bash
cd "C:/Users/dphil/Bertel3.0" && cp .tmp_pgapply/_gen_unit_type.cjs .tmp_pgapply/_gen_remplissage.cjs
```

Ouvrir `.tmp_pgapply/_gen_remplissage.cjs`. Conserver `loadEnv()` et `replaceOnce()` **tels quels** (c'est `replaceOnce` qui porte les assertions d'ancre). Remplacer uniquement les substitutions et le chemin de sortie :

```js
  // ---- Substitution 1 : les deux tableaux dans le CTE `params` -------------
  // Ancre : la DERNIÈRE entrée du CTE params (sustainability_actions_any). On
  // insère APRÈS elle, avant le bloc `use_mv`.
  const ancreParams = `      END AS sustainability_actions_any,\n`;
  def = replaceOnce(def, ancreParams, ancreParams + `      -- §204 — Remplissage. Deux clés indépendantes, combinées en ET :
      --   missing_essentials_buckets : palier (complete / few / many)
      --   missing_essentials_any     : quels essentiels manquent (OU interne)
      -- NULLIF(..., ARRAY[]::text[]) : une clé présente mais vide vaut « pas de
      -- filtre », jamais « ne matche rien » — convention de toutes les facettes.
      CASE WHEN n.filters ? 'missing_essentials_buckets'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'missing_essentials_buckets')),
          ARRAY[]::text[]
        )
      END AS missing_buckets,
      CASE WHEN n.filters ? 'missing_essentials_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'missing_essentials_any')),
          ARRAY[]::text[]
        )
      END AS missing_any,
      -- §204 — « éditeur et supérieur » est une règle d'AUTORISATION, pas un
      -- masquage d'écran. Le panneau cache le groupe et le hook neutralise
      -- l'état, mais un lecteur seul authentifié peut appeler ce RPC en direct
      -- avec les deux clés : on les neutralise donc ICI aussi. Constant par
      -- requête (un seul InitPlan), invisible sur le chemin chaud.
      api.current_user_can_edit_objects() AS can_use_remplissage,\n`, 'params: missing_essentials_*');

  // ---- Substitution 2 : le prédicat dans le WHERE final -------------------
  // Ancre : le prédicat pet_accepted, unique avec cette indentation. On insère
  // AVANT lui.
  const ancreWhere = `    AND (NOT (params.filters ? 'pet_accepted') OR EXISTS (\n`;
  def = replaceOnce(def, ancreWhere, `    -- §204 — Remplissage.
    -- GARDE EN \`CASE\`, JAMAIS EN \`OR\` : le planificateur réordonne les quals
    -- par coût, donc \`AND (garde IS NULL OR <coûteux>)\` n'assure aucun
    -- court-circuit. \`CASE\` court-circuite (leçon §197). Filtre éteint ⇒ la
    -- vue n'est jamais lue, coût nul sur le chemin chaud.
    -- Un appelant non-éditeur voit ses clés IGNORÉES, pas rejetées : cette
    -- fonction est \`LANGUAGE sql\` et ne peut pas lever d'exception sans une
    -- fonction tierce, et une dégradation douce évite de casser la session d'un
    -- utilisateur dont le rôle change en cours de route. Ignorer ne divulgue
    -- rien — le filtre est simplement sans effet.
    AND CASE
      WHEN NOT params.can_use_remplissage THEN TRUE
      WHEN params.missing_buckets IS NULL AND params.missing_any IS NULL THEN TRUE
      ELSE EXISTS (
        SELECT 1
        FROM internal.v_object_essentials ess
        WHERE ess.object_id = src.object_id
          AND (params.missing_buckets IS NULL OR
               CASE
                 WHEN cardinality(ess.missing_essentials) = 0  THEN 'complete'
                 WHEN cardinality(ess.missing_essentials) <= 2 THEN 'few'
                 ELSE 'many'
               END = ANY(params.missing_buckets))
          -- \`&&\` = recouvrement de tableaux : « au moins un des essentiels
          -- demandés est manquant ». C'est le OU interne de la facette.
          AND (params.missing_any IS NULL OR ess.missing_essentials && params.missing_any)
      )
    END
` + ancreWhere, 'where: prédicat remplissage');

  fs.writeFileSync(path.join(repoRoot, '.tmp_pgapply/_gfoi_remplissage.sql'), def + ';\n');
  console.log('OK — corps patché écrit dans .tmp_pgapply/_gfoi_remplissage.sql');
```

**Ne PAS ajouter les deux clés à la liste `use_mv`.** Cette liste force le contournement de la vue matérialisée pour les filtres qui exigent une jointure vive. Ici c'est inutile : le prédicat corrèle sur `src.object_id`, que `src` vienne du MV (publié) ou de `object` — et `internal.v_object_essentials` couvre les deux. L'y ajouter ferait perdre le cache chaud au chemin public pour rien.

- [ ] **Step 2: Générer le corps patché**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/_gen_remplissage.cjs
```

Attendu : `OK — corps patché écrit dans .tmp_pgapply/_gfoi_remplissage.sql`.
Si le script affiche `FAILED: ancre introuvable` ou `ancre ambiguë` : **ne pas contourner en assouplissant l'ancre.** Cela veut dire que la fonction live a changé depuis la rédaction de ce plan — relire la définition live et réajuster l'ancre sur le texte réel.

- [ ] **Step 3: Contrôler la taille du résultat**

```bash
cd "C:/Users/dphil/Bertel3.0" && wc -c .tmp_pgapply/_gfoi_remplissage.sql && grep -c "dmetaphone\|accommodation_unit_types_any\|missing_essentials" .tmp_pgapply/_gfoi_remplissage.sql
```

Attendu : environ **45 000** caractères (43 378 + le patch), et le `grep -c` non nul pour les trois marqueurs. Un fichier nettement plus court signifie que la définition live récupérée n'était pas la bonne — s'arrêter et diagnostiquer.

- [ ] **Step 4: Coller le corps patché dans la migration**

```bash
cd "C:/Users/dphil/Bertel3.0" && python - <<'PY'
import io
mig = "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql"
body = io.open(".tmp_pgapply/_gfoi_remplissage.sql", encoding="utf-8").read()
src  = io.open(mig, encoding="utf-8").read()
marker = "\nCOMMIT;\n"
assert src.count(marker) == 1, "un seul COMMIT attendu dans la migration"
bloc = ("\n-- ---- 4) get_filtered_object_ids : les deux cles de remplissage ------------\n"
        "-- Corps DERIVE de la definition live par .tmp_pgapply/_gen_remplissage.cjs\n"
        "-- (ancres assertees). NE PAS EDITER A LA MAIN : regenerer.\n" + body + "\n")
io.open(mig, "w", encoding="utf-8").write(src.replace(marker, bloc + marker))
print("colle OK")
PY
```

Si `python` n'est pas disponible, faire l'insertion manuellement dans l'éditeur : coller le contenu de `_gfoi_remplissage.sql` juste avant le `COMMIT;` final de la migration.

- [ ] **Step 5: Écrire le test de non-vacuité (il doit échouer)**

Dans `tests/test_remplissage_filter.sql`, insérer **avant** le bloc `SET LOCAL ROLE anon;` :

```sql
-- ---------- (C) NON VACUITÉ — le filtre remonte l'ensemble EXACT ----------
DO $$
DECLARE
  v_hits text[];
BEGIN
  -- Palier « many » (3 et plus) : seule 03 y est.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["many"]}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999903'],
    format('palier many doit remonter exactement 03 ; obtenu: %s', v_hits);

  -- Palier « complete » : seule 01.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["complete"]}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999901'],
    format('palier complete doit remonter exactement 01 ; obtenu: %s', v_hits);

  -- Sélection NON CONTIGUË (complete + many) : 01 et 03, pas 02.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["complete","many"]}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999901','RMPLIS9999999903'],
    format('paliers complete+many doivent remonter 01 et 03 ; obtenu: %s', v_hits);

  -- Facette « il manque les photos » : 02 et 03 (01 en a 4).
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": ["photos"]}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999902','RMPLIS9999999903'],
    format('facette photos doit remonter 02 et 03 ; obtenu: %s', v_hits);

  -- Les deux clés se combinent en ET : « sans photo » ET palier few ⇒ 02 seule.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": ["photos"], "missing_essentials_buckets": ["few"]}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999902'],
    format('photos ET palier few doivent remonter 02 seule ; obtenu: %s', v_hits);

  -- Clé présente mais VIDE = pas de filtre (convention des facettes).
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": []}'::jsonb,
         NULL::object_type[], ARRAY['published']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT cardinality(v_hits) = 3,
    format('une clé vide ne doit RIEN filtrer ; obtenu: %s', v_hits);

  RAISE NOTICE 'Bloc C (non-vacuité du filtre) OK.';
END$$;
```

- [ ] **Step 6: Appliquer puis lancer le test**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_remplissage_filter.sql"
```

Attendu : `Bloc A … OK.`, `Bloc C … OK.`, `Bloc B … OK.`

- [ ] **Step 7: Vérifier que les régressions §199 et §201 n'ont pas eu lieu**

C'est le contrôle qui rattrape le piège n°1 : on vient de remplacer une fonction de 43 Ko.

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_global_search.sql" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_accommodation_unit_type.sql"
```

Attendu : les deux passent. S'ils échouent, le corps généré ne partait pas de la bonne définition — reprendre au Step 2.

- [ ] **Step 8: Mesurer que le chemin chaud n'a pas bougé**

```bash
cd "C:/Users/dphil/Bertel3.0" && cat > .tmp_pgapply/_perf_204.sql <<'SQL'
EXPLAIN (ANALYZE, TIMING, SUMMARY)
SELECT count(*) FROM api.get_filtered_object_ids(
  '{}'::jsonb, NULL::object_type[], ARRAY['published']::object_status[], NULL);
SQL
node .tmp_pgapply/run_sql_file.cjs .tmp_pgapply/_perf_204.sql
```

Attendu : `Execution Time` du même ordre qu'avant le patch (~16 ms sur ce corpus). Lancer **deux fois** et lire la seconde mesure — la première réchauffe le cache et n'est pas représentative (270 ms contre 23 ms mesurés pendant la conception). Une valeur durablement supérieure signifie que la garde `CASE` ne court-circuite pas : vérifier qu'elle n'a pas été réécrite en `OR`.

Puis vérifier que **l'élagage des colonnes tient toujours** — c'est l'hypothèse sur laquelle repose tout le choix « pas de colonne cachée », et la vue a été restructurée en CTE :

```bash
cd "C:/Users/dphil/Bertel3.0" && cat > .tmp_pgapply/_perf_204_un_essentiel.sql <<'SQL'
EXPLAIN (ANALYZE, TIMING, SUMMARY)
SELECT count(*) FROM api.get_filtered_object_ids(
  '{"missing_essentials_any": ["contact"]}'::jsonb,
  NULL::object_type[], ARRAY['published']::object_status[], NULL);
SQL
node .tmp_pgapply/run_sql_file.cjs .tmp_pgapply/_perf_204_un_essentiel.sql
```

Attendu (seconde exécution) : nettement **moins** que le filtre sur les 8 essentiels. Dans le plan, les sous-requêtes des essentiels non demandés doivent porter `(never executed)`. Si elles s'exécutent toutes, le CTE `base` n'est plus élagué — le filtre reste correct mais paie 23 ms au lieu de 3. Le consigner dans le journal de décision plutôt que de le passer sous silence : c'est une hypothèse de conception qui aurait bougé.

- [ ] **Step 9: Sabotage du bloc C**

Remplacer dans le prédicat `ess.missing_essentials && params.missing_any` par `TRUE`, ré-appliquer, relancer le test.
Attendu : **échec** sur `facette photos doit remonter 02 et 03`. Puis rétablir, ré-appliquer, re-vérifier le vert.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" "Base de donnée DLL et API/tests/test_remplissage_filter.sql" .tmp_pgapply/_gen_remplissage.cjs && git commit -m "feat(sql): filtre remplissage dans get_filtered_object_ids

Deux cles independantes combinees en ET : missing_essentials_buckets
(complete/few/many, selection non contigue possible) et missing_essentials_any
(OU interne via recouvrement de tableaux).

Garde en CASE, jamais en OR : le planificateur reordonne les quals par cout,
donc OR n assure aucun court-circuit (lecon 197). Filtre eteint => la vue
n est jamais lue.

Corps DERIVE de la definition live par ancres assertees, pas recopie : la
derniere definition est dans migration_accommodation_unit_type.sql (taxo6),
pas dans la migration phonetique — se tromper ferait regresser 199 et 201.
Les deux suites de garde re-executees pour le prouver.

Signature inchangee => pas de NOTIFY pgrst."
```

---

## Task 4: Émettre `missing_essentials` sur les cartes

**Files:**
- Modify: `Base de donnée DLL et API/migration_explorer_remplissage_filter.sql`
- Modify: `Base de donnée DLL et API/tests/test_remplissage_filter.sql`

**Interfaces:**
- Consumes: `api.object_missing_essentials` (Tâche 2)
- Produces: chaque objet du tableau `data` de `api.list_object_resources_filtered_page` porte `missing_essentials: string[]` **quand l'appelant est éditeur**, et rien sinon. Consommé par les Tâches 6, 9 et 10.

**Décision de conception à ne pas « optimiser » :** le champ est émis **dès que l'appelant est éditeur**, sans condition sur le filtre. Mesuré à **2,0 ms pour une page de 24 fiches** (tout en index scan). Le conditionner à « le filtre est actif » économiserait 2 ms et priverait la colonne Table de ses données quand le filtre est éteint.

- [ ] **Step 1: Reprendre le corps de la fonction**

La dernière définition est dans `migration_label_filter_sections.sql:718` (rien après ne la redéfinit). Contrairement à la Tâche 3, cette fonction ne fait que 7 812 caractères et le patch est **additif en fin de corps** : on peut la reprendre par copie.

```bash
cd "C:/Users/dphil/Bertel3.0" && sed -n '718,930p' "Base de donnée DLL et API/migration_label_filter_sections.sql" > .tmp_pgapply/_page_base.sql && wc -l .tmp_pgapply/_page_base.sql
```

- [ ] **Step 2: Insérer la décoration**

Copier le contenu de `_page_base.sql` dans la migration (avant le `COMMIT;`), puis y insérer, **juste après** la ligne `  INTO v_total, v_data, v_rank0, v_rank1;` :

```sql

  -- §204 — Remplissage : décoration de la page en UN SEUL appel ensembliste.
  -- Jamais par ligne. api.object_missing_essentials rend 0 ligne si l'appelant
  -- n'est pas éditeur, donc le LEFT JOIN laisse simplement le champ absent :
  -- le gate « éditeur et supérieur » est porté LÀ-BAS, pas ici.
  IF jsonb_array_length(COALESCE(v_data, '[]'::jsonb)) > 0 THEN
    SELECT COALESCE(
             jsonb_agg(
               CASE WHEN me.missing IS NULL THEN item.value
                    ELSE item.value || jsonb_build_object('missing_essentials', to_jsonb(me.missing))
               END
               ORDER BY item.ordinality
             ),
             '[]'::jsonb
           )
    INTO v_data
    FROM jsonb_array_elements(v_data) WITH ORDINALITY AS item(value, ordinality)
    LEFT JOIN api.object_missing_essentials(
                ARRAY(SELECT d->>'id' FROM jsonb_array_elements(v_data) AS d)
              ) me ON me.object_id = item.value->>'id';
  END IF;
```

**Ne pas toucher au reste du corps** : ni la signature, ni le curseur, ni `meta`. Le champ s'ajoute à chaque item de `data`, rien d'autre ne bouge.

- [ ] **Step 3: Test — la page porte le champ pour un éditeur**

Dans `tests/test_remplissage_filter.sql`, ajouter après le bloc C :

```sql
-- ---------- (D) La page de cartes porte missing_essentials ----------
DO $$
DECLARE
  v_page JSONB;
  v_item JSONB;
BEGIN
  v_page := api.list_object_resources_filtered_page(
              NULL, ARRAY['fr']::text[], 50,
              '{"missing_essentials_any": ["photos"]}'::jsonb,
              NULL::object_type[], ARRAY['published']::object_status[], NULL)::jsonb;

  SELECT d INTO v_item
  FROM jsonb_array_elements(v_page->'data') d
  WHERE d->>'id' = 'RMPLIS9999999902';

  ASSERT v_item IS NOT NULL,
    '02 doit être dans la page filtrée sur « il manque les photos »';
  ASSERT v_item ? 'missing_essentials',
    'la carte doit porter missing_essentials pour un appelant éditeur';
  ASSERT (SELECT array_agg(x) FROM jsonb_array_elements_text(v_item->'missing_essentials') x)
         = ARRAY['photos'],
    format('02 ne doit manquer que de photos ; obtenu: %s', v_item->'missing_essentials');

  RAISE NOTICE 'Bloc D (carte décorée) OK.';
END$$;
```

- [ ] **Step 4: Appliquer et lancer**

```bash
cd "C:/Users/dphil/Bertel3.0" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" && node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_remplissage_filter.sql"
```

Attendu : les blocs A, C, D puis B affichent `OK.`

- [ ] **Step 5: Mesurer le coût sur une page**

```bash
cd "C:/Users/dphil/Bertel3.0" && cat > .tmp_pgapply/_perf_page_204.sql <<'SQL'
EXPLAIN (ANALYZE, TIMING, SUMMARY)
SELECT api.list_object_resources_filtered_page(
  NULL, ARRAY['fr']::text[], 24, '{}'::jsonb,
  NULL::object_type[], ARRAY['published']::object_status[], NULL);
SQL
node .tmp_pgapply/run_sql_file.cjs .tmp_pgapply/_perf_page_204.sql
```

Lancer deux fois, lire la seconde. Attendu : au plus **quelques millisecondes** de plus qu'avant le patch. Si l'écart dépasse ~20 ms, le helper est probablement appelé par ligne au lieu d'une fois — relire le `LEFT JOIN`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/migration_explorer_remplissage_filter.sql" "Base de donnée DLL et API/tests/test_remplissage_filter.sql" && git commit -m "feat(sql): les cartes portent missing_essentials pour les editeurs

Decoration de la page en UN appel ensembliste apres la pagination, jamais par
ligne. Le gate editeur vit dans le helper : un non-editeur obtient 0 ligne,
donc le champ est simplement absent.

Emis des que l appelant est editeur, sans condition sur le filtre : mesure
2,0 ms pour une page de 24. Le conditionner au filtre economiserait 2 ms et
priverait la colonne Table de ses donnees filtre eteint."
```

---

## Task 5: Intégrité de déploiement — manifeste et runbook

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`

**Interfaces:** aucune — tâche d'intégrité.

**Pourquoi c'est bloquant :** la règle du projet est qu'**aucun DDL ne doit exister uniquement sur la base live**. Une base fraîche construite depuis le manifeste doit reproduire la live. Sauter cette tâche crée une dérive, traitée comme un incident et non comme un déploiement. La migration n'est **pas repliée** dans `api_views_functions.sql` : elle est listée dans le manifeste, comme `16k`, `16k2`, `pets1` et les autres — le manifeste rejoue la migration après le fichier de fonctions, qui garde donc l'ancienne définition sans que ce soit un problème.

- [ ] **Step 1: Ajouter l'étape au manifeste**

Ouvrir `Base de donnée DLL et API/ci_fresh_apply.sql`. Repérer la fin, juste **avant** le bloc :

```
\echo '== MV refresh (non-concurrent) =='
```

Y insérer :

```
\echo '== 16r    migration_explorer_remplissage_filter.sql  (§204 filtre Remplissage: internal.v_object_essentials devient la source UNIQUE du bundle des 8 essentiels visiteur, jusque-la recopie dans get_dashboard_completeness; booleens en colonnes SEPAREES car PostgreSQL elague les colonnes non consommees (2,5 ms sur un essentiel contre 23 ms sur les 8); helper DEFINER api.object_missing_essentials portant le gate editeur cote serveur, car list_object_resources_filtered_page est SECURITY INVOKER et ne peut pas lire le schema internal; deux cles missing_essentials_buckets/_any dans get_filtered_object_ids sous garde CASE; APRES taxo6 = corps complet de get_filtered_object_ids incluant 197/199/201; signature inchangee mais NOUVELLE fonction exposee donc NOTIFY pgrst requis) =='
\ir migration_explorer_remplissage_filter.sql

\echo '== 16r-test garde permanente §204 (A la vue voit les bons trous / B gate editeur ferme sous SET ROLE anon / C non-vacuite: paliers, selection non contigue, facette, combinaison ET, cle vide = pas de filtre / D la carte porte missing_essentials) =='
\ir tests/test_remplissage_filter.sql
```

**L'ordre compte** : `16r` doit venir **après** `taxo6` (`migration_accommodation_unit_type.sql`), qui porte la dernière définition de `get_filtered_object_ids`. Le placer avant ferait écraser notre patch par taxo6.

- [ ] **Step 2: Vérifier l'ordre du manifeste**

```bash
cd "C:/Users/dphil/Bertel3.0/Base de donnée DLL et API" && grep -n "migration_accommodation_unit_type.sql\|migration_explorer_remplissage_filter.sql" ci_fresh_apply.sql
```

Attendu : le numéro de ligne de `migration_explorer_remplissage_filter.sql` est **strictement supérieur** à celui de `migration_accommodation_unit_type.sql`.

- [ ] **Step 3: Ajouter l'entrée au runbook**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, à la suite des étapes existantes, ajouter :

```markdown
### 16r — `migration_explorer_remplissage_filter.sql` (§204, filtre Remplissage)

À appliquer **après** `taxo6` (`migration_accommodation_unit_type.sql`), qui porte la
dernière définition de `api.get_filtered_object_ids`.

Contenu : `internal.v_object_essentials` (source unique du bundle des 8 essentiels),
`api.object_missing_essentials` (helper DEFINER portant le gate éditeur),
`api.get_dashboard_completeness` rebranché sur la vue (résultat inchangé),
`api.get_filtered_object_ids` + `api.list_object_resources_filtered_page` patchées.

**Après application — hors transaction :**

```sql
NOTIFY pgrst, 'reload schema';   -- OBLIGATOIRE : api.object_missing_essentials est nouvelle
```

Aucun `REFRESH MATERIALIZED VIEW` n'est nécessaire : la migration ne touche ni
`internal.mv_filtered_objects` ni `internal.mv_ref_data_json`.

Vérification : `tests/test_remplissage_filter.sql` doit passer, ainsi que
`tests/test_global_search.sql` et `tests/test_accommodation_unit_type.sql` (preuve
qu'aucune régression §199/§201 n'a été introduite en remplaçant les 43 Ko de
`get_filtered_object_ids`).
```

- [ ] **Step 4: Émettre le `NOTIFY`**

```bash
cd "C:/Users/dphil/Bertel3.0" && cat > .tmp_pgapply/_notify_204.sql <<'SQL'
NOTIFY pgrst, 'reload schema';
SQL
node .tmp_pgapply/run_sql_file.cjs .tmp_pgapply/_notify_204.sql
```

Sans ce `NOTIFY`, PostgREST ignore `api.object_missing_essentials` et le front recevra un 404 sur le RPC.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md && git commit -m "chore(sql): manifeste et runbook pour 16r (filtre remplissage)

Aucun DDL ne doit exister uniquement sur la live : 16r entre au manifeste
APRES taxo6, qui porte la derniere definition de get_filtered_object_ids —
l inverse ecraserait le patch.

NOTIFY pgrst requis : api.object_missing_essentials est une fonction neuve."
```

---

## Task 6: Front — types, libellés partagés, store, payload RPC

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts`
- Create: `bertel-tourism-ui/src/utils/remplissage.ts`
- Create: `bertel-tourism-ui/src/utils/remplissage.test.ts`
- Modify: `bertel-tourism-ui/src/utils/facets.ts`
- Modify: `bertel-tourism-ui/src/store/explorer-store.ts`
- Modify: `bertel-tourism-ui/src/utils/facets.test.ts` (existant)

**Interfaces:**
- Consumes: le contrat RPC des Tâches 3 et 4.
- Produces (utilisés par les Tâches 7 à 10) :
  - `type MissingEssentialBucket = 'complete' | 'few' | 'many'`
  - `type MissingEssentialCode = 'name' | 'subcategory' | 'location' | 'contact' | 'description' | 'photos' | 'type_block' | 'tags'`
  - `ExplorerCommonFilters.missingEssentialsBuckets: MissingEssentialBucket[]`
  - `ExplorerCommonFilters.missingEssentialsAny: MissingEssentialCode[]`
  - `ObjectCard.missing_essentials?: string[]`
  - `REMPLISSAGE_BUCKET_OPTIONS`, `REMPLISSAGE_ESSENTIAL_OPTIONS`, `essentialLabel(code)`, `remplissageTone(count)`
  - store : `setMissingEssentialsBuckets(...)`, `setMissingEssentialsAny(...)`

- [ ] **Step 1: Écrire le test des libellés partagés (il doit échouer)**

Créer `bertel-tourism-ui/src/utils/remplissage.test.ts` :

```ts
import {
  REMPLISSAGE_BUCKET_OPTIONS,
  REMPLISSAGE_ESSENTIAL_OPTIONS,
  essentialLabel,
  remplissageTone,
} from './remplissage';

describe('remplissage — vocabulaire partagé', () => {
  test('les 3 paliers sont exposés dans l’ordre du plus rempli au moins rempli', () => {
    expect(REMPLISSAGE_BUCKET_OPTIONS.map((o) => o.code)).toEqual(['complete', 'few', 'many']);
  });

  test('« nom » n’est PAS proposé dans la facette : 0 fiche concernée, ce serait un critère muet', () => {
    expect(REMPLISSAGE_ESSENTIAL_OPTIONS.map((o) => o.code)).not.toContain('name');
    expect(REMPLISSAGE_ESSENTIAL_OPTIONS).toHaveLength(7);
  });

  test('un code inconnu se rend tel quel plutôt que de disparaître', () => {
    expect(essentialLabel('photos')).toBe('Photos');
    expect(essentialLabel('inconnu')).toBe('inconnu');
  });

  test('le ton suit les seuils : rien à 0, neutre 1-2, alerte à 3, danger à 4+', () => {
    expect(remplissageTone(0)).toBeNull();
    expect(remplissageTone(1)).toBe('neutral');
    expect(remplissageTone(2)).toBe('neutral');
    expect(remplissageTone(3)).toBe('warning');
    expect(remplissageTone(9)).toBe('danger');
  });
});
```

- [ ] **Step 2: Lancer le test — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/utils/remplissage.test.ts
```

Attendu : **FAIL**, `Cannot find module './remplissage'`.

- [ ] **Step 3: Écrire `utils/remplissage.ts`**

```ts
import type { MissingEssentialBucket, MissingEssentialCode } from '../types/domain';

/**
 * §204 — vocabulaire du filtre « Remplissage », partagé par le panneau de filtres,
 * la pastille de carte et la colonne Table. Fichier séparé parce que trois
 * composants le consomment : le poser dans l'un d'eux forcerait les deux autres
 * à importer depuis un composant.
 *
 * Le mot d'interface est « remplissage », jamais « complétude ». Les codes, eux,
 * restent ceux du contrat RPC (`missing_essentials`) et ne se traduisent pas.
 */

export const REMPLISSAGE_BUCKET_OPTIONS: ReadonlyArray<{
  code: MissingEssentialBucket;
  label: string;
}> = [
  { code: 'complete', label: 'Complète' },
  { code: 'few', label: '1–2 manquants' },
  { code: 'many', label: '3 et plus' },
];

/**
 * `name` est ABSENT volontairement : 0 fiche du corpus n'a de nom vide
 * (`object.name` est structurellement rempli). L'offrir serait un critère qui ne
 * remonte jamais rien — la classe de bug que la garde CI §194 interdit. Il reste
 * compté côté SQL pour que le dénominateur /8 du Dashboard ne bouge pas.
 */
export const REMPLISSAGE_ESSENTIAL_OPTIONS: ReadonlyArray<{
  code: MissingEssentialCode;
  label: string;
}> = [
  { code: 'photos', label: 'Photos' },
  { code: 'type_block', label: 'Bloc type' },
  { code: 'description', label: 'Descriptif' },
  { code: 'tags', label: 'Tags' },
  { code: 'contact', label: 'Contact public' },
  { code: 'location', label: 'Lieu' },
  { code: 'subcategory', label: 'Sous-catégorie' },
];

const ESSENTIAL_LABELS: Record<string, string> = Object.fromEntries([
  ...REMPLISSAGE_ESSENTIAL_OPTIONS.map((o) => [o.code, o.label]),
  ['name', 'Nom'],
]);

/** Libellé FR d'un code d'essentiel. Un code inconnu se rend TEL QUEL — jamais vide :
 *  une pastille muette est pire qu'un code brut affiché. */
export function essentialLabel(code: string): string {
  return ESSENTIAL_LABELS[code] ?? code;
}

export type RemplissageTone = 'neutral' | 'warning' | 'danger';

/** Ton de la pastille selon le nombre de manquants. `null` = pas de pastille. */
export function remplissageTone(count: number): RemplissageTone | null {
  if (count <= 0) return null;
  if (count <= 2) return 'neutral';
  if (count === 3) return 'warning';
  return 'danger';
}
```

- [ ] **Step 4: Ajouter les types dans `types/domain.ts`**

Ajouter près des autres types de filtre :

```ts
/** §204 — paliers de remplissage : 0 manquant, 1–2, 3 et plus. */
export type MissingEssentialBucket = 'complete' | 'few' | 'many';

/** §204 — codes d'essentiels, IDENTIQUES à ceux du champ `missing_fields` de
 *  api.get_dashboard_completeness. Ne pas en inventer, ne pas les renommer. */
export type MissingEssentialCode =
  | 'name'
  | 'subcategory'
  | 'location'
  | 'contact'
  | 'description'
  | 'photos'
  | 'type_block'
  | 'tags';
```

Dans `interface ExplorerCommonFilters`, **après** le champ `statuses` :

```ts
  /**
   * §204 — paliers de remplissage. Réservé aux éditeurs : le panneau masque le
   * groupe pour un lecteur seul, ET le serveur ferme la porte (le champ
   * `missing_essentials` des cartes n'est émis qu'aux éditeurs).
   */
  missingEssentialsBuckets: MissingEssentialBucket[];
  /** §204 — quels essentiels manquent (OU interne, ET avec le palier). */
  missingEssentialsAny: MissingEssentialCode[];
```

Dans `interface ObjectCard`, après `updated_at` :

```ts
  /**
   * §204 — essentiels visiteur manquants. Émis par le RPC UNIQUEMENT pour un
   * appelant éditeur (`api.object_missing_essentials`). Absent = soit
   * l'appelant n'est pas éditeur, soit la fiche est complète — le composant ne
   * doit donc jamais déduire « complète » d'une absence.
   */
  missing_essentials?: string[];
```

- [ ] **Step 5: Lancer le test — il doit passer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/utils/remplissage.test.ts
```

Attendu : **PASS**, 4 tests.

- [ ] **Step 6: Écrire le test du payload RPC (il doit échouer)**

Ajouter dans `bertel-tourism-ui/src/utils/facets.test.ts` :

```ts
describe('§204 — payload du filtre remplissage', () => {
  test('rien n’est émis quand aucun critère de remplissage n’est actif', () => {
    const payload = buildBucketRpcFilters(buildFilters({}), 'hot');
    expect(payload).not.toHaveProperty('missing_essentials_buckets');
    expect(payload).not.toHaveProperty('missing_essentials_any');
  });

  test('les paliers partent sous la clé missing_essentials_buckets', () => {
    const payload = buildBucketRpcFilters(
      buildFilters({ common: { missingEssentialsBuckets: ['many', 'complete'] } as never }),
      'hot',
    );
    expect(payload.missing_essentials_buckets).toEqual(['many', 'complete']);
  });

  test('la facette part sous la clé missing_essentials_any', () => {
    const payload = buildBucketRpcFilters(
      buildFilters({ common: { missingEssentialsAny: ['photos'] } as never }),
      'hot',
    );
    expect(payload.missing_essentials_any).toEqual(['photos']);
  });

  test('un tableau vide n’émet PAS la clé — une clé vide vaut « pas de filtre », autant ne pas l’envoyer', () => {
    const payload = buildBucketRpcFilters(
      buildFilters({ common: { missingEssentialsBuckets: [], missingEssentialsAny: [] } as never }),
      'hot',
    );
    expect(payload).not.toHaveProperty('missing_essentials_buckets');
    expect(payload).not.toHaveProperty('missing_essentials_any');
  });
});
```

L'assistant s'appelle `buildFilters` dans ce fichier (déclaré à la ligne 61) et prend des surcharges **par section** — d'où `{ common: { … } }` et non un objet plat. `as never` évite d'avoir à typer la surcharge partielle ; le retirer si `tsc` l'accepte sans.

- [ ] **Step 7: Lancer — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/utils/facets.test.ts -t "204"
```

Attendu : **FAIL** — les clés ne sont pas émises.

- [ ] **Step 8: Implémenter dans `utils/facets.ts`**

1. Dans l'objet des valeurs par défaut des filtres communs (celui qui contient `statuses: []`, autour de la ligne 104), ajouter :

```ts
  missingEssentialsBuckets: [],
  missingEssentialsAny: [],
```

2. Dans `normalizeExplorerFilters` (autour de la ligne 169, là où figure `statuses: common.statuses ?? []`), ajouter :

```ts
      missingEssentialsBuckets: common.missingEssentialsBuckets ?? [],
      missingEssentialsAny: common.missingEssentialsAny ?? [],
```

3. Dans `buildBucketRpcFilters`, à la suite du bloc `if (common.petsAccepted) { … }` :

```ts
  // §204 — Remplissage. Deux clés indépendantes, combinées en ET côté SQL.
  // Un tableau vide n'émet RIEN : le RPC traiterait une clé vide comme « pas de
  // filtre », autant ne pas la transmettre (payload plus lisible en debug).
  if (common.missingEssentialsBuckets.length > 0) {
    payload.missing_essentials_buckets = [...common.missingEssentialsBuckets];
  }
  if (common.missingEssentialsAny.length > 0) {
    payload.missing_essentials_any = [...common.missingEssentialsAny];
  }
```

- [ ] **Step 9: Lancer — il doit passer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/utils/facets.test.ts
```

Attendu : **PASS**, y compris les tests préexistants du fichier.

- [ ] **Step 10: Ajouter les setters au store**

Dans `bertel-tourism-ui/src/store/explorer-store.ts`, dans l'interface des actions, à côté de `setStatuses` :

```ts
  setMissingEssentialsBuckets: (buckets: MissingEssentialBucket[]) => void;
  setMissingEssentialsAny: (codes: MissingEssentialCode[]) => void;
```

Et dans l'implémentation, à côté de `setStatuses` :

```ts
  setMissingEssentialsBuckets: (buckets) =>
    set((state) => ({
      common: { ...state.common, missingEssentialsBuckets: [...new Set(buckets)] },
    })),
  setMissingEssentialsAny: (codes) =>
    set((state) => ({
      common: { ...state.common, missingEssentialsAny: [...new Set(codes)] },
    })),
```

Importer les deux types depuis `../types/domain`.

- [ ] **Step 11: Contrôler les types et la suite complète**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run typecheck && npm run test:run
```

Attendu : `tsc` sans erreur, et la suite entière verte. Si `tsc` signale des objets de filtres incomplets ailleurs (fichiers de test, données de démonstration), y ajouter les deux champs `[]` — c'est le compilateur qui fait son travail.

- [ ] **Step 12: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/utils/remplissage.ts bertel-tourism-ui/src/utils/remplissage.test.ts bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/utils/facets.test.ts bertel-tourism-ui/src/store/explorer-store.ts && git commit -m "feat(explorer): types, vocabulaire et payload du filtre remplissage

utils/remplissage.ts porte le vocabulaire partage par les trois surfaces
(panneau, pastille, colonne Table) — le poser dans l un des composants
forcerait les deux autres a importer depuis un composant.

« nom » n est pas propose dans la facette : 0 fiche concernee, ce serait un
critere muet (garde 194). Il reste compte cote SQL pour ne pas deplacer le
denominateur /8 du Dashboard.

Un tableau vide n emet pas la cle : le RPC la traiterait comme « pas de
filtre » de toute facon."
```

---

## Task 7: Front — le groupe « Remplissage » du panneau, gaté

**Files:**
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts:140-154`
- Modify: `bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/FiltersPanel.test.tsx`

**Interfaces:**
- Consumes: `REMPLISSAGE_BUCKET_OPTIONS`, `REMPLISSAGE_ESSENTIAL_OPTIONS` et les setters du store (Tâche 6).
- Produces: aucun nouvel export.

**Deux gardes, pas une.** Masquer le groupe à l'écran ne suffit pas — l'état pourrait survivre à une perte de droits (URL partagée, changement de rôle en session). Le hook neutralise donc les deux critères quand `canEditObjects` est faux, exactement comme il le fait déjà pour `statuses`.

- [ ] **Step 1: Écrire le test de gating (il doit échouer)**

Ajouter dans `FiltersPanel.test.tsx` :

Ce fichier n'a **pas** d'assistant de rendu : les tests appellent `render(<FiltersPanel />)` directement, et manipulent les stores via `act()`. `canEditObjects` vient du store de session — il faut donc l'y poser explicitement, et le remettre à sa valeur d'origine après chaque test pour ne pas contaminer les suivants.

```tsx
import { useSessionStore } from '../../store/session-store';

describe('§204 — groupe Remplissage', () => {
  const initial = useSessionStore.getState().canEditObjects;
  afterEach(() => {
    act(() => { useSessionStore.setState({ canEditObjects: initial }); });
  });

  test('un lecteur seul ne voit pas le groupe', () => {
    act(() => { useSessionStore.setState({ canEditObjects: false }); });
    render(<FiltersPanel />);
    expect(screen.queryByText('Remplissage')).not.toBeInTheDocument();
  });

  test('un éditeur voit le groupe et ses trois paliers', () => {
    act(() => { useSessionStore.setState({ canEditObjects: true }); });
    render(<FiltersPanel />);
    expect(screen.getByText('Remplissage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complète' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1–2 manquants' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 et plus' })).toBeInTheDocument();
  });

  test('cliquer un palier le marque actif', () => {
    act(() => { useSessionStore.setState({ canEditObjects: true }); });
    render(<FiltersPanel />);
    const chip = screen.getByRole('button', { name: '3 et plus' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: '3 et plus' })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

`render`, `screen`, `act` et `fireEvent` sont déjà importés en tête du fichier — ne pas ajouter `userEvent`, qui n'y est pas employé.

- [ ] **Step 2: Lancer — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer/FiltersPanel.test.tsx -t "204"
```

Attendu : **FAIL**, « Remplissage » introuvable.

- [ ] **Step 3: Neutraliser les critères hors droits d'édition**

Dans `hooks/useExplorerQueries.ts`, remplacer le corps de `useExplorerQueryFilters` par :

```ts
  return useMemo(() => {
    const effectiveStatuses = resolveExplorerStatuses(filters.common.statuses, canEditObjects);
    return {
      ...filters,
      common: {
        ...filters.common,
        statuses: effectiveStatuses,
        // §204 — le remplissage est réservé aux éditeurs. Masquer le groupe ne
        // suffit pas : l'état survivrait à une URL partagée ou à un changement
        // de rôle en cours de session. On neutralise ici, à la source du
        // payload — le serveur ferme la porte de son côté (le helper rend 0
        // ligne à un non-éditeur), les deux gardes sont indépendantes.
        missingEssentialsBuckets: canEditObjects ? filters.common.missingEssentialsBuckets : [],
        missingEssentialsAny: canEditObjects ? filters.common.missingEssentialsAny : [],
      },
    };
  }, [canEditObjects, filters]);
```

- [ ] **Step 4: Ajouter le groupe au panneau**

Dans `FiltersPanel.tsx` :

1. Imports :

```tsx
import {
  REMPLISSAGE_BUCKET_OPTIONS,
  REMPLISSAGE_ESSENTIAL_OPTIONS,
} from '../../utils/remplissage';
```

2. Récupérer l'état et les setters, près de ceux déjà lus :

```tsx
  const missingEssentialsBuckets = common.missingEssentialsBuckets;
  const missingEssentialsAny = common.missingEssentialsAny;
  const setMissingEssentialsBuckets = useExplorerStore((s) => s.setMissingEssentialsBuckets);
  const setMissingEssentialsAny = useExplorerStore((s) => s.setMissingEssentialsAny);
```

(Employer le même hook de store que les setters voisins — s'aligner sur la ligne de `setStatuses`.)

3. Juste **après** le bloc `{canEditObjects ? (<FilterColumnGroup label="Statut"> … </FilterColumnGroup>) : null}` (autour de la ligne 979), insérer :

```tsx
        {canEditObjects ? (
          <FilterColumnGroup label="Remplissage">
            <div className="space-y-3">
              <div>
                <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">
                  Essentiels visiteur manquants
                </span>
                <div className="flex flex-wrap gap-2">
                  {REMPLISSAGE_BUCKET_OPTIONS.map((option) => {
                    const active = missingEssentialsBuckets.includes(option.code);
                    return (
                      <button
                        key={option.code}
                        type="button"
                        className={bucketChipClass(active)}
                        onClick={() =>
                          setMissingEssentialsBuckets(
                            active
                              ? missingEssentialsBuckets.filter((c) => c !== option.code)
                              : [...missingEssentialsBuckets, option.code],
                          )
                        }
                        aria-pressed={active}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">Il manque</span>
                <FilterDropdown<string>
                  mode="multi"
                  placeholder="N'importe quel essentiel"
                  allLabel="N'importe quel essentiel"
                  options={REMPLISSAGE_ESSENTIAL_OPTIONS.map((o) => ({ code: o.code, label: o.label }))}
                  selected={missingEssentialsAny}
                  onChange={(vals) => setMissingEssentialsAny(vals as typeof missingEssentialsAny)}
                />
              </div>
            </div>
          </FilterColumnGroup>
        ) : null}
```

- [ ] **Step 5: Lancer — il doit passer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer/FiltersPanel.test.tsx && npm run typecheck
```

Attendu : **PASS** et `tsc` propre.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/hooks/useExplorerQueries.ts bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx bertel-tourism-ui/src/components/explorer/FiltersPanel.test.tsx && git commit -m "feat(explorer): groupe Remplissage dans le panneau, reserve aux editeurs

Meme condition canEditObjects que le groupe Statut. Deux gardes independantes :
le hook neutralise les deux criteres hors droits d edition (l etat survivrait
a une URL partagee ou a un changement de role en session), et le serveur rend
0 ligne a un non-editeur."
```

---

## Task 8: Front — les puces de filtres actifs

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/explorer-active-chips.ts`
- Modify: `bertel-tourism-ui/src/components/explorer/explorer-active-chips.test.ts`

**Interfaces:**
- Consumes: `essentialLabel`, `REMPLISSAGE_BUCKET_OPTIONS` (Tâche 6).
- Produces: deux valeurs de plus dans `ActiveChipGroup` : `'missingEssentialsBuckets'` et `'missingEssentialsAny'`.

**Pourquoi c'est une tâche et pas un détail :** le commentaire en tête du fichier rappelle qu'en 2026-07-27 trois critères étaient actifs **sans puce** — donc invisibles, non retirables, et absents du compteur qui en dérive. Un filtre sans puce est un filtre qu'on oublie avoir posé.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```ts
describe('§204 — puces du remplissage', () => {
  test('un palier actif produit une puce au libellé lisible, jamais le code brut', () => {
    const chips = buildExplorerActiveChips(filters({ missingEssentialsBuckets: ['many'] }));
    const chip = chips.find((c) => c.group === 'missingEssentialsBuckets');
    expect(chip).toBeDefined();
    expect(chip?.label).toBe('3 et plus');
    expect(chip?.value).toBe('many');
  });

  test('chaque essentiel demandé produit sa propre puce, retirable seule', () => {
    const chips = buildExplorerActiveChips(filters({ missingEssentialsAny: ['photos', 'contact'] }));
    const labels = chips
      .filter((c) => c.group === 'missingEssentialsAny')
      .map((c) => c.label);
    expect(labels).toEqual(['Il manque : Photos', 'Il manque : Contact public']);
  });

  test('aucune puce quand aucun critère de remplissage n’est actif', () => {
    const chips = buildExplorerActiveChips(DEFAULT_EXPLORER_FILTERS);
    expect(chips.some((c) => c.group.startsWith('missingEssentials'))).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer/explorer-active-chips.test.ts -t "204"
```

- [ ] **Step 3: Implémenter**

1. Ajouter au type `ActiveChipGroup` :

```ts
  // §204 — remplissage (réservé aux éditeurs)
  | 'missingEssentialsBuckets'
  | 'missingEssentialsAny'
```

2. Importer :

```ts
import { REMPLISSAGE_BUCKET_OPTIONS, essentialLabel } from '../../utils/remplissage';
```

3. Dans le corps de `buildExplorerActiveChips`, à la suite des puces `status` :

```ts
  // §204 — une puce PAR critère : chacune se retire seule. Libellés résolus,
  // jamais de code brut à l'écran.
  for (const code of filters.common.missingEssentialsBuckets) {
    const option = REMPLISSAGE_BUCKET_OPTIONS.find((o) => o.code === code);
    chips.push({
      key: `remplissage-bucket-${code}`,
      label: option?.label ?? code,
      group: 'missingEssentialsBuckets',
      value: code,
    });
  }
  for (const code of filters.common.missingEssentialsAny) {
    chips.push({
      key: `remplissage-essentiel-${code}`,
      label: `Il manque : ${essentialLabel(code)}`,
      group: 'missingEssentialsAny',
      value: code,
    });
  }
```

(Employer exactement la forme d'objet des puces voisines — inspecter une poussée existante si les champs diffèrent.)

4. Dans le composant qui rend les puces (`ExplorerActiveFilters.tsx`), câbler le retrait des deux nouveaux groupes sur `setMissingEssentialsBuckets` / `setMissingEssentialsAny`, en retirant la seule valeur cliquée — s'aligner sur le traitement du groupe `status`.

- [ ] **Step 4: Lancer et committer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer && npm run typecheck
```

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/ && git commit -m "feat(explorer): puces retirables pour les criteres de remplissage

Une puce par critere, retirable seule, libelles resolus. Un filtre sans puce
est invisible et non retirable — c est exactement ce qui avait ete corrige le
2026-07-27 sur trois autres criteres."
```

---

## Task 9: Front — la pastille sur la carte de résultat

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/ResultCardView.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/ResultCardView.test.tsx`

**Interfaces:**
- Consumes: `ObjectCard.missing_essentials` (Tâche 4/6), `remplissageTone`, `essentialLabel` (Tâche 6).

**Piège à ne pas commettre :** l'absence de `missing_essentials` ne veut **pas** dire « fiche complète ». Elle veut dire « l'appelant n'est pas éditeur » **ou** « le champ n'a pas été demandé ». Ne jamais afficher « complète » sur une absence — ne rien afficher.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```tsx
describe('§204 — pastille de remplissage', () => {
  test('aucune pastille quand le champ est absent — absence ≠ fiche complète', () => {
    renderCard(makeCard({}));
    expect(screen.queryByTestId('remplissage-pastille')).not.toBeInTheDocument();
  });

  test('aucune pastille quand la fiche est complète', () => {
    renderCard(makeCard({ missing_essentials: [] }));
    expect(screen.queryByTestId('remplissage-pastille')).not.toBeInTheDocument();
  });

  test('le compte s’affiche et le détail est dans le title', () => {
    renderCard(makeCard({ missing_essentials: ['photos', 'contact', 'tags'] }));
    const pastille = screen.getByTestId('remplissage-pastille');
    expect(pastille).toHaveTextContent('3 manquants');
    expect(pastille).toHaveAttribute('title', 'Manque : Photos, Contact public, Tags');
  });

  test('le singulier est respecté', () => {
    renderCard(makeCard({ missing_essentials: ['photos'] }));
    expect(screen.getByTestId('remplissage-pastille')).toHaveTextContent('1 manquant');
  });
});
```

`makeCard(overrides)` existe déjà dans ce fichier (ligne 25) — l'employer, ne pas en écrire un second. `renderCard` : reprendre **exactement** la façon dont les tests voisins montent `ResultCardView` (le composant prend davantage que `card` : handlers d'interaction, `interactive`…). Si les voisins appellent `render(<ResultCardView … />)` en ligne, faire de même plutôt que d'introduire un assistant que le fichier n'a pas.

- [ ] **Step 2: Lancer — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer/ResultCardView.test.tsx -t "204"
```

- [ ] **Step 3: Implémenter**

Importer :

```tsx
import { essentialLabel, remplissageTone } from '../../utils/remplissage';
```

Ajouter le composant local, près des autres pastilles du fichier :

```tsx
/**
 * §204 — pastille « N manquants » (éditeurs seulement : le champ n'est émis
 * qu'à eux par le RPC). L'ABSENCE du champ ne signifie pas « complète » — elle
 * signifie « non éditeur » ou « non demandé ». On ne rend donc rien du tout.
 */
function RemplissagePastille({ missing }: { missing?: string[] }) {
  if (!missing) return null;
  const tone = remplissageTone(missing.length);
  if (!tone) return null;
  const detail = missing.map(essentialLabel).join(', ');
  return (
    <span
      data-testid="remplissage-pastille"
      className={cn('badge', {
        'badge--muted': tone === 'neutral',
        'badge--warn': tone === 'warning',
        'badge--danger': tone === 'danger',
      })}
      title={`Manque : ${detail}`}
    >
      {missing.length} manquant{missing.length > 1 ? 's' : ''}
    </span>
  );
}
```

Puis le rendre dans l'en-tête de la carte, aligné à droite du nom :

```tsx
        <RemplissagePastille missing={card.missing_essentials} />
```

Si les classes `badge--danger` / `badge--warn` n'existent pas dans `styles.css`, employer celles réellement disponibles (les mêmes que la colonne `status` du tableau : `badge--ok`, `badge--warn`, `badge--muted`) plutôt que d'inventer une classe morte.

- [ ] **Step 4: Lancer et committer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer/ResultCardView.test.tsx && npm run typecheck
```

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/ResultCardView.tsx bertel-tourism-ui/src/components/explorer/ResultCardView.test.tsx && git commit -m "feat(explorer): pastille « N manquants » sur la carte de resultat

L absence du champ ne vaut PAS « fiche complete » : elle vaut « appelant non
editeur ». On ne rend rien, jamais un signal positif errone. Detail des
essentiels dans le title."
```

---

## Task 10: Front — la colonne « Remplissage » de la vue Table

**Files:**
- Modify: `bertel-tourism-ui/src/components/explorer/table-columns.tsx`
- Modify: `bertel-tourism-ui/src/store/explorer-view-store.ts:22-24`
- Modify: `bertel-tourism-ui/src/components/explorer/table-columns.test.tsx`

**Interfaces:**
- Consumes: `ObjectCard.missing_essentials`, `essentialLabel` (Tâche 6).

**Ce TODO existait déjà.** `table-columns.tsx:12` porte : « NB « Complétude » attend que le RPC cards émette le score — `ObjectCard` ne le porte pas aujourd'hui. » La Tâche 4 vient de le lui faire porter. Le registre gérant `sortValue`, la colonne apporte au passage le tri « les plus vides d'abord » dans la vue Table, sans toucher au contrat de tri du RPC.

- [ ] **Step 1: Écrire le test (il doit échouer)**

```tsx
describe('§204 — colonne Remplissage', () => {
  test('la colonne existe et est optionnelle (masquée par défaut)', () => {
    expect(TABLE_COLUMNS.remplissage).toBeDefined();
    expect(TABLE_COLUMNS.remplissage.label).toBe('Remplissage');
    expect(DEFAULT_TABLE_COLUMNS).not.toContain('remplissage');
    expect(ALL_TABLE_COLUMN_IDS).toContain('remplissage');
  });

  test('elle trie par nombre de manquants, le champ absent en dernier', () => {
    const sort = TABLE_COLUMNS.remplissage.sortValue!;
    expect(sort({ missing_essentials: ['a', 'b'] } as never)).toBe(2);
    expect(sort({ missing_essentials: [] } as never)).toBe(0);
    expect(sort({} as never)).toBeNull();
  });

  test('le CSV porte les codes lisibles, pas un compte muet', () => {
    expect(TABLE_COLUMNS.remplissage.csvValue({ missing_essentials: ['photos'] } as never))
      .toBe('Photos');
    expect(TABLE_COLUMNS.remplissage.csvValue({ missing_essentials: [] } as never))
      .toBe('complète');
    expect(TABLE_COLUMNS.remplissage.csvValue({} as never)).toBe('');
  });
});
```

- [ ] **Step 2: Lancer — il doit échouer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer/table-columns.test.tsx -t "204"
```

- [ ] **Step 3: Implémenter**

1. Dans `store/explorer-view-store.ts`, ajouter l'id aux colonnes optionnelles :

```ts
/** Colonnes proposées mais masquées par défaut. */
export const OPTIONAL_TABLE_COLUMNS = ['price', 'open', 'remplissage'] as const;
```

2. Dans `table-columns.tsx`, remplacer le commentaire en tête (lignes 11-12) :

```
 * NB « Complétude » attend que le RPC cards émette le score (backend, remonté
 * à la session API) — ObjectCard ne le porte pas aujourd'hui.
```

par :

```
 * §204 — la colonne « Remplissage » lit ObjectCard.missing_essentials, émis par
 * api.list_object_resources_filtered_page aux appelants ÉDITEURS uniquement.
 * Champ absent = appelant non éditeur, PAS « fiche complète » : la colonne rend
 * alors « — » et trie en dernier.
```

3. Ajouter l'entrée au registre, après `labels` :

```tsx
  remplissage: {
    id: 'remplissage',
    label: 'Remplissage',
    numeric: true,
    // null (champ absent) trie en dernier : on ne prétend pas savoir.
    sortValue: (card) => (card.missing_essentials ? card.missing_essentials.length : null),
    csvValue: (card) => {
      if (!card.missing_essentials) return '';
      if (card.missing_essentials.length === 0) return 'complète';
      return card.missing_essentials.map(essentialLabel).join(', ');
    },
    render: (card) => {
      if (!card.missing_essentials) return '—';
      if (card.missing_essentials.length === 0) return 'complète';
      return (
        <span title={`Manque : ${card.missing_essentials.map(essentialLabel).join(', ')}`}>
          {card.missing_essentials.length}
        </span>
      );
    },
  },
```

Importer `essentialLabel` depuis `../../utils/remplissage`.

- [ ] **Step 4: Lancer et committer**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run -- src/components/explorer && npm run typecheck
```

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src/components/explorer/table-columns.tsx bertel-tourism-ui/src/components/explorer/table-columns.test.tsx bertel-tourism-ui/src/store/explorer-view-store.ts && git commit -m "feat(explorer): colonne Remplissage dans la vue Table

Debloque le TODO pose en tete de table-columns.tsx : la colonne attendait que
le RPC cards emette la donnee, c est fait. Le registre gerant sortValue, le tri
« les plus vides d abord » vient sans toucher au contrat de tri du RPC.

Colonne optionnelle (masquee par defaut). Champ absent => « — » et tri en
dernier : on ne pretend pas savoir."
```

---

## Task 11: Renommer « complétude » en « remplissage » sur toutes les surfaces

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/CompletionRing.tsx:28,30`
- Modify: `bertel-tourism-ui/src/components/dashboard/CompletenessTable.tsx:33,74,85`
- Modify: `bertel-tourism-ui/src/components/dashboard/ScorecardStrip.tsx:38`
- Modify: `bertel-tourism-ui/src/features/help/content/pilotage.ts:19`
- Modify: les fichiers `*.test.tsx` qui assertent ces libellés

**Interfaces:** aucune. **Libellés visibles uniquement** — aucun nom de fonction, de type, de fichier ou de clé RPC ne change.

**Pourquoi c'est une tâche à part :** on vient de supprimer un écart de vocabulaire (deux pourcentages divergents). Laisser deux mots pour la même idée en recréerait un.

- [ ] **Step 1: Recenser les occurrences visibles**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui/src" && grep -rn "Complétude\|complétude" --include=*.tsx --include=*.ts .
```

Noter la liste. **Ne traiter que les chaînes affichées** (texte JSX, `aria-label`, `title`, contenu d'aide). Laisser tels quels : les noms de fichiers (`CompletenessTable.tsx`), les identifiants (`avg_completeness`, `DashboardCompleteness`), et les commentaires qui citent un nom SQL.

- [ ] **Step 2: Remplacer, surface par surface**

| Fichier | Avant | Après |
|---|---|---|
| `CompletionRing.tsx:28` | `Complétude <span…>` | `Remplissage <span…>` |
| `CompletionRing.tsx:30` | `aria-label={`Complétude ${percent}%`}` | `aria-label={`Remplissage ${percent}%`}` |
| `CompletenessTable.tsx:33` | `aria-label={`Complétude ${score} % …`}` | `aria-label={`Remplissage ${score} % …`}` |
| `CompletenessTable.tsx:74` | `<h2>Complétude par type</h2>` | `<h2>Remplissage par type</h2>` |
| `CompletenessTable.tsx:85` | `<th …>Complétude</th>` | `<th …>Remplissage</th>` |
| `ScorecardStrip.tsx:38` | `Complétude moyenne` | `Remplissage moyen` |
| `pilotage.ts:19` | `**complétude** des fiches` | `**remplissage** des fiches` |

Attention à l'accord dans `ScorecardStrip` : « Remplissage **moyen** », pas « moyenne ».

- [ ] **Step 3: Mettre les tests au même vocabulaire**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run
```

Les tests qui cherchent le texte « Complétude » vont échouer : c'est le comportement attendu, ils gardaient le libellé. Mettre à jour la chaîne attendue dans chacun (ne pas assouplir l'assertion en expression régulière — un test de libellé doit rester exact).

- [ ] **Step 4: Vérifier qu'il ne reste aucune occurrence visible**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui/src" && grep -rn "Complétude\|complétude" --include=*.tsx --include=*.ts . | grep -v "^.*:.*\* " | grep -v "\.test\."
```

Attendu : **aucune ligne** en dehors des commentaires. S'il en reste, c'est une surface oubliée.

- [ ] **Step 5: Suite complète et commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run && npm run typecheck
```

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/src && git commit -m "refactor(ui): « remplissage » remplace « completude » sur toutes les surfaces

Un seul mot pour une seule idee : Exploreur, anneau de l editeur, Dashboard
onglet Qualite, aide. On vient de supprimer un ecart de vocabulaire (deux
pourcentages divergents), en laisser un second serait absurde.

Libelles visibles uniquement — aucun nom de fonction, de type, de fichier ni
de cle RPC ne change."
```

---

## Task 12: Vérification de bout en bout sur l'application réelle

**Files:** aucun changement de code attendu. Si un défaut apparaît, il se corrige dans la tâche d'origine, avec son test.

- [ ] **Step 1: Suite complète et compilation**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui" && npm run test:run && npm run typecheck && npm run build
```

Attendu : les trois passent. `npm run build` compte : il exclut les fichiers de test et rattrape les imports qui ne tiennent que dans Jest.

- [ ] **Step 2: Rejouer toutes les gardes SQL touchées**

```bash
cd "C:/Users/dphil/Bertel3.0" && for t in test_remplissage_filter test_global_search test_accommodation_unit_type test_dashboard_scorecards test_pet_policy_single_source; do echo "--- $t"; node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/$t.sql"; done
```

Attendu : les cinq passent. `test_dashboard_scorecards` est là parce que les scorecards consomment `get_dashboard_completeness`, rebranché en Tâche 1.

- [ ] **Step 3: Lancer l'application et vérifier à l'écran**

Démarrer l'aperçu avec l'outil `preview_start` (jamais `npm run dev` dans un terminal — un seul serveur par dossier). Puis, connecté avec un compte **éditeur** :

1. Ouvrir l'Exploreur, dérouler le panneau de filtres.
2. Le groupe « Remplissage » est présent, sous « Statut ».
3. Cocher « 3 et plus » : la liste se restreint. Sur le corpus de référence mesuré le 2026-07-29, cela donne **39 fiches** — un écart important signale un problème de calibration, pas un simple aléa.
4. Chaque carte du résultat porte une pastille « N manquants » ; le survol affiche le détail.
5. Décocher, puis choisir « Il manque : Photos ». Le résultat doit être plus large (**357 fiches** à la mesure de référence).
6. Les deux puces apparaissent au-dessus des résultats et se retirent une par une.
7. Passer en vue Table, activer la colonne « Remplissage », trier dessus : les fiches les plus vides remontent.
8. Ouvrir une fiche à 3 manquants dans l'éditeur : l'anneau dit bien « Remplissage », pas « Complétude ».

- [ ] **Step 4: Vérifier le gate avec un compte NON éditeur**

Se reconnecter avec un compte lecteur seul :

1. Le groupe « Remplissage » **n'apparaît pas** dans le panneau.
2. Aucune pastille sur les cartes.
3. Dans les outils de développement, onglet Réseau, ouvrir la réponse du RPC de liste : **aucun objet de `data` ne porte `missing_essentials`**.

Le point 3 est le seul qui prouve le gate serveur. Les points 1 et 2 ne prouvent que le masquage à l'écran.

- [ ] **Step 5: Consigner la décision**

Ajouter une section `## §204` à `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`.

```bash
cd "C:/Users/dphil/Bertel3.0" && grep -n "^## §" bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md | tail -3
```

**Relire ce dernier numéro avant d'écrire** : si le journal est déjà allé au-delà de §203, prendre le suivant réellement libre et corriger les références `§204` du code et des commentaires. Consigner : le choix « nombre de manquants » plutôt que pourcentage et pourquoi ; les mesures (23 ms / 2,5 ms / 2,0 ms) ; le rejet de la colonne cachée ; les deux pièges (dernière définition dans `taxo6`, RPC de page en `SECURITY INVOKER`) ; l'exclusion de `name` de la facette.

- [ ] **Step 6: Mettre à jour le tableau des différés**

Dans `.claude/WORKFLOW.md`, ajouter les points laissés de côté :

| Item | Raison différée | Débloqué par |
|---|---|---|
| Compteurs par palier dans le panneau (409/397/39) | demanderait un appel d'agrégat à chaque changement de filtre | demande PO |
| Tri « les plus vides d'abord » en vue Cartes | arbitré : pastille seule ; la vue Table l'a par son registre | demande PO |
| `n_photos` compte toutes les lignes `media` (vidéos et documents inclus) | approximation héritée du bundle d'origine ; la corriger déplacerait les chiffres du Dashboard | passe dédiée sur le type de média |
| Colonne cachée `object.cached_missing_essentials` | inutile à 846 fiches (23 ms) ; exigerait ~8 triggers et un backfill qui pousse `updated_at` sur tout le corpus | corpus > ~5 000 fiches |

- [ ] **Step 7: Commit final**

```bash
cd "C:/Users/dphil/Bertel3.0" && git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md .claude/WORKFLOW.md && git commit -m "docs: consigner §204 (filtre Remplissage) et ses differes

Mesures, arbitrages et les deux pieges rencontres : la derniere definition de
get_filtered_object_ids vit dans taxo6 (pas dans la migration phonetique), et
le RPC de page est SECURITY INVOKER donc incapable de lire le schema internal."
```

---

## Ce qui n'est PAS dans ce plan

| Écarté | Raison |
|---|---|
| Compteurs par palier dans le panneau | appel d'agrégat supplémentaire à chaque changement de filtre ; non demandé |
| Tri par remplissage en vue Cartes | arbitré pendant la conception : pastille seule |
| Les 15 % complémentaire et 5 % bonus du modèle éditeur portés en SQL | réplique du TypeScript, dérive garantie |
| Colonne cachée sur `object` | voir §3 de la spec |
| Renommage des identifiants SQL et des clés RPC | « remplissage » est un libellé ; les clés décrivent la donnée |