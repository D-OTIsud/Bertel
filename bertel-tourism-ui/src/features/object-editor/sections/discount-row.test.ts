import { addDiscountRow, removeDiscountRow, updateDiscountRow, validateDiscountRowsForSave } from './discount-row';
import type { ObjectWorkspacePricingModule } from '../../../services/object-workspace-parser';

const base = (): ObjectWorkspacePricingModule => ({
  priceKindOptions: [], priceTypeOptions: [], priceSeasonOptions: [], priceUnitOptions: [], prices: [],
  discounts: [{ recordId: 'd1', conditions: 'Groupes', discountPercent: '10', discountAmount: '', currency: '', minGroupSize: '8', maxGroupSize: '', validFrom: '', validTo: '', source: '' }],
  promotions: [], promotionsUnavailableReason: null, unavailableReason: null,
});

describe('discount-row helpers (§48 — object_discount XOR contract)', () => {
  it('adds an empty percent-mode row', () => {
    const next = addDiscountRow(base());
    expect(next.discounts).toHaveLength(2);
    expect(next.discounts[1].recordId).toBeNull();
  });

  it('typing a percent clears the amount and its currency (chk_discount_xor)', () => {
    const withAmount = updateDiscountRow(base(), 0, { discountAmount: '15', currency: 'EUR' });
    const next = updateDiscountRow(withAmount, 0, { discountPercent: '20' });
    expect(next.discounts[0]).toMatchObject({ discountPercent: '20', discountAmount: '', currency: '' });
  });

  it('typing an amount clears the percent and defaults currency to EUR (chk_discount_currency_amount)', () => {
    const next = updateDiscountRow(base(), 0, { discountAmount: '15' });
    expect(next.discounts[0]).toMatchObject({ discountPercent: '', discountAmount: '15', currency: 'EUR' });
  });

  it('removes a row', () => {
    expect(removeDiscountRow(base(), 0).discounts).toHaveLength(0);
  });

  it('patching both percent and amount in one call keeps the amount (last-XOR-wins, not both-empty)', () => {
    const next = updateDiscountRow(base(), 0, { discountPercent: '20', discountAmount: '15' });
    expect(next.discounts[0].discountAmount).toBe('15');
    expect(next.discounts[0].discountPercent).toBe('');
  });
});

describe('validateDiscountRowsForSave (§48 — DB-constraint mirror)', () => {
  const blank = { recordId: null, conditions: '', discountPercent: '', discountAmount: '', currency: '', minGroupSize: '', maxGroupSize: '', validFrom: '', validTo: '', source: '' };

  it('silently drops fully-blank rows (freshly added, untouched)', () => {
    expect(validateDiscountRowsForSave([blank])).toEqual([]);
  });

  it('throws a French actionable error for a row with content but no value', () => {
    expect(() => validateDiscountRowsForSave([{ ...blank, conditions: 'Groupes' }]))
      .toThrow('Chaque remise doit avoir un pourcentage ou un montant.');
  });

  it('throws on inverted group sizes and validity windows, and percent over 100', () => {
    expect(() => validateDiscountRowsForSave([{ ...blank, discountPercent: '10', minGroupSize: '10', maxGroupSize: '5' }])).toThrow(/groupe/);
    expect(() => validateDiscountRowsForSave([{ ...blank, discountPercent: '10', validFrom: '2026-08-01', validTo: '2026-07-01' }])).toThrow(/validité/);
    expect(() => validateDiscountRowsForSave([{ ...blank, discountPercent: '120' }])).toThrow(/100/);
  });

  it('passes valid rows through unchanged', () => {
    const row = { ...blank, discountPercent: '10', conditions: 'Groupes' };
    expect(validateDiscountRowsForSave([row])).toEqual([row]);
  });
});
