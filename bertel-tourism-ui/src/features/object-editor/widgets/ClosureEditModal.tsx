import { useState } from 'react';
import { EditorModal, Field, Input } from '../primitives';
import { encodeCyclicRange } from '../sections/opening-recurrence';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

interface ClosureEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** The closure being edited; absent in 'add' mode. */
  draft?: ObjectWorkspaceOpeningPeriod;
  onClose: () => void;
  onSave: (closure: ObjectWorkspaceOpeningPeriod) => void;
}

/**
 * Object-level closure editor (jours fériés, travaux, fermetures ponctuelles). A closure
 * is the top-priority layer in the opening cascade (isClosure: true) and overrides any
 * open period for the dates it covers — so it has NO weekly schedule (weekdays/closedDays
 * stay empty). It is authored here, separate from the weekly-hours OpeningPeriodEditModal.
 *
 *  - Single date   ⇒ start = end.
 *  - "Plage de dates" reveals a second date input (end).
 *  - "Se répète chaque année" ⇒ recurrence 'cyclic', dates re-encoded into the sentinel
 *    year (2000) via encodeCyclicRange; otherwise 'fixed' with the literal calendar dates.
 *
 * recordId / order are carried from the edited draft so an edit replaces in place; no
 * control in this modal ever sets them.
 */
export function ClosureEditModal({ open, mode, draft, onClose, onSave }: ClosureEditModalProps) {
  const [label, setLabel] = useState(draft?.label ?? '');
  const [isRange, setIsRange] = useState(Boolean(draft && draft.endDate !== '' && draft.startDate !== draft.endDate));
  const [recurring, setRecurring] = useState(draft?.recurrence === 'cyclic');
  const [start, setStart] = useState(draft?.startDate ?? '');
  const [end, setEnd] = useState(draft?.endDate ?? '');

  const canSave = start.length > 0 && (!isRange || end.length > 0);

  function build(): ObjectWorkspaceOpeningPeriod {
    const effEnd = isRange ? end : start;
    let startDate = start;
    let endDate = effEnd;
    if (recurring && start) {
      const startMonth = Number(start.slice(5, 7));
      const startDay = Number(start.slice(8, 10));
      const endMonth = Number(effEnd.slice(5, 7));
      const endDay = Number(effEnd.slice(8, 10));
      ({ startDate, endDate } = encodeCyclicRange(startMonth, startDay, endMonth, endDay));
    }
    return {
      recordId: draft?.recordId ?? null,
      order: draft?.order ?? '1',
      bucket: 'current',
      label,
      seasonTypeCode: '',
      startDate,
      endDate,
      allYears: recurring,
      recurrence: recurring ? 'cyclic' : 'fixed',
      isClosure: true,
      closedDays: [],
      weekdays: [],
    };
  }

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier la fermeture' : 'Ajouter une fermeture'}
      onClose={onClose}
      onSave={() => onSave(build())}
      saveDisabled={!canSave}
      size="default"
    >
      <Field label="Nom (optionnel)" hint="ex. Travaux, Jour férié, Congés annuels.">
        <Input
          aria-label="Nom de la fermeture"
          value={label}
          placeholder="ex. Travaux, Jour férié"
          onChange={setLabel}
        />
      </Field>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}>
        <input type="checkbox" aria-label="Plage de dates" checked={isRange} onChange={(e) => setIsRange(e.target.checked)} />
        Plage de dates
      </label>

      <div className="grid-2" style={{ gap: 10 }}>
        <Field label={isRange ? 'Début' : 'Date de fermeture'}>
          <Input type="date" aria-label="Date de fermeture" value={start} onChange={setStart} />
        </Field>
        {isRange && (
          <Field label="Fin">
            <Input type="date" aria-label="Fin de fermeture" value={end} onChange={setEnd} />
          </Field>
        )}
      </div>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}>
        <input
          type="checkbox"
          aria-label="Se répète chaque année"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
        />
        Se répète chaque année
      </label>
    </EditorModal>
  );
}
