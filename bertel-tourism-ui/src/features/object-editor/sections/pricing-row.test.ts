import { addPricingRow, removePricingRow, updatePricingRow } from './pricing-row';
import { fullModulesFixture } from './section-fixture.test-utils';

describe('pricing row helpers', () => {
  it('adds, updates, and removes pricing rows using reference labels', () => {
    const pricing = fullModulesFixture().pricing;
    const added = addPricingRow(pricing);
    expect(added.prices).toHaveLength(2);

    const updated = updatePricingRow(added, 1, { amount: '24', unitCode: 'person' });
    expect(updated.prices[1].amount).toBe('24');
    expect(updated.prices[1].unitLabel).toBe('Par personne');

    expect(removePricingRow(updated, 0).prices).toHaveLength(1);
  });
});
