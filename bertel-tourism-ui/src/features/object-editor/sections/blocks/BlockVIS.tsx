import { Chip, ChipSet, Fs, Input, Repeater, ScheduleEditor, Select, Toggle, TriState } from '../../primitives';
import type { SectionProps } from '../section-types';
import { addPricingRow, removePricingRow, updatePricingRow } from '../pricing-row';
import { applyRowsToFirstPeriod, scheduleRowsFromPeriod } from './opening-schedule';

const TARIFF_COLS = '14px 1.6fr 1fr 80px auto';

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

      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Tarifs
      </div>
      <Repeater
        items={pricing.prices}
        getKey={(price, index) => `${price.recordId ?? 'price'}-${index}`}
        columns={TARIFF_COLS}
        addLabel="Ajouter une ligne tarifaire"
        onAdd={() => editor.replaceModule('pricing', addPricingRow(pricing))}
        renderRow={(price, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Input
              value={price.kindLabel}
              placeholder="Libellé tarif"
              onChange={(kindLabel) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { kindLabel }))}
            />
            <Input
              value={price.amount}
              mono
              onChange={(amount) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amount }))}
            />
            <Select
              value={price.unitCode || 'eur'}
              options={pricing.priceUnitOptions.map((o) => ({ v: o.code, l: o.label }))}
              onChange={(unitCode) => {
                const opt = pricing.priceUnitOptions.find((o) => o.code === unitCode);
                editor.replaceModule('pricing', updatePricingRow(pricing, index, { unitCode, unitLabel: opt?.label ?? unitCode }));
              }}
            />
            <div className="rep-row__act">
              <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removePricingRow(pricing, index))}>
                ×
              </button>
            </div>
          </>
        )}
      />

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Horaires haute saison
        <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          {' '}
          · détail dans les périodes d'ouverture (§14)
        </span>
      </div>
      <ScheduleEditor
        rows={scheduleRowsFromPeriod(openings.periods[0])}
        colA="Matin / journée"
        colB="Après-midi"
        onChange={(rows) => editor.replaceModule('openings', applyRowsToFirstPeriod(openings, rows))}
      />

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Public & accessibilité
      </div>
      <TriState label="Familles" value="yes" onChange={() => undefined} />
      <TriState label="Scolaires" sub="sur réservation" value="yes" onChange={() => undefined} />
      <TriState label="Personnes à mobilité réduire" sub="rampe, comptoir abaissé" value="conditional" onChange={() => undefined} />
      <TriState label="Malentendants" value="yes" onChange={() => undefined} />
      <TriState label="Animaux" value="no" onChange={() => undefined} />
    </Fs>
  );
}
