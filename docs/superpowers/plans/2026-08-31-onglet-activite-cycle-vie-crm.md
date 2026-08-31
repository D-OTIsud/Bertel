# Onglet Activité + cycle de vie CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au CRM un cycle de vie à six statuts dont l'attente prestataire est **déduite** du temps de traitement, et remplir l'onglet « Activité équipe » du tableau de bord avec quatre widgets sur données humaines réelles.

**Architecture:** Cinq tranches héritées de la spec (`docs/superpowers/specs/2026-08-31-onglet-activite-cycle-vie-crm-design.md`), découpées en 8 tâches. Le déploiement n'étant pas atomique (SQL à la main, front par build Coolify), les tâches 1-2 rendent le front **bilingue** avant que la tâche 3-4 ne bascule la base. La bascule recrée l'enum `crm_status`, crée un journal de transitions alimenté par trigger, et redéploie les 7 fonctions dépendantes — dont **trois casseraient EN SILENCE** sans cela (mesuré : le backlog passerait de 170 à 1 891).

**Tech Stack:** PostgreSQL/Supabase (enum, trigger, RPC `SECURITY DEFINER`) · Next.js / React 19 · TanStack Query v5 · Jest + RTL.

**Maquette validée :** artifact « Onglet Activité équipe » (rythme de saisie, contributeurs, arriéré, temps net, sélecteur 6 états).

## Global Constraints

- **Répertoires :** frontend `bertel-tourism-ui/` ; SQL `Base de donnée DLL et API/` (accent et espaces dans le nom — toujours le mettre entre guillemets).
- **Convention projet pour le SQL :** le sous-agent **écrit les fichiers seulement** — jamais d'accès base, jamais de `git` sur les tranches SQL. Le contrôleur revoit le diff, applique au live via MCP `apply_migration`, lance les tests transactionnels via `execute_sql` (sans directives psql `\set`), prouve les gardes **rouges avant / vertes après**, et commite. Les tâches frontend commitent elles-mêmes.
- **Commandes de test :** suite complète `npm run test:run` · un fichier `npx jest <chemin>` · **jamais `npm test`** (c'est `jest --watch`, il ne rend jamais la main).
- **Ligne de base tsc : `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` doit rendre 10** — erreurs préexistantes (9 × TS2741 `isPublic` dans les fixtures des tests CRM, 1 × TS2531 dans `export-columns.test.ts`). **Ne pas les corriger** même en touchant ces fichiers de test : hors périmètre. Plus de 10 = votre régression ; « 0 » n'est jamais le critère.
- **Prérequis worktree :** si `jest`/`tsc` échoue sur « Cannot find module », recréer la jonction :
  ```bash
  cmd /c mklink /J "C:\Users\dphil\Bertel3.0\.claude\worktrees\sweet-franklin-807ec6\bertel-tourism-ui\node_modules" "C:\Users\dphil\Bertel3.0\bertel-tourism-ui\node_modules"
  ```
- **État de référence de la suite :** `npx jest` rend 3 suites en échec (`tests/e2e/*.spec.ts`, specs Playwright chargées par Jest). Tous les tests unitaires passent. Préexistant — ne pas y toucher.
- Tests en français, imports relatifs (pas l'alias `@/`), matchers `jest-dom` globaux (ne pas les réimporter).
- **Jamais `rgba(var(--x-rgb), a)`** — forme autorisée `rgb(var(--x-rgb) / a)`. Une garde Jest existe.
- Commits conventionnels, **sans trailer de co-auteur**.
- **SQL, invariants §204/§213 :** `REVOKE ALL … FROM PUBLIC, anon` sur toute fonction neuve puis `GRANT … TO authenticated, service_role` ; `SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref` ; `gen_random_uuid()` jamais `uuid_generate_v4()` ; toute sonde `auth.*()` enveloppée `COALESCE(…, FALSE)` ; fonction exposée neuve ou modifiée de signature ⇒ `NOTIFY pgrst, 'reload schema';` ; fold dans `api_views_functions.sql`/`schema_unified.sql` + entrée manifeste `docs/SQL_ROLLOUT_RUNBOOK.md` + **câblage dans `ci_fresh_apply.sql`** (l'oubli du câblage a été un constat Important de la revue précédente) + test sous `tests/` prouvé ROUGE avant application.
- **RÈGLE D'ÉDITION NON NÉGOCIABLE (spec §9) : aucun remplacement global sur une chaîne de statut.** Trois vocabulaires coexistent — `crm_status` (demandes), `crm_task_status` (`todo, in_progress, done, canceled, blocked` — **non concerné**), adhésions (`prospect, invoiced, paid, canceled, lapsed` — **non concerné**). `'done'`, `'canceled'` et bientôt `'in_progress'` sont partagés. La seule ancre fiable est le contexte : `crm_interaction`, `crm_status`, `saveCrmInteraction`, `relatedInteractionStatus`. Chaque substitution de ce plan cite sa ligne verbatim ; ne remplacez **que** ces occurrences-là.
- **Aucun chiffre en dur dans le SQL de migration** : 3 144, 170, 1 721, 57, 4 595 datent du 31/08. La migration compte dynamiquement ; les tests assertent des invariants relatifs (avant == après), pas des constantes.

## Vocabulaire cible (spec §6.1)

| Statut | Libellé FR | Ouvert ? | `resolved_at` |
|---|---|---|---|
| `new` | En attente de traitement | oui | NULL |
| `in_progress` | En cours | oui | NULL |
| `awaiting_provider` | Attente prestataire | oui (temps déduit) | NULL |
| `resolved` | Traitée | non | posé |
| `closed` | Clôturée | non | posé |
| `canceled` | Annulée | non | posé |

Remappage : `planned → new`, `done → resolved`. Legacy affichable : `planned` → « En attente », `done` → « Traitée ».

## Arbitrages posés par ce plan (spec §10)

1. **Qui écrit `closed` :** uniquement le sélecteur 6 états. Le prompt du kanban « Oui, clôturer » écrit `resolved` (une tâche terminée = la demande est traitée).
2. **`resolved_at` fait foi** pour la date de résolution ; le journal est l'historique. Invariant : tout chemin qui écrit un statut terminal pose `COALESCE(resolved_at, NOW())` ; tout passage à un statut ouvert le remet à NULL.
3. **Temps net :** calculé **uniquement** sur les demandes dont le premier événement de journal est la création (`from_status IS NULL`) — nées après la migration. `canceled` exclu de la moyenne. Réouverture : c'est le `resolved_at` final qui date la fin (cohérent avec l'arbitrage 2).
4. **Les 1 721 `resolved` sans `resolved_at` :** aucune date inventée (invariant §218, décision 17b confirmée). Elles sont hors moyenne par construction (pas d'événement de création au journal).
5. **RGPD — vérifié sur pièces, pas de câblage nécessaire :** `rpc_gdpr_erasure` opère sur les **acteurs** (tiers externes) et les déclarants d'incident. `crm_interaction_status_event.changed_by` sera un **membre de l'équipe** (`auth.uid()`), même classe de rétention que `audit.audit_log.changed_by` et `object_version.created_by`, qui ne sont pas dans le périmètre de ce RPC. Documenté dans l'en-tête de la table.
6. **Teintes (spec §10.9) : 5 classes, 3 familles + 2 accents** — `--open` (ambre existant : `new`, `planned`, `in_progress`), `--waiting` (bleu, nouveau : `awaiting_provider`), `--done` (vert existant : `resolved`, `done`), `--closed` (neutre, nouveau : `closed`), `--canceled` (rouge, nouveau : `canceled`).
7. **Tolérance transitoire retenue** (spec §8) : `save_crm_interaction` traduit `'done'→'resolved'` et `'planned'→'new'` en entrée, marquée `TOLERANCE-17g`, identifiant de retrait inscrit au manifeste dès le premier jour.
8. **Filtre « Traitées » (`p_status='done'` côté front)** = la famille fermée entière : `resolved, closed, canceled`.

---

## File Structure

| Fichier | Rôle | Tâche |
|---|---|---|
| `bertel-tourism-ui/src/features/crm/crm-status.ts` | **nouveau** — registre unique : type, libellés FR, tones, prédicats | 1 |
| `bertel-tourism-ui/src/features/crm/crm-status.test.ts` | tests du registre | 1 |
| `bertel-tourism-ui/src/features/crm/crm-primitives.tsx` | chip 6+2 statuts (T1), `onChangeStatus` (T2), bouton statut → modale (T6) | 1, 2, 6 |
| `bertel-tourism-ui/src/features/crm/CrmTaches.tsx` | `CLOSED_INTERACTION_STATUSES` partagé (T1), écriture `resolved` (T6) | 1, 6 |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.tsx` | prédicat partagé | 1 |
| `bertel-tourism-ui/src/styles.css` | 3 classes `tl-status--*` neuves (T1), styles modale statut (T6), widgets (T7) | 1, 6, 7 |
| `bertel-tourism-ui/src/features/crm/{CrmActorFiche,CrmObjectView,CrmTimelineView}.tsx` | `handleChangeStatus` passe-plats | 2 |
| `Base de donnée DLL et API/migration_crm_lifecycle.sql` | **la migration indivisible** (id manifeste à vérifier, `17g` pressenti) | 3 |
| `Base de donnée DLL et API/tests/test_crm_lifecycle.sql` | garde transactionnelle | 3 |
| `Base de donnée DLL et API/schema_unified.sql` | type 6 valeurs, 2 triggers, table journal (fold) | 3 |
| `Base de donnée DLL et API/api_views_functions.sql` | fold des 2 prédicats + `list_crm_status_events` | 3 |
| `Base de donnée DLL et API/ci_fresh_apply.sql` + `docs/SQL_ROLLOUT_RUNBOOK.md` | câblage + manifeste | 3 |
| `Base de donnée DLL et API/tests/test_{crm_module,crm_directory_search,gdpr_erasure,crm_task_multi_assignee,crm_interaction_status,dashboard_crm_open}.sql` | vocabulaire migré | 3 |
| `bertel-tourism-ui/src/features/crm/CrmStatusModal.tsx` (+ test) | **nouveau** — modale « Statut de la demande », 6 états + encart attente | 6 |
| `bertel-tourism-ui/src/features/crm/CrmInteractionModal.tsx` | création : `'new' \| 'resolved'` | 6 |
| `bertel-tourism-ui/src/services/crm.ts` | défaut parse `'resolved'`, `listCrmStatusEvents` | 6 |
| `bertel-tourism-ui/src/data/mock.ts` | fixtures démo migrées | 6 |
| `bertel-tourism-ui/src/features/crm/crm-status-vocabulary.guard.test.ts` | **nouveau** — volet 3 de la garde : plus de `'planned'` dans `src/` | 6 |
| `Base de donnée DLL et API/migration_dashboard_activity.sql` (+ test, fold, manifeste) | 2 RPC de l'onglet + extension `get_dashboard_crm_open` | 5 |
| `bertel-tourism-ui/src/types/dashboard.ts` + `src/services/dashboard-rpc.ts` | types + getters des 2 RPC | 5 |
| `bertel-tourism-ui/src/components/dashboard/{ActivityRhythm,ContributorsTable,CrmBacklog,CrmFlow,NetTime}*.tsx` | les widgets | 7 |
| `bertel-tourism-ui/src/components/dashboard/ScorecardStrip.tsx` | carte « récent / arriéré » | 7 |
| `bertel-tourism-ui/src/views/DashboardPage.tsx` | assemblage onglet Activité | 7 |

**Ordre d'exécution : 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.** La tâche 4 (application live) est **contrôleur seulement**. Les tâches 1-2 sont déployables avant la bascule ; 6-7 seulement après.

---

## Task 1 : A0 — Front bilingue (registre de statuts, aucune valeur changée)

**Files:**
- Create: `bertel-tourism-ui/src/features/crm/crm-status.ts`
- Create: `bertel-tourism-ui/src/features/crm/crm-status.test.ts`
- Modify: `bertel-tourism-ui/src/features/crm/crm-primitives.tsx` (chip, lignes 743-748 et 808-814)
- Modify: `bertel-tourism-ui/src/features/crm/CrmTaches.tsx:35`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.tsx:57-60`
- Modify: `bertel-tourism-ui/src/styles.css` (après la ligne ~12454)
- Test: `bertel-tourism-ui/src/features/crm/crm-primitives.test.tsx` (fixtures existantes inchangées — elles doivent **continuer à passer**)

**Interfaces — Produces (consommées par les tâches 2, 6, 7):**

```ts
export type CrmInteractionStatus = 'new' | 'in_progress' | 'awaiting_provider' | 'resolved' | 'closed' | 'canceled';
export type LegacyCrmInteractionStatus = 'planned' | 'done';
export type AnyCrmInteractionStatus = CrmInteractionStatus | LegacyCrmInteractionStatus;
export function interactionStatusLabel(status: string | null | undefined): string | null;
export type InteractionStatusTone = 'open' | 'waiting' | 'done' | 'closed' | 'canceled';
export function interactionStatusTone(status: string): InteractionStatusTone;
export function isOpenInteractionStatus(status: string | null | undefined): boolean;
export const CLOSED_INTERACTION_STATUSES: ReadonlySet<string>;
```

**Pourquoi cette tâche existe :** le SQL s'applique à la main, le front arrive par build Coolify. Sans cette tranche, la fenêtre entre les deux affiche des chips vides (`'new'` inconnu du rendu) — une dégradation **silencieuse**. Après elle, l'app tourne inchangée sur la base actuelle **et** ne casse pas si elle voit le nouveau vocabulaire.

- [ ] **Step 1 : Écrire les tests du registre (ils échouent — module absent)**

Créer `bertel-tourism-ui/src/features/crm/crm-status.test.ts` :

```ts
import {
  interactionStatusLabel,
  interactionStatusTone,
  isOpenInteractionStatus,
  CLOSED_INTERACTION_STATUSES,
} from './crm-status';

describe('crm-status — registre bilingue', () => {
  it('libelle les six statuts du nouveau vocabulaire', () => {
    expect(interactionStatusLabel('new')).toBe('En attente de traitement');
    expect(interactionStatusLabel('in_progress')).toBe('En cours');
    expect(interactionStatusLabel('awaiting_provider')).toBe('Attente prestataire');
    expect(interactionStatusLabel('resolved')).toBe('Traitée');
    expect(interactionStatusLabel('closed')).toBe('Clôturée');
    expect(interactionStatusLabel('canceled')).toBe('Annulée');
  });

  it('libelle encore l’ancien vocabulaire — la base parle planned/done jusqu’à la bascule', () => {
    expect(interactionStatusLabel('planned')).toBe('En attente');
    expect(interactionStatusLabel('done')).toBe('Traitée');
  });

  it('rend null pour un statut inconnu ou absent — jamais un libellé inventé', () => {
    expect(interactionStatusLabel('draft')).toBeNull();
    expect(interactionStatusLabel(null)).toBeNull();
    expect(interactionStatusLabel(undefined)).toBeNull();
  });

  it('classe les tons par famille', () => {
    expect(interactionStatusTone('new')).toBe('open');
    expect(interactionStatusTone('planned')).toBe('open');
    expect(interactionStatusTone('in_progress')).toBe('open');
    expect(interactionStatusTone('awaiting_provider')).toBe('waiting');
    expect(interactionStatusTone('resolved')).toBe('done');
    expect(interactionStatusTone('done')).toBe('done');
    expect(interactionStatusTone('closed')).toBe('closed');
    expect(interactionStatusTone('canceled')).toBe('canceled');
  });

  it('dit ouvert dans les deux vocabulaires', () => {
    for (const s of ['planned', 'new', 'in_progress', 'awaiting_provider']) {
      expect(isOpenInteractionStatus(s)).toBe(true);
    }
    for (const s of ['done', 'resolved', 'closed', 'canceled', null, undefined]) {
      expect(isOpenInteractionStatus(s)).toBe(false);
    }
  });

  it('le jeu fermé couvre les deux vocabulaires — le prompt du kanban en dépend', () => {
    for (const s of ['done', 'resolved', 'closed', 'canceled']) {
      expect(CLOSED_INTERACTION_STATUSES.has(s)).toBe(true);
    }
    expect(CLOSED_INTERACTION_STATUSES.has('awaiting_provider')).toBe(false);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

```bash
npx jest src/features/crm/crm-status.test.ts
```

Attendu : FAIL — module `./crm-status` introuvable.

- [ ] **Step 3 : Écrire le registre**

Créer `bertel-tourism-ui/src/features/crm/crm-status.ts` :

```ts
/**
 * Registre UNIQUE du vocabulaire de statut des interactions CRM (spec 2026-08-31 §6.1).
 *
 * BILINGUE pendant la fenêtre de déploiement : la base parle `planned`/`done` jusqu'à la
 * migration du cycle de vie, puis `new`/…/`canceled`. Le SQL s'applique à la main et le
 * front arrive par build Coolify — entre les deux, ce registre garantit qu'aucun des deux
 * vocabulaires ne rend une chip vide. Les entrées legacy se retirent avec la tolérance
 * TOLERANCE-17g côté serveur, jamais avant.
 *
 * NE PAS confondre avec le vocabulaire des TÂCHES (`CrmTaskStatus` : todo, in_progress,
 * done, canceled, blocked) — `done`, `canceled` et `in_progress` existent dans les deux.
 */
export type CrmInteractionStatus =
  | 'new'
  | 'in_progress'
  | 'awaiting_provider'
  | 'resolved'
  | 'closed'
  | 'canceled';
export type LegacyCrmInteractionStatus = 'planned' | 'done';
export type AnyCrmInteractionStatus = CrmInteractionStatus | LegacyCrmInteractionStatus;

export type InteractionStatusTone = 'open' | 'waiting' | 'done' | 'closed' | 'canceled';

const REGISTRY: Record<string, { label: string; tone: InteractionStatusTone; open: boolean }> = {
  new: { label: 'En attente de traitement', tone: 'open', open: true },
  in_progress: { label: 'En cours', tone: 'open', open: true },
  awaiting_provider: { label: 'Attente prestataire', tone: 'waiting', open: true },
  resolved: { label: 'Traitée', tone: 'done', open: false },
  closed: { label: 'Clôturée', tone: 'closed', open: false },
  canceled: { label: 'Annulée', tone: 'canceled', open: false },
  // Legacy — la base d'avant la bascule. Libellés historiques conservés à l'identique.
  planned: { label: 'En attente', tone: 'open', open: true },
  done: { label: 'Traitée', tone: 'done', open: false },
};

export function interactionStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return REGISTRY[status]?.label ?? null;
}

export function interactionStatusTone(status: string): InteractionStatusTone {
  return REGISTRY[status]?.tone ?? 'open';
}

export function isOpenInteractionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return REGISTRY[status]?.open ?? false;
}

/** Ni traitée, ni clôturée, ni annulée — pilote le prompt de clôture du kanban (§66). */
export const CLOSED_INTERACTION_STATUSES: ReadonlySet<string> = new Set(
  Object.entries(REGISTRY)
    .filter(([, v]) => !v.open)
    .map(([k]) => k),
);
```

- [ ] **Step 4 : Vérifier le vert**

```bash
npx jest src/features/crm/crm-status.test.ts
```

Attendu : PASS, 6 tests.

- [ ] **Step 5 : Brancher la chip de `crm-primitives.tsx` sur le registre**

Ajouter l'import en tête de fichier :

```tsx
import { interactionStatusLabel, interactionStatusTone, isOpenInteractionStatus } from './crm-status';
```

Remplacer les lignes 743-744 (le commentaire cite l'ancien vocabulaire **entre apostrophes** — la garde du volet 3 de la Task 6 le détecterait) :

```tsx
  // Statut de la demande (§65/§66) — chip discrète : 'planned' = à traiter, 'done' = traitée.
  const status = item.status ?? null;
```

par :

```tsx
  // Statut de la demande (§65/§66) — chip discrète, libellé et ton via le registre crm-status.ts.
  const status = item.status ?? null;
```

Remplacer la ligne 748 (verbatim actuel) :

```tsx
  const isResolved = status === 'done' || (status == null && Boolean(item.resolvedAt));
```

par :

```tsx
  const isResolved =
    (status != null && !isOpenInteractionStatus(status)) ||
    (status == null && Boolean(item.resolvedAt));
```

Remplacer les lignes 808-814 (les deux chips en dur) :

```tsx
            {/* Statut de la demande (§65/§66) : « En attente » (planned) / « Traitée » (done). */}
            {status === 'planned' ? <span className="tl-status tl-status--open">En attente</span> : null}
            {status === 'done' ? (
              <span className="tl-status tl-status--done" title={item.resolvedAt ? `Traitée le ${formatShort(item.resolvedAt)}` : undefined}>
                Traitée
              </span>
            ) : null}
```

par :

```tsx
            {/* Statut de la demande — registre bilingue crm-status.ts : les 6 statuts du
                cycle de vie ET les 2 legacy rendent une chip ; un code inconnu ne rend rien
                (jamais un libellé inventé). Le title date la résolution sur un statut fermé. */}
            {status && interactionStatusLabel(status) ? (
              <span
                className={'tl-status tl-status--' + interactionStatusTone(status)}
                title={
                  !isOpenInteractionStatus(status) && item.resolvedAt
                    ? `Traitée le ${formatShort(item.resolvedAt)}`
                    : undefined
                }
              >
                {interactionStatusLabel(status)}
              </span>
            ) : null}
```

- [ ] **Step 6 : Partager le jeu fermé du kanban**

Dans `CrmTaches.tsx`, remplacer les lignes 33-35 (verbatim) :

```ts
// §66 — une interaction « clôturable » : ni déjà traitée ni annulée. Le prompt de clôture ne
// se déclenche que pour ces statuts (pas de proposition redondante).
const CLOSED_INTERACTION_STATUSES = new Set(['done', 'canceled']);
```

par un import (et supprimer la constante locale) :

```ts
// §66 — une interaction « clôturable » : ni traitée, ni clôturée, ni annulée. Jeu partagé
// bilingue (crm-status.ts) : le prompt reste juste avant ET après la bascule de vocabulaire.
import { CLOSED_INTERACTION_STATUSES } from './crm-status';
```

⚠️ La ligne 104 voisine `if (variables.status !== 'done') return;` porte sur une **tâche** (`crm_task_status`) — **ne pas la toucher**.

- [ ] **Step 7 : Partager le prédicat du §19 de l'éditeur**

Dans `SectionCrm.tsx`, remplacer la ligne 60 (verbatim) :

```ts
    if (item.status === 'planned' && item.actorId) {
```

par :

```ts
    if (isOpenInteractionStatus(item.status) && item.actorId) {
```

avec l'import `import { isOpenInteractionStatus } from '../../crm/crm-status';` et le commentaire des lignes 57-58 mis à jour : `// Interactions OUVERTES (prédicat partagé crm-status.ts — mêmes statuts que la chip §65/§66)`.

- [ ] **Step 8 : Les trois classes CSS neuves**

Dans `bertel-tourism-ui/src/styles.css`, juste après la ligne `.crm-app .tl-status--done { … }` (~12454) :

```css
/* Cycle de vie §6.1 — 3 familles + 2 accents. --open (ambre) et --done (vert) préexistent. */
.crm-app .tl-status--waiting { background: rgb(47 111 176 / 0.14); color: #244e78; }
.crm-app .tl-status--closed { background: var(--surface-2); color: var(--ink-2); }
.crm-app .tl-status--canceled { background: var(--red-soft); color: var(--danger-ink); }
```

- [ ] **Step 9 : Non-régression totale du périmètre CRM**

```bash
npx jest src/features/crm src/features/object-editor/sections/SectionCrm.test.tsx src/views/CrmPage.test.tsx
```

Attendu : PASS partout, **sans modifier une seule fixture** — c'est le critère du bilinguisme : les tests existants parlent `planned`/`done` et doivent rester verts tels quels.

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10**.

- [ ] **Step 10 : Commit**

```bash
git add bertel-tourism-ui/src/features/crm/crm-status.ts bertel-tourism-ui/src/features/crm/crm-status.test.ts bertel-tourism-ui/src/features/crm/crm-primitives.tsx bertel-tourism-ui/src/features/crm/CrmTaches.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.tsx bertel-tourism-ui/src/styles.css
git commit -m "feat(crm): registre de statuts bilingue avant la bascule de vocabulaire"
```

---

## Task 2 : A1 — Contrat `onChangeStatus` (aucune valeur changée)

**Files:**
- Modify: `bertel-tourism-ui/src/features/crm/crm-primitives.tsx` (interface l.36, `toggleResolve` l.618-629, destructuration l.610)
- Modify: `bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx:388-391`
- Modify: `bertel-tourism-ui/src/features/crm/CrmObjectView.tsx:107-110`
- Modify: `bertel-tourism-ui/src/features/crm/CrmTimelineView.tsx:143-146`
- Test: les tests existants de ces vues (mise à jour des mocks de callback uniquement)

**Interfaces — Produces:**

```ts
// crm-primitives.tsx, interface CrmThreadActions — REMPLACE onResolve
onChangeStatus?: (rootId: string, status: AnyCrmInteractionStatus) => Promise<void> | void;
```

**Pourquoi séparée de la Task 1 :** c'est un changement de **forme** qui fait rougir la compilation sur tous les sites — mélangé au bilinguisme, la revue devient illisible. Les valeurs passées restent `'done'`/`'planned'` : le comportement est strictement identique.

- [ ] **Step 1 : Remplacer la signature**

Dans `crm-primitives.tsx` ligne 36, remplacer (verbatim) :

```ts
  onResolve?: (rootId: string, done: boolean) => Promise<void> | void;
```

par :

```ts
  /**
   * Change le statut de la demande racine. Contrat à SIX états (cycle de vie §6.1) ;
   * tant que la base parle l'ancien vocabulaire, les appelants passent 'done'/'planned'.
   */
  onChangeStatus?: (rootId: string, status: AnyCrmInteractionStatus) => Promise<void> | void;
```

avec `import type { AnyCrmInteractionStatus } from './crm-status';`.

- [ ] **Step 2 : Adapter `TlThreadActions`**

Ligne 610, la destructuration `const { canWrite, readOnlyReason, onReply, onResolve, onCreateTask, createTaskDisabledReason } = actions;` → `onResolve` devient `onChangeStatus`. Dans `toggleResolve()` (l.618-629), remplacer :

```ts
    if (!onResolve || resolving) return;
    …
      await onResolve(rootId, !isResolved);
```

par :

```ts
    if (!onChangeStatus || resolving) return;
    …
      await onChangeStatus(rootId, isResolved ? 'planned' : 'done');
```

et les deux gardes de rendu `{onResolve ? (…)}` (l.647) et `actions.onResolve` dans `hasThreadActions` (l.754) passent à `onChangeStatus`. Le bouton « Marquer traitée / Rouvrir » ne change **pas** d'apparence dans cette tâche.

- [ ] **Step 3 : Les trois passe-plats**

Dans chacune des trois vues, remplacer le bloc verbatim :

```ts
  const handleResolve = async (rootId: string, done: boolean) => {
    await saveCrmInteraction({ id: rootId, status: done ? 'done' : 'planned' });
    await refetchActor();   // refetchObject() / refetchTimeline() selon la vue
  };
```

par :

```ts
  const handleChangeStatus = async (rootId: string, status: AnyCrmInteractionStatus) => {
    await saveCrmInteraction({ id: rootId, status });
    await refetchActor();   // ⚠️ garder l'invalidation PROPRE à chaque vue — ne pas mutualiser
  };
```

et le site qui passait `onResolve: handleResolve` dans l'objet `actions` passe `onChangeStatus: handleChangeStatus`. Import du type dans chaque fichier.

- [ ] **Step 4 : Tests, typecheck, commit**

```bash
npx jest src/features/crm
```

Attendu : PASS. Si un test mockait `onResolve`, renommer le mock en `onChangeStatus` et adapter l'assertion à `(rootId, 'done')` — le test vérifie le même comportement sous le nouveau contrat.

```bash
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```

Attendu : **10**.

```bash
git add bertel-tourism-ui/src/features/crm
git commit -m "refactor(crm): contrat onChangeStatus a six etats, valeurs inchangees"
```

---

## Task 3 : A2 — Écrire la migration du cycle de vie (fichiers seulement)

**⚠️ Sous-agent : fichiers uniquement. Aucun accès base, aucun `git`. L'application live et le commit sont la Task 4 (contrôleur).**

**Files:**
- Create: `Base de donnée DLL et API/migration_crm_lifecycle.sql`
- Create: `Base de donnée DLL et API/tests/test_crm_lifecycle.sql`
- Modify: `Base de donnée DLL et API/schema_unified.sql` (l.225 type ; l.3249 et l.3385 `'done'`→`'resolved'` ; ajouter table + trigger journal après la définition de `crm_interaction`)
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (prédicats de `capture_metric_snapshots` ~l.10418 et `get_dashboard_crm_open` ~l.10292 + son COMMENT ~l.10310 ; ajouter `list_crm_status_events`)
- Modify: `Base de donnée DLL et API/migration_dashboard_crm_open.sql:24` (+ commentaire l.42) — même prédicat, deux sources par convention deploy-integrity
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (câblage après 17f-test, avant le bloc final)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée manifeste)
- Modify: `Base de donnée DLL et API/tests/test_crm_task_multi_assignee.sql` (l.339, 371, 529 — **PAS** l.527, c'est une tâche), `tests/test_crm_interaction_status.sql` (l.120, 150, 156, 163, 168, 178, 183, 190, 198), `tests/test_dashboard_crm_open.sql` (l.24 — **PAS** l.32, tâches), `tests/test_crm_module.sql` (l.269-272, 424, 429, 749-755), `tests/test_crm_directory_search.sql` (l.138-139), `tests/test_gdpr_erasure.sql` (l.34, 40)

**Interfaces — Produces:**
- Enum `crm_status` = `new, in_progress, awaiting_provider, resolved, closed, canceled` (remap `planned→new`, `done→resolved`).
- Table `public.crm_interaction_status_event(id, interaction_id, from_status, to_status, changed_at, changed_by)` + trigger `trg_crm_interaction_status_event`.
- RPC `api.list_crm_status_events(p_interaction_id uuid) RETURNS jsonb` — `{events:[{from_status,to_status,changed_at,changed_by_label}]}`, ordonné `changed_at ASC`.
- 7 fonctions redéployées, tolérance `TOLERANCE-17g`, garde 3 volets.

**Sources canoniques des corps** (deploy-integrity : la dernière définition du manifeste fait foi — copier CE corps, appliquer les substitutions, jamais réécrire de mémoire) :

| Fonction | Corps à copier depuis |
|---|---|
| `save_crm_interaction` | `migration_crm_interaction_default_status.sql` (17b) |
| `list_crm_timeline` | `migration_crm_module.sql` (8z) |
| `list_crm_directory_linked` | `migration_crm_directory_search.sql` (8z2) |
| `capture_metric_snapshots` | `api_views_functions.sql` |
| `get_dashboard_crm_open` | `migration_dashboard_crm_open.sql` (17f) |
| `create_crm_artifacts_from_incident`, `log_publication_proof_interaction` | `schema_unified.sql` (l.3249, l.3385) |

- [ ] **Step 1 : Vérifier l'identifiant de manifeste**

Lire la fin de `docs/SQL_ROLLOUT_RUNBOOK.md` et de `ci_fresh_apply.sql`. `17a`-`17f` sont pris (et `17c` porte une collision connue, à ne pas toucher). Utiliser le premier libre — pressenti **`17g`**. Tout ce qui suit dit `17g` ; adapter si le relevé dit autre chose.

- [ ] **Step 2 : Écrire `migration_crm_lifecycle.sql`** — structure imposée, dans cet ordre :

**(0) En-tête.** Chantier, spec, les 3 pannes silencieuses avec le chiffre mesuré (170 → 1 891 parce que 1 721 lignes `done` importées ont `resolved_at NULL`), la césure assumée d'`audit.audit_log` (4 216 `"done"` historiques, jamais réécrits — un journal d'audit se lit, il ne se corrige pas), la décision RGPD (changed_by = attribution d'équipe, classe `audit_log.changed_by`), et l'identifiant de retrait de la tolérance : `TOLERANCE-17g — à retirer par une migration dédiée quand plus aucun front n'envoie done/planned`.

**(1) Garde d'idempotence.** Toute la migration est enveloppée dans :

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'crm_status' AND e.enumlabel = 'planned'
  ) THEN
    RAISE NOTICE 'crm_status parle déjà le nouveau vocabulaire — bascule sautée (base fraîche ou rejeu).';
  ELSE
    -- … étapes (2) et (3) ici …
  END IF;
END $$;
```

puis les objets idempotents (table, trigger, fonctions, gardes) **hors** de ce DO, en `CREATE OR REPLACE` / `IF NOT EXISTS`.

**(2) La bascule du type** (dans le DO, exécution dynamique via `EXECUTE` car DDL dans plpgsql) :

```sql
CREATE TYPE crm_status_v2 AS ENUM ('new','in_progress','awaiting_provider','resolved','closed','canceled');
ALTER TABLE public.crm_interaction
  ALTER COLUMN status TYPE crm_status_v2
  USING (CASE status::text
           WHEN 'planned'  THEN 'new'
           WHEN 'done'     THEN 'resolved'
           WHEN 'canceled' THEN 'canceled'
         END)::crm_status_v2;
DROP TYPE crm_status;
ALTER TYPE crm_status_v2 RENAME TO crm_status;
```

Le `CASE` est **exhaustif sans ELSE** : une valeur imprévue rend NULL et la colonne `NOT NULL` fait échouer fort — c'est voulu. `ALTER COLUMN TYPE` réécrit la table **sans déclencher les triggers de ligne** (comportement PostgreSQL documenté) ; **toute variante « backfill par UPDATE » est interdite** — elle déclencherait le trigger d'audit sur chaque ligne.

**(3) Comptages de contrôle** (dans le DO) : compter avant/après par statut dans des variables, `ASSERT` que `count(planned)avant = count(new)après`, `count(done)avant = count(resolved)après`, total inchangé. Aucun chiffre en dur.

**(4) Le journal** :

```sql
CREATE TABLE IF NOT EXISTS public.crm_interaction_status_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL REFERENCES public.crm_interaction(id) ON DELETE CASCADE,
  from_status    crm_status,          -- NULL = création
  to_status      crm_status NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  -- Attribution d'ÉQUIPE (auth.uid()), même classe de rétention que audit_log.changed_by ;
  -- hors périmètre de rpc_gdpr_erase_subject (acteurs/déclarants), décision spec §10.5.
  changed_by     uuid
);
CREATE INDEX IF NOT EXISTS idx_crm_status_event_interaction
  ON public.crm_interaction_status_event (interaction_id, changed_at);
ALTER TABLE public.crm_interaction_status_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_interaction_status_event FROM PUBLIC, anon, authenticated;
```

Doctrine §61 : RLS ON, **zéro policy**, aucun GRANT applicatif — lecture uniquement via RPC DEFINER.

**(5) Le trigger** :

```sql
CREATE OR REPLACE FUNCTION api.log_crm_interaction_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_crm_interaction_status_event ON public.crm_interaction;
CREATE TRIGGER trg_crm_interaction_status_event
  AFTER INSERT OR UPDATE OF status ON public.crm_interaction
  FOR EACH ROW EXECUTE FUNCTION api.log_crm_interaction_status_event();
```

**(6) Le rejeu des transitions d'audit** (amorçage, idempotent, **traduisant** — c'est le lecteur qui traduit, jamais `audit_log` qu'on réécrit) :

```sql
INSERT INTO public.crm_interaction_status_event (interaction_id, from_status, to_status, changed_at, changed_by)
SELECT (a.row_pk->>'id')::uuid,
       (CASE a.before_data->>'status' WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
             ELSE a.before_data->>'status' END)::crm_status,
       (CASE a.after_data->>'status'  WHEN 'planned' THEN 'new' WHEN 'done' THEN 'resolved'
             ELSE a.after_data->>'status'  END)::crm_status,
       a.changed_at,
       CASE WHEN a.changed_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN a.changed_by::uuid ELSE NULL END   -- audit stocke email OU sub ; seul un uuid se mappe
FROM audit.audit_log a
JOIN public.crm_interaction ci ON ci.id = (a.row_pk->>'id')::uuid
WHERE a.table_name = 'crm_interaction' AND a.operation = 'UPDATE'
  AND (a.before_data->>'status') IS DISTINCT FROM (a.after_data->>'status')
  AND NOT EXISTS (SELECT 1 FROM public.crm_interaction_status_event e
                  WHERE e.interaction_id = (a.row_pk->>'id')::uuid
                    AND e.changed_at = a.changed_at AND e.from_status IS NOT NULL);
```

**(7) Les 7 fonctions redéployées.** Copier chaque corps depuis sa source canonique (tableau ci-dessus) et appliquer **exactement** ces substitutions — les chaînes citées sont verbatim, uniques dans leur fichier :

*`capture_metric_snapshots`* — remplacer :
```sql
  FROM crm_interaction WHERE resolved_at IS NULL AND status::text <> 'done'
```
par (et mettre à jour le commentaire `-- 5. Backlog CRM (provisoire jusqu'à Brique 3 …)` en `-- 5. Backlog CRM — liste positive TYPÉE des statuts ouverts (cycle de vie §6.1). Identique MOT POUR MOT au prédicat de get_dashboard_crm_open : la carte et la courbe comptent la même chose.`) :
```sql
  FROM crm_interaction
  WHERE resolved_at IS NULL
    AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
```

*`get_dashboard_crm_open`* — remplacer (CTE `interactions`) :
```sql
    WHERE  resolved_at IS NULL
      AND  status::text <> 'done'
```
par le **même prédicat mot pour mot** que ci-dessus. ⚠️ Le CTE `tasks` cinq lignes plus bas (`status::text IN ('todo', 'in_progress', 'blocked')`) porte sur `crm_task` — **ne pas le toucher**. Mettre à jour le `COMMENT ON FUNCTION` (il cite l'ancien prédicat) dans les deux fichiers (`api_views_functions.sql` et `migration_dashboard_crm_open.sql`).

*`save_crm_interaction`* (corps 17b) — six substitutions + la tolérance :

1. Déclarer `v_status_raw text;` dans le bloc DECLARE, et poser en tête du corps (avant tout usage du statut du payload) :
```sql
  -- TOLERANCE-17g (transitoire — retirer par migration dédiée, identifiant au manifeste) :
  -- le front d'avant la bascule envoie encore 'done'/'planned'. Traduits ICI et seulement ici.
  v_status_raw := NULLIF(p_payload->>'status', '');
  v_status_raw := CASE v_status_raw WHEN 'done' THEN 'resolved' WHEN 'planned' THEN 'new'
                       ELSE v_status_raw END;
```
2. Bras UPDATE, `status = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_status ELSE status END` → `(v_status_raw)::crm_status` à la place du cast direct.
3. Bras UPDATE, le CASE de `resolved_at` (verbatim actuel `WHEN 'done'    THEN COALESCE(resolved_at, NOW())` / `WHEN 'planned' THEN NULL`) devient :
```sql
                     THEN (CASE WHEN v_status_raw IN ('resolved','closed','canceled')
                                THEN COALESCE(resolved_at, NOW())
                                ELSE NULL END)   -- statut ouvert ⇒ réouverte, date effacée
```
4. Branche réponse, `v_new_status := COALESCE(NULLIF(p_payload->>'status','')::crm_status, 'done'::crm_status);` → `v_new_status := COALESCE(v_status_raw::crm_status, 'resolved'::crm_status);`
5. Les deux `CASE WHEN v_new_status = 'done' THEN NOW() ELSE NULL END` → `CASE WHEN v_new_status IN ('resolved','closed','canceled') THEN NOW() ELSE NULL END`.
6. Défaut racine par sujet, `CASE WHEN v_topic_id IS NOT NULL THEN 'planned'::crm_status ELSE 'done'::crm_status END` → `'new'::crm_status` / `'resolved'::crm_status` — la règle §220 est **conservée, traduite**. Mettre à jour les commentaires qui citent l'ancien vocabulaire (l.72, 126, 168-170, 179 du prosrc).

*`list_crm_timeline`* (corps 8z) et *`list_crm_directory_linked`* (corps 8z2) — même transformation, un filtre devient une **famille** :
- `v_status crm_status;` → `v_statuses crm_status[];`
- `IF p_status = 'active' THEN v_status := 'planned';` → `IF p_status = 'active' THEN v_statuses := ARRAY['new','in_progress','awaiting_provider']::crm_status[];`
- `ELSIF p_status = 'done' THEN v_status := 'done';` → `ELSIF p_status = 'done' THEN v_statuses := ARRAY['resolved','closed','canceled']::crm_status[];` (arbitrage n°8 : « Traitées » = famille fermée)
- chaque `(v_status IS NULL OR xx.status = v_status)` → `(v_statuses IS NULL OR xx.status = ANY (v_statuses))` — 1 occurrence dans timeline (l.70), **4** dans directory_linked (l.138, 171, 183, 201).

*`create_crm_artifacts_from_incident`* et *`log_publication_proof_interaction`* — dans chacune, l'unique `'done'` de l'`INSERT INTO crm_interaction` → `'resolved'`. ⚠️ Dans la première, l'`INSERT INTO crm_task … 'todo'` 19 lignes plus bas ne bouge **pas**.

**(8) `list_crm_status_events`** (nouvelle, alimente l'encart « depuis quand » de la Task 6) :

```sql
CREATE OR REPLACE FUNCTION api.list_crm_status_events(p_interaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_object text;
  v_actor  uuid;
  v_ok     boolean;
BEGIN
  SELECT ci.object_id, ci.actor_id INTO v_object, v_actor
  FROM crm_interaction ci WHERE ci.id = p_interaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interaction introuvable' USING ERRCODE = '22023'; END IF;

  -- Périmètre §61 : le journal suit la lisibilité de SON interaction. COALESCE(…, FALSE)
  -- obligatoire (§204) : les sondes passent par auth.*(), NULL hors contexte HTTP.
  v_ok := COALESCE(CASE
            WHEN v_object IS NOT NULL THEN api.user_can_read_crm(v_object)
            WHEN v_actor  IS NOT NULL THEN api.user_can_read_crm_actor(v_actor)
            ELSE api.current_user_can_write_crm_notes()
          END, FALSE);
  IF NOT v_ok THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;

  RETURN jsonb_build_object('events', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'from_status', e.from_status,
             'to_status',   e.to_status,
             'changed_at',  e.changed_at,
             'changed_by_label', api.crm_user_label(e.changed_by, p.display_name)
           ) ORDER BY e.changed_at ASC)
    FROM crm_interaction_status_event e
    LEFT JOIN app_user_profile p ON p.id = e.changed_by
    WHERE e.interaction_id = p_interaction_id
  ), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION api.list_crm_status_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_status_events(uuid) TO authenticated, service_role;
```

**(9) La garde 3 volets**, en fin de migration, dans un `DO $$` qui **échoue fort** :

```sql
DO $$
DECLARE v_bad text; v_n int;
BEGIN
  -- Volet 1a — 'planned' n'appartient à AUCUN autre vocabulaire : zéro tolérance,
  -- sauf save_crm_interaction (TOLERANCE-17g documentée).
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('api','public','crm')
    AND p.prosrc ~ '''planned'''
    AND p.proname <> 'save_crm_interaction';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Vocabulaire mort ''planned'' encore référencé par : % — corriger avant de continuer.', v_bad;
  END IF;

  -- Volet 1b — 'done' est partagé avec crm_task_status : on ne contrôle que les fonctions
  -- qui touchent crm_interaction SANS toucher crm_task. RÉSIDU ASSUMÉ : une fonction
  -- touchant les deux tables échappe à ce volet — couverte par le volet 3 (garde CI front)
  -- et par le fait que toutes les fonctions mixtes actuelles sont redéployées ici même.
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('api','public','crm')
    AND p.prosrc ILIKE '%crm_interaction%' AND p.prosrc NOT ILIKE '%crm_task%'
    AND p.prosrc ~ '''done'''
    AND p.proname <> 'save_crm_interaction';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Vocabulaire mort ''done'' (contexte interaction) encore référencé par : %', v_bad;
  END IF;

  -- Volet 1c — la tolérance existe tant que l'exclusion existe : si quelqu'un retire
  -- TOLERANCE-17g de save_crm_interaction sans retirer ces exclusions, on échoue ICI.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'save_crm_interaction'
    AND p.prosrc LIKE '%TOLERANCE-17g%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TOLERANCE-17g absente de save_crm_interaction : retirer AUSSI les exclusions des volets 1a/1b.';
  END IF;

  -- Volet 2 — les COMMENT ON FUNCTION (pg_description, invisibles de prosrc) : les deux
  -- commentaires qui citaient le prédicat mort doivent avoir été réécrits.
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_description d ON d.objoid = p.oid
  WHERE n.nspname IN ('api','public','crm')
    AND p.prosrc ILIKE '%crm_interaction%'
    AND d.description ~ '''(planned|done)''';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'COMMENT citant le vocabulaire mort sur : %', v_bad;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3 : Écrire `tests/test_crm_lifecycle.sql`** — transactionnel (`\set ON_ERROR_STOP on` / `BEGIN` / `ROLLBACK`), blocs :

- **(A) Vocabulaire** : `pg_enum` de `crm_status` = exactement les 6 valeurs, dans cet ordre ; plus aucune ligne `planned`/`done` (requête sur `status::text`).
- **(B) Invariant carte ↔ courbe, par exécution** (reprend la forme prouvée de `test_dashboard_crm_open` bloc E) : `PERFORM api.capture_metric_snapshots(current_date)` puis `ASSERT (api.get_dashboard_crm_open()->>'open_interactions')::numeric = (SELECT value FROM metric_snapshot WHERE metric_key='crm_backlog' AND scope='global' AND scope_key='' AND snapshot_date=current_date)`.
- **(C) Trigger** : insérer une interaction de test (persona minimal, comme `test_crm_interaction_status.sql` — statut explicite `new`), `ASSERT` 1 événement `(NULL → new)` ; passer à `awaiting_provider` puis `resolved`, `ASSERT` 3 événements dans l'ordre, `from_status`/`to_status` exacts ; un UPDATE **sans** changement de statut n'écrit **rien**.
- **(D) `resolved_at` — les 3 terminaux** : via `api.save_crm_interaction` (persona `write_crm_notes`), `resolved` pose la date ; retour à `in_progress` la remet à NULL ; `closed` la repose ; `canceled` idem.
- **(E) Tolérance** : `save_crm_interaction` avec `status:'done'` écrit `resolved` ; avec `'planned'` écrit `new`.
- **(F) Temps net sur cycle simulé** : sur l'interaction de (C), reculer artificiellement les `changed_at` du journal (`UPDATE crm_interaction_status_event SET changed_at = …` dans la transaction — le test est superuser) pour fabriquer `new(J0) → in_progress(J2) → awaiting_provider(J5) → in_progress(J12) → resolved(J14)` avec `occurred_at=J0`, `resolved_at=J14` ; `ASSERT` que le calcul net rend **7 jours** (14 écoulés − 7 d'attente). La requête de référence — la même que consommera la RPC d'activité, écrite ici en premier :

```sql
  -- DEUX niveaux obligatoires : la fenêtre LEAD se calcule AVANT tout filtre et tout
  -- agrégat (un SUM par-dessus un LEAD au même niveau est un ERREUR PostgreSQL, et
  -- fenêtrer après un WHERE to_status='awaiting_provider' perdrait la borne de fin
  -- du séjour — l'événement suivant, quel que soit son statut).
  WITH events AS (
    SELECT e.interaction_id, e.to_status, e.changed_at,
           LEAD(e.changed_at) OVER (PARTITION BY e.interaction_id ORDER BY e.changed_at) AS next_at
    FROM crm_interaction_status_event e
  ),
  waits AS (
    SELECT ev.interaction_id,
           SUM(EXTRACT(EPOCH FROM (COALESCE(ev.next_at, ci.resolved_at) - ev.changed_at)) / 86400.0)
             AS wait_days
    FROM events ev
    JOIN crm_interaction ci ON ci.id = ev.interaction_id
    WHERE ev.to_status = 'awaiting_provider'
    GROUP BY ev.interaction_id
  )
  SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0
         - COALESCE(w.wait_days, 0) AS net_days
  FROM crm_interaction ci
  LEFT JOIN waits w ON w.interaction_id = ci.id
  WHERE ci.id = <l'interaction de test>;
```
- **(G) Filtres traduits** : `list_crm_timeline(p_status:='active')` ne rend que des statuts ouverts ; `'done'` ne rend que la famille fermée.
- **(H) §204 sur `list_crm_status_events`** : EXECUTE révoqué de PUBLIC/anon, accordé à authenticated/service_role ; RLS activée sur la table, zéro policy, zéro GRANT applicatif.
- **(I) Rejeu d'audit idempotent** : compter les événements `from_status IS NOT NULL` antérieurs à la migration, rejouer le bloc (6), `ASSERT` compte inchangé.

- [ ] **Step 4 : Migrer les 6 fichiers de test existants** — aux lignes listées dans Files, `'planned'`→`'new'`, `'done'`→`'resolved'` **uniquement en contexte interaction** (les lignes exclues sont dites). Dans `test_crm_interaction_status.sql`, les commentaires qui expliquent la règle §220 sont mis à jour avec le vocabulaire traduit, la règle ne change pas.

- [ ] **Step 5 : `schema_unified.sql`** — l.225 : le `CREATE TYPE` du bloc gardé passe aux 6 valeurs ; l.3249 et l.3385 : `'done'` → `'resolved'` (⚠️ l.3268 `'todo'` et l.236 `crm_task_status` intouchés) ; après la définition de `crm_interaction`, ajouter la table journal + le trigger (mêmes corps que la migration). **Ces trois édits et la migration partent dans le même commit** — un `schema_unified` à 6 valeurs sans les triggers traduits donne un fresh apply vert dont le premier incident lève 22P02.

- [ ] **Step 6 : Câblage manifeste** — dans `ci_fresh_apply.sql`, après le bloc `17f-test` et avant le bloc final : `\echo '== 17g …'` + `\ir migration_crm_lifecycle.sql`, puis `\echo '== 17g-test …'` + `\ir tests/test_crm_lifecycle.sql` (forme et style des voisines 17e/17f — descriptions sans apostrophes). Dans `SQL_ROLLOUT_RUNBOOK.md`, entrée `17g` : les 3 pannes silencieuses chiffrées, la recréation du type, le journal + rejeu traduisant, la tolérance **avec son identifiant de retrait**, la garde 3 volets et son résidu assumé (volet 1b), l'ordre d'insertion (après 8z, 8z2, 16z, 17b, 17e, 17f — placée avant, son corps serait écrasé par le rejeu des anciennes définitions).

- [ ] **Step 7 : Auto-revue puis rapport.** Vérifier : aucune occurrence `'planned'`/`'done'` restante dans les fichiers touchés hors tolérance et hors contexte tâche (`grep -n "'planned'\|'done'"` sur chaque fichier, justifier chaque hit restant) ; aucun chiffre en dur ; `gen_random_uuid` partout ; pas de `rgba`. **Ne pas commiter.**

---

## Task 4 : A2 — Appliquer au live *(CONTRÔLEUR SEULEMENT)*

- [ ] **Step 1 : Fenêtre.** Vérifier l'heure du cron (`select * from cron.job`) — ne pas appliquer entre 02:50 et 03:10 (fuseau du cron) pour ne pas croiser l'écriture de `crm_backlog`.
- [ ] **Step 2 : Re-mesurer** les invariants du jour J (spec §10.11) : total interactions, ouvertes, `done` sans date, transitions d'audit. Noter les valeurs.
- [ ] **Step 3 : Gardes ROUGES avant.** `test_crm_lifecycle` bloc (A) doit échouer (`planned` encore présent) ; bloc (C) doit échouer (table absente).
- [ ] **Step 4 : Appliquer** `migration_crm_lifecycle.sql` via `apply_migration` (nom `crm_lifecycle`).
- [ ] **Step 5 : Test complet VERT** (blocs A→I adaptés à `execute_sql`, sans directives psql).
- [ ] **Step 6 : Sabotage de la garde** : en transaction annulée, redéfinir une fonction avec `'planned'` → le volet 1a doit lever ; retirer le marqueur TOLERANCE-17g → le volet 1c doit lever.
- [ ] **Step 7 : Invariants live** : `get_dashboard_crm_open()->open_interactions` = valeur d'avant (170 au 31/08) ; `capture_metric_snapshots(current_date)` puis égalité carte/courbe ; appeler les 7 fonctions (une par une, arguments minimaux) — aucune 22P02.
- [ ] **Step 8 : Recette applicative de la fenêtre** : le front (Tasks 1-2 déployées, vocabulaire ancien) doit fonctionner contre la base nouvelle — vérifier `saveCrmInteraction status:'done'` via la tolérance (déjà couvert par (E), confirmer une fois depuis l'app si disponible).
- [ ] **Step 9 : Commit** de tous les fichiers de la Task 3 :

```bash
git add "Base de donnée DLL et API/migration_crm_lifecycle.sql" "Base de donnée DLL et API/tests/" "Base de donnée DLL et API/schema_unified.sql" "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/migration_dashboard_crm_open.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "feat(crm): cycle de vie a six statuts, journal de transitions, garde anti-vocabulaire-mort"
```

---

## Task 5 : C-SQL — Les RPC de l'onglet Activité (fichiers seulement, application par le contrôleur en fin de tâche)

**Files:**
- Create: `Base de donnée DLL et API/migration_dashboard_activity.sql` (id manifeste suivant, pressenti `17h`)
- Create: `Base de donnée DLL et API/tests/test_dashboard_activity.sql`
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (fold des 3 contrats)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`
- Modify: `bertel-tourism-ui/src/types/dashboard.ts`, `src/services/dashboard-rpc.ts` (+ `.test.ts`)

**Interfaces — Produces:**

```ts
export interface DashboardTeamActivity {
  weeks: { week_start: string; editor_days: number; editors: number; objects_touched: number; created: number }[]; // 12, semaines vides à 0
  contributors: { user_id: string; display_name: string; active_days: number; objects_touched: number; bulk_days: number; first_at: string; last_at: string }[]; // tri active_days DESC
}
export interface DashboardCrmActivity {
  open_by_age: { bucket: 'lt_30d' | 'd30_90' | 'd90_1y' | 'gt_1y'; count: number }[];
  open_by_topic: { code: string | null; name: string; count: number; oldest: string }[]; // tri count DESC
  monthly_flow: { month: string; created: number; resolved: number }[]; // 12 mois
  net: { avg_days: number | null; count: number };  // null tant qu'aucune demande n'a bouclé son cycle
}
// get_dashboard_crm_open : + recent_interactions (ouvertes < 90 j), backlog_interactions (≥ 90 j).
// open_interactions, open_tasks, total CONSERVÉS — l'invariant carte↔courbe est dessus.
```

Getters `getDashboardTeamActivity()` / `getDashboardCrmActivity()` : sans paramètre (séries **globales**, comme `getDashboardCrmOpen` — mêmes raisons, même patron de test `jest.doMock` + `await import`).

**Règles métier verrouillées (spec §2, §4, arbitrages) :**
- Les deux fonctions **excluent `created_by IS NULL`** (58 % des versions : imports/système).
- `editor_days` = `count(DISTINCT (created_by, created_at::date))`. Semaines sans activité **émises à zéro** via `generate_series`, jamais omises.
- `bulk_days` = jours où un éditeur touche **≥ 10 objets** (constante `c_bulk_threshold` commentée : la distribution réelle est bimodale, ≤ 9 vs ≥ 58, spec §2 — si elle se remplit entre les deux, revoir).
- `display_name` : `COALESCE(p.display_name, split_part(u.email, '@', 1))` — jamais l'adresse entière (donnée de contact, pas identifiant d'affichage). Repli final : le début de l'uuid.
- `open_by_age` sur `occurred_at` ; statuts ouverts = **le prédicat mot pour mot** de `crm_backlog`.
- `monthly_flow` : `created` = `occurred_at` par mois (12 derniers), `resolved` = `resolved_at` par mois.
- **`net`** : sur les interactions dont le **premier événement de journal est la création** (`from_status IS NULL` — nées après la bascule), terminées `resolved` ou `closed` (**`canceled` exclu**). `net_days = extract(epoch from (resolved_at - occurred_at))/86400 − attente`, où `attente` = somme des intervalles `[changed_at du passage À awaiting_provider → changed_at de l'événement suivant]` (fenêtre `lead(changed_at) OVER (PARTITION BY interaction_id ORDER BY changed_at)`). Un séjour en attente non refermé au moment de la résolution se termine à `resolved_at`.
- Conventions : `STABLE SECURITY DEFINER`, search_path standard, pool **non filtré** (pas de `get_filtered_object_ids` — séries globales), REVOKE/GRANT §204, COMMENT disant pourquoi jours et pas volume, `NOTIFY pgrst`.

- [ ] **Step 1 : Test SQL d'abord** (`tests/test_dashboard_activity.sql`) : contrats de clés ; `weeks` fait exactement 12 entrées ; les fonctions ignorent une version `created_by NULL` insérée en transaction ; `bulk_days` bascule à 10 objets pile ; `recent + backlog = open_interactions` (invariant interne de la carte) ; `net` rejoue le cycle simulé de `test_crm_lifecycle` bloc (F) et rend 7. Garde §204 sur les deux fonctions.
- [ ] **Step 2 : Écrire la migration** avec les corps complets, fold, câblage `17h`/`17h-test`, entrée runbook.
- [ ] **Step 3 : Frontend** — types, deux getters (patron `dashboard-rpc.test.ts` : `jest.resetModules` + double `doMock` + `await import` ; mode démo ⇒ formes vides `{weeks:[],contributors:[]}` / âges à zéro, **pas de mock de données**), extension du type `DashboardCrmOpen` (+2 clés). TDD : tests des getters rouges puis verts.
- [ ] **Step 4 : *(CONTRÔLEUR)*** — garde rouge avant, `apply_migration` (`dashboard_activity`), test vert, vérif live (`weeks` = 12, contributeurs = 3 avec `bulk_days` = 5 pour le premier au 31/08), commit :

```bash
git add "Base de donnée DLL et API/migration_dashboard_activity.sql" "Base de donnée DLL et API/tests/test_dashboard_activity.sql" "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md bertel-tourism-ui/src/types/dashboard.ts bertel-tourism-ui/src/services/dashboard-rpc.ts bertel-tourism-ui/src/services/dashboard-rpc.test.ts
git commit -m "feat(dashboard): RPC activite equipe et activite CRM, carte recent/arriere"
```

---

## Task 6 : B — Le vocabulaire au front et le sélecteur à six états

**Files:**
- Create: `bertel-tourism-ui/src/features/crm/CrmStatusModal.tsx` + `CrmStatusModal.test.tsx`
- Create: `bertel-tourism-ui/src/features/crm/crm-status-vocabulary.guard.test.ts`
- Modify: `crm-primitives.tsx` (le bouton « Marquer traitée/Rouvrir » devient « Statut : {label} » → ouvre la modale)
- Modify: `CrmInteractionModal.tsx` (l.86-87, l.135, chips l.264-292)
- Modify: `CrmTaches.tsx:121`, `src/services/crm.ts:123` (+ `listCrmStatusEvents`), `src/data/mock.ts:446,454,455`
- Modify: les tests listés par la spec (S16) — fixtures **et commentaires** migrés ensemble
- Modify: `bertel-tourism-ui/src/styles.css` (styles de la modale)

**Interfaces — Consumes:** Task 1 (registre), Task 2 (`onChangeStatus`), Task 3-4 (`api.list_crm_status_events`).

**Comportement du sélecteur (maquette validée + contrainte a11y) :** la chip du statut vit dans `.tl-card__nav` qui porte `role="button"` — **aucun contrôle interactif ne peut y vivre**. Le contrôle vit dans `.tl-actions` : le bouton actuel « Marquer traitée / Rouvrir » devient un bouton `Statut : {interactionStatusLabel(status)}` qui ouvre `CrmStatusModal`. La modale : 6 boutons radio-chips (libellés du registre, `aria-pressed`), l'encart ambre quand `awaiting_provider` est le statut courant — « En attente du prestataire depuis le {date du dernier passage} — {N} jours. Ce temps est déduit du temps de traitement de l'équipe. Il continue de courir tant que le statut n'est pas changé. » (données de `listCrmStatusEvents` : dernier événement `to_status='awaiting_provider'`), un bouton « Enregistrer » qui appelle `onChangeStatus(rootId, choix)` puis ferme. Vues compactes, détail derrière un bouton — préférence produit constante.

- [ ] **Step 1 (TDD modale)** : tests de `CrmStatusModal` — rend les 6 libellés ; le statut courant est `aria-pressed` ; l'encart d'attente n'apparaît que si le courant est `awaiting_provider` et affiche « N jours » depuis la date fournie ; « Enregistrer » appelle `onChangeStatus` avec le choix puis `onClose` ; désactivé (`canWrite === false`) → boutons désactivés avec la raison. Rouge, puis implémentation, puis vert.
- [ ] **Step 2 : Écritures traduites** — substitutions verbatim :
  - `CrmInteractionModal.tsx:86` `useState<'planned' | 'done'>('done')` → `useState<'new' | 'resolved'>('resolved')` ; l.87 `: 'planned' | 'done' = statusTouched ? statusChoice : topicCode ? 'planned' : 'done'` → `: 'new' | 'resolved' = statusTouched ? statusChoice : topicCode ? 'new' : 'resolved'` ; les comparaisons `effectiveStatus === 'planned'` des chips (l.266, 267, 270, 288) → `=== 'new'`. **Libellés « À traiter » / « Déjà traitée » inchangés** — la création reste à deux positions (spec §6.6), le cycle fin passe par le sélecteur.
  - `CrmTaches.tsx:121` `saveCrmInteraction({ id: interactionId, status: 'done' })` → `status: 'resolved'` (arbitrage n°1 ; commentaire au-dessus mis à jour).
  - `crm.ts:123` `readString(record.status) || 'done'` → `|| 'resolved'`.
  - `crm-primitives.tsx` `toggleResolve` : les valeurs `'planned'`/`'done'` de la Task 2 disparaissent avec le bouton (remplacé par la modale).
  - `mock.ts:446` `relatedInteractionStatus: 'planned'` → `'new'` ; l.454 `status: 'planned'` → `'new'` ; l.455 `status: 'done'` → `'resolved'`. ⚠️ l.446 porte aussi `status: 'todo'` — c'est la **tâche**, intouchée.
- [ ] **Step 3 : `listCrmStatusEvents`** dans `crm.ts` (RPC `list_crm_status_events`, patron des autres getters CRM) + branchement dans la modale via `useQuery` (`enabled` à l'ouverture seulement).
- [ ] **Step 4 : Le balayage des tests et des commentaires** (liste S16 de la spec — `crm-primitives.test.tsx`, `crm.test.ts`, `CrmTaches.test.tsx` (seulement `relatedInteractionStatus` — les `status` de tâches ne bougent pas), `CrmObjectView/CrmActorFiche/CrmInteractionModal/CrmPage/SectionCrm.test`) : fixture **et commentaire** migrent ensemble. ⚠️ Libellés : `new` rend « En attente de traitement » — l'ancien « En attente » ne vaut que pour `planned` ; les assertions suivent le registre. **Balayer aussi les commentaires du code de production qui citent l'ancien vocabulaire entre apostrophes** (la garde du Step 5 les détecte) : `src/types/domain.ts:608` (`null = en attente (statut 'planned')` → `null = demande ouverte (statuts new/in_progress/awaiting_provider)`) et toute occurrence restante trouvée par `grep -rn "'planned'" src/` — chaque hit restant doit être `crm-status.ts` ou le fichier de garde, rien d'autre.
- [ ] **Step 5 : Le volet 3 de la garde** — `crm-status-vocabulary.guard.test.ts` : balaie récursivement `src/**/*.{ts,tsx}` (fs, comme la garde `rgba` existante — s'en inspirer) et échoue si `/['"]planned['"]/` apparaît hors de `crm-status.ts` (les deux entrées legacy documentées) et de ce fichier de garde. Le test est prouvé rouge en réintroduisant temporairement `'planned'` dans un fichier.
- [ ] **Step 6 : Suites, typecheck (10), commit**

```bash
npx jest src/features/crm src/views/CrmPage.test.tsx src/features/object-editor/sections/SectionCrm.test.tsx && npx jest src/services/crm.test.ts
git add bertel-tourism-ui/src
git commit -m "feat(crm): selecteur de statut a six etats et vocabulaire du cycle de vie"
```

---

## Task 7 : C-front — Les widgets de l'onglet Activité

**Files:**
- Create: `src/components/dashboard/ActivityRhythmChart.tsx` (+ test) — barres jours-éditeur + ligne créations, SVG maison (modelé sur `TimeseriesChart` : axes adaptatifs, `role="img"`, état vide)
- Create: `src/components/dashboard/ContributorsTable.tsx` (+ test)
- Create: `src/components/dashboard/CrmBacklogWidget.tsx` (+ test) — âges (4 barres) + sujets (liste, plus ancienne datée)
- Create: `src/components/dashboard/CrmFlowWidget.tsx` (+ test) — deux `TimeseriesChart` (créées / traitées) ; **état vide explicatif** quand tout est à zéro : « Aucune demande créée ni traitée sur les 12 derniers mois. Les demandes historiques viennent d'un import arrêté en avril 2026 ; ce widget se remplit avec l'usage. »
- Create: `src/components/dashboard/NetTimeWidget.tsx` (+ test) — la moyenne quand `net.count > 0`, sinon la barre d'exemple pédagogique de la maquette (écoulé − attente = net) avec « La moyenne s'affichera dès la première demande résolue. »
- Modify: `ScorecardStrip.tsx` + son test — la carte passe à « {recent_interactions + open_tasks} demandes récentes · {recent_interactions} de moins de 90 jours, {open_tasks} tâches à faire · + {backlog_interactions} en attente depuis plus de 90 jours » ; l'état neutre (`crmOpen === undefined` → « — · Indisponible ») **est conservé tel quel**.
- Modify: `DashboardPage.tsx` — l'onglet Activité assemble : ActivityRhythm, Contributors, (Backlog + Flow en `dashboard-kpi__row`), NetTime, la courbe `crm_backlog` existante ; le placeholder « Suivi d'activité » **est supprimé** ; requêtes via `useQuery` clés `['dashboard','team-activity']` / `['dashboard','crm-activity']` **sans `params`** (globales — même raisonnement et même commentaire que `crm-open`), gated `enabled={activeTab === 'activity'}`.
- Modify: `styles.css` — classes des widgets (reprendre les recettes de la maquette : `.agerow`, `.topic`, barres ; adapter aux tokens réels, jamais de couleurs de maquette en dur là où un token existe).

**Contraintes :**
- Chaque widget dans `WidgetFrame` (`isPending && enabled`, erreur + retry, vide honnête).
- **Les notes de méthode sont des exigences** : ActivityRhythm porte « Pourquoi des jours et non des fiches » (texte de la maquette) et « Les opérations système sont exclues » ; Contributors porte la mention « dont N passes en masse » (pastille) et le classement par jours actifs ; chacune testée par un `getByText`.
- Accords singulier/pluriel sur tous les compteurs ; `Intl.NumberFormat('fr-FR')`.

- [ ] **Step 1** : TDD widget par widget (rouge → vert), fixtures = les données réelles du 31/08 (semaines 1,1,2,2,3,4,3,6,5,3 ; contributeurs DP 17j/486/5 bulk, CM 12j/6, ML 1j/1 ; âges 3/0/24/143 ; sujets signalétique 123…).
- [ ] **Step 2** : assemblage `DashboardPage`, mise à jour de `DashboardPage.test.tsx` (mocks des deux nouveaux getters — le patron `getDashboardCrmOpen` de la revue précédente : mock **présent dans la fabrique**, valeurs discriminantes).
- [ ] **Step 3** : suite dashboard + explorer verte, tsc = 10, commit `feat(dashboard): onglet Activite equipe — rythme, contributeurs, arriere CRM, temps net`.

---

## Task 8 : Recette et consignation

- [ ] **Step 1 *(CONTRÔLEUR)*** : recette navigateur (mode démo pour l'UI ; les chiffres réels sur session authentifiée restent au PO) : sélecteur 6 états ouvre/enregistre ; encart attente visible sur une demande `awaiting_provider` ; onglet Activité rend ses 5 blocs avec leurs notes de méthode ; carte du bandeau au format récent/arriéré ; kanban : passer une tâche liée en « Terminées » propose la clôture et écrit `resolved`.
- [ ] **Step 2** : vérifier l'invariant final en base : carte = courbe = `capture` ; `recent + backlog = open_interactions`.
- [ ] **Step 3** : cocher l'axe C dans `docs/audits/2026-08-30-dashboard-audit-propositions.md`, consigner (§ du journal local + mémoire), commit `docs(dashboard): consigner la livraison de l'onglet Activite et du cycle de vie CRM`.

---

## Hors périmètre (rappel spec §11)

Temps de première réponse (`first_response_at` vide partout) · backfill du net sur l'importé (§218) · tri métier des 143 demandes anciennes · `display_name` manquants · collision `17c` du manifeste · retrait de TOLERANCE-17g (migration dédiée future, identifiant posé au manifeste par la Task 3).
