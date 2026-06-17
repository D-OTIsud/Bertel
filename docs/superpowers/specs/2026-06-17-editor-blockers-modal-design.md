# Design — Modal explicatif des blocages d'enregistrement / publication

**Date:** 2026-06-17
**Surface:** Éditeur de fiche pleine page (`/objects/[id]/edit`, `ObjectEditPage` → `EditorReady`)
**Portée:** Frontend uniquement. Aucune modification SQL/API/serveur. Aucune modification des règles de validation existantes.

---

## 1. Problème

Quand un **enregistrement** ou une **publication** est empêché(e) dans l'éditeur, l'utilisateur n'a aucune explication claire et actionnable :

- Le bouton **« Publier »** est *désactivé* dès qu'il y a un blocage (`publishDisabled = validation.blockers.length > 0`). C'est un cul-de-sac : impossible de cliquer pour découvrir *pourquoi*.
- `handlePublish` se contente de poser un `statusMessage` laconique (« N blocage(s) empêchent la publication. ») et de scroller vers le premier blocage.
- Les échecs d'enregistrement (`persistDirtyModules`) n'affichent que le **premier** message (« N section(s) en échec : <message> ») ou un comptage (« … bloquée(s). »).
- L'information complète (« quelle info, quelle section, pourquoi ») existe déjà dans `validateForPublication`, mais elle n'est exposée que dans l'`IssuesRail` du rail de droite — facile à manquer, parfois hors écran.

L'utilisateur veut un **modal explicatif** qui, à la tentative d'action bloquée, liste *quelle information, dans quelle section, bloque, et pourquoi*.

## 2. Décisions actées (brainstorming 2026-06-17)

1. **Déclencheur :** le bouton « Publier » redevient cliquable même avec des blocages ; un clic ouvre le modal explicatif au lieu de publier. La pastille « N blocages » de la barre est elle aussi cliquable. (Supprime le bouton désactivé sans issue ; meilleure pratique a11y.)
2. **Contenu du modal :** blocages groupés par section (champ obligatoire + erreurs d'enregistrement/permission) avec la raison et un bouton « Aller à la section », **puis** les alertes non bloquantes listées à part en bas.

## 3. Modèle de données

Tout se ramène au type existant `Issue { section: string; message: string; tone: 'req' | 'warn' }` (de `editor-validation.ts`). Trois sources :

| Groupe | Source | tone | Section |
|--------|--------|------|---------|
| **A — Champs requis (pré-publication)** | `validation.blockers` (déjà calculé, réactif via `useMemo`) | `req` | num de section réel (`01`…`22`) |
| **B — Erreurs d'enregistrement** | résultat de `save()` : `failed: {module, message}[]` + `blocked: {module, reason}[]`, et l'erreur éventuelle du RPC `publishObject` | `req` | clé par **module** (pas de section réelle) → groupe propre avec libellé module |
| **C — Alertes non bloquantes** | `validation.warnings` | `warn` | num de section réel |

`characteristics` (et quelques autres modules) couvre plusieurs sections : on **n'invente pas** de fausse section pour le groupe B. Les erreurs d'enregistrement sont affichées avec le **nom humain du module** dans un groupe dédié « Erreurs d'enregistrement ».

## 4. Composants & fichiers

### 4.1 NOUVEAU — `widgets/BlockersModal.tsx` (+ `BlockersModal.test.tsx`)

```ts
interface BlockersModalProps {
  open: boolean;
  onClose: () => void;
  context: 'publish' | 'save';
  requiredBlockers: Issue[];   // groupe A
  saveErrors: Issue[];         // groupe B (section = libellé module)
  warnings: Issue[];           // groupe C
  sectionLabels: Record<string, string>;  // num → libellé (ex. '02' → 'Localisation')
  onGoToSection: (num: string) => void;
}
```

- Construit sur le primitive `Dialog` (`components/ui/dialog`), comme `EditorModal`/`ConfirmDialog`.
- Titre selon `context` : `'publish'` → **« Publication impossible »**, `'save'` → **« Enregistrement incomplet »**.
- Une intro courte rappelant l'action à mener.
- **Groupe A + C** : un en-tête par section (`Section 02 — Localisation`), chaque ligne réutilise le style `.issue` existant (cohérent avec `IssuesRail`) : pastille de ton + message + bouton « Aller à la section ».
- **Groupe B** : en-tête « Erreurs d'enregistrement », chaque ligne = libellé module + raison (pas de jump si la section n'est pas résolvable).
- **Groupe C** : séparé visuellement sous un sous-titre « Alertes non bloquantes ».
- `onGoToSection(num)` → appelle le callback puis ferme le modal.
- Footer : un bouton « Fermer ».
- États vides : si une catégorie est vide, son bloc n'est pas rendu.

### 4.2 NOUVEAU — `save-issues.ts` (helpers purs, + `save-issues.test.ts`)

- `saveResultToIssues(result: EditorSaveResult): Issue[]` — convertit `failed`/`blocked` en `Issue[]` (tone `'req'`, `section` = libellé module via `MODULE_LABEL`).
- `groupIssuesBySection(issues: Issue[], sectionLabels): { num: string; label: string; issues: Issue[] }[]` — pour l'affichage groupé et ordonné.
- `MODULE_LABEL: Record<WorkspaceModuleId, string>` — nom humain par module (couverture testée : chaque `WorkspaceModuleId` a un libellé).

### 4.3 `ObjectEditPage.tsx` (`EditorReady`)

- Nouveaux états : `blockersModalOpen: boolean`, `modalContext: 'publish' | 'save'`, `saveErrors: Issue[]`.
- `sectionLabels` dérivé de `navItems` (déjà calculé) : `Record<num, label>`.
- `handlePublish` :
  - si `validation.blockers.length > 0` → `setSaveErrors([])`, `setModalContext('publish')`, `setBlockersModalOpen(true)` (plus de scroll auto). On garde un `statusMessage` court.
  - sinon → persiste ; si la persistance renvoie des erreurs → `saveErrors` peuplé + `modalContext('save')` + ouvre le modal ; sinon publie ; erreur RPC publish → `saveErrors=[issue]` + modal `save`.
- `persistDirtyModules` : renvoie désormais un résultat structuré (ou peuple `saveErrors`) pour que l'appelant décide d'ouvrir le modal. Sur `failed`/`blocked` : `saveErrors` peuplé via `saveResultToIssues`. Conserve le `statusMessage` court dans la barre.
- `handleSaveDraft` : sur erreurs → ouvre le modal (`context:'save'`).
- Rend `<BlockersModal … onGoToSection={(num) => { scrollToSection(num); setBlockersModalOpen(false); }} />`.

### 4.4 `shell/EditorTopbar.tsx` (+ mise à jour de `EditorTopbar.test.tsx`)

- « Publier » : retirer la désactivation basée sur les blocages. Reste désactivé uniquement pendant `publishing`/`saving`.
- Pastille `edit-top__validation` → `<button type="button">` cliquable lorsqu'il y a des blocages ou alertes → nouvelle prop optionnelle `onShowBlockers?: () => void`.
- Le contrat `publishDisabled` reste sur le type mais n'est plus alimenté par les blocages côté page (peut être retiré si plus aucun usage).

### 4.5 CSS — `object-editor.css`

Styles de liste du modal : en-têtes de groupe par section, séparateur « Alertes non bloquantes », réutilisation/extension de `.issue`. Pas de palette ad hoc — tokens maison existants.

## 5. Flux

```
Clic « Publier »
  ├─ blockers > 0 → modal (context: 'publish'), groupe A + (C)
  └─ sinon → persistDirtyModules()
        ├─ failed/blocked → modal (context: 'save'), groupe B + (A si pertinents) + (C)
        └─ ok → publishObject.mutateAsync(true)
              ├─ throw → modal (context: 'save'), groupe B [erreur RPC]
              └─ ok → statusMessage « Fiche enregistrée et publiée. »

Clic « Enregistrer » (brouillon) → persistDirtyModules()
  ├─ failed/blocked → modal (context: 'save')
  └─ ok → statusMessage « Brouillon enregistré. »

Clic pastille « N blocages » → modal (context: 'publish'), état courant de validation
```

## 6. Tests (TDD)

- **Purs** (`save-issues.test.ts`) : `saveResultToIssues` (failed + blocked + vide) ; `groupIssuesBySection` (ordre, regroupement, sections inconnues) ; couverture exhaustive de `MODULE_LABEL`.
- **`BlockersModal.test.tsx`** : rend les blocages groupés par section avec le bon libellé ; rend le groupe « Erreurs d'enregistrement » ; rend les alertes séparément ; « Aller à la section » appelle `onGoToSection` puis ferme ; titre dépend du `context` ; blocs vides non rendus.
- **`EditorTopbar.test.tsx`** : « Publier » cliquable avec blocages ; clic sur la pastille appelle `onShowBlockers` ; clic « Publier » appelle `onPublish`.

## 7. Hors-scope

- Les **règles de validation** elles-mêmes (`VALIDATION_RULES`) — inchangées.
- L'`IssuesRail` du rail de droite — conservé tel quel ; le modal le complète, ne le remplace pas.
- Toute logique serveur / SQL / RPC.
- Un éventuel module→section mapping complet (rejeté : `characteristics` est multi-section ; on n'invente pas de section pour le groupe B).

## 8. Invariants respectés

- **« Editor — no silent write-traps »** : ce changement *renforce* l'invariant — au lieu d'échouer silencieusement, le blocage est expliqué bruyamment et de façon actionnable.
- Frontend-only, réversible, suit les patterns modal existants (`Dialog`, `EditorModal`, `ConfirmDialog`) et le type `Issue` existant — pas de système parallèle.
