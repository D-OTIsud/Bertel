import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Disclosure, Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';
import { OpeningPeriodsEditor } from './OpeningPeriodsEditor';
import { OpeningPeriodEditModal } from '../widgets/OpeningPeriodEditModal';
import { ClosureEditModal } from '../widgets/ClosureEditModal';
import { createPeriodDraft } from './opening-period-edit';
import { currentPeriodIndex, formatPeriodRange } from './blocks/opening-period-meta';
import { isOpeningHoursException, openingExceptionKind } from './opening-exception';

/** Human label for a closure row: explicit name, else its formatted date range. */
function closureLabel(closure: ObjectWorkspaceOpeningPeriod): string {
  return closure.label || formatPeriodRange(closure);
}

export function SectionOpenings({ editor, permissions, folded, embedded = false }: SectionProps & { embedded?: boolean }) {
  const openings = editor.draft.openings;
  const periods = openings.periods;
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingClosure, setAddingClosure] = useState(false);
  const [editingClosure, setEditingClosure] = useState<ObjectWorkspaceOpeningPeriod | null>(null);

  // This marker only selects the editor; SQL priority comes from dates/rank, never extra.
  const openPeriods = periods.filter((period) => !period.isClosure && !isOpeningHoursException(period));
  const closures = periods.filter((period) => period.isClosure || isOpeningHoursException(period));

  function replace(next: ObjectWorkspaceOpeningPeriod[]) {
    editor.replaceModule('openings', { ...openings, periods: next });
  }

  // OpeningPeriodsEditor emits indices into openPeriods; map back to the full array by
  // object reference before mutating so unloaded closures are never dropped.
  function handleDelete(openIndex: number) {
    const target = openPeriods[openIndex];
    if (!target) {
      return;
    }
    const label = target.label || `Période ${openIndex + 1}`;
    if (!window.confirm(`Supprimer la période « ${label} » ?`)) {
      return;
    }
    replace(periods.filter((period) => period !== target));
  }

  function handleEditSave(period: ObjectWorkspaceOpeningPeriod) {
    if (editingIndex === null) {
      return;
    }
    const target = openPeriods[editingIndex];
    replace(periods.map((row) => (row === target ? period : row)));
    setEditingIndex(null);
  }

  function deleteClosure(closure: ObjectWorkspaceOpeningPeriod) {
    if (!window.confirm(`Supprimer ${closure.isClosure ? 'la fermeture' : 'l’exception'} « ${closureLabel(closure)} » ?`)) {
      return;
    }
    replace(periods.filter((period) => period !== closure));
  }

  // currentPeriodIndex is computed over the open subset so the "en cours" highlight stays
  // valid (closures are excluded). Empty subset → 0, harmless for the empty-state view.
  const currentIndex = currentPeriodIndex(openPeriods);

  const regularPeriods = <OpeningPeriodsEditor
        periods={openPeriods}
        periodTypeOptions={openings.periodTypeOptions}
        currentIndex={currentIndex}
        onAdd={() => setAdding(true)}
        onEdit={(index) => setEditingIndex(index)}
        onDelete={handleDelete}
      />;
  const content = <>
      {embedded ? <Disclosure title="Périodes d’accès régulières" summary={`${openPeriods.length} période(s)`}>{regularPeriods}</Disclosure> : regularPeriods}

      <div className="op-closures">
        <div className="chip-group__label" style={{ margin: '16px 0 6px' }}>
          {embedded ? 'Fermetures et exceptions datées' : 'Exceptions'}
        </div>
        {closures.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
            Jours fériés, travaux ou fermetures ponctuelles.
          </p>
        ) : (
          <div className="repeater">
            {closures.map((closure, index) => (
              <div
                key={`${closure.recordId ?? 'closure'}-${index}`}
                className="rep-row"
                style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600, minWidth: 0 }}>{closure.label || (closure.isClosure ? 'Fermeture' : openingExceptionKind(closure) === 'modified' ? 'Horaires modifiés' : 'Ouverture exceptionnelle')}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {formatPeriodRange(closure)}
                </span>
                <div className="rep-row__act">
                  <button
                    type="button"
                    aria-label={`Modifier ${closureLabel(closure)}`}
                    onClick={() => setEditingClosure(closure)}
                    style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="del"
                    aria-label={`Supprimer ${closureLabel(closure)}`}
                    onClick={() => deleteClosure(closure)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="rep-add" onClick={() => setAddingClosure(true)}>
          <Plus size={14} aria-hidden style={{ verticalAlign: 'middle' }} /> Ajouter une exception
        </button>
      </div>

      {adding && (
        <OpeningPeriodEditModal
          open
          mode="add"
          draft={createPeriodDraft(periods.length)}
          existingPeriods={periods.filter((period) => !period.isClosure)}
          periodTypeOptions={openings.periodTypeOptions}
          onClose={() => setAdding(false)}
          onSave={(period) => {
            replace([...periods, period]);
            setAdding(false);
          }}
        />
      )}

      {editingIndex !== null && openPeriods[editingIndex] && (
        <OpeningPeriodEditModal
          open
          mode="edit"
          draft={openPeriods[editingIndex]}
          existingPeriods={periods.filter((period) => !period.isClosure)}
          periodTypeOptions={openings.periodTypeOptions}
          onClose={() => setEditingIndex(null)}
          onSave={handleEditSave}
        />
      )}

      {addingClosure && (
        <ClosureEditModal
          open
          mode="add"
          existingPeriods={periods}
          onClose={() => setAddingClosure(false)}
          onSave={(closure) => {
            replace([...periods, { ...closure, order: String(periods.length + 1) }]);
            setAddingClosure(false);
          }}
        />
      )}

      {editingClosure && (
        <ClosureEditModal
          open
          mode="edit"
          draft={editingClosure}
          existingPeriods={periods}
          onClose={() => setEditingClosure(null)}
          onSave={(closure) => {
            replace(periods.map((period) => (period === editingClosure ? closure : period)));
            setEditingClosure(null);
          }}
        />
      )}
    </>;
  if (embedded) {
    const canEdit = permissions.openings.canDirectWrite || permissions.openings.canPrepareProposal || permissions.openings.canSubmitProposal;
    return <fieldset className="iti-embedded-fields" disabled={!canEdit}>{content}</fieldset>;
  }
  return <Fs num="14" title="Périodes d'ouverture" sub="Saisons, exceptions, jours fériés et horaires par jour" folded={folded}
    pill={{ tone: 'ok', label: `${openPeriods.length} période(s)` }}>{content}</Fs>;
}
