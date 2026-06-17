import { useState } from 'react';
import { EditorModal, Field, Input, ScheduleEditor, Select } from '../primitives';
import { validatePeriodDraft } from '../sections/opening-period-edit';
import {
  decodeCyclicMonthDay,
  encodeCyclicRange,
  findPeriodConflicts,
  type RecurrencePeriod,
} from '../sections/opening-recurrence';
import { scheduleRowsFromPeriod } from '../sections/blocks/opening-schedule';
import type {
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningPeriodTypeOption,
} from '../../../services/object-workspace-parser';

interface OpeningPeriodEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  draft: ObjectWorkspaceOpeningPeriod;
  /** The other periods of the object, used for live overlap validation. */
  existingPeriods: ObjectWorkspaceOpeningPeriod[];
  /** Admin-managed period-type catalog (ref_code_opening_period_type). */
  periodTypeOptions: ObjectWorkspaceOpeningPeriodTypeOption[];
  onClose: () => void;
  onSave: (period: ObjectWorkspaceOpeningPeriod) => void;
}

const RECURRENCE_OPTIONS: { v: ObjectWorkspaceOpeningPeriod['recurrence']; l: string }[] = [
  { v: 'cyclic', l: 'Cyclique (chaque année)' },
  { v: 'fixed', l: 'Dates fixes' },
  { v: 'always', l: "Toute l'année" },
];

const MONTH_OPTIONS = [
  { v: '', l: '— Mois —' },
  ...['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map(
    (l, i) => ({ v: String(i + 1), l }),
  ),
];

const DAY_OPTIONS = [
  { v: '', l: '—' },
  ...Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), l: String(i + 1) })),
];

/**
 * Focused add/edit modal for one §14 opening period (parallel to ClassificationEditModal).
 * Holds a local draft; the section commits the whole period array on save. recordId/order are
 * carried by spreading the edited period into the draft — no modal control ever sets them.
 *
 * The Récurrence selector (not the period type) now drives the date UI:
 *  - cyclic → month + optional day pickers (stored via encodeCyclicRange in sentinel year 2000)
 *  - fixed  → full calendar dates
 *  - always → no dates
 * The period TYPE is optional and only labels the period (seasonTypeCode).
 */
export function OpeningPeriodEditModal({
  open,
  mode,
  draft: initialDraft,
  existingPeriods,
  periodTypeOptions,
  onClose,
  onSave,
}: OpeningPeriodEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const set = (patch: Partial<ObjectWorkspaceOpeningPeriod>) => setDraft((current) => ({ ...current, ...patch }));

  const validation = validatePeriodDraft(draft);

  // Overlap validation: a period must not partially cross another same-layer period.
  // ObjectWorkspaceOpeningPeriod structurally satisfies RecurrencePeriod (recurrence,
  // isClosure, startDate, endDate, label), so the cast is sound.
  const others = (initialDraft.recordId
    ? existingPeriods.filter((pp) => pp.recordId !== initialDraft.recordId)
    : existingPeriods) as unknown as RecurrencePeriod[];
  const conflicts = findPeriodConflicts(draft as unknown as RecurrencePeriod, others);
  const overlapError = conflicts.length > 0
    ? `Cette période recoupe : ${conflicts.map((c) => c.label).join(', ')}.`
    : null;

  const typeSelectOptions = [
    { v: '', l: '— Aucun —' },
    ...periodTypeOptions.map((option) => ({ v: option.code, l: option.label })),
  ];

  // The TYPE is now purely a label; it no longer drives dates/allYears/recurrence.
  function selectType(code: string) {
    set({ seasonTypeCode: code });
  }

  // --- Cyclic month/day editing ---------------------------------------------
  // Decode the current sentinel-year dates back into month/day selects (empty when unset).
  const startMD = draft.startDate ? decodeCyclicMonthDay(draft.startDate) : null;
  const endMD = draft.endDate ? decodeCyclicMonthDay(draft.endDate) : null;
  const startMonth = startMD ? String(startMD.month) : '';
  const startDay = startMD ? String(startMD.day) : '';
  const endMonth = endMD ? String(endMD.month) : '';
  const endDay = endMD ? String(endMD.day) : '';

  function recomputeCyclic(next: { startMonth?: string; startDay?: string; endMonth?: string; endDay?: string }) {
    const sm = next.startMonth ?? startMonth;
    const sd = next.startDay ?? startDay;
    const em = next.endMonth ?? endMonth;
    const ed = next.endDay ?? endDay;

    if (!sm || !em) {
      // Not enough info to encode a range yet; leave dates empty.
      set({ startDate: '', endDate: '' });
      return;
    }
    const startMonthNum = Number(sm);
    const endMonthNum = Number(em);
    const startDayNum = sd ? Number(sd) : 1;
    // No end day → last day of the end month in the leap sentinel year (2000).
    const endDayNum = ed ? Number(ed) : new Date(2000, endMonthNum, 0).getDate();
    set(encodeCyclicRange(startMonthNum, startDayNum, endMonthNum, endDayNum));
  }

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier la période' : 'Ajouter une période'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!validation.canSave || Boolean(overlapError)}
      size="lg"
    >
      <Field label="Nom de la période (optionnel)">
        <Input aria-label="Nom de la période" value={draft.label} placeholder="ex. Vacances de juillet" onChange={(label) => set({ label })} />
      </Field>

      <Field label="Récurrence" hint="Cyclique = revient chaque année ; Dates fixes = une seule occurrence ; Toute l’année = sans dates.">
        <Select
          aria-label="Récurrence"
          value={draft.recurrence}
          options={RECURRENCE_OPTIONS.map((o) => ({ v: o.v, l: o.l }))}
          onChange={(r) => set({ recurrence: r as ObjectWorkspaceOpeningPeriod['recurrence'] })}
        />
      </Field>

      <Field label="Type / étiquette (optionnel)" hint="Haute / Mi / Hors saison — pour colorer et nommer la période.">
        <Select
          aria-label="Type de période"
          value={draft.seasonTypeCode}
          options={typeSelectOptions}
          onChange={selectType}
        />
      </Field>

      {draft.recurrence === 'cyclic' && (
        <>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Début (mois / jour)">
              <div style={{ display: 'flex', gap: 6 }}>
                <Select
                  aria-label="Mois de début"
                  value={startMonth}
                  options={MONTH_OPTIONS}
                  onChange={(v) => recomputeCyclic({ startMonth: v })}
                />
                <Select
                  aria-label="Jour de début"
                  value={startDay}
                  options={DAY_OPTIONS}
                  onChange={(v) => recomputeCyclic({ startDay: v })}
                />
              </div>
            </Field>
            <Field label="Fin (mois / jour)">
              <div style={{ display: 'flex', gap: 6 }}>
                <Select
                  aria-label="Mois de fin"
                  value={endMonth}
                  options={MONTH_OPTIONS}
                  onChange={(v) => recomputeCyclic({ endMonth: v })}
                />
                <Select
                  aria-label="Jour de fin"
                  value={endDay}
                  options={DAY_OPTIONS}
                  onChange={(v) => recomputeCyclic({ endDay: v })}
                />
              </div>
            </Field>
          </div>
          {validation.dateError && (
            <p role="alert" className="muted" style={{ marginTop: 0, color: 'var(--red, #93392a)' }}>
              {validation.dateError}
            </p>
          )}
          {overlapError && (
            <p role="alert" className="muted" style={{ marginTop: 0, color: 'var(--red, #93392a)' }}>
              {overlapError}
            </p>
          )}
        </>
      )}

      {draft.recurrence === 'fixed' && (
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
          {overlapError && (
            <p role="alert" className="muted" style={{ marginTop: 0, color: 'var(--red, #93392a)' }}>
              {overlapError}
            </p>
          )}
        </>
      )}

      {draft.recurrence === 'always' && overlapError && (
        <p role="alert" className="muted" style={{ marginTop: 0, color: 'var(--red, #93392a)' }}>
          {overlapError}
        </p>
      )}

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
    </EditorModal>
  );
}
