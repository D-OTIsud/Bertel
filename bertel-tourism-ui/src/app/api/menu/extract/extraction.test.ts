import {
  buildExtractionPrompt,
  parseExtraction,
  mapExtractionToMenu,
  type AllowedOption,
} from './extraction';

const SECTIONS: AllowedOption[] = [
  { id: 's1', code: 'starter', label: 'Entrées' },
  { id: 's2', code: 'main', label: 'Plats' },
  { id: 's3', code: 'dessert', label: 'Desserts' },
];
const DIETARY: AllowedOption[] = [
  { id: 'd1', code: 'vegetarian', label: 'Végétarien' },
  { id: 'd2', code: 'vegan', label: 'Vegan' },
  { id: 'd3', code: 'gluten_free', label: 'Sans gluten' },
];

describe('buildExtractionPrompt', () => {
  it('lists the allowed section and dietary labels so the model is constrained to them', () => {
    const { system, user } = buildExtractionPrompt({ allowedSections: SECTIONS, allowedDietary: DIETARY, lang: 'fr' });
    const text = `${system}\n${user}`;
    expect(text).toMatch(/Entrées/);
    expect(text).toMatch(/Plats/);
    expect(text).toMatch(/Végétarien/);
    expect(text.toLowerCase()).toContain('json');
  });

  it('forbids inferring allergens (safety)', () => {
    const { system } = buildExtractionPrompt({ allowedSections: SECTIONS, allowedDietary: DIETARY });
    expect(system.toLowerCase()).toMatch(/allerg/);
    expect(system.toLowerCase()).toMatch(/jamais|ne pas|never|n['’ ]?inclus|sans deviner/);
  });
});

describe('parseExtraction', () => {
  it('strips a ```json code fence and parses', () => {
    const res = parseExtraction('```json\n{"title":"X","dishes":[{"name":"Cari"}]}\n```');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.dishes[0].name).toBe('Cari');
  });

  it('returns ok:false on non-JSON', () => {
    expect(parseExtraction('désolé, je ne peux pas').ok).toBe(false);
  });

  it('returns ok:false when a dish has no name (schema)', () => {
    expect(parseExtraction('{"dishes":[{"description":"sans nom"}]}').ok).toBe(false);
  });
});

describe('mapExtractionToMenu', () => {
  const data = {
    title: 'Carte de la semaine',
    dishes: [
      { name: 'Salade de palmiste', price: 12, section: 'Entrées', dietary: ['Végétarien', 'Inconnu'] },
      { name: 'Cari poulet', price: '15 €', section: 'plats', description: 'épicé' },
      { name: 'Mystère', section: 'SectionInconnue' },
    ],
  };

  it('uses the explicit menuTitle, else the model title, else a default', () => {
    expect(mapExtractionToMenu(data, { menuTitle: 'Menu midi', allowedSections: SECTIONS, allowedDietary: DIETARY }).menu.name).toBe('Menu midi');
    expect(mapExtractionToMenu(data, { menuTitle: '', allowedSections: SECTIONS, allowedDietary: DIETARY }).menu.name).toBe('Carte de la semaine');
    expect(mapExtractionToMenu({ dishes: [] }, { menuTitle: '', allowedSections: SECTIONS, allowedDietary: DIETARY }).menu.name).toBe('Carte');
  });

  it('maps each dish into the workspace shape (recordId null, available, position)', () => {
    const { menu } = mapExtractionToMenu(data, { menuTitle: '', allowedSections: SECTIONS, allowedDietary: DIETARY });
    expect(menu.items).toHaveLength(3);
    expect(menu.items[0].recordId).toBeNull();
    expect(menu.items[0].available).toBe(true);
    expect(menu.items[0].position).toBe('1');
    expect(menu.active).toBe(true);
  });

  it('resolves the section label to code/id (case-insensitive); unknown → empty', () => {
    const { menu } = mapExtractionToMenu(data, { menuTitle: '', allowedSections: SECTIONS, allowedDietary: DIETARY });
    expect(menu.items[0].sectionCode).toBe('starter');
    expect(menu.items[0].sectionId).toBe('s1');
    expect(menu.items[1].sectionCode).toBe('main'); // 'plats' lower-case still matches 'Plats'
    expect(menu.items[2].sectionCode).toBe('');
    expect(menu.items[2].sectionId).toBe('');
  });

  it('coerces price to string; missing price → empty', () => {
    const { menu } = mapExtractionToMenu(data, { menuTitle: '', allowedSections: SECTIONS, allowedDietary: DIETARY });
    expect(menu.items[0].price).toBe('12');
    expect(menu.items[1].price).toBe('15 €');
    expect(menu.items[2].price).toBe('');
  });

  it('puts inferred dietary in suggestions (filtered to allowed), NEVER pre-applies it, NEVER sets allergens', () => {
    const { menu, suggestedDietaryByDish } = mapExtractionToMenu(data, { menuTitle: '', allowedSections: SECTIONS, allowedDietary: DIETARY });
    // suggestions are filtered to the allowed vocabulary ('Inconnu' dropped)
    expect(suggestedDietaryByDish[0]).toEqual(['vegetarian']);
    expect(suggestedDietaryByDish[2]).toEqual([]);
    // the committed dish carries NOTHING by default — the human accepts in the modal
    expect(menu.items[0].dietaryTagCodes).toEqual([]);
    // allergens are never inferred
    expect(menu.items[0].allergenCodes).toEqual([]);
    expect(menu.items[1].allergenCodes).toEqual([]);
  });
});
