"use client";

// Page /crm (§58) — branchée sur les RPCs réels api.list_crm_timeline / list_crm_tasks /
// save_crm_task via src/services/crm.ts. Le kanban persiste les déplacements de lane
// (saveCrmTask) et toute écriture est masquée avec raison sans la permission
// write_crm_notes (no-write-trap). La timeline pagine en keyset (before/before_id).
// La création/édition de tâches et d'interactions scoping objet vit dans l'éditeur §19 (Task 11).

import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusPill } from '../components/common/StatusPill';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { listCrmTasks, listCrmTimeline, saveCrmTask, userCanWriteCrmNotes } from '../services/crm';
import type { CrmInteraction, CrmTask, CrmTaskStatus } from '../types/domain';

const LANES: CrmTaskStatus[] = ['todo', 'in_progress', 'done'];
const LANE_LABELS: Record<CrmTaskStatus, string> = {
  todo: 'A faire', in_progress: 'En cours', done: 'Termine', canceled: 'Annulee', blocked: 'Bloquee',
};
const NEXT_LANE: Partial<Record<CrmTaskStatus, CrmTaskStatus>> = { todo: 'in_progress', in_progress: 'done' };

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
}

export default function CrmPage() {
  const queryClient = useQueryClient();
  const [olderPages, setOlderPages] = useState<CrmInteraction[][]>([]);
  const [cursor, setCursor] = useState<{ before: string; beforeId: string } | null>(null);

  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  const canWriteQuery = useQuery({ queryKey: ['crm-can-write'], queryFn: userCanWriteCrmNotes });
  const timelineQuery = useQuery({
    queryKey: ['crm-timeline', cursor?.beforeId ?? null],
    queryFn: () => listCrmTimeline(cursor ? { before: cursor.before, beforeId: cursor.beforeId } : {}),
    // « Charger plus » change la queryKey : garder la page précédente affichée pendant le fetch.
    placeholderData: keepPreviousData,
  });
  const { peers, typingUsers } = usePresenceRoom('crm:tasks', { syncGlobalStatus: true });

  const canWrite = canWriteQuery.data === true;
  // Tant que la sonde de permission charge, ne pas afficher « Lecture seule » (flash pour les éditeurs).
  const canWriteKnown = !canWriteQuery.isLoading;
  const tasks = tasksQuery.data ?? [];

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CrmTaskStatus }) => saveCrmTask({ id, status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm-tasks'] }),
  });

  // Pages déjà chargées + page courante, dédupliquées (le keyset garantit l'ordre).
  const timelineItems = useMemo(() => {
    const seen = new Set<string>();
    const merged: CrmInteraction[] = [];
    for (const item of [...olderPages.flat(), ...(timelineQuery.data?.items ?? [])]) {
      if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
    }
    return merged;
  }, [olderPages, timelineQuery.data]);

  const grouped = LANES.map((lane) => ({ lane, items: tasks.filter((task) => task.status === lane) }));
  const activeTasks = tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress').length;
  // Statuts hors lanes (canceled/blocked) : signalés par un chip pour ne pas les masquer silencieusement.
  const hiddenTasks = tasks.filter((t) => t.status === 'canceled' || t.status === 'blocked').length;

  function loadMore() {
    const current = timelineQuery.data;
    if (!current?.hasMore) return;
    const last = current.items[current.items.length - 1];
    if (!last?.occurredAt) return;
    setOlderPages((prev) => [...prev, current.items]);
    setCursor({ before: last.occurredAt, beforeId: last.id });
  }

  function advance(task: CrmTask) {
    const next = NEXT_LANE[task.status];
    if (!next) return;
    moveMutation.mutate({ id: task.id, status: next });
  }

  // Garde plein-écran sur le chargement INITIAL uniquement : une page 2 (cursor non nul)
  // en chargement/erreur ne doit pas remplacer la page entière (erreur inline près du bouton).
  if (tasksQuery.isLoading || (timelineQuery.isLoading && cursor === null)) {
    return <section className="panel-card panel-card--wide m-4">Chargement du CRM...</section>;
  }
  if (tasksQuery.isError || (timelineQuery.isError && cursor === null)) {
    return (
      <section className="panel-card panel-card--warning panel-card--wide m-4">
        {(tasksQuery.error as Error | null)?.message ?? (timelineQuery.error as Error | null)?.message}
      </section>
    );
  }

  return (
    <section className="page-grid crm-page p-4">
      <article className="hero-panel crm-hero">
        <div>
          <span className="eyebrow">CRM</span>
          <h2>Coordination terrain et relation prestataire</h2>
          <p>
            {peers.length} collaborateur(s) en ligne.
            {canWriteKnown && !canWrite && ' Lecture seule : la permission « Écrire des notes CRM » est requise pour saisir.'}
          </p>
        </div>
        <div className="crm-hero__stats">
          <article className="dashboard-metric-card"><span>Taches actives</span><strong>{activeTasks}</strong></article>
          <article className="dashboard-metric-card"><span>Interactions chargees</span><strong>{timelineItems.length}</strong></article>
          <article className="dashboard-metric-card"><span>Contributeurs</span><strong>{peers.length}</strong></article>
        </div>
      </article>

      <div className="crm-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Timeline</span>
              <h2>Flux de relation</h2>
            </div>
          </div>
          {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
          <div className="stack-list">
            {timelineItems.map((item) => (
              <article key={item.id} className="timeline-item">
                <strong>{item.subject}</strong>
                <p>{item.body ?? ''}</p>
                <span>
                  {item.objectName} · {item.topicName ?? 'Sans sujet'} · {item.sentimentName ?? '—'} · {formatWhen(item.occurredAt)}
                </span>
              </article>
            ))}
          </div>
          {timelineQuery.data?.hasMore && (
            <button type="button" className="ghost-button" onClick={loadMore}>Charger plus</button>
          )}
          {timelineQuery.isError && cursor !== null && (
            <div className="inline-alert">Échec du chargement : {(timelineQuery.error as Error).message}</div>
          )}
        </article>

        <article className="panel-card panel-card--wide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Pipeline</span>
              <h2>Kanban des taches</h2>
            </div>
            {canWriteKnown && !canWrite && <span className="pill-mini">Lecture seule</span>}
            {hiddenTasks > 0 && <span className="pill-mini">{hiddenTasks} annulée(s)/bloquée(s)</span>}
          </div>
          {moveMutation.isError && (
            <div className="inline-alert">Échec du déplacement : {(moveMutation.error as Error).message}</div>
          )}
          <div className="kanban-grid">
            {grouped.map((group) => (
              <section key={group.lane} className="kanban-column">
                <div className="kanban-column__header">
                  <h3>{LANE_LABELS[group.lane]}</h3>
                  <span>{group.items.length}</span>
                </div>
                {group.items.map((task) => (
                  <article key={task.id} className="kanban-card">
                    <div className="kanban-card__header">
                      <strong>{task.title}</strong>
                      <StatusPill tone={task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'orange' : 'neutral'}>
                        {LANE_LABELS[task.status]}
                      </StatusPill>
                    </div>
                    <p>{task.objectName}</p>
                    <small className="kanban-card__meta">{task.ownerName ?? '—'} · {formatWhen(task.dueAt)}</small>
                    {canWrite && NEXT_LANE[task.status] && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => advance(task)}
                        disabled={moveMutation.isPending}
                      >
                        Avancer
                      </button>
                    )}
                  </article>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export { CrmPage };
