import { extractMenuFromImages, applyDietarySuggestions } from './menu-extract';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from './object-workspace-parser';

function dish(name: string, over: Partial<ObjectWorkspaceMenuItem> = {}): ObjectWorkspaceMenuItem {
  return {
    recordId: null, name, description: '', price: '', currency: '',
    kindId: '', kindCode: '', kindLabel: '', unitId: '', unitCode: '', unitLabel: '',
    mediaIds: [], available: true, position: '1',
    dietaryTagCodes: [], allergenCodes: [], cuisineTypeCodes: [],
    sectionCode: '', sectionId: '', sectionLabel: '', ...over,
  };
}
function menu(items: ObjectWorkspaceMenuItem[]): ObjectWorkspaceMenu {
  return {
    recordId: null, categoryId: '', categoryCode: '', categoryLabel: '',
    name: 'Carte', description: '', active: true, visibility: 'public', position: '1', items,
  };
}

describe('applyDietarySuggestions', () => {
  it('sets each dish dietaryTagCodes to the accepted codes (deduped), immutably', () => {
    const original = menu([dish('A'), dish('B')]);
    const next = applyDietarySuggestions(original, [['vegetarian', 'vegetarian'], ['vegan']]);

    expect(next.items[0].dietaryTagCodes).toEqual(['vegetarian']);
    expect(next.items[1].dietaryTagCodes).toEqual(['vegan']);
    // original untouched (immutability)
    expect(original.items[0].dietaryTagCodes).toEqual([]);
    expect(next).not.toBe(original);
  });

  it('leaves a dish empty when no codes are accepted for it', () => {
    const next = applyDietarySuggestions(menu([dish('A'), dish('B')]), [[], ['gluten_free']]);
    expect(next.items[0].dietaryTagCodes).toEqual([]);
    expect(next.items[1].dietaryTagCodes).toEqual(['gluten_free']);
  });
});

describe('extractMenuFromImages', () => {
  const input = {
    objectId: 'RESRUN0000000001AB',
    menuTitle: 'Carte de la semaine',
    images: [{ mime: 'image/jpeg', base64: 'AAAA' }],
    allowedSections: [{ id: 's1', code: 'main', label: 'Plats' }],
    allowedDietary: [{ id: 'd1', code: 'vegetarian', label: 'Végétarien' }],
  };

  it('POSTs to /api/menu/extract with a bearer token and returns the parsed result', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ menu: menu([dish('Cari')]), suggestedDietaryByDish: [['vegetarian']], truncated: false }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const res = await extractMenuFromImages(input, 'tok-123', fetchImpl);

    expect(res.menu.items[0].name).toBe('Cari');
    expect(res.suggestedDietaryByDish).toEqual([['vegetarian']]);
    expect(calls[0].url).toBe('/api/menu/extract');
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.object_id).toBe('RESRUN0000000001AB');
    expect(body.menu_title).toBe('Carte de la semaine');
    expect(body.images).toHaveLength(1);
  });

  it('throws with the server detail on a non-ok response', async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 503, json: async () => ({ error: 'not_configured', detail: 'aucun fournisseur' }) }) as unknown as Response) as unknown as typeof fetch;
    await expect(extractMenuFromImages(input, 'tok', fetchImpl)).rejects.toThrow(/fournisseur|not_configured/i);
  });
});
