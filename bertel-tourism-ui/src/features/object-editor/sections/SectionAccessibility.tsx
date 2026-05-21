import { Chip, ChipSet, Field, Fs, Input, LangTabs, Select, Textarea } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistinctionItem } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

function isAccessibilityFamily(familyCode: string, familyLabel: string) {
  const text = `${familyCode} ${familyLabel}`.toLowerCase();
  return ['access', 'handicap', 'pmr', 'mobilite', 'visuel', 'auditif', 'mental', 'cognitif'].some((token) =>
    text.includes(token),
  );
}

const LANG_LABELS: Record<string, string> = { fr: 'FR', en: 'EN', cre: 'CRE' };

export function SectionAccessibility({ editor, folded }: SectionProps) {
  const distinctions = editor.draft.distinctions;
  const characteristics = editor.draft.characteristics;
  const descriptions = editor.draft.descriptions;
  const active = descriptions.activeLanguage;
  const objectScope = descriptions.object;
  const families = characteristics.amenityGroups.filter((group) =>
    isAccessibilityFamily(group.familyCode, group.familyLabel),
  );
  const selectedAmenities = families.reduce(
    (sum, family) =>
      sum + family.options.filter((option) => characteristics.selectedAmenityCodes.includes(option.code)).length,
    0,
  );
  const totalAmenities = families.reduce((sum, family) => sum + family.options.length, 0);
  const familiesWithSelection = families.filter((family) =>
    family.options.some((option) => characteristics.selectedAmenityCodes.includes(option.code)),
  ).length;

  function updateLabel(item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    editor.replaceModule('distinctions', {
      ...distinctions,
      accessibilityLabels: distinctions.accessibilityLabels.map((candidate) =>
        candidate === item ? { ...candidate, ...patch } : candidate,
      ),
    });
  }

  const langTabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code.toUpperCase(),
    filled: Boolean(readTranslatableField(objectScope.adaptedDescription, code, descriptions.localLanguage).trim()),
  }));

  return (
    <Fs
      num="10"
      title="Accessibilité"
      sub="Description adaptée multilingue, équipements (ref_amenity famille accessibility), chambres / lieux accessibles"
      folded={folded}
      pill={{
        tone: familiesWithSelection > 0 ? 'ok' : 'warn',
        label:
          totalAmenities > 0
            ? `${familiesWithSelection} / ${families.length} famille(s) · ${selectedAmenities} équip.`
            : `${families.length} famille(s)`,
      }}
    >
      <Field
        label="Description adaptée (description_adapted)"
        hint="Texte alternatif détaillé — utilisé par Acceslibre et lecteurs d'écran. Multilingue."
      >
        {langTabs.length > 0 && (
          <LangTabs
            tabs={langTabs}
            active={active}
            onSelect={(code) => editor.replaceModule('descriptions', { ...descriptions, activeLanguage: code })}
          />
        )}
        <Textarea
          value={readTranslatableField(objectScope.adaptedDescription, active, descriptions.localLanguage)}
          rows={5}
          onChange={(value) => {
            const updated = updateTranslatableField(
              objectScope.adaptedDescription,
              active,
              descriptions.localLanguage,
              value,
            );
            editor.replaceModule('descriptions', {
              ...descriptions,
              object: { ...objectScope, adaptedDescription: updated },
            });
          }}
        />
      </Field>

      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Labels accessibilité
      </div>
      <div className="repeater">
        {distinctions.accessibilityLabels.map((item) => (
          <div
            key={`${item.schemeCode}-${item.valueCode}`}
            className="rep-row"
            style={{ gridTemplateColumns: '14px 1fr 1fr 120px auto', alignItems: 'center' }}
          >
            <span className="rep-row__handle" aria-hidden />
            <Input value={item.valueLabel} onChange={(valueLabel) => updateLabel(item, { valueLabel })} />
            <Input
              value={item.disabilityTypesCovered.join(', ')}
              placeholder="Types couverts"
              onChange={(value) =>
                updateLabel(item, {
                  disabilityTypesCovered: value.split(',').map((entry) => entry.trim()).filter(Boolean),
                })
              }
            />
            <Select
              value={item.status || 'active'}
              options={['active', 'pending', 'expired']}
              onChange={(status) => updateLabel(item, { status })}
            />
          </div>
        ))}
      </div>

      {families.map((family) => (
        <div key={family.familyCode}>
          <div className="chip-group__label" style={{ marginTop: 14 }}>
            {family.familyLabel}
          </div>
          <ChipSet>
            {family.options.map((option) => (
              <Chip
                key={option.code}
                label={option.label}
                on={characteristics.selectedAmenityCodes.includes(option.code)}
                onClick={() =>
                  editor.replaceModule('characteristics', {
                    ...characteristics,
                    selectedAmenityCodes: toggleCode(characteristics.selectedAmenityCodes, option.code),
                  })
                }
              />
            ))}
          </ChipSet>
        </div>
      ))}

      {distinctions.accessibilityAmenityCoverage.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 18 }}>
            Couverture détectée
          </div>
          <ChipSet>
            {distinctions.accessibilityAmenityCoverage.map((item) => (
              <Chip
                key={item.code}
                label={`${item.label}${item.disabilityTypes.length ? ` · ${item.disabilityTypes.join(', ')}` : ''}`}
                on
              />
            ))}
          </ChipSet>
        </>
      )}
    </Fs>
  );
}
