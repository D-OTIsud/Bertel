import { makeSections } from './section-config';

describe('makeSections', () => {
  it('produces 22 sections for ITI (includes section 16 Lieux & étapes)', () => {
    const flat = makeSections('ITI').flatMap((g) => g.items);
    expect(flat).toHaveLength(22);
    expect(flat.some((s) => s.num === '16')).toBe(true);
  });

  it('omits section 16 for HEB', () => {
    const flat = makeSections('HEB').flatMap((g) => g.items);
    expect(flat).toHaveLength(21);
    expect(flat.some((s) => s.num === '16')).toBe(false);
  });

  it('labels section 05 per archetype', () => {
    const heb = makeSections('HEB')
      .flatMap((g) => g.items)
      .find((s) => s.num === '05');
    const res = makeSections('RES')
      .flatMap((g) => g.items)
      .find((s) => s.num === '05');
    expect(heb?.label).toBe('Chambres & séminaire');
    expect(res?.label).toBe('Cuisine & service');
  });
});
