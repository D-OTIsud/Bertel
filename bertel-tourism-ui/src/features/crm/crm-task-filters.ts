// Prédicats de filtrage du kanban CRM (16w) — fonctions PURES, testables sans rendu.
//
// Toutes les comparaisons de date se font sur des CHAÎNES `YYYY-MM-DD` en heure LOCALE.
// C'est délibéré : comparer des durées en millisecondes ferait bouger les bornes au
// changement d'heure (une « fenêtre de 15 jours » calculée en 15×86 400 000 ms tombe une
// heure à côté deux fois par an, et la borne peut alors basculer d'un jour). On raisonne
// donc en JOURS CALENDAIRES, ce qui est aussi ce que l'utilisateur lit dans un `<input
// type="date">` (qui émet et attend exactement ce format).

import type { CrmTask } from '../../types/domain';

/** Fenêtre par défaut : 15 jours avant → 15 jours après aujourd'hui. */
export const DEFAULT_RANGE_DAYS = 15;

export interface TaskDateRange {
  /** `YYYY-MM-DD` inclus, ou '' pour « pas de borne basse ». */
  from: string;
  /** `YYYY-MM-DD` inclus, ou '' pour « pas de borne haute ». */
  to: string;
}

/** Date locale d'un `Date` au format `YYYY-MM-DD` (jamais `toISOString`, qui passe en UTC). */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Décale de `days` jours CALENDAIRES. `setDate` normalise les débordements de mois et
 * d'année, et ne dépend pas de la durée réelle d'une journée (DST).
 */
function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * Fenêtre par défaut du kanban, calculée à partir de `now`. À n'appeler qu'UNE fois (à
 * l'initialisation de l'état) : la recalculer à chaque rendu ferait glisser les bornes sous
 * les doigts de l'utilisateur au passage de minuit.
 */
export function defaultTaskDateRange(now: Date = new Date()): TaskDateRange {
  return {
    from: toLocalDateKey(shiftDays(now, -DEFAULT_RANGE_DAYS)),
    to: toLocalDateKey(shiftDays(now, DEFAULT_RANGE_DAYS)),
  };
}

/** Une plage est invalide quand ses deux bornes existent et que le début suit la fin. */
export function isRangeInverted(range: TaskDateRange): boolean {
  return range.from !== '' && range.to !== '' && range.from > range.to;
}

/**
 * Jour calendaire LOCAL d'une échéance ISO. Rend `null` si la valeur est absente ou
 * inexploitable — une date illisible ne doit pas faire planter le filtre, elle est traitée
 * comme « pas d'échéance ».
 */
export function taskDueDateKey(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed);
}

/**
 * Bornes INCLUSES aux deux extrémités. Une tâche sans échéance exploitable suit
 * `includeUndated` — par défaut visible, pour qu'un travail réel ne disparaisse pas en
 * silence derrière un filtre de date qu'il ne concerne pas.
 * Une plage inversée ne filtre RIEN (l'UI affiche l'erreur ; on ne vide pas le tableau sur
 * une saisie transitoire, l'utilisateur étant en train de taper la seconde borne).
 */
export function isTaskInDateRange(task: CrmTask, range: TaskDateRange, includeUndated: boolean): boolean {
  const key = taskDueDateKey(task.dueAt);
  if (key === null) return includeUndated;
  if (isRangeInverted(range)) return true;
  if (range.from !== '' && key < range.from) return false;
  if (range.to !== '' && key > range.to) return false;
  return true;
}

/** Valeur sentinelle du filtre « toutes les personnes » — jamais un uuid réel. */
export const ALL_ASSIGNEES = '__all__';

/**
 * Correspondance par UUID, JAMAIS par nom affiché : deux personnes peuvent porter le même
 * nom, et un nom peut changer. Une tâche sans assigné n'appartient à personne — elle ne
 * remonte que sous « toutes les personnes ».
 */
export function isTaskAssignedTo(task: CrmTask, userId: string): boolean {
  if (userId === ALL_ASSIGNEES) return true;
  return task.assignees.some((assignee) => assignee.userId === userId);
}
