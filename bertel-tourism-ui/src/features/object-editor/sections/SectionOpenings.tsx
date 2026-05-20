import { Fs, Input, Repeater, Select, Toggle } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

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

function pattern(period: ObjectWorkspaceOpeningPeriod) {
  const open = period.weekdays.filter((day) => day.slots.length > 0).map((day) => day.label.slice(0, 3));
  return open.length ? open.join(', ') : 'Fermé / non renseigné';
}

export function SectionOpenings({ editor, folded }: SectionProps) {
  const openings = editor.draft.openings;

  function replace(periods: ObjectWorkspaceOpeningPeriod[]) {
    editor.replaceModule('openings', { ...openings, periods });
  }

  function update(index: number, patch: Partial<ObjectWorkspaceOpeningPeriod>) {
    replace(openings.periods.map((period, periodIndex) => periodIndex === index ? { ...period, ...patch } : period));
  }

  return (
    <Fs num="14" title="Périodes d'ouverture" sub="Saisons, dates de validité et jours fermés" folded={folded} pill={{ tone: 'ok', label: `${openings.periods.length} période(s)` }}>
      <Repeater
        items={openings.periods}
        getKey={(period, index) => `${period.recordId ?? 'period'}-${index}`}
        columns="1.2fr 126px 126px 120px 1fr auto"
        addLabel="Ajouter une période"
        onAdd={() => replace([...openings.periods, createPeriod(openings.periods.length)])}
        renderRow={(period, index) => (
          <>
            <Input value={period.label} placeholder="Nom de période" onChange={(label) => update(index, { label })} />
            <Input type="date" value={period.startDate} onChange={(startDate) => update(index, { startDate })} />
            <Input type="date" value={period.endDate} onChange={(endDate) => update(index, { endDate })} />
            <Select value={period.bucket} options={[{ v: 'current', l: 'Courante' }, { v: 'next-year', l: 'N+1' }, { v: 'undated', l: 'Sans date' }]} onChange={(bucket) => update(index, { bucket: bucket as ObjectWorkspaceOpeningPeriod['bucket'] })} />
            <Input value={period.closedDays.join(', ')} placeholder={pattern(period)} onChange={(value) => update(index, { closedDays: value.split(',').map((entry) => entry.trim()).filter(Boolean) })} />
            <Toggle label="Toute l’année" on={period.allYears} onChange={(allYears) => update(index, { allYears })} />
          </>
        )}
      />
    </Fs>
  );
}
