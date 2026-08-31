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
import type { CrmTimelineCardItem } from './crm-primitives';
import { SearchMultiSelect, SearchSelect } from '../../components/ui/pickers';

/**
 * Création d'une tâche DEPUIS une demande (carte du fil). Enveloppe `CrmTaskModal` avec le
 * verrou d'établissement et le lien d'interaction déjà posés — les trois surfaces qui
 * rendent un fil (fiche acteur, vue établissement, timeline) la montent à l'identique, ce
 * qui évite trois copies du même câblage et donc trois occasions de diverger.
 *
 * Ne rend RIEN si l'interaction n'a pas d'établissement : le serveur refuserait le lien
 * (22023). Ce cas est déjà annoncé côté carte par un bouton désactivé avec sa raison, il
 * n'est donc pas silencieux.
 */
export function CrmTaskFromInteractionModal({
  interaction,
  actorId,
  onClose,
  onSaved,
}: {
  interaction: CrmTimelineCardItem;
  /** Force l'acteur (la fiche acteur le connaît par sa route ; ses cartes ne le portent pas). */
  actorId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!interaction.objectId) return null;
  const fixedObject = {
    objectId: interaction.objectId,
    objectName: interaction.objectName ?? interaction.objectId,
  };
  const resolvedActorId = actorId ?? interaction.actorId ?? undefined;
  return (
    <CrmTaskModal
      picker="select"
      // `fixedObject` verrouille l'affichage ; `objectOptions` fait résoudre `resolvedObject`
      // (sans quoi « Créer » resterait grisé sans explication).
      fixedObject={fixedObject}
      objectOptions={[fixedObject]}
      relatedInteractionId={interaction.id}
      {...(resolvedActorId ? { actorId: resolvedActorId } : {})}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export function CrmTaskModal({
  actorId,
  objectOptions,
  picker,
  fixedObject,
  relatedInteractionId,
  onClose,
  onSaved,
}: {
  /** Fiche acteur : rattache la tâche à l'acteur (save_crm_task.actor_id). */
  actorId?: string;
  objectOptions: Array<{ objectId: string; objectName: string }>;
  picker: 'select' | 'datalist';
  /**
   * Établissement IMPOSÉ (création depuis une demande) : rendu en lecture seule au lieu du
   * picker. Le verrou est ÉNONCÉ, pas subi — passer une seule option verrouillerait de fait
   * aujourd'hui (pré-sélection + pas de ligne « Aucun »), mais un futur `allowClear` ou une
   * seconde option rouvrirait le refus serveur 22023 sans que rien ne le signale.
   * L'hôte doit AUSSI le passer dans `objectOptions`, sinon `resolvedObject` reste nul et
   * le bouton « Créer » est mort sans explication.
   */
  fixedObject?: { objectId: string; objectName: string };
  /**
   * Interaction de suivi à lier (§66). `api.save_crm_task` valide que son `object_id` est
   * celui de la tâche — d'où `fixedObject`, qui rend ce refus impossible côté UI.
   */
  relatedInteractionId?: string;
  onClose: () => void;
  /** Appelé APRÈS écriture confirmée — la vue invalide ses queries. */
  onSaved: () => void;
}) {
  const currentUserId = useSessionStore((state) => state.userId);
  const assigneesQuery = useQuery({ queryKey: ['crm-assignees'], queryFn: listCrmAssignees });
  const assignees = assigneesQuery.data ?? [];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Auto-sélection PO point 3 : en mode select avec UN SEUL établissement, on le pré-coche
  // (le champ est requis ⇒ formulaire plus proche du submit). Sinon vide (choix explicite).
  const [objectId, setObjectId] = useState(() => {
    if (fixedObject) return fixedObject.objectId;
    return picker === 'select' && objectOptions.length === 1 ? objectOptions[0].objectId : '';
  });
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
        // Clé ABSENTE quand il n'y a pas de lien : le RPC lit `payload ? 'related_interaction_id'`,
        // une clé présente à '' vaudrait un détachement explicite.
        ...(relatedInteractionId ? { relatedInteractionId } : {}),
        // Clé ABSENTE quand vide à la création : ne rien écrire ≠ écrire un effacement.
        ...(description.trim() ? { description: description.trim() } : {}),
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
      // Le titre DIT le lien : c'est la seule chose qui distingue ce formulaire du formulaire
      // libre, et l'établissement en lecture seule serait autrement inexpliqué.
      title={relatedInteractionId ? 'Nouvelle tâche liée à la demande' : 'Nouvelle tâche'}
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
        Description
        <textarea
          aria-label="Description de la tâche"
          placeholder="Décrire la tâche (optionnel)"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <label className="crm-field">
        Établissement
        {fixedObject ? (
          // Lecture seule assumée : la tâche hérite de l'établissement de la demande, et le
          // serveur refuserait tout autre choix (22023). On ne rend PAS un picker désactivé —
          // SearchSelect n'a pas de prop `disabled`, et lui en ajouter une toucherait un
          // composant partagé bien au-delà du CRM.
          <span className="crm-field__static">{fixedObject.objectName}</span>
        ) : (
          <SearchSelect
            aria-label="Établissement"
            value={objectId}
            options={objectOptions.map((object) => ({ code: object.objectId, label: object.objectName }))}
            onChange={setObjectId}
            placeholder="— Choisir un établissement —"
            searchPlaceholder="Rechercher un établissement…"
          />
        )}
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
