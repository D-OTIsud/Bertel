"use client";

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatusPill } from '../components/common/StatusPill';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { listCrmTasks, listCrmTimeline } from '../services/rpc';
import type { CrmTask } from '../types/domain';

const lanes: CrmTask['status'][] = ['todo', 'doing', 'done'];

const laneLabels: Record<CrmTask['status'], string> = {
  todo: 'A faire',
  doing: 'En cours',
  done: 'Termine',
};

export default function CrmPage() {
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  const timelineQuery = useQuery({ queryKey: ['crm-timeline'], queryFn: listCrmTimeline });
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const { peers, typingUsers, announceTyping } = usePresenceRoom('crm:tasks', { syncGlobalStatus: true });

  useEffect(() => {
    if (tasksQuery.data) {
      setTasks(tasksQuery.data);
    }
  }, [tasksQuery.data]);

  const grouped = useMemo(
    () =>
      lanes.map((lane) => ({
        lane,
        items: tasks.filter((task) => task.status === lane),
      })),
    [tasks],
  );

  const activeTasks = tasks.filter((task) => task.status !== 'done').length;

  const moveTask = (taskId: string) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        const nextStatus = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo';
        return { ...task, status: nextStatus };
      }),
    );
  };

  if (tasksQuery.isLoading || timelineQuery.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement du CRM...</section>;
  }

  if (tasksQuery.isError || timelineQuery.isError) {
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
          <span className="eyebrow">CRM live</span>
          <h2>Coordination terrain et relation objet dans le meme flux</h2>
          <p>{peers.length} collaborateurs suivent actuellement ce pipeline et {typingUsers.length} personnes sont en train de saisir une note.</p>
        </div>
        <div className="crm-hero__stats">
          <article className="dashboard-metric-card">
            <span>Taches actives</span>
            <strong>{activeTasks}</strong>
          </article>
          <article className="dashboard-metric-card">
            <span>Contributeurs</span>
            <strong>{peers.length}</strong>
          </article>
          <article className="dashboard-metric-card">
            <span>Notes en cours</span>
            <strong>{typingUsers.length}</strong>
          </article>
        </div>
      </article>

      <div className="crm-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Timeline</span>
              <h2>Flux de relation</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => void announceTyping()}>
              Simuler une note
            </button>
          </div>
          {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
          <div className="stack-list">
            {(timelineQuery.data ?? []).map((item) => (
              <article key={item.id} className="timeline-item">
                <strong>{item.author}</strong>
                <p>{item.text}</p>
                <span>{item.at}</span>
              </article>
            ))}
          </div>
        </article>

        <article className="panel-card panel-card--wide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Pipeline</span>
              <h2>Kanban des taches</h2>
            </div>
          </div>
          <div className="kanban-grid">
            {grouped.map((group) => (
              <section key={group.lane} className="kanban-column">
                <div className="kanban-column__header">
                  <h3>{laneLabels[group.lane]}</h3>
                  <span>{group.items.length}</span>
                </div>
                {group.items.map((task) => (
                  <article key={task.id} className="kanban-card">
                    <div className="kanban-card__header">
                      <strong>{task.title}</strong>
                      <StatusPill tone={task.status === 'done' ? 'green' : task.status === 'doing' ? 'orange' : 'neutral'}>
                        {laneLabels[task.status]}
                      </StatusPill>
                    </div>
                    <p>{task.actor}</p>
                    <small className="kanban-card__meta">{task.assignee} · {task.dueLabel}</small>
                    <button type="button" className="ghost-button" onClick={() => moveTask(task.id)}>
                      Deplacer
                    </button>
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
