# Exploreur — pertinence, coût du fan-out, concordances directes : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La recherche Exploreur classe les concordances de nom en tête (SQL + tri front), coûte 1-2 appels au lieu de 14, et affiche des concordances directes instantanées (menu sous la barre + bandeau) via un RPC nom léger réutilisé par ⌘K.

**Architecture:** Spec validée : [2026-08-26-explorer-recherche-pertinence-concordances-design.md](../specs/2026-08-26-explorer-recherche-pertinence-concordances-design.md). Quatre lots livrés dans l'ordre A → B1 → C → B2 ; SQL déployé avant le front (rétro-compatible) ; chaque tâche a son cycle de test et son commit.

**Tech Stack:** PostgreSQL/Supabase (RPC `api.*`, MCP `mcp__supabase__execute_sql`/`apply_migration`), Next.js/React, TanStack Query, Zustand, Jest/RTL, tsc.

## Global Constraints

- **Branche** : le repo principal est sur `codex/fix-document-type-list` (chantier CRM en cours, NE PAS toucher). Tout ce chantier se fait dans un worktree sur `master` (Tâche 0).
- **Commits** : sur `master`, par PATHSPEC, stage+commit dans la MÊME invocation, messages conventionnels en français, **SANS trailer Co-Authored-By** (attribution désactivée globalement). L'utilisateur pousse lui-même. Jamais d'amend.
- **SQL live** : avant tout `CREATE OR REPLACE` d'une fonction existante, diff hunk-par-hunk du `prosrc` vif contre le corps du fichier source (§213). Divergence inattendue = STOP, signaler.
- **Tests SQL** : le gate CI fresh-apply est ROUGE (différé connu) ⇒ chaque test SQL est rejoué à la main sur le déployé via MCP, et sa non-vacuité est prouvée une fois par un `ASSERT FALSE` témoin (§213).
- **Front** : après chaque tâche front, `npx jest <fichiers touchés>` PUIS suite complète `npx jest` + `npx tsc --noEmit` verts avant commit (depuis `bertel-tourism-ui/`).
- **Copies UI en français** ; pas de nouvelle dépendance ; fichiers petits et focalisés.
- Les chemins SQL sont relatifs à la racine du worktree ; `SQLDIR` = `Base de donnée DLL et API`.

---

### Task 0: Worktree master + node_modules

**Files:** aucun (setup).

- [ ] **Step 1: Créer le worktree sur master**

```bash
cd /c/Users/dphil/Bertel3.0 && git worktree add .claude/worktrees/explorer-search master
```

Attendu : worktree créé (master n'est checkout nulle part ailleurs — le repo principal est sur `codex/fix-document-type-list`).

- [ ] **Step 2: Junction node_modules (recette mémoire — jest/tsc en dépendent)**

```bash
cmd //c mklink //J "C:\\Users\\dphil\\Bertel3.0\\.claude\\worktrees\\explorer-search\\bertel-tourism-ui\\node_modules" "C:\\Users\\dphil\\Bertel3.0\\bertel-tourism-ui\\node_modules"
```

- [ ] **Step 3: Vérifier l'outillage**

```bash
cd /c/Users/dphil/Bertel3.0/.claude/worktrees/explorer-search/bertel-tourism-ui && npx tsc --noEmit && npx jest src/utils/facets.test.ts
```

Attendu : tsc 0 erreur, suite facets verte. Tout le reste du plan s'exécute depuis ce worktree.

---

### Task 1: SQL A1 — bonus nom dans `api.get_filtered_object_ids`

**Files:**
- Modify: `SQLDIR/api_views_functions.sql` (bloc `relevance`, ~l.1469-1490)
- Create: `SQLDIR/tests/test_explorer_name_relevance.sql`

**Interfaces:**
- Produces: `relevance` à étages — nom exact [5,6), préfixe [4,5), contenu [3,4), plein texte pur [2,3), flou [0,1]. Consommé par Task 2 (émission) et Task 3 (tri front).

- [ ] **Step 1: Diff prosrc vif (§213)**

Via `mcp__supabase__execute_sql` :

```sql
SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'api' AND p.proname = 'get_filtered_object_ids';
```

Sauver dans le scratchpad, comparer (diff) avec le corps du fichier (`sed -n '1050,…p'` jusqu'au `$$;` de la fonction). Attendu : identique modulo espaces. Sinon STOP, signaler la dérive.

- [ ] **Step 2: Écrire le test SQL (rouge d'abord)**

Créer `SQLDIR/tests/test_explorer_name_relevance.sql` :

```sql
-- test_explorer_name_relevance.sql
-- Prouve le bonus nom de la pertinence (§spec 2026-08-26, lot A) :
--   * étages étanches : nom exact [5,6) > préfixe [4,5) > contenu [3,4) > plein texte pur [2,3) ;
--   * deux homonymes exacts occupent les positions 1-2, devant un document DENSE en occurrences ;
--   * la saisie est normalisée (accents/casse) avant comparaison au nom.
-- Fixtures DRAFT ⇒ chemin vif (le MV ne voit pas les fixtures en transaction, §204) ;
-- p_status = published+draft OBLIGATOIRE pour la même raison.
-- Run: contenu (sans \set) via mcp__supabase__execute_sql. ROLLBACK — rien ne persiste.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_exact1 text := 'HLORUN9999999820';  -- nom exact (homonyme 1)
  v_exact2 text := 'LOIRUN9999999821';  -- nom exact (homonyme 2)
  v_prefix text := 'HLORUN9999999822';  -- le nom COMMENCE par la saisie
  v_infix  text := 'HLORUN9999999823';  -- le nom CONTIENT la saisie
  v_noise  text := 'RESRUN9999999824';  -- la saisie n'est que dans la DESCRIPTION (dense)
  v_ids    text[];
  v_rel_exact real; v_rel_prefix real; v_rel_infix real; v_rel_noise real;
BEGIN
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_exact1, 'HLO', 'Le Jardin Creole Test',           'draft'),
    (v_exact2, 'LOI', 'Le Jardin Creole Test',           'draft'),
    (v_prefix, 'HLO', 'Le Jardin Creole Test Annexe',    'draft'),
    (v_infix,  'HLO', 'Kaz Le Jardin Creole Test',       'draft'),
    (v_noise,  'RES', 'Etablissement Temoin Bruit',      'draft');

  -- Garde d'hypothèse : name_normalized est posé par la base (trigger/génération).
  PERFORM 1 FROM object WHERE id = v_exact1 AND name_normalized = 'le jardin creole test';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'name_normalized non posé automatiquement — fixer les fixtures';
  END IF;

  -- Bruit dense : la saisie répétée dans la description canonique (search_document
  -- est peuplé par les triggers de maintenance sur INSERT enfant).
  INSERT INTO object_description (object_id, description)
  VALUES (v_noise, repeat('jardin creole test ', 8));

  SELECT array_agg(object_id ORDER BY relevance DESC, object_id),
         MAX(relevance) FILTER (WHERE object_id = v_exact1),
         MAX(relevance) FILTER (WHERE object_id = v_prefix),
         MAX(relevance) FILTER (WHERE object_id = v_infix),
         MAX(relevance) FILTER (WHERE object_id = v_noise)
    INTO v_ids, v_rel_exact, v_rel_prefix, v_rel_infix, v_rel_noise
  FROM api.get_filtered_object_ids(
    '{"search_mode":"global"}'::jsonb, NULL,
    ARRAY['published','draft']::object_status[],
    'Le Jardin Créole Test'
  )
  WHERE object_id IN (v_exact1, v_exact2, v_prefix, v_infix, v_noise);

  ASSERT array_length(v_ids, 1) = 5, format('5 fixtures attendues, ids=%s', v_ids);
  ASSERT v_ids[1] IN (v_exact1, v_exact2) AND v_ids[2] IN (v_exact1, v_exact2),
    format('les homonymes exacts doivent être 1-2, ids=%s', v_ids);
  ASSERT v_ids[3] = v_prefix, format('préfixe attendu 3e, ids=%s', v_ids);
  ASSERT v_ids[4] = v_infix,  format('contenu attendu 4e, ids=%s', v_ids);
  ASSERT v_ids[5] = v_noise,  format('bruit attendu dernier, ids=%s', v_ids);
  ASSERT v_rel_exact  >= 5.0 AND v_rel_exact  < 6.0, format('exact hors [5,6): %s', v_rel_exact);
  ASSERT v_rel_prefix >= 4.0 AND v_rel_prefix < 5.0, format('préfixe hors [4,5): %s', v_rel_prefix);
  ASSERT v_rel_infix  >= 3.0 AND v_rel_infix  < 4.0, format('contenu hors [3,4): %s', v_rel_infix);
  ASSERT v_rel_noise  >= 2.0 AND v_rel_noise  < 3.0, format('plein texte pur hors [2,3): %s', v_rel_noise);

  RAISE NOTICE 'test_explorer_name_relevance (bloc A) OK';
END $$;

ROLLBACK;
```

- [ ] **Step 3: Prouver la non-vacuité du harnais puis le rouge**

Exécuter via MCP le contenu (sans la ligne `\set`) avec un `ASSERT FALSE;` temporaire en fin de DO → attendu : erreur remontée. Retirer le témoin, réexécuter → attendu : **échec sur `exact hors [5,6)`** (le patch n'est pas déployé). Si le premier ASSERT (5 fixtures) échoue à la place, diagnostiquer les fixtures avant d'aller plus loin.

- [ ] **Step 4: Éditer le bloc relevance dans le fichier**

Dans `SQLDIR/api_views_functions.sql`, remplacer (bloc actuel ~l.1469) :

```sql
      ELSE (
        SELECT GREATEST(
          CASE WHEN t.v @@ t.q THEN 2.0::real + ts_rank(t.v, t.q) ELSE 0::real END,
```

par :

```sql
      ELSE (
        SELECT GREATEST(
          -- Bonus nom (spec 2026-08-26) : un nom qui EST la saisie prime toujours.
          -- Étages étanches par construction : bonus espacés de 1.0 entier et
          -- ts_rank plafonné à 0.99 (non borné en théorie — un document dense
          -- ferait sauter un étage). position() et non LIKE : aucun échappement.
          -- name_normalized NULL ⇒ tous les WHEN sont NULL ⇒ ELSE 0 (sans COALESCE).
          CASE WHEN t.v @@ t.q THEN
            2.0::real + LEAST(ts_rank(t.v, t.q), 0.99::real)
            + CASE
                WHEN src.name_normalized = params.search_norm THEN 3.0::real
                WHEN position(params.search_norm IN src.name_normalized) = 1 THEN 2.0::real
                WHEN position(params.search_norm IN src.name_normalized) > 0 THEN 1.0::real
                ELSE 0::real
              END
          ELSE 0::real END,
```

Le reste du `GREATEST` (bras flou `fz.*`) et le sous-select `t` sont inchangés. `params.search_norm` est déjà en portée (`CROSS JOIN params`, posé `btrim(api.norm_search(p_search))`).

- [ ] **Step 5: Déployer la fonction**

Extraire du fichier la fonction complète (du `CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(` à son `$$;`) et l'appliquer via `mcp__supabase__apply_migration` (name: `explorer_name_relevance_bonus`).

- [ ] **Step 6: Test vert**

Réexécuter le test (Step 3, sans témoin) → attendu : `NOTICE test_explorer_name_relevance (bloc A) OK`. Sonde réelle en plus :

```sql
SELECT o.name, f.relevance FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb, NULL, ARRAY['published']::object_status[], 'le jardin créole') f JOIN object o ON o.id = f.object_id ORDER BY f.relevance DESC LIMIT 3;
```

Attendu : les deux « Le Jardin Créole » en tête avec relevance ≥ 5.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/dphil/Bertel3.0/.claude/worktrees/explorer-search && git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_explorer_name_relevance.sql" && git commit -m "feat(explorer): bonus nom dans la pertinence de recherche"
```

---

### Task 2: SQL A2 — émettre `relevance` par carte

**Files:**
- Modify: `SQLDIR/api_views_functions.sql` (bloc `decorated_data` de `api.list_object_resources_filtered_page`, ~l.6431-6445)
- Modify: `SQLDIR/tests/test_explorer_name_relevance.sql` (bloc B ajouté)

**Interfaces:**
- Produces: chaque item du tableau `data` du RPC page porte `relevance` (number, toujours émis, 0 sans terme). Consommé par Task 3.

- [ ] **Step 1: Diff prosrc vif de `list_object_resources_filtered_page`** (même procédure que Task 1 Step 1, `proname = 'list_object_resources_filtered_page'`).

- [ ] **Step 2: Ajouter le bloc B au test (rouge d'abord)**

Dans `test_explorer_name_relevance.sql`, ajouter APRÈS le premier `DO $$…$$;` (avant `ROLLBACK;`) :

```sql
DO $$
DECLARE
  v_exact1 text := 'HLORUN9999999830';
  v_page   json;
  v_first  jsonb;
BEGIN
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_exact1, 'HLO', 'Le Jardin Creole Test B', 'draft');

  v_page := api.list_object_resources_filtered_page(
    NULL, ARRAY['fr'], 5, '{"search_mode":"global"}'::jsonb, NULL,
    ARRAY['published','draft']::object_status[],
    'Le Jardin Créole Test B', 'none', NULL, NULL, 'card');

  v_first := (v_page::jsonb)->'data'->0;
  ASSERT v_first->>'id' = v_exact1, format('fixture attendue en tête, data[0]=%s', v_first->>'id');
  ASSERT v_first ? 'relevance', 'la carte doit porter la clé relevance';
  ASSERT (v_first->>'relevance')::real >= 5.0, format('relevance carte < 5: %s', v_first->>'relevance');
END $$;
```

Exécuter (avec le bloc A déjà vert) → attendu : **rouge sur « la carte doit porter la clé relevance »**.

- [ ] **Step 3: Éditer le bloc d'attache**

Dans `api_views_functions.sql` (~l.6438), remplacer :

```sql
        CASE
          WHEN p.label_match IS NULL THEN item.value
          ELSE item.value || jsonb_build_object('label_match', p.label_match)
        END
```

par :

```sql
        -- relevance toujours émis (0 sans terme) : le front trie dessus (spec 2026-08-26).
        CASE
          WHEN p.label_match IS NULL THEN item.value || jsonb_build_object('relevance', p.relevance)
          ELSE item.value || jsonb_build_object('label_match', p.label_match, 'relevance', p.relevance)
        END
```

- [ ] **Step 4: Déployer** via `apply_migration` (name: `explorer_page_emits_relevance`) — corps complet de la fonction extrait du fichier.

- [ ] **Step 5: Test vert** — réexécuter le fichier entier (blocs A+B) → 2 NOTICE OK / aucun échec.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_explorer_name_relevance.sql" && git commit -m "feat(explorer): émettre relevance par carte dans le RPC page"
```

---

### Task 3: Front A3 — trier par pertinence serveur

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts` (interface `ObjectCard`, ~l.309)
- Modify: `bertel-tourism-ui/src/utils/facets.ts` (`sortExplorerCards`, l.866)
- Test: `bertel-tourism-ui/src/utils/facets.test.ts` (describe `sortExplorerCards`, ~l.537)

**Interfaces:**
- Consumes: `relevance` émis par Task 2 (passe `normalizeExplorerCard` sans édit : spread `...card`).
- Produces: tri `label_rank` → `relevance DESC` → nom → id.

- [ ] **Step 1: Tests rouges**

Dans `facets.test.ts`, ajouter au describe `sortExplorerCards` :

```ts
  it('classe par relevance décroissante avant le nom (recherche active)', () => {
    const cards = [
      { id: 'b', type: 'HLO', name: 'A la Kaz', relevance: 2.1 },
      { id: 'a', type: 'HLO', name: 'Le Jardin Créole', relevance: 5.2 },
    ] as ObjectCard[];
    expect(sortExplorerCards(cards).map((card) => card.id)).toEqual(['a', 'b']);
  });

  it('sans relevance (ou 0 partout), conserve l’ordre alphabétique historique', () => {
    const cards = [
      { id: 'b', type: 'HLO', name: 'Zebre', relevance: 0 },
      { id: 'a', type: 'HLO', name: 'Abri' },
    ] as ObjectCard[];
    expect(sortExplorerCards(cards).map((card) => card.id)).toEqual(['a', 'b']);
  });

  it('le rang label prime toujours sur la relevance (miroir de l’ORDER BY SQL)', () => {
    const cards = [
      { id: 'ev', type: 'HLO', name: 'B', relevance: 5.5, label_match: { scheme_code: 's', rank: 1, source: 'accessibility_amenity', evidence_count: 1 } },
      { id: 'ce', type: 'HLO', name: 'Z', relevance: 2.2, label_match: { scheme_code: 's', rank: 0, source: 'certified_label', evidence_count: 1 } },
    ] as ObjectCard[];
    expect(sortExplorerCards(cards).map((card) => card.id)).toEqual(['ce', 'ev']);
  });
```

- [ ] **Step 2: Vérifier le rouge** — `npx jest src/utils/facets.test.ts` → le 1er et le 3e nouveaux tests échouent.

- [ ] **Step 3: Implémenter**

`domain.ts`, dans `ObjectCard` après `label_match` :

```ts
  /**
   * Pertinence serveur (spec 2026-08-26) : étages nom exact [5,6) > préfixe [4,5) >
   * contenu [3,4) > plein texte [2,3) > flou [0,1] ; 0 sans terme de recherche.
   * Toujours émis par list_object_resources_filtered_page ; absent sur les marqueurs.
   */
  relevance?: number | null;
```

`facets.ts`, dans `sortExplorerCards`, insérer entre le bloc `label_match` et le `nameCompare` :

```ts
    // Spec 2026-08-26 — la pertinence serveur prime sur l'alphabétique. Sans terme de
    // recherche elle vaut 0 partout et ce bloc est neutre (ordre historique préservé).
    const leftRelevance = typeof left.relevance === 'number' ? left.relevance : 0;
    const rightRelevance = typeof right.relevance === 'number' ? right.relevance : 0;
    if (leftRelevance !== rightRelevance) {
      return rightRelevance - leftRelevance;
    }
```

- [ ] **Step 4: Vert + suites** — `npx jest src/utils/facets.test.ts` puis `npx jest` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/utils/facets.test.ts && git commit -m "feat(explorer): trier les résultats par pertinence serveur"
```

---

### Task 4: ~~Front B1 — marqueurs seulement quand la carte est visible~~ — ABANDONNÉE (prémisse fausse)

**Implémentée puis REVERTÉE le 2026-08-26.** La prémisse « les 7 appels marqueurs sont sans
audience en vue Liste/Table » est **fausse**, vérifiée dans le code :

- `ExplorerPage.tsx:99-101` alimente `setVisibleObjectIds(markers.map(m => m.id))` ;
- `explorer-store.selectAllVisible()` lit **exclusivement** `visibleObjectIds` ;
- `SelectionBar` est rendue en `viewMode === 'liste' || 'table'` (`ExplorerPage.tsx:259`),
  c'est-à-dire **exactement** dans les vues que B1 voulait dégarnir.

Le commentaire en place le dit explicitement : *« "Visible" = the full matching geolocated
set (markers, the map's set), so selection tools ("select all", lasso) cover everything
shown — not just the loaded list pages. »* La requête marqueurs n'est pas la source de la
CARTE, c'est la source de l'**ensemble filtré complet**, dont la carte n'est qu'un
consommateur parmi deux.

Gater ⇒ « Tout sélectionner » sélectionne le jeu du filtre PRÉCÉDENT (`keepPreviousData`
sert une queryKey périmée que plus rien ne remplace) ou rien du tout — et cette sélection
alimente Export Excel, Copier les e-mails, Créer une liste, Imprimer. **Aucune erreur n'est
levée** : classe write-trap. Aggravant : `viewMode` par défaut = `'split'`, donc le gain
n'existe que pour l'utilisateur ayant choisi Liste/Table — exactement celui qui perdrait la
sélection.

**Le gain de latence est reporté sur la Task 10 (B2), étendue aux marqueurs** : fusionner
les 7 appels marqueurs comme les 7 appels cartes donne 14 → 2 appels, sans rien casser.
Aucune des trois « options » de contournement n'était acceptable (garder = zéro gain ;
alimenter depuis `cards` = « tout sélectionner » ne couvre plus que les pages chargées, ce
que le commentaire exclut ; vider = fonction perdue).

**Files:**
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` (`useExplorerMarkersQuery`, ~l.237)
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx` (~l.50-60)
- Test: `bertel-tourism-ui/src/hooks/useExplorerQueries.markers.test.tsx` (nouveau)

**Interfaces:**
- Produces: `useExplorerMarkersQuery(enabled: boolean)` — `enabled=false` ⇒ aucun appel réseau.

- [ ] **Step 1: Test rouge**

Créer `src/hooks/useExplorerQueries.markers.test.tsx` :

```tsx
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useExplorerMarkersQuery } from './useExplorerQueries';
import { listObjectMarkers } from '../services/rpc';

jest.mock('../services/rpc', () => ({
  ...jest.requireActual('../services/rpc'),
  listObjectMarkers: jest.fn().mockResolvedValue([]),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useExplorerMarkersQuery — gating B1', () => {
  it('ne lance AUCUN appel marqueurs quand la carte est masquée', async () => {
    renderHook(() => useExplorerMarkersQuery(false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listObjectMarkers).not.toHaveBeenCalled();
  });

  it('appelle les marqueurs quand la carte est visible', async () => {
    renderHook(() => useExplorerMarkersQuery(true), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listObjectMarkers).toHaveBeenCalledTimes(1);
  });
});
```

NOTE exécutant : si le mock du store session est requis par les hooks amont (voir les tests voisins du fichier pour le pattern de setup existant), copier leur préambule de mock — le fichier de test existant du dossier fait foi.

- [ ] **Step 2: Rouge** — `npx jest src/hooks/useExplorerQueries.markers.test.tsx` → échec (signature sans paramètre).

- [ ] **Step 3: Implémenter**

`useExplorerQueries.ts` :

```ts
export function useExplorerMarkersQuery(enabled: boolean = true) {
  const queryFilters = useExplorerQueryFilters();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    // langPrefs kept in the key for cache correctness even though markers are lang-agnostic today.
    queryKey: ['explorer-markers', queryFilters, langPrefs],
    queryFn: ({ signal }) => listObjectMarkers(queryFilters, signal),
    placeholderData: keepPreviousData,
    // B1 (spec 2026-08-26) : la requête marqueurs ne part que si la carte est visible —
    // en vue Liste/Table elle doublait le fan-out (7 appels) pour un résultat invisible.
    enabled,
  });
}
```

`ExplorerPage.tsx` (~l.57) :

```ts
  // B1 — les marqueurs n'ont d'audience que si la carte est rendue : vues carte/split
  // en desktop, onglet carte en mobile. keepPreviousData évite le flash au basculement.
  const isMapVisible = isCompactExplorer
    ? activeMobilePanel === 'map'
    : viewMode === 'carte' || viewMode === 'split';
  const markersQuery = useExplorerMarkersQuery(isMapVisible);
```

(Déplacer l'appel APRÈS les déclarations `viewMode`/`activeMobilePanel` ; vérifier que la valeur de l'onglet mobile carte est bien `'map'` dans `ExplorerPanelKey` — sinon utiliser la valeur réelle du type.)

- [ ] **Step 4: Vert + suites** — test fichier, puis `npx jest` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/hooks/useExplorerQueries.ts bertel-tourism-ui/src/hooks/useExplorerQueries.markers.test.tsx bertel-tourism-ui/src/views/ExplorerPage.tsx && git commit -m "perf(explorer): marqueurs seulement quand la carte est visible"
```

---

### Task 5: SQL C1 — RPC `api.search_objects_by_name`

**Files:**
- Create: `SQLDIR/migration_search_objects_by_name.sql`
- Create: `SQLDIR/tests/test_search_objects_by_name.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée manifeste) + `SQLDIR/ci_fresh_apply.sql` (si le manifeste CI y liste les migrations/tests — suivre le motif visible des entrées voisines)

**Interfaces:**
- Produces: `api.search_objects_by_name(p_term text, p_limit int DEFAULT 8) RETURNS TABLE(id text, name text, object_type object_type, status object_status, city text, image_url text)`. Consommé par Task 6.

- [ ] **Step 1: Écrire la migration**

`SQLDIR/migration_search_objects_by_name.sql` :

```sql
-- migration_search_objects_by_name.sql
-- Spec 2026-08-26 (concordances directes) : RPC LÉGER de navigation par nom.
-- Ce n'est PAS un filtre : il cherche dans tout le corpus visible, indépendamment
-- des filtres actifs de l'Exploreur. Périmètre AUTO-GARDÉ serveur (doctrine §205
-- transposée — le client ne choisit rien) : published pour tous ; + brouillons du
-- périmètre étendu pour un éditeur (COALESCE obligatoire, fonction 3-valuée §204).
-- archived/hidden : jamais (l'archivé est un opt-in de filtre, pas une cible de
-- navigation). Mesuré ~20 ms sur le corpus via idx_object_name_normalized_trgm.
BEGIN;

CREATE OR REPLACE FUNCTION api.search_objects_by_name(
  p_term  text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(id text, name text, object_type object_type, status object_status, city text, image_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
  WITH params AS (
    SELECT
      btrim(api.norm_search(p_term)) AS norm,
      -- LIKE-échappement de la saisie ('\' d'abord, puis % et _) — l'infixe LIKE
      -- garde l'index GIN trigramme utilisable quand le corpus grandira.
      replace(replace(replace(btrim(api.norm_search(p_term)), '\', '\\'), '%', '\%'), '_', '\_') AS norm_like,
      LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20) AS lim,
      COALESCE(api.current_user_can_edit_objects(), FALSE) AS can_edit
  )
  SELECT o.id, o.name, o.object_type, o.status, loc.city, o.cached_main_image_url
  FROM params p
  JOIN object o
    ON length(p.norm) >= 2
   AND o.name_normalized LIKE '%' || p.norm_like || '%' ESCAPE '\'
   AND (
        o.status = 'published'
     OR (p.can_edit AND o.status = 'draft'
         AND o.id IN (SELECT api.current_user_extended_object_ids()))
   )
  LEFT JOIN LATERAL (
    SELECT ol.city FROM object_location ol WHERE ol.object_id = o.id LIMIT 1
  ) loc ON TRUE
  ORDER BY (o.name_normalized = p.norm) DESC,
           (position(p.norm IN o.name_normalized) = 1) DESC,
           o.name_normalized, o.id
  LIMIT (SELECT lim FROM params)
$$;

-- §204 : EXECUTE est accordé à PUBLIC par défaut sur toute fonction neuve — le retirer.
REVOKE ALL ON FUNCTION api.search_objects_by_name(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.search_objects_by_name(text, integer) TO anon, authenticated, service_role;

COMMIT;
```

- [ ] **Step 2: Écrire le test personas (rouge d'abord — la fonction n'existe pas)**

`SQLDIR/tests/test_search_objects_by_name.sql` :

```sql
-- test_search_objects_by_name.sql
-- Prouve le RPC de concordance directe (spec 2026-08-26) :
--   * anon et authentifié inconnu : publiés SEULS (le draft ne fuit pas) ;
--   * éditeur (service_role) : + les brouillons de son périmètre étendu ;
--   * ordre : exact avant préfixe avant infixe ; garde < 2 caractères ; normalisation accents.
-- HARNAIS §204 : request.jwt.claims ET SET LOCAL ROLE — l'un sans l'autre est vacant.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_pub1  text := 'HLORUN9999999840';  -- publié, nom exact
  v_pub2  text := 'LOIRUN9999999841';  -- publié, préfixe
  v_pub3  text := 'RESRUN9999999842';  -- publié, infixe
  v_draft text := 'HLORUN9999999843';  -- BROUILLON, nom exact
  n int; v_ids text[];
BEGIN
  -- Claims service_role posés AVANT les INSERT (harnais de référence :
  -- test_actor_contacts_org_gate.sql — les triggers d'insert peuvent lire auth.*).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub1,  'HLO', 'Concordance Temoin',            'published'),
    (v_pub2,  'LOI', 'Concordance Temoin Annexe',     'published'),
    (v_pub3,  'RES', 'Kaz Concordance Temoin',        'published'),
    (v_draft, 'HLO', 'Concordance Temoin',            'draft');

  -- Persona ANON : publiés seuls, ordre exact > préfixe > infixe, accents normalisés.
  -- WITH ORDINALITY : capture l'ordre RENDU par la fonction (garanti), pas celui du scan.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT array_agg(r.id ORDER BY r.ord), count(*) INTO v_ids, n
  FROM api.search_objects_by_name('Concordance Témoin', 10)
       WITH ORDINALITY AS r(id, name, object_type, status, city, image_url, ord);
  ASSERT n = 3, format('anon doit voir 3 publiés, vu %s (%s)', n, v_ids);
  ASSERT v_ids = ARRAY[v_pub1, v_pub2, v_pub3], format('ordre attendu exact>préfixe>infixe, vu %s', v_ids);

  -- Garde de longueur : 1 caractère ⇒ vide.
  SELECT count(*) INTO n FROM api.search_objects_by_name('C', 10);
  ASSERT n = 0, format('garde <2 caractères violée: %s lignes', n);

  RESET ROLE;

  -- Persona AUTHENTIFIÉ inconnu : comme anon (le brouillon ne fuit pas).
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM api.search_objects_by_name('Concordance Temoin', 10);
  ASSERT n = 3, format('authentifié inconnu doit voir 3 publiés, vu %s', n);
  RESET ROLE;

  -- Persona ÉDITEUR (service_role §204) : + le brouillon.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO n FROM api.search_objects_by_name('Concordance Temoin', 10);
  ASSERT n = 4, format('éditeur doit voir 4 (3 publiés + draft), vu %s', n);

  RAISE NOTICE 'test_search_objects_by_name OK';
END $$;

ROLLBACK;
```

NOTE exécutant : si le persona service_role ne voit pas le draft (périmètre étendu vide pour ce persona), consulter `api.current_user_extended_object_ids` sur le vif et ajuster le persona éditeur au motif exact de `SQLDIR/tests/test_actor_contacts_org_gate.sql` (membre réel + ORG publisher) — le sens de l'assertion (l'éditeur voit SON draft, l'inconnu non) ne change pas.

- [ ] **Step 3: Non-vacuité + rouge** — `ASSERT FALSE` témoin ⇒ erreur ; retiré, exécution ⇒ **rouge « function api.search_objects_by_name does not exist »**.

- [ ] **Step 4: Appliquer la migration** via `mcp__supabase__apply_migration` (name: `search_objects_by_name`) — contenu du fichier sans BEGIN/COMMIT.

- [ ] **Step 5: Test vert** — réexécuter → NOTICE OK. Sonde perf : `EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM api.search_objects_by_name('jardin', 8);` → attendu < 50 ms.

- [ ] **Step 6: Manifeste**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, ajouter `migration_search_objects_by_name.sql` à l'ordre d'application (après la dernière migration listée) + le test dans la section tests. Si `SQLDIR/ci_fresh_apply.sql` liste migrations/tests, ajouter les deux entrées en suivant le motif des lignes voisines.

- [ ] **Step 7: Commit**

```bash
git add "Base de donnée DLL et API/migration_search_objects_by_name.sql" "Base de donnée DLL et API/tests/test_search_objects_by_name.sql" docs/SQL_ROLLOUT_RUNBOOK.md "Base de donnée DLL et API/ci_fresh_apply.sql" && git commit -m "feat(api): RPC search_objects_by_name (concordances directes)"
```

(Retirer `ci_fresh_apply.sql` du pathspec s'il n'a pas été modifié.)

---

### Task 6: Front C2 — service + hook partagé

**Files:**
- Create: `bertel-tourism-ui/src/services/name-search.ts`
- Create: `bertel-tourism-ui/src/hooks/useNameMatchQuery.ts`
- Test: `bertel-tourism-ui/src/services/name-search.test.ts`

**Interfaces:**
- Consumes: RPC Task 5.
- Produces: `interface NameMatch { id: string; name: string; type: string; status: string; city: string | null; imageUrl: string | null }` ; `searchObjectsByName(term: string, signal?: AbortSignal): Promise<NameMatch[]>` ; `useNameMatchQuery(term: string): { data: NameMatch[]; isFetching: boolean }` (debounce 150 ms interne, seuil 2 caractères). Consommé par Tasks 7, 8, 9.

- [ ] **Step 1: Test rouge**

`src/services/name-search.test.ts` :

```ts
import { searchObjectsByName } from './name-search';
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));

describe('searchObjectsByName', () => {
  beforeEach(() => {
    useSessionStore.setState({ demoMode: false });
  });

  it('appelle le RPC et mappe le payload', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ id: 'HLO1', name: 'Le Jardin Créole', object_type: 'HLO', status: 'published', city: 'Saint-Joseph', image_url: 'https://x/y.jpg' }],
      error: null,
    });
    (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });

    const rows = await searchObjectsByName('jardin');

    expect(rpc).toHaveBeenCalledWith('search_objects_by_name', { p_term: 'jardin', p_limit: 8 });
    expect(rows).toEqual([
      { id: 'HLO1', name: 'Le Jardin Créole', type: 'HLO', status: 'published', city: 'Saint-Joseph', imageUrl: 'https://x/y.jpg' },
    ]);
  });

  it('rend [] sous 2 caractères sans appeler le réseau', async () => {
    const rpc = jest.fn();
    (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
    await expect(searchObjectsByName(' a ')).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rend [] en mode démo', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(searchObjectsByName('jardin')).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Rouge** — `npx jest src/services/name-search.test.ts` → module inexistant.

- [ ] **Step 3: Implémenter**

`src/services/name-search.ts` :

```ts
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

/** Ligne de concordance directe rendue par api.search_objects_by_name (spec 2026-08-26). */
export interface NameMatch {
  id: string;
  name: string;
  type: string;
  status: string;
  city: string | null;
  imageUrl: string | null;
}

export const NAME_MATCH_MIN_CHARS = 2;
const NAME_MATCH_LIMIT = 8;

/**
 * Concordance directe par NOM — navigation (« je veux LA fiche »), pas filtrage :
 * cherche tout le corpus visible, indépendamment des filtres actifs. Le périmètre
 * (published + brouillons éditeur) est AUTO-GARDÉ serveur — rien n'est résolu ici.
 */
export async function searchObjectsByName(term: string, signal?: AbortSignal): Promise<NameMatch[]> {
  const trimmed = term.trim();
  if (trimmed.length < NAME_MATCH_MIN_CHARS || useSessionStore.getState().demoMode) {
    return [];
  }
  const client = getApiClient();
  if (!client) {
    return [];
  }
  const builder = client.schema('api').rpc('search_objects_by_name', { p_term: trimmed, p_limit: NAME_MATCH_LIMIT });
  const withSignal = builder as typeof builder & { abortSignal?: (s: AbortSignal) => typeof builder };
  const { data, error } = await (signal && typeof withSignal.abortSignal === 'function' ? withSignal.abortSignal(signal) : builder);
  if (error) {
    throw error;
  }
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((raw): NameMatch[] => {
    const row = raw as { id?: unknown; name?: unknown; object_type?: unknown; status?: unknown; city?: unknown; image_url?: unknown };
    if (row?.id == null) {
      return [];
    }
    return [{
      id: String(row.id),
      name: typeof row.name === 'string' ? row.name : '',
      type: row.object_type != null ? String(row.object_type) : '',
      status: row.status != null ? String(row.status) : '',
      city: row.city != null ? String(row.city) : null,
      imageUrl: row.image_url != null ? String(row.image_url) : null,
    }];
  });
}
```

`src/hooks/useNameMatchQuery.ts` :

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from './useDebouncedValue';
import { NAME_MATCH_MIN_CHARS, searchObjectsByName, type NameMatch } from '../services/name-search';

/**
 * Débit PROPRE aux concordances : 150 ms — plus court que les 250 ms de la requête
 * lourde, c'est sa raison d'être (résultat quasi instantané pendant la frappe).
 * UNE requête TanStack (clé partagée) nourrit le menu (TopBar), le bandeau (résultats)
 * et la palette ⌘K — le cache dédouble les surfaces.
 */
const NAME_MATCH_DEBOUNCE_MS = 150;

export function useNameMatchQuery(term: string): { data: NameMatch[]; isFetching: boolean } {
  const debounced = useDebouncedValue(term, NAME_MATCH_DEBOUNCE_MS);
  const trimmed = debounced.trim();

  const query = useQuery({
    queryKey: ['name-match', trimmed],
    queryFn: ({ signal }) => searchObjectsByName(trimmed, signal),
    enabled: trimmed.length >= NAME_MATCH_MIN_CHARS,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    // Échec = silencieux : aide à la navigation, jamais bloquant (spec, §Erreurs).
    retry: false,
  });

  return { data: query.data ?? [], isFetching: query.isFetching };
}
```

- [ ] **Step 4: Vert + suites** — test fichier puis `npx jest` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/services/name-search.ts bertel-tourism-ui/src/services/name-search.test.ts bertel-tourism-ui/src/hooks/useNameMatchQuery.ts && git commit -m "feat(explorer): service et hook de concordance directe par nom"
```

---

### Task 7: Front C3 — menu de concordances sous la barre

**Files:**
- Create: `bertel-tourism-ui/src/components/layout/ExplorerSearchSuggestions.tsx`
- Modify: `bertel-tourism-ui/src/components/layout/TopBar.tsx` (bloc `<label>` recherche, ~l.121-142)
- Test: `bertel-tourism-ui/src/components/layout/ExplorerSearchSuggestions.test.tsx`

**Interfaces:**
- Consumes: `useNameMatchQuery` (Task 6), `useUiStore.openDrawer(id)`, `resolveTypeLabel` (`src/utils/labels.ts`).
- Produces: `<ExplorerSearchSuggestions query={string} open={boolean} activeIndex={number} onPick={(id: string) => void} listboxId={string} />` (présentation) — la logique clavier/focus vit dans TopBar.

- [ ] **Step 1: Test rouge (composant présentationnel)**

`src/components/layout/ExplorerSearchSuggestions.test.tsx` :

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ExplorerSearchSuggestions } from './ExplorerSearchSuggestions';

jest.mock('../../hooks/useNameMatchQuery', () => ({
  useNameMatchQuery: jest.fn().mockReturnValue({
    data: [
      { id: 'HLO1', name: 'Le Jardin Créole', type: 'HLO', status: 'published', city: 'Saint-Joseph', imageUrl: null },
      { id: 'LOI1', name: 'Le Jardin Créole', type: 'LOI', status: 'draft', city: 'Le Tampon', imageUrl: null },
    ],
    isFetching: false,
  }),
}));

const baseProps = { query: 'jardin', open: true, activeIndex: -1, onPick: jest.fn(), listboxId: 'lb' };

describe('ExplorerSearchSuggestions', () => {
  it('rend les concordances avec type, commune et badge Brouillon', () => {
    render(<ExplorerSearchSuggestions {...baseProps} />);
    expect(screen.getAllByText('Le Jardin Créole')).toHaveLength(2);
    expect(screen.getByText(/Saint-Joseph/)).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
  });

  it('clic (mousedown) sur une ligne → onPick(id) sans perdre le focus', () => {
    const onPick = jest.fn();
    render(<ExplorerSearchSuggestions {...baseProps} onPick={onPick} />);
    fireEvent.mouseDown(screen.getAllByRole('option')[1]);
    expect(onPick).toHaveBeenCalledWith('LOI1');
  });

  it('fermé ou requête < 2 caractères → rien', () => {
    const { container, rerender } = render(<ExplorerSearchSuggestions {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ExplorerSearchSuggestions {...baseProps} query="j" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Rouge** — `npx jest src/components/layout/ExplorerSearchSuggestions.test.tsx`.

- [ ] **Step 3: Implémenter le composant**

`src/components/layout/ExplorerSearchSuggestions.tsx` :

```tsx
import Image from 'next/image';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import { NAME_MATCH_MIN_CHARS } from '../../services/name-search';
import { resolveTypeLabel } from '../../utils/labels';
import { cn } from '@/lib/utils';

interface ExplorerSearchSuggestionsProps {
  query: string;
  open: boolean;
  /** Index actif au clavier (-1 = aucun) — géré par TopBar (l'input possède le focus). */
  activeIndex: number;
  onPick: (objectId: string) => void;
  listboxId: string;
}

/**
 * Concordances directes de NOM sous la barre de recherche (spec 2026-08-26).
 * Navigation pure : la sélection ouvre le tiroir (?fiche=, mécanique D25) SANS
 * toucher aux filtres ; la recherche lourde continue sa vie en dessous.
 * mousedown (pas click) : le blur de l'input ne doit pas fermer avant la sélection.
 */
export function ExplorerSearchSuggestions({ query, open, activeIndex, onPick, listboxId }: ExplorerSearchSuggestionsProps) {
  const trimmed = query.trim();
  const { data } = useNameMatchQuery(trimmed);

  if (!open || trimmed.length < NAME_MATCH_MIN_CHARS || data.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-shellMd border border-line bg-surface shadow-lg">
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Fiches — concordance directe
      </div>
      <ul id={listboxId} role="listbox" aria-label="Concordances directes">
        {data.map((match, index) => (
          <li
            key={match.id}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 px-3 py-2',
              index === activeIndex ? 'bg-surface2' : 'hover:bg-surface2',
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(match.id);
            }}
          >
            {match.imageUrl ? (
              <Image src={match.imageUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-[6px] object-cover" />
            ) : (
              <div className="h-8 w-8 shrink-0 rounded-[6px] bg-surface2" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{match.name}</div>
              <div className="truncate text-[12px] text-ink-3">
                {resolveTypeLabel(match.type)}
                {match.city ? ` · ${match.city}` : ''}
              </div>
            </div>
            {match.status === 'draft' ? (
              <span className="shrink-0 rounded-full border border-line bg-bgTint px-2 py-px text-[11px] text-ink-2">Brouillon</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-3 py-1.5 text-[12px] text-ink-3">Entrée — lancer la recherche complète</div>
    </div>
  );
}
```

(Si `next/image` râle sur le domaine de la vignette en test/dev, remplacer par `<img>` simple avec `alt=""` — les cartes Explorer font foi : copier leur balise image.)

- [ ] **Step 4: Vert composant** — `npx jest src/components/layout/ExplorerSearchSuggestions.test.tsx`.

- [ ] **Step 5: Câbler TopBar (logique clavier/focus)**

Dans `TopBar.tsx` : ajouter les états et handlers, puis rendre le composant dans le `<label>` (qui gagne `relative`) :

```tsx
  // C3 (spec 2026-08-26) — état du menu de concordances (Exploreur uniquement).
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionActiveIndex, setSuggestionActiveIndex] = useState(-1);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const suggestions = useNameMatchQuery(!isCrm ? search : '');

  const pickSuggestion = (objectId: string) => {
    openDrawer(objectId);
    setSuggestionsOpen(false);
    setSuggestionActiveIndex(-1);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isCrm) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.data.length === 0) return;
      event.preventDefault();
      setSuggestionsOpen(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setSuggestionActiveIndex((prev) => (prev + delta + suggestions.data.length) % suggestions.data.length);
    } else if (event.key === 'Enter') {
      if (suggestionsOpen && suggestionActiveIndex >= 0 && suggestions.data[suggestionActiveIndex]) {
        event.preventDefault();
        pickSuggestion(suggestions.data[suggestionActiveIndex].id);
      } else {
        setSuggestionsOpen(false); // la recherche complète continue (le store a déjà le terme)
      }
    } else if (event.key === 'Escape') {
      setSuggestionsOpen(false);
      setSuggestionActiveIndex(-1);
    }
  };
```

Sur l'`<Input>` (props ajoutées) :

```tsx
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => { setSuggestionsOpen(false); setSuggestionActiveIndex(-1); }}
            onKeyDown={handleSearchKeyDown}
            role="combobox"
            aria-expanded={!isCrm && suggestionsOpen}
            aria-controls="explorer-search-suggestions"
            aria-activedescendant={suggestionActiveIndex >= 0 ? `explorer-search-suggestions-${suggestionActiveIndex}` : undefined}
```

Le `<label>` passe de `className="flex h-10 …"` à `className="relative flex h-10 …"` et, juste avant `</label>` :

```tsx
          {!isCrm ? (
            <ExplorerSearchSuggestions
              query={search}
              open={suggestionsOpen}
              activeIndex={suggestionActiveIndex}
              onPick={pickSuggestion}
              listboxId="explorer-search-suggestions"
            />
          ) : null}
```

Remise à zéro de l'index quand le terme change : ajustement d'état PENDANT le rendu (doctrine §213, pas un useEffect) :

```tsx
  const [prevSearchForIndex, setPrevSearchForIndex] = useState(search);
  if (prevSearchForIndex !== search) {
    setPrevSearchForIndex(search);
    setSuggestionActiveIndex(-1);
  }
```

- [ ] **Step 6: Test d'intégration TopBar** — ajouter à `TopBar.test.tsx` (suivre le setup de mocks existant du fichier) :

```tsx
  it('Exploreur : une concordance cliquée ouvre le tiroir sans toucher aux filtres', async () => {
    // setup: route Exploreur, store search = 'jardin', mock useNameMatchQuery (cf. test composant)
    // action: focus input → mousedown sur l'option
    // assert: useUiStore.getState().drawerObjectId === 'HLO1'
    //         useExplorerStore.getState().common.search === 'jardin' (inchangé)
  });
  it('CRM : aucun menu de concordances', () => {
    // setup: route CRM → queryByRole('listbox') === null
  });
```

Écrire ces deux tests en entier en copiant le préambule de rendu des tests TopBar existants (providers/mocks du fichier font foi).

- [ ] **Step 7: Vert + suites** — les 2 fichiers de test, puis `npx jest` + `npx tsc --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add bertel-tourism-ui/src/components/layout/ExplorerSearchSuggestions.tsx bertel-tourism-ui/src/components/layout/ExplorerSearchSuggestions.test.tsx bertel-tourism-ui/src/components/layout/TopBar.tsx bertel-tourism-ui/src/components/layout/TopBar.test.tsx && git commit -m "feat(explorer): menu de concordances sous la barre de recherche"
```

---

### Task 8: Front C4 — bandeau en tête des résultats

**Files:**
- Create: `bertel-tourism-ui/src/components/explorer/NameMatchBand.tsx`
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx` (colonne résultats mobile ~l.119 et desktop ~l.213)
- Test: `bertel-tourism-ui/src/components/explorer/NameMatchBand.test.tsx`

**Interfaces:**
- Consumes: `useNameMatchQuery` (cache partagé avec Task 7), `useExplorerStore.common.search`, `useUiStore.openDrawer`.
- Produces: `<NameMatchBand />` — s'auto-masque (null) si terme < 2 ou aucune concordance.

- [ ] **Step 1: Test rouge**

`src/components/explorer/NameMatchBand.test.tsx` :

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { NameMatchBand } from './NameMatchBand';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';

jest.mock('../../hooks/useNameMatchQuery', () => ({ useNameMatchQuery: jest.fn() }));

describe('NameMatchBand', () => {
  beforeEach(() => {
    useExplorerStore.getState().setSearch?.('le jardin');
    (useNameMatchQuery as jest.Mock).mockReturnValue({
      data: [{ id: 'HLO1', name: 'Le Jardin Créole', type: 'HLO', status: 'published', city: 'Saint-Joseph', imageUrl: null }],
      isFetching: false,
    });
  });

  it('rend le bandeau avec le compte et ouvre le tiroir au clic', () => {
    render(<NameMatchBand />);
    expect(screen.getByText('Concordances directes (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Le Jardin Créole'));
    expect(useUiStore.getState().drawerObjectId).toBe('HLO1');
  });

  it('sans terme actif, ne rend rien', () => {
    useExplorerStore.getState().setSearch?.('');
    const { container } = render(<NameMatchBand />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sans concordance, ne rend rien', () => {
    (useNameMatchQuery as jest.Mock).mockReturnValue({ data: [], isFetching: false });
    const { container } = render(<NameMatchBand />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

NOTE exécutant : le setter réel du store (`setSearch` ou équivalent) se lit dans `src/store/explorer-store.ts` — utiliser le vrai nom ; à défaut `useExplorerStore.setState` sur `common.search` comme les tests voisins du store.

- [ ] **Step 2: Rouge**, puis **Step 3: Implémenter**

`src/components/explorer/NameMatchBand.tsx` :

```tsx
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import { NAME_MATCH_MIN_CHARS } from '../../services/name-search';
import { resolveTypeLabel } from '../../utils/labels';

/**
 * Bandeau « Concordances directes » en tête des résultats (spec 2026-08-26).
 * Rendu instantané (~300 ms) depuis le MÊME cache TanStack que le menu de la barre,
 * pendant que la liste lourde charge. Persiste tant qu'un terme est actif (pas de
 * flicker apparition/disparition) ; clic = tiroir, les filtres ne bougent pas.
 */
export function NameMatchBand() {
  const search = useExplorerStore((state) => state.common.search);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const trimmed = search.trim();
  const { data } = useNameMatchQuery(trimmed);

  if (trimmed.length < NAME_MATCH_MIN_CHARS || data.length === 0) {
    return null;
  }

  return (
    <div className="mx-3 mt-3 rounded-shellMd border border-line bg-bgTint px-3 py-2">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Concordances directes ({data.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {data.map((match) => (
          <button
            key={match.id}
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-left hover:bg-surface2"
            onClick={() => openDrawer(match.id)}
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{match.name}</span>
              <span className="block truncate text-[11px] text-ink-3">
                {resolveTypeLabel(match.type)}
                {match.city ? ` · ${match.city}` : ''}
              </span>
            </span>
            {match.status === 'draft' ? (
              <span className="shrink-0 rounded-full border border-line bg-surface2 px-1.5 py-px text-[10px] text-ink-2">Brouillon</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Insérer dans ExplorerPage**

Premier enfant de la colonne résultats : en mobile, juste au-dessus du `<ResultsList` de ~l.119 ; en desktop, juste au-dessus du bloc `{viewMode === 'split' || viewMode === 'liste' ? (<ResultsList …` de ~l.213 ET du bloc `{viewMode === 'table' ? (<ResultsTableView …` de ~l.228 — un seul `<NameMatchBand />` par conteneur de colonne (si liste et table partagent le même conteneur parent, UNE insertion au-dessus des deux suffit ; le JSX réel fait foi). Vue `carte` seule : pas de bandeau (pas de colonne résultats — le menu C3 couvre la navigation).

- [ ] **Step 5: Vert + suites**, puis **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/components/explorer/NameMatchBand.tsx bertel-tourism-ui/src/components/explorer/NameMatchBand.test.tsx bertel-tourism-ui/src/views/ExplorerPage.tsx && git commit -m "feat(explorer): bandeau concordances directes en tête des résultats"
```

---

### Task 9: Front C5 — palette ⌘K sur le RPC nom

**Files:**
- Modify: `bertel-tourism-ui/src/services/palette-search.ts` (réécriture)
- Test: `bertel-tourism-ui/src/services/palette-search.test.ts` (adapter)

**Interfaces:**
- Consumes: `searchObjectsByName` (Task 6).
- Produces: `searchPaletteObjects(query: string): Promise<ObjectCard[]>` — signature INCHANGÉE (CommandPalette non touchée) ; mappe `NameMatch` → `ObjectCard` minimal.

- [ ] **Step 1: Adapter les tests (rouges)**

Réécrire `palette-search.test.ts` : mocker `./name-search` au lieu du RPC markers ; asserter (a) < 2 caractères ⇒ `[]` sans appel, (b) mapping `NameMatch` → `ObjectCard` (`{ id, type, name, image: imageUrl, open_now: null, location: { lat: null, lon: null, city } }`), (c) plus AUCUNE dépendance à `listObjectMarkers` ni à `resolveExplorerStatuses`.

- [ ] **Step 2: Rouge**, puis **Step 3: Implémenter**

`palette-search.ts` (contenu complet) :

```ts
import type { ObjectCard } from '../types/domain';
import { NAME_MATCH_MIN_CHARS, searchObjectsByName } from './name-search';

export const PALETTE_SEARCH_MIN_CHARS = NAME_MATCH_MIN_CHARS;
const PALETTE_SEARCH_LIMIT = 8;

/**
 * D24 + spec 2026-08-26 — la palette ⌘K cherche par NOM via api.search_objects_by_name :
 * RPC léger (~20 ms), UNE requête, et les fiches NON géolocalisées sont désormais
 * trouvables (l'ancien détour par le RPC markers les ratait — limite ponytail levée).
 * Le périmètre (published + brouillons éditeur) est auto-gardé serveur.
 */
export async function searchPaletteObjects(query: string): Promise<ObjectCard[]> {
  const trimmed = query.trim();
  if (trimmed.length < PALETTE_SEARCH_MIN_CHARS) {
    return [];
  }
  const matches = await searchObjectsByName(trimmed);
  return matches.slice(0, PALETTE_SEARCH_LIMIT).map((match) => ({
    id: match.id,
    type: match.type,
    name: match.name,
    image: match.imageUrl,
    open_now: null,
    location: { lat: null, lon: null, city: match.city },
  }));
}
```

- [ ] **Step 4: Vert + suites** (`palette-search.test.ts`, `CommandPalette.test.tsx`, puis tout + tsc).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/services/palette-search.ts bertel-tourism-ui/src/services/palette-search.test.ts && git commit -m "fix(palette): ⌘K cherche par nom, fiches non géolocalisées incluses"
```

---

### Task 10: Front B2 — appel fusionné, CARTES **ET MARQUEURS**

**Périmètre élargi** (absorbe le gain que la Task 4 abandonnée devait apporter) : la même
condition d'armement sert les deux flux. Cartes 7 → 1, marqueurs 7 → 1 ⇒ **14 → 2 appels**
par frappe validée, sans toucher à la sémantique de `visibleObjectIds` (les marqueurs
restent l'ensemble filtré complet, simplement obtenus en un appel au lieu de sept).

**Files:**
- Modify: `bertel-tourism-ui/src/utils/facets.ts` (nouvelle fonction `canMergeExplorerBuckets`)
- Modify: `bertel-tourism-ui/src/services/rpc.ts` (`listExplorerPage` refactor léger + `fetchExplorerCardsPage` + `explorerCardsHasNextPage` + `EXPLORER_MERGED_CURSOR_KEY` + **`listObjectMarkers`**)
- Test: `bertel-tourism-ui/src/utils/facets.test.ts` + `bertel-tourism-ui/src/services/rpc.merged.test.ts` (nouveau)
- Réaffecter ou supprimer le fichier non suivi `bertel-tourism-ui/src/hooks/useExplorerQueries.markers.test.tsx` (résidu de la Task 4 abandonnée ; `rm`/`git clean` sont refusés au parent par le sandbox)

`listObjectMarkers` est plus simple à fusionner que les cartes : pas de curseur, pas de
pagination — un seul appel `list_object_markers` avec `p_types` = union quand
`canMergeExplorerBuckets(filters)` est vrai, le chemin par-bucket sinon. Le `dedupeExplorerCards`
final reste en place (il devient un no-op sur un seul appel, ce qui est correct).

**Interfaces:**
- Consumes: `buildBucketRpcFilters`, `getEffectiveSelectedBuckets`, `getEffectiveBackendTypesForBucket` (existants).
- Produces: `canMergeExplorerBuckets(filters: ExplorerFilters): boolean` ; `EXPLORER_MERGED_CURSOR_KEY = '__ALL__'` ; `ExplorerBucketCursorMap` élargi à cette clé.

- [ ] **Step 1: Tests rouges — condition d'armement**

`facets.test.ts` :

```ts
describe('canMergeExplorerBuckets', () => {
  it('défaut (aucun bucket sélectionné, aucune facette) → fusion', () => {
    expect(canMergeExplorerBuckets(DEFAULT_EXPLORER_FILTERS)).toBe(true);
  });

  it('facette propre à UN bucket + plusieurs buckets → pas de fusion', () => {
    const filters = structuredClone(DEFAULT_EXPLORER_FILTERS);
    // une clé par-bucket réelle : reprendre une facette émise par buildBucketRpcFilters
    // pour le bucket HOT (le fichier facets.ts fait foi, p.ex. filtre hot.*) et l'activer.
    // Les payloads HOT vs RES divergent ⇒ false.
    // (écrire ici la mutation exacte en lisant les clés hot de buildBucketRpcFilters)
    expect(canMergeExplorerBuckets(mutateHotFacet(filters))).toBe(false);
  });

  it('un SEUL bucket sélectionné → fusion triviale (même avec facette)', () => {
    const filters = structuredClone(DEFAULT_EXPLORER_FILTERS);
    filters.selectedBuckets = ['HOT'];
    expect(canMergeExplorerBuckets(filters)).toBe(true);
  });
});
```

(`mutateHotFacet` : helper local du test qui active une vraie facette HOT — l'exécutant lit `buildBucketRpcFilters` et choisit une clé émise uniquement pour HOT ; le test DOIT vérifier d'abord que les payloads divergent réellement, sinon choisir une autre clé.)

- [ ] **Step 2: Implémenter la condition**

`facets.ts` :

```ts
/**
 * B2 (spec 2026-08-26) — la page cartes peut être servie par UN SEUL appel RPC quand
 * les payloads de filtres par bucket sont identiques (cas par défaut : aucune facette
 * par-bucket). Les sous-types restreints ne bloquent PAS la fusion : ils vivent dans
 * p_types (l'union les porte), pas dans p_filters. JSON.stringify est déterministe ici,
 * buildBucketRpcFilters construit ses clés dans le même ordre pour chaque bucket.
 */
export function canMergeExplorerBuckets(filters: ExplorerFilters): boolean {
  const buckets = getEffectiveSelectedBuckets(filters.selectedBuckets)
    .filter((bucket) => getEffectiveBackendTypesForBucket(filters, bucket).length > 0);
  if (buckets.length <= 1) {
    return true;
  }
  const reference = JSON.stringify(buildBucketRpcFilters(filters, buckets[0]));
  return buckets.every((bucket) => JSON.stringify(buildBucketRpcFilters(filters, bucket)) === reference);
}
```

- [ ] **Step 3: Vert facets**, puis **Step 4: Tests rouges — assemblage fusionné**

`src/services/rpc.merged.test.ts` : mocker le client supabase (pattern des tests services existants) et asserter :
- (a) filtres par défaut ⇒ **1 seul** appel `rpc('list_object_resources_filtered_page', …)` avec `p_types` = union des types de tous les buckets effectifs et le payload de filtres du 1er bucket ;
- (b) le résultat pose `cursors[EXPLORER_MERGED_CURSOR_KEY]` (next_cursor ou DONE) ;
- (c) `explorerCardsHasNextPage(filters, { __ALL__: '__DONE__' })` ⇒ false, `{ __ALL__: 'x' }` ⇒ true ;
- (d) filtres NON fusionnables (mock de canMerge…: utiliser la vraie mutation du Step 1) ⇒ un appel PAR bucket (comportement §125 intact).

- [ ] **Step 5: Implémenter l'assemblage**

`rpc.ts` :

```ts
export const EXPLORER_MERGED_CURSOR_KEY = '__ALL__' as const;
export type ExplorerBucketCursorMap = Partial<Record<ExplorerBucketKey | typeof EXPLORER_MERGED_CURSOR_KEY, string | null>>;
```

Refactor : extraire de `listExplorerPage` le cœur d'appel en

```ts
async function listExplorerPageForTypes(
  types: BackendObjectTypeCode[],
  rpcFilters: Record<string, unknown>,
  input: { cursor: string | null; pageSize: number; filters: ExplorerFilters; langPrefs: string[]; signal?: AbortSignal },
): Promise<RpcPageResponse<ObjectCard>>
```

(`listExplorerPage` l'appelle avec `getEffectiveBackendTypesForBucket(filters, bucket)` + `buildBucketRpcFilters(filters, bucket)` — comportement inchangé, mock/demo path inchangé dans `listExplorerPage`.)

Dans `fetchExplorerCardsPage`, AVANT la boucle par bucket :

```ts
  // B2 — un seul appel quand les payloads par bucket sont identiques (cas par défaut).
  // Le mode démo garde le chemin par-bucket (mock servi par listExplorerPage).
  if (!useSessionStore.getState().demoMode && canMergeExplorerBuckets(filters)) {
    if (pageParam[EXPLORER_MERGED_CURSOR_KEY] === EXPLORER_BUCKET_CURSOR_DONE) {
      return { cards: [], cursors: { [EXPLORER_MERGED_CURSOR_KEY]: EXPLORER_BUCKET_CURSOR_DONE }, labelRankCounts: { labelled: 0, equivalent: 0 }, totalCount: 0 };
    }
    const mergedBuckets = getEffectiveSelectedBuckets(filters.selectedBuckets)
      .filter((bucket) => getEffectiveBackendTypesForBucket(filters, bucket).length > 0);
    const types = [...new Set(mergedBuckets.flatMap((bucket) => getEffectiveBackendTypesForBucket(filters, bucket)))];
    const page = await listExplorerPageForTypes(types, buildBucketRpcFilters(filters, mergedBuckets[0]), {
      cursor: pageParam[EXPLORER_MERGED_CURSOR_KEY] ?? null,
      pageSize: EXPLORER_BUCKET_PAGE_SIZE,
      filters,
      langPrefs,
      signal,
    });
    return {
      cards: page.data,
      cursors: { [EXPLORER_MERGED_CURSOR_KEY]: page.meta.next_cursor ?? EXPLORER_BUCKET_CURSOR_DONE },
      labelRankCounts: {
        labelled: page.meta.label_rank_counts?.labelled ?? 0,
        equivalent: page.meta.label_rank_counts?.equivalent ?? 0,
      },
      totalCount: page.meta.total ?? 0,
    };
  }
```

Dans `explorerCardsHasNextPage`, en tête :

```ts
  if (EXPLORER_MERGED_CURSOR_KEY in cursors) {
    return cursors[EXPLORER_MERGED_CURSOR_KEY] !== EXPLORER_BUCKET_CURSOR_DONE;
  }
```

- [ ] **Step 6: Vert + suites complètes + tsc.**

- [ ] **Step 7: Vérification manuelle** — lancer le dev server via le Browser pane (launch.json), vue Liste, taper « le jardin créole », onglet réseau : attendu **1 appel** `list_object_resources_filtered_page` (0 marqueurs), concordances en tête. Capture d'écran en preuve.

- [ ] **Step 8: Commit**

```bash
git add bertel-tourism-ui/src/utils/facets.ts bertel-tourism-ui/src/utils/facets.test.ts bertel-tourism-ui/src/services/rpc.ts bertel-tourism-ui/src/services/rpc.merged.test.ts && git commit -m "perf(explorer): appel fusionné quand les filtres par bucket sont identiques"
```

---

### Task 11: Vérification live, journal, docs

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée §)
- Modify: `.claude/WORKFLOW.md` (tracker différés)
- Commit: `docs/superpowers/specs/2026-08-26-explorer-recherche-pertinence-concordances-design.md` + ce plan

- [ ] **Step 1: Sondes live de clôture** (l'app déployée ou le dev server + prod DB) :
  - « le jardin créole » : les 2 homonymes positions 1-2 de la liste ; menu + bandeau les montrent en < 500 ms ;
  - persona lecteur (ou anon via RPC direct) : aucun brouillon dans les concordances ;
  - chrono liste : ~0,6 s après debounce (avant : ~2,3 s) ; noter les chiffres.

- [ ] **Step 2: Entrée décision log** — re-grepper le DERNIER `## §` de `lot1_mapping_decisions.md` et prendre le suivant. Contenu : décisions (bonus nom à étages plafonnés ; relevance émise par carte ; navigation ≠ filtrage pour le RPC nom auto-gardé ; fusion conditionnée au deep-equal des payloads), mesures avant/après, et les différés de la spec (bonus nom par mot, surlignage, concordances commune, fusion des marqueurs).

- [ ] **Step 3: Tracker** — ajouter au tableau des différés de `.claude/WORKFLOW.md` la ligne « Fusion des appels marqueurs (B2 carte visible) » avec raison/déblocage.

- [ ] **Step 4: Commit docs**

```bash
git add docs/superpowers/specs/2026-08-26-explorer-recherche-pertinence-concordances-design.md docs/superpowers/plans/2026-08-26-explorer-recherche-pertinence-concordances.md bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md .claude/WORKFLOW.md && git commit -m "docs(explorer): spec + plan recherche, journal §, différés"
```

- [ ] **Step 5: Rapport final** — ce qui a changé, où, preuves (mesures, tests verts, sondes), ce qui reste incertain (critères de complétion CLAUDE.md). Rappeler : push = utilisateur ; worktree à nettoyer après merge (`git worktree remove`).
