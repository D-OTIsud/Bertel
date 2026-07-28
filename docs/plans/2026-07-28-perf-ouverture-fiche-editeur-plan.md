# Réduction des allers-retours à l'ouverture d'une fiche et de l'éditeur — Plan d'implémentation

> **Pour l'exécutant :** ce plan est écrit pour être suivi pas à pas sans connaissance préalable du projet. Chaque étape est une action de 2 à 5 minutes. Les cases `- [ ]` servent au suivi. **N'improvise pas** : si une étape ne se déroule pas comme décrit (un fichier ne ressemble pas à l'extrait, une commande ne rend pas la sortie annoncée), **arrête-toi et signale-le** plutôt que d'adapter.

**Objectif :** faire passer l'ouverture d'une fiche dans l'Exploreur de ~85 requêtes HTTP à 1, et l'ouverture de l'éditeur de ~85 à ~25 sans SQL (puis à ~3 avec SQL).

**Architecture :** trois lots, chacun livrable et déployable seul. Lot 1 = le tiroir cesse de charger les données de l'éditeur. Lot 2 = les catalogues de référence deviennent un cache de session au lieu d'être retéléchargés par fiche. Lot 3 = le chargeur de l'éditeur cesse de sérialiser ses vagues.

**Dépendances entre lots.** Le lot 1 est totalement autonome : il peut partir seul, être déployé seul, et n'est prérequis de rien. Le lot 2 est autonome lui aussi. **Le lot 3 dépend du lot 2** : il suppose la signature à trois paramètres `getObjectWorkspaceResource(objectId, langPrefs, catalogs)` introduite en tâche 8. Ne pas commencer le lot 3 avant que le lot 2 soit terminé et commité.

**Pile technique :** Next.js (App Router), React 19, TanStack Query v5 (+ persistance localStorage), Supabase/PostgREST, Jest + React Testing Library, TypeScript.

---

## Constats mesurés qui justifient ce plan

Ces chiffres ont été vérifiés le 2026-07-28 ; ils ne sont pas à re-mesurer avant de commencer.

| Constat | Mesure | Source |
|---|---|---|
| Requêtes HTTP par ouverture de fiche | **~85** (102–117 sites d'appel dans le code) | `pg_stat_statements` production, 909 ouvertures |
| Part de catalogues de référence | **43 / 85** dont ~23 sur `ref_code` seul | idem |
| Latence par aller-retour (poste Réunion → Supabase) | **220–310 ms** | `curl -w` sur `/rest/v1/`, connexion HTTP/2 |
| `api.get_object_resource` | 165–195 ms, 22 000 buffers, payload 17 kB | `EXPLAIN (ANALYZE, BUFFERS)` sur la base live |
| Idem, moyenne réelle en production | **469 ms** | `pg_stat_statements`, 1 244 appels |
| Ce que le tiroir consomme du chargeur | **la vague 0 uniquement** | `grep "\.modules\|permissions" src/features/object-drawer/` = 0 |
| Domaines `ref_code` distincts chargés un par un | **25** | `grep -oE "eq\('domain', '[a-z_]+'\)"` |

---

## Contraintes globales

Elles s'appliquent à **toutes** les tâches de ce plan.

- **Langue :** commentaires de code et messages de commit en français, comme le reste du dépôt.
- **Commits :** format *conventional commits* (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`). **Aucun trailer `Co-Authored-By`** (l'attribution est désactivée globalement).
- **Un commit par tâche terminée et vérifiée.** Ne jamais accumuler plusieurs tâches dans un seul commit. Toujours stager par chemin explicite (`git add chemin/precis.ts`), **jamais** `git add -A` ni `git add .` — d'autres modifications non liées peuvent traîner dans l'arbre de travail.
- **Branche :** travailler sur `master` (convention du dépôt). Ne **pas** pousser : l'utilisateur pousse lui-même.
- **Répertoire de travail :** toutes les commandes de ce plan s'exécutent depuis `C:/Users/dphil/Bertel3.0/bertel-tourism-ui` sauf mention contraire.
- **Ne jamais lancer `npm run test`** (c'est le mode *watch*, il ne rend jamais la main). Utiliser `npm run test:run`.
- **Ne jamais démarrer de serveur de dev avec Bash.** Si une vérification visuelle est nécessaire, le signaler à l'utilisateur.
- **Aucune nouvelle dépendance npm** n'est autorisée dans ce plan.
- **Invariant projet §103 :** « l'objet éditable complet = `getObjectWorkspaceResource` ». Cet invariant protège **l'éditeur** ; il ne contraint pas le tiroir, qui est en lecture seule. Ne jamais l'invoquer pour bloquer le lot 1, ne jamais le violer dans les lots 2 et 3.

---

## Protocole de mesure — à exécuter après CHAQUE lot

Un lot n'est pas terminé tant que son gain n'a pas été observé. Le protocole est le même pour les trois ; seules les valeurs attendues changent. **Ne pas lancer de serveur soi-même** : demander à l'utilisateur d'ouvrir l'application, outils de développement sur l'onglet Réseau, filtre `Fetch/XHR`.

**Mesure À FROID** (première ouverture de la session) :
1. Fermer tous les onglets de l'application, vider `localStorage` (onglet Application → Stockage local → `bertel-rq-cache` → supprimer).
2. Recharger, se connecter, ouvrir l'Exploreur.
3. Vider le journal réseau, ouvrir **une** fiche. Noter le nombre de requêtes vers `ryycrdhlkmzpxwwwwupy.supabase.co` et le temps jusqu'au premier contenu affiché.
4. Cliquer « Modifier ». Noter les deux mêmes chiffres.

**Mesure À CHAUD** (dans la même session, sans recharger) :
5. Revenir à l'Exploreur, vider le journal réseau, ouvrir une **autre** fiche. Noter.
6. Cliquer « Modifier ». Noter.

**Valeurs attendues** (référence avant tout lot : ~85 requêtes dans les quatre cas) :

| | fiche à froid | éditeur à froid | fiche à chaud | éditeur à chaud |
|---|---|---|---|---|
| après lot 1 | **1–3** | ~85 | **1–3** | ~85 |
| après lot 2 | 1–3 | **~38** | 1–3 | **~21** |
| après lot 3 | 1–3 | ~38 | 1–3 | ~21, et **3 latences enchaînées au lieu de 7** |

> La distinction froid/chaud est **le** test du lot 2 : si le chiffre à chaud n'est pas nettement inférieur à celui à froid, le cache de catalogues ne fonctionne pas — le plus probable étant un retour accidentel à `ensureQueryData` (voir tâche 7) ou une clé de cache incluant `objectId`.

**Consigner chaque série** dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`, section `## §NN` (numéro obtenu par `grep -o "^## §[0-9]*" | tail -1`, **jamais deviné**).

---

# LOT 1 — Le tiroir cesse de charger les données de l'éditeur

**Gain :** ~85 requêtes → 1 à l'ouverture d'une fiche.
**Risque :** faible. Le tiroir n'a jamais lu les données supprimées.
**Livrable :** cliquer sur une fiche de l'Exploreur déclenche un seul appel réseau.

## Structure des fichiers du lot 1

| Fichier | Rôle | Action |
|---|---|---|
| `src/features/object-drawer/ObjectDrawerShell.tsx` | Coque du tiroir : en-tête, actions, choix du panneau | **Modifier** — bascule de hook |
| `src/features/object-drawer/ObjectDrawerShell.test.tsx` | Garde : le tiroir n'appelle QUE le chargeur léger | **Créer** |
| `src/hooks/useExplorerQueries.ts` | Hooks React Query de l'Exploreur | **Modifier** — durées de cache + préchargement |
| `src/components/explorer/ResultsList.tsx` | Liste des cartes de résultat | **Modifier** — accroche de survol |

---

### Tâche 1 : Le tiroir bascule sur le chargeur léger

**Fichiers :**
- Modifier : `src/features/object-drawer/ObjectDrawerShell.tsx` (lignes 7, 74, 82–92, 156)
- Créer : `src/features/object-drawer/ObjectDrawerShell.test.tsx`

**Interfaces :**
- Consomme : `useObjectDetailQuery(objectId: string | null)` depuis `src/hooks/useExplorerQueries.ts:225`. Elle renvoie une `useQuery` dont `data` est de type `ObjectDetail`.
- `ObjectDetail` est défini en `src/types/domain.ts:413` :
  ```ts
  export interface ObjectDetail {
    id: string;
    name: string;
    type?: string;
    raw: Record<string, unknown>;
  }
  ```
- Produit : rien pour les tâches suivantes. Tâche autonome.

**Contexte indispensable.** Aujourd'hui `ObjectDrawerShell` appelle `useObjectWorkspaceQuery`, dont `data` est un `ObjectWorkspaceResource` de forme `{ id, name, type, detail, modules, permissions }`. Le tiroir ne lit que `detail`, `type` et `name` — et `type`/`name` sont eux-mêmes recopiés depuis `detail` par le chargeur. Après bascule, `data` **est** directement le `detail` : il faut donc retirer le `.detail` intermédiaire aux endroits concernés. C'est la seule subtilité de cette tâche.

---

- [ ] **Étape 1.1 : Écrire le test qui échoue**

Créer `src/features/object-drawer/ObjectDrawerShell.test.tsx` avec exactement ce contenu :

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ObjectDrawerShell } from './ObjectDrawerShell';

// Le tiroir est en LECTURE SEULE : il ne doit consommer que le chargeur léger
// (1 RPC), jamais le chargeur d'espace de travail (~85 requêtes) qui n'existe
// que pour peupler les sélecteurs de l'éditeur. Cette garde échoue si quelqu'un
// re-branche le tiroir sur useObjectWorkspaceQuery.
const detailSpy = jest.fn();
const workspaceSpy = jest.fn();

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectDetailQuery: (objectId: string | null) => {
    detailSpy(objectId);
    return {
      data: { id: 'RESRUN0000000001', name: 'Chez Testeur', type: 'RES', raw: {} },
      isError: false,
      error: null,
      isLoading: false,
    };
  },
  useObjectWorkspaceQuery: (objectId: string | null) => {
    workspaceSpy(objectId);
    return { data: undefined, isError: false, error: null, isLoading: true };
  },
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [] }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('./ObjectDetailView', () => ({
  ObjectDetailView: ({ data }: { data: { name: string } }) => (
    <div data-testid="detail-view">{data.name}</div>
  ),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ObjectDrawerShell', () => {
  beforeEach(() => {
    detailSpy.mockClear();
    workspaceSpy.mockClear();
  });

  test('consomme le chargeur léger et jamais le chargeur d espace de travail', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(detailSpy).toHaveBeenCalledWith('RESRUN0000000001');
    expect(workspaceSpy).not.toHaveBeenCalled();
  });

  test('affiche le nom et le type de la fiche depuis le payload léger', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Chez Testeur' })).toBeInTheDocument();
    expect(screen.getByTestId('detail-view')).toHaveTextContent('Chez Testeur');
  });
});
```

- [ ] **Étape 1.2 : Lancer le test et vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/features/object-drawer/ObjectDrawerShell.test.tsx
```

Attendu : **2 tests en échec**. Le premier sur `expect(workspaceSpy).not.toHaveBeenCalled()` (le tiroir appelle encore le chargeur lourd), le second sur le rendu (le mock du chargeur lourd renvoie `data: undefined`, donc le tiroir affiche le squelette).

> Si le test PASSE à cette étape, quelqu'un a déjà fait la bascule : arrête-toi et signale-le.

- [ ] **Étape 1.3 : Basculer l'import**

Dans `src/features/object-drawer/ObjectDrawerShell.tsx`, ligne 7, remplacer :

```tsx
import { useObjectWorkspaceQuery } from '../../hooks/useExplorerQueries';
```

par :

```tsx
import { useObjectDetailQuery } from '../../hooks/useExplorerQueries';
```

- [ ] **Étape 1.4 : Basculer l'appel et retirer le `.detail` intermédiaire**

Toujours dans le même fichier, remplacer le bloc des lignes 74 à 84 :

```tsx
  const { data, isError, error, isLoading } = useObjectWorkspaceQuery(objectId);
  const { peers, typingUsers } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId) },
  );
  const role = useSessionStore((state) => state.role);
  const canEdit = role !== null;

  const resolvedData = data ?? null;
  const isShellLoading = isLoading || !resolvedData;
  const previewRaw = resolvedData?.detail.raw ?? {};
```

par :

```tsx
  // §NN — le tiroir est en LECTURE SEULE : il ne consomme que `detail`, jamais
  // `modules` ni `permissions`. Il charge donc le RPC seul (1 aller-retour) au
  // lieu du chargeur d'espace de travail (~85 requêtes dont aucune n'était lue).
  // L'invariant §103 (« l'objet éditable complet = getObjectWorkspaceResource »)
  // ne s'applique pas ici : il protège l'éditeur, pas le tiroir.
  const { data, isError, error, isLoading } = useObjectDetailQuery(objectId);
  const { peers, typingUsers } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId) },
  );
  const role = useSessionStore((state) => state.role);
  const canEdit = role !== null;

  const resolvedData = data ?? null;
  const isShellLoading = isLoading || !resolvedData;
  const previewRaw = resolvedData?.raw ?? {};
```

- [ ] **Étape 1.5 : Corriger le passage de props à `ObjectDetailView`**

Toujours dans le même fichier, ligne 156, remplacer :

```tsx
              <ObjectDetailView data={resolvedData.detail} raw={previewRaw as Record<string, unknown>} />
```

par :

```tsx
              <ObjectDetailView data={resolvedData} raw={previewRaw as Record<string, unknown>} />
```

> Les lignes 88 (`resolvedData?.type === 'ORG'`), 90 (`resolveTypeLabel(resolvedData?.type)`) et 92 (`resolvedData?.name`) sont **inchangées** : `ObjectDetail` porte déjà `type` et `name`.

- [ ] **Étape 1.6 : Lancer le test et vérifier qu'il PASSE**

```bash
npm run test:run -- src/features/object-drawer/ObjectDrawerShell.test.tsx
```

Attendu : `Tests: 2 passed`.

- [ ] **Étape 1.7 : Vérifier les types**

```bash
npm run typecheck
```

Attendu : aucune sortie, code de retour 0. Si TypeScript signale une propriété `detail` inexistante ailleurs dans le dossier `object-drawer`, c'est un usage que l'analyse n'avait pas vu : **arrête-toi et signale-le**.

- [ ] **Étape 1.8 : Lancer la suite complète de non-régression**

```bash
npm run test:run
```

Attendu : toutes les suites au vert. Noter le nombre de tests dans le message de commit n'est pas nécessaire, mais **aucune** suite ne doit passer au rouge.

- [ ] **Étape 1.9 : Commit**

```bash
git add src/features/object-drawer/ObjectDrawerShell.tsx src/features/object-drawer/ObjectDrawerShell.test.tsx && git commit -m "perf(tiroir): charger la fiche seule au lieu de l espace de travail complet"
```

---

### Tâche 2 : Les invalidations de `object-detail` deviennent réelles

**Fichiers :**
- Modifier : `src/hooks/useExplorerQueries.ts` (lignes 373–377)

**Interfaces :**
- Consomme : la bascule de la tâche 1.
- Produit : rien. Tâche autonome.

**Contexte indispensable.** Il existe 9 sites qui appellent `invalidateQueries({ queryKey: ['object-detail', objectId] })` (lignes 375, 398, 421, 445, 469, 496, 532, 550, 583). Jusqu'à la tâche 1, **aucun observateur n'était monté sur cette clé** : ces invalidations ne faisaient que marquer l'entrée périmée, sans effet réseau. Depuis la tâche 1, le tiroir observe cette clé — les invalidations deviennent de **vrais rechargements**. C'est le comportement voulu (une note d'équipe ajoutée doit apparaître), mais il faut vérifier qu'on ne déclenche pas en plus le rechargement du chargeur lourd pour rien.

- [ ] **Étape 2.1 : Écrire le test qui échoue**

Ajouter ce bloc à la fin de `src/hooks/useExplorerQueries.test.tsx` s'il existe, sinon **créer** le fichier `src/hooks/invalidate-object-workspace-caches.test.ts` avec :

```ts
import { QueryClient } from '@tanstack/react-query';
import { invalidateObjectWorkspaceCaches } from './useExplorerQueries';

describe('invalidateObjectWorkspaceCaches', () => {
  test('invalide la fiche, l espace de travail et le catalogue de localisation', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');

    invalidateObjectWorkspaceCaches(client, 'RESRUN0000000001');

    const keys = spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['object-detail', 'RESRUN0000000001']));
    expect(keys).toContain(JSON.stringify(['object-workspace', 'RESRUN0000000001']));
    expect(keys).toContain(JSON.stringify(['location-reference-options']));
  });
});
```

- [ ] **Étape 2.2 : Lancer le test**

```bash
npm run test:run -- src/hooks/invalidate-object-workspace-caches.test.ts
```

Attendu : **PASS**. Ce test est une garde de non-régression, pas une évolution : il verrouille le contrat actuel avant que le lot 3 ne touche à cette fonction. C'est le seul test de ce plan qui passe du premier coup — c'est normal et voulu.

- [ ] **Étape 2.3 : Documenter le changement de nature de l'invalidation**

Dans `src/hooks/useExplorerQueries.ts`, remplacer le commentaire des lignes 368–372 :

```ts
/**
 * One post-save cache refresh for a whole save batch, fire-and-forget: the editor snapshot is
 * init-once (it never consumes the refetch), so nothing should wait on the heavy workspace
 * reload — it only re-warms the caches for the preview drawer and the next mount.
 */
```

par :

```ts
/**
 * One post-save cache refresh for a whole save batch, fire-and-forget: the editor snapshot is
 * init-once (it never consumes the refetch), so nothing should wait on the heavy workspace
 * reload — it only re-warms the caches for the preview drawer and the next mount.
 *
 * §NN — depuis que le tiroir observe `object-detail` (il ne consomme plus le chargeur
 * d'espace de travail), cette invalidation-là déclenche un VRAI rechargement quand le
 * tiroir est ouvert, et non plus un simple marquage. C'est voulu : une note d'équipe
 * ajoutée depuis le tiroir doit réapparaître. Coût : 1 requête, pas 85.
 */
```

- [ ] **Étape 2.4 : Commit**

```bash
git add src/hooks/useExplorerQueries.ts src/hooks/invalidate-object-workspace-caches.test.ts && git commit -m "test(cache): verrouiller le contrat d invalidation apres bascule du tiroir"
```

---

### Tâche 3 : Précharger la fiche au survol d'une carte de résultat

**Fichiers :**
- Modifier : `src/hooks/useExplorerQueries.ts` (ajout d'un hook en fin de fichier)
- Modifier : `src/components/explorer/ResultsList.tsx` (ligne 218)
- Créer : `src/hooks/usePrefetchObjectDetail.test.tsx`

**Interfaces :**
- Consomme : `getObjectResource(objectId: string, langPrefs: string[]): Promise<ObjectDetail>` depuis `src/services/rpc.ts:431` (déjà importée dans `useExplorerQueries.ts`).
- Produit : `usePrefetchObjectDetail(): (objectId: string) => void` — exportée depuis `src/hooks/useExplorerQueries.ts`, consommée par `ResultsList.tsx`.

**Contexte indispensable.** L'accroche de survol existe déjà et est câblée de bout en bout : `ResultCardView` pose un `onMouseEnter` sur son conteneur (`ResultCardView.tsx:269`) et remonte `onHoverChange(hovered)`, que `ResultsList.tsx:218` reçoit avec `card.id` sous la main. Il n'y a **rien à câbler**, seulement un appel à ajouter. Il n'existe aujourd'hui **aucun** `prefetchQuery` dans l'application.

**Deux pièges à ne pas reproduire (relevés en revue).**

1. **Chaque carte a sa propre clé de cache.** `prefetchQuery` est un no-op quand *cette clé-là* est fraîche — il ne protège donc **pas** contre un balayage de la liste à la souris : survoler 30 cartes déclencherait 30 requêtes. Il faut un **délai d'intention** de 200 ms, annulé au départ du pointeur : seule une carte réellement regardée est préchargée.
2. **`staleTime` doit être explicite et partagé** entre le préchargement et `useObjectDetailQuery`. Sans cela, les deux peuvent diverger et l'ouverture refait immédiatement la requête que le survol vient de payer. On introduit une constante unique, `OBJECT_DETAIL_STALE_TIME_MS`, utilisée par les deux.

- [ ] **Étape 3.1 : Écrire le test qui échoue**

Créer `src/hooks/usePrefetchObjectDetail.test.tsx` :

```tsx
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePrefetchObjectDetail } from './useExplorerQueries';

const mockGetObjectResource = jest.fn();

jest.mock('../services/rpc', () => ({
  ...jest.requireActual('../services/rpc'),
  getObjectResource: (...args: unknown[]) => mockGetObjectResource(...args),
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('usePrefetchObjectDetail', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetObjectResource.mockReset();
    mockGetObjectResource.mockResolvedValue({ id: 'X', name: 'X', raw: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Le QueryClient de test déclare EXPLICITEMENT le staleTime : le client de
  // production le tient de app/query-client.ts, un client de test nu aurait
  // staleTime=0 et rendrait la 3e assertion ininterprétable.
  function makeClient() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
    });
  }

  test('precharge apres le delai d intention', async () => {
    const { result } = renderHook(() => usePrefetchObjectDetail(), { wrapper: makeWrapper(makeClient()) });

    const cancel = result.current('RESRUN0000000001');
    expect(mockGetObjectResource).not.toHaveBeenCalled(); // rien avant le délai

    jest.advanceTimersByTime(200);
    await jest.runOnlyPendingTimersAsync();

    expect(mockGetObjectResource).toHaveBeenCalledTimes(1);
    expect(mockGetObjectResource.mock.calls[0][0]).toBe('RESRUN0000000001');
    expect(typeof cancel).toBe('function');
  });

  test('un balayage de la liste ne precharge AUCUNE carte traversee', async () => {
    const { result } = renderHook(() => usePrefetchObjectDetail(), { wrapper: makeWrapper(makeClient()) });

    // 30 cartes survolées 50 ms chacune : sous le seuil d'intention de 200 ms.
    for (let i = 0; i < 30; i += 1) {
      const cancel = result.current(`RESRUN000000${String(i).padStart(4, '0')}`);
      jest.advanceTimersByTime(50);
      cancel();
    }
    await jest.runOnlyPendingTimersAsync();

    expect(mockGetObjectResource).not.toHaveBeenCalled();
  });

  test('ne repart pas si la fiche est deja fraiche en cache', async () => {
    const client = makeClient();
    client.setQueryData(['object-detail', 'RESRUN0000000001', ['fr']], { id: 'X', name: 'X', raw: {} });
    const { result } = renderHook(() => usePrefetchObjectDetail(), { wrapper: makeWrapper(client) });

    result.current('RESRUN0000000001');
    jest.advanceTimersByTime(200);
    await jest.runOnlyPendingTimersAsync();

    expect(mockGetObjectResource).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 3.2 : Lancer le test et vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/hooks/usePrefetchObjectDetail.test.tsx
```

Attendu : échec à la compilation/import — `usePrefetchObjectDetail is not a function` ou une erreur TypeScript d'export manquant.

- [ ] **Étape 3.3 : Écrire le hook**

Dans `src/hooks/useExplorerQueries.ts`, ajouter juste **après** la fonction `useObjectDetailQuery` (elle se termine ligne 233) :

```ts
/**
 * §NN — fraîcheur de la fiche, PARTAGÉE entre le préchargement au survol et la
 * lecture du tiroir. Elle doit être explicite et unique : si le préchargement et
 * `useObjectDetailQuery` divergent, l'ouverture refait la requête que le survol
 * vient de payer.
 */
export const OBJECT_DETAIL_STALE_TIME_MS = 5 * 60 * 1000;

/** §NN — délai d'intention avant préchargement, en millisecondes. */
const PREFETCH_INTENT_DELAY_MS = 200;

/**
 * §NN — précharge la fiche survolée sous la clé exacte que lit le tiroir
 * (`['object-detail', id, langPrefs]`). Le survol précède le clic de plusieurs
 * centaines de millisecondes, soit à peu près le coût d'un aller-retour vers
 * Supabase depuis La Réunion (220–310 ms mesurés) : la fiche est donc déjà en
 * cache au moment du clic.
 *
 * ATTENTION — chaque carte a sa PROPRE clé de cache : sans garde, balayer une
 * liste à la souris déclencherait une requête par carte traversée. D'où le délai
 * d'intention, que l'appelant annule via la fonction rendue quand le pointeur
 * quitte la carte. Seule une carte réellement regardée est préchargée.
 *
 * Les erreurs sont volontairement avalées : un préchargement qui échoue ne doit
 * jamais remonter à l'utilisateur, le vrai chargement au clic rejouera et
 * affichera l'erreur normalement.
 *
 * @returns une fonction d'annulation, à appeler au `mouseleave`.
 */
export function usePrefetchObjectDetail(): (objectId: string) => () => void {
  const queryClient = useQueryClient();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useMemo(
    () => (objectId: string) => {
      if (!objectId) {
        return () => undefined;
      }
      const timer = setTimeout(() => {
        void queryClient
          .prefetchQuery({
            queryKey: ['object-detail', objectId, langPrefs],
            queryFn: () => getObjectResource(objectId, langPrefs),
            staleTime: OBJECT_DETAIL_STALE_TIME_MS,
          })
          .catch(() => undefined);
      }, PREFETCH_INTENT_DELAY_MS);

      return () => clearTimeout(timer);
    },
    [langPrefs, queryClient],
  );
}
```

Puis appliquer le **même** `staleTime` à `useObjectDetailQuery` (lignes 225–233), sans quoi le préchargement est perdu à l'ouverture :

```ts
export function useObjectDetailQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    queryKey: ['object-detail', objectId, langPrefs],
    queryFn: () => getObjectResource(objectId ?? '', langPrefs),
    enabled: Boolean(objectId),
    staleTime: OBJECT_DETAIL_STALE_TIME_MS,
  });
}
```

> `useQueryClient`, `useMemo`, `useSessionStore` et `getObjectResource` sont **déjà importés** en haut du fichier (lignes 1, 2, 4 et 13). Ne pas rajouter d'import.

- [ ] **Étape 3.4 : Lancer le test et vérifier qu'il PASSE**

```bash
npm run test:run -- src/hooks/usePrefetchObjectDetail.test.tsx
```

Attendu : `Tests: 2 passed`.

- [ ] **Étape 3.5 : Brancher le préchargement sur la liste de résultats**

Dans `src/components/explorer/ResultsList.tsx` :

1. Ajouter `usePrefetchObjectDetail` à l'import existant depuis `../../hooks/useExplorerQueries` (repérer la ligne qui importe déjà des hooks de ce module et y ajouter le nom ; s'il n'y a pas d'import de ce module, en créer un).
2. Dans le corps du composant, **avant** la définition de `renderCard`, ajouter :

```tsx
  const prefetchObjectDetail = usePrefetchObjectDetail();
  // Annulation du délai d'intention en cours. Un seul suffit : le pointeur n'est
  // que sur une carte à la fois, et `onHoverChange(false)` part avant le
  // `onHoverChange(true)` de la carte suivante.
  const cancelPrefetchRef = useRef<(() => void) | null>(null);
```

> Ajouter `useRef` à l'import `react` en tête de fichier s'il n'y est pas déjà.

3. Ligne 218, remplacer :

```tsx
        onHoverChange={(hovered) => setHoveredCard(hovered ? card.id : null)}
```

par :

```tsx
        onHoverChange={(hovered) => {
          setHoveredCard(hovered ? card.id : null);
          cancelPrefetchRef.current?.();
          cancelPrefetchRef.current = hovered ? prefetchObjectDetail(card.id) : null;
        }}
```

- [ ] **Étape 3.6 : Vérifier types et non-régression**

```bash
npm run typecheck && npm run test:run
```

Attendu : typecheck sans sortie, toutes les suites au vert.

- [ ] **Étape 3.7 : Commit**

```bash
git add src/hooks/useExplorerQueries.ts src/hooks/usePrefetchObjectDetail.test.tsx src/components/explorer/ResultsList.tsx && git commit -m "perf(explorateur): precharger la fiche au survol d une carte de resultat"
```

---

### Tâche 4 : Précharger la route de l'éditeur depuis le tiroir

**Fichiers :**
- Modifier : `src/features/object-drawer/ObjectDrawerShell.tsx`

**Interfaces :**
- Consomme : `useRouter()` de `next/navigation`, déjà importé ligne 3.
- Produit : rien.

**Contexte indispensable.** Le bouton « Modifier » (ligne 133) fait un `router.push` depuis un `<button>`. Next.js ne précharge automatiquement que les `<Link>` ; le bundle de la route éditeur (~253 Ko JS+CSS non compressés, 20–21 sections importées statiquement) n'est donc **téléchargé qu'au clic**. Un `router.prefetch` déclenché à l'ouverture du tiroir télécharge ce bundle pendant que l'utilisateur lit la fiche.

Par ailleurs, depuis la tâche 1 le tiroir ne préchauffe plus le cache `object-workspace` de l'éditeur. On rétablit ce préchauffage **délibérément**, au survol du bouton « Modifier » : c'est le signal d'intention le plus fiable, et il évite de payer les 85 requêtes pour toutes les fiches simplement consultées.

- [ ] **Étape 4.1 : Écrire le test qui échoue**

Ajouter dans `src/features/object-drawer/ObjectDrawerShell.test.tsx`, à l'intérieur du `describe` existant :

```tsx
  test('precharge la route editeur a l ouverture du tiroir', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(mockPrefetch).toHaveBeenCalledWith('/objects/RESRUN0000000001/edit');
  });
```

et remplacer le mock de `next/navigation` en tête de fichier par :

```tsx
const mockPrefetch = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: (...args: unknown[]) => mockPrefetch(...args) }),
}));
```

Ajouter aussi `mockPrefetch.mockClear();` dans le `beforeEach`.

- [ ] **Étape 4.2 : Lancer le test et vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/features/object-drawer/ObjectDrawerShell.test.tsx
```

Attendu : le nouveau test échoue (`mockPrefetch` jamais appelé), les autres passent.

- [ ] **Étape 4.3 : Implémenter le préchargement de route**

Dans `src/features/object-drawer/ObjectDrawerShell.tsx`, ajouter `useEffect` à l'import de React (ajouter la ligne `import { useEffect } from 'react';` juste après la ligne 2 si aucun import de `react` n'existe), puis insérer juste **avant** `function openFullPageEditor()` (ligne 94) :

```tsx
  // §NN — le bouton « Modifier » est un <button> + router.push, donc Next ne
  // précharge PAS la route (il ne le fait que pour les <Link>). Le bundle de
  // l'éditeur (~253 Ko JS+CSS, 20-21 sections importées statiquement) partait
  // au clic. On le télécharge pendant que l'utilisateur lit la fiche.
  useEffect(() => {
    if (!objectId || !canEdit) {
      return;
    }
    router.prefetch(`/objects/${objectId}/edit`);
  }, [canEdit, objectId, router]);
```

- [ ] **Étape 4.4 : Lancer le test et vérifier qu'il PASSE**

```bash
npm run test:run -- src/features/object-drawer/ObjectDrawerShell.test.tsx
```

Attendu : `Tests: 3 passed`.

- [ ] **Étape 4.5 : Précharger les DONNÉES de l'éditeur au survol du bouton « Modifier »**

Dans le même fichier, ajouter à l'import de la ligne 7 :

```tsx
import { useObjectDetailQuery, usePrefetchObjectWorkspace } from '../../hooks/useExplorerQueries';
```

puis dans le corps du composant, après `const canEdit = role !== null;` :

```tsx
  const prefetchWorkspace = usePrefetchObjectWorkspace();
```

et sur le bouton « Modifier » (ligne 133), ajouter la prop `onMouseEnter` :

```tsx
            <button
              type="button"
              className="drawer-header__btn-primary"
              onMouseEnter={() => objectId && prefetchWorkspace(objectId)}
              onFocus={() => objectId && prefetchWorkspace(objectId)}
              onClick={openFullPageEditor}
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
              Modifier
            </button>
```

- [ ] **Étape 4.6 : Écrire le hook `usePrefetchObjectWorkspace`**

Dans `src/hooks/useExplorerQueries.ts`, juste après `usePrefetchObjectDetail` :

```ts
/**
 * §NN — précharge les données LOURDES de l'éditeur (le chargeur d'espace de
 * travail) au survol du bouton « Modifier ». Depuis que le tiroir ne charge plus
 * que la fiche seule, ce préchauffage-là doit être explicite ; on le déclenche
 * sur le signal d'intention le plus fiable, pour ne PAS payer les ~85 requêtes
 * sur les fiches simplement consultées.
 */
export function usePrefetchObjectWorkspace(): (objectId: string) => void {
  const queryClient = useQueryClient();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useMemo(
    () => (objectId: string) => {
      if (!objectId) {
        return;
      }
      void queryClient
        .prefetchQuery({
          queryKey: ['object-workspace', objectId, langPrefs],
          queryFn: () => getObjectWorkspaceResource(objectId, langPrefs),
        })
        .catch(() => undefined);
    },
    [langPrefs, queryClient],
  );
}
```

> `getObjectWorkspaceResource` est déjà importée ligne 22.

- [ ] **Étape 4.7 : Vérifier types et non-régression**

```bash
npm run typecheck && npm run test:run
```

Attendu : typecheck sans sortie, toutes les suites au vert.

- [ ] **Étape 4.8 : Commit**

```bash
git add src/features/object-drawer/ObjectDrawerShell.tsx src/features/object-drawer/ObjectDrawerShell.test.tsx src/hooks/useExplorerQueries.ts && git commit -m "perf(tiroir): precharger route et donnees de l editeur sur intention utilisateur"
```

---

### Tâche 5 : Vérification manuelle du lot 1 (à faire avec l'utilisateur)

Cette tâche ne produit **aucun code**. Elle valide que le gain est réel dans le navigateur.

- [ ] **Étape 5.1 : Demander à l'utilisateur de lancer l'application**

Ne pas lancer de serveur soi-même. Demander à l'utilisateur d'ouvrir l'Exploreur avec l'onglet Réseau des outils de développement ouvert, filtre `Fetch/XHR`.

- [ ] **Étape 5.2 : Protocole de mesure à lui transmettre**

1. Vider le filtre réseau, cliquer sur une fiche de la liste.
2. Compter les requêtes vers `ryycrdhlkmzpxwwwwupy.supabase.co`.

**Attendu : 1 à 3 requêtes** (le RPC de la fiche, plus éventuellement `canWriteObjectPrivateNote` et la présence temps réel). **Avant ce lot : ~85.**

3. Survoler une carte de la liste **sans cliquer**, attendre 1 s, puis cliquer.

**Attendu :** la requête part au survol ; le clic n'en déclenche aucune et le tiroir s'ouvre sans squelette.

- [ ] **Étape 5.3 : Consigner le résultat**

Reporter le nombre observé dans le journal de décisions `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle section `## §NN`, en reprenant le numéro suivant le dernier `## §` du fichier — **le vérifier par `grep`, ne pas le deviner**).

---

# LOT 2 — Les catalogues publics deviennent un cache de session

**Périmètre exact — chiffres recomptés en revue.** Le chemin de chargement (`object-workspace.ts` avant la ligne 3800) contient **50 sites `ref_*`** :

| Catégorie | Sites | Cacheable ? |
|---|---|---|
| `ref_code` avec domaine **statique** | 30 | **oui** — 27 domaines distincts |
| `ref_code` avec domaine **dynamique** (taxonomie, ligne 1232) | 1 | **non** — le domaine se calcule à l'exécution |
| Autres catalogues publics (`ref_amenity` ×3, `ref_language`, `ref_contact_role`, `ref_org_role`, `ref_actor_role`, `ref_iti_assoc_role`, `ref_tag`, `ref_legal_type`, `ref_capacity_metric`, `ref_capacity_applicability`, `ref_classification_scheme`, `ref_classification_value`, `ref_sustainability_action`, `ref_sustainability_action_category`, `ref_code_domain_registry`) | 17 | **oui** |
| `ref_document` (×2) | 2 | **non** — filtré par les identifiants de documents de l'objet, ce n'est pas un catalogue |

**Gain réel :** 47 des 50 sites disparaissent du chemin par fiche. Restent 3 lectures `ref_*` par fiche (taxonomie dynamique + les 2 `ref_document`).
**Risque :** moyen. Trois pièges réels, traités par les tâches 6 (exclusion des données soumises à la RLS), 7 (fraîcheur réelle) et 9 (invalidation à l'édition d'un code).
**Livrable :** ouvrir dix fiches d'affilée dans l'éditeur télécharge les catalogues **une seule fois**.

> **Le lot ne s'appelle PAS « cache des `ref_code` ».** Une première version de ce plan ne mutualisait que `ref_code` et annonçait « puis 0 » : c'était faux, ~19 lectures de catalogue seraient restées par fiche. Le lot couvre **tous les catalogues publics**, sinon l'annonce est mensongère.

> **Décision d'architecture à respecter.** L'utilisateur a proposé « tout appeler via un seul RPC ». Pour les catalogues, **ce n'est pas nécessaire** : une fois qu'ils sont chargés une seule fois par session et persistés, passer de ~17 requêtes à 1 ne gagne plus rien de perceptible (elles partent en parallèle sur une connexion HTTP/2 ≈ 1 aller-retour, **une fois par heure**). Le RPC unique garde tout son sens pour les **données d'objet** (lot 3), qui ne sont cacheables entre aucune fiche. Ce lot se fait donc **sans aucune modification SQL**.

## Structure des fichiers du lot 2

| Fichier | Rôle | Action |
|---|---|---|
| `src/services/reference-catalogs.ts` | Source unique des catalogues publics : un fetch groupé, un type de sortie | **Créer** |
| `src/services/reference-catalogs.test.ts` | Garde : un seul appel `ref_code` pour les 27 domaines | **Créer** |
| `src/hooks/useReferenceCatalogsQuery.ts` | Contrat de fraîcheur : 1 h, vérifié horloge en main | **Créer** |
| `src/hooks/useReferenceCatalogsQuery.test.tsx` | Garde : périmé au-delà d'1 h ⇒ refetch | **Créer** |
| `src/services/object-workspace.ts` | Chargeur de l'éditeur (lecture) | **Modifier** — signatures + consommation |
| `src/services/object-workspace.ts` | Chemins d'écriture | **Modifier** — tâche séparée (tâche 10) |
| `src/views/RefCodeEditor.tsx` | Édition des `ref_code` en console admin | **Modifier** — invalider le cache |

---

### Tâche 6 : Un seul appel pour les 27 domaines `ref_code`

**Fichiers :**
- Créer : `src/services/reference-catalogs.ts`
- Créer : `src/services/reference-catalogs.test.ts`

**Interfaces :**
- Produit :
  ```ts
  export type RefCodeRow = { id: string; code: string; name: string; domain: string; position: number | null };
  export const REF_CODE_DOMAINS: readonly string[];
  export type ReferenceCatalogs = { refCodeByDomain: Record<string, RefCodeRow[]> };
  export async function fetchReferenceCatalogs(): Promise<ReferenceCatalogs>;
  ```
  Ces noms sont consommés tels quels par les tâches 7, 8 et 9.

**Contexte indispensable.** `src/services/object-workspace.ts` lit `ref_code` en 31 endroits sur le chemin de chargement. Chacun est un GET PostgREST séparé. PostgREST accepte `.in('domain', [...])` : tous deviennent un seul appel filtré, regroupé côté client.

**La liste des domaines doit être régénérée, pas recopiée — et la commande naïve est FAUSSE.** Une première version de ce plan proposait :

```bash
# INCOMPLET — ne détecte que les .eq('domain', …)
grep -oE "eq\('domain', '[a-z_]+'\)" src/services/object-workspace.ts
```

Elle rate les domaines chargés par `.in(...)`. Ligne 1710 :

```ts
client.from('ref_code').select('id, code, name, domain').in('domain', ['social_network', 'distribution_channel'])…
```

Commande **correcte**, qui couvre les deux formes :

```bash
grep -oE "(eq\('domain', '[a-z_]+'\)|in\('domain', \[[^]]*\])" src/services/object-workspace.ts \
  | grep -oE "'[a-z_]+'" | tr -d "'" | grep -v '^domain$' | sort -u
```

Sortie attendue le 2026-07-28 : **27 domaines** — les 25 de la forme `.eq` plus `social_network` et `distribution_channel`.

> Si la commande rend un nombre différent de 27, **utiliser sa sortie**, pas la liste ci-dessous, et le signaler. Écarter `domainCodes` et `managedDomains` s'ils apparaissent : ce sont des variables, pas des domaines (lignes 1232, 4137, 4144, 4220 — domaines calculés à l'exécution, hors périmètre de ce cache).

- [ ] **Étape 6.1 : Écrire le test qui échoue**

Créer `src/services/reference-catalogs.test.ts` :

```ts
import { fetchReferenceCatalogs, REF_CODE_DOMAINS } from './reference-catalogs';

const inSpy = jest.fn();
const rows = [
  { id: '1', code: 'phone', name: 'Téléphone', domain: 'contact_kind', position: 1 },
  { id: '2', code: 'email', name: 'Courriel', domain: 'contact_kind', position: 2 },
  { id: '3', code: 'double', name: 'Lit double', domain: 'bed_type', position: 1 },
];

// Le mock imite la partie de l'API PostgREST réellement utilisée : `select()`
// est « thenable » (les tables de référence sont awaitées directement) ET porte
// `in()` / `order()` chaînables (le bras ref_code).
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => {
        const terminal = Promise.resolve({ data: table === 'ref_code' ? rows : [], error: null });
        return Object.assign(terminal, {
          in: (column: string, values: string[]) => {
            inSpy(table, column, values);
            const chain = Promise.resolve({ data: rows, error: null });
            return Object.assign(chain, {
              order: () => Object.assign(Promise.resolve({ data: rows, error: null }), {
                order: () => Promise.resolve({ data: rows, error: null }),
              }),
            });
          },
          order: () => terminal,
        });
      },
    }),
  }),
}));

describe('fetchReferenceCatalogs', () => {
  beforeEach(() => inSpy.mockClear());

  test('couvre les 27 domaines ref_code en UN seul appel', async () => {
    await fetchReferenceCatalogs();

    const refCodeCalls = inSpy.mock.calls.filter(([table]) => table === 'ref_code');
    expect(refCodeCalls).toHaveLength(1);
    expect(refCodeCalls[0][1]).toBe('domain');
    expect(refCodeCalls[0][2]).toEqual([...REF_CODE_DOMAINS]);
  });

  test('regroupe les lignes par domaine', async () => {
    const catalogs = await fetchReferenceCatalogs();

    expect(catalogs.refCodeByDomain.contact_kind).toHaveLength(2);
    expect(catalogs.refCodeByDomain.bed_type).toHaveLength(1);
  });

  test('rend un tableau vide pour un domaine sans ligne, jamais undefined', async () => {
    const catalogs = await fetchReferenceCatalogs();

    for (const domain of REF_CODE_DOMAINS) {
      expect(Array.isArray(catalogs.refCodeByDomain[domain])).toBe(true);
    }
  });
});
```

- [ ] **Étape 6.2 : Lancer le test et vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/services/reference-catalogs.test.ts
```

Attendu : `Cannot find module './reference-catalogs'`.

- [ ] **Étape 6.3 : Écrire le module**

Créer `src/services/reference-catalogs.ts` :

```ts
import { getSupabaseClient } from '../lib/supabase';

export type RefCodeRow = {
  id: string;
  code: string;
  name: string;
  domain: string;
  position: number | null;
};

/**
 * §NN — les 27 domaines `ref_code` que le chargeur de l'éditeur lisait
 * jusqu'ici en 25 requêtes séparées (une par `.eq('domain', …)`), soit ~23
 * allers-retours mesurés par ouverture de fiche en production.
 *
 * Liste régénérable :
 *   grep -oE "eq\('domain', '[a-z_]+'\)" src/services/object-workspace.ts \
 *     | grep -oE "'[a-z_]+'\)$" | tr -d "')" | sort -u
 *
 * Ajouter un domaine ICI quand un nouveau module de l'éditeur en a besoin —
 * ne jamais rouvrir une requête `ref_code` ad hoc dans object-workspace.ts.
 */
export const REF_CODE_DOMAINS = [
  'allergen',
  'bed_type',
  'contact_kind',
  'cuisine_type',
  'dietary_tag',
  'distribution_channel',
  'environment_tag',
  'iti_difficulty',
  'iti_open_status',
  'iti_practice',
  'iti_stage_kind',
  'language_level',
  'media_tag',
  'media_type',
  'meeting_equipment',
  'membership_campaign',
  'membership_tier',
  'menu_category',
  'opening_period_type',
  'payment_method',
  'price_kind',
  'price_type',
  'price_unit',
  'room_type',
  'season_type',
  'social_network',
  'view_type',
] as const;

/**
 * §NN — les autres catalogues publics du chemin de chargement. Même nature que
 * `ref_code` : lecture publique, identiques pour toutes les fiches ET pour tous
 * les utilisateurs. Ne PAS y ajouter :
 *  - `ref_document` : filtré par les identifiants de documents de l'objet, ce
 *    n'est pas un catalogue ;
 *  - la liste des ORG (`from('object').eq('object_type','ORG')`) : elle passe
 *    par la RLS et dépend de l'utilisateur — ce cache est partagé entre tous
 *    les utilisateurs du navigateur.
 */
export const REFERENCE_TABLES = [
  'ref_amenity',
  'ref_language',
  'ref_contact_role',
  'ref_org_role',
  'ref_actor_role',
  'ref_iti_assoc_role',
  'ref_tag',
  'ref_legal_type',
  'ref_capacity_metric',
  'ref_capacity_applicability',
  'ref_classification_scheme',
  'ref_classification_value',
  'ref_sustainability_action',
  'ref_sustainability_action_category',
  'ref_code_domain_registry',
] as const;

export type ReferenceCatalogs = {
  refCodeByDomain: Record<string, RefCodeRow[]>;
  tables: Record<string, Record<string, unknown>[]>;
};

/**
 * Charge en UN appel tous les codes de référence des 27 domaines et les
 * regroupe par domaine. Chaque domaine déclaré rend TOUJOURS un tableau
 * (vide si aucune ligne) : les appelants n'ont pas à gérer `undefined`.
 */
export async function fetchReferenceCatalogs(): Promise<ReferenceCatalogs> {
  const client = getSupabaseClient();
  const refCodeByDomain: Record<string, RefCodeRow[]> = {};
  for (const domain of REF_CODE_DOMAINS) {
    refCodeByDomain[domain] = [];
  }
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of REFERENCE_TABLES) {
    tables[table] = [];
  }

  if (!client) {
    return { refCodeByDomain, tables };
  }

  const [refCodeResult, ...tableResults] = await Promise.all([
    client
      .from('ref_code')
      .select('id, code, name, domain, position')
      .in('domain', [...REF_CODE_DOMAINS])
      .order('domain', { ascending: true })
      .order('position', { ascending: true }),
    ...REFERENCE_TABLES.map((table) => client.from(table).select(REFERENCE_TABLE_SELECT[table])),
  ]);

  if (refCodeResult.error) {
    throw refCodeResult.error;
  }

  for (const row of (refCodeResult.data ?? []) as RefCodeRow[]) {
    const bucket = refCodeByDomain[row.domain];
    if (bucket) {
      bucket.push(row);
    }
  }

  REFERENCE_TABLES.forEach((table, index) => {
    const result = tableResults[index];
    if (result?.error) {
      throw result.error;
    }
    tables[table] = (result?.data ?? []) as Record<string, unknown>[];
  });

  return { refCodeByDomain, tables };
}
```

**`REFERENCE_TABLE_SELECT` : à construire, pas à deviner.** Pour chaque table de `REFERENCE_TABLES`, la liste de colonnes doit être **l'union** de ce que demandent les sites d'appel existants (sinon un module perdra une colonne qu'il lisait). Commande pour les extraire :

```bash
for t in ref_amenity ref_language ref_contact_role ref_org_role ref_actor_role \
         ref_iti_assoc_role ref_tag ref_legal_type ref_capacity_metric \
         ref_capacity_applicability ref_classification_scheme ref_classification_value \
         ref_sustainability_action ref_sustainability_action_category ref_code_domain_registry; do
  echo "--- $t"
  grep -oE "from\('$t'\)[^;]{0,240}" src/services/object-workspace.ts | grep -oE "select\('[^']*'\)" | sort -u
done
```

Reporter le résultat dans une constante juste au-dessus de `fetchReferenceCatalogs` :

```ts
/** Colonnes = UNION des select() des sites d'appel existants (voir le plan). */
const REFERENCE_TABLE_SELECT: Record<string, string> = {
  // …une entrée par table, remplie depuis la sortie de la commande ci-dessus…
};
```

> **Deux pièges de filtrage à traiter côté client, pas côté requête.**
> `ref_amenity` est lu trois fois avec des filtres de `scope` qui se chevauchent (`['object','both']` ligne 621, sans filtre ligne 1322, `['room','both']` ligne 2570). On charge la table **entière** une fois et chaque module filtre sur `scope` en mémoire. Idem `ref_capacity_applicability`, filtré par `object_type` ligne 747 : charger la table entière (elle est petite) et filtrer en mémoire.

- [ ] **Étape 6.4 : Lancer le test et vérifier qu'il PASSE**

```bash
npm run test:run -- src/services/reference-catalogs.test.ts
```

Attendu : `Tests: 3 passed`.

- [ ] **Étape 6.5 : Commit**

```bash
git add src/services/reference-catalogs.ts src/services/reference-catalogs.test.ts && git commit -m "perf(catalogues): charger les 27 domaines ref_code en une seule requete"
```

---

### Tâche 7 : Cache de session persisté pour les catalogues

**Fichiers :**
- Créer : `src/hooks/useReferenceCatalogsQuery.ts`
- Créer : `src/hooks/useReferenceCatalogsQuery.test.tsx`

**Interfaces :**
- Consomme : `fetchReferenceCatalogs`, `ReferenceCatalogs` (tâche 6).
- Produit :
  ```ts
  export const REFERENCE_CATALOGS_QUERY_KEY: readonly ['reference-catalogs'];
  export function useReferenceCatalogsQuery(): UseQueryResult<ReferenceCatalogs>;
  export async function ensureReferenceCatalogs(queryClient: QueryClient): Promise<ReferenceCatalogs>;
  ```

**Contexte indispensable — deux pièges vérifiés dans le code, à ne pas rater.**

1. **Piège « écriture sur catalogue périmé ».** Les fonctions d'enregistrement de `object-workspace.ts` résolvent des codes vers des identifiants en relisant les catalogues. Si un administrateur ajoute un `ref_code` et qu'un rédacteur a un cache vieux de 24 h, l'écriture ne verra pas le nouveau code. **Mitigation :** `staleTime` de 1 h (pas `Infinity`) + invalidation explicite depuis l'éditeur de `ref_code` (tâche 9).

2. **Piège « cache partagé entre utilisateurs ».** Les tables `ref_*` sont en lecture publique, identiques pour tout le monde : les persister globalement est **sûr**. En revanche `getObjectWorkspaceRelationshipsModule` charge la liste des ORG via `from('object').eq('object_type','ORG')`, qui passe par la RLS et **dépend de l'utilisateur**. Elle ne doit **pas** entrer dans ce cache. Ne mettre dans `reference-catalogs.ts` que des tables `ref_*`.

- [ ] **Étape 7.1 : Écrire le test qui échoue**

Créer `src/hooks/useReferenceCatalogsQuery.test.tsx` :

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useReferenceCatalogsQuery, REFERENCE_CATALOGS_QUERY_KEY } from './useReferenceCatalogsQuery';

const mockFetch = jest.fn();
jest.mock('../services/reference-catalogs', () => ({
  fetchReferenceCatalogs: () => mockFetch(),
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useReferenceCatalogsQuery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ refCodeByDomain: { bed_type: [] } });
  });

  test('ne charge les catalogues qu une seule fois pour deux consommateurs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const a = renderHook(() => useReferenceCatalogsQuery(), { wrapper });
    const b = renderHook(() => useReferenceCatalogsQuery(), { wrapper });

    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('est marquee persistable et garde une fraicheur d une heure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useReferenceCatalogsQuery(), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const entry = client.getQueryCache().find({ queryKey: [...REFERENCE_CATALOGS_QUERY_KEY] });
    expect(entry?.meta?.persist).toBe(true);
    expect(entry?.options.staleTime).toBe(60 * 60 * 1000);
  });
});

describe('ensureReferenceCatalogs — contrat de fraicheur', () => {
  // CE TEST EST LA RAISON D'ÊTRE DE LA TÂCHE. Avec `ensureQueryData`, il échoue :
  // le cache est rendu tel quel même vieux de 24 h. Avec `fetchQuery({staleTime}),
  // il passe. Neutraliser `staleTime` DOIT le faire tomber — sinon la garde est
  // vacante et ne prouve rien.
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ refCodeByDomain: { bed_type: [] }, tables: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rend le cache sans requete tant qu il a moins d une heure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await ensureReferenceCatalogs(client);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(59 * 60 * 1000); // 59 minutes
    await ensureReferenceCatalogs(client);

    expect(mockFetch).toHaveBeenCalledTimes(1); // toujours 1 : servi du cache
  });

  test('refetch des que le cache depasse une heure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await ensureReferenceCatalogs(client);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(61 * 60 * 1000); // 61 minutes
    await ensureReferenceCatalogs(client);

    expect(mockFetch).toHaveBeenCalledTimes(2); // périmé : rechargé
  });
});
```

> Ajouter `ensureReferenceCatalogs` à l'import en tête de ce fichier de test.
>
> **Si le second test ne passe pas** avec `jest.advanceTimersByTime`, c'est que les faux timers de la configuration Jest du projet ne remplacent pas `Date.now()` (TanStack compare `dataUpdatedAt` à `Date.now()`). Dans ce cas, remplacer l'avance d'horloge par un `jest.spyOn(Date, 'now')` renvoyant `base + 61 * 60 * 1000`. **Ne pas supprimer le test** : c'est lui qui distingue `fetchQuery` de `ensureQueryData`.

- [ ] **Étape 7.2 : Lancer le test et vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/hooks/useReferenceCatalogsQuery.test.tsx
```

Attendu : `Cannot find module './useReferenceCatalogsQuery'`.

- [ ] **Étape 7.3 : Écrire le hook**

Créer `src/hooks/useReferenceCatalogsQuery.ts` :

```ts
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { fetchReferenceCatalogs, type ReferenceCatalogs } from '../services/reference-catalogs';

export const REFERENCE_CATALOGS_QUERY_KEY = ['reference-catalogs'] as const;

/**
 * §NN — les catalogues `ref_*` sont IDENTIQUES pour toutes les fiches et pour
 * tous les utilisateurs (tables en lecture publique). Ils étaient retéléchargés
 * à chaque ouverture de fiche : ~43 requêtes sur les ~85 mesurées.
 *
 * `staleTime` d'une heure, PAS `Infinity` : les chemins d'enregistrement
 * résolvent des codes vers des identifiants depuis ces catalogues, donc un
 * catalogue trop vieux ferait rater un code fraîchement ajouté par un
 * administrateur. L'éditeur de `ref_code` invalide en plus cette clé
 * explicitement (voir RefCodeEditor).
 *
 * `meta.persist` fait retenir l'entrée par le persisteur localStorage
 * (Providers.tsx:44) : après un rechargement de page, 0 requête de catalogue.
 *
 * NE JAMAIS y ajouter une donnée soumise à la RLS (par exemple la liste des
 * ORG) : ce cache est partagé entre tous les utilisateurs du navigateur.
 */
const CATALOGS_STALE_TIME_MS = 60 * 60 * 1000;
const CATALOGS_GC_TIME_MS = 24 * 60 * 60 * 1000;

export function useReferenceCatalogsQuery(): UseQueryResult<ReferenceCatalogs> {
  return useQuery({
    queryKey: [...REFERENCE_CATALOGS_QUERY_KEY],
    queryFn: fetchReferenceCatalogs,
    staleTime: CATALOGS_STALE_TIME_MS,
    gcTime: CATALOGS_GC_TIME_MS,
    meta: { persist: true },
  });
}

/**
 * Variante impérative pour le chargeur de l'éditeur, qui n'est pas un composant
 * React.
 *
 * ATTENTION — utiliser `fetchQuery`, PAS `ensureQueryData`. Vérifié dans la
 * version installée (@tanstack/query-core 5.100.7, `queryClient.ts`) :
 * `ensureQueryData` rend la valeur en cache **dès que `data !== undefined`**,
 * sans regarder `staleTime` ; l'option `revalidateIfStale` ne fait que lancer un
 * prefetch d'arrière-plan et rend **quand même** la valeur périmée. Combiné à la
 * persistance localStorage (gcTime 24 h), un catalogue vieux de 24 h serait servi
 * tel quel et le contrat « rafraîchi toutes les heures » serait faux.
 *
 * `fetchQuery({ staleTime })` a la sémantique voulue : rend le cache s'il est
 * frais **au sens de `staleTime`**, refetch sinon et attend le résultat.
 */
export async function ensureReferenceCatalogs(queryClient: QueryClient): Promise<ReferenceCatalogs> {
  return queryClient.fetchQuery({
    queryKey: [...REFERENCE_CATALOGS_QUERY_KEY],
    queryFn: fetchReferenceCatalogs,
    staleTime: CATALOGS_STALE_TIME_MS,
    gcTime: CATALOGS_GC_TIME_MS,
    meta: { persist: true },
  });
}
```

- [ ] **Étape 7.4 : Lancer le test et vérifier qu'il PASSE**

```bash
npm run test:run -- src/hooks/useReferenceCatalogsQuery.test.tsx
```

Attendu : `Tests: 2 passed`.

- [ ] **Étape 7.5 : Commit**

```bash
git add src/hooks/useReferenceCatalogsQuery.ts src/hooks/useReferenceCatalogsQuery.test.tsx && git commit -m "feat(catalogues): cache de session persiste pour les codes de reference"
```

---

### Tâche 8 : Le chargeur de l'éditeur consomme le cache

**Fichiers :**
- Modifier : `src/services/object-workspace.ts` (les 46 sites `.from('ref_code')`)
- Modifier : `src/hooks/useExplorerQueries.ts` (passage du `queryClient` au chargeur)

**Interfaces :**
- Consomme : `ensureReferenceCatalogs(queryClient)` (tâche 7).
- Produit : `getObjectWorkspaceResource(objectId, langPrefs, catalogs)` — troisième paramètre ajouté.

> **Cette tâche est la plus longue du plan. Elle se découpe module par module, avec un commit par groupe de modules.** Ne pas tenter de convertir les 46 sites d'un coup : le fichier fait 6 500 lignes et une erreur de regroupement y est difficile à retrouver.

**Méthode, à appliquer à l'identique pour chaque module — quatre gestes, pas trois.**

Une première version de ce plan disait « remplacer l'usage par `catalogs.refCodeByDomain.…` ». **C'était incomplet** : `catalogs` n'existe pas dans la portée des fonctions de module. Chacune doit d'abord **recevoir le paramètre**. Exemple complet sur le module caractéristiques, à reproduire pour les autres :

1. **Ajouter le paramètre à la signature.** Ligne 586 :

```ts
async function getObjectWorkspaceCharacteristicsModule(
  objectId: string,
  baseModule: ObjectWorkspaceCharacteristicsModule,
): Promise<ObjectWorkspaceCharacteristicsModule> {
```

devient :

```ts
async function getObjectWorkspaceCharacteristicsModule(
  objectId: string,
  baseModule: ObjectWorkspaceCharacteristicsModule,
  catalogs: ReferenceCatalogs,
): Promise<ObjectWorkspaceCharacteristicsModule> {
```

2. **Retirer les entrées de catalogue du `Promise.all` interne** (ici lignes 614–621 : `ref_language`, les trois `ref_code`, `ref_amenity`) et **décaler la destructuration** en conséquence.

3. **Remplacer chaque usage** de leur `.data` :

| Ancien | Nouveau |
|---|---|
| résultat de `ref_code` domaine `language_level` | `catalogs.refCodeByDomain.language_level` |
| résultat de `ref_code` domaine `payment_method` | `catalogs.refCodeByDomain.payment_method` |
| résultat de `ref_code` domaine `environment_tag` | `catalogs.refCodeByDomain.environment_tag` |
| résultat de `ref_language` | `catalogs.tables.ref_language` |
| résultat de `ref_amenity` filtré `scope in ('object','both')` | `catalogs.tables.ref_amenity.filter((a) => a.scope === 'object' \|\| a.scope === 'both')` |

4. **Mettre à jour l'appelant** dans `getObjectWorkspaceResource` :

```ts
    getObjectWorkspaceCharacteristicsModule(objectId, parsedModules.characteristics, catalogs),
```

> **`catalogs.tables.*` est typé `Record<string, unknown>[]`.** Les modules qui en consomment devront caster vers leur type de ligne local (celui que la destructuration leur donnait déjà). Ne pas introduire de nouveaux types : réutiliser ceux qui existent au-dessus de chaque module.

**Lister les fonctions à modifier** (elles se traitent une par une, un commit par module) :

```bash
grep -nE "^async function getObjectWorkspace[A-Za-z]+Module" src/services/object-workspace.ts
```

Après chaque module converti, `npm run typecheck` doit pointer exactement l'appelant restant à mettre à jour. **C'est le compilateur qui tient la liste — ne pas la tenir de tête.**

- [ ] **Étape 8.1 : Ajouter le paramètre `catalogs` à la signature du chargeur**

Dans `src/services/object-workspace.ts`, ligne 3845, remplacer :

```ts
export async function getObjectWorkspaceResource(objectId: string, langPrefs: string[]): Promise<ObjectWorkspaceResource> {
```

par :

```ts
export async function getObjectWorkspaceResource(
  objectId: string,
  langPrefs: string[],
  catalogs: ReferenceCatalogs,
): Promise<ObjectWorkspaceResource> {
```

et ajouter en haut du fichier :

```ts
import type { ReferenceCatalogs } from './reference-catalogs';
```

- [ ] **Étape 8.2 : Alimenter le paramètre depuis les hooks**

Dans `src/hooks/useExplorerQueries.ts`, remplacer `useObjectWorkspaceQuery` (lignes 235–243) par :

```ts
export function useObjectWorkspaceQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['object-workspace', objectId, langPrefs],
    queryFn: async () => {
      // Les catalogues sont résolus depuis le cache de session (0 requête dès la
      // deuxième fiche) AVANT que le chargeur ne parte : il ne les refetch plus.
      const catalogs = await ensureReferenceCatalogs(queryClient);
      return getObjectWorkspaceResource(objectId ?? '', langPrefs, catalogs);
    },
    enabled: Boolean(objectId),
  });
}
```

Faire la même substitution dans `usePrefetchObjectWorkspace` (tâche 4, étape 4.6) : sa `queryFn` doit elle aussi appeler `ensureReferenceCatalogs` puis passer `catalogs`.

Ajouter l'import :

```ts
import { ensureReferenceCatalogs } from './useReferenceCatalogsQuery';
```

- [ ] **Étape 8.3 : Vérifier que TypeScript liste tous les appelants à corriger**

```bash
npm run typecheck
```

Attendu : des erreurs « Expected 3 arguments, but got 2 » sur chaque appelant de `getObjectWorkspaceResource`. **Noter la liste complète** : c'est la feuille de route de cette étape. Corriger chacun en lui passant `catalogs`.

- [ ] **Étape 8.4 : Convertir le groupe « caractéristiques » (lignes 614–621)**

Appliquer les quatre gestes de la « Méthode » ci-dessus au module caractéristiques (lignes 586–698). Les cinq entrées de catalogue à retirer du `Promise.all` sont : `ref_language` (614), `ref_code` `language_level` (615), `ref_code` `payment_method` (617), `ref_code` `environment_tag` (619), `ref_amenity` (621). Ce module passe ainsi de 9 requêtes à 4.

- [ ] **Étape 8.5 : Vérifier**

```bash
npm run typecheck && npm run test:run -- src/services
```

Attendu : typecheck propre, suites de `src/services` au vert.

- [ ] **Étape 8.6 : Commit**

```bash
git add src/services/object-workspace.ts src/hooks/useExplorerQueries.ts && git commit -m "perf(editeur): module caracteristiques lit les codes depuis le cache de session"
```

- [ ] **Étape 8.7 : Répéter les étapes 8.4 à 8.6 pour chaque groupe restant**

Groupes à traiter, dans cet ordre (numéros de ligne au 2026-07-28, à revérifier avant chaque passe car ils bougent) :

| Groupe | Lignes | `ref_code` à retirer | Autres catalogues à retirer |
|---|---|---|---|
| capacité | 741, 747 | — | `ref_capacity_metric`, `ref_capacity_applicability` |
| taxonomie | 1207 | — | `ref_code_domain_registry` |
| distinctions | 1308, 1313, 1322 | — | `ref_classification_scheme`, `ref_classification_value`, `ref_amenity` |
| médias | 1560–1561 | `media_type`, `media_tag` | — |
| contacts | 1706, 1707, 1710 | `contact_kind`, `social_network`, `distribution_channel` | `ref_contact_role` |
| relations | 1802, 1811 | — | `ref_org_role`, `ref_actor_role` |
| adhésions | 2070–2071 | `membership_campaign`, `membership_tier` | — |
| juridique | 2304 | — | `ref_legal_type` |
| tarifs | 2391–2394 | `price_kind`, `price_type`, `season_type`, `price_unit` | — |
| chambres | 2568–2572 | `view_type`, `room_type`, `bed_type` | `ref_amenity` (scope `room`/`both`) |
| salles de réunion | 2730 | `meeting_equipment` | — |
| cuisine | 2803 | `cuisine_type` | — |
| menus | 2842–2847 | `menu_category`, `dietary_tag`, `allergen`, `cuisine_type`, `price_kind`, `price_unit` | — |
| activité | 3038 | `iti_difficulty` | — |
| itinéraire | 3152–3157, 3159 | `iti_practice`, `iti_difficulty`, `iti_open_status`, `iti_stage_kind` | `ref_iti_assoc_role` |
| durabilité | 3416, 3420 | — | `ref_sustainability_action_category`, `ref_sustainability_action` |
| étiquettes | 3491 | — | `ref_tag` |
| horaires | site `opening_period_type` | `opening_period_type` | — |

> **Trois exceptions à NE PAS convertir.**
> - Ligne 1232 (taxonomie) : `ref_code` filtré par `domainCodes`, calculé à l'exécution depuis `ref_code_domain_registry`. Hors des 27 domaines statiques.
> - Lignes 1373 et 2237 : `ref_document` filtré par les identifiants de documents de l'objet. Ce n'est pas un catalogue.
> - Ligne 3835 : `ref_facet_applicability` — **à convertir aussi si la commande de la tâche 6 l'a listée**, sinon la laisser. Vérifier, ne pas supposer.

- [ ] **Étape 8.10 : Les chemins d'ÉCRITURE, dans un commit séparé**

Les sites au-delà de la ligne 4000 (4135, 4137, 4144, 4220, 4249, 4253, 4863, 4939, 4995–4998, 6294) appartiennent aux fonctions d'**enregistrement**, pas au chargement. Ils bénéficient du même cache, mais **leurs fonctions n'ont pas non plus `catalogs` en portée** et leurs appelants sont différents (les savers, appelés depuis `saveWorkspaceModule`, pas depuis le chargeur).

Deux options, à trancher **après** avoir regardé un saver :

- **Option A (préférée) :** les savers résolvent les catalogues eux-mêmes via `ensureReferenceCatalogs(queryClient)`. Cela suppose de leur passer le `queryClient`, ce qui remonte jusqu'à `saveWorkspaceModule`. Chaîne d'appelants à modifier : à établir par `npm run typecheck`, pas de tête.
- **Option B (repli) :** laisser les chemins d'écriture tels quels. Ils ne sont pas sur le chemin d'**ouverture** — ils ne coûtent rien au problème que ce plan traite. Une écriture qui relit un catalogue coûte une requête au moment de l'enregistrement, pas à l'ouverture.

> **Si l'option A dépasse trois fichiers de propagation, prendre l'option B et le signaler.** L'objectif du plan est l'ouverture, pas l'enregistrement. Ne pas transformer un lot de perf en refonte de la chaîne d'écriture.

```bash
git add src/services/object-workspace.ts && git commit -m "perf(editeur): chemins d ecriture lisent les catalogues depuis le cache de session"
```

- [ ] **Étape 8.8 : Vérifier qu'il ne reste que les exceptions documentées**

```bash
awk 'NR<3800' src/services/object-workspace.ts | grep -cE "\.from\('ref_"
```

Attendu : **3** (la taxonomie à domaine dynamique + les deux `ref_document`), contre 50 avant le lot. Si le compte est supérieur, lister les restantes et vérifier une par une qu'elles figurent bien dans les exceptions documentées :

```bash
awk 'NR<3800' src/services/object-workspace.ts | grep -nE "\.from\('ref_"
```

- [ ] **Étape 8.9 : Non-régression complète et commit final du lot**

```bash
npm run typecheck && npm run test:run
```

```bash
git add src/services/object-workspace.ts && git commit -m "perf(editeur): supprimer les 24 dernieres lectures ref_code par fiche"
```

---

### Tâche 9 : Invalider le cache quand un code de référence change

**Fichiers :**
- Modifier : `src/views/RefCodeEditor.tsx`

**Interfaces :**
- Consomme : `REFERENCE_CATALOGS_QUERY_KEY` (tâche 7).

**Contexte indispensable.** Sans cette tâche, un administrateur qui ajoute un `ref_code` depuis `/settings` ne le verra pas apparaître dans l'éditeur avant une heure, et une écriture pourrait échouer à résoudre le code. C'est le piège n°1 de la tâche 7 : cette tâche **fait partie du lot**, elle n'est pas optionnelle.

- [ ] **Étape 9.1 : Repérer les mutations**

```bash
grep -n "invalidateQueries\|useMutation" src/views/RefCodeEditor.tsx
```

Noter chaque `onSuccess` de mutation.

- [ ] **Étape 9.2 : Ajouter l'invalidation**

Dans chaque `onSuccess` relevé, ajouter :

```ts
      // §NN — les codes de référence sont mis en cache une heure côté rédacteurs
      // (useReferenceCatalogsQuery). Sans cette invalidation, un code fraîchement
      // créé resterait invisible de l'éditeur, et une écriture pourrait ne pas
      // réussir à le résoudre.
      void queryClient.invalidateQueries({ queryKey: [...REFERENCE_CATALOGS_QUERY_KEY] });
```

avec l'import :

```ts
import { REFERENCE_CATALOGS_QUERY_KEY } from '../hooks/useReferenceCatalogsQuery';
```

- [ ] **Étape 9.3 : Vérifier et commiter**

```bash
npm run typecheck && npm run test:run -- src/views/RefCodeEditor.test.tsx
```

```bash
git add src/views/RefCodeEditor.tsx && git commit -m "fix(catalogues): invalider le cache de session a l edition d un code de reference"
```

---

### Tâche 9 bis : Mesure froide/chaude du lot 2

- [ ] **Étape 9b.1 : Exécuter le protocole de mesure** (section « Protocole de mesure » en tête de plan) avec l'utilisateur.

Attendu : éditeur **~38 requêtes à froid**, **~21 à chaud**. La chute entre froid et chaud est la preuve que le cache de catalogues fonctionne.

- [ ] **Étape 9b.2 : Si le chiffre à chaud n'a pas chuté**, vérifier dans cet ordre :
  1. `ensureReferenceCatalogs` utilise-t-il bien `fetchQuery` et non `ensureQueryData` ?
  2. La clé `['reference-catalogs']` contient-elle par erreur `objectId` ou `langPrefs` ?
  3. `meta: { persist: true }` est-il bien présent (sinon rien ne survit au rechargement) ?
  4. Une invalidation trop large purge-t-elle la clé à chaque enregistrement ?

- [ ] **Étape 9b.3 : Consigner** la série dans le journal de décisions.

---

# LOT 3 — Le chargeur de l'éditeur cesse de sérialiser

**Prérequis : le lot 2 doit être terminé** (signature à trois paramètres de `getObjectWorkspaceResource`).
**Gain :** le chemin critique passe de 7 allers-retours enchaînés à 3–4, soit ~0,7 s de latence pure économisée.
**Risque :** faible (aucun changement de contrat, uniquement de l'ordonnancement).
**Livrable :** ouvrir l'éditeur à froid coûte 3 latences réseau au lieu de 7.

---

### Tâche 10 : Fusionner les vagues 1 et 2

**Fichiers :**
- Modifier : `src/services/object-workspace.ts` (lignes 3852–3947)

**Contexte indispensable — et fait vérifié.** La vague 2 (`Promise.all` ligne 3933) est attendue **après** la vague 1 (ligne 3866) alors qu'**aucun** de ses 13 arguments ne provient de la vague 1. Cela a été vérifié argument par argument par deux relectures indépendantes : les 13 appels ne consomment que `parsedModules.*`, `detail`, `objectId` et `placeLabelById` — et `placeLabelById` (ligne 3918) dérive de `parsedModules.location.places`, jamais de `locationModule`. La sérialisation est donc gratuite.

- [ ] **Étape 10.1 : Écrire le test qui échoue**

**Pourquoi PAS un test de chronométrage.** Une première version de ce plan proposait d'instrumenter `fetch`, de bloquer toutes les réponses sur une même promesse et d'affirmer `starts.length > 1`. **Cette assertion ne prouve rien** : en séquentiel aussi, la première vague émet plusieurs requêtes, donc `starts.length > 1` est déjà vrai. Un vrai test de chronométrage exigerait deux promesses différées distinctes et l'assertion « des appels des DEUX groupes ont démarré avant que la première ne se résolve » — faisable, mais dépendant de l'ordre interne des 26 modules, donc fragile au moindre ajout.

**Garde retenue : structurelle et déterministe.** Ce qui doit être vérifié est exactement : *il ne reste qu'un seul point de synchronisation dans le chargeur*. C'est vérifiable par lecture du source, sans réseau ni horloge, et **ça tombe** si quelqu'un réintroduit un `await` entre les deux groupes.

Créer `src/services/object-workspace.waves.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §NN — GARDE D'ORDONNANCEMENT. La vague 2 était awaitée après la vague 1 alors
 * qu'aucun de ses 13 arguments n'en provenait : une latence réseau complète
 * (220-310 ms depuis La Réunion) payée pour rien.
 *
 * Le corps de `getObjectWorkspaceResource` ne doit contenir qu'UN SEUL
 * `await Promise.all`. En ajouter un second = réintroduire la sérialisation.
 * Si un jour un second point de synchronisation est légitime (une dépendance
 * réelle apparaît), mettre à jour ce test EN MÊME TEMPS, avec un commentaire
 * disant laquelle — ne jamais le supprimer.
 */
describe('getObjectWorkspaceResource — ordonnancement', () => {
  test('ne contient qu un seul point de synchronisation', () => {
    const source = readFileSync(join(__dirname, 'object-workspace.ts'), 'utf8');
    const start = source.indexOf('export async function getObjectWorkspaceResource');
    expect(start).toBeGreaterThan(-1);

    // Fin du corps = début de la déclaration exportée suivante.
    const nextExport = source.indexOf('\nexport ', start + 1);
    const body = source.slice(start, nextExport === -1 ? undefined : nextExport);

    const syncPoints = body.match(/await Promise\.all\(/g) ?? [];
    expect(syncPoints).toHaveLength(1);
  });
});
```

- [ ] **Étape 10.1 bis : Vérifier que la garde n'est PAS vacante**

Avant de corriger le code, ce test doit échouer avec `Expected length: 1, Received length: 2`. Si le message dit autre chose (par exemple `Received length: 0`), la découpe du corps est fausse : **corriger la découpe avant de continuer**, sinon la garde ne protège rien.

- [ ] **Étape 10.2 : Lancer le test et vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/services/object-workspace.waves.test.ts
```

- [ ] **Étape 10.3 : Fusionner**

Remplacer les deux `await Promise.all([...])` (lignes 3866 et 3933) par un seul, en déplaçant la construction de `placeLabelById` (ligne 3918) **avant** le `Promise.all` fusionné — elle ne dépend que de `parsedModules.location.places`.

Structure cible :

```ts
  const placeLabelById = new Map(parsedModules.location.places.map((place) => [place.id, place.label]));

  const [
    taxonomyModule, distinctionsModule, publicationModule, syncIdentifiersModule,
    openingsModule, relationshipsModule, legalModule, sustainabilityModule,
    tagsModule, contactsModule, characteristicsModule, locationModule, permissions,
    mediaModule, capacityPoliciesModule, pricingModule, roomsModule,
    meetingRoomsModule, menusModule, cuisineModule, activityModule,
    eventModule, itineraryModule, membershipsModule, crmFollowUpModule, facetRows,
  ] = await Promise.all([
    // …les 26 appels des deux anciennes vagues, dans le même ordre…
  ]);
```

- [ ] **Étape 10.4 : Vérifier**

```bash
npm run test:run -- src/services/object-workspace.waves.test.ts && npm run typecheck && npm run test:run
```

- [ ] **Étape 10.5 : Commit**

```bash
git add src/services/object-workspace.ts src/services/object-workspace.waves.test.ts && git commit -m "perf(editeur): fusionner les deux vagues d enrichissement (aucune dependance entre elles)"
```

---

### Tâche 11 : Supprimer le saut sérialisé du module taxonomie

**Fichiers :**
- Modifier : `src/services/object-workspace.ts` (lignes 1191–1240)

**Contexte indispensable.** `getObjectWorkspaceTaxonomyModule` enchaîne **trois** allers-retours strictement séquentiels : `select object.object_type` → `ref_code_domain_registry` → `Promise.all([ref_code, object_taxonomy])`. Le premier saut refait un aller-retour pour lire `object.object_type` alors que la valeur est **déjà en main** : `detail.type` est disponible depuis la vague 0.

- [ ] **Étape 11.1 : Ajouter un paramètre `objectType` et supprimer le premier saut**

Dans `getObjectWorkspaceTaxonomyModule`, ajouter `objectType: string` en dernier paramètre de la signature, puis supprimer intégralement ce bloc (lignes 1191–1204) :

```ts
  const objectResult = await client
    .from('object')
    .select('object_type')
    .eq('id', objectId)
    .maybeSingle();

  if (objectResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore une taxonomie structurante complete pour ce profil.',
    };
  }

  const objectType = readString((objectResult.data as Record<string, unknown> | null)?.object_type).trim();
```

et le remplacer par :

```ts
  // §NN — `object_type` est DÉJÀ connu : il vient de `detail.type`, chargé par
  // la vague 0. Le relire ici coûtait un aller-retour complet (220-310 ms depuis
  // La Réunion) en tête d'une cascade de 3 sauts sérialisés.
  const resolvedObjectType = objectType.trim();
```

Puis remplacer l'unique usage de `objectType` plus bas (ligne 1224, dans le `.filter(...)`) :

```ts
    .filter((domain) => !domain.objectType || domain.objectType === objectType || fallbackByDomain.has(domain.domain))
```

par :

```ts
    .filter((domain) => !domain.objectType || domain.objectType === resolvedObjectType || fallbackByDomain.has(domain.domain))
```

> Le renommage en `resolvedObjectType` évite l'ombrage du paramètre par la variable locale. Si TypeScript signale que `readString` n'est plus utilisée dans le fichier, **ne pas la supprimer** : elle sert ailleurs.

- [ ] **Étape 11.2 : Alimenter l'appelant**

Ligne 3867, remplacer :

```ts
    getObjectWorkspaceTaxonomyModule(objectId, parsedModules.taxonomy),
```

par :

```ts
    getObjectWorkspaceTaxonomyModule(objectId, parsedModules.taxonomy, detail.type ?? ''),
```

- [ ] **Étape 11.3 : Vérifier et commiter**

```bash
npm run typecheck && npm run test:run
```

```bash
git add src/services/object-workspace.ts && git commit -m "perf(editeur): taxonomie reutilise le type deja charge au lieu de le relire"
```

---

### Tâche 12 : Supprimer les lectures dupliquées de `media` — **REPORTÉE**

## REPORTÉE — ne pas exécuter dans ce plan

**Constat (exact).** Les médias de l'objet sont lus **quatre** fois par ouverture : le module médias fait le `select` complet (ligne 1548), et les modules chambres (2571), menus (2848) et itinéraire (3162) refont chacun **exactement** la même requête :

```ts
client.from('media').select('id, title, url, position').eq('object_id', objectId).order('position', { ascending: true }),
```

**Pourquoi elle est reportée.** Une première version de ce plan proposait de charger les vignettes une fois et de les lire « à l'assemblage ». **Ce n'est pas implémentable** : les trois modules consomment le résultat **à l'intérieur** de leur fonction, pas au moment où le chargeur assemble l'objet `modules`. Il n'y a pas de point où injecter la valeur après coup.

**La forme correcte**, si la tâche est reprise plus tard :

1. Vague 0 : `const [detail, mediaThumbs] = await Promise.all([getObjectResource(...), fetchObjectMediaThumbs(objectId)])` — les deux partent ensemble, donc **aucune** latence ajoutée.
2. Passer `mediaThumbs` en paramètre aux trois modules chambres / menus / itinéraire, comme `catalogs` au lot 2.

**Et le gain honnête est 4 lectures → 2, pas → 1** : le module médias garde son `select` complet (colonnes bien plus larges), il n'est pas mutualisable avec les vignettes.

**Pourquoi ce n'est pas prioritaire.** Les trois requêtes dupliquées partent **en parallèle** : les supprimer ne raccourcit pas le chemin critique. Le gain est de la charge serveur, pas de la latence perçue — c'est-à-dire pas l'objectif de ce plan. À reprendre dans une passe d'hygiène, après mesure des lots 1 et 2.

---

### Tâche 13 : Couper la passe `render` du RPC

**Fichiers :**
- Modifier : `src/services/rpc.ts` (lignes 144 et 454)

**Contexte indispensable.** `api.get_object_resource` exécute par défaut une passe `render` qui **rebalaie une seconde fois** 15 tables enfants pour produire des clés `*_lines` d'affichage. `grep -rn "_lines" src/` rend **0 occurrence** : ces clés ne sont lues nulle part dans le front. Gain mesuré : 2,5 à 6 ms par objet.

**Attention, portée sous-estimée.** `getObjectResource` a **quatre** appelants, pas deux. Les lister avant de toucher quoi que ce soit :

```bash
grep -rn "getObjectResource(" src/ --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -v "export async function"
```

Attendu au 2026-07-28 : `src/services/object-workspace.ts:3846`, `src/hooks/useExplorerQueries.ts:230`, `src/components/explorer/SelectionBar.tsx:66` (impression) et **`src/services/selection-export.ts:17`** — ce dernier fait `csvCell(JSON.stringify(d.raw ?? {}))` (ligne 28) et **déverse donc `render` dans la colonne `raw_json` du CSV exporté**. Couper la passe sans le traiter modifierait silencieusement un livrable utilisateur.

- [ ] **Étape 13.1 : Rendre l'option paramétrable plutôt que globale**

Changer la signature en `getObjectResource(objectId: string, langPrefs: string[], options?: { render?: boolean })`, avec `render: false` par défaut, et propager la valeur dans les **deux** `p_options` du fichier (ligne 144, chemin `get_object_with_deep_data` ; ligne 454, chemin de repli `get_object_resource`).

- [ ] **Étape 13.2 : Préserver l'export CSV**

Dans **`src/services/selection-export.ts`** (ligne 17 — *pas* `src/features/…`), remplacer :

```ts
  const details = await Promise.all(ids.map((id) => getObjectResource(id, langPrefs)));
```

par :

```ts
  // §NN — l'export CSV sérialise `raw` entier dans sa colonne `raw_json`. Le
  // reste de l'app ne demande plus la passe `render` (inutilisée) ; ici on la
  // garde explicitement pour ne pas amputer un livrable utilisateur existant.
  const details = await Promise.all(ids.map((id) => getObjectResource(id, langPrefs, { render: true })));
```

- [ ] **Étape 13.3 : Décider pour l'impression de sélection**

`src/components/explorer/SelectionBar.tsx:66` boucle sur jusqu'à 50 fiches. Vérifier si le rendu d'impression lit une clé `*_lines` :

```bash
grep -rn "_lines" src/components/explorer/ src/features/ | grep -v "\.test\."
```

Attendu : **0 résultat** ⇒ laisser l'impression sur le défaut `render: false`, ce qui lui fait gagner 2,5–6 ms × 50 fiches. Si le grep rend quelque chose, passer `{ render: true }` à cet appelant aussi et le signaler.

- [ ] **Étape 13.4 : Ne PAS toucher au défaut SQL**

Ne pas modifier `v_render_enabled := COALESCE(..., TRUE)` dans `api_views_functions.sql:2995` : l'API partenaire documentée continue de recevoir `render` sans le demander.

- [ ] **Étape 13.5 : Vérifier et commiter — les DEUX fichiers**

```bash
npm run typecheck && npm run test:run
```

```bash
git add src/services/rpc.ts src/services/selection-export.ts && git commit -m "perf(rpc): ne plus demander la passe render, inutilisee par le front"
```

> Une première version de ce plan ne stageait que `rpc.ts` : la préservation du CSV serait restée hors commit, donc l'export aurait été cassé par le commit suivant. **Vérifier `git status` avant de commiter** — si `selection-export.ts` n'apparaît pas modifié, l'étape 13.2 n'a pas été faite.

---

### Tâche 14 : Mesure froide/chaude du lot 3

- [ ] **Étape 14.1 : Exécuter le protocole de mesure** avec l'utilisateur.

Le lot 3 ne change **pas** le nombre de requêtes — il change leur **enchaînement**. La bonne mesure n'est donc pas le compte mais la **profondeur** : dans l'onglet Réseau, trier par heure de début et compter les « marches d'escalier », c'est-à-dire les groupes de requêtes qui ne démarrent qu'une fois le groupe précédent terminé.

Attendu : **3 marches au lieu de 7**, et un temps jusqu'au premier pixel de l'éditeur réduit d'environ 0,7 s à froid.

- [ ] **Étape 14.2 : Consigner** la série dans le journal de décisions, et **rouvrir la question du RPC unique** : c'est à ce moment, chiffres en main, qu'on décide s'il vaut son coût.

---

# Ce qui n'est PAS dans ce plan, et pourquoi

| Piste | Verdict | Raison |
|---|---|---|
| RPC unique `api.get_object_workspace()` | **Reporté** | C'est le geste le plus lourd (SQL + migration + runbook + test d'application à froid) et son gain dépend de ce que les lots 1–3 auront déjà retiré. À replanifier **après** la mesure de la tâche 14, pas avant. |
| Déduplication des 4 lectures `media` (ex-tâche 12) | **Reporté** | Les 3 requêtes dupliquées partent en **parallèle** : les supprimer n'allège pas le chemin critique, seulement la charge serveur. Et le gain honnête est 4 → 2, pas 4 → 1. Forme correcte décrite dans la tâche 12. Passe d'hygiène. |
| Propagation de `catalogs` dans les chemins d'**écriture** | **Optionnel (étape 8.10)** | Hors du chemin d'ouverture. À faire seulement si la propagation reste sous trois fichiers. |
| RPC unique pour les catalogues | **Écarté** | Une fois les catalogues chargés une fois par session et persistés, 16 requêtes ≈ 1 aller-retour sur HTTP/2. Le SQL n'achète rien ici. |
| Précharger la clé `['object-detail', …]` avant le lot 1 | **Écarté** | Inerte : avant la tâche 1, personne ne lit cette clé. |
| Précharger le chunk du tiroir | **Écarté** | Il part déjà au montage de l'`AppShell`, pas au clic. |
| Optimiser le parseur (`object-workspace-parser.ts`, 3 503 lignes) | **Écarté** | Une passe unique sur 15 kB de JSON déjà désérialisé. Ce n'est pas le goulot. |
| Découper les 22 sections de l'éditeur en imports dynamiques | **Hors périmètre** | Vrai gain (~253 Ko au clic) mais c'est un chantier de bundle, pas de réduction d'allers-retours. Mérite son propre plan. |
| Passer `p_options.fields` pour projeter le payload | **Hors périmètre** | Le mécanisme existe et n'est utilisé par aucun appelant. Gain réel mais demande de cartographier champ par champ ce que chaque surface consomme. Son propre plan. |

---

# Ordre d'exécution recommandé

1. **Lot 1 en entier** (tâches 1 à 5) — c'est 95 % du gain sur l'ouverture d'une fiche, pour un risque quasi nul. Faire valider la mesure de la tâche 5 par l'utilisateur **avant** d'aller plus loin.
2. **Lot 2** (tâches 6 à 9 bis) — le gros du gain sur l'éditeur. La tâche 8 est longue : la découper en commits par groupe de modules comme indiqué. La tâche 9 bis est **obligatoire** : sans elle, on ne sait pas si le cache fonctionne.
3. **Lot 3** (tâches 10, 11, 13, 14 — la 12 est reportée) — finition. Remesurer, et **seulement alors** décider si le RPC unique vaut son coût.

## Journal des corrections apportées à ce plan

Ce plan a été révisé après une revue technique qui a relevé huit défauts, tous vérifiés dans le code avant correction. Ils sont consignés ici pour que l'exécutant sache **pourquoi** certaines consignes sont insistantes :

1. `ensureQueryData` rend le cache sans regarder `staleTime` (vérifié dans `@tanstack/query-core` 5.100.7) → remplacé par `fetchQuery`, avec un test à horloge avancée.
2. La commande d'extraction des domaines ratait la forme `.in('domain', […])` → 27 domaines, pas 25, et commande corrigée.
3. Le gain « puis 0 » était faux : seuls les `ref_code` étaient mutualisés → le lot couvre désormais tous les catalogues publics.
4. `catalogs` n'était pas propagé aux fonctions de module → changements de signature explicités, lecture et écriture séparées.
5. Le préchargement au survol aurait généré une requête par carte balayée → délai d'intention + `staleTime` explicite et partagé.
6. Le test d'ordonnancement (`starts.length > 1`) était vrai aussi en séquentiel → garde structurelle déterministe.
7. La déduplication média n'était pas implémentable telle qu'écrite → reportée, avec la forme correcte documentée.
8. Le chemin de `selection-export.ts` était faux et son commit l'excluait → corrigé, commit sur deux fichiers.
