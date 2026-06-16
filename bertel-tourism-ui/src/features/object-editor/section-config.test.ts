import { makeSections } from './section-config';

describe('makeSections', () => {
  it('produces 21 sections for ITI (includes section 16 Lieux & étapes)', () => {
    const flat = makeSections('ITI').flatMap((g) => g.items);
    expect(flat).toHaveLength(21);
    expect(flat.some((s) => s.num === '16')).toBe(true);
  });

  it('omits sections 16 and 07 for HEB (capacity absorbed by §06)', () => {
    const flat = makeSections('HEB').flatMap((g) => g.items);
    expect(flat).toHaveLength(19);
    expect(flat.some((s) => s.num === '16')).toBe(false);
    expect(flat.some((s) => s.num === '07')).toBe(false);
  });

  it('keeps section 07 for non-HEB archetypes', () => {
    const res = makeSections('RES').flatMap((g) => g.items);
    expect(res).toHaveLength(20);
    expect(res.some((s) => s.num === '07')).toBe(true);
  });

  it('labels section 06 (type block) per archetype', () => {
    const heb = makeSections('HEB')
      .flatMap((g) => g.items)
      .find((s) => s.num === '06');
    const res = makeSections('RES')
      .flatMap((g) => g.items)
      .find((s) => s.num === '06');
    expect(heb?.label).toBe('Chambres & capacité');
    expect(res?.label).toBe('Cuisine & service');
  });

  it('orders identity, location, contacts, then descriptions under characteristics', () => {
    const groups = makeSections('HEB');
    expect(groups[0]).toMatchObject({
      group: 'Identité',
      items: [
        { num: '01', label: 'Identité & taxonomie' },
        { num: '02', label: 'Localisation' },
        { num: '03', label: 'Contacts' },
      ],
    });
    expect(groups[1].group).toBe('Caractéristiques');
    expect(groups[1].items[0]).toEqual({ num: '04', label: 'Descriptions & langues parlées' });
  });
});
