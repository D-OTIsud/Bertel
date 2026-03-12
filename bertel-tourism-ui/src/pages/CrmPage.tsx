import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { listCrmTasks, listCrmTimeline } from '../services/rpc';
import type { CrmTask } from '../types/domain';

const lanes: CrmTask['status'][] = ['todo', 'doing', 'done'];

const laneLabels: Record<CrmTask['status'], string> = {
  todo: 'A faire',
  doing: 'En cours',
  done: 'Termine',
};

export function CrmPage() {
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
    return <section className="panel-card panel-card--wide">Chargement du CRM...</section>;
  }

  if (tasksQuery.isError || timelineQuery.isError) {
    return (
      <section className="panel-card panel-card--warning panel-card--wide">
        {(tasksQuery.error as Error | null)?.message ?? (timelineQuery.error as Error | null)?.message}
      </section>
    );
  }

  return (
    <section className="page-grid">
      <article className="hero-panel">
        <span className="eyebrow">CRM live</span>
        <h2>Annuaire, interactions et kanban synchronise</h2>
        <p>{peers.length} collaborateurs suivent actuellement ce flux.</p>
      </article>

      <div className="crm-layout">
        <article className="panel-card">
          <div className="panel-heading">
            <h2>Timeline</h2>
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
            <h2>Kanban des taches</h2>
          </div>
          <div className="kanban-grid">
            {grouped.map((group) => (
              <section key={group.lane} className="kanban-column">
                <h3>{laneLabels[group.lane]}</h3>
                {group.items.map((task) => (
                  <article key={task.id} className="kanban-card">
                    <strong>{task.title}</strong>
                    <p>{task.actor}</p>
                    <small>{task.assignee} · {task.dueLabel}</small>
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