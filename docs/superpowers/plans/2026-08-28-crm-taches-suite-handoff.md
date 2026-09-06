# Handoff — CRM Tâches, 3 objectifs de suite (session du 2026-08-28)

> **À coller tel quel en ouverture de la nouvelle session.** Tout ce qui suit a été vérifié
> contre la base de production et le code déployé le 2026-08-28 — ce ne sont pas des
> suppositions à re-établir.

---

## Ce que tu dois obtenir

**1. Le modal de création de tâche est trop petit — sélectionner des personnes y est pénible.**
Il faut que choisir un ou plusieurs assignés soit confortable, y compris quand l'équipe
compte plusieurs dizaines de personnes.

**2. On ne peut toujours pas rattacher une tâche à une demande CRM.**
Il faut pouvoir **créer une tâche depuis la carte d'une demande** (l'interaction racine),
avec le lien déjà posé.

**3. Le filtre calendaire du kanban ne fait bouger que la colonne « Terminées ».**
« À faire » et « En cours » ne réagissent pas. Il faut que le filtre de période ait un effet
compréhensible et visible sur les trois colonnes.

---

## État de départ — lis ceci avant de toucher au code

- **La migration `16z` est APPLIQUÉE EN PRODUCTION** (`migration_crm_task_multi_assignee_notifications.sql`).
  Base = nouveau schéma. Assignation multiple, `crm_task.created_by`, `app_notification`.
- **Branche `codex/fix-document-type-list` poussée à `9dcdcfa`**, à jour de `origin/master`.
- **`master` est resté à `fb5f296` : le FRONT n'est PAS déployé.** La fusion dans `master`
  déclenche le build Coolify, donc le déploiement du frontend aux utilisateurs. En production
  tourne aujourd'hui **l'ancien front sur le nouveau backend** (prévu : `owner_id`/`owner_name`
  survivent dans les RPC de lecture).
- Contexte complet : `lot1_mapping_decisions.md` §218 et `docs/SQL_ROLLOUT_RUNBOOK.md` § 16z.

---

## Objectif 1 — modal de création trop étroit

**Constat de code.** `.crm-app .crm-modal` est plafonné à **`max-width: 560px`**
(`src/styles.css`, règle `.crm-app .crm-modal`), pour TOUS les modals CRM. Le sélecteur
« Attribuer à » est un `SearchMultiSelect` (popover maison) rendu **dans** ce modal :
`src/components/ui/pickers/SearchMultiSelect.tsx`, utilisé par
`src/features/crm/CrmTaskModal.tsx` et `CrmInteractionModal.tsx`.

**Pistes, à arbitrer — ce n'est pas qu'une histoire de largeur :**
- une taille au cas par cas plutôt qu'un plafond unique (`CrmModal` n'accepte aujourd'hui
  aucune prop de taille — cf. `src/features/crm/CrmModal.tsx`) ;
- la liste d'options du popover est plafonnée en hauteur (`.picker__options`), et les puces
  s'empilent sous le déclencheur : au-delà de quelques personnes, ça pousse le contenu ;
- la recherche du picker existe déjà (`fold()`), mais rien n'indique combien d'options sont
  masquées par le filtre.

**Contraintes.** Ne PAS importer `ChipMultiSelect` (`object-editor/primitives`) : il ouvre une
modale, ce qui créerait une modale dans une modale. C'est la raison d'être de
`SearchMultiSelect`. Garder le popover.

---

## Objectif 2 — créer une tâche depuis une demande

**Ce qui existe déjà, et qu'il ne faut pas refaire :**
- `crm_task.related_interaction_id` existe, et `api.save_crm_task` **valide déjà** que
  l'interaction liée appartient au MÊME établissement (`22023` sinon, `P0002` si inconnue).
- Le service front accepte déjà `relatedInteractionId` (`src/services/crm.ts`,
  `SaveCrmTaskInput`).
- Le kanban affiche déjà le badge « interaction liée » et propose la clôture de la demande
  quand la tâche passe en `done` (`CrmTaches.tsx`, prompt `closePrompt`).

**Ce qui manque — c'est tout le travail :** il n'existe aucun point d'entrée « créer une
tâche » **sur une demande existante**. Le seul chemin actuel est le flux en deux temps du
`CrmInteractionModal` : on ne peut poser le lien qu'**au moment où l'on consigne**
l'interaction, jamais après.

**Ancrages précis :**
- La carte de demande est `TlCard`, `src/features/crm/crm-primitives.tsx:666`. Elle reçoit
  déjà une prop `actions?: CrmThreadActions` (réponse, bascule de statut) — c'est là que
  s'ajoute naturellement une action « Créer une tâche ».
- `CrmTaskModal` est déjà monté par `CrmActorFiche.tsx:672` et `CrmTaches.tsx:464`, mais
  **n'accepte pas `relatedInteractionId`** : c'est la prop à ajouter, puis à passer au
  `saveCrmTask`.
- Les surfaces qui rendent des demandes : `CrmActorFiche.tsx`, `CrmObjectView.tsx`
  (et la timeline via `crm-primitives`).

**A priori frontend-only** — le backend est prêt. Vérifie-le plutôt que de me croire.

---

## Objectif 3 — le filtre calendaire semble mort sur « À faire » / « En cours »

**Ce n'est pas le prédicat qui est faux. Mesuré en production le 2026-08-28 :**

| statut | tâches | avec échéance | sans échéance |
| --- | --- | --- | --- |
| `todo` | 2 | **0** | 2 |
| `done` | 2 | 1 | 1 |

**Aucune tâche « à faire » n'a d'échéance.** Or la case « Inclure sans échéance » est cochée
par défaut (décision produit assumée : ne pas faire disparaître du travail réel derrière un
filtre de date qui ne le concerne pas). Conséquence : les tâches sans échéance traversent le
filtre quoi qu'il arrive, donc **seule la colonne qui contient une tâche datée bouge**.

Le prédicat est en `src/features/crm/crm-task-filters.ts` (`isTaskInDateRange`) et il est
couvert par `crm-task-filters.test.ts` — bornes incluses, jours calendaires, plage inversée
non appliquée. **Ne le "répare" pas sans avoir reproduit un vrai défaut** : le comportement
observé s'explique entièrement par les données.

**Le vrai problème est donc produit, et il y a plusieurs sorties possibles :**
- rendre l'échappement VISIBLE (« N tâches sans échéance affichées quelle que soit la
  période »), au lieu d'une case à cocher qu'on ne remarque pas ;
- revoir le défaut de la case ;
- s'attaquer à la cause : **rien n'oblige à saisir une échéance** à la création
  (`CrmTaskModal`, champ « Échéance » facultatif), et personne n'en met.

Arbitre avec le PO plutôt que de choisir seul. Et **si tu changes le défaut ou la règle,
change le test avec, en disant pourquoi la prémisse précédente était fausse.**

---

## Invariants à ne pas casser (chèrement acquis — 15 sabotages les gardent)

- **`assignees` est la source de vérité**, pas `crm_task.owner`. `owner` ne survit que comme
  valeur de compatibilité de déploiement (plus petit uuid trié). Aucune logique neuve ne doit
  le lire. Tout filtre/appartenance se fait sur l'**UUID**, jamais sur un nom affiché.
- **Le réconcile d'assignation est non destructif** : calculer le diff AVANT d'écrire,
  `INSERT … ON CONFLICT`, `DELETE` du reliquat EN DERNIER. Sinon la provenance des assignés
  inchangés est réécrite et **tout le monde est re-notifié à chaque enregistrement**.
- **Seuls les entrants sont notifiés**, jamais l'auteur de l'action (`IS DISTINCT FROM`,
  jamais `<>` : `auth.uid()` est NULL hors contexte HTTP).
- **Aucune provenance inventée** : `created_by`, `assigned_by`, `assigned_at` restent NULL
  quand on ne sait pas. L'UI dit « Créateur inconnu », elle ne devine pas.
- **`app_notification.payload` ne contient AUCUN nom** : tout libellé est joint à la lecture,
  pour rester dans la portée de l'effacement RGPD.
- **Pas de RPC de comptage des non-lues** : une cardinalité ne dit pas de quoi la boîte est
  faite. La pastille se lit dans `unread_count` de `list_my_notifications`.
- Une garde ajoutée doit être **prouvée non vacante** par sabotage, et **ne doit pas dupliquer
  la règle qu'elle surveille** (sinon elle vérifie sa propre copie).

---

## Vérification

```bash
cd bertel-tourism-ui && npm run test:run && npm run typecheck && npm run build
```

Garde SQL contre la base vive (transaction annulée, ne persiste rien) :

```bash
node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/tests/test_crm_task_multi_assignee.sql"
```

Suite complète de référence au moment du handoff : **397 suites / 3146 tests**, `tsc` propre,
build vert.

---

## Pièges déjà payés dans cette passe — ne les repaie pas

- Le `<select>` natif d'un filtre et le popover maison portent tous deux `role="option"` :
  toute requête d'option dans un test doit être bornée par `within(...)`.
- Le déclencheur du `SearchMultiSelect` ET la puce affichent le même nom : un `getByText` nu
  trouve deux nœuds. Viser `getByRole('combobox', { name: … })` et `toHaveTextContent`.
- `unreadCount`/compteurs valent 0 pendant que la requête est en vol : attendre `toBe(0)` ne
  prouve pas que la réponse est arrivée. Partir d'un état non vide, ou attendre l'appel.
- Une lecture directe de table sous `SET LOCAL ROLE authenticated` dans un test SQL rend 0
  ligne (RLS) ou lève une erreur de permission : les vérifications d'état se font hors persona.
- `docs/superpowers/plans/2026-08-28-instructions-lot-corrections.md` est un fichier non suivi
  qui n'appartient pas à cette passe — ne pas le committer.
