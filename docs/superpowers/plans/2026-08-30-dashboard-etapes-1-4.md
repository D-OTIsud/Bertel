# Dashboard étapes 1-4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le tableau de bord honnête et actionnable — carte d'attention branchée sur le CRM réel, fiches sous 80 % dépliables, pont vers l'Explorateur, et affichage des 73 jours de relevés quotidiens qui dorment dans `metric_snapshot`.

**Architecture:** Quatre chantiers indépendants, exécutables dans l'ordre. Un seul touche le SQL (Task 1 : une RPC d'agrégat CRM, `SECURITY DEFINER`, comptes seulement, jamais de PII). Les trois autres sont **frontend pur** : ils consomment des données déjà émises par le serveur (`below_80` est déjà dans la réponse de `get_dashboard_completeness`) ou des RPC déjà déployées (`api.get_metric_snapshot_series`).

**Tech Stack:** Next.js App Router · React 19 · TanStack Query v5 · Zustand · Jest + React Testing Library · PostgreSQL/Supabase (schéma `api`, RPC `SECURITY DEFINER`).

**Spec de référence :** `docs/audits/2026-08-30-dashboard-audit-propositions.md` (axes A, B1, B3, B2). Maquette validée : artifact « Dashboard, étapes 1 à 4 ».

## Global Constraints

- **Répertoire de travail :** `bertel-tourism-ui/` pour tout le frontend ; `Base de donnée DLL et API/` pour le SQL. Ne jamais `cd` hors du worktree.
- **Prérequis worktree :** `node_modules` est une **jonction** vers le dépôt principal. Si `jest` ou `tsc` échoue sur « Cannot find module », la recréer **avant toute chose** :
  ```bash
  cmd /c mklink /J "C:\Users\dphil\Bertel3.0\.claude\worktrees\sweet-franklin-807ec6\bertel-tourism-ui\node_modules" "C:\Users\dphil\Bertel3.0\bertel-tourism-ui\node_modules"
  ```
- **Commandes :** suite complète `npm run test:run` · un fichier `npx jest <chemin>` · un test `npx jest <chemin> -t "<nom>"` · types `npm run typecheck`. **Jamais `npm test`** (il lance `jest --watch` et ne rend jamais la main).
- **⚠️ Deux lignes de base à connaître avant de commencer** (mesurées sur arbre propre) :
  - **Périmètre dashboard : VERT** — 16 suites / 79 tests en ~7 s. Toute suite rouge après vos changements est **votre** régression.
    ```bash
    npx jest src/components/dashboard src/views/DashboardPage.test.tsx src/services/dashboard-rpc.test.ts src/hooks/useDashboardQuery.test.tsx src/lib/dashboard-type-drilldown.test.ts src/lib/dashboard-stats-params.test.ts src/store/dashboard-filter-store.test.ts
    ```
  - **`npm run typecheck` est DÉJÀ ROUGE : 10 erreurs préexistantes**, aucune dans le dashboard (9 × TS2741 « Property 'isPublic' is missing » dans les tests CRM, 1 × TS2531 dans `src/services/export/export-columns.test.ts:331`). **Ne jamais lire « 0 erreur » comme critère.** Comparer au compte de référence :
    ```bash
    npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
    ```
    Attendu : **10**. Plus de 10 ⇒ votre régression. Ces 10 erreurs ne cassent pas le build : `next build` utilise `tsconfig.json`, qui **exclut** les fichiers `*.test.ts(x)`.
- **Tests en français**, comme tout le dossier `src/components/dashboard/` : `describe('Composant', …)` puis `it('fait ceci', …)`. Les matchers `jest-dom` sont **globaux** (`jest.setup.ts` les importe) — ne pas les réimporter par fichier.
- **Imports relatifs** dans les tests du dashboard (`../../store/…`), pas l'alias `@/` — même si le `moduleNameMapper` le supporte.
- **Piège `-t` :** les noms de tests portent des apostrophes typographiques U+2019 (`l’onglet`). Copier-coller le nom depuis le fichier, ne jamais retaper une apostrophe droite.
- **Reset de store obligatoire** dans chaque `beforeEach` d'un test qui touche au store Explorer : `act(() => useDashboardExplorerStore.getState().resetAll())`.
- **Aucun mock de données pour les nouveaux widgets** (principe « real DB data ») : en mode démo ils affichent l'état vide. `src/data/mock-dashboard.ts` n'est **pas** étendu.
- **Jamais `rgba(var(--x-rgb), a)`** — la forme autorisée est `rgb(var(--x-rgb) / a)`. Une garde Jest existe.
- **Invariant drill-down :** le seul levier de filtre par type est le **bucket** (`toggleDrilldownType` / `toggleBucket`), jamais `filters.types`.
- **Commits :** conventionnels (`feat:`, `fix:`, `test:`, `docs:`), **sans trailer de co-auteur**. Un commit par tâche minimum.
- **SQL (Task 1 uniquement), invariants §204/§213 :**
  - `REVOKE ALL … FROM PUBLIC, anon` est **obligatoire** sur toute fonction neuve (PostgreSQL accorde `EXECUTE` à `PUBLIC` par défaut et un `GRANT` ciblé ne le retire pas), puis `GRANT … TO authenticated, service_role`.
  - `SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref`.
  - `gen_random_uuid()`, jamais `uuid_generate_v4()`.
  - Toute sonde passant par `auth.*()` est à **trois valeurs** (NULL hors contexte HTTP) : envelopper dans `COALESCE(…, FALSE)`, sinon la garde est fail-open.
  - Fonction exposée neuve ⇒ `NOTIFY pgrst, 'reload schema';` après application.
  - Le test SQL doit être prouvé **non vacant** : vérifié ROUGE avant application, VERT après.
  - Toute nouvelle fonction est foldée dans `api_views_functions.sql` **et** inscrite au manifeste `docs/SQL_ROLLOUT_RUNBOOK.md`.

---

## File Structure

| Fichier | Rôle | Tâche |
|---|---|---|
| `Base de donnée DLL et API/api_views_functions.sql` | accueille `api.get_dashboard_crm_open` (fold) | 1 |
| `Base de donnée DLL et API/migration_dashboard_crm_open.sql` | migration autonome, idempotente | 1 |
| `Base de donnée DLL et API/tests/test_dashboard_crm_open.sql` | garde SQL transactionnelle | 1 |
| `docs/SQL_ROLLOUT_RUNBOOK.md` | entrée de manifeste `17f` | 1 |
| `src/types/dashboard.ts` | types `DashboardCrmOpen`, extension `DashboardScorecards` | 1, 2 |
| `src/services/dashboard-rpc.ts` | getter `getDashboardCrmOpen` | 1 |
| `src/components/dashboard/ScorecardStrip.tsx` | carte d'attention CRM + delta honnête | 2 |
| `src/views/DashboardPage.tsx` | câblage requête CRM, placeholder Activité, widgets séries | 2, 4, 5 |
| `src/components/dashboard/CompletenessTable.tsx` | lignes dépliables sur `below_80` | 3 |
| `src/components/dashboard/ExplorerBridgeButton.tsx` | bouton « Ouvrir dans l'Explorateur » | 4 |
| `src/components/explorer/ExplorerActiveFilters.tsx` | accueille le bouton, reste visible sans puce | 4 |
| `src/services/metric-snapshot-rpc.ts` | getters `getMetricSnapshotSeries` / `…Yoy` | 5 |
| `src/hooks/useMetricSnapshotSeries.ts` | hook React Query dédié | 5 |
| `src/components/dashboard/TimeseriesChart.tsx` | courbe SVG maison réutilisable | 5 |
| `src/components/dashboard/TimeseriesWidget.tsx` | cadre + sélecteur de métrique + notes d'honnêteté | 6 |

**Pas de librairie de graphique dans le projet** (vérifié dans `package.json` : ni recharts, ni chart.js, ni visx, ni d3). `TimeseriesChart` est du **SVG inline maison**, cohérent avec les jauges `.meter` et `.rate-bar` existantes. N'en installez pas une.

---

## Task 1 : RPC d'agrégat CRM `api.get_dashboard_crm_open`

**Files:**
- Create: `Base de donnée DLL et API/migration_dashboard_crm_open.sql`
- Create: `Base de donnée DLL et API/tests/test_dashboard_crm_open.sql`
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (fold, après le bloc `get_dashboard_completeness`, avant `-- Capture daily metric snapshots (Brique 2)` vers la ligne 10278)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée `17f`)
- Modify: `bertel-tourism-ui/src/types/dashboard.ts`
- Modify: `bertel-tourism-ui/src/services/dashboard-rpc.ts`

**Interfaces:**
- Consomme : rien (première tâche).
- Produit :
  - SQL `api.get_dashboard_crm_open() RETURNS jsonb` — clés `open_interactions` (int), `open_tasks` (int), `total` (int).
  - TS `interface DashboardCrmOpen { open_interactions: number; open_tasks: number; total: number }` dans `src/types/dashboard.ts`.
  - TS `getDashboardCrmOpen(): Promise<DashboardCrmOpen>` dans `src/services/dashboard-rpc.ts`.

**Décisions déjà arbitrées — ne pas les rouvrir :**
- **Le compte est GLOBAL**, il ne prend aucun paramètre de filtre (arbitrage PO 2026-08-30). C'est un signal stable « ce qui m'attend aujourd'hui », pas une statistique de périmètre.
- **`open_interactions` reprend MOT POUR MOT le prédicat de `crm_backlog`** dans `api.capture_metric_snapshots` : `resolved_at IS NULL AND status::text <> 'done'`. Toute autre formulation ferait diverger la carte du bandeau et la courbe de l'onglet Activité, qui lisent la même réalité.
- **`open_tasks` = `status IN ('todo','in_progress','blocked')`**, et surtout **pas** `<> 'done'` : l'enum `crm_task_status` vaut `todo, in_progress, done, canceled, blocked`, et une tâche annulée n'est pas du travail en attente.
- **Aucune PII émise** : trois entiers, rien d'autre. C'est ce qui permet à la fonction de rester lisible par tout authentifié sans reproduire la doctrine de périmètre CRM (§61).

- [ ] **Step 1 : Écrire le test SQL (il doit échouer)**

Créer `Base de donnée DLL et API/tests/test_dashboard_crm_open.sql` :

```sql
-- test_dashboard_crm_open.sql
-- Dashboard §1 : compteur global des demandes CRM ouvertes (carte d'attention).
-- Run AFTER api_views_functions.sql. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v            jsonb;
  v_int_live   int;
  v_task_live  int;
  v_backlog    int;
  v_has_public boolean;
BEGIN
  -- (A) contrat de sortie
  v := api.get_dashboard_crm_open();
  ASSERT v ? 'open_interactions', 'clé open_interactions présente';
  ASSERT v ? 'open_tasks',        'clé open_tasks présente';
  ASSERT v ? 'total',             'clé total présente';

  -- (B) open_interactions == le prédicat exact de crm_backlog
  SELECT count(*) INTO v_int_live
  FROM   crm_interaction
  WHERE  resolved_at IS NULL AND status::text <> 'done';
  ASSERT (v->>'open_interactions')::int = v_int_live,
         format('open_interactions (%s) doit égaler le comptage live (%s)',
                v->>'open_interactions', v_int_live);

  -- (C) open_tasks exclut canceled ET done
  SELECT count(*) INTO v_task_live
  FROM   crm_task
  WHERE  status::text IN ('todo','in_progress','blocked');
  ASSERT (v->>'open_tasks')::int = v_task_live,
         format('open_tasks (%s) doit égaler le comptage live (%s)',
                v->>'open_tasks', v_task_live);

  -- (D) total = somme des deux
  ASSERT (v->>'total')::int = (v->>'open_interactions')::int + (v->>'open_tasks')::int,
         'total = open_interactions + open_tasks';

  -- (E) cohérence avec le KPI historisé : la carte et la courbe disent la même chose
  SELECT count(*) INTO v_backlog
  FROM   crm_interaction WHERE resolved_at IS NULL AND status::text <> 'done';
  ASSERT (v->>'open_interactions')::int = v_backlog,
         'open_interactions suit le même prédicat que crm_backlog (capture_metric_snapshots)';

  -- (F) §204 — EXECUTE retiré de PUBLIC et anon
  SELECT bool_or(has_function_privilege(r, 'api.get_dashboard_crm_open()', 'EXECUTE'))
  INTO   v_has_public
  FROM   unnest(ARRAY['public','anon']) AS r;
  ASSERT NOT COALESCE(v_has_public, FALSE),
         'EXECUTE doit être révoqué de PUBLIC et anon (§204)';

  -- (G) …mais accordé aux rôles applicatifs
  ASSERT has_function_privilege('authenticated', 'api.get_dashboard_crm_open()', 'EXECUTE'),
         'authenticated doit pouvoir exécuter';
  ASSERT has_function_privilege('service_role', 'api.get_dashboard_crm_open()', 'EXECUTE'),
         'service_role doit pouvoir exécuter';

  RAISE NOTICE 'test_dashboard_crm_open: OK (interactions=%, tasks=%)',
               v->>'open_interactions', v->>'open_tasks';
END $$;

ROLLBACK;
```

- [ ] **Step 2 : Lancer le test pour le voir échouer (garde non vacante)**

Via le MCP Supabase `execute_sql`, exécuter le bloc `DO $$ … $$` ci-dessus (sans les directives psql `\set` et sans `BEGIN`/`ROLLBACK`, que `execute_sql` ne prend pas).

Attendu : `ERROR: function api.get_dashboard_crm_open() does not exist`.

**Ne pas continuer si le test passe** — cela signifierait que la garde est vacante.

- [ ] **Step 3 : Écrire la migration**

Créer `Base de donnée DLL et API/migration_dashboard_crm_open.sql` :

```sql
-- migration_dashboard_crm_open.sql
-- §226 — Carte d'attention du dashboard : compteur GLOBAL des demandes CRM ouvertes.
-- Remplace le compteur pending_change (table vide depuis toujours) de la carte d'attention.
-- Après 8z (migration_crm_module.sql) et 16z (crm_task). Idempotent.
--
-- INVARIANT : open_interactions reprend MOT POUR MOT le prédicat de crm_backlog dans
-- api.capture_metric_snapshots — la carte du bandeau et la courbe de l'onglet Activité
-- doivent compter la même chose, sans quoi l'écran se contredit lui-même.
--
-- AUCUNE PII : trois entiers. La fonction n'émet ni sujet, ni corps, ni acteur, ni assigné,
-- ce qui la dispense de reproduire la doctrine de périmètre CRM (§61) tout en restant sûre.

CREATE OR REPLACE FUNCTION api.get_dashboard_crm_open()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH interactions AS (
    SELECT count(*)::int AS n
    FROM   crm_interaction
    WHERE  resolved_at IS NULL
      AND  status::text <> 'done'
  ),
  tasks AS (
    SELECT count(*)::int AS n
    FROM   crm_task
    WHERE  status::text IN ('todo', 'in_progress', 'blocked')
  )
  SELECT jsonb_build_object(
    'open_interactions', i.n,
    'open_tasks',        t.n,
    'total',             i.n + t.n
  )
  FROM interactions i, tasks t;
$$;

COMMENT ON FUNCTION api.get_dashboard_crm_open IS
'Dashboard §1 : compteur GLOBAL des éléments CRM ouverts pour la carte d''attention du bandeau.
open_interactions reprend le prédicat exact de crm_backlog (api.capture_metric_snapshots) :
resolved_at IS NULL AND status <> ''done''. open_tasks = crm_task en todo/in_progress/blocked
(canceled et done exclus — une tâche annulée n''est pas du travail en attente).
GLOBAL par décision produit (2026-08-30) : la carte est un signal stable « ce qui m''attend
aujourd''hui », elle n''obéit pas au panneau de filtres. N''émet aucune PII (trois entiers).';

-- §204 — EXECUTE est accordé à PUBLIC par défaut sur toute fonction neuve ; un GRANT ciblé
-- ne le retire pas. Le REVOKE est obligatoire, dans cet ordre.
REVOKE EXECUTE ON FUNCTION api.get_dashboard_crm_open() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_crm_open() TO   authenticated, service_role;

-- Garde dure : un ré-apply par un rôle non-propriétaire ne rend qu'un WARNING sur le REVOKE,
-- que ON_ERROR_STOP ne rattrape pas. On échoue fort plutôt que de déployer une fonction ouverte.
DO $$
BEGIN
  IF has_function_privilege('public', 'api.get_dashboard_crm_open()', 'EXECUTE')
     OR has_function_privilege('anon', 'api.get_dashboard_crm_open()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.get_dashboard_crm_open — fonction ouverte, arrêt.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4 : Appliquer au live et vérifier le test VERT**

Appliquer via le MCP Supabase `apply_migration` (nom : `dashboard_crm_open`), puis relancer le bloc `DO` de l'étape 2.

Attendu : `NOTICE: test_dashboard_crm_open: OK (interactions=170, tasks=2)`.

Vérifier ensuite la valeur brute :

```sql
select api.get_dashboard_crm_open();
```

Attendu aujourd'hui : `{"total": 172, "open_tasks": 2, "open_interactions": 170}`.

- [ ] **Step 5 : Folder dans `api_views_functions.sql`**

Copier le bloc `CREATE OR REPLACE FUNCTION … NOTIFY pgrst` (sans l'en-tête de commentaire de migration) dans `Base de donnée DLL et API/api_views_functions.sql`, immédiatement après le `GRANT EXECUTE ON FUNCTION api.get_dashboard_completeness(...)` (vers la ligne 10276) et avant le commentaire `-- Capture daily metric snapshots (Brique 2)`, précédé du séparateur de section maison :

```sql
-- ─────────────────────────────────────────────────────
-- §1  CRM ouvert — compteur global de la carte d'attention
-- ─────────────────────────────────────────────────────
```

- [ ] **Step 6 : Inscrire l'entrée `17f` au manifeste**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, après l'entrée `17e`, ajouter :

```markdown
17f. `migration_dashboard_crm_open.sql` — **La carte d'attention du dashboard comptait une table vide (§226)** (après **8z** pour `crm_interaction` et **16z** pour `crm_task` ; foldée dans `api_views_functions.sql` ; idempotente). **Mesuré, pas déduit** : `pending_change` contient **0 ligne depuis toujours**, si bien que le bandeau affichait « À jour — 0 demande en cours » avec un bouton vers `/crm`, pendant que 170 interactions planifiées et 2 tâches y attendaient. **`open_interactions` reprend MOT POUR MOT le prédicat de `crm_backlog`** (`api.capture_metric_snapshots`) : `resolved_at IS NULL AND status <> 'done'` — sans cette identité, la carte du bandeau et la courbe « Interactions planifiées dans le temps » de l'onglet Activité afficheraient deux chiffres différents pour la même réalité. **`open_tasks` exclut `canceled`** (`IN ('todo','in_progress','blocked')`, et non `<> 'done'`) : l'enum `crm_task_status` porte cinq valeurs et une tâche annulée n'est pas du travail en attente. **Compteur GLOBAL par décision produit (PO, 2026-08-30)** : il ne prend aucun paramètre de filtre, la carte étant un signal stable « ce qui m'attend aujourd'hui » ; l'interface le dit explicitement (« Tout le périmètre »). **N'émet aucune PII** — trois entiers, ni sujet, ni corps, ni acteur, ni assigné : c'est ce qui la dispense de reproduire la doctrine de périmètre CRM (§61) tout en restant sûre. **`REVOKE ALL … FROM PUBLIC, anon` obligatoire** (§204) suivi d'une garde `DO` qui échoue fort si le REVOKE n'a pas pris. **Fonction exposée neuve ⇒ `NOTIFY pgrst, 'reload schema';`**. Couverte par `tests/test_dashboard_crm_open.sql` — garde **non vacante**, vérifiée rouge avant application (`function api.get_dashboard_crm_open() does not exist`) et verte après. Plan `docs/superpowers/plans/2026-08-30-dashboard-etapes-1-4.md`.
```

**Le créneau `17f` est libre** : `17a` à `17e` sont pris (le bloc `16a`–`16z` est épuisé). ⚠️ Signaler au passage que **deux entrées portent déjà `17c`** (`migration_crm_assignee_eligibility.sql` et `migration_crm_notes_probe.sql`) — collision préexistante, hors périmètre de ce plan, à corriger séparément.

- [ ] **Step 7 : Écrire le test du service frontend (il doit échouer)**

**Le patron de ce fichier n'est pas celui d'un test de composant** — le module est importé **dynamiquement après** les `jest.doMock`, sinon le vrai client Supabase serait déjà résolu. Le `beforeEach` fait `jest.resetModules()`, et `mockClient()` **ne prend aucun argument** : le `rpc` et le `schema` sont des `jest.fn()` partagés au niveau du `describe`. Le second `doMock` force `demoMode: false` — indispensable, parce que `jest.setup.ts` met `NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true'` et qu'un getter en mode démo ne toucherait jamais la RPC.

Ajouter **à l'intérieur du `describe('dashboard-rpc getters', …)` existant** de `bertel-tourism-ui/src/services/dashboard-rpc.test.ts` :

```ts
  it('getDashboardCrmOpen appelle la RPC sans aucun paramètre', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: { open_interactions: 170, open_tasks: 2, total: 172 }, error: null });
    const { getDashboardCrmOpen } = await import('./dashboard-rpc');

    const result = await getDashboardCrmOpen();

    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('get_dashboard_crm_open');
    expect(result.total).toBe(172);
  });

  it('getDashboardCrmOpen propage l’erreur RPC au lieu de l’avaler', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { getDashboardCrmOpen } = await import('./dashboard-rpc');

    await expect(getDashboardCrmOpen()).rejects.toThrow('boom');
  });
```

**Aucun import à ajouter en tête de fichier** : le module est chargé par `await import('./dashboard-rpc')` dans chaque test.

- [ ] **Step 8 : Lancer le test pour le voir échouer**

```bash
npx jest src/services/dashboard-rpc.test.ts -t "getDashboardCrmOpen"
```

Attendu : FAIL, `getDashboardCrmOpen is not a function` (le module se charge, mais l'export n'existe pas encore).

- [ ] **Step 9 : Ajouter le type**

Dans `bertel-tourism-ui/src/types/dashboard.ts`, après l'interface `DashboardScorecards` :

```ts
// ─── §1  CRM ouvert — carte d'attention du bandeau (LOCKED — 2026-08-30) ─────

export interface DashboardCrmOpen {
  /**
   * Interactions CRM ouvertes, GLOBAL (aucun filtre appliqué).
   * Prédicat identique à crm_backlog dans api.capture_metric_snapshots :
   * resolved_at IS NULL AND status <> 'done'.
   */
  open_interactions: number;
  /** Tâches CRM en todo / in_progress / blocked. canceled et done exclus. */
  open_tasks: number;
  /** open_interactions + open_tasks */
  total: number;
}
```

- [ ] **Step 10 : Implémenter le getter**

Dans `bertel-tourism-ui/src/services/dashboard-rpc.ts`, ajouter `DashboardCrmOpen` à l'import de types depuis `../types/dashboard`, puis après `getDashboardDistinctionOverview` :

```ts
/**
 * Compteur GLOBAL des éléments CRM ouverts (carte d'attention du bandeau).
 * Sans paramètre : la carte n'obéit pas au panneau de filtres (décision PO 2026-08-30).
 */
export async function getDashboardCrmOpen(): Promise<DashboardCrmOpen> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) {
    return { open_interactions: 0, open_tasks: 0, total: 0 };
  }

  const client = requireDashboardRpcClient();
  const { data, error } = await client
    .schema('api')
    .rpc('get_dashboard_crm_open');

  if (error) throw error;
  return data as DashboardCrmOpen;
}
```

- [ ] **Step 11 : Lancer les tests pour les voir passer**

```bash
npx jest src/services/dashboard-rpc.test.ts
```

Attendu : PASS, tous les tests du fichier.

- [ ] **Step 12 : Typecheck et commit**

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10** — la ligne de base préexistante, aucune erreur dans le dashboard. Un nombre supérieur signale votre régression.

```bash
git add "Base de donnée DLL et API/migration_dashboard_crm_open.sql" "Base de donnée DLL et API/tests/test_dashboard_crm_open.sql" "Base de donnée DLL et API/api_views_functions.sql" docs/SQL_ROLLOUT_RUNBOOK.md bertel-tourism-ui/src/types/dashboard.ts bertel-tourism-ui/src/services/dashboard-rpc.ts bertel-tourism-ui/src/services/dashboard-rpc.test.ts
git commit -m "feat(dashboard): compter les demandes CRM reelles pour la carte d'attention"
```

---

## Task 2 : Bandeau honnête — carte d'attention CRM et delta visible

**Files:**
- Modify: `bertel-tourism-ui/src/components/dashboard/ScorecardStrip.tsx`
- Modify: `bertel-tourism-ui/src/views/DashboardPage.tsx`
- Test: `bertel-tourism-ui/src/components/dashboard/ScorecardStrip.test.tsx` (créer s'il n'existe pas)

**Interfaces:**
- Consomme : `DashboardCrmOpen` et `getDashboardCrmOpen` (Task 1) ; `useDashboardQuery` (existant, signature ci-dessous).
- Produit : `ScorecardStrip` accepte désormais une prop `crmOpen?: DashboardCrmOpen`.

Signature du hook existant, à ne pas modifier :

```ts
export function useDashboardQuery<T>(
  widget: string,
  params: DashboardStatsParams,
  fetcher: (params: DashboardStatsParams) => Promise<T>,
  enabled = true,
): UseQueryResult<T>
```

**Trois défauts à corriger, tous vérifiés en production :**
1. La carte compte `pending_changes` (0 depuis toujours) et affiche « À jour ».
2. `{data.delta_30d > 0 && …}` : avec un delta de 0, le bandeau n'affiche **rien** — un blanc silencieux là où la vérité est « +0 ce mois ». Cas réel reproductible avec le filtre commune « Le Tampon » (`delta_30d = 0`, `delta_pct = -100`).
3. `delta_pct` est calculé par le serveur et **jamais affiché**.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `bertel-tourism-ui/src/components/dashboard/ScorecardStrip.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { ScorecardStrip } from './ScorecardStrip';
import type { DashboardScorecards, DashboardCrmOpen } from '../../types/dashboard';

const base: DashboardScorecards = {
  total: 359,
  published: 359,
  published_pct: 100,
  avg_completeness: 91.8,
  distinctions: 75,
  distinctions_pct: 20.9,
  pending_changes: 0,
  delta_30d: 0,
  delta_pct: -100,
  avg_processing_days: null,
};

const crmOpen: DashboardCrmOpen = { open_interactions: 170, open_tasks: 2, total: 172 };

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe('ScorecardStrip', () => {
  it('affiche le delta même à zéro, avec le pourcentage', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText(/\+0 ce mois/)).toBeInTheDocument();
    expect(screen.getByText(/−100 %/)).toBeInTheDocument();
  });

  it('compte les demandes CRM ouvertes, pas les pending_change', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText('172')).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    expect(screen.getByText(/170 interactions planifiées/)).toBeInTheDocument();
    expect(screen.getByText(/2 tâches à faire/)).toBeInTheDocument();
  });

  it('dit que le compte CRM est global, pas filtré', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText(/Tout le périmètre/)).toBeInTheDocument();
  });

  it('passe en état calme quand il ne reste rien à traiter', () => {
    render(<ScorecardStrip data={base} crmOpen={{ open_interactions: 0, open_tasks: 0, total: 0 }} />);
    expect(screen.getByText('À jour')).toBeInTheDocument();
  });

  it('reste rendu quand le compte CRM n’est pas encore chargé', () => {
    render(<ScorecardStrip data={base} />);
    expect(screen.getByText('359')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

```bash
npx jest src/components/dashboard/ScorecardStrip.test.tsx
```

Attendu : FAIL — la prop `crmOpen` n'existe pas, « +0 ce mois » absent du DOM.

- [ ] **Step 3 : Implémenter dans `ScorecardStrip.tsx`**

Remplacer l'interface `Props`, le corps de la carte meneuse et la carte d'attention :

```tsx
import Link from 'next/link';
import { Bell, CheckCircle2 } from 'lucide-react';
import type { DashboardScorecards, DashboardCrmOpen } from '../../types/dashboard';

interface Props {
  data: DashboardScorecards;
  /** Compteur CRM GLOBAL. Absent tant que la requête n'a pas répondu. */
  crmOpen?: DashboardCrmOpen;
}

const nf = new Intl.NumberFormat('fr-FR');

/** « +5 ce mois · +25 % vs 30 j préc. » — jamais un blanc : un mois à zéro est une information. */
function deltaLabel(delta30d: number, deltaPct: number | null): string {
  const head = `+${nf.format(delta30d)} ce mois`;
  if (deltaPct === null) return head;
  const sign = deltaPct < 0 ? '−' : '+';
  return `${head} · ${sign}${nf.format(Math.abs(deltaPct))} % vs 30 j préc.`;
}

function deltaTone(delta30d: number, deltaPct: number | null): string {
  if (deltaPct !== null && deltaPct < 0) return ' summary-stat__delta--down';
  if (delta30d > 0) return ' summary-stat__delta--up';
  return ' summary-stat__delta--flat';
}
```

Puis, dans le JSX, remplacer le bloc de la carte meneuse :

```tsx
      <article className="summary-stat summary-stat--lead">
        <span className="summary-stat__label">Inscrits SIT</span>
        <strong className="summary-stat__value">{nf.format(data.total)}</strong>
        <span className={`summary-stat__delta${deltaTone(data.delta_30d, data.delta_pct)}`}>
          {deltaLabel(data.delta_30d, data.delta_pct)}
        </span>
      </article>
```

Et remplacer intégralement la carte d'attention (l'ancienne lisait `data.pending_changes`) :

```tsx
      {/* Compteur CRM GLOBAL — il n'obéit pas au panneau de filtres (décision PO 2026-08-30),
          et la carte le dit, parce qu'un chiffre non filtré au milieu de chiffres filtrés
          doit s'annoncer. pending_change n'est plus lu : la table est vide depuis toujours. */}
      <article
        className={`summary-attn${crmOpen && crmOpen.total > 0 ? '' : ' summary-attn--ok'}`}
        role="region"
        aria-label="Demandes à traiter"
      >
        <span className="summary-attn__top">
          {crmOpen && crmOpen.total > 0 ? <Bell aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {crmOpen && crmOpen.total > 0 ? 'À traiter' : 'À jour'}
        </span>
        <span className="summary-attn__line">
          <span className="summary-attn__big">{nf.format(crmOpen?.total ?? 0)}</span>
          <span className="summary-attn__txt">
            {(crmOpen?.total ?? 0) > 1 ? 'demandes en cours' : 'demande en cours'}
          </span>
        </span>
        {crmOpen && (
          <span className="summary-attn__breakdown">
            Tout le périmètre · {nf.format(crmOpen.open_interactions)} interaction
            {crmOpen.open_interactions > 1 ? 's' : ''} planifiée
            {crmOpen.open_interactions > 1 ? 's' : ''}, {nf.format(crmOpen.open_tasks)} tâche
            {crmOpen.open_tasks > 1 ? 's' : ''} à faire
          </span>
        )}
        <Link href="/crm" className="summary-attn__cta">
          {crmOpen && crmOpen.total > 0 ? 'Ouvrir le suivi CRM' : 'Voir le suivi CRM'}
        </Link>
      </article>
```

- [ ] **Step 4 : Ajouter les deux classes CSS manquantes**

Dans `bertel-tourism-ui/src/styles.css`, juste après la règle existante `.summary-stat__delta--up` :

```css
.summary-stat__delta--flat { color: var(--text-muted); }
.summary-stat__delta--down { color: var(--red); }
.summary-stat--lead .summary-stat__delta--flat { color: rgb(255 255 255 / 0.72); }
.summary-stat--lead .summary-stat__delta--down { color: #ffd9cf; }
.summary-attn__breakdown {
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-muted);
}
```

- [ ] **Step 5 : Lancer les tests pour les voir passer**

```bash
npx jest src/components/dashboard/ScorecardStrip.test.tsx
```

Attendu : PASS, 5 tests.

- [ ] **Step 6 : Câbler la requête dans `DashboardPage.tsx`**

Ajouter `getDashboardCrmOpen` à l'import depuis `../services/dashboard-rpc`, puis après la ligne `const scorecards = useDashboardQuery('scorecards', …)` :

```tsx
  // Compteur CRM global : le fetcher ignore `params` (la carte n'est pas filtrée),
  // mais on passe params quand même pour garder UNE seule forme de queryKey.
  const crmOpen = useDashboardQuery('crm-open', params, () => getDashboardCrmOpen());
```

Puis remplacer l'appel au composant :

```tsx
            {scorecards.data && <ScorecardStrip data={scorecards.data} crmOpen={crmOpen.data} />}
```

- [ ] **Step 7 : Remplacer le placeholder « lot 4 »**

Dans `DashboardPage.tsx`, dans le panneau `activeTab === 'activity'`, remplacer le texte :

```tsx
              <p className="dashboard-widget-state">
                Vélocité, contributeurs et modération arrivent dans un prochain lot (lot 4).
              </p>
```

par :

```tsx
              <p className="dashboard-widget-state">
                Le suivi d’activité arrive prochainement : vélocité de saisie, contributeurs
                et traitement des demandes rejoindront cet onglet.
              </p>
```

Et remplacer le titre `<h2>À venir</h2>` par `<h2>Suivi d’activité</h2>`.

- [ ] **Step 8 : Vérifier la page entière et typecheck**

```bash
npx jest src/views/DashboardPage.test.tsx
```

Attendu : PASS. Si un test échoue parce qu'il assertait sur le texte « lot 4 », mettre à jour **le test** (le libellé a délibérément changé) et non le composant.

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10** — la ligne de base préexistante, aucune erreur dans le dashboard. Un nombre supérieur signale votre régression.

- [ ] **Step 9 : Commit**

```bash
git add bertel-tourism-ui/src/components/dashboard/ScorecardStrip.tsx bertel-tourism-ui/src/components/dashboard/ScorecardStrip.test.tsx bertel-tourism-ui/src/views/DashboardPage.tsx bertel-tourism-ui/src/styles.css
git commit -m "fix(dashboard): brancher la carte d'attention sur le CRM et afficher le delta a zero"
```

---

## Task 3 : Fiches sous 80 % dépliables

**Files:**
- Modify: `bertel-tourism-ui/src/components/dashboard/CompletenessTable.tsx`
- Modify: `bertel-tourism-ui/src/components/dashboard/CompletenessTable.test.tsx`
- Modify: `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consomme : `CompletenessRow.below_80: CompletenessBelowObject[]` — **déjà présent** dans `src/types/dashboard.ts` et **déjà renvoyé** par `api.get_dashboard_completeness`. Aucun changement serveur.

```ts
export interface CompletenessBelowObject {
  id: string;
  name: string;
  score: number;               // 0–100
  missing_fields: string[];    // name|subcategory|location|contact|description|photos|type_block|tags
}
```

- Produit : rien que d'autres tâches consomment.

**Pourquoi cette tâche existe :** la liste transite déjà dans chaque réponse et l'écran la jette. La moyenne masque la distribution — sur la base réelle, le type ACT affiche 80 % de moyenne (jauge verte « Bon ») alors que **10 fiches sur 24** sont sous le seuil.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `bertel-tourism-ui/src/components/dashboard/CompletenessTable.test.tsx`, enrichir la fixture `data` puis ajouter les tests. Remplacer la fixture existante par :

```tsx
const data: DashboardCompleteness = {
  rows: [
    {
      type: 'HLO',
      total: 171,
      avg_score: 96,
      complete_pct: 63.7,
      missing_top_field: 'photos',
      below_80: [
        { id: 'HLO1', name: 'Gîte des Hauts', score: 63, missing_fields: ['photos', 'type_block'] },
        { id: 'HLO2', name: 'Villa Evilou', score: 50, missing_fields: ['contact', 'photos'] },
      ],
    },
    {
      type: 'HOT',
      total: 7,
      avg_score: 98,
      complete_pct: 100,
      missing_top_field: '',
      below_80: [],
    },
  ],
};
```

Puis ajouter dans le `describe` existant :

```tsx
  it('n’affiche pas les fiches à corriger tant que la ligne n’est pas dépliée', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.queryByText('Gîte des Hauts')).not.toBeInTheDocument();
  });

  it('déplie la ligne et liste les fiches sous 80 avec leurs essentiels manquants', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /2 fiches/ }));

    expect(screen.getByText('Gîte des Hauts')).toBeInTheDocument();
    expect(screen.getByText('Villa Evilou')).toBeInTheDocument();
    expect(screen.getByText('63')).toBeInTheDocument();
    expect(screen.getAllByText('Photos').length).toBeGreaterThan(0);
    expect(screen.getByText('Équipements / type')).toBeInTheDocument();
  });

  it('chaque fiche pointe vers son éditeur', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /2 fiches/ }));

    const lien = screen.getAllByRole('link', { name: /Corriger/ })[0];
    expect(lien).toHaveAttribute('href', '/objects/HLO1/edit');
  });

  it('replie la ligne au second clic', () => {
    render(<CompletenessTable data={data} />);
    const bouton = screen.getByRole('button', { name: /2 fiches/ });
    fireEvent.click(bouton);
    expect(screen.getByText('Gîte des Hauts')).toBeInTheDocument();
    fireEvent.click(bouton);
    expect(screen.queryByText('Gîte des Hauts')).not.toBeInTheDocument();
  });

  it('n’offre aucun dépliant quand le type n’a aucune fiche sous 80', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.queryByRole('button', { name: /0 fiche/ })).not.toBeInTheDocument();
  });
```

Ajouter `useState` n'est pas nécessaire dans le test ; vérifier que `fireEvent` est bien dans les imports (il l'est déjà).

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

```bash
npx jest src/components/dashboard/CompletenessTable.test.tsx
```

Attendu : FAIL — aucun bouton nommé « 2 fiches ».

- [ ] **Step 3 : Implémenter le dépliant**

Dans `CompletenessTable.tsx`, ajouter `useState` et `Link` aux imports, ajouter le composant de détail et la colonne.

En tête de fichier :

```tsx
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
```

Après la fonction `Meter`, ajouter :

```tsx
/** Fiches sous 80 pour un type — la donnée arrive déjà dans la réponse, on ne la refetch pas. */
function BelowList({ rows }: { rows: CompletenessRow['below_80'] }) {
  return (
    <div className="below-list">
      <span className="below-list__head">
        {rows.length} fiche{rows.length > 1 ? 's' : ''} sous 80 % · triées par score croissant
      </span>
      <ul className="below-list__items">
        {[...rows]
          .sort((a, b) => a.score - b.score)
          .map((fiche) => (
            <li key={fiche.id} className="below-item">
              <span className="below-item__score" style={{ color: meterZone(fiche.score, 50).color }}>
                {fiche.score}
              </span>
              <span className="below-item__name">{fiche.name}</span>
              <span className="below-item__missing">
                {fiche.missing_fields.map((field) => (
                  <span key={field} className="below-item__tag">
                    {fieldLabel(field)}
                  </span>
                ))}
              </span>
              <Link href={`/objects/${fiche.id}/edit`} className="below-item__edit">
                Corriger
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
```

Ajouter l'import de type `CompletenessRow` :

```tsx
import type { DashboardCompleteness, CompletenessRow } from '../../types/dashboard';
```

Dans le composant `CompletenessTable`, après les sélecteurs de store :

```tsx
  // Une seule ligne dépliée à la fois : le tableau reste lisible et la comparaison
  // entre types garde du sens (préférence produit : vues compactes, détail à la demande).
  const [openType, setOpenType] = useState<string | null>(null);
```

Ajouter la colonne dans `<thead>` après `<th>Champ manquant n°1</th>` :

```tsx
              <th>À corriger</th>
```

Et dans le `<tbody>`, remplacer le `map` par une version qui rend deux `<tr>` :

```tsx
            {data.rows.map((row) => (
              <Fragment key={row.type}>
                <tr>
                  <td className="actualisation-table__type">
                    <button
                      type="button"
                      className={`type-cell-btn${activeTypes.includes(row.type) ? ' type-cell-btn--active' : ''}`}
                      title={`Filtrer : ${row.type}`}
                      onClick={() => handleType(row.type)}
                      aria-pressed={activeTypes.includes(row.type)}
                    >
                      <TypePill type={row.type} />
                    </button>
                  </td>
                  <td>{row.total.toLocaleString('fr-FR')}</td>
                  <td className="completeness-table__meter-col">
                    <Meter score={row.avg_score} completePct={row.complete_pct} />
                  </td>
                  <td>
                    {row.missing_top_field ? (
                      <span className="pill-mini">{fieldLabel(row.missing_top_field)}</span>
                    ) : (
                      <span className="actualisation-table__ok">—</span>
                    )}
                  </td>
                  <td>
                    {row.below_80.length > 0 ? (
                      <button
                        type="button"
                        className="below-toggle"
                        aria-expanded={openType === row.type}
                        onClick={() => setOpenType(openType === row.type ? null : row.type)}
                      >
                        <ChevronRight aria-hidden="true" />
                        {row.below_80.length} fiche{row.below_80.length > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span className="actualisation-table__ok">—</span>
                    )}
                  </td>
                </tr>
                {openType === row.type && (
                  <tr className="below-row">
                    <td colSpan={5}>
                      <BelowList rows={row.below_80} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
```

Ajouter `Fragment` à l'import React :

```tsx
import { Fragment, useMemo, useState } from 'react';
```

- [ ] **Step 4 : Ajouter le CSS**

Dans `bertel-tourism-ui/src/styles.css`, après la règle `.completeness-table__meter-col` :

```css
.below-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-2);
  background: none;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  cursor: pointer;
  white-space: nowrap;
}
.below-toggle:hover { border-color: var(--teal); color: var(--teal); }
.below-toggle svg { width: 12px; height: 12px; transition: transform 180ms ease; }
.below-toggle[aria-expanded='true'] {
  border-color: var(--teal);
  color: var(--teal);
  background: var(--teal-tint);
}
.below-toggle[aria-expanded='true'] svg { transform: rotate(90deg); }

.below-row > td { padding: 0; background: var(--bg-tint); }
.below-list { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.8rem 0.9rem; }
.below-list__head { font-size: 0.72rem; font-weight: 700; color: var(--text-muted); }
.below-list__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.below-item {
  display: grid;
  grid-template-columns: 2.2rem 1fr auto auto;
  align-items: center;
  gap: 0.7rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0.4rem 0.7rem;
}
.below-item__score { font-size: 0.8rem; font-weight: 800; text-align: right; }
.below-item__name { font-size: 0.82rem; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.below-item__missing { display: flex; flex-wrap: wrap; gap: 0.25rem; justify-content: flex-end; }
.below-item__tag {
  font-size: 0.66rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--danger-ink);
  white-space: nowrap;
}
.below-item__edit {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--teal);
  text-decoration: none;
  border: 1px solid rgb(var(--theme-primary-rgb) / 0.3);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  white-space: nowrap;
}
.below-item__edit:hover { background: var(--teal-tint); }
```

- [ ] **Step 5 : Lancer les tests pour les voir passer**

```bash
npx jest src/components/dashboard/CompletenessTable.test.tsx
```

Attendu : PASS, 7 tests (2 existants + 5 nouveaux).

- [ ] **Step 6 : Typecheck et commit**

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10** — la ligne de base préexistante, aucune erreur dans le dashboard. Un nombre supérieur signale votre régression.

```bash
git add bertel-tourism-ui/src/components/dashboard/CompletenessTable.tsx bertel-tourism-ui/src/components/dashboard/CompletenessTable.test.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(dashboard): deplier les fiches sous 80 pour cent avec lien editeur"
```

---

## Task 4 : Pont vers l'Explorateur

**Files:**
- Create: `bertel-tourism-ui/src/components/dashboard/ExplorerBridgeButton.tsx`
- Create: `bertel-tourism-ui/src/components/dashboard/ExplorerBridgeButton.test.tsx`
- Modify: `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx`
- Modify: `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consomme :
  - `buildSearchParams(filters: ExplorerFilters): URLSearchParams` depuis `src/lib/explorer-search-params.ts`.
  - `useDashboardExplorerStore` depuis `src/store/explorer-store.ts` (2ᵉ instance de la factory `createExplorerStore()`).
- Produit : `<ExplorerBridgeButton />`, sans prop, monté par `ExplorerActiveFilters` quand `showExplorerBridge` est vrai.
- Nouvelle prop sur `ExplorerActiveFilters` : `showExplorerBridge?: boolean` (défaut `false`, donc l'Explorateur et ses tests ne changent pas).

**Deux décisions déjà arbitrées :**
- **La voie de transfert est l'URL, pas la copie d'état.** `useExplorerUrlSync` (`src/hooks/useExplorerUrlSync.ts:55`) hydrate déjà le store Explorer depuis `parseSearchParams`. C'est exactement le chemin qu'emprunte déjà le bouton « ★ Liste dynamique » (`/explorer?${buildSearchParams(snapshot)}`). Écrire directement dans le store singleton depuis le dashboard court-circuiterait cette hydratation et créerait deux sources de vérité.
- **La barre reste visible sans aucune puce** sur le dashboard (arbitrage PO 2026-08-30), pour que le bouton soit toujours atteignable. C'est une **exception au comportement de l'Explorateur**, qui continue de se masquer.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `bertel-tourism-ui/src/components/dashboard/ExplorerBridgeButton.test.tsx` :

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ExplorerBridgeButton } from './ExplorerBridgeButton';
import { useDashboardExplorerStore } from '../../store/explorer-store';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('ExplorerBridgeButton', () => {
  beforeEach(() => {
    push.mockClear();
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('navigue vers l’Explorateur en emportant les filtres du dashboard', () => {
    act(() => useDashboardExplorerStore.getState().setCities(['Le Tampon']));
    render(<ExplorerBridgeButton />);

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url.startsWith('/explorer?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Le Tampon');
  });

  it('navigue même sans aucun filtre actif', () => {
    render(<ExplorerBridgeButton />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ }));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('lit l’instance dashboard du store, pas le singleton Explorateur', () => {
    act(() => useDashboardExplorerStore.getState().setCities(['Entre-Deux']));
    render(<ExplorerBridgeButton />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ }));
    expect(decodeURIComponent(push.mock.calls[0][0] as string)).toContain('Entre-Deux');
  });
});
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

```bash
npx jest src/components/dashboard/ExplorerBridgeButton.test.tsx
```

Attendu : FAIL — le module `./ExplorerBridgeButton` n'existe pas.

- [ ] **Step 3 : Implémenter le bouton**

Créer `bertel-tourism-ui/src/components/dashboard/ExplorerBridgeButton.tsx` :

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { buildSearchParams } from '../../lib/explorer-search-params';
import type { ExplorerFilters } from '../../types/domain';

/**
 * Rouvre le périmètre courant du dashboard dans l'Explorateur.
 *
 * Le transfert passe par l'URL et non par une écriture dans le store singleton :
 * l'Explorateur s'hydrate déjà depuis les paramètres de recherche (useExplorerUrlSync),
 * et c'est la même voie qu'emprunte « ★ Liste dynamique ». Écrire directement dans
 * l'autre instance créerait une seconde source de vérité pour le même état.
 *
 * La période du dashboard (updated_at) est volontairement perdue : elle n'existe pas
 * dans le vocabulaire de l'Explorateur, et la transposer serait un mensonge.
 */
export function ExplorerBridgeButton() {
  const router = useRouter();

  const openInExplorer = () => {
    const snapshot = useDashboardExplorerStore.getState() as unknown as ExplorerFilters;
    const params = buildSearchParams(snapshot);
    const query = params.toString();
    router.push(query ? `/explorer?${query}` : '/explorer');
  };

  return (
    <button
      type="button"
      className="ghost-button explorer-bridge"
      onClick={openInExplorer}
      title="Rouvrir ce périmètre dans l’Explorateur (la période n’est pas transmise)"
    >
      <ExternalLink size={13} aria-hidden="true" />
      Ouvrir dans l’Explorateur
    </button>
  );
}
```

- [ ] **Step 4 : Lancer les tests pour les voir passer**

```bash
npx jest src/components/dashboard/ExplorerBridgeButton.test.tsx
```

Attendu : PASS, 3 tests.

- [ ] **Step 5 : Écrire le test de la barre toujours visible**

Créer `bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.bridge.test.tsx` :

```tsx
import { render, screen, act } from '@testing-library/react';
import { ExplorerActiveFilters } from './ExplorerActiveFilters';
import { useDashboardExplorerStore, useExplorerStore } from '../../store/explorer-store';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('ExplorerActiveFilters — pont dashboard', () => {
  beforeEach(() => {
    act(() => useDashboardExplorerStore.getState().resetAll());
    act(() => useExplorerStore.getState().resetAll());
  });

  it('sur le dashboard, la barre reste rendue même sans aucune puce', () => {
    render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} showExplorerBridge />);
    expect(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ })).toBeInTheDocument();
  });

  it('dans l’Explorateur, la barre se masque toujours quand il n’y a aucune puce', () => {
    const { container } = render(<ExplorerActiveFilters />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 6 : Lancer ce test pour le voir échouer**

```bash
npx jest src/components/explorer/ExplorerActiveFilters.bridge.test.tsx
```

Attendu : FAIL — la prop `showExplorerBridge` n'existe pas et la barre rend `null`.

- [ ] **Step 7 : Modifier `ExplorerActiveFilters.tsx`**

Étendre l'interface de props :

```tsx
interface ExplorerActiveFiltersProps {
  /** Hook de store à piloter — défaut = singleton Explorer (Explorer & tests inchangés). */
  useStore?: typeof useExplorerStore;
  /**
   * Dashboard uniquement : garde la barre montée même sans puce active, pour que
   * le pont vers l'Explorateur reste toujours atteignable (arbitrage PO 2026-08-30).
   * L'Explorateur, lui, continue de masquer la barre vide.
   */
  showExplorerBridge?: boolean;
}

export function ExplorerActiveFilters({
  useStore = useExplorerStore,
  showExplorerBridge = false,
}: ExplorerActiveFiltersProps = {}) {
```

Ajouter l'import :

```tsx
import { ExplorerBridgeButton } from '../dashboard/ExplorerBridgeButton';
```

Remplacer la sortie anticipée :

```tsx
  if (chips.length === 0 && !showExplorerBridge) {
    return null;
  }
```

Enfin, dans le JSX de retour, remplacer le bloc « Liste dynamique » / « Tout effacer » par une version qui se retire à vide, et ajouter le pont en dernier :

```tsx
      {chips.length > 0 && (
        <button
          type="button"
          className="ghost-button active-filter-strip__reset"
          disabled={savingDynamic}
          title="Transformer ces filtres en liste dynamique (mise à jour automatique)"
          onClick={() => void saveDynamic()}
        >
          {savingDynamic ? 'Création…' : '★ Liste dynamique'}
        </button>
      )}
      {chips.length > 1 ? (
        <button type="button" className="ghost-button active-filter-strip__reset" onClick={resetAll}>
          Tout effacer
        </button>
      ) : null}
      {showExplorerBridge && <ExplorerBridgeButton />}
```

Et, juste après `<span className="explorer-active-filters__label">Filtres actifs</span>`, ajouter l'état vide :

```tsx
      {chips.length === 0 && <span className="active-filter-strip__empty">Aucun filtre actif</span>}
```

- [ ] **Step 8 : Ajouter le CSS**

Dans `bertel-tourism-ui/src/styles.css`, après `.active-filter-strip__reset` :

```css
.active-filter-strip__empty {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-muted);
}
.explorer-bridge {
  margin-left: 0.25rem;
  font-size: 0.78rem;
  padding: 0.3rem 0.65rem;
  font-weight: 700;
  color: var(--teal);
  border-color: rgb(var(--theme-primary-rgb) / 0.42);
  background: var(--teal-tint);
}
.explorer-bridge:hover { background: var(--teal-soft); }
```

- [ ] **Step 9 : Activer le pont sur le dashboard**

Dans `bertel-tourism-ui/src/views/DashboardPage.tsx`, remplacer :

```tsx
          <ExplorerActiveFilters useStore={useDashboardExplorerStore} />
```

par :

```tsx
          <ExplorerActiveFilters useStore={useDashboardExplorerStore} showExplorerBridge />
```

- [ ] **Step 10 : Vérifier que l'Explorateur n'a pas bougé**

```bash
npx jest src/components/explorer
```

Attendu : PASS pour tous les fichiers, y compris les tests existants d'`ExplorerActiveFilters` qui ne passent aucune prop.

- [ ] **Step 11 : Typecheck et commit**

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10** — la ligne de base préexistante, aucune erreur dans le dashboard. Un nombre supérieur signale votre régression.

```bash
git add bertel-tourism-ui/src/components/dashboard/ExplorerBridgeButton.tsx bertel-tourism-ui/src/components/dashboard/ExplorerBridgeButton.test.tsx bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.tsx bertel-tourism-ui/src/components/explorer/ExplorerActiveFilters.bridge.test.tsx bertel-tourism-ui/src/views/DashboardPage.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(dashboard): rouvrir le perimetre courant dans l'Explorateur"
```

---

## Task 5 : Socle des séries temporelles — service, hook et courbe SVG

**Files:**
- Create: `bertel-tourism-ui/src/types/metric-snapshot.ts`
- Create: `bertel-tourism-ui/src/services/metric-snapshot-rpc.ts`
- Create: `bertel-tourism-ui/src/services/metric-snapshot-rpc.test.ts`
- Create: `bertel-tourism-ui/src/hooks/useMetricSnapshotSeries.ts`
- Create: `bertel-tourism-ui/src/components/dashboard/TimeseriesChart.tsx`
- Create: `bertel-tourism-ui/src/components/dashboard/TimeseriesChart.test.tsx`
- Modify: `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consomme : RPC **déjà déployées** `api.get_metric_snapshot_series` et `api.get_metric_snapshot_yoy`. Aucun SQL à écrire.
- Produit :

```ts
export interface MetricSnapshotPoint { bucket_date: string; value: number; denominator: number | null }
export interface MetricSnapshotSeries { points: MetricSnapshotPoint[] }
export type MetricGrain = 'day' | 'week' | 'month';

export function getMetricSnapshotSeries(args: MetricSeriesArgs): Promise<MetricSnapshotSeries>
export function useMetricSnapshotSeries(args: MetricSeriesArgs, enabled?: boolean): UseQueryResult<MetricSnapshotSeries>
export function TimeseriesChart(props: {
  points: MetricSnapshotPoint[];
  color?: string;
  unit?: string;
  decimals?: number;
  height?: number;
  label: string;
}): JSX.Element
```

**Avant d'écrire le service :** relever la signature exacte de la RPC déployée.

```sql
select pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'api' and p.proname = 'get_metric_snapshot_series';
```

Adapter les noms de paramètres du service à ce qui sort de cette requête. Le plan suppose `(p_metric_key text, p_scope text, p_scope_key text, p_from date, p_to date, p_grain text)` ; **si la signature réelle diffère, elle fait foi**.

**Contrainte de dessin, non négociable :** l'axe vertical doit être **adaptatif** (min/max de la série, marge de 45 %). Sur les données réelles la complétude va de 92,3 à 91,4 et le corpus de 840 à 851 : un axe 0-100 ou 0-max afficherait un trait plat. Le point final est marqué, l'aire est remplie à 10 % d'opacité, la grille est à 4 lignes.

- [ ] **Step 1 : Écrire le test du composant de courbe (il doit échouer)**

Créer `bertel-tourism-ui/src/components/dashboard/TimeseriesChart.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { TimeseriesChart } from './TimeseriesChart';
import type { MetricSnapshotPoint } from '../../types/metric-snapshot';

const plate: MetricSnapshotPoint[] = [
  { bucket_date: '2026-06-19', value: 92.3, denominator: 361 },
  { bucket_date: '2026-07-14', value: 91.3, denominator: 839 },
  { bucket_date: '2026-08-30', value: 91.4, denominator: 843 },
];

describe('TimeseriesChart', () => {
  it('trace un point par relevé', () => {
    const { container } = render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    const poly = container.querySelector('polyline');
    expect(poly?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(3);
  });

  it('resserre l’axe sur l’amplitude réelle au lieu de partir de zéro', () => {
    const { container } = render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    const labels = Array.from(container.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(labels.some((l) => l.includes('0'))).toBe(true);
    expect(labels.every((l) => !/^0$/.test(l))).toBe(true);
  });

  it('marque le dernier relevé', () => {
    const { container } = render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    expect(container.querySelector('circle')).toBeInTheDocument();
  });

  it('annonce la courbe aux lecteurs d’écran', () => {
    render(<TimeseriesChart points={plate} label="Remplissage moyen" />);
    expect(screen.getByRole('img', { name: /Remplissage moyen/ })).toBeInTheDocument();
  });

  it('rend un état vide explicite sans relevé', () => {
    render(<TimeseriesChart points={[]} label="Remplissage moyen" />);
    expect(screen.getByText(/Aucun relevé/)).toBeInTheDocument();
  });

  it('ne divise pas par zéro sur une série parfaitement plate', () => {
    const constante: MetricSnapshotPoint[] = [
      { bucket_date: '2026-08-29', value: 170, denominator: null },
      { bucket_date: '2026-08-30', value: 170, denominator: null },
    ];
    const { container } = render(<TimeseriesChart points={constante} label="Backlog" />);
    const pts = container.querySelector('polyline')?.getAttribute('points') ?? '';
    expect(pts).not.toContain('NaN');
  });
});
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

```bash
npx jest src/components/dashboard/TimeseriesChart.test.tsx
```

Attendu : FAIL — modules `./TimeseriesChart` et `../../types/metric-snapshot` introuvables.

- [ ] **Step 3 : Créer les types**

Créer `bertel-tourism-ui/src/types/metric-snapshot.ts` :

```ts
/** Granularité de lecture du registre metric_snapshot. */
export type MetricGrain = 'day' | 'week' | 'month';

/** Un point de série : valeur au dernier relevé du bucket (stock), pas une somme. */
export interface MetricSnapshotPoint {
  /** ISO date, début du bucket */
  bucket_date: string;
  value: number;
  /** Dénominateur du relevé quand il en porte un (ex. total de fiches). Sinon null. */
  denominator: number | null;
}

export interface MetricSnapshotSeries {
  points: MetricSnapshotPoint[];
}

export interface MetricSeriesArgs {
  metricKey: string;
  scope: 'global' | 'type' | 'category' | 'commune' | 'status';
  scopeKey?: string;
  from?: string;
  to?: string;
  grain?: MetricGrain;
}
```

- [ ] **Step 4 : Implémenter le composant de courbe**

Créer `bertel-tourism-ui/src/components/dashboard/TimeseriesChart.tsx` :

```tsx
'use client';

import type { MetricSnapshotPoint } from '../../types/metric-snapshot';

interface Props {
  points: MetricSnapshotPoint[];
  /** Libellé de la métrique — sert l'accessibilité et l'infobulle. */
  label: string;
  color?: string;
  unit?: string;
  decimals?: number;
  height?: number;
}

const W = 900;
const PAD = { left: 52, right: 16, top: 14, bottom: 26 };

function frMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Courbe SVG maison. Le projet n'embarque aucune librairie de graphique et n'en
 * ajoute pas : la jauge .meter et la barre .rate-bar sont déjà dessinées à la main.
 *
 * L'axe vertical est ADAPTATIF (amplitude réelle + 45 % de marge). Les séries du
 * registre sont volontairement peu amples — la complétude bouge de 92,3 à 91,4 sur
 * 73 jours — et un axe partant de zéro les afficherait comme un trait plat.
 */
export function TimeseriesChart({
  points,
  label,
  color = 'var(--teal)',
  unit = '',
  decimals = 0,
  height = 210,
}: Props) {
  if (points.length === 0) {
    return <p className="dashboard-widget-state">Aucun relevé sur cette période.</p>;
  }

  const iw = W - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Série constante : amplitude 1 par défaut, sinon la division rendrait NaN.
  const spread = rawMax - rawMin || 1;
  const min = rawMin - spread * 0.45;
  const max = rawMax + spread * 0.45;

  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v: number) => PAD.top + ih * (1 - (v - min) / (max - min));

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `M${PAD.left},${PAD.top + ih} L${line.split(' ').join(' L')} L${PAD.left + iw},${PAD.top + ih} Z`;

  const gridValues = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const last = points[points.length - 1];

  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`${label} : ${points.length} relevés, de ${frMonth(points[0].bucket_date)} à ${frMonth(last.bucket_date)}`}
      className="timeseries-chart"
    >
      <path d={area} fill={color} fillOpacity="0.10" />
      {gridValues.map((gv) => (
        <g key={gv}>
          <line x1={PAD.left} y1={y(gv)} x2={PAD.left + iw} y2={y(gv)} className="timeseries-chart__grid" />
          <text x={PAD.left - 9} y={y(gv) + 4} textAnchor="end" className="timeseries-chart__axis">
            {gv.toFixed(decimals).replace('.', ',')}
            {unit}
          </text>
        </g>
      ))}
      {ticks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 7}
          textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
          className="timeseries-chart__axis"
        >
          {frMonth(points[i].bucket_date)}
        </text>
      ))}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2.5" />
    </svg>
  );
}
```

- [ ] **Step 5 : Ajouter le CSS**

Dans `bertel-tourism-ui/src/styles.css` :

```css
.timeseries-chart { display: block; overflow: visible; }
.timeseries-chart__grid { stroke: var(--line); stroke-width: 1; }
.timeseries-chart__axis { font-size: 11px; font-weight: 600; fill: var(--text-muted); }
```

- [ ] **Step 6 : Lancer les tests pour les voir passer**

```bash
npx jest src/components/dashboard/TimeseriesChart.test.tsx
```

Attendu : PASS, 6 tests.

- [ ] **Step 7 : Écrire le test du service**

Créer `bertel-tourism-ui/src/services/metric-snapshot-rpc.test.ts` en **reprenant exactement le patron de `dashboard-rpc.test.ts`** : `jest.resetModules()`, double `jest.doMock` (client **et** session), puis `await import(...)` dans chaque test. Le second `doMock` est obligatoire — `jest.setup.ts` active le mode démo, et sans lui le getter rendrait une série vide sans jamais appeler la RPC :

```ts
import type { MetricSeriesArgs } from '../types/metric-snapshot';

const ARGS: MetricSeriesArgs = { metricKey: 'completeness_avg', scope: 'global', grain: 'week' };

describe('metric-snapshot-rpc', () => {
  const rpc = jest.fn().mockResolvedValue({ data: { points: [] }, error: null });
  const schema = jest.fn().mockReturnValue({ rpc });

  beforeEach(() => {
    jest.resetModules();
    rpc.mockClear();
    schema.mockClear();
    rpc.mockResolvedValue({ data: { points: [] }, error: null });
  });

  function mockClient(demoMode = false) {
    jest.doMock('../lib/supabase', () => ({ getApiClient: () => ({ schema }) }));
    jest.doMock('../store/session-store', () => ({
      useSessionStore: { getState: () => ({ demoMode }) },
    }));
  }

  it('passe la métrique, la portée et le grain au RPC', async () => {
    mockClient();
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await getMetricSnapshotSeries(ARGS);

    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('get_metric_snapshot_series', expect.objectContaining({
      p_metric_key: 'completeness_avg',
      p_scope: 'global',
      p_grain: 'week',
    }));
  });

  it('applique le grain mois par défaut', async () => {
    mockClient();
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await getMetricSnapshotSeries({ metricKey: 'corpus_count', scope: 'global' });

    expect(rpc).toHaveBeenCalledWith('get_metric_snapshot_series', expect.objectContaining({ p_grain: 'month' }));
  });

  it('propage l’erreur RPC au lieu de l’avaler', async () => {
    mockClient();
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await expect(getMetricSnapshotSeries(ARGS)).rejects.toThrow('boom');
  });

  it('rend une série vide en mode démo, sans jamais appeler le RPC', async () => {
    mockClient(true);
    const { getMetricSnapshotSeries } = await import('./metric-snapshot-rpc');

    await expect(getMetricSnapshotSeries(ARGS)).resolves.toEqual({ points: [] });
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8 : Lancer le test pour le voir échouer**

```bash
npx jest src/services/metric-snapshot-rpc.test.ts
```

Attendu : FAIL — module introuvable.

- [ ] **Step 9 : Implémenter le service et le hook**

Créer `bertel-tourism-ui/src/services/metric-snapshot-rpc.ts` :

```ts
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { MetricSeriesArgs, MetricSnapshotSeries } from '../types/metric-snapshot';

function requireClient() {
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configuré. Activez le mode demo pour utiliser les données mock.');
  }
  return client;
}

/**
 * Lit le registre metric_snapshot (relevé quotidien figé depuis le 19/06/2026).
 *
 * En mode démo la série est VIDE, pas simulée : le principe « real DB data » veut
 * qu'un widget sans données affiche son état vide plutôt qu'une courbe inventée.
 */
export async function getMetricSnapshotSeries(args: MetricSeriesArgs): Promise<MetricSnapshotSeries> {
  const { demoMode } = useSessionStore.getState();
  if (demoMode) return { points: [] };

  const client = requireClient();
  const { data, error } = await client.schema('api').rpc('get_metric_snapshot_series', {
    p_metric_key: args.metricKey,
    p_scope: args.scope,
    p_scope_key: args.scopeKey ?? '',
    p_from: args.from ?? null,
    p_to: args.to ?? null,
    p_grain: args.grain ?? 'month',
  });

  if (error) throw error;
  return (data ?? { points: [] }) as MetricSnapshotSeries;
}
```

Créer `bertel-tourism-ui/src/hooks/useMetricSnapshotSeries.ts` :

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getMetricSnapshotSeries } from '../services/metric-snapshot-rpc';
import type { MetricSeriesArgs, MetricSnapshotSeries } from '../types/metric-snapshot';

/**
 * Séries du registre metric_snapshot.
 *
 * La clé de cache ne porte PAS les filtres du dashboard : ces séries sont
 * GLOBALES et n'obéissent pas au panneau de filtres. Le widget l'affiche.
 * staleTime long (5 min) : le registre ne bouge qu'une fois par nuit.
 */
export const METRIC_SERIES_STALE_TIME_MS = 300_000;

export function useMetricSnapshotSeries(
  args: MetricSeriesArgs,
  enabled = true,
): UseQueryResult<MetricSnapshotSeries> {
  return useQuery<MetricSnapshotSeries>({
    queryKey: ['metric-snapshot', args],
    queryFn: () => getMetricSnapshotSeries(args),
    staleTime: METRIC_SERIES_STALE_TIME_MS,
    enabled,
  });
}
```

- [ ] **Step 10 : Lancer tous les tests de la tâche**

```bash
npx jest src/services/metric-snapshot-rpc.test.ts src/components/dashboard/TimeseriesChart.test.tsx
```

Attendu : PASS, 9 tests.

- [ ] **Step 11 : Vérifier la série contre le live**

Via le MCP Supabase :

```sql
select api.get_metric_snapshot_series('completeness_avg', 'global', '', null, null, 'month');
```

Attendu : trois points (juin, juillet, août 2026) avec des valeurs autour de 92,3 / 91,4 / 91,4. **Si la forme du retour n'est pas `{points:[…]}`, adapter `MetricSnapshotSeries` et le service à la forme réelle**, puis relancer les tests.

- [ ] **Step 12 : Typecheck et commit**

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10** — la ligne de base préexistante, aucune erreur dans le dashboard. Un nombre supérieur signale votre régression.

```bash
git add bertel-tourism-ui/src/types/metric-snapshot.ts bertel-tourism-ui/src/services/metric-snapshot-rpc.ts bertel-tourism-ui/src/services/metric-snapshot-rpc.test.ts bertel-tourism-ui/src/hooks/useMetricSnapshotSeries.ts bertel-tourism-ui/src/components/dashboard/TimeseriesChart.tsx bertel-tourism-ui/src/components/dashboard/TimeseriesChart.test.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(dashboard): socle des series temporelles (service, hook, courbe SVG)"
```

---

## Task 6 : Widgets de séries dans les trois onglets

**Files:**
- Create: `bertel-tourism-ui/src/components/dashboard/TimeseriesWidget.tsx`
- Create: `bertel-tourism-ui/src/components/dashboard/TimeseriesWidget.test.tsx`
- Modify: `bertel-tourism-ui/src/views/DashboardPage.tsx`
- Modify: `bertel-tourism-ui/src/styles.css`

**Interfaces:**
- Consomme : `useMetricSnapshotSeries`, `TimeseriesChart`, `MetricSnapshotPoint` (Task 5) ; `WidgetFrame` (existant).
- Produit : `<TimeseriesWidget />` avec la prop :

```ts
interface TimeseriesWidgetProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: { key: string; label: string; unit?: string; decimals?: number; color?: string }[];
  scope: 'global' | 'type' | 'category' | 'commune' | 'status';
  enabled: boolean;
}
```

Rappel du contrat de `WidgetFrame`, à ne pas modifier :

```ts
interface WidgetFrameProps {
  isPending: boolean;   // ← q.isPending (React Query v5), PAS isLoading
  error: unknown;
  isEmpty?: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
  skeleton?: ReactNode;
  children: ReactNode;
}
```

**Mention d'honnêteté obligatoire.** Chaque widget affiche deux notes en pied :
- « Série globale : elle n'obéit pas au panneau de filtres. »
- « N jours d'historique — la comparaison année sur année s'activera en 2027. »

Sans la première, l'utilisateur lira la courbe comme filtrée alors qu'elle ne l'est pas. Sans la seconde, une courbe presque plate passera pour une panne.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `bertel-tourism-ui/src/components/dashboard/TimeseriesWidget.test.tsx` :

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TimeseriesWidget } from './TimeseriesWidget';
import { getMetricSnapshotSeries } from '../../services/metric-snapshot-rpc';

// jest.mock avec fabrique, PAS jest.spyOn sur un espace de noms importé :
// le transform SWC de next/jest rend les exports non configurables, et un spyOn
// y échoue silencieusement selon les versions. La fabrique, elle, est sûre.
jest.mock('../../services/metric-snapshot-rpc', () => ({
  getMetricSnapshotSeries: jest.fn(),
}));

const mockedSeries = getMetricSnapshotSeries as jest.MockedFunction<typeof getMetricSnapshotSeries>;

const points = [
  { bucket_date: '2026-06-30', value: 92.3, denominator: 361 },
  { bucket_date: '2026-07-31', value: 91.4, denominator: 839 },
  { bucket_date: '2026-08-30', value: 91.4, denominator: 843 },
];

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const metrics = [
  { key: 'completeness_avg', label: 'Remplissage', unit: ' %', decimals: 1 },
  { key: 'corpus_count', label: 'Corpus' },
];

describe('TimeseriesWidget', () => {
  beforeEach(() => {
    mockedSeries.mockReset();
    mockedSeries.mockResolvedValue({ points });
  });

  it('dit que la série est globale et n’obéit pas aux filtres', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/n’obéit pas au panneau de filtres/)).toBeInTheDocument();
  });

  it('annonce la profondeur d’historique disponible', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/année sur année/)).toBeInTheDocument();
  });

  it('change de métrique au clic sur le sélecteur', async () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    const corpus = await screen.findByRole('button', { name: 'Corpus' });
    fireEvent.click(corpus);
    expect(corpus).toHaveAttribute('aria-pressed', 'true');
  });

  it('ne déclenche aucune requête tant que l’onglet n’est pas visible', () => {
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled={false} />);
    expect(mockedSeries).not.toHaveBeenCalled();
  });

  it('affiche l’état vide quand le registre ne renvoie rien', async () => {
    mockedSeries.mockResolvedValue({ points: [] });
    wrap(<TimeseriesWidget eyebrow="Qualité" title="Remplissage dans le temps" subtitle="Relevé chaque nuit." metrics={metrics} scope="global" enabled />);
    expect(await screen.findByText(/Aucun relevé/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

```bash
npx jest src/components/dashboard/TimeseriesWidget.test.tsx
```

Attendu : FAIL — module `./TimeseriesWidget` introuvable.

- [ ] **Step 3 : Implémenter le widget**

Créer `bertel-tourism-ui/src/components/dashboard/TimeseriesWidget.tsx` :

```tsx
'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { useMetricSnapshotSeries } from '../../hooks/useMetricSnapshotSeries';
import { TimeseriesChart } from './TimeseriesChart';
import { WidgetFrame } from './WidgetFrame';

interface MetricOption {
  key: string;
  label: string;
  unit?: string;
  decimals?: number;
  color?: string;
}

interface Props {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: MetricOption[];
  scope: 'global' | 'type' | 'category' | 'commune' | 'status';
  /** false tant que l'onglet porteur n'est pas affiché — évite une requête inutile. */
  enabled: boolean;
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * Widget de série temporelle lisant le registre metric_snapshot.
 *
 * Deux mentions d'honnêteté sont OBLIGATOIRES et ne doivent pas être retirées :
 * la série est globale (elle ne suit pas le panneau de filtres, contrairement à
 * tout le reste de l'écran), et l'historique est jeune (une courbe presque plate
 * est la réalité du corpus, pas une panne d'affichage).
 */
export function TimeseriesWidget({ eyebrow, title, subtitle, metrics, scope, enabled }: Props) {
  const [active, setActive] = useState(metrics[0].key);
  const metric = metrics.find((m) => m.key === active) ?? metrics[0];

  const query = useMetricSnapshotSeries({ metricKey: metric.key, scope, grain: 'week' }, enabled);
  const points = query.data?.points ?? [];
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.value - first.value : 0;

  return (
    <WidgetFrame
      isPending={query.isPending && enabled}
      error={query.error}
      onRetry={() => query.refetch()}
    >
      <article className="kpi-panel kpi-panel--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {metrics.length > 1 && (
            <div className="timeseries-metrics" role="group" aria-label="Métrique affichée">
              {metrics.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="timeseries-metrics__btn"
                  aria-pressed={m.key === active}
                  onClick={() => setActive(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {last && (
          <div className="timeseries-value">
            <strong>
              {nf.format(last.value)}
              {metric.unit ?? ''}
            </strong>
            <span>
              {delta >= 0 ? '+' : '−'}
              {nf.format(Math.abs(delta))}
              {metric.unit ?? ''} depuis le premier relevé
            </span>
          </div>
        )}

        <TimeseriesChart
          points={points}
          label={metric.label}
          unit={metric.unit ?? ''}
          decimals={metric.decimals ?? 0}
          color={metric.color ?? 'var(--teal)'}
        />

        <div className="timeseries-notes">
          <span className="timeseries-note">
            <Info aria-hidden="true" />
            Série <strong>globale</strong> : elle n’obéit pas au panneau de filtres.
          </span>
          <span className="timeseries-note">
            <Info aria-hidden="true" />
            {points.length} relevé{points.length > 1 ? 's' : ''} d’historique — la comparaison
            année sur année s’activera en 2027.
          </span>
        </div>
      </article>
    </WidgetFrame>
  );
}
```

- [ ] **Step 4 : Ajouter le CSS**

Dans `bertel-tourism-ui/src/styles.css` :

```css
.timeseries-metrics { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.timeseries-metrics__btn {
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
}
.timeseries-metrics__btn[aria-pressed='true'] {
  background: var(--teal);
  border-color: transparent;
  color: #fffdf8;
}
.timeseries-value { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.35rem; }
.timeseries-value strong {
  font-family: var(--font-display), sans-serif;
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.timeseries-value span { font-size: 0.78rem; color: var(--text-muted); }
.timeseries-notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--line-soft);
}
.timeseries-note {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.45;
}
.timeseries-note svg { width: 13px; height: 13px; flex: none; margin-top: 1px; color: var(--warn); }
```

- [ ] **Step 5 : Lancer les tests pour les voir passer**

```bash
npx jest src/components/dashboard/TimeseriesWidget.test.tsx
```

Attendu : PASS, 5 tests.

- [ ] **Step 6 : Monter les widgets dans les trois onglets**

Dans `bertel-tourism-ui/src/views/DashboardPage.tsx`, ajouter l'import :

```tsx
import { TimeseriesWidget } from '../components/dashboard/TimeseriesWidget';
```

Dans le panneau **Qualité**, en **premier** widget (avant `TypeBreakdown`) :

```tsx
              <TimeseriesWidget
                eyebrow="Qualité"
                title="Remplissage dans le temps"
                subtitle="Relevé quotidien figé depuis le 19 juin 2026 — la seule façon de comparer une date à l’autre."
                scope="global"
                enabled={activeTab === 'quality'}
                metrics={[
                  { key: 'completeness_avg', label: 'Remplissage', unit: ' %', decimals: 1 },
                  { key: 'classified_count', label: 'Classés' },
                ]}
              />
```

Dans le panneau **Offre**, avant la `div.dashboard-kpi__row` :

```tsx
              <TimeseriesWidget
                eyebrow="Offre"
                title="Corpus dans le temps"
                subtitle="Croissance nette du corpus, tous statuts, relevée chaque nuit."
                scope="global"
                enabled={activeTab === 'offer'}
                metrics={[{ key: 'corpus_count', label: 'Corpus', color: 'var(--acc-asc)' }]}
              />
```

⚠️ Le panneau Offre n'a pas de conteneur en colonne : envelopper son contenu dans `<div className="dashboard-panel">` pour que le widget et la rangée existante s'empilent avec le bon écart.

Dans le panneau **Activité**, avant l'article de placeholder :

```tsx
              <TimeseriesWidget
                eyebrow="Activité"
                title="Interactions planifiées dans le temps"
                subtitle="Le gros de ce qui reste à traiter, relevé chaque nuit."
                scope="global"
                enabled={activeTab === 'activity'}
                metrics={[{ key: 'crm_backlog', label: 'À traiter', color: 'var(--warn)' }]}
              />
```

⚠️ Même remarque : envelopper le contenu du panneau Activité dans `<div className="dashboard-panel">`.

- [ ] **Step 7 : Vérifier la page et la suite complète**

```bash
npx jest src/views/DashboardPage.test.tsx
```

Attendu : PASS. Si un test échoue sur un `getBy*` devenu ambigu (plusieurs `eyebrow` « Qualité »), resserrer **le test** avec `getByRole('heading', { name: … })`.

```bash
npm run test:run
```

Attendu : toutes les suites vertes.

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10** — la ligne de base préexistante, aucune erreur dans le dashboard. Un nombre supérieur signale votre régression.

- [ ] **Step 8 : Commit**

```bash
git add bertel-tourism-ui/src/components/dashboard/TimeseriesWidget.tsx bertel-tourism-ui/src/components/dashboard/TimeseriesWidget.test.tsx bertel-tourism-ui/src/views/DashboardPage.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(dashboard): afficher les series du registre dans les trois onglets"
```

---

## Task 7 : Recette manuelle et consignation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (gitignoré, local — entrée §226)
- Modify: `docs/audits/2026-08-30-dashboard-audit-propositions.md` (cocher les axes livrés)

- [ ] **Step 1 : Lancer l'application et vérifier à l'écran**

```bash
npm run dev
```

Ouvrir `/dashboard` et vérifier, dans cet ordre :

1. La carte d'attention affiche **172** et « Tout le périmètre · 170 interactions planifiées, 2 tâches à faire ».
2. Poser le filtre commune « Le Tampon » : le bandeau passe à **359** et affiche « **+0 ce mois · −100 % vs 30 j préc.** » (et non plus un blanc). **La carte CRM ne bouge pas** — c'est la décision, pas un bug.
3. Onglet Qualité : la ligne « Activité encadrée » du tableau de remplissage porte un bouton « 10 fiches » ; le clic déplie la liste, chaque ligne mène à l'éditeur.
4. Barre de filtres : retirer toutes les puces — la barre **reste** avec « Aucun filtre actif » et le bouton « Ouvrir dans l'Explorateur » ; « ★ Liste dynamique » et « Tout effacer » disparaissent.
5. Cliquer « Ouvrir dans l'Explorateur » depuis un périmètre filtré : l'Explorateur s'ouvre avec les mêmes filtres.
6. Les trois onglets affichent leur courbe, avec les deux mentions d'honnêteté en pied.

- [ ] **Step 2 : Vérifier la cohérence carte ↔ courbe**

Comparer le chiffre de la carte d'attention et le dernier point de la courbe « Interactions planifiées dans le temps ». La carte doit valoir **170 + tâches ouvertes** ; la courbe **170**. Si l'écart n'est pas exactement le nombre de tâches ouvertes, une des deux définitions a dérivé — corriger avant de clore.

- [ ] **Step 3 : Consigner et clore**

Ajouter une entrée §226 au journal de décisions local et cocher les axes A, B1, B3, B2 dans `docs/audits/2026-08-30-dashboard-audit-propositions.md`.

```bash
git add docs/audits/2026-08-30-dashboard-audit-propositions.md
git commit -m "docs(dashboard): consigner la livraison des etapes 1-4"
```

---

## Ce qui reste explicitement hors périmètre

- Les axes **C** (onglet Activité réel : vélocité, contributeurs, activité CRM), **D** (capacités, profil de l'offre, saisonnalité), **E** (`publisher_org_any`, `classification_schemes_any`) et **F** (`get_dashboard_quality_gaps`) de l'audit. Un plan par axe.
- Le mode **année sur année** (`api.get_metric_snapshot_yoy`) : la RPC est déployée mais il n'existe qu'une seule année de relevés. À câbler en 2027, sur le socle de la Task 5.
- La **collision de manifeste `17c`** (deux migrations portent le même identifiant) : signalée en Task 1, à corriger dans une passe dédiée.
- Le correctif cosmétique de **`.pill-mini`**, stylée seulement sous `.crm-app` et `.object-editor`, donc rendue en texte nu dans le tableau de bord.
