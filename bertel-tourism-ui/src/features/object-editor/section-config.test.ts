import { EDITOR_SECTION_REFERENCES, makeSections } from './section-config';
import type { ArchetypeCode } from './archetypes';

describe('makeSections', () => {
  it.each([
    ['HEB', 'Chambres & capacité'], ['RES', 'Cuisine & service'], ['ASC', 'Fiche activité'],
    ['VIS', 'Visite & médiation'], ['SRV', 'Prestations'], ['FMA', 'Dates & programmation'],
  ] as [ArchetypeCode, string][])('conserve l’inventaire ordonné du registre pour %s', (archetype, typeLabel) => {
    const groups = makeSections(archetype);
    expect(groups.map((group) => group.group)).toEqual(['Identité', 'Caractéristiques', 'Tarifs & ouverture', 'Liens & territoire', 'Gestion']);
    const items = groups.flatMap((group) => group.items);
    expect(items.map(({ num, label }) => `${num} ${label}`)).toEqual([
      '01 Identité & taxonomie', '02 Localisation', '03 Contacts', '04 Descriptions & langues parlées',
      '05 Médias', `06 ${typeLabel}`, ...(archetype === 'HEB' ? [] : ['07 Capacité & accueil']),
      '08 Classifications', '09 Accessibilité', '10 Démarche durable', '11 Tags & étiquettes',
      '13 Tarifs, paiement & extras', "14 Périodes d'ouverture", '15 Liens vers fiches',
      '16 Sites secondaires', '17 Rattachements',
      '18 Juridique', '19 Suivi prestataire', '21 Publication', '22 Identifiants externes',
    ]);
    for (const reference of Object.values(EDITOR_SECTION_REFERENCES)) {
      expect(items.find((section) => section.num === reference.num)).toEqual(reference);
    }
  });

  it('uses itinerary sections, with closures in 06 and no lodging capacity section', () => {
    const flat = makeSections('ITI').flatMap((g) => g.items);
    expect(flat).toHaveLength(18);
    expect(makeSections('ITI').map((g) => g.group)).toEqual(['Présentation', 'Le parcours', 'Référencement', 'Gestion']);
    expect(flat).toContainEqual({ num: '06', label: 'Tracé, étapes & praticabilité' });
    expect(flat).toContainEqual({ num: '08', label: 'Labels & homologations' });
    expect(flat).toContainEqual({ num: '13', label: 'Accès & conditions' });
    expect(flat.some((s) => s.num === '07' || s.num === '14')).toBe(false);
    expect(flat.some((s) => s.num === '16')).toBe(true);
    expect(flat.some((s) => s.num === '20')).toBe(false);
  });

  it('includes section 16 for HEB (capacity absorbed by §06)', () => {
    const flat = makeSections('HEB').flatMap((g) => g.items);
    expect(flat).toHaveLength(19);
    expect(flat.some((s) => s.num === '16')).toBe(true);
    expect(flat.some((s) => s.num === '07')).toBe(false);
  });

  it('keeps section 07 for non-HEB archetypes', () => {
    const res = makeSections('RES').flatMap((g) => g.items);
    expect(res).toHaveLength(20);
    expect(res.some((s) => s.num === '07')).toBe(true);
    expect(res.some((s) => s.num === '16')).toBe(true);
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
