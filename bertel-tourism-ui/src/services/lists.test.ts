import type { ExplorerFilters } from '../types/domain';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';
import { itemsToOtiPois } from '../features/lists/OtiTemplate';
import { buildDynamicListFilters, parseListCard, parseListDetail } from './lists';

const rawDetail = {
  id: 'L1',
  kind: 'static',
  name: 'Week-end dans le Sud',
  name_en: null,
  recipient_label: 'Camille & Yann',
  intro_fr: 'Bonjour !',
  intro_en: null,
  template: 'carnet',
  accent: 'terra',
  lang: 'fr',
  cover_url: null,
  show_map: false,
  status: 'draft',
  filters: null,
  filters_url: null,
  share_token: null,
  share_enabled: false,
  share_expires_at: null,
  updated_at: '2026-07-01T00:00:00Z',
  resolved_from: 'items',
  items: [
    {
      object_id: 'O1',
      position: 0,
      note_fr: 'Ma table préférée',
      note_en: null,
      card: {
        id: 'O1',
        name: 'Le Manapany',
        type: 'RES',
        image: 'https://img/manapany.jpg',
        description: 'Restaurant gastronomique',
        location: { city: 'Saint-Joseph', lat: -21.379, lon: 55.593 },
      },
    },
  ],
};

describe('parseListDetail', () => {
  it('maps metadata, resolved_from and nested card/note', () => {
    const d = parseListDetail(rawDetail);
    expect(d.id).toBe('L1');
    expect(d.kind).toBe('static');
    expect(d.recipientLabel).toBe('Camille & Yann');
    expect(d.template).toBe('carnet');
    expect(d.accent).toBe('terra');
    expect(d.resolvedFrom).toBe('items');
    expect(d.items).toHaveLength(1);
    expect(d.items[0].objectId).toBe('O1');
    expect(d.items[0].noteFr).toBe('Ma table préférée');
    expect(d.items[0].card?.name).toBe('Le Manapany');
    expect(d.items[0].card?.city).toBe('Saint-Joseph');
    expect(d.items[0].card?.type).toBe('RES');
  });

  it('defaults enum-ish fields when absent', () => {
    const d = parseListDetail({ id: 'L2', kind: 'dynamic', name: 'D', items: [] });
    expect(d.template).toBe('carnet');
    expect(d.accent).toBe('teal');
    expect(d.lang).toBe('fr');
    expect(d.resolvedFrom).toBe('items'); // default when field absent
    expect(d.items).toEqual([]);
  });
});

describe('parseListCard', () => {
  it('maps grid summary incl. item count and type breakdown', () => {
    const c = parseListCard({
      id: 'L1',
      name: 'Le Sud en famille',
      kind: 'static',
      status: 'sent',
      lang: 'fr',
      recipient_label: 'Famille Hoarau',
      cover_url: null,
      updated_at: '2026-07-01T00:00:00Z',
      item_count: 5,
      type_breakdown: [{ code: 'RES', n: 2 }, { code: 'HOT', n: 1 }],
    });
    expect(c.itemCount).toBe(5);
    expect(c.status).toBe('sent');
    expect(c.typeBreakdown).toEqual([{ code: 'RES', n: 2 }, { code: 'HOT', n: 1 }]);
  });
});

describe('itemsToOtiPois', () => {
  it('resolves the FR note and extracts city/coords from the card', () => {
    const items = parseListDetail(rawDetail).items;
    const pois = itemsToOtiPois(items, 'fr');
    expect(pois).toHaveLength(1);
    expect(pois[0].note).toBe('Ma table préférée');
    expect(pois[0].city).toBe('Saint-Joseph');
    expect(pois[0].typeCode).toBe('RES');
    expect(pois[0].image).toBe('https://img/manapany.jpg');
    expect(pois[0].subtitle).toBe('Restaurant gastronomique');
    expect(pois[0].lat).toBeCloseTo(-21.379);
    expect(pois[0].lon).toBeCloseTo(55.593);
  });

  it('falls back to null note when the requested language has none', () => {
    const items = parseListDetail(rawDetail).items;
    const pois = itemsToOtiPois(items, 'en');
    expect(pois[0].note).toBeNull(); // note_en is null
  });
});

describe('buildDynamicListFilters', () => {
  it('serialises active filters into per-bucket {types, filters, search} entries', () => {
    const filters: ExplorerFilters = {
      ...DEFAULT_EXPLORER_FILTERS,
      selectedBuckets: ['RES'],
      common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'plage' },
    };
    const payload = buildDynamicListFilters(filters);
    expect(Array.isArray(payload.buckets)).toBe(true);
    expect(payload.buckets.length).toBeGreaterThan(0);
    for (const b of payload.buckets) {
      expect(Array.isArray(b.types)).toBe(true);
      expect((b.types ?? []).length).toBeGreaterThan(0);
      expect(b.search).toBe('plage');
      expect(typeof b.filters).toBe('object');
    }
  });

  it('defaults to all buckets when none selected, and never emits an empty-type bucket', () => {
    const filters: ExplorerFilters = { ...DEFAULT_EXPLORER_FILTERS, selectedBuckets: [] };
    const payload = buildDynamicListFilters(filters);
    // no explicit bucket => Explorer treats it as "all buckets" (getEffectiveSelectedBuckets)
    expect(payload.buckets.length).toBeGreaterThan(0);
    for (const b of payload.buckets) {
      expect((b.types ?? []).length).toBeGreaterThan(0); // the .filter drops empty-type buckets
    }
  });
});
