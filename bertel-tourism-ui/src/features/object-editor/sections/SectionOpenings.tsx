import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';
import { OpeningPeriodsEditor } from './OpeningPeriodsEditor';

const WEEKDAYS = [
  ['monday', 'Lundi'],
  ['tuesday', 'Mardi'],
  ['wednesday', 'Mercredi'],
  ['thursday', 'Jeudi'],
  ['friday', 'Vendredi'],
  ['saturday', 'Samedi'],
  ['sunday', 'Dimanche'],
] as const;

function createPeriod(index: number): ObjectWorkspaceOpeningPeriod {
  return {
    recordId: null,
    order: String(index + 1),
    bucket: 'current',
    label: '',
    startDate: '',
    endDate: '',
    allYears: true,
    closedDays: [],
    weekdays: WEEKDAYS.map(([code, label]) => ({ code, label, slots: [] })),
  };
}

export function SectionOpenings({ editor, folded }: SectionProps) {
  const openings = editor.draft.openings;

  function replace(periods: ObjectWorkspaceOpeningPeriod[]) {
    editor.replaceModule('openings', { ...openings, periods });
  }

  return (
    <Fs
      num="14"
      title="Périodes d'ouverture"
      sub="object_opening — saisons, exceptions, jours fériés · horaires par jour"
      folded={folded}
      pill={{ tone: 'ok', label: `${openings.periods.length} période(s)` }}
    >
      <OpeningPeriodsEditor
        periods={openings.periods}
        onPeriodsChange={replace}
        onAddPeriod={() => replace([...openings.periods, createPeriod(openings.periods.length)])}
      />
    </Fs>
  );
}
