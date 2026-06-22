# Indicateur de présence « live » global (qui est en ligne sur le site)

- **Date** : 2026-06-22
- **Statut** : design validé (PO « oui »), spec à relire avant plan
- **Portée** : frontend uniquement (`bertel-tourism-ui`). Aucune migration SQL, aucun changement de schéma/RPC.

---

## 1. Contexte & problème

La `TopBar` affiche une pastille « X live » avant la date/heure
([`TopBar.tsx:116-123`](../../../bertel-tourism-ui/src/components/layout/TopBar.tsx)).
Elle lit `liveUsersCount` et `networkStatus` depuis le store UI
([`ui-store.ts`](../../../bertel-tourism-ui/src/store/ui-store.ts)).

Ces deux valeurs sont écrites par `usePresenceRoom(roomKey, { syncGlobalStatus: true })`
([`usePresenceRoom.ts`](../../../bertel-tourism-ui/src/hooks/usePresenceRoom.ts)), monté
**seulement** sur l'Explorer (`room:explorer`) et le CRM (`crm:tasks`). D'où quatre défauts
observés :

1. **Pas global** : le compteur ne reflète la présence que dans le salon de la page courante.
   Sur toute autre page (Dashboard, Équipe, éditeur…) rien ne le met à jour → valeur figée.
2. **Compte des connexions, pas des personnes** : `Object.values(state).flat()` compte chaque
   entrée de présence. Deux onglets d'un même utilisateur ⇒ « 2 live » alors qu'il est seul.
3. **« offline » ambigu** : `networkStatus` est écrit par deux sources concurrentes
   (`useNetworkMonitor` = navigateur en/hors ligne, et la présence = cycle de vie du canal).
   La dernière écriture gagne. « offline » peut donc s'afficher alors qu'Internet fonctionne
   (canal temps réel coupé), et le mot brut anglais induit en erreur.
4. **Défaut résiduel** : le store démarre à `liveUsersCount: 3`
   ([`ui-store.ts:32`](../../../bertel-tourism-ui/src/store/ui-store.ts)), visible tant qu'aucun
   salon n'a synchronisé.

## 2. Objectifs / non-objectifs

**Objectifs**
- Présence **globale** au site (un seul canal, monté une fois, actif sur toutes les pages qui
  affichent la `TopBar`).
- Compter **les personnes**, pas les connexions (déduplication par `userId` ; tes 2 onglets = 1).
- Au **survol ET au clic** sur la pastille, un panneau « Qui est en ligne » : avatar + nom +
  « en ligne depuis … » par personne ; l'utilisateur courant est inclus et marqué « Vous ».
- **Clarifier l'état de connexion** : libellés français explicites + une seule source de vérité
  (fin de la course entre les deux writers).

**Non-objectifs (hors scope)**
- La présence **par-objet** de l'éditeur (verrous de champs, typing, snackbar « X a quitté ») via
  `usePresenceRoom` reste **inchangée** — c'est un autre besoin (collaboration sur une fiche).
- Pas d'autorisation Realtime côté SQL / pas de RLS : on reste sur le canal de présence anon +
  JWT existant.
- Pas de persistance d'historique de présence.

## 3. Approche retenue (A)

Un **hook de présence global dédié** monté dans `AppBootstrap`, distinct de `usePresenceRoom`
(qui garde sa finalité par-objet). Rejeté : (B) généraliser `usePresenceRoom` et le monter
globalement — il traîne verrous/typing/broadcast inutiles ici et ferait grossir un hook déjà
chargé ; (C) agréger les salons par page — ne devient jamais réellement global.

### 3.1 Canal & déduplication

- Canal `presence:global`, config `presence: { key: userId }` (comme l'existant).
- À chaque `sync`, `presenceState()` renvoie `{ [userId]: [entrées…] }`.
- **Déduplication par clé** : 1 clé = 1 personne. Pour chaque personne :
  - `userId` = la clé,
  - `name` / `avatar` / `color` = première entrée,
  - `onlineSince` = **le plus ancien** parmi les entrées (⇒ « en ligne depuis » = première arrivée,
    robuste aux multi-onglets).
- L'utilisateur courant est **inclus** et marqué « Vous ». Seul ⇒ liste = `[Vous]` ⇒ **1 live**.
- Tri d'affichage : l'utilisateur courant en premier, puis les autres par `onlineSince` croissant
  (les plus anciens d'abord), `name` en départage pour la stabilité.

### 3.2 État de connexion unifié

`useGlobalPresence` devient **l'unique** writer de `networkStatus`. Il écoute :
- les événements navigateur `online` / `offline`,
- le cycle de vie du canal (`SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`).

Dérivation **pure et déterministe** (`deriveNetworkStatus(browserOnline, realtimeStatus)`) :

| browserOnline | realtimeStatus | networkStatus |
|---|---|---|
| `false` | (peu importe) | `offline` |
| `true` | `subscribed` | `connected` |
| `true` | joining / error / timeout / closed | `degraded` |

`useNetworkMonitor` est replié dans `useGlobalPresence` puis **retiré** d'`AppBootstrap`
(supprime la course actuelle).

Libellés (`networkStatusLabel(status)` → `{ tone, label, description }`) :

| status | tone (point) | label | description (infobulle / panneau) |
|---|---|---|---|
| `connected` | vert | « En ligne » | « Connexion temps réel active. » |
| `degraded` | orange | « Temps réel interrompu » | « Tes données restent à jour ; seule la présence live est en pause. » |
| `offline` | rouge | « Hors ligne » | « Aucune connexion réseau détectée. » |

### 3.3 Composant `LivePresenceIndicator`

Remplace le bloc pastille inline de la `TopBar`.

- **Déclencheur** : un `<button>` (point coloré `tone` + texte « X live »), `aria-expanded`,
  `aria-controls`, `aria-haspopup`. Quand `networkStatus !== 'connected'`, une pastille d'état
  (libellé FR ci-dessus) reste affichée à côté, comme aujourd'hui mais en clair.
- **Ouverture** : **survol** ouvre le panneau ; **clic** l'épingle (reste ouvert). `Échap`,
  clic-extérieur et `blur` hors du composant ferment et désépinglent. `focus` clavier ouvre aussi.
- **Panneau** (rôle `dialog`, `aria-label`) :
  - En-tête : « X personne(s) en ligne » + une ligne d'état de connexion (label + point).
  - Lignes : avatar coloré (initiales) + nom (+ « · Vous » pour soi) + « en ligne depuis … ».
  - Cas seul : « Vous êtes seul·e en ligne. »
  - Cas sans présence / hors ligne : « Présence indisponible (hors ligne). »
- **Animation** : fondu + léger scale, respectant `prefers-reduced-motion`.

## 4. Fichiers

| Fichier | Action |
|---|---|
| `src/hooks/useGlobalPresence.ts` | **Nouveau** — canal `presence:global`, déduplication, écriture store, écoute online/offline, mode démo |
| `src/lib/presence.ts` | **Nouveau** — fonctions pures : `dedupePresenceMembers(state, selfId)`, `deriveNetworkStatus(browserOnline, realtimeStatus)`, `networkStatusLabel(status)` ; + `formatPresenceDuration` et `initials` **déplacées** depuis `PresenceRail` (réimportées là-bas) |
| `src/components/layout/LivePresenceIndicator.tsx` | **Nouveau** — pastille + panneau |
| `src/store/ui-store.ts` | Ajoute `liveMembers: PresenceMember[]` + `setLivePresence` ; **retire** `liveUsersCount` + `setLiveUsersCount` (le compteur se dérive de `liveMembers.length`) ; `liveMembers` défaut `[]` (supprime le « 3 ») ; `networkStatus` + `setNetworkStatus` conservés |
| `src/components/common/AppBootstrap.tsx` | Monte `useGlobalPresence()` ; retire `useNetworkMonitor()` |
| `src/components/layout/TopBar.tsx` | Remplace le bloc pastille par `<LivePresenceIndicator />` |
| `src/hooks/usePresenceRoom.ts` | **Retire l'option `syncGlobalStatus` et ses branches** (plus aucun appelant ne la passe) ⇒ ne référence plus `setLiveUsersCount`/`setNetworkStatus` ; redevient un hook purement par-objet (présence + verrous + typing) |
| `src/views/ExplorerPage.tsx` | Retire l'appel `usePresenceRoom('room:explorer', { syncGlobalStatus: true })` (servait seulement au compteur global) |
| `src/views/CrmPage.tsx` | Retire `syncGlobalStatus` (garde le salon `crm:tasks` pour `typingUsers`) |
| `src/hooks/useNetworkMonitor.ts` | Supprimé (logique repliée dans `useGlobalPresence`) — après vérification qu'il n'a pas d'autre consommateur |
| `src/features/object-editor/widgets/PresenceRail.tsx` | Réimporte `formatPresenceDuration` / `initials` depuis `src/lib/presence.ts` (pas de changement de comportement) |

> Note de cohérence : après ce changement, `networkStatus` n'a plus qu'**un seul** writer
> (`useGlobalPresence`), et le compteur n'a plus qu'une seule source (`liveMembers`). Les deux
> causes racines des incohérences (#2 course, #2 double-comptage) disparaissent par construction.

## 5. Flux de données

```
window online/offline ─┐
                       ├─▶ useGlobalPresence (AppBootstrap, monté 1×)
canal presence:global ─┘        │  dedupePresenceMembers + deriveNetworkStatus
                                ▼
                         ui-store: liveMembers[], networkStatus
                                │
                                ▼
                   LivePresenceIndicator (TopBar)
                     pastille « X live » + point tone + panneau
```

## 6. Mode démo

`env.demoMode` ⇒ membres = `[me, ...mockPresence (≤2 autres, onlineSince décalés)]`
(réutilise [`data/mock.ts`](../../../bertel-tourism-ui/src/data/mock.ts), comme `usePresenceRoom`),
`networkStatus = 'connected'` (vitrine « en bonne santé »).

## 7. Cas limites

- **Pas de `userId`** (invité) : pas de `track`, `liveMembers = []`. La pastille n'affiche pas de
  compteur ni de panneau, seulement le point d'état. (La `TopBar` est de toute façon absente du
  login.)
- **Pas de config Supabase** (`getSupabaseClient() === null`) : `networkStatus = 'offline'`,
  `liveMembers = []`, panneau « Présence indisponible (hors ligne) ».
- **Éditeur plein écran** : la `TopBar` est masquée (`AppShell` `!isObjectEdit`), donc l'indicateur
  global n'y apparaît pas. L'éditeur garde sa présence par-objet (`PresenceRail`). *Ajout global
  dans la barre de l'éditeur = petit suivi séparé si souhaité (non inclus ici).*
- **Fantôme de reconnexion** : géré nativement par Supabase (l'ancienne entrée part au `leave`) ;
  la déduplication par `userId` lisse en plus le cas multi-onglets.

## 8. Plan de test (TDD)

**Purs** (`src/lib/presence.test.ts`)
- `dedupePresenceMembers` : 3 onglets d'un même `userId` ⇒ 1 personne ; `onlineSince` = min ;
  self correctement identifié ; 2 personnes ⇒ 2 ; état vide ⇒ `[]`.
- `deriveNetworkStatus` : couvre les 3 lignes du tableau §3.2.
- `networkStatusLabel` : tone/label/description par statut.
- `formatPresenceDuration` : tests existants **préservés** après déplacement.

**Composant** (`LivePresenceIndicator.test.tsx`)
- rend « X live » avec le bon point de couleur ;
- clic ouvre le panneau et liste les membres, self marqué « Vous » ;
- survol ouvre, `Échap` ferme ;
- état seul ⇒ « Vous êtes seul·e en ligne » ;
- `networkStatus = 'offline'` ⇒ libellé « Hors ligne ».

**Hook** (`useGlobalPresence.test.tsx`, léger) — canal Supabase mické (cf. pattern
[`usePresenceRoom.test.tsx`](../../../bertel-tourism-ui/src/hooks/usePresenceRoom.test.tsx)) :
mode démo ⇒ membres mock + `connected` ; pas de client ⇒ `[]` + `offline`.

**Vérification finale** : `tsc` propre, suite Jest verte, `next build` exit 0, et contrôle visuel
(une seule personne ⇒ « 1 live » ; deux onglets ⇒ toujours « 1 live »).

## 9. Suivis / différés

- Indicateur global aussi dans la barre de l'éditeur plein écran (placement séparé).
- `useGlobalPresence` distingue aujourd'hui `degraded` (canal) de `offline` (navigateur) mais le
  panneau ne détaille pas la cause exacte du `degraded` — suffisant pour le MVP.
- Mise à jour du journal de décisions `lot1_mapping_decisions.md` à la clôture (nouvel item).
