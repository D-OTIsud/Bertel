# Spec — §19 « Suivi prestataire (CRM) » : KPIs + tiroir reprenant la vraie section CRM

- **Date** : 2026-06-16
- **Auteur** : conseil de sage (4 reconnaissances + 4 sages + critique adversariale + synthèse) ; affirmations porteuses re-vérifiées sur le code réel.
- **Statut** : conception validée (3 arbitrages PO tranchés) — en attente de relecture avant plan d'implémentation.

---

## 1. Problème / intention

En **mode édité** (`/objects/[id]/edit`), la section §19 « Suivi prestataire (CRM) » affiche aujourd'hui un **tableau « repeater »** d'interactions + deux formulaires inline (interaction / tâche). Le PO veut :

1. Que §19 ne montre plus le tableau — **seulement une synthèse (KPIs)**.
2. Un **bouton ouvrant un tiroir** (comme l'aperçu fiche de l'explorer).
3. Dans le tiroir, **la VRAIE section CRM** : une **liste des acteurs** liés → **clic sur un acteur → ses interactions** (timeline/fiche).
4. **La fidélité visuelle à la vraie section CRM prime** sur l'affichage actuel.

Verbatim PO : « il faut que l'affichage corresponde à la vraie section CRM, et pas à l'affichage actuel ».

---

## 2. Approche retenue — « fidélité verbatim + garde-fous »

On **réutilise tels quels** les composants de la page `/crm` (zéro réimplémentation, donc zéro divergence d'affichage possible) :

- **`CrmObjectView`** = vue établissement = `hero objet + rail « Acteurs liés » cliquable + timeline` → c'est exactement la « liste des acteurs » demandée (#3).
- **`CrmActorFiche`** = fiche acteur 360° (timeline + carte acteur + KPI + modals) → c'est exactement « les interactions de l'acteur » (#3).

§19 devient une **carte de synthèse + 1 bouton** qui monte ces vues dans un **tiroir latéral local**.

### Pourquoi pas une réimplémentation
La seule façon d'obtenir littéralement « la vraie section CRM » (#4) est de monter les vues `/crm` verbatim ; c'est aussi le coût en code neuf le plus faible.

---

## 3. Faits porteurs vérifiés sur le code réel

| # | Fait | Preuve | Conséquence design |
|---|------|--------|--------------------|
| F1 | **Tout le CSS CRM est scopé sous `.crm-app`** ; `CrmModal` rend `.crm-modal-overlay` **inline, sans `createPortal`**. | `styles.css:8557` (« Tout est scopé sous `.crm-app` ») ; `CrmModal.tsx:59-66` | Le contenu du tiroir **DOIT** être enveloppé dans `<div className="crm-app">`, sinon vues **et 4 sous-modals** non stylés / sans overlay → annule #4. **MUST-FIX.** |
| F2 | Le gate d'écriture §19 est **per-objet** : `permissions.crm.canDirectWrite = directWrite \|\| user_can_write_crm` ; le helper global `userCanWriteCrmNotes()` est **explicitement interdit ici**. | `object-workspace.ts:116`, `:3400-3402`, `:3520-3523` | Passer `canWrite = permissions.crm.canDirectWrite` aux vues. Le gate page-wide créerait un **write-trap** (contrôle actif → 42501 au save, viole CLAUDE.md §61). |
| F3 | §19 lit `editor.draft.providerFollowUp` ; `refreshCrm` réinjecte via `replaceModule` (module **READONLY** pour la save bar). | `SectionCrm.tsx:104-117` | Resync des KPIs après écriture **sans** faux dirty / sans solliciter la save bar globale. |
| F4 | Les vues `/crm` s'auto-alimentent via TanStack Query (`['crm-object',id]`, `['crm-actor',id]`) sur RPCs DEFINER ; `QueryClientProvider` est global. | `CrmObjectView.tsx:33-37`, `CrmActorFiche.tsx:292-293` | Le tiroir réutilise ce cache propre ; aucune nouvelle couche service. |
| F5 | Les grilles 2-colonnes CRM s'effondrent sur **breakpoint VIEWPORT** (`.crm-fgrid` ≤1180px, `.crm-actor-grid` ≤960px), **pas conteneur** (aucune container-query). | `styles.css` (≈`:10097`, `:10156`) | Tiroir **`max-w-[1180px]`** (= aperçu fiche) pour garder les 2 colonnes. |

---

## 4. Arbitrages PO (tranchés)

| Question | Décision | Impact design |
|----------|----------|---------------|
| Rebond vers un autre établissement depuis la fiche acteur (dans le tiroir) | **Rester ancré** sur l'établissement édité | Machine de nav réduite à `actorId: string \| null` ; pas de `originActorId`/`secondaryObjectId`. `onOpenObject` ne quitte jamais l'objet ancre. |
| Contenu de §19 réduit | **Garder** chips sujets + rappel notes internes (synthèse), en plus des 4 KPIs | §19 = KPIs + chips + notes + bouton. Seuls le repeater + formulaires inline partent. |
| Bouton « Nouvelle tâche » au niveau objet dans le tiroir | **Non** — suffisant via fiche acteur / kanban `/crm` | Pas de composer tâche objet-seul. (La création tâche existe dans `CrmActorFiche`.) |

Tranchés par défaut (non posés, sans alternative raisonnable) :
- **Gate** = per-objet `canDirectWrite` (seul choix anti-write-trap, F2).
- **Largeur** = `1180px` (F5).

---

## 5. Conception détaillée

### 5.1 §19 — `SectionCrm.tsx` (modifier)

**Conservé** : lecture `followUp = editor.draft.providerFollowUp` ; calcul KPIs (`last12Months`, `lastContact`, total, `topics.length`, `SectionCrm.tsx:97-102`) ; les 4 `StatCard` ; pastille `pill` ; bandeau « Lecture seule » + raison ; chips de distribution de sujets ; rappel read-only des notes internes (lu aussi par `buildHistoryItems` `ObjectEditPage.tsx:117-123` et le score de complétion `editor-completion.ts:143/253` — **ne pas retirer `notes` du module**) ; fonction `refreshCrm()`.

**Retiré** : repeater « Journal d'interactions » (`:237-284`) ; formulaires inline interaction (`:292-339`) et tâche (`:341-363`) ; boutons « + Nouvelle interaction / + Créer une tâche » (`:366-394`) ; états/handlers d'écriture (`form`, `taskForm`, `taskConfirmation`, `actionError`, `busy`, `topicOptions`, `submitInteraction`, `removeInteraction`, `submitTask`, `startEdit`, `ensureTopicVocabulary`, `EMPTY_FORM`) ; imports devenus inutiles (`Input`, `Select`, `Textarea`, `saveCrmInteraction`, `saveCrmTask`, `deleteCrmInteraction`, `listDemandTopics`, `INTERACTION_TYPE_OPTIONS`, `TYPE_LABEL`, `SENTIMENT_OPTIONS`). Conserver l'import `listObjectCrm` (utilisé par `refreshCrm`).

**Ajouté** : `useState drawerOpen` ; bouton « Ouvrir le suivi CRM » (style maison `.rep-add`, pastille de comptage à droite, désactivé avec raison si `objectId` absent) ; montage conditionnel :

```
<EditorCrmDrawer
  objectId={objectId}
  canWrite={access?.canDirectWrite ?? false}
  readOnlyReason={access?.disabledReason}
  open={drawerOpen}
  onClose={() => { setDrawerOpen(false); void refreshCrm(); }}
  onAfterWrite={() => void refreshCrm()}
/>
```

Net : ~410 → ~130-150 lignes, quasi-présentationnel. Registre `'19'` inchangé (`section-registry.tsx:59`), `section-types` inchangé.

### 5.2 `EditorCrmDrawer.tsx` (créer — `features/object-editor/widgets/`)

Coquille **Sheet** clonée d'`ObjectDrawer.tsx` (NE réutilise PAS `ObjectDrawerShell`, trop lourd : `useObjectWorkspaceQuery` + `usePresenceRoom`) :

- `<Sheet open onOpenChange→onClose>` + `<SheetContent side='right' showClose={false} className='drawer-panel w-full max-w-[1180px] overflow-hidden border-0 p-0'>` + `<SheetTitle className='sr-only'>` + `<SheetDescription className='sr-only'>` (exigés par Radix).
- **À l'intérieur : `<div className="crm-app">` (MUST-FIX F1)** englobant un header maison léger (`.drawer-header` : titre « Suivi CRM » + bouton fermer `.drawer-header__icon-btn--plain` → `onClose`) au-dessus de `<CrmEstablishmentPanel>`.
- Props : `{ objectId, canWrite, readOnlyReason?, open, onClose, onAfterWrite }`.

### 5.3 `CrmEstablishmentPanel.tsx` (créer — `features/crm/`)

Shell de nav **autonome** (state local React, **sans** localStorage, route, ni `useUiStore`). Ancré sur un objet.

```
const [actorId, setActorId] = useState<string | null>(null);
// null  → CrmObjectView (vue établissement, par défaut)
// set   → CrmActorFiche (sous-vue GLISSÉE, remplacement du contenu — PAS Sheet-dans-Sheet)
```

Câblage (nav 100% locale — **jamais** de `router.push` ni `Link` vers `/crm` ou `/objects/:id/edit`) :

| Callback | Comportement |
|----------|--------------|
| `CrmObjectView.onOpenActor(aid)` | `setActorId(aid)` (→ fiche acteur) |
| `CrmObjectView.onBack` | `onClose()` (l'objet est la racine du tiroir) |
| `CrmActorFiche.onBack` | `setActorId(null)` (→ retour vue établissement ancre) |
| `CrmActorFiche.onOpenObject(oid)` | **Ancrage** : `setActorId(null)` (retour à l'établissement édité ; on ne déroule jamais un autre objet) |

Props : `{ objectId, canWrite, readOnlyReason?, onAfterWrite }`. Les deux vues reçoivent `canWrite={canWrite}` ; `onAfterWrite` remonte vers `SectionCrm.refreshCrm` après chaque écriture confirmée.

> Note d'ancrage : la liste « Établissements & rôles » de `CrmActorFiche` reste informative ; cliquer un établissement (même un autre) ramène à la vue de l'établissement édité. À surveiller en revue UX (un libellé « Établissements de l'acteur (lecture) » peut clarifier) — mais hors scope tant que le PO veut l'ancrage strict.

### 5.4 `CrmObjectView.tsx` (modifier — surface partagée, défauts inchangés)

- Ajouter prop optionnelle **`hideOpenEditor?: boolean`** (défaut `false`) masquant le `<Link href={/objects/:id/edit}>` « Ouvrir dans l'éditeur » (`:150-152`) — circulaire depuis l'éditeur.
- (Optionnel) props `objectName?`/`objectType?` pour court-circuiter le fetch `listCrmDirectory` (`:40-49`) qui ne sert qu'à résoudre nom+type (l'éditeur les connaît via `draft.generalInfo`). **Différable** (optimisation, ~61 ms).
- Mettre à jour le commentaire d'en-tête : « gate fourni par l'hôte (page-wide sur `/crm`, per-objet dans le tiroir éditeur) ».

### 5.5 `CrmActorFiche.tsx` (modifier — surface partagée, défauts inchangés)

- Ajouter prop optionnelle **`backLabel?: string`** (défaut `'Annuaire des acteurs'`) ; remplacer les libellés hard-codés (`:377`, `:398`). Depuis le tiroir : `'Retour à l'établissement'`.
- Mettre à jour le commentaire d'en-tête (gate fourni par l'hôte).

> Vérifié : `CrmActorFiche` n'a **pas** de prop `backLabel` aujourd'hui.

---

## 6. Données & autorisation

- **Source dans le tiroir** : cache TanStack propre des vues via RPCs DEFINER (`listObjectCrm` / `listActorCrm` / `listDemandTopics`) — **jamais** `client.from('crm_*')`. `QueryClientProvider` global ⇒ OK sur la route éditeur.
- **Double source** assumée : §19 lit `draft.providerFollowUp` (KPIs), le tiroir lit `['crm-object',id]`. **Resync** : `onAfterWrite` → `SectionCrm.refreshCrm()` (= `listObjectCrm` + `replaceModule`) après chaque écriture, **et** au close (filet). `replaceModule`, **pas** `updateModule` (module READONLY → pas de dirty fantôme, F3).
- **Gate** : `canWrite = permissions.crm.canDirectWrite` (F2). `canWrite=false` ⇒ contrôles désactivés avec `CRM_READ_ONLY_REASON` (no-write-trap natif des vues).
- **Ancrage interaction** : `chk_crm_interaction_anchor` satisfait par le composer objet-fixé (`fixedContext.objectId`) sans acteur obligatoire.
- **Divergence de gate à documenter** : sur `/crm` le même composant reçoit `canWrite` du gate page-wide ; dans le tiroir, du gate per-objet. C'est volontaire (per-objet est le seul prédicat anti-write-trap).

---

## 7. Risques & mitigations

| Risque | Mitigation |
|--------|-----------|
| `.crm-app` manquant → vues + sous-modals non stylés/sans overlay (F1) | Wrapper obligatoire + **test RTL** assertant l'ancêtre `.crm-app` (sinon invisible aux tests mockés). |
| Tiroir trop étroit → débordement des grilles 2-colonnes (F5) | `max-w-[1180px]`. |
| KPIs §19 périmés après écriture | `onAfterWrite` + `refreshCrm` au close (F3). |
| Empilement focus-trap (CrmModal au-dessus du Sheet) | `CrmModal` Escape fait `stopPropagation` + `onClose` (`CrmModal.tsx:37-40`) ; sous-vue acteur = remplacement glissé (un seul Radix Dialog). Test : Escape ferme le modal, pas le tiroir. |
| Collision avec l'aperçu fiche (drawer global mono-slot) | Tiroir CRM monté en **`useState` local**, pas via `useUiStore`. |
| Requêtes redondantes (`listObjectCrm` + `listCrmDirectory`) | ~61 ms, cache partagé /crm ⇒ acceptable ; optim props `objectName/objectType` différable. |

---

## 8. Plan d'implémentation (TDD, incrémental)

- **Phase 0** — Props partagées non bloquantes : `hideOpenEditor` (`CrmObjectView`), `backLabel` (`CrmActorFiche`) + commentaires d'en-tête. Vérifier non-régression `/crm` (Jest).
- **Phase 1** — `CrmEstablishmentPanel` (nav locale ancrée `actorId null⇄set`, sous-vue glissée, propagation `canWrite`/`onAfterWrite`) + spec (vues mockées). RED→GREEN.
- **Phase 2** — `EditorCrmDrawer` (coquille Sheet + `<div className="crm-app">` + header maison) montant le panel + spec (assert `.crm-app`, no-write-trap, `onClose`, `onAfterWrite`). RED→GREEN.
- **Phase 3** — Refonte §19 : réécrire `SectionCrm.test.tsx` (RED), puis alléger `SectionCrm` (GREEN). Retirer le code d'écriture mort.
- **Phase 4** — Vérif : suite Jest complète verte, `tsc --noEmit` propre, lint propre, vérification navigateur (fidélité visuelle ; sous-modal stylé ; Escape ferme le modal pas le tiroir ; 1180px). Non-régression `/crm`. Mettre à jour `lot1_mapping_decisions.md` (décision : §19 KPIs + tiroir CRM verbatim ; invariant `.crm-app` pour monter les vues CRM hors `/crm` ; gate per-objet fourni par l'hôte) puis rafraîchir la mémoire MCP.

### Plan de test
- `SectionCrm.test.tsx` : 4 StatCards + chips + notes rendus depuis fixture `providerFollowUp` ; bouton « Ouvrir le suivi CRM » présent ; désactivé si `objectId` absent ; bandeau lecture-seule quand `canDirectWrite=false` ; clic ouvre le tiroir (mock `EditorCrmDrawer`). Retirer tests repeater/formulaires/cold-start.
- `CrmEstablishmentPanel.test.tsx` (vues mockées) : vue objet par défaut ; clic acteur → vue acteur ; retour ; `onOpenObject` reste ancré (asserté, pas de `router.push`) ; propagation `canWrite`/`onAfterWrite`.
- `EditorCrmDrawer.test.tsx` : contenu sous ancêtre `.crm-app` ; `CrmObjectView` par défaut ; `canWrite=false` → contrôles désactivés avec raison ; Escape/X/overlay → `onClose` ; `onAfterWrite` après écriture simulée.
- Intégration légère : écriture dans le tiroir → `onAfterWrite` → `SectionCrm.refreshCrm` appelé (KPIs resync).
- Non-régression `/crm` (props optionnelles, défauts inchangés).

---

## 9. Fichiers touchés

| Fichier | Action |
|---------|--------|
| `bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.tsx` | modify (allègement + bouton + tiroir) |
| `bertel-tourism-ui/src/features/object-editor/widgets/EditorCrmDrawer.tsx` | create (coquille Sheet + `.crm-app`) |
| `bertel-tourism-ui/src/features/crm/CrmEstablishmentPanel.tsx` | create (nav objet⇄acteur locale, ancrée) |
| `bertel-tourism-ui/src/features/crm/CrmObjectView.tsx` | modify (`hideOpenEditor`, commentaire) |
| `bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx` | modify (`backLabel`, commentaire) |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.test.tsx` | modify (réécriture) |
| `bertel-tourism-ui/src/features/object-editor/widgets/EditorCrmDrawer.test.tsx` | create |
| `bertel-tourism-ui/src/features/crm/CrmEstablishmentPanel.test.tsx` | create |

**Effort** : M.

---

## 10. Hors scope / différé

- Optimisation `objectName/objectType` en props pour éviter `listCrmDirectory` (différable).
- Refactor de `CrmPage` pour réutiliser `CrmEstablishmentPanel` (DRY) — YAGNI, hors scope.
- Container-queries pour un tiroir plus étroit que 1180px — hors scope (le PO accepte 1180px).
- Bouton tâche niveau objet — écarté par le PO.
