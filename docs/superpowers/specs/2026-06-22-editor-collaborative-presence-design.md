# Présence collaborative dans l'éditeur de fiche — Design

- **Date** : 2026-06-22
- **Statut** : Design validé (en attente de relecture humaine avant plan d'implémentation)
- **Périmètre** : `bertel-tourism-ui` — éditeur full-page `/objects/[id]/edit`
- **Type** : Frontend uniquement (aucune migration, aucun RPC)

---

## 1. Contexte & objectif

Lors de l'édition d'une fiche, on veut une **vue de collaboration au contact du contenu** : voir qui d'autre
travaille sur la même fiche, sur quelle section, et être averti avant d'écraser le travail d'un collègue au
moment d'enregistrer. Inspiration : la vignette « Team collaboration / shared workspaces » (avatars de présence
accrochés au contenu).

La fiche s'édite sur la route full-page `/objects/[id]/edit` avec une barre de save globale et un registre de
22 sections (cf. CLAUDE.md § « Object editing — full-page editor »). Le modèle de save est **« dernier qui sauve
gagne »** (pas d'autosave, pas de contrôle de concurrence) — d'où le risque réel d'écrasement silencieux que ce
design adresse.

## 2. État de l'existant (point d'ancrage — on ne part PAS de zéro)

L'infra temps réel est déjà construite et partiellement câblée :

| Pièce | Rôle | État |
|-------|------|------|
| `hooks/usePresenceRoom.ts` | Présence Supabase Realtime par salon + broadcast verrous de champ + « typing » | **Existe** ; consommé par PresenceRail, drawer, CRM |
| `features/object-editor/widgets/PresenceRail.tsx` | Panneau « En cours d'édition / Live » (rail droit) | **Existe & câblé** dans `EditorRail` |
| `components/layout/LivePresenceIndicator.tsx` + `hooks/useGlobalPresence.ts` | Présence globale (pastille « N live » TopBar) | **Existe & câblé** |
| `components/common/AvatarStack.tsx` | Pile d'avatars (initiales + couleur) | **Existe** |
| `lib/presence.ts` | Helpers purs : `dedupePresenceMembers`, `initials`, `formatPresenceDuration`, `deriveNetworkStatus`, `networkStatusLabel` | **Existe & testé** |

Capacités présentes mais **non utilisées dans l'éditeur full-page** : `lockField`/`unlockField` (verrous de champ)
et `announceTyping` (sont dans `usePresenceRoom` mais jamais appelés par l'éditeur).

Signaux déjà disponibles dans `ObjectEditPage.tsx` / `EditorReady` :
- **`activeNum`** — section active courante, calculée par `useEditorScrollSpy(sectionNums)`. → le signal « sur quelle
  section je suis » **existe déjà**.
- **`editor.dirtySections`** — dictionnaire des modules modifiés non sauvés (clé = `WorkspaceModuleId`).
- **`persistDirtyModules()`** — point d'accroche unique de toute sauvegarde (brouillon + publication).

Identité disponible (`store/session-store.ts`) : `userId`, `userName`, `avatar` (= **initiales courtes**, ex.
`"MA"`, pas une URL de photo), résolus au bootstrap. → présence en **initiales + couleur**, pas de photo.

## 3. Décisions cadrées (issues du brainstorming)

1. **Écart visé** : présentation au contact du contenu **ET** profondeur collaborative (conscience section + anti-conflit).
2. **Granularité** : **par section** (réutilise le registre des 22 sections ; faible bruit). Pas par champ.
3. **Anti-conflit** : **conscience + garde au save**. Mécanisme = **diffusion temps réel d'un événement
   `object:saved`** sur le salon déjà ouvert (`room:{objectId}`) — choisi plutôt qu'un `updated_at`/version en base
   parce que la sauvegarde est **table-enfant par table-enfant** (un `updated_at` objet est un signal peu fiable) et
   parce que le broadcast cible exactement « deux personnes éditent en même temps », sans coût backend. Le verrou
   optimiste en base reste un durcissement futur.
4. **Placement** : **bandeau d'avatars dans la barre de save** (tous les présents) **+ badge avatar par en-tête de
   section** (qui est où).
5. **Rail droit existant** (`PresenceRail`) : **gardé tel quel** (le bandeau + badges s'ajoutent par-dessus ; légère
   redondance acceptée par le PO).
6. **Marqueur « édite »** : **inclus** dans cette passe, dérivé des sections modifiées non sauvées du pair
   (`dirtySectionNums` diffusé dans la présence) — honnête, sans instrumenter chaque champ.
7. **Non-objectifs** : co-édition live (curseurs/frappe partagée façon Google Docs), verrou bloquant par section,
   photos d'avatars, « édite » au niveau champ.

## 4. Architecture (unités, faiblement couplées)

### 4.1 Extension générique de `usePresenceRoom` (rétro-compatible)

On étend le primitive existant **sans casser** ses appelants actuels (PresenceRail, drawer, CRM). Deux ajouts,
tous deux optionnels :

- `options.trackExtra?: Record<string, unknown>` — fusionné dans le payload publié par `channel.track()`, avec
  **re-track à chaque changement** de `trackExtra`. Les `peers` retournés portent désormais ces champs
  supplémentaires (le type pair est élargi avec `activeSection?: string` et `dirtySections?: string[]`, optionnels —
  donc transparent pour les consommateurs existants).
- `options.onEvent?(event: string, payload: unknown)` + valeur de retour `broadcast(event, payload)` — passe-plat
  broadcast générique pour l'événement `object:saved`.

Justification : garder **un seul** canal et **un seul** cycle de vie. Dupliquer la gestion de canal dans un hook
séparé serait pire (deux abonnements, double track). Ces ajouts restent génériques (pas de logique éditeur), donc
ne dénaturent pas la responsabilité de `usePresenceRoom`.

### 4.2 `useEditorPresence(objectId, { activeSection, dirtySections })` (hook éditeur, nouveau)

Seule pièce que `EditorReady` consomme. Compose `usePresenceRoom` :
- publie `activeSection` (= `activeNum`) et `dirtySections` (numéros de section, dérivés du dictionnaire module-clé
  `editor.dirtySections` via le helper `dirtyModulesToSectionNums`) via `trackExtra` ;
- écoute `object:saved` (via `onEvent`) et expose `peerSavedNotice` ;
- expose `broadcastSaved(modules)` à appeler après une sauvegarde réussie ;
- **dérive** et expose les formes prêtes à afficher : `roster` (barre de save) et `peersBySection`
  (`Record<sectionNum, Peer[]>`, soi-même exclu).

### 4.3 Composants présentationnels (purs)

- **`EditorPresenceRoster`** — bandeau pour la barre de save : pile d'avatars (adapte `AvatarStack`) + « N live » +
  tooltip noms. Injecté dans `EditorTopbar` via une nouvelle prop optionnelle `roster`.
- **`SectionPresenceBadge`** — petits avatars (1–3 + overflow) pour une section, avec marqueur « édite » quand le
  pair a cette section dans son `dirtySections`. Rendu via un **host englobant** chaque `<Component>` dans
  `edit-main`, repéré par `num` — **aucune des 22 sections n'est modifiée** ; le host préserve l'ancre du scroll-spy.
- **`PeerSavedBanner`** — bannière non bloquante : « *{nom}* a enregistré cette fiche. Recharge pour intégrer ses
  changements, sinon ton prochain enregistrement pourrait les écraser. » + bouton **Recharger** (refetch de
  `useObjectWorkspaceQuery`). Région `role="status"`.
- **Pastilles nav (bonus léger)** — point-avatar à côté de l'entrée de section dans `EditorNav` (la nav mappe déjà
  les sections avec leur état). Optionnel ; à confirmer en plan si l'effort est marginal.

### 4.4 Helpers purs (testables isolément, TDD)

- `groupPeersBySection(peers, selfId): Record<string, Peer[]>` — regroupe les pairs (hors soi) par `activeSection`.
- `computeRoster(peers, self): RosterEntry[]` — liste ordonnée pour le bandeau (soi inclus, marqué « · Vous »).
- `dirtyModulesToSectionNums(dirtySections, archetype): string[]` — convertit les modules dirty en numéros de
  section via le registre. Si la correspondance module→section n'est pas 1:1, **repli honnête** : marquer « édite »
  la seule `activeSection` du pair dès qu'il a au moins une section modifiée (plus grossier mais jamais mensonger).
- `derivePeerSavedNotice(event, { isDirty, lastReloadAt }): Notice | null` — décide si/quoi afficher dans la bannière.
- Réutilise tels quels : `initials`, `dedupePresenceMembers`, `formatPresenceDuration` de `lib/presence.ts`.

## 5. Flux de données

### 5.1 Conscience par section
```
EditorReady.activeNum ─┐
editor.dirtySections ──┴─→ useEditorPresence(trackExtra:{activeSection,dirtySections})
                             └─ usePresenceRoom.track() ──realtime──→ presenceState()
                                                                         └─→ peersBySection
                                                                               ├─→ SectionPresenceBadge (par num)
                                                                               └─→ pastilles EditorNav
roster ──→ EditorPresenceRoster (barre de save)
```
Avatar sur une section = « présent sur la section ». Mention **« édite »** = ce pair a la section dans son
`dirtySections`.

### 5.2 Garde de conflit au save
```
persistDirtyModules() OK ─→ broadcastSaved(modules)
                              └─ broadcast 'object:saved' (self:false) ──→ autres éditeurs
                                                                            └─ peerSavedNotice
                                                                                 └─ PeerSavedBanner [Recharger]
```
`broadcast.self:false` (déjà configuré dans `usePresenceRoom`) garantit qu'on ne s'avertit pas de son propre save.
« Recharger » = `queryClient` refetch du workspace ; conserve les modules dirty locaux ou avertit selon l'état (à
préciser en plan — le défaut sûr est : prévenir que recharger écrase le brouillon local non sauvé).

## 6. Modèle de présence (payload)

Payload tracké dans le salon **éditeur** uniquement (`room:{objectId}`) :
```ts
{
  userId: string; name: string; avatar: string; color: string; onlineSince: number; // existant
  activeSection?: string;        // numéro de section courante (scroll-spy)
  dirtySections?: string[];      // numéros de section avec edits non sauvés
}
```
Les autres salons (global, drawer, CRM) ne passent pas `trackExtra` → payload inchangé.

## 7. Cas limites

- **Soi-même** : exclu de `peersBySection` ; inclus dans `roster` (« · Vous »).
- **Réseau dégradé** : la présence se met en pause (géré par l'existant) ; la pastille réseau le signale déjà ;
  bandeau/badges se vident proprement.
- **Mode démo** (`demoMode`) : les pairs simulés (`mockPresence`) reçoivent une `activeSection` mock → la vitrine
  montre bandeau + badges sans backend.
- **Plusieurs pairs sur une section** : badge = 2–3 avatars + « +N ».
- **`activeSection` inconnue / hors registre** : badge ignoré (garde défensive).
- **Section anchor / scroll-spy** : le host de badge doit préserver l'attribut/ancre que `useEditorScrollSpy`
  utilise — vérifié en implémentation.
- **Save partiel** (certaines sections échouent) : `broadcastSaved` n'émet que les modules réellement enregistrés.

## 8. Sécurité / confidentialité

- La présence ne révèle que `userName` + initiales + section — à des personnes qui ont déjà accès à l'éditeur de la
  fiche (route gated par RLS).
- L'authentification du canal `room:{objectId}` reste **celle de l'existant** ; ce design ne l'aggrave ni ne
  l'améliore (les salons de présence actuels ne sont pas RLS-gated — posture inchangée, hors périmètre).

## 9. Tests

- **Helpers purs** (Jest, pattern existant) : `groupPeersBySection`, `computeRoster`, `dirtyModulesToSectionNums`,
  `derivePeerSavedNotice`.
- **Composants** (RTL, canal mocké / `demoMode`) : `EditorPresenceRoster`, `SectionPresenceBadge` (présence vs
  « édite »), `PeerSavedBanner` (apparition + action Recharger).
- **Intégration** : flux save → `broadcastSaved` → bannière chez le pair (canal mocké).
- Cible de couverture cohérente avec la suite actuelle ; aucune régression sur les consommateurs existants de
  `usePresenceRoom` (tests existants doivent rester verts après l'extension rétro-compatible).

## 10. Fichiers touchés (prévisionnel)

| Fichier | Action |
|---------|--------|
| `hooks/usePresenceRoom.ts` | Étendre : `trackExtra`, `onEvent`/`broadcast`, peers élargis (rétro-compatible) |
| `hooks/useEditorPresence.ts` | **Nouveau** — hook éditeur composant le précédent |
| `features/object-editor/presence/editor-presence.ts` | **Nouveau** — helpers purs (`groupPeersBySection`, `computeRoster`, `dirtyModulesToSectionNums`, `derivePeerSavedNotice`) |
| `features/object-editor/widgets/EditorPresenceRoster.tsx` | **Nouveau** — bandeau |
| `features/object-editor/widgets/SectionPresenceBadge.tsx` | **Nouveau** — badge section |
| `features/object-editor/widgets/PeerSavedBanner.tsx` | **Nouveau** — bannière conflit |
| `features/object-editor/shell/EditorTopbar.tsx` | Prop `roster` + rendu du bandeau |
| `features/object-editor/shell/EditorNav.tsx` | Pastilles avatar (bonus, optionnel) |
| `features/object-editor/ObjectEditPage.tsx` | Câbler `useEditorPresence` ; host de badge autour des sections ; `broadcastSaved` après `persistDirtyModules` ; rendu bannière |
| `features/object-editor/object-editor.css` | Styles bandeau / badge / bannière |
| `+ *.test.ts(x)` | Tests des unités ci-dessus |

## 11. Effort & risques

- **Effort** : frontend seul ; ~6 petites unités + extension d'un hook existant. Pas de migration, pas de RPC.
- **Risque** : faible — additif et rétro-compatible ; le seul point de vigilance est la non-régression des
  consommateurs actuels de `usePresenceRoom` (couvert par leurs tests existants).

## 12. Durcissements futurs (hors périmètre)

- Verrou optimiste en base (`updated_at`/version) pour protéger même quand le temps réel est coupé.
- Photos d'avatars (champ URL sur le profil + upload).
- « Édite » au niveau champ (focus-within / `lockField` déjà présent mais dormant).
- Curseurs / co-édition live (CRDT/OT) — non retenu (conflit avec le modèle save global).
