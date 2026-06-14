import { ChipMultiSelect, Fs } from '../../primitives';
import type { SectionProps } from '../section-types';
import { OwnedElsewhereNote } from './block-notes';

export function BlockSRV({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const services = characteristics.amenityGroups.flatMap((group) => group.options);
  const selectedCount = characteristics.selectedAmenityCodes.length;
  const langCount = characteristics.selectedLanguages.length;

  return (
    <Fs
      num="06"
      title="Prestations au comptoir"
      sub="Prestations délivrées au comptoir — langues gérées en §12, horaires en §14"
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

      {/* §48 single-owner: languages are edited in §12, opening hours in §14 (last-edit-wins trap otherwise) */}
      <OwnedElsewhereNote num="12" label="Paiements & langues" summary={`${langCount} langue(s)`} />
      <OwnedElsewhereNote num="14" label="Périodes d'ouverture" summary={`${openings.periods.length} période(s)`} />
    </Fs>
  );
}
