"use client";

// Tâches & relances (§61, rectif PO point 1) — tableau KANBAN 3 colonnes sur les
// statuts RÉELS (todo / in_progress / done). La proximité d'échéance (ex-groupes
// late/today) est portée par un badge coloré DANS chaque carte (dueBadgeClassOf).
// Chaque tâche est rattachée à un établissement (contexte) cliquable → vue
// établissement, et optionnellement à un acteur cliquable → fiche acteur.
// Écritures via api.save_crm_task ; gating page-wide write_crm_notes (no-write-trap).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, GripVertical, Link2, Plus } from 'lucide-react';
import { listCrmAssignees, listCrmDirectory, listCrmTasks, saveCrmInteraction, saveCrmTask } from '../../services/crm';
import { useSessionStore } from '../../store/session-store';
import type { CrmTask, CrmTaskStatus } from '../../types/domain';
import { AgAv } from './crm-primitives';
import { CrmModal } from './CrmModal';
import { CrmTaskModal } from './CrmTaskModal';
import { SkeletonBlock } from '../../components/common/SkeletonBlock';
import { CRM_READ_ONLY_REASON, dueBadgeClassOf, formatShort } from './crm-view-utils';
import {
  ALL_ASSIGNEES,
  defaultTaskDateRange,
  isRangeInverted,
  isTaskAssignedTo,
  isTaskInDateRange,
  TASK_DATE_BASIS_LABELS,
  taskDateKey,
  type TaskDateBasis,
  type TaskDateRange,
} from './crm-task-filters';

// §66 — une interaction « clôturable » : ni déjà traitée ni annulée. Le prompt de clôture ne
// se déclenche que pour ces statuts (pas de proposition redondante).
const CLOSED_INTERACTION_STATUSES = new Set(['done', 'canceled']);

// 3 colonnes = les 3 statuts actifs du cycle de vie (canceled/blocked restent signalés
// par le chip, jamais masqués en silence). cls pilote la couleur du dot + du liseré.
const KANBAN_COLUMNS: Array<{ key: CrmTaskStatus; label: string; cls: string }> = [
  { key: 'todo', label: 'À faire', cls: 'todo' },
  { key: 'in_progress', label: 'En cours', cls: 'doing' },
  { key: 'done', label: 'Terminées', cls: 'done' },
];

/** Nombre d'avatars rendus avant de replier le reste derrière un « +N ». */
const MAX_VISIBLE_AVATARS = 3;

export function CrmTaches({
  canWrite,
  onOpenObject,
  onOpenActor,
}: {
  canWrite: boolean;
  onOpenObject: (objectId: string) => void;
  onOpenActor: (actorId: string) => void;
}) {
  const queryClient = useQueryClient();
  const currentUserId = useSessionStore((state) => state.userId);
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  // Annuaire (cache partagé, NON filtré) — fournit la datalist établissements du formulaire.
  const directoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: () => listCrmDirectory() });
  // Personnes assignables — alimente le filtre par personne (cache partagé avec les modals).
  const assigneesQuery = useQuery({ queryKey: ['crm-assignees'], queryFn: listCrmAssignees });

  // 16w — défaut « mes tâches » : on filtre sur l'UUID de session, jamais sur un nom
  // affiché (deux personnes peuvent être homonymes, et un nom change). Sans identité de
  // session on retombe sur « toutes les personnes » plutôt que sur un tableau vide.
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() => currentUserId ?? ALL_ASSIGNEES);
  // 16w — fenêtre glissante -15/+15 jours, calculée UNE FOIS au montage (l'initialiseur
  // paresseux ne se rejoue pas) : la recalculer à chaque rendu ferait glisser les bornes.
  const [dateRange, setDateRange] = useState<TaskDateRange>(() => defaultTaskDateRange());
  // Sur quelle date la période porte. Défaut 'due' = comportement historique préservé.
  // Existe parce qu'en production AUCUNE tâche « à faire »/« en cours » n'a d'échéance :
  // la période ne faisait donc bouger que « Terminées » (cf. crm-task-filters.ts).
  const [dateBasis, setDateBasis] = useState<TaskDateBasis>('due');
  // Les tâches sans date restent visibles par défaut : elles ne concernent pas le
  // filtre de date, et les masquer ferait disparaître du travail réel en silence.
  // L'échappement est COMPTÉ et affiché plus bas — une case à cocher qu'on ne remarque pas
  // ne suffit pas à expliquer pourquoi le filtre semble sans effet.
  const [includeUndated, setIncludeUndated] = useState(true);
  // « Nouvelle tâche » se fait dans le modal partagé (rectif PO point 3) — résolution
  // datalist conservée, erreurs visibles dans le modal.
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  // DnD (PO point 5) : colonne actuellement survolée par une carte (surbrillance de dépôt).
  const [dropCol, setDropCol] = useState<CrmTaskStatus | null>(null);
  // Statut de la carte en cours de glissement (sa colonne source) — sert à MATÉRIALISER les
  // zones de dépôt valides : toutes les colonnes ≠ source affichent un placeholder « Déposer ici ».
  const [draggingStatus, setDraggingStatus] = useState<CrmTaskStatus | null>(null);
  // Id de la carte saisie — pour l'estomper (opacity 0.4) pendant le glisser (PO).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // §66 — prompt de clôture : quand un move met une tâche LIÉE à une interaction encore
  // ouverte en « Terminées », on PROPOSE (jamais automatiquement) de clôturer l'interaction.
  const [closePrompt, setClosePrompt] = useState<{ interactionId: string; subject: string } | null>(null);

  // Déplacement kanban — persiste le statut réel via save_crm_task (jamais optimiste muet).
  // Utilisé à la fois par les boutons Avancer/Reprendre (clavier) ET le drag & drop (souris).
  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CrmTaskStatus }) => saveCrmTask({ id, status }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      // §66 — clôture suggérée : le move est persisté quoi qu'il arrive ; si la tâche passe en
      // « done » ET qu'elle est liée à une interaction encore OUVERTE, on ouvre le prompt
      // (DnD drop ET bouton « Avancer » passent tous deux par cette mutation).
      if (variables.status !== 'done') return;
      const moved = tasks.find((task) => task.id === variables.id);
      if (
        moved?.relatedInteractionId &&
        !CLOSED_INTERACTION_STATUSES.has(moved.relatedInteractionStatus ?? '')
      ) {
        setClosePrompt({
          interactionId: moved.relatedInteractionId,
          subject: moved.relatedInteractionSubject ?? 'Interaction liée',
        });
      }
    },
  });

  // §66 — « Oui, clôturer » : marque l'interaction liée comme traitée (le serveur pose
  // resolved_at). Invalide le kanban + toutes les vues d'interaction. Erreur visible dans le prompt.
  const closeInteractionMutation = useMutation({
    mutationFn: (interactionId: string) => saveCrmInteraction({ id: interactionId, status: 'done' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-actor'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-object'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-timeline'] });
      setClosePrompt(null);
    },
  });

  // Dépôt d'une carte dans une colonne : si le statut cible diffère, on persiste (sinon no-op).
  function handleDropOnColumn(targetStatus: CrmTaskStatus, event: React.DragEvent) {
    event.preventDefault();
    setDropCol(null);
    setDraggingStatus(null);
    setDraggingId(null);
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task || task.status === targetStatus) return; // même colonne ⇒ rien à écrire
    moveMutation.mutate({ id, status: targetStatus });
  }

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  // canceled/blocked hors colonnes : signalés par un chip, jamais masqués en silence.
  const hiddenCount = tasks.filter((task) => task.status === 'canceled' || task.status === 'blocked').length;

  // Options du filtre : les assignables ∪ les personnes réellement portées par une tâche
  // visible. L'union est nécessaire — une tâche assignée à quelqu'un qui a quitté la liste
  // des assignables resterait sinon inatteignable par le filtre. Clé = UUID.
  // 17c l'a rendue PORTEUSE et non plus seulement prudente : `list_crm_assignees` ne rend
  // désormais que les personnes capables d'agir dans le CRM, donc une tâche confiée avant la
  // restriction (ou à quelqu'un qui a perdu ses droits) DÉPEND de cette union pour rester
  // visible. Gardé par un test dédié.
  const assigneeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const assignee of assigneesQuery.data ?? []) byId.set(assignee.userId, assignee.displayName);
    for (const task of tasks) {
      for (const assignee of task.assignees) {
        if (!byId.has(assignee.userId)) byId.set(assignee.userId, assignee.displayName);
      }
    }
    return [...byId.entries()]
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  }, [assigneesQuery.data, tasks]);

  const rangeInverted = isRangeInverted(dateRange);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.status === 'canceled' || task.status === 'blocked') return false;
        if (!isTaskAssignedTo(task, assigneeFilter)) return false;
        if (!isTaskInDateRange(task, dateRange, includeUndated, dateBasis)) return false;
        return true;
      }),
    [tasks, assigneeFilter, dateRange, includeUndated, dateBasis],
  );

  // Combien de tâches AFFICHÉES échappent à la période faute de date sur la base choisie.
  // Calculé sur `visibleTasks` (et non `tasks`) pour que le chiffre corresponde exactement
  // à ce qui est à l'écran ; il tombe naturellement à 0 quand la case est décochée.
  const undatedShown = useMemo(
    () => visibleTasks.filter((task) => taskDateKey(task, dateBasis) === null).length,
    [visibleTasks, dateBasis],
  );

  // Objets distincts de l'annuaire → datalist du formulaire + résolution nom → id.
  const directoryObjects = useMemo(() => {
    const byId = new Map<string, { objectId: string; objectName: string }>();
    for (const entry of directoryQuery.data ?? []) {
      for (const object of entry.objects) {
        if (!byId.has(object.objectId)) byId.set(object.objectId, { objectId: object.objectId, objectName: object.objectName });
      }
    }
    return [...byId.values()].sort((a, b) => a.objectName.localeCompare(b.objectName));
  }, [directoryQuery.data]);

  if (tasksQuery.isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label="Chargement des tâches" className="crm-loading-skeleton crm-loading-skeleton--kanban">
        {['A faire', 'En cours', 'Fait'].map((column) => (
          <div key={column} className="crm-loading-skeleton__column" aria-hidden="true">
            <SkeletonBlock className="h-4 w-1/2 rounded-shellSm" />
            <SkeletonBlock className="h-16 w-full rounded-shellMd" />
            <SkeletonBlock className="h-16 w-full rounded-shellMd" />
          </div>
        ))}
      </div>
    );
  }
  if (tasksQuery.isError) {
    return <div className="inline-alert">Échec du chargement des tâches : {(tasksQuery.error as Error).message}</div>;
  }

  const remaining = visibleTasks.filter((task) => task.status !== 'done').length;

  function renderTicket(task: CrmTask) {
    const dueCls = dueBadgeClassOf(task.dueAt, task.status);
    // 16w — la pile d'avatars est décorative : l'information accessible est la LISTE
    // COMPLÈTE des noms, portée par un texte lisible aux lecteurs d'écran (le « +N » ne dit
    // pas qui manque). Les avatars restent aria-hidden côté AgAv.
    const assigneeNames = task.assignees.map((assignee) => assignee.displayName);
    const assigneeLabel =
      assigneeNames.length === 0 ? 'Personne assignée' : `Assignée à ${assigneeNames.join(', ')}`;
    const shown = task.assignees.slice(0, MAX_VISIBLE_AVATARS);
    const overflow = task.assignees.length - shown.length;
    return (
      <div
        key={task.id}
        className={
          'ticket' +
          (task.status === 'done' ? ' is-done' : '') +
          (draggingId === task.id ? ' ticket--dragging' : '')
        }
        // DnD (PO point 5) : carte déplaçable seulement avec permission (le drop persiste).
        // Les boutons Avancer/Reprendre restent l'alternative clavier (le DnD est souris-only).
        draggable={canWrite || undefined}
        onDragStart={(event) => {
          if (!canWrite) return;
          event.dataTransfer.setData('text/plain', task.id);
          event.dataTransfer.effectAllowed = 'move';
          setDraggingStatus(task.status); // matérialise les zones de dépôt voisines
          setDraggingId(task.id); // estompe la carte saisie
        }}
        // Drag abandonné hors d'une colonne : on efface la surbrillance + les zones (pas d'état figé).
        onDragEnd={() => {
          setDropCol(null);
          setDraggingStatus(null);
          setDraggingId(null);
        }}
      >
        <div className="ticket__title">
          {/* Poignée : signale que la carte est déplaçable (DnD souris ; clavier = Avancer/Reprendre). */}
          {canWrite && <GripVertical className="ticket__grip" size={14} aria-hidden />}
          <span className="ticket__titletext">{task.title}</span>
          {task.description && <small>{task.description}</small>}
        </div>
        <div className="ticket__meta">
          <button type="button" className="presta" onClick={() => onOpenObject(task.objectId)}>
            {task.objectName}
          </button>
          {task.actorId && task.actorName && (
            <button type="button" className="ticket__actor" onClick={() => onOpenActor(task.actorId as string)}>
              {task.actorName}
            </button>
          )}
          {/* §66 — badge interaction liée : cliquable → fiche acteur (ou vue établissement si
              pas d'acteur). stopPropagation : ne déclenche ni le DnD ni la nav de la carte. */}
          {task.relatedInteractionId && (
            <button
              type="button"
              className="ticket__linked"
              title={`Interaction liée : ${task.relatedInteractionSubject ?? 'voir le fil'}`}
              onClick={(event) => {
                event.stopPropagation();
                if (task.actorId) onOpenActor(task.actorId);
                else onOpenObject(task.objectId);
              }}
            >
              <Link2 size={11} aria-hidden /> {task.relatedInteractionSubject ?? 'Interaction liée'}
            </button>
          )}
        </div>
        {/* 16w — le créateur est une information SÉPARÉE des assignés. Créateur inconnu =
            on le dit ; on ne devine jamais un nom depuis la liste des assignés. */}
        <div className="ticket__author">Créée par {task.createdByName ?? 'Créateur inconnu'}</div>
        <div className="ticket__foot">
          <span className={'due ' + dueCls}>
            {dueCls === 'late' && <Bell size={11} aria-hidden />}
            {task.dueAt ? formatShort(task.dueAt) : '—'}
          </span>
          <span className="ticket__who ticket__who--stack" title={assigneeLabel}>
            {shown.length === 0 ? (
              <AgAv name={null} />
            ) : (
              shown.map((assignee) => <AgAv key={assignee.userId} name={assignee.displayName} />)
            )}
            {overflow > 0 && (
              <span className="ticket__who-more" aria-hidden>
                +{overflow}
              </span>
            )}
            <span className="sr-only">{assigneeLabel}</span>
          </span>
          <span className="ticket__actions">
            {task.status === 'in_progress' && (
              <button
                type="button"
                className="crm-btn sm"
                aria-label={`Reprendre « ${task.title} »`}
                disabled={!canWrite || moveMutation.isPending}
                title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                onClick={() => moveMutation.mutate({ id: task.id, status: 'todo' })}
              >
                Reprendre
              </button>
            )}
            {task.status === 'done' ? (
              <button
                type="button"
                className="crm-btn sm"
                aria-label={`Rouvrir « ${task.title} »`}
                disabled={!canWrite || moveMutation.isPending}
                title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                onClick={() => moveMutation.mutate({ id: task.id, status: 'todo' })}
              >
                Rouvrir
              </button>
            ) : (
              <button
                type="button"
                className="crm-btn sm primary"
                aria-label={`Avancer « ${task.title} »`}
                disabled={!canWrite || moveMutation.isPending}
                title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                onClick={() => moveMutation.mutate({ id: task.id, status: task.status === 'todo' ? 'in_progress' : 'done' })}
              >
                Avancer
              </button>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-body">
      <div className="crm-toolbar crm-toolbar--tasks">
        {/* Filtre par personne — valeur = UUID, jamais un nom affiché. */}
        <label className="crm-filter">
          <span className="crm-filter__label">Personne</span>
          <select
            className="crm-select"
            aria-label="Filtrer par personne"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value={ALL_ASSIGNEES}>Toutes les personnes</option>
            {assigneeOptions.map((assignee) => (
              <option key={assignee.userId} value={assignee.userId}>
                {assignee.userId === currentUserId ? `${assignee.displayName} (moi)` : assignee.displayName}
              </option>
            ))}
          </select>
        </label>

        {/* Base de la période : elle gouverne le SENS de Du/Au, donc elle se lit avant eux.
            Nommée « La période porte sur » et non « Échéance » : le modal de création porte
            déjà un champ nommé « Échéance », et deux contrôles homonymes rendraient toute
            requête par libellé ambiguë. */}
        <label className="crm-filter">
          <span className="crm-filter__label">La période porte sur</span>
          <select
            className="crm-select"
            aria-label="La période porte sur"
            value={dateBasis}
            onChange={(event) => setDateBasis(event.target.value as TaskDateBasis)}
          >
            <option value="due">{TASK_DATE_BASIS_LABELS.due.option}</option>
            <option value="created">{TASK_DATE_BASIS_LABELS.created.option}</option>
          </select>
        </label>

        {/* Fenêtre de dates, bornes INCLUSES. Les libellés suivent la base : figés, ils
            mentiraient dès la bascule sur Création. */}
        <label className="crm-filter">
          <span className="crm-filter__label">Du</span>
          <input
            type="date"
            className="crm-input-date"
            aria-label={TASK_DATE_BASIS_LABELS[dateBasis].from}
            value={dateRange.from}
            onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))}
          />
        </label>
        <label className="crm-filter">
          <span className="crm-filter__label">Au</span>
          <input
            type="date"
            className="crm-input-date"
            aria-label={TASK_DATE_BASIS_LABELS[dateBasis].to}
            value={dateRange.to}
            onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))}
          />
        </label>
        <label className="crm-filter crm-filter--check">
          <input
            type="checkbox"
            checked={includeUndated}
            onChange={(event) => setIncludeUndated(event.target.checked)}
          />
          {TASK_DATE_BASIS_LABELS[dateBasis].undated}
        </label>
        <button
          type="button"
          className="crm-btn sm"
          onClick={() => {
            setDateRange(defaultTaskDateRange());
            setIncludeUndated(true);
            setDateBasis('due');
          }}
        >
          Réinitialiser
        </button>

        <div className="crm-toolbar__right">
          {!canWrite && <span>{CRM_READ_ONLY_REASON}</span>}
          {hiddenCount > 0 && <span className="pill-mini">{hiddenCount} annulée(s)/bloquée(s)</span>}
          {/* Échappement RENDU VISIBLE : sans lui, une période sans effet apparent sur une
              colonne se lit comme un filtre cassé, alors que ces tâches n'ont simplement
              aucune date sur la base choisie. C'est le cas de TOUTES les tâches « à faire »
              en production au 2026-08-28. */}
          {undatedShown > 0 && (
            <span className="pill-mini" title="Ces tâches n’ont pas de date sur la base choisie : elles traversent la période. Décochez « Inclure sans… » pour les masquer.">
              {undatedShown} sans date, hors période
            </span>
          )}
          <span>{remaining} à traiter</span>
          <button
            type="button"
            className="crm-btn primary"
            disabled={!canWrite}
            title={canWrite ? undefined : CRM_READ_ONLY_REASON}
            onClick={() => setTaskModalOpen(true)}
          >
            <Plus size={12} aria-hidden /> Nouvelle tâche
          </button>
        </div>
      </div>

      {/* Plage inversée : on le DIT et on n'applique pas la plage (le tableau ne se vide pas
          pendant que l'utilisateur saisit sa seconde borne). */}
      {rangeInverted && (
        <div className="inline-alert" role="alert">
          La date de début est postérieure à la date de fin : la plage n’est pas appliquée.
        </div>
      )}

      {moveMutation.isError && (
        <div className="inline-alert">Échec de la mise à jour : {(moveMutation.error as Error).message}</div>
      )}

      <div className="board">
        {KANBAN_COLUMNS.map((column) => {
          const list = visibleTasks.filter((task) => task.status === column.key);
          // Zone de dépôt valide = une carte est saisie ET cette colonne n'est pas sa source.
          const isTarget = draggingStatus !== null && draggingStatus !== column.key;
          return (
            <section
              key={column.key}
              className={
                'bcol bcol--' + column.cls +
                (dropCol === column.key ? ' bcol--drop' : '') +
                (isTarget ? ' bcol--target' : '')
              }
              aria-label={column.label}
              onDragOver={(event) => {
                if (!canWrite) return;
                event.preventDefault(); // autorise le drop
                event.dataTransfer.dropEffect = 'move';
                if (dropCol !== column.key) setDropCol(column.key);
              }}
              onDragLeave={(event) => {
                // Ne retirer la surbrillance que si on quitte réellement la colonne (pas un enfant).
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropCol(null);
              }}
              onDrop={(event) => handleDropOnColumn(column.key, event)}
            >
              <div className="bcol__head">
                <span className="dot" aria-hidden></span>
                {column.label}
                <span className="n">{list.length}</span>
              </div>
              <div className="bcol__list">
                {/* Pendant un glissement, les colonnes cibles matérialisent une zone « Déposer ici ». */}
                {isTarget && <div className="bcol__dropzone" aria-hidden>Déposer ici</div>}
                {list.map(renderTicket)}
                {list.length === 0 && !isTarget && <div className="bcol__empty">Aucune tâche.</div>}
              </div>
            </section>
          );
        })}
      </div>

      <div className="crm-foot-hint">
        Chaque tâche est rattachée à un établissement, et optionnellement à un acteur (créée depuis sa fiche).
      </div>

      {taskModalOpen && canWrite && (
        <CrmTaskModal
          picker="datalist"
          objectOptions={directoryObjects}
          onClose={() => setTaskModalOpen(false)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] })}
        />
      )}

      {/* §66 — prompt de clôture de l'interaction liée (proposé, jamais automatique). Le move
          de la tâche est déjà persisté ; ici on ne décide QUE de la clôture de l'interaction. */}
      {closePrompt && (
        <CrmModal
          title="Clôturer l’interaction liée ?"
          onClose={() => setClosePrompt(null)}
          footer={
            <>
              <button type="button" className="crm-btn" onClick={() => setClosePrompt(null)}>
                Non
              </button>
              <button
                type="button"
                className="crm-btn primary"
                disabled={closeInteractionMutation.isPending}
                onClick={() => closeInteractionMutation.mutate(closePrompt.interactionId)}
              >
                Oui, clôturer
              </button>
            </>
          }
        >
          <p className="crm-prompt-text">
            La tâche est liée à l’interaction «&nbsp;{closePrompt.subject}&nbsp;». La marquer aussi comme traitée ?
          </p>
          {closeInteractionMutation.isError && (
            <div className="inline-alert" role="alert">
              Échec de la clôture : {(closeInteractionMutation.error as Error).message}
            </div>
          )}
        </CrmModal>
      )}
    </div>
  );
}
