import { useState } from 'react';
import { EditorModal, Field, Input, ScheduleEditor, Select } from '../primitives';
import {
  OPENING_BUCKET_OPTIONS,
  OPENING_WEEKDAYS,
  addClosedDate,
  addClosedWeekday,
  classifyClosedDays,
  validatePeriodDraft,
} from '../sections/opening-period-edit';
import { scheduleRowsFromPeriod } from '../sections/blocks/opening-schedule';
import type {
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningPeriodTypeOption,
} from '../../../services/object-workspace-parser';

interface OpeningPeriodEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  draft: ObjectWorkspaceOpeningPeriod;
  /** Admin-managed period-type catalog (ref_code_opening_period_type). */
  periodTypeOptions: ObjectWorkspaceOpeningPeriodTypeOption[];
  onClose: () => void;
  onSave: (period: ObjectWorkspaceOpeningPeriod) => void;
}

const WEEKDAY_ADD_OPTIONS = [
  { v: '', l: '— Jour de la semaine —' },
  ...OPENING_WEEKDAYS.map((day) => ({ v: day.code, l: day.label })),
];

/**
 * Focused add/edit modal for one §14 opening period (parallel to ClassificationEditModal).
 * Holds a local draft; the section commits the whole period array on save. recordId/order are
 * carried by spreading the edited period into the draft — no modal control ever sets them.
 */
export function OpeningPeriodEditModal({
  open,
  mode,
  draft: initialDraft,
  periodTypeOptions,
  onClose,
  onSave,
}: OpeningPeriodEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [dateInput, setDateInput] = useState('');
  const [dateInputError, setDateInputError] = useState(false);
  const set = (patch: Partial<ObjectWorkspaceOpeningPeriod>) => setDraft((current) => ({ ...current, ...patch }));

  const validation = validatePeriodDraft(draft);
  const closedDayEntries = classifyClosedDays(draft.closedDays);

  const typeSelectOptions = [
    { v: '', l: '— Choisir un type —' },
    ...periodTypeOptions.map((option) => ({ v: option.code, l: option.label })),
  ];
  const selectedType = periodTypeOptions.find((option) => option.code === draft.seasonTypeCode);
  // The TYPE drives the date UI: an all-year type means "no dates"; others are dated.
  const showDates = Boolean(draft.seasonTypeCode) && !selectedType?.allYear;

  function selectType(code: string) {
    const option = periodTypeOptions.find((entry) => entry.code === code);
    const allYear = option?.allYear ?? false;
    set(allYear ? { seasonTypeCode: code, allYears: true, startDate: '', endDate: '' } : { seasonTypeCode: code, allYears: false });
  }

  function removeClosedDayAt(index: number) {
    set({ closedDays: draft.closedDays.filter((_, dayIndex) => dayIndex !== index) });
  }

  function addWeekday(code: string) {
    if (code) {
      set({ closedDays: addClosedWeekday(draft.closedDays, code) });
    }
  }

  function tryAddDate() {
    const next = addClosedDate(draft.closedDays, dateInput);
    if (!next) {
      setDateInputError(true);
      return;
    }
    set({ closedDays: next });
    setDateInput('');
    setDateInputError(false);
  }

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier la période' : 'Ajouter une période'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!validation.canSave}
      size="lg"
    >
      <Field label="Type de période" required hint="Haute / Mi / Hors saison datée, ou Annuelle (toute l’année).">
        <Select
          aria-label="Type de période"
          value={draft.seasonTypeCode}
          options={typeSelectOptions}
          onChange={selectType}
        />
      </Field>

      <Field label="Nom de la période (optionnel)">
        <Input aria-label="Nom de la période" value={draft.label} placeholder="ex. Vacances de juillet" onChange={(label) => set({ label })} />
      </Field>

      {showDates && (
        <>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Date de début">
              <Input type="date" aria-label="Date de début" value={draft.startDate} onChange={(startDate) => set({ startDate })} />
            </Field>
            <Field label="Date de fin">
              <Input type="date" aria-label="Date de fin" value={draft.endDate} onChange={(endDate) => set({ endDate })} />
            </Field>
          </div>
          {validation.dateError && (
            <p role="alert" className="muted" style={{ marginTop: 0, color: 'var(--red, #93392a)' }}>
              {validation.dateError}
            </p>
          )}
        </>
      )}

      <Field label="Période (cycle)">
        <Select
          aria-label="Période (cycle)"
          value={draft.bucket}
          options={[...OPENING_BUCKET_OPTIONS]}
          onChange={(bucket) => set({ bucket: bucket as ObjectWorkspaceOpeningPeriod['bucket'] })}
        />
      </Field>

      <Field label="Horaires hebdomadaires" hint="Cliquez un jour pour l’ouvrir, puis saisissez les plages.">
        <ScheduleEditor
          rows={scheduleRowsFromPeriod(draft)}
          colA="Plage 1"
          colB="Plage 2"
          onChange={(rows) =>
            set({
              weekdays: rows.map((row) => ({
                code: row.code,
                label: row.label,
                slots: row.slots.filter((slot): slot is NonNullable<typeof slot> => Boolean(slot)),
              })),
            })
          }
        />
      </Field>

      <Field label="Jours & dates de fermeture" hint="Jours de la semaine fermés et fermetures exceptionnelles (ex. jours fériés).">
        {closedDayEntries.length > 0 && (
          <div className="chip-set" style={{ marginBottom: 8 }}>
            {closedDayEntries.map((entry, index) => (
              <span key={`${entry.raw}-${index}`} className={`chip is-on${entry.kind === 'unknown' ? ' is-error' : ''}`}>
                {entry.label}
                <button
                  type="button"
                  aria-label={`Retirer ${entry.label}`}
                  onClick={() => removeClosedDayAt(index)}
                  style={{ marginLeft: 6, cursor: 'pointer' }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="grid-2" style={{ gap: 10 }}>
          <Select aria-label="Ajouter un jour fermé" value="" options={WEEKDAY_ADD_OPTIONS} onChange={addWeekday} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type="date" aria-label="Date de fermeture" value={dateInput} onChange={(value) => { setDateInput(value); setDateInputError(false); }} />
            <button type="button" className="btn" onClick={tryAddDate}>
              Ajouter
            </button>
          </div>
        </div>
        {dateInputError && (
          <p role="alert" className="muted" style={{ marginTop: 6, color: 'var(--red, #93392a)' }}>
            Date invalide — utilisez le sélecteur de date.
          </p>
        )}
      </Field>
    </EditorModal>
  );
}
