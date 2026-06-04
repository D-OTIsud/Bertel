import { Fs, Input, ReferenceSelect, Select } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistinctionItem } from '../../../services/object-workspace-parser';

// Canonical object_classification.status lifecycle (OBJECT_DATA_DICTIONARY.md): granted/requested/suspended/expired.
// The legacy 'active'/'pending'/'revoked' aliases are NOT written — every backend label read/filter
// gates on status='granted', so a non-canonical status makes an editor-authored label invisible. See lot1_mapping_decisions §30.
const STATUS_OPTIONS = [
  { v: 'granted', l: 'Accordée' },
  { v: 'requested', l: 'En cours / demande' },
  { v: 'suspended', l: 'Retirée' },
  { v: 'expired', l: 'Expirée' },
];

const CLASS_COLS = '14px 1.4fr 1.2fr 110px 95px 95px auto';

function statusBucket(item: ObjectWorkspaceDistinctionItem) {
  const status = item.status || 'granted';
  if (status === 'requested' || status === 'pending') return 'pending';
  if (status === 'expired' || status === 'suspended' || status === 'revoked') return 'expired';
  return 'granted';
}

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 8,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

export function SectionClassification({ editor, folded }: SectionProps) {
  const distinctions = editor.draft.distinctions;
  const rows = distinctions.distinctionGroups.flatMap((group) => group.items.map((item) => ({ group, item })));
  const granted = rows.filter(({ item }) => statusBucket(item) === 'granted').length;
  const pending = rows.filter(({ item }) => statusBucket(item) === 'pending').length;
  const expired = rows.filter(({ item }) => statusBucket(item) === 'expired').length;
  const nextExpiry = rows
    .map(({ item }) => item.validUntil)
    .filter(Boolean)
    .sort()[0];

  function update(groupCode: string, item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    editor.replaceModule('distinctions', {
      ...distinctions,
      distinctionGroups: distinctions.distinctionGroups.map((group) =>
        group.schemeCode === groupCode
          ? { ...group, items: group.items.map((candidate) => (candidate === item ? { ...candidate, ...patch } : candidate)) }
          : group,
      ),
    });
  }

  return (
    <Fs
      num="08"
      title="Classifications & distinctions"
      sub="Étoiles, labels, marques, statuts et dates de validité."
      folded={folded}
      pill={{
        tone: granted > 0 ? 'ok' : 'warn',
        label: pending > 0 ? `${granted} accordée(s) · ${pending} en cours` : `${granted} accordée(s)`,
      }}
    >
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="class-kpi class-kpi--ok">
          <div className="class-kpi__num">{granted}</div>
          <div className="class-kpi__lbl">Accordées</div>
        </div>
        <div className="class-kpi class-kpi--warn">
          <div className="class-kpi__num">{pending}</div>
          <div className="class-kpi__lbl">En cours / demande</div>
        </div>
        <div className="class-kpi class-kpi--red">
          <div className="class-kpi__num">{expired}</div>
          <div className="class-kpi__lbl">Expirées · à renouveler</div>
        </div>
        <div className="class-kpi">
          <div className="class-kpi__num" style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>
            {nextExpiry || '—'}
          </div>
          <div className="class-kpi__lbl">Prochaine échéance</div>
        </div>
      </div>

      {repHeader(CLASS_COLS, ['', 'Référentiel', 'Valeur attribuée', 'Statut', 'Acquis le', "Valable jusqu'au"])}
      <div className="repeater">
        {rows.map(({ group, item }) => (
          <div
            key={`${group.schemeCode}-${item.valueCode}`}
            className="rep-row class-row"
            style={{ gridTemplateColumns: CLASS_COLS, alignItems: 'center' }}
          >
            <span className="rep-row__handle" aria-hidden />
            <div className="class-row__sch">
              <div className="class-row__scheme">{group.schemeLabel}</div>
            </div>
            <ReferenceSelect
              aria-label="Valeur attribuée"
              value={item.valueCode}
              options={distinctions.schemeOptions.find((s) => s.code === group.schemeCode)?.valueOptions ?? []}
              onChange={(_code, option) => {
                if (option) {
                  update(group.schemeCode, item, { valueId: option.id, valueCode: option.code, valueLabel: option.label });
                }
              }}
            />
            <Select
              value={item.status || 'granted'}
              options={STATUS_OPTIONS}
              onChange={(status) => update(group.schemeCode, item, { status })}
            />
            <Input type="date" value={item.awardedAt} onChange={(awardedAt) => update(group.schemeCode, item, { awardedAt })} />
            <Input type="date" value={item.validUntil} onChange={(validUntil) => update(group.schemeCode, item, { validUntil })} />
          </div>
        ))}
      </div>
    </Fs>
  );
}
