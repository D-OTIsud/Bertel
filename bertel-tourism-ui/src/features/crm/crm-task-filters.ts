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

/**
 * Sur QUELLE date la période porte. Choix EXPLICITE de l'utilisateur, jamais un repli
 * automatique de l'une sur l'autre : mélanger deux sémantiques dans un filtre muet est la
 * classe de bug la plus silencieuse du projet.
 *
 * Pourquoi ce sélecteur existe (constaté en production le 2026-08-28) : AUCUNE tâche
 * « à faire » ni « en cours » n'a d'échéance, et les tâches sans échéance traversent le
 * filtre par défaut. La période ne faisait donc bouger que la colonne « Terminées ».
 * Toute tâche ayant en revanche une date de création, la base 'created' fait réagir les
 * trois colonnes sans rien inventer.
 */
export type TaskDateBasis = 'due' | 'created';

/** Libellés de la barre d'outils, dérivés de la base : un libellé figé MENTIRAIT en mode Création. */
export const TASK_DATE_BASIS_LABELS: Record<TaskDateBasis, { from: string; to: string; undated: string; option: string }> = {
  // La branche 'due' reproduit les chaînes historiques AU CARACTÈRE PRÈS (apostrophe
  // typographique de « jusqu'au » comprise) : elles sont le contrat de plusieurs tests.
  due: {
    from: 'Échéance à partir du',
    to: 'Échéance jusqu’au',
    undated: 'Inclure sans échéance',
    option: 'Échéance',
  },
  created: {
    from: 'Création à partir du',
    to: 'Création jusqu’au',
    undated: 'Inclure sans date de création',
    option: 'Création',
  },
};

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
 * Jour calendaire LOCAL d'une date ISO. Rend `null` si la valeur est absente ou
 * inexploitable — une date illisible ne doit pas faire planter le filtre, elle est traitée
 * comme « pas de date ».
 */
export function taskDueDateKey(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed);
}

/**
 * Jour calendaire de la tâche SELON LA BASE choisie. Aucun repli : une base 'created' sans
 * `createdAt` rend `null` (donc « sans date »), elle ne retombe JAMAIS sur `dueAt` — sinon
 * le filtre mentirait sans que rien ne le signale.
 */
export function taskDateKey(task: CrmTask, basis: TaskDateBasis): string | null {
  return taskDueDateKey(basis === 'created' ? task.createdAt : task.dueAt);
}

/**
 * Bornes INCLUSES aux deux extrémités. Une tâche sans date exploitable sur la base choisie
 * suit `includeUndated` — par défaut visible, pour qu'un travail réel ne disparaisse pas en
 * silence derrière un filtre de date qu'il ne concerne pas.
 * Une plage inversée ne filtre RIEN (l'UI affiche l'erreur ; on ne vide pas le tableau sur
 * une saisie transitoire, l'utilisateur étant en train de taper la seconde borne).
 *
 * `basis` est en 4e position avec une valeur par défaut : ce n'est pas une commodité, c'est
 * la décision produit écrite en code (« la période porte sur l'échéance, sauf choix
 * contraire »). L'unique appelant de production la passe explicitement.
 */
export function isTaskInDateRange(
  task: CrmTask,
  range: TaskDateRange,
  includeUndated: boolean,
  basis: TaskDateBasis = 'due',
): boolean {
  const key = taskDateKey(task, basis);
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
