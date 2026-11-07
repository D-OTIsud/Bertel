import type { CrmTask } from '../types/domain';

/**
 * Tâches ouvertes assignées à l'utilisateur : todo/in_progress, échéance croissante (nulls
 * en dernier), 4 max.
 * 16w — une tâche peut avoir PLUSIEURS assignés : elle remonte dès que l'utilisateur figure
 * parmi eux (deux personnes voient donc la même tâche conjointe dans leur hub).
 */
export function selectMyOpenTasks(tasks: CrmTask[], userId: string | null): CrmTask[] {
  if (!userId) return [];
  return tasks
    .filter(
      (task) =>
        task.assignees.some((assignee) => assignee.userId === userId) &&
        (task.status === 'todo' || task.status === 'in_progress'),
    )
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    })
    .slice(0, 4);
}

/** Échéance dépassée (badge « En retard »). */
export function isTaskOverdue(task: CrmTask, now: number = Date.now()): boolean {
  return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now);
}

export function formatSince(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDue(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
