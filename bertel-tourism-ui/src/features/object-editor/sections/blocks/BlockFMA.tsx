import { Field, Fs, Input, Repeater, Select, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { ModuleUnavailableNotice } from './block-notes';

const OCCURRENCE_COLS = '14px 1fr 1fr 130px auto';
// object_fma_occurrence.state is free TEXT; the loader defaults to 'scheduled'.
const STATE_OPTIONS = [
  { v: 'scheduled', l: 'Programmée' },
  { v: 'confirmed', l: 'Confirmée' },
  { v: 'cancelled', l: 'Annulée' },
  { v: 'postponed', l: 'Reportée' },
];

/** ISO timestamptz → <input type="datetime-local"> value (minute precision). */
function toLocalInputValue(value: string): string {
  return value ? value.slice(0, 16) : '';
}

export function BlockFMA({ editor, folded }: SectionProps) {
  const event = editor.draft.event;

  function patch(patchValue: Partial<typeof event>) {
    editor.patchModule('event', patchValue);
  }

  function updateOccurrence(index: number, patchValue: Partial<(typeof event.occurrences)[number]>) {
    patch({
      occurrences: event.occurrences.map((occurrence, occurrenceIndex) =>
        occurrenceIndex === index ? { ...occurrence, ...patchValue } : occurrence,
      ),
    });
  }

  const pillLabel =
    event.occurrences.length > 0
      ? `${event.occurrences.length} occurrence(s)`
      : event.startDate
        ? 'Dates renseignées'
        : 'À programmer';

  return (
    <Fs
      num="05"
      title="Dates & programmation"
      sub="Période de l'événement, horaires, récurrence et occurrences détaillées"
      folded={folded}
      pill={
        event.unavailableReason
          ? { tone: 'warn', label: 'Non applicable' }
          : { tone: event.startDate || event.occurrences.length > 0 ? 'ok' : 'warn', label: pillLabel }
      }
    >
      {/* §46 type-gated event module — the WHOLE section body edits `event`,
          so the notice replaces everything when gated */}
      {event.unavailableReason ? (
        <ModuleUnavailableNotice reason={event.unavailableReason} />
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 10 }}>
            <Field label="Date de début">
              <Input type="date" aria-label="Date de début" value={event.startDate} onChange={(startDate) => patch({ startDate })} />
            </Field>
            <Field label="Date de fin">
              <Input type="date" aria-label="Date de fin" value={event.endDate} onChange={(endDate) => patch({ endDate })} />
            </Field>
            <Field label="Heure de début">
              <Input type="time" aria-label="Heure de début" value={event.startTime} onChange={(startTime) => patch({ startTime })} />
            </Field>
            <Field label="Heure de fin">
              <Input type="time" aria-label="Heure de fin" value={event.endTime} onChange={(endTime) => patch({ endTime })} />
            </Field>
          </div>
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <Toggle
              label="Événement récurrent"
              sub="Se répète selon une règle"
              on={event.recurring}
              onChange={(recurring) => patch({ recurring })}
            />
            {event.recurring && (
              <Field label="Règle de récurrence" hint="Texte libre — ex. « tous les premiers dimanches du mois »">
                <Input value={event.recurrenceText} onChange={(recurrenceText) => patch({ recurrenceText })} />
              </Field>
            )}
          </div>

          <div className="chip-group__label">Occurrences détaillées</div>
          <Repeater
            items={event.occurrences}
            getKey={(occurrence, index) => `${occurrence.recordId ?? 'occ'}-${index}`}
            columns={OCCURRENCE_COLS}
            addLabel="Ajouter une occurrence"
            onAdd={() =>
              patch({
                occurrences: [...event.occurrences, { recordId: null, startAt: '', endAt: '', state: 'scheduled' }],
              })
            }
            renderRow={(occurrence, index) => (
              <>
                <span className="rep-row__handle" aria-hidden />
                <Input
                  type="datetime-local"
                  aria-label="Début de l'occurrence"
                  value={toLocalInputValue(occurrence.startAt)}
                  onChange={(startAt) => updateOccurrence(index, { startAt })}
                />
                <Input
                  type="datetime-local"
                  aria-label="Fin de l'occurrence"
                  value={toLocalInputValue(occurrence.endAt)}
                  onChange={(endAt) => updateOccurrence(index, { endAt })}
                />
                <Select
                  value={occurrence.state || 'scheduled'}
                  options={STATE_OPTIONS}
                  onChange={(state) => updateOccurrence(index, { state })}
                />
                <button
                  type="button"
                  className="del"
                  onClick={() => patch({ occurrences: event.occurrences.filter((_, i) => i !== index) })}
                >
                  ×
                </button>
              </>
            )}
          />
        </>
      )}
    </Fs>
  );
}
