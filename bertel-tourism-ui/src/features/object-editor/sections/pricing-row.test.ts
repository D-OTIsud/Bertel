import {
  createPricingDraft,
  formatPriceAmount,
  summarizePricingLine,
  validatePricingDraft,
} from './pricing-row';
import { fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePriceItem } from '../../../services/object-workspace-parser';

const draftFrom = (patch: Partial<ObjectWorkspacePriceItem> = {}): ObjectWorkspacePriceItem => ({
  ...createPricingDraft(fullModulesFixture().pricing),
  ...patch,
});

describe('createPricingDraft', () => {
  it('defaults the public to the first kind, the type to "principal", and currency to EUR', () => {
    const draft = createPricingDraft(fullModulesFixture().pricing);
    expect(draft.recordId).toBeNull();
    expect(draft.kindCode).toBe('adult');
    expect(draft.indicationCode).toBe('principal'); // preferred over the first option
    expect(draft.unitCode).toBe('person');
    expect(draft.currency).toBe('EUR');
    expect(draft.amount).toBe('');
  });

  it('falls back to the first type option when "principal" is absent', () => {
    const pricing = fullModulesFixture().pricing;
    pricing.priceTypeOptions = [{ id: 'option', code: 'option', label: 'Option / extra' }];
    expect(createPricingDraft(pricing).indicationCode).toBe('option');
  });
});

describe('validatePricingDraft', () => {
  it('blocks save when no public (kind) is selected', () => {
    const result = validatePricingDraft(draftFrom({ kindCode: '' }));
    expect(result.canSave).toBe(false);
    expect(result.error).toMatch(/public/i);
  });

  it('allows a line with just a public and no amount (e.g. sur devis)', () => {
    expect(validatePricingDraft(draftFrom({ amount: '' })).canSave).toBe(true);
  });

  it('blocks when the maximum amount is below the amount', () => {
    const result = validatePricingDraft(draftFrom({ amount: '20', amountMax: '12' }));
    expect(result.canSave).toBe(false);
    expect(result.error).toMatch(/maximum/i);
  });

  it('blocks when the validity end precedes the start', () => {
    const result = validatePricingDraft(draftFrom({ validFrom: '2026-08-01', validTo: '2026-07-01' }));
    expect(result.canSave).toBe(false);
    expect(result.error).toMatch(/validité/i);
  });

  it('blocks an inverted child age range', () => {
    const result = validatePricingDraft(draftFrom({ ageMinEnfant: '10', ageMaxEnfant: '4' }));
    expect(result.canSave).toBe(false);
    expect(result.error).toMatch(/âge/i);
  });

  it('passes a coherent fully-filled line', () => {
    expect(
      validatePricingDraft(
        draftFrom({ amount: '12', amountMax: '18', validFrom: '2026-07-01', validTo: '2026-08-31', ageMinEnfant: '3', ageMaxEnfant: '11' }),
      ).canSave,
    ).toBe(true);
  });
});

describe('formatPriceAmount', () => {
  it('formats a single amount with the currency symbol', () => {
    expect(formatPriceAmount(draftFrom({ amount: '12', currency: 'EUR' }))).toBe('12 €');
  });

  it('formats a min–max range', () => {
    expect(formatPriceAmount(draftFrom({ amount: '12', amountMax: '18', currency: 'EUR' }))).toBe('12 – 18 €');
  });

  it('returns an empty string when there is no amount', () => {
    expect(formatPriceAmount(draftFrom({ amount: '', amountMax: '' }))).toBe('');
  });
});

describe('summarizePricingLine', () => {
  it('joins validity, age ranges, and conditions', () => {
    const summary = summarizePricingLine(
      draftFrom({ validFrom: '2026-07-01', validTo: '2026-08-31', ageMinEnfant: '3', ageMaxEnfant: '11', conditions: 'Réservation conseillée' }),
    );
    expect(summary).toMatch(/2026-07-01/);
    expect(summary).toMatch(/enfant/i);
    expect(summary).toMatch(/Réservation conseillée/);
  });

  it('is empty for a bare line', () => {
    expect(summarizePricingLine(draftFrom({}))).toBe('');
  });
});
