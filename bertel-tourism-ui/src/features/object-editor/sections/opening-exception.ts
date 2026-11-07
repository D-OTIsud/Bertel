import type {
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningSlot,
} from '../../../services/object-workspace-parser';
import { formatScheduleTime } from '../primitives/schedule-time';
import { openingPeriodEditingReason } from './blocks/opening-schedule';
import { createPeriodDraft, OPENING_WEEKDAYS } from './opening-period-edit';
import { encodeCyclicRange, findPeriodConflicts, periodWindowWidth } from './opening-recurrence';

// Passer à true seulement après livraison de la migration de priorité et déploiement de H.
export const EXCEPTION_HOURS_ENABLED = false;

export type OpeningExceptionKind = 'closed' | 'modified' | 'open';

export function openingExceptionKind(
  period: ObjectWorkspaceOpeningPeriod,
): OpeningExceptionKind | null {
  if (period.isClosure) return 'closed';
  const kind = period.extra?.exception_kind;
  return kind === 'modified' || kind === 'open' ? kind : null;
}

export function isOpeningHoursException(period: ObjectWorkspaceOpeningPeriod): boolean {
  return !period.isClosure && openingExceptionKind(period) !== null;
}

export interface OpeningExceptionInput {
  kind: OpeningExceptionKind;
  label: string;
  startDate: string;
  endDate: string;
  recurring: boolean;
  slots: ObjectWorkspaceOpeningSlot[];
}

/** The regular H writer rebuilds schedules and keeps each day's source note. */
export function buildOpeningException(
  input: OpeningExceptionInput,
  original?: ObjectWorkspaceOpeningPeriod,
): ObjectWorkspaceOpeningPeriod {
  const base = original ?? createPeriodDraft();
  const closed = input.kind === 'closed';
  const recurring = closed && input.recurring;
  let { startDate, endDate } = input;
  if (recurring && startDate && endDate) {
    ({ startDate, endDate } = encodeCyclicRange(
      Number(startDate.slice(5, 7)),
      Number(startDate.slice(8, 10)),
      Number(endDate.slice(5, 7)),
      Number(endDate.slice(8, 10)),
    ));
  }
  const extra = { ...base.extra };
  if (closed) delete extra.exception_kind;
  else extra.exception_kind = input.kind;
  return {
    ...base,
    label: input.label,
    startDate,
    endDate,
    allYears: recurring,
    recurrence: recurring ? 'cyclic' : 'fixed',
    isClosure: closed,
    extra,
    // Existing closure trees/notes remain available when only their dates change.
    closedDays: closed ? base.closedDays : [],
    weekdays: closed
      ? (original?.weekdays ?? [])
      : OPENING_WEEKDAYS.map(({ code, label }) => ({
          code,
          label: label.toLowerCase(),
          slots: input.slots.map((slot) => ({
            start: formatScheduleTime(slot.start) ?? slot.start,
            end: formatScheduleTime(slot.end) ?? slot.end,
          })),
        })),
  };
}

/** This compact form can only edit the same one/two ranges on every day. */
export function openingExceptionEditingReason(period: ObjectWorkspaceOpeningPeriod): string | null {
  if (!isOpeningHoursException(period)) return null;
  const reason = openingPeriodEditingReason(period);
  if (reason) return reason;
  if (period.recurrence !== 'fixed' || period.allYears) {
    return 'Cette exception utilise une récurrence non représentable par ce formulaire. Ses données sont conservées.';
  }
  const slots = period.weekdays[0]?.slots;
  if (
    !slots?.length ||
    period.weekdays.length !== 7 ||
    OPENING_WEEKDAYS.some(({ code }) => {
      const day = period.weekdays.find((entry) => entry.code === code);
      return !day || JSON.stringify(day.slots) !== JSON.stringify(slots);
    })
  )
    return 'Cette exception utilise des horaires différents selon les jours. Ses données sont conservées ; ce formulaire ne permet pas de les modifier.';
  return null;
}

function validDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

export function validateOpeningException(
  candidate: ObjectWorkspaceOpeningPeriod,
  existing: readonly ObjectWorkspaceOpeningPeriod[] = [],
  original?: ObjectWorkspaceOpeningPeriod,
): { error: string | null; warning: string | null } {
  if (!validDate(candidate.startDate) || !validDate(candidate.endDate)) {
    return { error: 'Renseignez une date valide pour le début et la fin.', warning: null };
  }
  if (candidate.recurrence !== 'cyclic' && candidate.endDate < candidate.startDate) {
    return { error: 'La date de fin doit être postérieure à la date de début.', warning: null };
  }
  if (candidate.isClosure) return { error: null, warning: null };
  const others = existing.filter(
    (period) =>
      period !== original && (!original?.recordId || period.recordId !== original.recordId),
  );
  const warning = others.some((period) => period.isClosure)
    ? 'Les fermetures enregistrées restent prioritaires sur les dates qu’elles couvrent.'
    : null;
  const slots = candidate.weekdays[0]?.slots ?? [];
  if (
    candidate.recurrence !== 'fixed' ||
    candidate.allYears ||
    slots.length < 1 ||
    slots.length > 2 ||
    slots.some(
      (slot) =>
        !slot.start ||
        !slot.end ||
        formatScheduleTime(slot.start) !== slot.start ||
        formatScheduleTime(slot.end) !== slot.end ||
        slot.start >= slot.end,
    ) ||
    (slots.length === 2 && slots[1].start < slots[0].end)
  ) {
    return {
      error:
        'Renseignez une ou deux plages complètes, dans l’ordre, sans chevauchement ni passage à minuit.',
      warning,
    };
  }
  const conflicts = findPeriodConflicts(candidate, others);
  if (conflicts.length)
    return {
      error: `Ces dates chevauchent une période de même priorité : ${conflicts.map((p) => p.label).join(', ')}.`,
      warning,
    };
  const morePrecise = others.find(
    (period) =>
      !period.isClosure &&
      period.recurrence === 'fixed' &&
      period.startDate <= candidate.endDate &&
      period.endDate >= candidate.startDate &&
      periodWindowWidth(period) < periodWindowWidth(candidate),
  );
  if (morePrecise)
    return {
      error: `La période « ${morePrecise.label || 'sans nom'} » est plus précise et resterait prioritaire. Réduisez les dates de cette exception.`,
      warning,
    };
  return { error: null, warning };
}
