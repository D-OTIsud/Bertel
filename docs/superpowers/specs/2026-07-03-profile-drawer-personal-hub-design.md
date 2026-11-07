# Panneau utilisateur « Hub personnel » — design

**Date** : 2026-07-03 · **Statut** : validé PO (direction « hub personnel » + édition de profil intégrée)
**Surface** : `bertel-tourism-ui` — `ProfileDrawer` (tiroir ouvert par la pastille utilisateur de la sidebar)
**Backend** : un seul micro-patch SQL (`api.list_crm_tasks` expose `owner_id`)

---

## 1. Problème

Le tiroir actuel ([ProfileDrawer.tsx](../../../bertel-tourism-ui/src/components/layout/ProfileDrawer.tsx)) n'apporte
rien à l'utilisateur :

- codes bruts non traduits : `super_admin · ready`, pills `connected` / `N live`, « Demo/Secure workspace » (anglais) ;
- **lien trompeur** : « Espace equipe » pointe vers `/crm` (le module CRM) alors que l'administration d'équipe
  vit dans `/settings?section=team` (la route `/team` a été retirée en phase 7.4) ;
- ni e-mail, ni organisation, ni rôle lisible, ni accès au profil éditable (§149) ;
- aucune donnée personnelle vivante (tâches, présence, modération).

## 2. Décisions (validées en brainstorming)

1. Le panneau devient un **hub personnel** : identité complète + blocs dynamiques alimentés par des données existantes.
2. L'**édition du profil (nom + photo) se fait depuis le panneau** via une modale compacte (style maison
   « vue compacte + bouton→modale »), en réutilisant la mécanique §149.
3. **Une seule surface d'édition du profil** : la section Profil de Réglages → Mon compte passe en affichage +
   bouton « Modifier » qui ouvre la **même modale** (pas deux implémentations du même save).
4. Patch SQL additif accepté : `owner_id` dans la sortie de `api.list_crm_tasks` pour filtrer « mes tâches »
   par uuid (jamais par nom affiché).

## 3. Design du panneau (de haut en bas)

### 3.1 Bloc identité (éditable)

- Avatar (photo `avatarUrl` ou initiales), **nom**, **e-mail** (lecture seule — identifiant de connexion).
- Organisation : `orgName` (ex. « OTI du Sud ») ; absent si null.
- Rôle lisible en français : réutiliser **`resolveUserRoleLabel(role, adminRank)`** +
  `resolveUserRoleTone` ([user-role-label.ts](../../../bertel-tourism-ui/src/utils/user-role-label.ts)) — déjà
  utilisés par la page Réglages. Aucun nouveau mapping.
- Bouton « **Modifier mon profil** » → ouvre `ProfileEditModal` (voir §4).
- Source : session-store uniquement (`userName`, `email`, `avatarUrl`, `orgName`, `role`, `adminRank`).
  Zéro appel réseau.

### 3.2 Bloc « En ligne maintenant »

- Liste des **collègues** connectés : `liveMembers` (ui-store, alimenté par `useGlobalPresence` —
  canal Realtime global déjà en place). On exclut soi-même (`userId` de session).
- Rendu : rangée d'avatars (initiales colorées par `member.color`) + prénoms ; tooltip natif `title`
  « En ligne depuis HH:MM » dérivé de `onlineSince` (pas de lib en plus).
- État vide : « Vous êtes le seul connecté. »

### 3.3 Bloc « Mes tâches » (CRM)

- Données : query React Query **même clé `['crm-tasks']`** que CrmPage (cache partagé, aucune double charge),
  `enabled: open` — le fetch ne part que quand le panneau s'ouvre.
- Filtre : `task.ownerId === session.userId` **et** `status ∈ {todo, in_progress}` ; tri `dueAt` croissant
  (nulls en dernier) ; **4 max**.
- Rendu par tâche : titre, nom de l'établissement, échéance relative ; **badge « En retard »** si
  `dueAt < maintenant`.
- Clic tâche / lien « Toutes mes tâches » → **`/crm?tab=taches`** (deep-link d'onglet, voir §5.3).
- Bloc **masqué** si 0 tâche assignée (panneau compact, pas d'état vide décoratif) et en cas d'erreur
  de la query (le panneau ne casse jamais pour un bloc).

### 3.4 Bloc « À modérer » (conditionnel)

- Réutilise la query **`['pending-changes', 'pending']`** déjà en cache pour le badge sidebar (§120) —
  même condition de visibilité (entrée Modération visible pour le rôle), coût réseau nul.
- Rendu : « N suggestion(s) en attente » → lien `/moderation`.
- Masqué si non-modérateur **ou** compteur = 0.

### 3.5 Pied

- « **Mon équipe** » → `/settings?section=team` (corrige le lien `/crm` actuel ; la route `/team` n'existe
  plus depuis 7.4). Visible seulement si `canAdministerTeam({ role, adminRank })`
  ([session-selectors.ts](../../../bertel-tourism-ui/src/store/session-selectors.ts)) — le rail Réglages
  applique le même gating.
- « **Paramètres** » → `/settings`.
- « **Se déconnecter** » (même garde qu'aujourd'hui : hors démo, session `ready`).

### 3.6 Retraits

- Suppression des pills `connected` / `N live` / « Demo/Secure workspace » et du couple `role · status` brut.
- Le réseau ne s'affiche **que dégradé** : bandeau discret « Connexion dégradée » / « Hors ligne »
  (depuis `networkStatus`) en tête de panneau. Connecté = rien.

## 4. `ProfileEditModal` — modale d'édition partagée

- **Nouveau composant** `src/features/settings/ProfileEditModal.tsx`, sur la primitive
  [ui/dialog](../../../bertel-tourism-ui/src/components/ui/dialog.tsx) (pattern maison des modales compactes).
- Contenu :
  - **Photo** : aperçu rond (photo ou initiales) + « Changer la photo » → `uploadAvatar(file)`
    (route `/api/avatar/upload` existante : auth-as-caller, resize 512, EXIF strippé) ; état « Envoi… » ;
    erreurs inline (415 → message format).
  - **Nom affiché** : champ texte + « Enregistrer » → `updateCurrentUserProfile({ display_name })`.
  - Chaque succès applique `applyProfile(...)` au session-store (initiales recalculées, signature
    « mot du conseiller » à jour — comportement §149 conservé).
  - Garde existante conservée : jamais l'e-mail comme source d'initiales ; en mode démo les deux
    actions sont désactivées avec raison visible.
- **Consommateurs** :
  1. `ProfileDrawer` (bouton « Modifier mon profil ») — la modale s'ouvre par-dessus le Sheet ;
  2. `SettingsPage` section Profil : le formulaire inline actuel devient **affichage** (photo + nom) +
     bouton « Modifier » ouvrant la même modale. La logique upload/save quitte SettingsPage
     (allègement net du fichier).

## 5. Contrats techniques

### 5.1 SQL — `api.list_crm_tasks` expose `owner_id` (additif)

- Dans le `jsonb_build_object` de la fonction ([migration_crm_module.sql:537](../../../Base%20de%20donnée%20DLL%20et%20API/migration_crm_module.sql)),
  ajouter `'owner_id', ct.owner` à côté de `owner_name`. Clé additive : aucun appelant existant ne casse.
- Édition **in-place** du fichier manifest (même pattern que les correctifs précédents) + application live
  via migration MCP. Pas de nouvelle entrée de manifest.
- `tests/test_crm_module.sql` : assert que les items de `list_crm_tasks` portent `owner_id` (uuid du owner).

### 5.2 Frontend — types & parsing

- `CrmTask` (+ mocks + `parseCrmTask`) : nouveau champ `ownerId: string | null` ← `record.owner_id`.

### 5.3 Frontend — deep-link d'onglet CRM

- `CrmPage` : au premier rendu client, si `?tab=` vaut `annuaire | taches | timeline`, ce paramètre
  **prime sur le nav localStorage** (même esprit que le deep-link `?fiche=` de §142). Paramètre invalide
  ou absent → comportement actuel inchangé.

### 5.4 Frontend — refonte `ProfileDrawer`

- Le Sheet, son ouverture depuis la pastille sidebar (`AppShell`/`Sidebar`) et la prop
  `open/onOpenChange` ne changent pas. Seul le contenu est refondu (blocs §3).
- Toutes les queries des blocs sont `enabled` sur l'ouverture du panneau et tolérantes à l'échec
  (bloc masqué, jamais d'écran d'erreur).
- Styles : tokens du thème existants (`styles.css`, classes `profile-drawer__*` réécrites), pas de
  nouvelle dépendance.

## 6. Gestion d'erreurs

- Modale : erreurs de save/upload **inline** dans la modale (messages FR existants de §149 conservés).
- Blocs dynamiques : query en erreur ⇒ bloc masqué (le tiroir reste fonctionnel : identité + pied
  ne dépendent d'aucun réseau).
- Déconnexion : comportement actuel conservé (`signOut()`).

## 7. Accessibilité

- Le Sheet garde `SheetTitle`/`SheetDescription` (sr-only) ; la modale (ui/dialog) porte titre + description.
- Avatars de présence : `title` + texte accessible (« Marie, en ligne depuis 10:42 »).
- Badge « En retard » : texte, pas seulement couleur.
- Focus : retour au déclencheur à la fermeture de la modale (comportement dialog existant).

## 8. Tests

| Sujet | Type | Contenu |
|---|---|---|
| `ProfileDrawer` | RTL (nouveau `ProfileDrawer.test.tsx`) | identité (nom/e-mail/org/rôle FR) ; « seul connecté » vs liste collègues ; « Mes tâches » filtre owner+statut, tri, badge retard, masqué si vide ; bloc modération conditionnel ; liens `/settings?section=team` (gated), `/settings`, `/crm?tab=taches` ; bandeau réseau seulement si dégradé |
| `ProfileEditModal` | RTL (nouveau) | save nom (service mocké + `applyProfile`), upload avatar (succès/échec), gardes démo, nom vide refusé |
| `SettingsPage` | tsc + suite globale | pas de test RTL SettingsPage existant ; la modale porte les tests, la page est vérifiée par typecheck + suite complète |
| `parseCrmTask` | Jest | `owner_id` → `ownerId` (présent / absent) |
| `CrmPage` | RTL | `?tab=taches` prime sur le nav persisté ; param invalide ignoré |
| SQL | `test_crm_module.sql` | items `list_crm_tasks` portent `owner_id` |

## 9. Hors périmètre

- Notifications (cloche retirée en D26 ; reviendra avec la table `notification`, D27 backend).
- Changement de mot de passe / e-mail (reste dans Réglages ; l'e-mail n'est pas éditable).
- « Mes dernières modifications » (nécessiterait un RPC d'activité par utilisateur — pas dans ce lot).
- Édition des préférences de langue (reste dans Réglages).
