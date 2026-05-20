import { Chip, ChipSet, Fs, Input, ScheduleEditor } from '../../primitives';
import type { SectionProps } from '../section-types';
import { applyRowsToFirstPeriod, scheduleRowsFromPeriod } from './opening-schedule';

function toggle(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

export function BlockSRV({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const services = characteristics.amenityGroups.flatMap((group) => group.options).slice(0, 18);

  return (
    <Fs num="05" title="Prestations & zone d'intervention" sub="Prestations délivrées, communes desservies, langues et horaires d’accueil" folded={folded} pill={{ tone: 'ok', label: `${characteristics.selectedAmenityCodes.length} prestation(s)` }}>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Prestations délivrées</div>
      <ChipSet>
        {services.map((option) => (
          <Chip key={option.code} label={option.label} on={characteristics.selectedAmenityCodes.includes(option.code)} onClick={() => editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, option.code) })} />
        ))}
      </ChipSet>

      <div className="chip-group__label">Zone d'intervention</div>
      <div className="grid-3">
        {['Saint-Pierre', 'Le Tampon', 'Petite-Île', 'Saint-Joseph', 'Cilaos', 'Sud Sauvage'].map((commune) => (
          <Input key={commune} value={commune} readOnly onChange={() => undefined} />
        ))}
      </div>

      <div className="chip-group__label">Langues parlées au comptoir</div>
      <ChipSet>
        {characteristics.languageOptions.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedLanguages.some((item) => item.code === option.code)}
          />
        ))}
      </ChipSet>

      <div className="chip-group__label">Horaires d'accueil</div>
      <ScheduleEditor rows={scheduleRowsFromPeriod(openings.periods[0])} colA="Saison" colB="Hors saison" onChange={(rows) => editor.replaceModule('openings', applyRowsToFirstPeriod(openings, rows))} />
    </Fs>
  );
}
