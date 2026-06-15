# Tâche liée à une interaction (CRM) — design

**Date :** 2026-06-14
**Statut :** plan validé en brainstorming (3 décisions PO confirmées) — en attente du feu vert avant implémentation.

## Objectif
Depuis le modal « Nouvelle interaction », pouvoir **créer une tâche de suivi liée** à l'interaction. Quand cette tâche passe en « Terminées », **proposer** (jamais automatiquement) de clôturer aussi l'interaction. La carte de tâche affiche un **retour visuel** du lien.

## Audit (état réel)
- `crm_task.related_interaction_id uuid REFERENCES crm_interaction(id) ON DELETE SET NULL` — **existe déjà** (0 lien live).
- `save_crm_task` **n'écrit pas** `related_interaction_id` (ni INSERT ni UPDATE).
- `list_crm_tasks` renvoie `related_interaction_subject` mais **pas** `related_interaction_id` ni le **statut** de l'interaction liée.
- `list_object_crm.tasks` ne renvoie rien sur l'interaction liée.
- `save_crm_interaction({id, status:'done'})` clôture déjà (status done + `resolved_at`) — réutilisé tel quel.
- `CrmInteractionModal` : ancré actorId (fiche) OU fixedContext (établissement) ; contexte « Général » (objet NULL) possible sur la fiche.
- `CrmTaches` : move via DnD + bouton « Avancer » ; mutation `saveCrmTask({id,status})` ; carte = `renderTicket`.
- `crm_task.object_id` est **NOT NULL** → une tâche exige toujours un établissement.

## Décisions verrouillées
1. **Établissement requis à la création d'interaction** (retrait de « Général » du modal de création ; pré-sélection quand l'acteur n'a qu'un établissement). `object_id` reste nullable en base (données « générales » importées + ancrage acteur des réponses préservés) ; le filtre « Général » de la timeline reste pour la consultation. ⇒ la tâche liée a **toujours** un objet, l'exception « Général » disparaît.
2. **Prompt de clôture sur tous les passages en Terminées** (DnD + bouton « Avancer »), uniquement si l'interaction liée n'est pas déjà `done`/`canceled`.
3. **Badge carte cliquable → fiche acteur** (ou vue établissement si pas d'acteur) où vit l'interaction.

## Mécanique
**A. Création tâche depuis l'interaction.** Le modal interaction gagne une section optionnelle « ☑ Créer une tâche de suivi » (titre — pré-rempli depuis le sujet si présent —, échéance, assigné via `listCrmAssignees`). À la soumission : `saveCrmInteraction(...)` → récupère `interactionId` → si l'option est cochée, `saveCrmTask({ objectId, actorId, title, dueAt, owner, relatedInteractionId: interactionId })`. L'établissement étant désormais requis, `objectId` est garanti. Échec partiel (interaction OK, tâche KO) : interaction conservée, erreur visible, le modal reste ouvert sur l'étape tâche.

**B. Clôture suggérée.** Après qu'un move met la tâche en `done` (DnD `handleDropOnColumn` ET bouton « Avancer » → `moveMutation` onSuccess), si `task.relatedInteractionId` est défini ET `task.relatedInteractionStatus` ∉ {done, canceled} : ouvrir un `CrmModal` « La tâche est liée à l'interaction « {sujet} ». La marquer aussi comme traitée ? » [Oui, clôturer / Non]. Oui → `saveCrmInteraction({ id: relatedInteractionId, status: 'done' })` + invalider les queries CRM. Le move de la tâche est persisté quoi qu'il arrive. Pas de réouverture auto si la tâche est rouverte.

**C. Retour visuel.** `renderTicket` : si `relatedInteractionId`, badge `↪ {relatedInteractionSubject}` (icône Link2) ; clic → `onOpenActor(actorId)` si présent, sinon `onOpenObject(objectId)` (stopPropagation, ne déclenche pas le DnD).

## Changements

### Backend (`migration_crm_module.sql` + tests ; déploiement live)
1. `save_crm_task` : accepter `related_interaction_id` (INSERT + UPDATE partiel « clé présente ⇒ écrite », clé+vide = détachement). Validation : l'interaction doit exister (P0002) et son `object_id` doit correspondre à l'`object_id` de la tâche (cohérence ; sinon 22023) — le gate objet de la tâche couvre déjà l'autorisation.
2. `list_crm_tasks` : ajouter `related_interaction_id` + `related_interaction_status` (depuis le LEFT JOIN `ri` existant ; `subject` déjà là).
3. `list_object_crm.tasks` : ajouter `related_interaction_id`/`subject`/`status` (cohérence).
4. Tests : save_crm_task écrit/détache le lien + valide la cohérence d'objet (22023 si objet différent) ; list_crm_tasks expose id+status ; auth inchangée.

### Frontend (TDD)
1. **Service/types** : `SaveCrmTaskInput.relatedInteractionId?` → payload `related_interaction_id`. `CrmTask` gagne `relatedInteractionId: string|null` + `relatedInteractionStatus: string|null` (le `relatedInteractionSubject` existe déjà). Parsers + mocks.
2. **`CrmInteractionModal`** : contexte établissement **requis** (retrait de l'option « Général » ; `canSubmit` exige un objet) ; section optionnelle « Créer une tâche de suivi » (titre/échéance/assigné) ; flux de soumission séquentiel interaction→tâche ; `onSaved` invalide aussi `['crm-tasks']`.
3. **`CrmTaches`** : badge interaction liée sur la carte (cliquable → fiche acteur) ; prompt de clôture après move→done (DnD + bouton) via un `CrmModal` ; appel `saveCrmInteraction({id,status:'done'})` + invalidation.
4. CSS : badge `.ticket__linked` (accent only, scoped `.crm-app`).

## Vérification
- Backend : test personas rejoué live (ROLLBACK) ; fresh-apply.
- Frontend : specs (service link, modal task-creation séquentiel, établissement requis, prompt de clôture sur les 2 chemins, badge cliquable) ; suite + tsc verts ; smoke navigateur démo (modal, badge, prompt).
- Invariants préservés : no-write-trap (option tâche/prompt gated `canWrite`), DnD locked assertions, a11y.

## Différés / non-objectifs
- Pas de réouverture auto de l'interaction si la tâche est rouverte (one-way).
- Pas de lien multi-tâches ↔ interaction côté modèle (une tâche → une interaction ; une interaction peut avoir plusieurs tâches, c'est déjà le cas via la FK).
- Navigation « scroll-to-interaction » précise dans le fil : on ouvre la fiche/vue, pas d'ancre vers la carte exacte (différé).
