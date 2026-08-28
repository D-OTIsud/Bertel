"use client";

// Modal « Nouvelle tâche » (§61 rectif PO point 3 + assignation PO point 4) — deux points
// d'entrée. L'établissement se choisit dans un SearchSelect (picker maison : combobox +
// recherche), qui ne propose que des options valides ⇒ résolution par objectId, plus de
// saisie libre nom → id. Le prop `picker` ne gouverne plus que l'état initial :
// - fiche acteur (picker='select') : établissement REQUIS parmi les établissements de
//   l'acteur (la tâche est ancrée objet) ; la tâche est rattachée à l'acteur (actorId).
//   Si l'acteur n'a QU'UN établissement, il est pré-sélectionné (PO point 3).
// - onglet Tâches (picker='datalist') : annuaire complet, sans rattachement acteur et SANS
//   pré-sélection (le choix reste explicite parmi tout l'annuaire).
// Les DEUX entrées portent un sélecteur « Attribuer à » — 16w : sélection MULTIPLE, défaut =
// utilisateur courant ; les ids choisis partent en `assigneeIds` (chacun validé serveur comme
// membre de l'ORG ; un ensemble vide est refusé côté serveur ET côté bouton).
// Toujours ouvert sous gating write_crm_notes (boutons d'ouverture désactivés sinon).

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listCrmAssignees, saveCrmTask } from '../../services/crm';
import { useSessionStore } from '../../store/session-store';
import { CrmModal } from './CrmModal';
import { SearchMultiSelect, SearchSelect } from '../../components/ui/pickers';

export function CrmTaskModal({
  actorId,
  objectOptions,
  picker,
  onClose,
  onSaved,
}: {
  /** Fiche acteur : rattache la tâche à l'acteur (save_crm_task.actor_id). */
  actorId?: string;
  objectOptions: Array<{ objectId: string; objectName: string }>;
  picker: 'select' | 'datalist';
  onClose: () => void;
  /** Appelé APRÈS écriture confirmée — la vue invalide ses queries. */
  onSaved: () => void;
}) {
  const currentUserId = useSessionStore((state) => state.userId);
  const assigneesQuery = useQuery({ queryKey: ['crm-assignees'], queryFn: listCrmAssignees });
  const assignees = assigneesQuery.data ?? [];

  const [title, setTitle] = useState('');
  // Auto-sélection PO point 3 : en mode select avec UN SEUL établissement, on le pré-coche
  // (le champ est requis ⇒ formulaire plus proche du submit). Sinon vide (choix explicite).
  const [objectId, setObjectId] = useState(() =>
    picker === 'select' && objectOptions.length === 1 ? objectOptions[0].objectId : '',
  );
  const [dueAt, setDueAt] = useState('');
  // 16w — `null` = « l'utilisateur n'a encore rien choisi », distinct de `[]` = « il a tout
  // décoché ». La sélection effective est DÉRIVÉE : le défaut s'applique donc même si la
  // liste des assignables arrive APRÈS l'ouverture du modal (aucune sélection perdue), et
  // le moindre geste de l'utilisateur l'emporte définitivement.
  const [pickedAssignees, setPickedAssignees] = useState<string[] | null>(null);

  // Les deux modes (fiche acteur / onglet Tâches) résolvent désormais par objectId : le
  // SearchSelect ne rend que des options valides (plus de saisie libre nom → id fragile).
  const resolvedObject = objectOptions.find((object) => object.objectId === objectId) ?? null;

  const defaultAssignees = useMemo(() => {
    if (assignees.length === 0) return [];
    if (currentUserId && assignees.some((a) => a.userId === currentUserId)) return [currentUserId];
    return [assignees[0].userId];
  }, [assignees, currentUserId]);
  const selectedAssignees = pickedAssignees ?? defaultAssignees;

  const createMutation = useMutation({
    mutationFn: () => {
      if (!resolvedObject) return Promise.reject(new Error('Établissement non résolu'));
      return saveCrmTask({
        objectId: resolvedObject.objectId,
        ...(actorId ? { actorId } : {}),
        title: title.trim(),
        dueAt: dueAt || null,
        assigneeIds: selectedAssignees,
      });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  // Au moins une personne : la garde est ici ET côté serveur (22023). On ne soumet jamais
  // un tableau vide « pour voir ».
  const canSubmit =
    Boolean(title.trim()) &&
    Boolean(resolvedObject) &&
    selectedAssignees.length > 0 &&
    !createMutation.isPending;

  return (
    <CrmModal
      title="Nouvelle tâche"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="crm-btn primary" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
            Créer
          </button>
        </>
      }
    >
      <label className="crm-field">
        Titre
        <input
          aria-label="Titre de la tâche"
          placeholder="Titre de la tâche"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="crm-field">
        Établissement
        <SearchSelect
          aria-label="Établissement"
          value={objectId}
          options={objectOptions.map((object) => ({ code: object.objectId, label: object.objectName }))}
          onChange={setObjectId}
          placeholder="— Choisir un établissement —"
          searchPlaceholder="Rechercher un établissement…"
        />
      </label>

      <label className="crm-field">
        Échéance
        <input aria-label="Échéance" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </label>

      {/* 16w — assignation MULTIPLE. Le champ reste rendu même en chargement/erreur : le
          masquer ferait disparaître une contrainte de soumission sans l'expliquer. */}
      <label className="crm-field">
        Attribuer à
        <SearchMultiSelect
          aria-label="Attribuer à"
          values={selectedAssignees}
          options={assignees.map((assignee) => ({ code: assignee.userId, label: assignee.displayName }))}
          onChange={setPickedAssignees}
          placeholder="— Choisir une ou plusieurs personnes —"
          searchPlaceholder="Rechercher une personne…"
          emptyLabel={
            assigneesQuery.isLoading
              ? 'Chargement des personnes…'
              : assigneesQuery.isError
                ? 'Impossible de charger les personnes.'
                : 'Aucune personne assignable'
          }
        />
      </label>
      {selectedAssignees.length === 0 && !assigneesQuery.isLoading && (
        <p className="crm-field__hint">Choisissez au moins une personne.</p>
      )}

      {createMutation.isError && (
        <div className="inline-alert" role="alert">
          Échec de la création : {(createMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
