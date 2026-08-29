# Édition du profil d'un membre depuis le panneau Équipe — design

**Date** : 2026-08-28
**Statut** : v1 — prête pour le plan d'implémentation
**Surface** : `/settings` → Équipe (`views/TeamAdminPage.tsx`, `features/team/`)
**Migration SQL** : **aucune**. Tout passe par des routes serveur du modèle `/api/admin/*` déjà en
place. C'est délibéré : le gate CI `sql-fresh-apply` est rouge sur `master` depuis le 2026-08-07 et
la migration 16w n'a son front ni poussé ni déployé — ajouter du SQL ici ferait dépendre une
correction d'écran d'un chantier de déploiement étranger.

---

> ## ⚠ Ce document est la conception ; l'implémentation l'a DÉPASSÉ sur trois points — 2026-08-29
>
> Ce texte reste la référence de **conception** (le besoin, l'arbitrage « deux boutons de lien et non
> trois », la mécanique des routes). Mais la revue de code a trouvé, et fermé, une faille que la
> conception n'avait pas vue, et le PO a tranché un différé. Ce qui est **livré** diffère donc du § 5
> et du § 8 ci-dessous sur trois points. **Le contrat qui fait foi est §226** du journal canonique
> `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`.
>
> | Point | Ce que dit ce document | Ce qui est LIVRÉ |
> |---|---|---|
> | Gardes du `PATCH` (§ 5.2) | quatre gardes ; la sonde `is_platform_owner` ne couvre que `platformRole` | **six** gardes. La conception avait manqué que **changer l'e-mail de connexion d'un `owner` revient à prendre son compte** (changer l'adresse, puis demander un lien de réinitialisation qui arrive chez soi — aucun trigger de base ne s'y oppose, ce n'est pas un changement de rôle). Ajoutés : `owner_required_for_email` (même autorité, **sans** exemption `isSuper`) et la règle **`RANK_VIOLATION`** du dépôt (rang cible ≥ rang appelant ⇒ refus, superuser exempté, rang scopé à l'ORG partagée) — cette route était la seule surface d'administration d'équipe à ne comparer aucun rang |
> | Périmètre d'ORG sur `invite` / `delete-user` (§ 8, « différé ») | dette assumée, non corrigée | **Fermé**, sur décision PO — l'inversion était perverse : un rang 30 pouvait *supprimer* un compte d'une autre ORG mais pas en changer le nom. Pas le « correctif de 2 lignes » annoncé : la garde ne vaut que sur la branche `resend` (sinon toute invitation d'une adresse **nouvelle** échoue, faute de membership), et `delete-user` a demandé une **fonction asymétrique** (appelant actif, cible active **ou non**) sans quoi un membre qu'on vient de désactiver devenait indélébile |
> | Bloc avatar (§ 4.1) | dupliqué depuis `ProfileEditModal` | **Extrait** dans `components/common/AvatarPicker.tsx`, consommé par les deux modales (arbitrage PO au balayage pré-vol) |
>
> Le § 4.2 (avertissement sur la conséquence d'un changement d'e-mail) est en revanche **livré tel
> quel**, et complété par la garde `email_claims_actor` qui réserve au superuser une adresse
> correspondant à un canal acteur.

---

## 1. Le besoin

Un administrateur du panneau Équipe voit aujourd'hui une ligne par membre : nom, e-mail, rôle
métier, rôle admin, compteur de permissions, dernière activité. Il peut changer les deux rôles,
ouvrir le tiroir des permissions, désactiver et supprimer.

Il ne peut **rien faire de l'identité** : un nom mal saisi à l'invitation reste faux pour toujours,
une photo ne peut pas être posée pour quelqu'un d'autre, une adresse de connexion erronée oblige à
supprimer et ré-inviter le compte. Et quand un invité dit « je n'ai pas reçu le mail », l'écran
n'offre aucun geste : le seul renvoi existant vit **dans le récapitulatif de la modale
d'invitation**, donc uniquement dans la minute qui suit l'invitation, jamais depuis la liste.

Cible : depuis la ligne d'un membre, **une modale** qui édite son identité et **rend le compte
accessible** sans le détruire.

---

## 2. Ce qui existe déjà, et qu'on réutilise

| Brique | Fichier | Réutilisation |
|---|---|---|
| Préambule d'autorisation « en tant qu'appelant » | `app/api/admin/invite/route.ts`, `app/api/admin/delete-user/route.ts` | **Extrait** en helper partagé (3ᵉ copie sinon) |
| Page d'atterrissage des liens authentifiants | `views/SetPasswordPage.tsx` | Telle quelle — elle gère **déjà** invitation ET `PASSWORD_RECOVERY` |
| Envoi d'un lien de réinitialisation | `services/auth.ts` → `requestPasswordReset` | Telle quelle |
| Modale maison | `components/common/Modal.tsx` | Telle quelle |
| Pipeline avatar (redimension + strip EXIF/GPS, écriture service-role) | `app/api/avatar/upload/route.ts` | **Étendue** d'un `targetUserId` optionnel — jamais un second écrivain du bucket |
| Traduction FR des erreurs de route RBAC | `services/rbac.ts` → `rbacRouteError` / `FRIENDLY` | Telle quelle |

Rien de neuf n'est écrit là où une brique couvre déjà le besoin.

---

## 3. Les boutons d'envoi de lien — **deux** actions, pas trois

La demande initiale en cite trois : renvoyer l'invitation, réinitialiser le mot de passe, envoyer
un lien magique. **Il n'en existe que deux techniquement**, et afficher trois boutons dont deux font
le même appel serait un bouton menteur — la classe de défaut que ce projet traque depuis §25.

### 3.1 Pourquoi « renvoyer l'invitation » n'est pas un mécanisme distinct

- `inviteUserByEmail` **refuse** une adresse déjà enregistrée (GoTrue). C'est pourquoi la route
  `invite` actuelle, sur `resend: true`, **supprime le compte auth puis ré-invite**.
- Ce contournement détruit `user_permission` (FK `ON DELETE CASCADE`) : le client reconstruit
  ensuite membership + **préréglage du rôle**, donc les droits accordés individuellement à ce
  membre sont **silencieusement remplacés** par ceux du préréglage. Acceptable dans le flux
  d'invitation (le compte vient de naître, il n'a rien à perdre) ; inacceptable sur une ligne de la
  liste, où le membre peut porter des droits choisis exprès.
- `admin.generateLink({ type: 'invite' })` **ne dispense pas** : il *retourne* un lien, il ne
  l'envoie pas. L'envoyer nous-mêmes via le SMTP maison (`app/api/lists/send`) dupliquerait le
  gabarit Supabase pour un gain nul.

**Décision** : pour un compte jamais connecté, un lien de réinitialisation produit exactement le
même résultat pour l'invité — il atterrit sur `/set-password` et choisit son mot de passe — sans
rien détruire. Le chemin destructif n'est pas exposé ici. Il reste dans la modale d'invitation, où
il est légitime.

### 3.2 Les deux actions

| Libellé | Condition d'affichage | Appel |
|---|---|---|
| **« Renvoyer l'invitation »** | `lastSeenAt === null` (jamais connecté) | `requestPasswordReset(email)` |
| **« Réinitialiser le mot de passe »** | `lastSeenAt !== null` | `requestPasswordReset(email)` |
| **« Envoyer un lien de connexion »** | toujours | `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: origin } })` |

Un seul bouton pour les deux premières lignes : **même appel, libellé dérivé de l'état du compte**.
Le libellé dit ce que le destinataire va vivre ; il ne prétend pas à deux mécanismes.

`shouldCreateUser: false` est obligatoire : sans lui, une faute de frappe dans une adresse **crée un
compte fantôme** au lieu d'échouer.

### 3.3 Pourquoi ces deux appels ne passent pas par une route serveur

`resetPasswordForEmail` et `signInWithOtp` sont des endpoints **publics** de GoTrue : n'importe qui
peut déjà les appeler pour n'importe quelle adresse. Les router côté serveur avec la service key
n'ajouterait aucune barrière — seulement une surface d'attaque et du code. Ils partent donc du
client, sous la session de l'admin ; la session de l'admin n'est **pas** affectée (le lien
n'authentifie que dans le navigateur qui le clique).

Deux conséquences à assumer et à afficher :

- **Les limites de débit Supabase s'appliquent** (par adresse et par heure). Un second envoi trop
  rapproché renvoie une erreur ; elle est remontée telle quelle, traduite, jamais avalée.
- **Le lien magique peut être désactivé** au niveau du projet Supabase. Dans ce cas l'appel échoue
  avec un message explicite. On ne masque pas le bouton par anticipation : masquer une action pour
  une raison de configuration produirait un écran qui ment sur ce qui est possible.

Après un envoi réussi : `toast.success` nommant l'adresse destinataire, et la modale **reste
ouverte** (l'admin enchaîne souvent sur un second geste).

---

## 4. La modale `MemberProfileModal`

`features/team/MemberProfileModal.tsx`, bâtie sur le `Modal` maison. Deux zones.

### 4.1 Zone « Identité »

| Champ | Écriture | Garde d'affichage |
|---|---|---|
| Photo | `POST /api/avatar/upload` avec `targetUserId` | — |
| Nom affiché | `PATCH /api/admin/user-profile` → `app_user_profile.display_name` | — |
| E-mail de connexion | `PATCH …` → `admin.updateUserById(id, { email, email_confirm: true })` | — |
| Rôle plateforme | `PATCH …` → `app_user_profile.role` | **désactivé avec motif** si l'appelant n'est pas `owner` |

**L'état du formulaire se resynchronise sur l'identité de la ligne**, pas sur la référence d'objet
(§212) : `Modal` reste monté pour jouer son animation de sortie, donc un `useState(() => …)` figé au
montage écrirait les valeurs du membre A sur la clé du membre B, sans erreur. La resynchronisation
se fait **pendant le rendu** (ajustement d'état sur changement de prop), jamais dans un `useEffect`
— deux effets du même commit liraient tous deux l'état d'avant (§213).

### 4.2 Avertissement obligatoire sur l'e-mail

Le changement est **immédiat** (`email_confirm: true`, pas de courriel de confirmation) : le membre
se connecte dès lors avec la nouvelle adresse.

Mais l'e-mail est aussi ce que `api.is_object_owner` compare à `actor_channel` pour décider de quelles
fiches un utilisateur est propriétaire. **Changer l'adresse peut donc changer les fiches que ce
membre peut écrire**, dans les deux sens. Le dire dans la modale, au-dessus du champ — pas dans un
commentaire de code que personne ne lit au moment du geste.

`app_user_profile` ne stocke pas l'e-mail : il n'y a rien d'autre à écrire.

### 4.3 Point d'entrée

Un bouton **« Modifier »** dans la colonne d'actions de `MembersTable`, **absent sur sa propre
ligne** — même règle que « Désactiver » et « Supprimer ». Son propre profil s'édite dans
Réglages → Mon compte (`ProfileEditModal`, surface unique nom + photo depuis §171) ; on n'ouvre pas
une seconde surface pour le même fait.

---

## 5. Route `app/api/admin/user-profile/route.ts`

### 5.1 Contrat

```
GET  ?userId=<uuid>
  → 200 { displayName, avatarUrl, email, platformRole, lastSignInAt }

PATCH { userId, displayName?, email?, platformRole? }
  → 200 { updated: true }
```

Le `GET` existe parce que `rpc_list_org_members` ne rend **ni** `avatar_url` **ni** le `role` brut :
sans lui, la modale s'ouvrirait sur une photo absente et un rôle inconnu. Lecture service-role,
sous les mêmes gardes que le `PATCH`.

Une clé de payload inconnue **fait échouer** l'appel ; elle n'est jamais ignorée en silence (§212 —
une valeur jetée sans bruit est un piège d'écriture).

### 5.2 Les quatre gardes, toutes ré-évaluées serveur

L'UI ne garde jamais rien : elle rend l'état lisible, le serveur décide.

1. **Rang** — `api.is_platform_superuser()` OU `api.current_user_admin_rank() >= 30`, sondés **en
   tant qu'appelant** (client anon + JWT). La service key qui écrit ensuite contourne la RLS : cette
   sonde EST la frontière (même modèle que §59).
2. **Anti-self** — `userId === caller.id` ⇒ 403. Un `owner` qui se rétrograde se verrouille dehors,
   et l'identité de soi a déjà sa surface.
3. **Périmètre** — hors superuser, la cible doit partager une **ORG active** avec l'appelant
   (lecture `user_org_membership` en service-role). Sans cette garde, un admin rang 30 de l'ORG A
   modifierait un compte de l'ORG B en connaissant son `userId`.
4. **Rôle plateforme** — un changement **vers ou depuis** `owner` / `super_admin` exige
   `api.is_platform_owner()` vrai **chez l'appelant**, sondé en tant qu'appelant.

### 5.3 Pourquoi la garde 4 doit être transcrite dans la route

`app_user_profile.role` est déjà gardé en base par le trigger
`api.enforce_app_user_profile_role_change` : « seul un `owner` peut attribuer `owner` ou
`super_admin` ». Mais ce trigger

- **sort d'emblée** quand `current_setting('request.jwt.claims', true) IS NULL`, et
- traite `auth.role() IN ('service_role','admin')` **comme un owner**.

Une écriture service-role depuis une route **neutralise donc la garde**. La sonde
`is_platform_owner()` de la route en est la transcription littérale ; sans elle, un `super_admin`
ou un admin rang 30 pourrait s'octroyer — ou octroyer — le rang plateforme. Un test doit l'asserter
explicitement : **403 sur un changement de rôle demandé par un non-owner**.

Nota : la valeur `super_admin` n'est **pas** couverte par `api.is_platform_owner()`, qui ne reconnaît
que `role = 'owner'` (et `service_role`/`admin`). Un `super_admin` peut donc administrer l'équipe
mais **pas** distribuer le rang plateforme. C'est la règle existante, on la préserve.

### 5.4 Extraction du préambule

Le bloc « JWT → `getUser` → client anon en tant qu'appelant → `is_platform_superuser` +
`current_user_admin_rank` » est identique dans `invite` et `delete-user`. Il est extrait dans
`app/api/admin/_authorize.ts` :

```ts
authorizeAdminRoute(req) → { ok: true, callerId, isSuper, rank } | { ok: false, response }
```

Les deux routes existantes sont re-pointées dessus **sans changement de comportement** (leurs tests
actuels doivent rester verts sans modification — c'est le critère). La garde de périmètre (n° 3)
n'est **pas** rétro-appliquée à `delete-user` : ce serait un changement de comportement hors
périmètre. Elle est consignée en différé au § 8.

---

## 6. Extension de `/api/avatar/upload`

Champ de formulaire optionnel `targetUserId`.

- Absent, ou égal à l'appelant ⇒ comportement actuel, inchangé (chemin dérivé du JWT).
- Présent et différent ⇒ gardes 1 à 3 du § 5.2, puis chemin dérivé du **`targetUserId` validé** —
  jamais du corps de requête tel quel.

La route persiste elle-même `avatar_url` ; sur le bras admin elle écrit la ligne de la cible en
service-role (la RLS `app_user_profile` n'autorise que soi-même ou un `owner`).

L'invariant « un seul écrivain du bucket » est préservé : pas de seconde route, pas de client
service-role ad hoc.

---

## 7. Vérification

**Rien n'est déclaré terminé sans preuve exécutée.**

### 7.1 Tests

| Fichier | Ce qu'il prouve |
|---|---|
| `app/api/admin/user-profile/route.test.ts` | 401 sans JWT · 403 rang insuffisant · 403 self · 403 hors périmètre · **403 rôle plateforme demandé par un non-owner** · 422 payload inconnu · 200 nominal |
| `app/api/admin/_authorize.test.ts` | Les trois issues du helper |
| `features/team/MemberProfileModal.test.tsx` | Libellé du bouton dérivé de `lastSeenAt` · champ rôle désactivé **avec motif accessible** pour un non-owner · avertissement e-mail rendu · **resynchronisation à l'ouverture sur un autre membre** (le piège §212 : monter A, rouvrir sur B, asserter que le champ porte B) |
| `features/team/MembersTable.test.tsx` (existant, étendu) | Bouton « Modifier » absent sur sa propre ligne |

Les tests existants d'`invite` et de `delete-user` doivent passer **sans être modifiés** après
l'extraction du helper.

### 7.2 Non-vacuité

Chaque garde de la route est éprouvée **des deux côtés** : le persona refusé reçoit 403 **et** le
persona autorisé reçoit 200. Une garde qui coupe tout le monde passe le premier test et casse le
produit (§213).

### 7.3 Vérification dans l'app tournante

Avant de déclarer terminé : ouvrir la modale sur un vrai membre, renommer, envoyer un lien,
constater l'e-mail reçu ou l'erreur de débit — et le dire, avec la sortie réelle.

---

## 8. Différés, avec raison

| Point | Raison | Débloqué par |
|---|---|---|
| `invite` et `delete-user` ne vérifient pas le périmètre d'ORG : un admin rang 30 de l'ORG A peut supprimer un compte de l'ORG B en connaissant son `userId` | Antérieur et étranger à cette passe ; le corriger changerait le comportement de deux routes en production | Passe dédiée sur les routes `/api/admin/*`, en réutilisant la garde n° 3 écrite ici |
| Langues, locale, fuseau du membre | Écartés à l'arbitrage : ce sont des préférences d'affichage, pas de l'identité — les éditer pour autrui est douteux | Demande PO |
| Un vrai courriel « Invitation » renvoyé sans détruire le compte | Exigerait de composer le message via le SMTP maison, donc de dupliquer le gabarit Supabase | Un besoin réel de gabarit d'invitation distinct |
| Journal des actions d'administration de compte (qui a changé quel e-mail, quand) | Aucune surface de lecture n'existerait pour le lire — même dette que `actor_contact_export_log` (§213) | Passe « écran d'imputabilité » |

---

## 9. Recette — ce qui reste à vérifier, et par qui (2026-08-29)

La suite automatisée est verte (**407 suites / 3374 tests**) et le **profil personnel** a été vérifié
dans l'application qui tourne. Le parcours Équipe, lui, n'a **pas** pu l'être : le panneau Équipe
n'apparaît pas en mode démo (`canAdministerTeam`), et l'atteindre exige une connexion avec un compte
réel — que l'assistant n'est pas autorisé à effectuer (saisir un mot de passe lui est interdit).

Les six points ci-dessous sont donc à faire à la main. Les deux derniers sont les seuls qui ne
peuvent pas être prouvés autrement qu'en vrai.

1. **La modale charge ce que le tableau ne connaît pas.** Ouvrir « Modifier » sur un membre : la
   photo et le rang plateforme doivent apparaître. Ils ne viennent pas du tableau — c'est la preuve
   que le `GET` de la route répond.
2. **Renommer.** Modifier le nom, enregistrer : toast de succès, et **la ligne du tableau porte le
   nouveau nom** après rechargement.
3. **Rouvrir sur un AUTRE membre.** Les champs doivent porter le second membre, pas le premier.
   (C'est le piège de réouverture : la modale reste montée pendant son animation de sortie.)
4. **Le champ « Rôle plateforme ».** Avec un compte `owner`, il est actif et l'enregistrement passe.
   Avec un `super_admin` **non** owner, il est désactivé **avec son motif affiché** — et une requête
   forgée à la main répondrait 403. Une garde qui coupe tout le monde passerait le premier test et
   casserait le produit : les deux moitiés comptent.
5. **Le bouton de lien.** Sur un compte jamais connecté il dit « Renvoyer l'invitation », sinon
   « Réinitialiser le mot de passe » — c'est **le même envoi**, seul le libellé change.
   **Vérifier la réception de l'e-mail**, ou relever le message de limite de débit (qui prouve aussi
   que l'appel part). Il doit être **en français**.
6. **« Envoyer un lien de connexion ».** Même vérification. Si les liens magiques sont désactivés au
   niveau du projet Supabase, l'appel échoue avec un message explicite : relever ce message exact et
   le signaler, plutôt que de conclure à une panne.

**À ne PAS tester en production** : la garde qui empêche un admin d'ORG de changer l'e-mail d'un
`owner` (§226 § 2). Elle est couverte par des tests automatisés vérifiés rouges par sabotage, et
l'éprouver en vrai supposerait de modifier l'adresse de connexion d'un compte réel.
