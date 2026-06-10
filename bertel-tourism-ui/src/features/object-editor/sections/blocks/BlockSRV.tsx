import { Chip, ChipSet, Fs } from '../../primitives';
import type { SectionProps } from '../section-types';
import { OwnedElsewhereNote } from './block-notes';

function toggle(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

export function BlockSRV({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const services = characteristics.amenityGroups.flatMap((group) => group.options);
  const selectedCount = characteristics.selectedAmenityCodes.length;
  const langCount = characteristics.selectedLanguages.length;

  return (
    <Fs
      num="05"
      title="Prestations & zone d'intervention"
      sub="Prestations délivrées au comptoir, communes desservies, langues et horaires saisonniers"
      folded={folded}
      pill={{
        tone: selectedCount > 0 ? 'ok' : 'warn',
        label:
          langCount > 0
            ? `${selectedCount} prestation(s) · ${langCount} langue(s)`
            : `${selectedCount} prestation(s)`,
      }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Prestations délivrées
      </div>
      <ChipSet>
        {services.slice(0, 18).map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedAmenityCodes.includes(option.code)}
            onClick={() =>
              editor.replaceModule('characteristics', {
                ...characteristics,
                selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, option.code),
              })
            }
          />
        ))}
      </ChipSet>

      {/* §48 single-owner: languages are edited in §12, opening hours in §14 (last-edit-wins trap otherwise) */}
      <OwnedElsewhereNote num="12" label="Paiements & langues" summary={`${langCount} langue(s)`} />
      <OwnedElsewhereNote num="14" label="Périodes d'ouverture" summary={`${openings.periods.length} période(s)`} />
    </Fs>
  );
}
