import { Chip, ChipSet, Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistinctionItem } from '../../../services/object-workspace-parser';

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

function isAccessibilityFamily(familyCode: string, familyLabel: string) {
  const text = `${familyCode} ${familyLabel}`.toLowerCase();
  return ['access', 'handicap', 'pmr', 'mobilite', 'visuel', 'auditif'].some((token) => text.includes(token));
}

export function SectionAccessibility({ editor, folded }: SectionProps) {
  const distinctions = editor.draft.distinctions;
  const characteristics = editor.draft.characteristics;
  const families = characteristics.amenityGroups.filter((group) => isAccessibilityFamily(group.familyCode, group.familyLabel));

  function updateLabel(item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    editor.replaceModule('distinctions', {
      ...distinctions,
      accessibilityLabels: distinctions.accessibilityLabels.map((candidate) => candidate === item ? { ...candidate, ...patch } : candidate),
    });
  }

  return (
    <Fs num="10" title="Accessibilité" sub="Labels, équipements et couverture handicap" folded={folded} pill={{ tone: families.length > 0 ? 'ok' : 'warn', label: `${families.length} famille(s)` }}>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Labels accessibilité</div>
      <div className="repeater">
        {distinctions.accessibilityLabels.map((item) => (
          <div key={`${item.schemeCode}-${item.valueCode}`} className="rep-row" style={{ gridTemplateColumns: '1fr 1fr 120px' }}>
            <Input value={item.valueLabel} onChange={(valueLabel) => updateLabel(item, { valueLabel })} />
            <Input value={item.disabilityTypesCovered.join(', ')} onChange={(value) => updateLabel(item, { disabilityTypesCovered: value.split(',').map((entry) => entry.trim()).filter(Boolean) })} />
            <Select value={item.status || 'active'} options={['active', 'pending', 'expired']} onChange={(status) => updateLabel(item, { status })} />
          </div>
        ))}
      </div>

      <div className="chip-group__label">Équipements d’accessibilité</div>
      {families.map((family) => (
        <div key={family.familyCode} style={{ marginBottom: 12 }}>
          <div className="chip-group__label">{family.familyLabel}</div>
          <ChipSet>
            {family.options.map((option) => (
              <Chip
                key={option.code}
                label={option.label}
                on={characteristics.selectedAmenityCodes.includes(option.code)}
                onClick={() => editor.replaceModule('characteristics', {
                  ...characteristics,
                  selectedAmenityCodes: toggleCode(characteristics.selectedAmenityCodes, option.code),
                })}
              />
            ))}
          </ChipSet>
        </div>
      ))}

      {distinctions.accessibilityAmenityCoverage.length > 0 && (
        <>
          <div className="chip-group__label">Couverture détectée</div>
          <ChipSet>
            {distinctions.accessibilityAmenityCoverage.map((item) => (
              <Chip key={item.code} label={`${item.label}${item.disabilityTypes.length ? ` · ${item.disabilityTypes.join(', ')}` : ''}`} on />
            ))}
          </ChipSet>
        </>
      )}
    </Fs>
  );
}
