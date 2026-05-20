import { Fs, Input, Repeater, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { addPricingRow, removePricingRow, updatePricingRow } from './pricing-row';

export function SectionPricing({ editor, folded }: SectionProps) {
  const pricing = editor.draft.pricing;

  return (
    <Fs num="13" title="Tarifs & extras" sub="Grille tarifaire structurée, unité, audience et conditions" folded={folded} pill={{ tone: 'ok', label: `${pricing.prices.length} ligne(s)` }}>
      <Repeater
        items={pricing.prices}
        getKey={(price, index) => `${price.recordId ?? 'draft'}-${index}`}
        columns="1.4fr 90px 90px 130px 120px auto"
        addLabel="Ajouter une ligne tarifaire"
        onAdd={() => editor.replaceModule('pricing', addPricingRow(pricing))}
        renderRow={(price, index) => (
          <>
            <Select value={price.kindCode} options={pricing.priceKindOptions.map((option) => ({ v: option.code, l: option.label }))} onChange={(kindCode) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { kindCode }))} />
            <Input value={price.amount} mono onChange={(amount) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amount }))} />
            <Input value={price.amountMax} mono placeholder="Max" onChange={(amountMax) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amountMax }))} />
            <Select value={price.unitCode} options={[{ v: '', l: 'Sans unité' }, ...pricing.priceUnitOptions.map((option) => ({ v: option.code, l: option.label }))]} onChange={(unitCode) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { unitCode }))} />
            <Input value={price.seasonCode} placeholder="Saison" onChange={(seasonCode) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { seasonCode }))} />
            <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removePricingRow(pricing, index))}>Supprimer</button>
          </>
        )}
      />
    </Fs>
  );
}
