import {
  ageBracketsFor,
  availablePresets,
  derivePriceMode,
  deriveValidityMode,
  describePriceLine,
  finalizePricingDraft,
  groupUnits,
  pricingFieldErrors,
} from './pricing-presets';
import { createPricingDraft } from './pricing-row';
import { fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePriceItem } from '../../../services/object-workspace-parser';

const pricing = () => fullModulesFixture().pricing;
const line = (patch: Partial<ObjectWorkspacePriceItem> = {}): ObjectWorkspacePriceItem => ({ ...createPricingDraft(pricing()), ...patch });

describe('derivePriceMode', () => {
  it('reads amount 0 as free, distinct min/max as a range, anything else as fixed', () => {
    expect(derivePriceMode(line({ amount: '0' }))).toBe('free');
    expect(derivePriceMode(line({ amount: '12', amountMax: '18' }))).toBe('range');
    expect(derivePriceMode(line({ amount: '12' }))).toBe('fixed');
    expect(derivePriceMode(line({ amount: '' }))).toBe('fixed');
    expect(derivePriceMode(line({ kindCode: 'gratuit', amount: '' }))).toBe('free');
  });
});

describe('deriveValidityMode', () => {
  it('prefers explicit dates, then a season, else the whole year', () => {
    expect(deriveValidityMode(line({ validFrom: '2026-07-01' }))).toBe('dates');
    expect(deriveValidityMode(line({ seasonCode: 'high_season' }))).toBe('season');
    expect(deriveValidityMode(line())).toBe('year');
  });
});

describe('pricingFieldErrors', () => {
  it('requires an amount for a fixed price, except on « sur devis » lines', () => {
    expect(pricingFieldErrors(line(), 'fixed', 'year').amount).toBeTruthy();
    expect(pricingFieldErrors(line({ indicationCode: 'devis' }), 'fixed', 'year').amount).toBeUndefined();
    expect(pricingFieldErrors(line(), 'free', 'year')).toEqual({});
  });

  it('checks the range, the season choice, the dates and the ages', () => {
    expect(pricingFieldErrors(line({ amount: '20', amountMax: '12' }), 'range', 'year').amountMax).toBeTruthy();
    expect(pricingFieldErrors(line({ amount: '20' }), 'fixed', 'season').season).toBeTruthy();
    expect(pricingFieldErrors(line({ amount: '20', validFrom: '2026-08-01', validTo: '2026-07-01' }), 'fixed', 'dates').dates).toBeTruthy();
    expect(pricingFieldErrors(line({ amount: '20', kindCode: 'enfant', ageMinEnfant: '10', ageMaxEnfant: '4' }), 'fixed', 'year').ageEnfant).toBeTruthy();
  });
});

describe('ageBracketsFor', () => {
  it('shows the child bracket for a child public, and keeps legacy values visible', () => {
    expect(ageBracketsFor(line({ kindCode: 'enfant' }))).toEqual(['enfant']);
    expect(ageBracketsFor(line({ kindCode: 'jeune' }))).toEqual(['junior']);
    expect(ageBracketsFor(line())).toEqual([]);
    expect(ageBracketsFor(line({ ageMinJunior: '12' }))).toEqual(['junior']);
  });
});

describe('finalizePricingDraft', () => {
  it('normalises the amount and validity columns to the chosen modes', () => {
    expect(finalizePricingDraft(line({ amount: '5', amountMax: '9' }), 'fixed', 'year')).toMatchObject({ amount: '5', amountMax: '' });
    expect(finalizePricingDraft(line({ amount: '5' }), 'free', 'year')).toMatchObject({ amount: '0', amountMax: '' });
    expect(finalizePricingDraft(line({ seasonCode: 'high_season', validFrom: '2026-01-01' }), 'fixed', 'season')).toMatchObject({ seasonCode: 'high_season', validFrom: '', validTo: '' });
    expect(finalizePricingDraft(line({ seasonCode: 'high_season', validFrom: '2026-01-01' }), 'fixed', 'year')).toMatchObject({ seasonCode: '', validFrom: '' });
  });
});

describe('availablePresets / groupUnits', () => {
  it('keeps only shortcuts whose public exists, and none without an archetype', () => {
    expect(availablePresets(undefined, pricing())).toEqual([]);
    const labels = availablePresets('ASC', pricing()).map((preset) => preset.label);
    expect(labels).toContain('Sortie adulte');
    expect(labels).toContain('Sortie enfant');
    expect(labels).not.toContain('Forfait famille'); // no « famille » public in the fixture
  });

  it('puts the usual units of the archetype first', () => {
    const options = [
      { id: '1', code: 'par_personne', label: 'Par personne' },
      { id: '2', code: 'par_nuit', label: 'Par nuit' },
    ];
    expect(groupUnits('HEB', options).common.map((o) => o.code)).toEqual(['par_nuit', 'par_personne']);
    expect(groupUnits(undefined, options).common).toEqual([]);
  });
});

describe('describePriceLine', () => {
  it('renders free and quote lines in words', () => {
    expect(describePriceLine(line({ amount: '0' }), pricing()).amount).toBe('Gratuit');
    expect(describePriceLine(line({ kindCode: 'gratuit', amount: '' }), pricing()).amount).toBe('Gratuit');
    expect(describePriceLine(line({ indicationCode: 'devis' }), pricing()).amount).toBe('Sur devis');
    expect(describePriceLine(line({ amount: '12', indicationCode: 'option' }), pricing())).toMatchObject({ title: 'Adulte · Option / extra', amount: '12 €' });
  });
});
