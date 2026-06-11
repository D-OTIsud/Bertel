"use client";

// Tâches & relances (§61, design v2) — groupes par échéance RÉELLE (crm_task.due_at)
// late / today / week / later via taskGroupOf. Chaque tâche est rattachée à un
// établissement (contexte) cliquable → vue établissement. Écritures via
// api.save_crm_task ; gating page-wide write_crm_notes (no-write-trap).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Plus } from 'lucide-react';
import { listCrmDirectory, listCrmTasks, saveCrmTask } from '../../services/crm';
import type { CrmTask, CrmTaskStatus } from '../../types/domain';
import { AgAv, Seg } from './crm-primitives';
import { CRM_READ_ONLY_REASON, formatShort, taskGroupOf, type TaskGroup } from './crm-view-utils';

const TASK_GROUPS: Array<{ key: TaskGroup; label: string; cls: string }> = [
  { key: 'late', label: 'En retard', cls: 'late' },
  { key: 'today', label: "Aujourd'hui", cls: 'today' },
  { key: 'week', label: 'Cette semaine', cls: 'week' },
  { key: 'later', label: 'Plus tard', cls: '' },
];

const ALL_OWNERS = 'Toutes';

interface NewTaskForm {
  title: string;
  objectName: string;
  dueAt: string;
}

export function CrmTaches({ canWrite, onOpenObject }: { canWrite: boolean; onOpenObject: (objectId: string) => void }) {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  // Annuaire (cache partagé) — fournit la datalist établissements du formulaire.
  const directoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: listCrmDirectory });

  const [owner, setOwner] = useState<string>(ALL_OWNERS);
  const [form, setForm] = useState<NewTaskForm | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CrmTaskStatus }) => saveCrmTask({ id, status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] }),
  });

  const createMutation = useMutation({
    mutationFn: (input: { objectId: string; title: string; dueAt: string | null }) => saveCrmTask(input),
    onSuccess: () => {
      // Création confirmée : fermer le formulaire AVANT le refetch (pattern §19).
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] });
    },
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  // canceled/blocked hors groupes : signalés par un chip, jamais masqués en silence.
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

  const resolvedObject = form
    ? directoryObjects.find((object) => object.objectName.trim().toLowerCase() === form.objectName.trim().toLowerCase()) ?? null
    : null;

  if (tasksQuery.isLoading) {
    return <div className="crm-loading">Chargement des tâches…</div>;
  }
  if (tasksQuery.isError) {
    return <div className="inline-alert">Échec du chargement des tâches : {(tasksQuery.error as Error).message}</div>;
  }

  const remaining = visibleTasks.filter((task) => task.status !== 'done').length;

  function renderRow(task: CrmTask, group: TaskGroup) {
    const done = task.status === 'done';
    return (
      <div key={task.id} className={'task-row' + (done ? ' is-done' : '')}>
        <button
          type="button"
          className={'task-check' + (done ? ' is-on' : '')}
          aria-label={`Basculer la tâche « ${task.title} »`}
          aria-pressed={done}
          disabled={!canWrite || toggleMutation.isPending}
          title={canWrite ? undefined : CRM_READ_ONLY_REASON}
          onClick={() => toggleMutation.mutate({ id: task.id, status: done ? 'todo' : 'done' })}
        >
          <Check size={10} aria-hidden />
        </button>
        <div className="task-row__title">
          {task.title}
          {task.description && <small>{task.description}</small>}
        </div>
        <button type="button" className="task-row__presta" onClick={() => onOpenObject(task.objectId)}>
          <span>{task.objectName}</span>
        </button>
        <span className={'due ' + (group === 'late' ? 'late' : group === 'today' ? 'today' : '')}>
          {group === 'late' && <Bell size={11} aria-hidden />}
          {task.dueAt ? formatShort(task.dueAt) : '—'}
        </span>
        <div className="task-row__who">
          <AgAv name={task.ownerName} />
          {task.ownerName ?? '—'}
        </div>
      </div>
    );
  }

  return (
    <div className="crm-body">
      <div className="tasks-wrap">
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
              onClick={() => setForm({ title: '', objectName: '', dueAt: '' })}
            >
              <Plus size={12} aria-hidden /> Nouvelle tâche
            </button>
          </div>
        </div>

        {form && canWrite && (
          <div className="task-new">
            <input
              aria-label="Titre de la tâche"
              placeholder="Titre de la tâche"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <input
              aria-label="Établissement"
              placeholder="Établissement (nom exact)"
              list="crm-taches-objects"
              value={form.objectName}
              onChange={(event) => setForm({ ...form, objectName: event.target.value })}
            />
            <datalist id="crm-taches-objects">
              {directoryObjects.map((object) => (
                <option key={object.objectId} value={object.objectName} />
              ))}
            </datalist>
            <input
              aria-label="Échéance"
              type="date"
              value={form.dueAt}
              onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
            />
            <button
              type="button"
              className="crm-btn primary"
              disabled={!form.title.trim() || !resolvedObject || createMutation.isPending}
              onClick={() => {
                if (!resolvedObject) return;
                createMutation.mutate({
                  objectId: resolvedObject.objectId,
                  title: form.title.trim(),
                  dueAt: form.dueAt || null,
                });
              }}
            >
              Créer
            </button>
            <button type="button" className="crm-btn" onClick={() => setForm(null)}>
              Annuler
            </button>
            {form.objectName.trim() !== '' && !resolvedObject && (
              <p className="task-new__hint">Établissement introuvable dans l&apos;annuaire — choisissez un nom de la liste.</p>
            )}
          </div>
        )}

        {toggleMutation.isError && (
          <div className="inline-alert">Échec de la mise à jour : {(toggleMutation.error as Error).message}</div>
        )}
        {createMutation.isError && (
          <div className="inline-alert">Échec de la création : {(createMutation.error as Error).message}</div>
        )}

        {TASK_GROUPS.map((group) => {
          const list = visibleTasks.filter((task) => taskGroupOf(task.dueAt) === group.key);
          if (list.length === 0) return null;
          return (
            <section key={group.key} className="task-group" aria-label={group.label}>
              <div className={'task-group__head ' + group.cls}>
                <span className="dot" aria-hidden></span>
                {group.label}
                <span className="n">{list.filter((task) => task.status !== 'done').length}</span>
              </div>
              <div className="task-list">{list.map((task) => renderRow(task, group.key))}</div>
            </section>
          );
        })}

        {visibleTasks.length === 0 && <div className="crm-list__empty">Aucune tâche à afficher.</div>}

        <div className="crm-foot-hint">
          Chaque tâche est rattachée à un acteur ; l&apos;établissement n&apos;est que le contexte de la relance.
        </div>
      </div>
    </div>
  );
}
