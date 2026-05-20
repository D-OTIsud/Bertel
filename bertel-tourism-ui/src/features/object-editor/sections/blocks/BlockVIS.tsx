import { Chip, ChipSet, Fs, ScheduleEditor, TriState, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { addPricingRow, removePricingRow, updatePricingRow } from '../pricing-row';
import { applyRowsToFirstPeriod, scheduleRowsFromPeriod } from './opening-schedule';

function toggle(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

export function BlockVIS({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const openings = editor.draft.openings;
  const pricing = editor.draft.pricing;
  const visitOptions = characteristics.amenityGroups.flatMap((group) => group.options).slice(0, 12);

  return (
    <Fs num="05" title="Visite, médiation & accessibilité" sub="Modes de visite, tarifs et horaires saisonniers" folded={folded} pill={{ tone: 'ok', label: `${pricing.prices.length} tarif(s)` }}>
      <div className="grid-3">
        <Toggle label="Visite libre" on={characteristics.selectedAmenityCodes.includes('visite_libre')} onChange={() => editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, 'visite_libre') })} />
        <Toggle label="Visite guidée" on={characteristics.selectedAmenityCodes.includes('visite_guidee')} onChange={() => editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, 'visite_guidee') })} />
        <Toggle label="Audioguide" on={characteristics.selectedAmenityCodes.includes('audioguide')} onChange={() => editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, 'audioguide') })} />
      </div>
      <div className="chip-group__label">Équipements de visite</div>
      <ChipSet>
        {visitOptions.map((option) => (
          <Chip key={option.code} label={option.label} on={characteristics.selectedAmenityCodes.includes(option.code)} onClick={() => editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, option.code) })} />
        ))}
      </ChipSet>

      <div className="chip-group__label">Tarifs</div>
      <div className="repeater">
        {pricing.prices.map((price, index) => (
          <div key={`${price.recordId ?? 'price'}-${index}`} className="rep-row" style={{ gridTemplateColumns: '1fr 90px 120px auto' }}>
            <Chip label={price.kindLabel || 'Tarif'} on />
            <input className="input mono" value={price.amount} onChange={(event) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amount: event.target.value }))} />
            <input className="input" value={price.unitLabel || price.unitCode} onChange={(event) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { unitLabel: event.target.value }))} />
            <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removePricingRow(pricing, index))}>Supprimer</button>
          </div>
        ))}
      </div>
      <button type="button" className="rep-add" onClick={() => editor.replaceModule('pricing', addPricingRow(pricing))}>+ Ajouter une ligne tarifaire</button>

      <div className="chip-group__label">Horaires saisonniers</div>
      <ScheduleEditor rows={scheduleRowsFromPeriod(openings.periods[0])} colA="Matin / journée" colB="Après-midi" onChange={(rows) => editor.replaceModule('openings', applyRowsToFirstPeriod(openings, rows))} />
      <div className="chip-group__label">Public & accessibilité</div>
      <TriState label="Familles" value="yes" onChange={() => undefined} />
      <TriState label="PMR" value="conditional" onChange={() => undefined} />
    </Fs>
  );
}
