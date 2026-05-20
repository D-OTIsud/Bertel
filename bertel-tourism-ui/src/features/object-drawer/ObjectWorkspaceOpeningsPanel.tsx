import { Plus, Trash2 } from 'lucide-react';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceOpeningBucket,
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningSlot,
  ObjectWorkspaceOpeningWeekday,
  ObjectWorkspaceOpeningsModule,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { WorkspaceEmptyState, WorkspaceField, WorkspaceRepeatedCard, WorkspaceSection, WorkspaceTooltip } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceOpeningsPanelProps {
  value: ObjectWorkspaceOpeningsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceOpeningsModule) => void;
  onSave: () => void;
}

const WEEKDAYS = [
  { code: 'monday', label: 'Lundi' },
  { code: 'tuesday', label: 'Mardi' },
  { code: 'wednesday', label: 'Mercredi' },
  { code: 'thursday', label: 'Jeudi' },
  { code: 'friday', label: 'Vendredi' },
  { code: 'saturday', label: 'Samedi' },
  { code: 'sunday', label: 'Dimanche' },
];

const WEEKDAY_ALIASES: Record<string, string> = {
  lundi: 'monday',
  lun: 'monday',
  monday: 'monday',
  mon: 'monday',
  mardi: 'tuesday',
  mar: 'tuesday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  mercredi: 'wednesday',
  mer: 'wednesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  jeudi: 'thursday',
  jeu: 'thursday',
  thursday: 'thursday',
  thu: 'thursday',
  vendredi: 'friday',
  ven: 'friday',
  friday: 'friday',
  fri: 'friday',
  samedi: 'saturday',
  sam: 'saturday',
  saturday: 'saturday',
  sat: 'saturday',
  dimanche: 'sunday',
  dim: 'sunday',
  sunday: 'sunday',
  sun: 'sunday',
};

function normalizeWeekdayCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return WEEKDAY_ALIASES[normalized] ?? normalized;
}

function weekdayLabel(code: string): string {
  const normalized = normalizeWeekdayCode(code);
  return WEEKDAYS.find((weekday) => weekday.code === normalized)?.label ?? code;
}

function weekdayRank(code: string): number {
  const normalized = normalizeWeekdayCode(code);
  const index = WEEKDAYS.findIndex((weekday) => weekday.code === normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortWeekdays(weekdays: ObjectWorkspaceOpeningWeekday[]): ObjectWorkspaceOpeningWeekday[] {
  return [...weekdays].sort((left, right) => weekdayRank(left.code) - weekdayRank(right.code));
}

function normalizeTimeInput(value: string): string {
  const normalized = value.trim();
  return normalized.length >= 5 ? normalized.slice(0, 5) : normalized;
}

function bucketLabel(bucket: ObjectWorkspaceOpeningBucket): string {
  switch (bucket) {
    case 'current':
      return 'Annee en cours';
    case 'next-year':
      return 'Annee suivante';
    default:
      return 'Non date';
  }
}

function makeDefaultPeriod(order: number): ObjectWorkspaceOpeningPeriod {
  return {
    recordId: null,
    order: String(order),
    bucket: 'undated',
    label: `Periode ${order}`,
    startDate: '',
    endDate: '',
    allYears: false,
    closedDays: [],
    weekdays: [],
  };
}

function makeDefaultWeekday(code: string): ObjectWorkspaceOpeningWeekday {
  return {
    code,
    label: weekdayLabel(code),
    slots: [{ start: '09:00', end: '18:00' }],
  };
}

function normalizeClosedDays(period: ObjectWorkspaceOpeningPeriod): string[] {
  return Array.from(new Set(period.closedDays.map(normalizeWeekdayCode).filter(Boolean)));
}

function formatSlotSummary(slots: ObjectWorkspaceOpeningSlot[]): string {
  const filledSlots = slots
    .filter((slot) => slot.start || slot.end)
    .map((slot) => slot.end ? `${slot.start}–${slot.end}` : slot.start);

  return filledSlots.length > 0 ? filledSlots.join(' · ') : 'Aucun creneau';
}

export function ObjectWorkspaceOpeningsPanel({
  value,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
}: ObjectWorkspaceOpeningsPanelProps) {
  const disabled = !access.canDirectWrite || saving;
  const note = statusMessage ?? value.unavailableReason ?? saveAction.hint ?? access.disabledReason;

  function patchPeriods(nextPeriods: ObjectWorkspaceOpeningPeriod[]) {
    onChange({
      ...value,
      periods: nextPeriods.map((period, index) => ({
        ...period,
        order: period.order || String(index + 1),
        closedDays: normalizeClosedDays(period),
        weekdays: sortWeekdays(period.weekdays.map((weekday) => ({
          ...weekday,
          code: normalizeWeekdayCode(weekday.code),
          label: weekdayLabel(weekday.code),
          slots: weekday.slots.map((slot) => ({
            start: normalizeTimeInput(slot.start),
            end: normalizeTimeInput(slot.end),
          })),
        }))),
      })),
    });
  }

  function updatePeriod(index: number, patch: Partial<ObjectWorkspaceOpeningPeriod>) {
    patchPeriods(value.periods.map((period, periodIndex) => (
      periodIndex === index ? { ...period, ...patch } : period
    )));
  }

  function addPeriod() {
    patchPeriods([...value.periods, makeDefaultPeriod(value.periods.length + 1)]);
  }

  function removePeriod(index: number) {
    patchPeriods(value.periods.filter((_, periodIndex) => periodIndex !== index));
  }

  function setDayState(periodIndex: number, dayCode: string, state: 'inactive' | 'open' | 'closed') {
    const normalizedCode = normalizeWeekdayCode(dayCode);
    const period = value.periods[periodIndex];
    if (!period) {
      return;
    }

    const nextWeekdays = period.weekdays.filter((weekday) => normalizeWeekdayCode(weekday.code) !== normalizedCode);
    const nextClosedDays = normalizeClosedDays(period).filter((code) => code !== normalizedCode);

    if (state === 'open') {
      nextWeekdays.push(period.weekdays.find((weekday) => normalizeWeekdayCode(weekday.code) === normalizedCode) ?? makeDefaultWeekday(normalizedCode));
    }

    if (state === 'closed') {
      nextClosedDays.push(normalizedCode);
    }

    updatePeriod(periodIndex, {
      weekdays: sortWeekdays(nextWeekdays),
      closedDays: nextClosedDays,
    });
  }

  function updateSlot(periodIndex: number, dayCode: string, slotIndex: number, patch: Partial<ObjectWorkspaceOpeningSlot>) {
    const normalizedCode = normalizeWeekdayCode(dayCode);
    const period = value.periods[periodIndex];
    if (!period) {
      return;
    }

    updatePeriod(periodIndex, {
      weekdays: period.weekdays.map((weekday) => {
        if (normalizeWeekdayCode(weekday.code) !== normalizedCode) {
          return weekday;
        }

        return {
          ...weekday,
          slots: weekday.slots.map((slot, index) => (
            index === slotIndex ? { ...slot, ...patch } : slot
          )),
        };
      }),
    });
  }

  function addSlot(periodIndex: number, dayCode: string) {
    const normalizedCode = normalizeWeekdayCode(dayCode);
    const period = value.periods[periodIndex];
    if (!period) {
      return;
    }

    updatePeriod(periodIndex, {
      weekdays: period.weekdays.map((weekday) => (
        normalizeWeekdayCode(weekday.code) === normalizedCode
          ? { ...weekday, slots: [...weekday.slots, { start: '', end: '' }] }
          : weekday
      )),
    });
  }

  function removeSlot(periodIndex: number, dayCode: string, slotIndex: number) {
    const normalizedCode = normalizeWeekdayCode(dayCode);
    const period = value.periods[periodIndex];
    if (!period) {
      return;
    }

    updatePeriod(periodIndex, {
      weekdays: period.weekdays.map((weekday) => {
        if (normalizeWeekdayCode(weekday.code) !== normalizedCode) {
          return weekday;
        }

        const nextSlots = weekday.slots.filter((_, index) => index !== slotIndex);
        return {
          ...weekday,
          slots: nextSlots.length > 0 ? nextSlots : [{ start: '', end: '' }],
        };
      }),
    });
  }

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection
        eyebrow="Periodes d'ouverture"
        title="Horaires"
        help="Les champs avancés du contrat DB, comme source_period_id, traductions et extra, restent preserves par le schema mais ne sont pas encore tous exposes dans cette surface."
        actions={(
          <Button type="button" variant="ghost" onClick={addPeriod} disabled={disabled}>
            <Plus size={15} aria-hidden="true" />
            Ajouter
          </Button>
        )}
      >
        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Periodes</span>
            <strong>{value.periods.length}</strong>
          </article>
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Jours ouverts</span>
            <strong>{value.periods.reduce((count, period) => count + period.weekdays.length, 0)}</strong>
          </article>
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Jours fermes</span>
            <strong>{value.periods.reduce((count, period) => count + normalizeClosedDays(period).length, 0)}</strong>
          </article>
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Creneaux</span>
            <strong>{value.periods.reduce((count, period) => count + period.weekdays.reduce((slotCount, weekday) => slotCount + weekday.slots.length, 0), 0)}</strong>
          </article>
        </div>
        {note ? <WorkspaceEmptyState title={note} /> : null}
      </WorkspaceSection>

      {value.periods.length > 0 ? value.periods.map((period, periodIndex) => {
        const closedDays = new Set(normalizeClosedDays(period));
        const weekdaysByCode = new Map(period.weekdays.map((weekday) => [normalizeWeekdayCode(weekday.code), weekday]));

        return (
          <WorkspaceRepeatedCard
            key={`${period.recordId ?? 'new'}-${periodIndex}`}
            title={period.label || `Periode ${periodIndex + 1}`}
            meta={bucketLabel(period.bucket)}
            actions={(
              <Button type="button" variant="ghost" disabled={disabled} onClick={() => removePeriod(periodIndex)}>
                <Trash2 size={15} aria-hidden="true" />
                Retirer
              </Button>
            )}
          >
            <div className="drawer-grid">
              <WorkspaceField label="Nom">
                <Input
                  value={period.label}
                  disabled={disabled}
                  onChange={(event) => updatePeriod(periodIndex, { label: event.target.value })}
                />
              </WorkspaceField>

              <WorkspaceField label="Groupe">
                <Select
                  value={period.bucket}
                  disabled={disabled}
                  onChange={(event) => updatePeriod(periodIndex, { bucket: event.target.value as ObjectWorkspaceOpeningBucket })}
                >
                  <option value="current">Annee en cours</option>
                  <option value="next-year">Annee suivante</option>
                  <option value="undated">Non date</option>
                </Select>
              </WorkspaceField>

              <WorkspaceField label="Debut">
                <input
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  type="date"
                  value={period.startDate}
                  disabled={disabled || period.allYears}
                  onChange={(event) => updatePeriod(periodIndex, { startDate: event.target.value })}
                />
              </WorkspaceField>

              <WorkspaceField label="Fin">
                <input
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  type="date"
                  value={period.endDate}
                  disabled={disabled || period.allYears}
                  onChange={(event) => updatePeriod(periodIndex, { endDate: event.target.value })}
                />
              </WorkspaceField>

              <label className="field-block">
                <span className="workspace-field-label-row">
                  <span>Toute l'annee</span>
                  <WorkspaceTooltip content="Quand ce champ est actif, les dates sont envoyees vides et le contrat DB garde all_years=true." />
                </span>
                <input
                  type="checkbox"
                  checked={period.allYears}
                  disabled={disabled}
                  onChange={(event) => updatePeriod(periodIndex, { allYears: event.target.checked })}
                />
              </label>
            </div>

            <div className="drawer-form-stack mt-4">
              {WEEKDAYS.map((weekday) => {
                const existingWeekday = weekdaysByCode.get(weekday.code);
                const isClosed = closedDays.has(weekday.code);
                const dayState = isClosed ? 'closed' : existingWeekday ? 'open' : 'inactive';

                return (
                  <article key={weekday.code} className="panel-card panel-card--nested">
                    <div className="panel-heading">
                      <div>
                        <span className="facet-title">{weekday.label}</span>
                        <h3>{dayState === 'closed' ? 'Ferme' : existingWeekday ? formatSlotSummary(existingWeekday.slots) : 'Non renseigne'}</h3>
                      </div>
                      <Select
                        value={dayState}
                        disabled={disabled}
                        onChange={(event) => setDayState(periodIndex, weekday.code, event.target.value as 'inactive' | 'open' | 'closed')}
                      >
                        <option value="inactive">Non renseigne</option>
                        <option value="open">Ouvert</option>
                        <option value="closed">Ferme</option>
                      </Select>
                    </div>

                    {existingWeekday && !isClosed ? (
                      <div className="drawer-form-stack">
                        {existingWeekday.slots.map((slot, slotIndex) => (
                          <div key={`${weekday.code}-${slotIndex}`} className="drawer-grid">
                            <WorkspaceField label="Debut">
                              <input
                                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                                type="time"
                                value={normalizeTimeInput(slot.start)}
                                disabled={disabled}
                                onChange={(event) => updateSlot(periodIndex, weekday.code, slotIndex, { start: event.target.value })}
                              />
                            </WorkspaceField>
                            <WorkspaceField label="Fin">
                              <input
                                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                                type="time"
                                value={normalizeTimeInput(slot.end)}
                                disabled={disabled}
                                onChange={(event) => updateSlot(periodIndex, weekday.code, slotIndex, { end: event.target.value })}
                              />
                            </WorkspaceField>
                            <div className="field-block">
                              <Label>Action</Label>
                              <Button type="button" variant="ghost" disabled={disabled} onClick={() => removeSlot(periodIndex, weekday.code, slotIndex)}>
                                <Trash2 size={15} aria-hidden="true" />
                                Retirer
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="inline-actions">
                          <Button type="button" variant="ghost" disabled={disabled} onClick={() => addSlot(periodIndex, weekday.code)}>
                            <Plus size={15} aria-hidden="true" />
                            Ajouter un creneau
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </WorkspaceRepeatedCard>
        );
      }) : (
        <WorkspaceEmptyState title="Aucune periode d'ouverture">
          Ajoutez une periode pour creer les horaires depuis le contrat DB.
        </WorkspaceEmptyState>
      )}
    </div>
  );
}
