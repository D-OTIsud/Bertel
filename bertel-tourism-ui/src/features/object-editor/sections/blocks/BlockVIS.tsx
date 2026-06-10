import { Chip, ChipSet, Fs, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { OwnedElsewhereNote } from './block-notes';

function toggle(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

export function BlockVIS({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const pricing = editor.draft.pricing;
  const visitOptions = characteristics.amenityGroups.flatMap((group) => group.options).slice(0, 12);
  const visitModes = ['visite_libre', 'visite_guidee', 'audioguide'].filter((code) =>
    characteristics.selectedAmenityCodes.includes(code),
  ).length;

  return (
    <Fs
      num="05"
      title="Visite, médiation & accessibilité"
      sub="Sous-type patrimonial, modes de visite, tarifs, horaires basse/haute saison, publics"
      folded={folded}
      pill={{
        tone: visitModes > 0 || pricing.prices.length > 0 ? 'ok' : 'warn',
        label:
          visitModes > 0
            ? `${visitModes} mode(s) · ${pricing.prices.length} tarif(s)`
            : `${pricing.prices.length} tarif(s)`,
      }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Modes de visite proposés
      </div>
      <div className="grid-3" style={{ marginBottom: 10 }}>
        <Toggle
          label="Visite libre"
          sub="Livret distribué à l'entrée"
          on={characteristics.selectedAmenityCodes.includes('visite_libre')}
          onChange={() =>
            editor.replaceModule('characteristics', {
              ...characteristics,
              selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, 'visite_libre'),
            })
          }
        />
        <Toggle
          label="Visite guidée"
          sub="Sur réservation"
          on={characteristics.selectedAmenityCodes.includes('visite_guidee')}
          onChange={() =>
            editor.replaceModule('characteristics', {
              ...characteristics,
              selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, 'visite_guidee'),
            })
          }
        />
        <Toggle
          label="Audioguide"
          on={characteristics.selectedAmenityCodes.includes('audioguide')}
          onChange={() =>
            editor.replaceModule('characteristics', {
              ...characteristics,
              selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, 'audioguide'),
            })
          }
        />
      </div>

      <div className="chip-group__label">Équipements de visite</div>
      <ChipSet>
        {visitOptions.map((option) => (
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

      {/* §48 single-owner: tariffs are edited in §13, opening hours in §14 (last-edit-wins trap otherwise) */}
      <OwnedElsewhereNote num="13" label="Tarifs & extras" summary={`${pricing.prices.length} ligne(s) tarifaire(s)`} />
      <OwnedElsewhereNote num="14" label="Périodes d'ouverture" summary={`${openings.periods.length} période(s)`} />
    </Fs>
  );
}
