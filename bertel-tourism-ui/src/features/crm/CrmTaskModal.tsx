"use client";

// Modal « Nouvelle tâche » (§61 rectif PO point 3) — deux points d'entrée :
// - fiche acteur (picker='select') : établissement REQUIS parmi les établissements de
//   l'acteur (la tâche est ancrée objet) ; la tâche est rattachée à l'acteur (actorId).
// - onglet Tâches (picker='datalist') : résolution nom → id sur la datalist annuaire
//   (comportement historique conservé), sans rattachement acteur.
// Toujours ouvert sous gating write_crm_notes (boutons d'ouverture désactivés sinon).

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { saveCrmTask } from '../../services/crm';
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
  const [title, setTitle] = useState('');
  const [objectId, setObjectId] = useState(''); // mode select
  const [objectName, setObjectName] = useState(''); // mode datalist
  const [dueAt, setDueAt] = useState('');

  const resolvedObject =
    picker === 'select'
      ? objectOptions.find((object) => object.objectId === objectId) ?? null
      : objectOptions.find((object) => object.objectName.trim().toLowerCase() === objectName.trim().toLowerCase()) ?? null;

  const createMutation = useMutation({
    mutationFn: () => {
      if (!resolvedObject) return Promise.reject(new Error('Établissement non résolu'));
      return saveCrmTask({
        objectId: resolvedObject.objectId,
        ...(actorId ? { actorId } : {}),
        title: title.trim(),
        dueAt: dueAt || null,
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

      {createMutation.isError && (
        <div className="inline-alert" role="alert">
          Échec de la création : {(createMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
