import { Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistinctionItem } from '../../../services/object-workspace-parser';

const STATUS_OPTIONS = [
  { v: 'active', l: 'Accordée' },
  { v: 'granted', l: 'Accordée' },
  { v: 'pending', l: 'En cours' },
  { v: 'expired', l: 'Expirée' },
  { v: 'suspended', l: 'Suspendue' },
];

function statusBucket(item: ObjectWorkspaceDistinctionItem) {
  const status = item.status || 'active';
  if (status === 'pending') return 'pending';
  if (status === 'expired' || status === 'suspended') return 'expired';
  return 'granted';
}

export function SectionClassification({ editor, folded }: SectionProps) {
  const distinctions = editor.draft.distinctions;
  const rows = distinctions.distinctionGroups.flatMap((group) => group.items.map((item) => ({ group, item })));
  const granted = rows.filter(({ item }) => statusBucket(item) === 'granted').length;
  const pending = rows.filter(({ item }) => statusBucket(item) === 'pending').length;
  const expired = rows.filter(({ item }) => statusBucket(item) === 'expired').length;

  function update(groupCode: string, item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    editor.replaceModule('distinctions', {
      ...distinctions,
      distinctionGroups: distinctions.distinctionGroups.map((group) => (
        group.schemeCode === groupCode
          ? { ...group, items: group.items.map((candidate) => (candidate === item ? { ...candidate, ...patch } : candidate)) }
          : group
      )),
    });
  }

  return (
    <Fs num="08" title="Classifications & distinctions" sub="Étoiles, labels, marques, statuts et dates de validité" folded={folded} pill={{ tone: 'ok', label: `${granted} accordée(s)` }}>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="class-kpi class-kpi--ok"><div className="class-kpi__num">{granted}</div><div className="class-kpi__lbl">Accordées</div></div>
        <div className="class-kpi class-kpi--warn"><div className="class-kpi__num">{pending}</div><div className="class-kpi__lbl">En cours</div></div>
        <div className="class-kpi class-kpi--red"><div className="class-kpi__num">{expired}</div><div className="class-kpi__lbl">Expirées</div></div>
        <div className="class-kpi"><div className="class-kpi__num">{rows.length}</div><div className="class-kpi__lbl">Total</div></div>
      </div>

      <div className="repeater">
        {rows.map(({ group, item }) => (
          <div key={`${group.schemeCode}-${item.valueCode}`} className="rep-row" style={{ gridTemplateColumns: '1.4fr 1.2fr 120px 130px 130px' }}>
            <div className="class-row__sch">
              <div className="class-row__scheme">{group.schemeLabel}</div>
              <small>{item.schemeCode}</small>
            </div>
            <Input value={item.valueLabel} onChange={(valueLabel) => update(group.schemeCode, item, { valueLabel })} />
            <Select value={item.status || 'active'} options={STATUS_OPTIONS} onChange={(status) => update(group.schemeCode, item, { status })} />
            <Input type="date" value={item.awardedAt} onChange={(awardedAt) => update(group.schemeCode, item, { awardedAt })} />
            <Input type="date" value={item.validUntil} onChange={(validUntil) => update(group.schemeCode, item, { validUntil })} />
          </div>
        ))}
      </div>
    </Fs>
  );
}
