import { Field, Fs, Input, Repeater, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { addPricingRow, removePricingRow, updatePricingRow } from './pricing-row';
import { addDiscountRow, removeDiscountRow, updateDiscountRow } from './discount-row';

const CATEGORY_OPTIONS = [
  { v: 'all', l: 'Tarif principal' },
  { v: 'option', l: 'Option / extra' },
  { v: 'menu', l: 'Menu / formule' },
  { v: 'pack', l: 'Pack / forfait' },
  { v: 'session', l: 'Session encadrée' },
  { v: 'group', l: 'Groupe' },
  { v: 'taxe', l: 'Taxe / collecte' },
  { v: 'devis', l: 'Sur devis' },
  { v: 'commission', l: 'Commission' },
  { v: 'free', l: 'Gratuit' },
];

export function SectionPricing({ editor, folded }: SectionProps) {
  const pricing = editor.draft.pricing;
  const firstPrice = pricing.prices[0];

  return (
    <Fs
      num="13"
      title="Tarifs & extras"
      sub="Tarifs, options, saisons, publics et conditions"
      folded={folded}
      pill={{ tone: 'ok', label: `${pricing.prices.length} ligne(s) · ${pricing.discounts.length} remise(s)` }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '14px 2fr 90px 130px 110px auto',
          gap: 8,
          padding: '6px 12px',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--ink-4)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        <span />
        <span>Libellé</span>
        <span>Montant</span>
        <span>Unité</span>
        <span>Catégorie</span>
        <span />
      </div>
      <Repeater
        items={pricing.prices}
        getKey={(price, index) => `${price.recordId ?? 'draft'}-${index}`}
        columns="14px 2fr 90px 130px 110px auto"
        addLabel="Ajouter une ligne tarifaire"
        onAdd={() => editor.replaceModule('pricing', addPricingRow(pricing))}
        renderRow={(price, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            {/* §48: kindLabel is derived from the kind ref on reload — the saver only persists kind_id/kind_code; edit the kind via the Catégorie select. */}
            <Input
              value={price.kindLabel}
              placeholder="Libellé tarif"
              readOnly
              onChange={() => undefined}
            />
            <Input
              value={price.amount}
              mono
              onChange={(amount) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amount }))}
            />
            <Select
              value={price.unitCode}
              options={[{ v: '', l: 'Sans unité' }, ...pricing.priceUnitOptions.map((option) => ({ v: option.code, l: option.label }))]}
              onChange={(unitCode) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { unitCode }))}
            />
            <Select
              value={price.indicationCode || price.kindCode}
              options={[
                ...pricing.priceKindOptions.map((option) => ({ v: option.code, l: option.label })),
                ...CATEGORY_OPTIONS.filter((option) => !pricing.priceKindOptions.some((kind) => kind.code === option.v)),
              ]}
              onChange={(kindCode) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { kindCode }))}
            />
            <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removePricingRow(pricing, index))}>
              Supprimer
            </button>
          </>
        )}
      />

      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Politique & règles
      </div>
      <div className="grid-3">
        <Field label="Acompte demandé">
          <Select
            value={firstPrice?.conditions || ''}
            options={['', 'Aucun', '30 %', '50 %', 'Totalité']}
            onChange={(conditions) => {
              if (!firstPrice) return;
              editor.replaceModule('pricing', updatePricingRow(pricing, 0, { conditions }));
            }}
          />
        </Field>
        <Field label="Délai annulation gratuite">
          <Input
            value={firstPrice?.validFrom || ''}
            mono
            placeholder="J-7"
            onChange={(validFrom) => {
              if (!firstPrice) return;
              editor.replaceModule('pricing', updatePricingRow(pricing, 0, { validFrom }));
            }}
          />
        </Field>
        <Field label="TVA applicable">
          <Select
            value={firstPrice?.source || ''}
            options={['', '0 %', '5.5 %', '10 %', '20 %', 'Auto-entrepreneur (exo.)']}
            onChange={(source) => {
              if (!firstPrice) return;
              editor.replaceModule('pricing', updatePricingRow(pricing, 0, { source }));
            }}
          />
        </Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Remises &amp; réductions
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '14px 1.6fr 80px 80px 70px 70px 110px 110px auto',
          gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700,
          color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        <span /><span>Conditions</span><span>%</span><span>Montant</span><span>Grp min</span><span>Grp max</span><span>Du</span><span>Au</span><span />
      </div>
      <Repeater
        items={pricing.discounts}
        getKey={(discount, index) => `${discount.recordId ?? 'discount'}-${index}`}
        columns="14px 1.6fr 80px 80px 70px 70px 110px 110px auto"
        addLabel="Ajouter une remise"
        onAdd={() => editor.replaceModule('pricing', addDiscountRow(pricing))}
        renderRow={(discount, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Input
              value={discount.conditions}
              placeholder="Conditions (ex. groupes, scolaires…)"
              onChange={(conditions) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { conditions }))}
            />
            <Input
              value={discount.discountPercent}
              mono
              suffix="%"
              aria-label="Remise en pourcentage"
              onChange={(discountPercent) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { discountPercent }))}
            />
            <Input
              value={discount.discountAmount}
              mono
              suffix="€"
              aria-label="Remise en montant"
              onChange={(discountAmount) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { discountAmount }))}
            />
            <Input
              value={discount.minGroupSize}
              mono
              aria-label="Taille de groupe minimale"
              onChange={(minGroupSize) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { minGroupSize }))}
            />
            <Input
              value={discount.maxGroupSize}
              mono
              aria-label="Taille de groupe maximale"
              onChange={(maxGroupSize) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { maxGroupSize }))}
            />
            <Input
              type="date"
              value={discount.validFrom}
              aria-label="Début de validité de la remise"
              onChange={(validFrom) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { validFrom }))}
            />
            <Input
              type="date"
              value={discount.validTo}
              aria-label="Fin de validité de la remise"
              onChange={(validTo) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { validTo }))}
            />
            <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removeDiscountRow(pricing, index))}>
              Supprimer
            </button>
          </>
        )}
      />
    </Fs>
  );
}
