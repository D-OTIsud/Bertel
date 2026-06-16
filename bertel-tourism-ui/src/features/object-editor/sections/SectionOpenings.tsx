import { useState } from 'react';
import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';
import { OpeningPeriodsEditor } from './OpeningPeriodsEditor';
import { OpeningPeriodEditModal } from '../widgets/OpeningPeriodEditModal';
import { createPeriodDraft } from './opening-period-edit';
import { currentPeriodIndex } from './blocks/opening-period-meta';

export function SectionOpenings({ editor, folded }: SectionProps) {
  const openings = editor.draft.openings;
  const periods = openings.periods;
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function replace(next: ObjectWorkspaceOpeningPeriod[]) {
    editor.replaceModule('openings', { ...openings, periods: next });
  }

  function handleDelete(index: number) {
    const label = periods[index]?.label || `Période ${index + 1}`;
    if (!window.confirm(`Supprimer la période « ${label} » ?`)) {
      return;
    }
    replace(periods.filter((_, periodIndex) => periodIndex !== index));
  }

  return (
    <Fs
      num="14"
      title="Périodes d'ouverture"
      sub="Saisons, exceptions, jours fériés et horaires par jour"
      folded={folded}
      pill={{ tone: 'ok', label: `${periods.length} période(s)` }}
    >
      <OpeningPeriodsEditor
        periods={periods}
        periodTypeOptions={openings.periodTypeOptions}
        currentIndex={currentPeriodIndex(periods)}
        onAdd={() => setAdding(true)}
        onEdit={(index) => setEditingIndex(index)}
        onDelete={handleDelete}
      />

      {adding && (
        <OpeningPeriodEditModal
          open
          mode="add"
          draft={createPeriodDraft(periods.length)}
          periodTypeOptions={openings.periodTypeOptions}
          onClose={() => setAdding(false)}
          onSave={(period) => {
            replace([...periods, period]);
            setAdding(false);
          }}
        />
      )}

      {editingIndex !== null && periods[editingIndex] && (
        <OpeningPeriodEditModal
          open
          mode="edit"
          draft={periods[editingIndex]}
          periodTypeOptions={openings.periodTypeOptions}
          onClose={() => setEditingIndex(null)}
          onSave={(period) => {
            replace(periods.map((row, rowIndex) => (rowIndex === editingIndex ? period : row)));
            setEditingIndex(null);
          }}
        />
      )}
    </Fs>
  );
}
