import { ChipMultiSelect, Fs } from '../../primitives';
import type { SectionProps } from '../section-types';
import { OwnedElsewhereNote } from './block-notes';
import { EDITOR_SECTION_REFERENCES } from '../../section-config';

export function BlockSRV({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const services = characteristics.amenityGroups.flatMap((group) => group.options);
  const selectedCount = characteristics.selectedAmenityCodes.length;
  const langCount = characteristics.selectedLanguages.length;
  const languagesSection = EDITOR_SECTION_REFERENCES.languages;
  const openingsSection = EDITOR_SECTION_REFERENCES.openings;

  return (
    <Fs
      num="06"
      title="Prestations au comptoir"
      sub={`Prestations délivrées au comptoir — ${languagesSection.label} (§${languagesSection.num}), ${openingsSection.label} (§${openingsSection.num})`}
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
      <ChipMultiSelect
        options={services}
        selected={characteristics.selectedAmenityCodes}
        modalTitle="Choisir les prestations délivrées"
        searchPlaceholder="Rechercher une prestation…"
        onChange={(codes) =>
          editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: codes })
        }
      />

      {/* The shared destinations also drive the numbered editor navigation. */}
      <OwnedElsewhereNote {...languagesSection} summary={`${langCount} langue(s)`} />
      <OwnedElsewhereNote {...openingsSection} summary={`${openings.periods.length} période(s)`} />
    </Fs>
  );
}
