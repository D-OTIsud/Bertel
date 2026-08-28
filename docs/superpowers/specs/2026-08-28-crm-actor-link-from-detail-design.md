# Ouvrir le CRM d'un acteur depuis la carte « Équipe interne » — conception

*2026-08-28 — demande PO. Frontend uniquement, aucun changement SQL.*

## Problème

Le tiroir de fiche (`ObjectDetailView` → section « Équipe interne ») rend les liens
`actor_object_role` de l'objet : nom, pastille de rôle, une coordonnée. Ces mêmes acteurs
ont une fiche CRM complète (`CrmActorFiche` : historique d'interactions, tâches, canaux,
documents, établissements liés) — mais aucun chemin ne relie les deux. Pour passer de
« qui exploite cet établissement » à « qu'est-ce qu'on s'est dit avec cette personne », il
faut aujourd'hui aller sur `/crm`, onglet Annuaire, et retrouver la personne à la main.

## Décision

La carte d'acteur devient **cliquable vers sa fiche CRM**, dans un **nouvel onglet**, pour
les utilisateurs **éditeurs ou plus** dont le périmètre CRM couvre cet acteur.

## 1. Destination et deep-link

`/crm?acteur=<actor.id>`.

`actor.id` est l'identifiant réel de la table `actor` — le leg `actors` de
`api.get_object_resource` émet `'id', a.id` (et non l'id du lien `actor_object_role`).
C'est le **même espace d'identifiants** que `CrmDirectoryEntry.actorId` et que le paramètre
`p_actor_id` de `api.list_actor_crm`. Aucune résolution intermédiaire n'est nécessaire.

`CrmPage` ne sait aujourd'hui lire que `?tab=` au montage. On ajoute `?acteur=` **au même
endroit et sur le même modèle** (lecture unique via `window.location.search` au mount,
priorité sur le nav persisté en `localStorage`) :

- `?acteur=<id>` → `{ view: 'annuaire', actorId: id }` ⇒ `CrmActorFiche` s'ouvre ; le bouton
  « Retour » de la fiche ramène à l'annuaire (comportement `backFromActor` existant).
- `?tab=` continue de fonctionner à l'identique.
- Si les deux sont présents, `?acteur=` gagne (c'est l'intention la plus précise) et `?tab=`
  ne sert qu'à choisir la vue de repli du retour, si valide.

Pas de risque d'éjection : l'effet qui renvoie vers l'annuaire quand une recherche CRM est
active ne se déclenche que si `effectiveCrmSearch(...)` est défini, or `useCrmSearchStore`
n'est **pas persisté** et l'onglet est neuf — le terme y est vide.

## 2. La garde — deux conditions, aucune requête supplémentaire

### (a) Éditeur ou plus — accès au module

Le lien n'existe que si `/crm` est un module accessible à la session :

```ts
visibleNavItems(role, demoMode, canEditObjects).some((item) => item.to === '/crm')
```

On **réutilise le registre unique** `NAV_ITEMS` (`config/nav-items.ts`) plutôt que de
retranscrire une quatrième fois la règle `roles: ['super_admin','tourism_agent'] +
requiresEdit`. Elle a déjà trois consommateurs (sidebar, palette ⌘K, nav mobile) et
`CrmPage` la redouble en redirection ; une transcription de plus dériverait au premier
changement de gating.

`canEditObjects` est exactement le signal « éditeur ou plus » du projet
(`api.current_user_can_edit_objects()` : superuser plateforme, admin d'ORG, ou l'une des
permissions `create_object` / `edit_canonical_when_publisher` / `edit_org_enrichment` /
`publish_object` — CLAUDE.md § Explorer non-published visibility). Un membre d'ORG en
lecture seule reste `tourism_agent` mais ne voit ni l'entrée CRM du menu, ni ce lien.

### (b) Périmètre CRM sur cet acteur — anti-lien-mort

`!actor.contactsRestricted`.

Ce n'est **pas un second palier de droits** : c'est la garde qui empêche d'offrir un lien
menant à une erreur. Un éditeur de l'ORG A regardant une fiche publiée par l'ORG B est bien
« éditeur ou plus », mais `api.list_actor_crm` lui répondra `42501` sur les acteurs de cette
fiche. La garde est **gratuite** (l'information est déjà dans le payload) et ne retire le
lien à aucun éditeur qui aurait pu s'en servir.

Démonstration que la condition est **suffisante** (donc qu'aucun lien affiché ne peut échouer) :

1. Le serveur émet `contacts_restricted = NOT api.can_read_actor_contacts(p_object_id)`, et
   `can_read_actor_contacts(obj) = superuser OR obj ∈ api.current_user_crm_object_ids()`
   (`migration_actor_contacts_org_gate.sql`).
2. `api.list_actor_crm` refuse en `42501` sauf si `api.user_can_read_crm_actor(acteur)`
   = `superuser OR acteur ∈ api.current_user_crm_actor_ids()`.
3. `current_user_crm_actor_ids()` contient **tout acteur lié par `actor_object_role` à un
   objet de `current_user_crm_object_ids()`** (`migration_crm_module.sql`).
4. Or cet acteur est rendu ici **précisément parce qu'il porte un lien `actor_object_role`
   vers cet objet** — c'est ce lien que le leg `actors` parcourt.

Donc `contactsRestricted === false` ⇒ (superuser, ou l'objet est dans le périmètre CRM et
l'acteur y est lié) ⇒ `list_actor_crm` autorise. **Zéro lien mort, zéro aller-retour réseau
par carte.**

> Corollaire à retenir : la clé `contacts_restricted` du payload est déjà, à la virgule
> près, le prédicat de périmètre CRM sur l'objet. Toute surface qui a besoin de savoir
> « cette session est-elle dans le CRM de cette fiche ? » peut la lire au lieu de sonder.

## 3. Rendu

Quand les deux conditions tiennent, la carte est rendue comme un `<a>` ; sinon elle reste le
`<div>` actuel, **strictement inchangé** (mêmes classes, même contenu, même dédup §3a).

- `class="detail-mini-card detail-mini-card--crm"` — la classe de base ne bouge pas, la
  modifieuse ne porte que l'affordance (curseur, hover, focus).
- `target="_blank" rel="noreferrer"` — le tiroir, les filtres et la sélection de l'Explorer
  survivent ; ⌘/ctrl-clic et clic-milieu marchent nativement (c'est un vrai `href`, pas un
  `onClick`).
- `aria-label="Ouvrir la fiche CRM de {nom}"` — sans lui, le lecteur d'écran annonce le
  contenu concaténé de la carte (« Mme Mélissa Fontaine Exploitant Mobile: 0692… lien »),
  qui ne dit pas où le lien mène.
- Une icône `ArrowUpRight` (lucide, 14 px, `aria-hidden`) dans l'en-tête, à côté de la
  pastille de rôle : seul signal **visible** que le lien est sortant.
- CSS : hover + `:where(:focus-visible)` (règle maison §139, `NEVER revert`), sans décalage
  de layout au survol.

La ligne meta n'est que du texte brut — ni `mailto:`/`tel:`, ni `CopyButton` (contrairement à
`ContactCard`) — donc rendre la carte entière cliquable ne capture aucun geste existant.

## 4. Périmètre explicitement exclu

- **Aucun changement SQL.** Les trois fonctions invoquées (`get_object_resource`,
  `list_actor_crm`, `user_can_read_crm_actor`) sont déployées et inchangées.
- **Aucune sonde par carte.** Pas d'appel `user_can_read_crm_actor` par acteur : ce serait un
  aller-retour réseau par ligne pour une information déjà présente dans le payload.
- **Pas de lien dégradé** vers l'annuaire pour un acteur hors périmètre. Un lien qui mène à
  une erreur est pire que pas de lien.
- **Le drawer ORG** (`ObjectDrawerShell`, `type === 'ORG'`) n'est pas concerné : il ne rend
  pas `ObjectDetailView`.

## 5. Vérification

Quatre tests RTL, aucun framework ni fixture nouveaux (`useSessionStore.setState` est déjà le
levier de persona des tests de ce fichier) :

1. **Éditeur, acteur dans le périmètre** (`canEditObjects: true`, `contacts_restricted`
   absent/false) → `getByRole('link', { name: /fiche CRM de Jean Dupont/i })` avec
   `href="/crm?acteur=actor-1"` et `target="_blank"`.
2. **Lecteur seul** (`canEditObjects: false`) → aucun lien, **et le nom reste affiché** : la
   garde retire l'affordance, pas l'information.
3. **Éditeur hors périmètre** (`contacts_restricted: true`) → aucun lien, et le message
   « Coordonnées réservées à l'organisation éditrice. » reste (non-régression §208).
4. **`CrmPage`** : monté avec `?acteur=<id>` → la fiche acteur est ouverte ; monté avec
   `?tab=taches` → l'onglet Tâches, inchangé.

Le test 2 est la garde non vacante : neutraliser la condition (a) doit le faire rougir.

## 6. Fichiers touchés

| Fichier | Changement |
|---|---|
| `src/features/object-drawer/ObjectDetailView.tsx` | `TeamSection` accepte `crmHrefFor: (actor) => string \| null` ; le registre le calcule depuis `visibleNavItems` |
| `src/views/CrmPage.tsx` | lecture de `?acteur=` au mount, en miroir de `?tab=` |
| `src/styles.css` | `.detail-mini-card--crm` (hover + focus-visible) |
| `src/features/object-drawer/ObjectDetailView.test.tsx` | tests 1–3 |
| `src/views/CrmPage` (test) | test 4 |
