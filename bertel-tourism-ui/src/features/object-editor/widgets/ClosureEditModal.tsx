import { useState } from 'react';
import { Chip, ChipSet, Disclosure, EditorModal, Field, Input } from '../primitives';
import { formatScheduleTime } from '../primitives/schedule-time';
import {
  openingPeriodEditingReason,
  openingPeriodNotes,
} from '../sections/blocks/opening-schedule';
import {
  buildOpeningException,
  EXCEPTION_HOURS_ENABLED,
  openingExceptionEditingReason,
  openingExceptionKind,
  validateOpeningException,
  type OpeningExceptionKind,
} from '../sections/opening-exception';
import { reunionHolidays } from '../sections/reunion-holidays';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

interface ClosureEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** The closure being edited; absent in 'add' mode. */
  draft?: ObjectWorkspaceOpeningPeriod;
  existingPeriods?: readonly ObjectWorkspaceOpeningPeriod[];
  onClose: () => void;
  onSave: (closure: ObjectWorkspaceOpeningPeriod) => void;
}

/** Focused exception form. Hour changes remain locked until the SQL priority fix
 * and H are deployed. Changes only update the draft; H remains the single writer. */
export function ClosureEditModal({
  open,
  mode,
  draft,
  existingPeriods = [],
  onClose,
  onSave,
}: ClosureEditModalProps) {
  const [kind, setKind] = useState<OpeningExceptionKind>(
    draft ? (openingExceptionKind(draft) ?? 'closed') : 'closed',
  );
  const [slots, setSlots] = useState(() =>
    draft && !draft.isClosure && draft.weekdays[0]?.slots.length
      ? draft.weekdays[0].slots.map((slot) => ({ ...slot }))
      : [{ start: '', end: '' }],
  );
  const [label, setLabel] = useState(draft?.label ?? '');
  const [isRange, setIsRange] = useState(
    Boolean(draft && draft.endDate !== '' && draft.startDate !== draft.endDate),
  );
  const [recurring, setRecurring] = useState(draft?.recurrence === 'cyclic');
  // A cyclic closure is stored under the sentinel year (2000); show the current year in the
  // <input type="date"> instead. build() re-encodes to the sentinel via slice, so the displayed
  // year is irrelevant to the saved value.
  const displayYear = String(new Date().getFullYear());
  const toDisplay = (iso?: string): string =>
    draft?.recurrence === 'cyclic' && iso ? `${displayYear}-${iso.slice(5)}` : (iso ?? '');
  const [start, setStart] = useState(toDisplay(draft?.startDate));
  const [end, setEnd] = useState(toDisplay(draft?.endDate));
  const today = new Date().toISOString().slice(0, 10);
  const holidays = [
    ...reunionHolidays(Number(displayYear)),
    ...reunionHolidays(Number(displayYear) + 1),
  ]
    .filter((holiday) => holiday.date >= today)
    .slice(0, 12);

  const exceptionalHours = kind !== 'closed';
  const period = buildOpeningException(
    { kind, label, startDate: start, endDate: isRange ? end : start, recurring, slots },
    draft,
  );
  const validation = validateOpeningException(period, existingPeriods, draft);
  const editingReason =
    draft && exceptionalHours
      ? (openingPeriodEditingReason(draft) ?? openingExceptionEditingReason(draft))
      : null;
  const canSave =
    !validation.error && !editingReason && (!exceptionalHours || EXCEPTION_HOURS_ENABLED);
  const notes = openingPeriodNotes(draft ?? period);
  const kindLabel =
    kind === 'closed'
      ? 'Fermeture'
      : kind === 'modified'
        ? 'Horaires modifiés'
        : 'Ouverture exceptionnelle';

  return (
    <EditorModal
      className="ed-record-modal--closure"
      open={open}
      title={
        exceptionalHours
          ? mode === 'edit'
            ? 'Modifier l’exception'
            : 'Ajouter une exception'
          : mode === 'edit'
            ? 'Modifier la fermeture'
            : 'Ajouter une fermeture'
      }
      eyebrow="Horaires · Exceptions"
      onClose={onClose}
      onSave={() => {
        if (canSave) onSave(period);
      }}
      saveDisabled={!canSave}
      saveLabel={mode === 'add' ? 'Ajouter' : 'Appliquer'}
      size="lg"
      footerNote={canSave ? 'Prêt à appliquer au brouillon' : 'Informations à compléter'}
      aside={
        <>
          <h3>Ce jour-là sur la fiche</h3>
          <div className="ed-record-modal__preview">
            <strong>{label || kindLabel}</strong>
            <p>
              {start || 'Date à choisir'}
              {isRange && end ? ` → ${end}` : ''}
            </p>
            <p>
              {kindLabel}
              {!exceptionalHours && recurring ? ' · chaque année' : ''}
            </p>
            {exceptionalHours && (
              <p>
                {slots.map((slot) => `${slot.start || '—'}–${slot.end || '—'}`).join(', ')} · chaque
                jour de la période
              </p>
            )}
          </div>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={Boolean(start)}>{start ? '✓' : '○'} Date</li>
          </ul>
        </>
      }
    >
      <section className="ed-modal__section">
        <h3>Ce jour-là, l’établissement est…</h3>
        <div className="ed-modal__segmented" role="group" aria-label="État exceptionnel">
          <button type="button" aria-pressed={kind === 'closed'} onClick={() => setKind('closed')}>
            Fermé
          </button>
          <button
            type="button"
            disabled={!EXCEPTION_HOURS_ENABLED}
            aria-pressed={kind === 'modified'}
            onClick={() => {
              setKind('modified');
              setRecurring(false);
            }}
          >
            Horaires modifiés
          </button>
          <button
            type="button"
            disabled={!EXCEPTION_HOURS_ENABLED}
            aria-pressed={kind === 'open'}
            onClick={() => {
              setKind('open');
              setRecurring(false);
            }}
          >
            Ouvert exceptionnellement
          </button>
        </div>
        {!EXCEPTION_HOURS_ENABLED && (
          <p className="muted" style={{ fontSize: 12 }}>
            Les horaires modifiés et ouvertures exceptionnelles ne sont pas encore disponibles.
          </p>
        )}
      </section>
      <section className="ed-modal__section">
        <h3>Quand ?</h3>
        <ChipSet>
          {holidays.map((holiday) => (
            <Chip
              key={`${holiday.date}-${holiday.label}`}
              label={`${holiday.label} · ${holiday.date.slice(8)}/${holiday.date.slice(5, 7)}`}
              on={start === holiday.date && !isRange}
              onClick={() => {
                setStart(holiday.date);
                setEnd(holiday.date);
                setIsRange(false);
                setLabel(holiday.label);
              }}
            />
          ))}
        </ChipSet>
      </section>
      <Disclosure title="Donner un nom à l’exception" defaultOpen={Boolean(label)}>
        <Field label="Nom (optionnel)" hint="ex. Travaux, Jour férié, Congés annuels.">
          <Input
            aria-label="Nom de la fermeture"
            value={label}
            placeholder="ex. Travaux, Jour férié"
            onChange={setLabel}
          />
        </Field>
      </Disclosure>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}>
        <input
          type="checkbox"
          aria-label="Plage de dates"
          checked={isRange}
          onChange={(e) => setIsRange(e.target.checked)}
        />
        Plage de dates
      </label>

      <div className="grid-2" style={{ gap: 10 }}>
        <Field
          label={isRange ? 'Début' : exceptionalHours ? 'Date de l’exception' : 'Date de fermeture'}
        >
          <Input
            type="date"
            aria-label={exceptionalHours ? 'Date de l’exception' : 'Date de fermeture'}
            value={start}
            onChange={setStart}
          />
        </Field>
        {isRange && (
          <Field label="Fin">
            <Input type="date" aria-label="Fin de fermeture" value={end} onChange={setEnd} />
          </Field>
        )}
      </div>

      {exceptionalHours && (
        <section className="ed-modal__section">
          <h3>Horaires exceptionnels</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            Ces plages s’appliquent à chaque jour de la période.
          </p>
          {slots.map((slot, index) => (
            <div className="grid-2" key={index} style={{ gap: 10, marginTop: 10 }}>
              {(['start', 'end'] as const).map((key) => (
                <Field
                  key={key}
                  label={`${key === 'start' ? 'Début' : 'Fin'} · plage ${index + 1}`}
                >
                  <Input
                    mono
                    readOnly={!EXCEPTION_HOURS_ENABLED || Boolean(editingReason)}
                    value={slot[key]}
                    placeholder={key === 'start' ? '9h30' : '16:00'}
                    aria-label={`${key === 'start' ? 'Début' : 'Fin'} de la plage ${index + 1}`}
                    onChange={(value) =>
                      setSlots((current) =>
                        current.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
                      )
                    }
                    onBlur={() =>
                      setSlots((current) =>
                        current.map((row, i) =>
                          i === index
                            ? { ...row, [key]: formatScheduleTime(row[key]) ?? row[key] }
                            : row,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 10 }}
            onClick={() =>
              setSlots((current) =>
                current.length === 1 ? [...current, { start: '', end: '' }] : current.slice(0, 1),
              )
            }
          >
            {slots.length === 1 ? 'Ajouter une deuxième plage' : 'Retirer la deuxième plage'}
          </button>
        </section>
      )}

      {notes.map(({ days, note }) => (
        <p key={`${days}-${note}`} className="muted" style={{ fontSize: 12 }}>
          {days} — {note}
        </p>
      ))}
      {editingReason && <p role="alert">{editingReason}</p>}
      {!editingReason && validation.error && start && <p role="alert">{validation.error}</p>}
      {validation.warning && (
        <p role="status" className="muted" style={{ fontSize: 12 }}>
          {validation.warning}
        </p>
      )}

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}>
        <input
          type="checkbox"
          aria-label="Se répète chaque année"
          checked={recurring && !exceptionalHours}
          disabled={exceptionalHours}
          onChange={(e) => setRecurring(e.target.checked)}
        />
        Se répète chaque année
      </label>
      {exceptionalHours && (
        <p className="muted" style={{ fontSize: 12 }}>
          Les exceptions horaires utilisent des dates précises, sans répétition annuelle.
        </p>
      )}
    </EditorModal>
  );
}
