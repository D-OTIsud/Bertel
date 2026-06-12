"use client";

// Modal « Nouvelle tâche » (§61 rectif PO point 3 + assignation PO point 4) — deux points
// d'entrée :
// - fiche acteur (picker='select') : établissement REQUIS parmi les établissements de
//   l'acteur (la tâche est ancrée objet) ; la tâche est rattachée à l'acteur (actorId).
//   Si l'acteur n'a QU'UN établissement, il est pré-coché (PO point 3).
// - onglet Tâches (picker='datalist') : résolution nom → id sur la datalist annuaire
//   (comportement historique conservé), sans rattachement acteur (pas d'auto-sélection :
//   datalist sur tout l'annuaire).
// Les DEUX entrées portent un sélecteur « Attribuer à » (PO point 4) — défaut = utilisateur
// courant ; l'id choisi part en `owner` (validé serveur, membre de l'ORG).
// Toujours ouvert sous gating write_crm_notes (boutons d'ouverture désactivés sinon).

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listCrmAssignees, saveCrmTask } from '../../services/crm';
import { useSessionStore } from '../../store/session-store';
import { CrmModal } from './CrmModal';

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
  const [objectName, setObjectName] = useState(''); // mode datalist
  const [dueAt, setDueAt] = useState('');
  // Assignation PO point 4 : défaut = utilisateur courant tant qu'il n'a pas choisi ('' →
  // résolu au submit pour préférer l'utilisateur courant s'il est dans la liste, sinon le
  // 1er option ; liste vide ⇒ owner omis, le backend retombe sur self).
  const [owner, setOwner] = useState<string>('');

  const resolvedObject =
    picker === 'select'
      ? objectOptions.find((object) => object.objectId === objectId) ?? null
      : objectOptions.find((object) => object.objectName.trim().toLowerCase() === objectName.trim().toLowerCase()) ?? null;

  // Owner effectif : choix explicite > utilisateur courant (s'il figure dans la liste) >
  // 1er assignable > aucun (omis). Jamais bloquant.
  const resolvedOwner =
    owner ||
    (currentUserId && assignees.some((a) => a.userId === currentUserId) ? currentUserId : assignees[0]?.userId) ||
    '';

  const createMutation = useMutation({
    mutationFn: () => {
      if (!resolvedObject) return Promise.reject(new Error('Établissement non résolu'));
      return saveCrmTask({
        objectId: resolvedObject.objectId,
        ...(actorId ? { actorId } : {}),
        title: title.trim(),
        dueAt: dueAt || null,
        ...(resolvedOwner ? { owner: resolvedOwner } : {}),
      });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const canSubmit = Boolean(title.trim()) && Boolean(resolvedObject) && !createMutation.isPending;

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
        {picker === 'select' ? (
          <select
            className="crm-select"
            aria-label="Établissement"
            value={objectId}
            onChange={(event) => setObjectId(event.target.value)}
          >
            <option value="">— Choisir un établissement —</option>
            {objectOptions.map((object) => (
              <option key={object.objectId} value={object.objectId}>
                {object.objectName}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              aria-label="Établissement"
              placeholder="Établissement (nom exact)"
              list="crm-task-modal-objects"
              value={objectName}
              onChange={(event) => setObjectName(event.target.value)}
            />
            <datalist id="crm-task-modal-objects">
              {objectOptions.map((object) => (
                <option key={object.objectId} value={object.objectName} />
              ))}
            </datalist>
          </>
        )}
      </label>
      {picker === 'datalist' && objectName.trim() !== '' && !resolvedObject && (
        <p className="crm-field__hint">Établissement introuvable dans l&apos;annuaire — choisissez un nom de la liste.</p>
      )}

      <label className="crm-field">
        Échéance
        <input aria-label="Échéance" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </label>

      {/* Assignation PO point 4 : référent de la tâche. Pré-sélectionne l'utilisateur
          courant (resolvedOwner). Rendu seulement si l'on connaît au moins un assignable. */}
      {assignees.length > 0 && (
        <label className="crm-field">
          Attribuer à
          <select
            className="crm-select"
            aria-label="Attribuer à"
            value={resolvedOwner}
            onChange={(event) => setOwner(event.target.value)}
          >
            {assignees.map((assignee) => (
              <option key={assignee.userId} value={assignee.userId}>
                {assignee.displayName}
              </option>
            ))}
          </select>
        </label>
      )}

      {createMutation.isError && (
        <div className="inline-alert" role="alert">
          Échec de la création : {(createMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
