// Garde des prédicats de filtrage du kanban (16w). Ces fonctions sont pures : on les
// éprouve sans rendu, en pilotant l'horloge — une fenêtre « -15/+15 jours » qui se
// calculerait en millisecondes tomberait à côté au changement d'heure, et un test qui
// dépendrait de l'heure réelle le dirait un jour sur deux.

import {
  ALL_ASSIGNEES,
  defaultTaskDateRange,
  isRangeInverted,
  isTaskAssignedTo,
  isTaskInDateRange,
  taskDueDateKey,
  toLocalDateKey,
} from './crm-task-filters';
import type { CrmTask } from '../../types/domain';

function task(over: Partial<CrmTask> = {}): CrmTask {
  return {
    id: 't', objectId: 'o', objectName: 'Obj', actorId: null, actorName: null,
    title: 'T', description: null, status: 'todo', priority: 'medium',
    dueAt: null, assignees: [], createdById: null, createdByName: null,
    ownerId: null, ownerName: null,
    relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null,
    ...over,
  };
}

/** Échéance à midi LOCAL — évite qu'un décalage de fuseau ne déplace le jour calendaire. */
const at = (isoDay: string) => new Date(`${isoDay}T12:00:00`).toISOString();

afterEach(() => {
  jest.useRealTimers();
});

describe('defaultTaskDateRange', () => {
  it('rend -15/+15 jours calendaires autour de la date locale', () => {
    expect(defaultTaskDateRange(new Date('2026-08-20T10:00:00'))).toEqual({
      from: '2026-08-05',
      to: '2026-09-04',
    });
  });

  it('franchit les frontières de mois ET d’année', () => {
    expect(defaultTaskDateRange(new Date('2026-01-05T10:00:00'))).toEqual({
      from: '2025-12-21',
      to: '2026-01-20',
    });
    // Année bissextile : le 29 février doit être compté comme un jour réel.
    expect(defaultTaskDateRange(new Date('2028-03-05T10:00:00')).from).toBe('2028-02-19');
  });

  it('reste un décalage en JOURS quand la journée locale ne fait pas 24 h (heure d’été)', () => {
    // Fin mars en Europe : la nuit du changement d'heure dure 23 h. Un calcul en
    // millisecondes ferait reculer la borne d'un jour ; le calcul calendaire, non.
    expect(defaultTaskDateRange(new Date('2026-04-05T02:00:00'))).toEqual({
      from: '2026-03-21',
      to: '2026-04-20',
    });
  });

  it('utilise l’horloge courante quand aucune date n’est fournie', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00'));
    expect(defaultTaskDateRange()).toEqual({ from: '2026-08-05', to: '2026-09-04' });
  });
});

describe('toLocalDateKey / taskDueDateKey', () => {
  it('rend le jour LOCAL, jamais le jour UTC', () => {
    // 23 h locales : `toISOString()` basculerait au lendemain dans tout fuseau positif.
    const local = new Date(2026, 7, 20, 23, 30);
    expect(toLocalDateKey(local)).toBe('2026-08-20');
  });

  it('une échéance absente ou illisible ne rend pas de jour (et ne lève pas)', () => {
    expect(taskDueDateKey(null)).toBeNull();
    expect(taskDueDateKey('pas-une-date')).toBeNull();
    expect(taskDueDateKey('')).toBeNull();
  });
});

describe('isTaskInDateRange', () => {
  const range = { from: '2026-08-05', to: '2026-09-04' };

  it('inclut les DEUX bornes', () => {
    expect(isTaskInDateRange(task({ dueAt: at('2026-08-05') }), range, true)).toBe(true);
    expect(isTaskInDateRange(task({ dueAt: at('2026-09-04') }), range, true)).toBe(true);
  });

  it('exclut le jour juste avant et juste après', () => {
    expect(isTaskInDateRange(task({ dueAt: at('2026-08-04') }), range, true)).toBe(false);
    expect(isTaskInDateRange(task({ dueAt: at('2026-09-05') }), range, true)).toBe(false);
  });

  it('les sans-échéance suivent includeUndated, jamais la plage', () => {
    expect(isTaskInDateRange(task({ dueAt: null }), range, true)).toBe(true);
    expect(isTaskInDateRange(task({ dueAt: null }), range, false)).toBe(false);
    // Une date illisible est traitée comme « sans échéance » : elle ne disparaît pas
    // silencieusement et ne fait pas planter le filtre.
    expect(isTaskInDateRange(task({ dueAt: 'n’importe quoi' }), range, true)).toBe(true);
  });

  it('une borne vide n’est pas une borne (plage ouverte d’un côté)', () => {
    expect(isTaskInDateRange(task({ dueAt: at('2020-01-01') }), { from: '', to: '2026-09-04' }, true)).toBe(true);
    expect(isTaskInDateRange(task({ dueAt: at('2099-01-01') }), { from: '2026-08-05', to: '' }, true)).toBe(true);
  });

  it('une plage INVERSÉE ne filtre rien (l’UI le signale, elle ne vide pas le tableau)', () => {
    const inverted = { from: '2026-09-04', to: '2026-08-05' };
    expect(isRangeInverted(inverted)).toBe(true);
    expect(isTaskInDateRange(task({ dueAt: at('2026-01-01') }), inverted, true)).toBe(true);
  });

  it('isRangeInverted : il faut DEUX bornes pour qu’une plage soit inversée', () => {
    expect(isRangeInverted({ from: '', to: '2026-08-05' })).toBe(false);
    expect(isRangeInverted({ from: '2026-08-05', to: '' })).toBe(false);
    expect(isRangeInverted({ from: '2026-08-05', to: '2026-08-05' })).toBe(false);
  });
});

describe('isTaskAssignedTo', () => {
  const marie = { userId: 'u-marie', displayName: 'Jean Dupont' };
  const autre = { userId: 'u-autre', displayName: 'Jean Dupont' }; // MÊME nom, autre personne

  it('correspond sur l’UUID — deux homonymes ne se confondent pas', () => {
    const t = task({ assignees: [marie] });
    expect(isTaskAssignedTo(t, 'u-marie')).toBe(true);
    expect(isTaskAssignedTo(t, 'u-autre')).toBe(false);
  });

  it('une tâche conjointe correspond pour CHACUN de ses assignés', () => {
    const t = task({ assignees: [marie, autre] });
    expect(isTaskAssignedTo(t, 'u-marie')).toBe(true);
    expect(isTaskAssignedTo(t, 'u-autre')).toBe(true);
    expect(isTaskAssignedTo(t, 'u-tiers')).toBe(false);
  });

  it('une tâche SANS assigné n’est à personne, mais reste sous « toutes les personnes »', () => {
    const t = task({ assignees: [] });
    expect(isTaskAssignedTo(t, 'u-marie')).toBe(false);
    expect(isTaskAssignedTo(t, ALL_ASSIGNEES)).toBe(true);
  });

  it('`ownerId` n’intervient plus : seule la liste des assignés compte', () => {
    const t = task({ assignees: [], ownerId: 'u-marie', ownerName: 'Marie' });
    expect(isTaskAssignedTo(t, 'u-marie')).toBe(false);
  });
});
