import { meterZone } from './meter-zone';

describe('meterZone (D7 : zone écrite + couleur)', () => {
  it('complétude (mid 50) : Bon ≥ 80, Moyen ≥ 50, Faible sinon', () => {
    expect(meterZone(80, 50).label).toBe('Bon');
    expect(meterZone(79, 50).label).toBe('Moyen');
    expect(meterZone(50, 50).label).toBe('Moyen');
    expect(meterZone(49, 50).label).toBe('Faible');
  });

  it('actualisation (mid 60) : Bon ≥ 80, Moyen ≥ 60, Faible sinon', () => {
    expect(meterZone(85, 60).label).toBe('Bon');
    expect(meterZone(60, 60).label).toBe('Moyen');
    expect(meterZone(59, 60).label).toBe('Faible');
  });

  it('les couleurs suivent la zone (tokens, pas de hex)', () => {
    expect(meterZone(90, 50).color).toBe('var(--teal)');
    expect(meterZone(60, 50).color).toBe('var(--warn)');
    expect(meterZone(10, 50).color).toBe('var(--red)');
  });
});
