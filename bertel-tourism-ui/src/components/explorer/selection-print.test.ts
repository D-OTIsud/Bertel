import { preloadImages, selectionDetailToOtiPoi } from './selection-print';
import type { ObjectDetail } from '../../types/domain';

function detail(raw: Record<string, unknown>, base: Partial<ObjectDetail> = {}): ObjectDetail {
  return { id: 'OBJ1', name: 'Nom repli', type: 'RES', raw, ...base };
}

describe('selectionDetailToOtiPoi', () => {
  test('maps the full resource to the list-card fields (accroche, photo, ville, coords, contacts)', () => {
    const poi = selectionDetailToOtiPoi(
      detail({
        id: 'OBJ1',
        name: 'Chez Jules',
        type: 'RES',
        description_chapo: 'Table créole au cœur du Sud.',
        description: 'Longue description complète.',
        location: { lat: -21.27, lon: 55.51, city: 'Saint-Pierre', address: '12 rue du Port' },
        media: [
          { id: 'm2', url: 'https://cdn/x/2.jpg', is_main: false, position: 2 },
          { id: 'm1', url: 'https://cdn/x/1.jpg', is_main: true, position: 1 },
        ],
        contacts: [
          { kind_code: 'mobile', value: '0692 11 22 33', is_public: true },
          { kind_code: 'phone', value: '0262 44 55 66', is_public: true },
          { kind_code: 'website', value: 'chezjules.re', is_public: true },
        ],
      }),
    );

    expect(poi).toEqual({
      id: 'OBJ1',
      name: 'Chez Jules',
      typeCode: 'RES',
      city: 'Saint-Pierre',
      image: 'https://cdn/x/1.jpg',
      subtitle: 'Table créole au cœur du Sud.',
      note: null,
      lat: -21.27,
      lon: 55.51,
      // Contrat api.list_item_contacts : téléphone fixe d'abord, site web « website ».
      phone: '0262 44 55 66',
      web: 'chezjules.re',
    });
  });

  test('phone falls back to mobile; non-public contacts are never printed', () => {
    const poi = selectionDetailToOtiPoi(
      detail({
        contacts: [
          { kind_code: 'phone', value: '0262 00 00 00', is_public: false },
          { kind_code: 'mobile', value: '0692 11 22 33', is_public: true },
          { kind_code: 'website', value: 'https://prive.example', is_public: false },
        ],
      }),
    );

    expect(poi.phone).toBe('0692 11 22 33');
    expect(poi.web).toBeNull();
  });

  test('falls back to the description when the accroche (chapo) is missing', () => {
    const poi = selectionDetailToOtiPoi(detail({ description: 'Seule description.' }));
    expect(poi.subtitle).toBe('Seule description.');
  });

  test('minimal resource keeps identity from the detail envelope and nulls the rest', () => {
    const poi = selectionDetailToOtiPoi(detail({}));

    expect(poi).toEqual({
      id: 'OBJ1',
      name: 'Nom repli',
      typeCode: 'RES',
      city: null,
      image: null,
      subtitle: null,
      note: null,
      lat: null,
      lon: null,
      phone: null,
      web: null,
    });
  });
});

describe('preloadImages', () => {
  test('resolves immediately with no printable image', async () => {
    await expect(preloadImages([null, null])).resolves.toBeUndefined();
  });

  test('never blocks longer than the timeout when an image hangs', async () => {
    jest.useFakeTimers();
    try {
      // jsdom's Image never fires load/error: the timeout is the only exit.
      const pending = preloadImages(['https://cdn/x/never.jpg'], 500);
      jest.advanceTimersByTime(500);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
