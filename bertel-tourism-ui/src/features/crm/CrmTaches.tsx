"use client";

// Tâches & relances (§61, rectif PO point 1) — tableau KANBAN 3 colonnes sur les
// statuts RÉELS (todo / in_progress / done). La proximité d'échéance (ex-groupes
// late/today) est portée par un badge coloré DANS chaque carte (dueBadgeClassOf).
// Chaque tâche est rattachée à un établissement (contexte) cliquable → vue
// établissement, et optionnellement à un acteur cliquable → fiche acteur.
// Écritures via api.save_crm_task ; gating page-wide write_crm_notes (no-write-trap).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus } from 'lucide-react';
import { listCrmDirectory, listCrmTasks, saveCrmTask } from '../../services/crm';
import type { CrmTask, CrmTaskStatus } from '../../types/domain';
import { AgAv, Seg } from './crm-primitives';
import { CrmTaskModal } from './CrmTaskModal';
import { CRM_READ_ONLY_REASON, dueBadgeClassOf, formatShort } from './crm-view-utils';

// 3 colonnes = les 3 statuts actifs du cycle de vie (canceled/blocked restent signalés
// par le chip, jamais masqués en silence). cls pilote la couleur du dot + du liseré.
const KANBAN_COLUMNS: Array<{ key: CrmTaskStatus; label: string; cls: string }> = [
  { key: 'todo', label: 'À faire', cls: 'todo' },
  { key: 'in_progress', label: 'En cours', cls: 'doing' },
  { key: 'done', label: 'Terminées', cls: 'done' },
];

const ALL_OWNERS = 'Toutes';

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
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  // Annuaire (cache partagé, NON filtré) — fournit la datalist établissements du formulaire.
  const directoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: () => listCrmDirectory() });

  const [owner, setOwner] = useState<string>(ALL_OWNERS);
  // « Nouvelle tâche » se fait dans le modal partagé (rectif PO point 3) — résolution
  // datalist conservée, erreurs visibles dans le modal.
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Déplacement kanban — persiste le statut réel via save_crm_task (jamais optimiste muet).
  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CrmTaskStatus }) => saveCrmTask({ id, status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] }),
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  // canceled/blocked hors colonnes : signalés par un chip, jamais masqués en silence.
  const hiddenCount = tasks.filter((task) => task.status === 'canceled' || task.status === 'blocked').length;
  const owners = useMemo(
    () => [...new Set(tasks.map((task) => task.ownerName).filter((name): name is string => Boolean(name)))].sort(),
    [tasks],
  );

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.status === 'canceled' || task.status === 'blocked') return false;
        if (owner !== ALL_OWNERS && task.ownerName !== owner) return false;
        return true;
      }),
    [tasks, owner],
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
    return <div className="crm-loading">Chargement des tâches…</div>;
  }
  if (tasksQuery.isError) {
    return <div className="inline-alert">Échec du chargement des tâches : {(tasksQuery.error as Error).message}</div>;
  }

  const remaining = visibleTasks.filter((task) => task.status !== 'done').length;

  function renderTicket(task: CrmTask) {
    const dueCls = dueBadgeClassOf(task.dueAt, task.status);
    return (
      <div key={task.id} className={'ticket' + (task.status === 'done' ? ' is-done' : '')}>
        <div className="ticket__title">
          {task.title}
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
        </div>
        <div className="ticket__foot">
          <span className={'due ' + dueCls}>
            {dueCls === 'late' && <Bell size={11} aria-hidden />}
            {task.dueAt ? formatShort(task.dueAt) : '—'}
          </span>
          <span className="ticket__who" title={task.ownerName ?? undefined}>
            <AgAv name={task.ownerName} />
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
      <div className="crm-toolbar">
        <Seg items={[ALL_OWNERS, ...owners]} value={owner} onChange={setOwner} />
        <div className="crm-toolbar__right">
          {!canWrite && <span>{CRM_READ_ONLY_REASON}</span>}
          {hiddenCount > 0 && <span className="pill-mini">{hiddenCount} annulée(s)/bloquée(s)</span>}
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

      {moveMutation.isError && (
        <div className="inline-alert">Échec de la mise à jour : {(moveMutation.error as Error).message}</div>
      )}

      <div className="board">
        {KANBAN_COLUMNS.map((column) => {
          const list = visibleTasks.filter((task) => task.status === column.key);
          return (
            <section key={column.key} className={'bcol bcol--' + column.cls} aria-label={column.label}>
              <div className="bcol__head">
                <span className="dot" aria-hidden></span>
                {column.label}
                <span className="n">{list.length}</span>
              </div>
              <div className="bcol__list">
                {list.map(renderTicket)}
                {list.length === 0 && <div className="bcol__empty">Aucune tâche.</div>}
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
    </div>
  );
}
