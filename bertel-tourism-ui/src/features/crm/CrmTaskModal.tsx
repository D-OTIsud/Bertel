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

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Trash2, Upload } from 'lucide-react';
import { listCrmAssignees, saveCrmTask } from '../../services/crm';
import { deleteTaskDocument, getTaskDocumentUrl, uploadTaskDocument } from '../../services/task-documents';
import { useSupabaseAccessToken } from '../../hooks/useSupabaseAccessToken';
import { useSessionStore } from '../../store/session-store';
import { CrmModal } from './CrmModal';
import type { CrmTimelineCardItem } from './crm-primitives';
import { SearchMultiSelect, SearchSelect } from '../../components/ui/pickers';
import type { CrmTask } from '../../types/domain';

/**
 * Taille lisible d'une pièce jointe. `null` est une garde SQL DÉLIBÉRÉE (taille illisible
 * côté serveur, cf. Task 7) et doit rester distinguable d'une taille de 0 octet — les
 * confondre ferait mentir l'interface (« 0 Ko » n'est pas « on ne sait pas »).
 */
function formatDocumentSize(value: number | null): string {
  if (value === null) return 'taille inconnue';
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

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
  task,
  actorId,
  objectOptions,
  picker,
  fixedObject,
  relatedInteractionId,
  onClose,
  onSaved,
}: {
  /**
   * Mode ÉDITION : tâche existante pré-remplie, établissement verrouillé (le serveur
   * accepterait un déplacement mais on ne l'offre pas), soumission par `saveCrmTask({id,…})`
   * — la description est TOUJOURS envoyée (`''` = effacement, NULLIF serveur). La Task 9
   * y accrochera la section pièces jointes.
   */
  task?: CrmTask;
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

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  // Auto-sélection PO point 3 : en mode select avec UN SEUL établissement, on le pré-coche
  // (le champ est requis ⇒ formulaire plus proche du submit). Sinon vide (choix explicite).
  // En édition, l'établissement vient de la tâche elle-même (verrouillé, cf. rendu plus bas).
  const [objectId, setObjectId] = useState(() => {
    if (task) return task.objectId;
    if (fixedObject) return fixedObject.objectId;
    return picker === 'select' && objectOptions.length === 1 ? objectOptions[0].objectId : '';
  });
  const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.slice(0, 10) : '');
  // 16w — `null` = « l'utilisateur n'a encore rien choisi », distinct de `[]` = « il a tout
  // décoché ». La sélection effective est DÉRIVÉE : le défaut s'applique donc même si la
  // liste des assignables arrive APRÈS l'ouverture du modal (aucune sélection perdue), et
  // le moindre geste de l'utilisateur l'emporte définitivement.
  // En édition, les assignés actuels de la tâche jouent le rôle du « déjà choisi » : pas de
  // défaut à calculer, ils sont connus dès le départ.
  const [pickedAssignees, setPickedAssignees] = useState<string[] | null>(
    task ? task.assignees.map((assignee) => assignee.userId) : null,
  );

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
      if (task) {
        // Édition : update PARTIEL par id. `objectId` n'est jamais envoyé — l'établissement
        // est verrouillé côté UI, et l'omettre de fait interdit tout déplacement, même si le
        // serveur l'accepterait. La description est TOUJOURS envoyée : '' = effacement
        // explicite (le serveur la convertit en NULL via NULLIF), contrairement à la
        // création où la clé absente signifie « ne rien écrire ».
        return saveCrmTask({
          id: task.id,
          title: title.trim(),
          description: description.trim(),
          dueAt: dueAt || null,
          assigneeIds: selectedAssignees,
        });
      }
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

  // Task 9 — pièces jointes (mode ÉDITION uniquement, cf. rendu plus bas). Les trois
  // mutations appellent `onSaved()` (invalide `crm-tasks`, la liste `task.documents` se
  // rafraîchit) mais NE FERMENT PAS le modal : contrairement à `createMutation`, l'utilisateur
  // doit pouvoir enchaîner plusieurs ajouts/suppressions sans rouvrir la fenêtre. `task!`/
  // `accessToken!` : ces mutations ne sont déclenchables que par des boutons désactivés tant
  // que `task`/`accessToken` sont absents (cf. rendu), jamais appelées hors de ce cas.
  const accessToken = useSupabaseAccessToken();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bannière d'erreur = état local UNIQUE, plutôt que dérivée en cascade des trois
  // `mutation.error` (upload ?? delete ?? open). Raison : `error` d'une `useMutation`
  // react-query v5 n'est remise à zéro QUE quand cette même mutation est rejouée — une
  // cascade de `??` peut donc afficher l'échec d'une mutation A alors qu'une mutation B,
  // postérieure, vient de RÉUSSIR (A n'a jamais été rejouée, son `error` traîne). Avec un
  // état local effacé au DÉBUT de chaque action (`onMutate`, avant même de savoir si elle
  // va réussir) et renseigné seulement à l'échec (`onError`), chaque mutation porte sa
  // propre règle sans avoir besoin de connaître ses sœurs. C'est délibérément préféré à
  // « reset() des deux autres mutations à chaque déclenchement » : ce second schéma est
  // symétrique en O(n²) entre mutations (ajouter une 4e action document imposerait de
  // penser à la reset-er ET à la faire reset-er par les trois existantes) — un oubli
  // reproduirait exactement ce bug sans qu'aucun test unitaire isolé par mutation ne
  // l'attrape. L'état local, lui, reste correct par construction quel que soit le nombre
  // de mutations futures.
  const [documentError, setDocumentError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadTaskDocument({ taskId: task!.id, file, accessToken: accessToken! }),
    onMutate: () => setDocumentError(null),
    onSuccess: () => onSaved(),
    onError: (error) => setDocumentError((error as Error).message),
  });
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteTaskDocument({ taskId: task!.id, documentId, accessToken: accessToken! }),
    onMutate: () => setDocumentError(null),
    onSuccess: () => onSaved(),
    onError: (error) => setDocumentError((error as Error).message),
  });
  const openMutation = useMutation({
    mutationFn: (documentId: string) => getTaskDocumentUrl({ taskId: task!.id, documentId, accessToken: accessToken! }),
    onMutate: () => setDocumentError(null),
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (error) => setDocumentError((error as Error).message),
  });
  const documentPending = uploadMutation.isPending || deleteMutation.isPending || openMutation.isPending;

  // Au moins une personne : la garde est ici ET côté serveur (22023). On ne soumet jamais
  // un tableau vide « pour voir ». `resolvedObject` n'est requis qu'à la CRÉATION — en
  // édition `objectOptions` est vide (établissement verrouillé), donc `resolvedObject` est
  // toujours nul et exiger sa présence rendrait « Enregistrer » mort sans explication.
  const canSubmit =
    Boolean(title.trim()) &&
    (Boolean(task) || Boolean(resolvedObject)) &&
    selectedAssignees.length > 0 &&
    !createMutation.isPending;

  return (
    <CrmModal
      // Le titre DIT le lien : c'est la seule chose qui distingue ce formulaire du formulaire
      // libre, et l'établissement en lecture seule serait autrement inexpliqué.
      title={task ? 'Modifier la tâche' : relatedInteractionId ? 'Nouvelle tâche liée à la demande' : 'Nouvelle tâche'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="crm-btn primary" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
            {task ? 'Enregistrer' : 'Créer'}
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
        {task || fixedObject ? (
          // Lecture seule assumée : en édition comme depuis une demande, l'établissement
          // n'est PAS modifiable ici (le serveur accepterait un déplacement en édition, mais
          // on ne l'offre pas — cf. docstring de `task`) ; le serveur refuserait tout autre
          // choix pour `fixedObject` (22023). On ne rend PAS un picker désactivé — SearchSelect
          // n'a pas de prop `disabled`, et lui en ajouter une toucherait un composant partagé
          // bien au-delà du CRM.
          <span className="crm-field__static">{task ? task.objectName : fixedObject!.objectName}</span>
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

      {/* Task 9 — pièces jointes : SEULEMENT en édition, la tâche n'a pas encore d'id à la
          création (rien à quoi ancrer un fichier). Boutons désactivés tant que le jeton de
          session n'est pas lu : sans lui l'appel partirait sans Authorization (401 muet). */}
      {task ? (
        <div className="crm-field">
          Pièces jointes
          <ul className="crm-doc-list">
            {task.documents.map((doc) => (
              <li key={doc.id} className="crm-doc-list__row">
                <span className="crm-doc-list__title">{doc.title}</span>
                <span className="crm-doc-list__size">{formatDocumentSize(doc.sizeBytes)}</span>
                <button
                  type="button"
                  className="crm-btn sm"
                  aria-label={`Ouvrir « ${doc.title} »`}
                  disabled={!accessToken || documentPending}
                  onClick={() => openMutation.mutate(doc.id)}
                >
                  <ExternalLink size={11} aria-hidden /> Ouvrir
                </button>
                <button
                  type="button"
                  className="crm-btn sm crm-btn--danger-ghost"
                  aria-label={`Supprimer « ${doc.title} »`}
                  disabled={!accessToken || documentPending}
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${doc.title} » ? Le fichier sera définitivement effacé.`)) {
                      deleteMutation.mutate(doc.id);
                    }
                  }}
                >
                  <Trash2 size={11} aria-hidden /> Supprimer
                </button>
              </li>
            ))}
            {task.documents.length === 0 && <li className="crm-field__hint">Aucune pièce jointe.</li>}
          </ul>
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Ajouter un document"
            accept="application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) uploadMutation.mutate(file);
            }}
          />
          <button
            type="button"
            className="crm-btn sm"
            disabled={!accessToken || documentPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={11} aria-hidden /> Ajouter un document
          </button>
          {documentError && <div className="inline-alert" role="alert">{documentError}</div>}
        </div>
      ) : (
        <p className="crm-field__hint">Enregistrez la tâche pour joindre des documents.</p>
      )}

      {createMutation.isError && (
        <div className="inline-alert" role="alert">
          {task ? 'Échec de l’enregistrement' : 'Échec de la création'} : {(createMutation.error as Error).message}
        </div>
      )}
    </CrmModal>
  );
}
