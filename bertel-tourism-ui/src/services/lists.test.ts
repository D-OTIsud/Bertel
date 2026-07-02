import type { ExplorerFilters } from '../types/domain';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';
import { itemsToOtiPois } from '../features/lists/OtiTemplate';
import { webHref, webLabel } from '../features/lists/type-meta';
import { buildDynamicListFilters, moveListItem, parseListCard, parseListDetail } from './lists';

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
      contacts: { phone: '+262 262 56 30 30', web: 'http://lemanapany.re/' },
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
    expect(d.items[0].phone).toBe('+262 262 56 30 30');
    expect(d.items[0].web).toBe('http://lemanapany.re/');
  });

  it('defaults enum-ish fields when absent', () => {
    const d = parseListDetail({ id: 'L2', kind: 'dynamic', name: 'D', items: [] });
    expect(d.template).toBe('carnet');
    expect(d.accent).toBe('teal');
    expect(d.lang).toBe('fr');
    expect(d.resolvedFrom).toBe('items'); // default when field absent
    expect(d.items).toEqual([]);
  });

  it('tolerates items without contacts (older payloads / no public channel)', () => {
    const d = parseListDetail({
      id: 'L3', kind: 'static', name: 'S',
      items: [{ object_id: 'O2', position: 0, card: null }],
    });
    expect(d.items[0].phone).toBeNull();
    expect(d.items[0].web).toBeNull();
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
      accent: 'gold',
      item_count: 5,
      type_breakdown: [{ code: 'RES', n: 2 }, { code: 'HOT', n: 1 }],
    });
    expect(c.itemCount).toBe(5);
    expect(c.status).toBe('sent');
    expect(c.accent).toBe('gold');
    expect(c.typeBreakdown).toEqual([{ code: 'RES', n: 2 }, { code: 'HOT', n: 1 }]);
  });

  it('defaults accent to teal when absent (older payloads)', () => {
    const c = parseListCard({ id: 'L9', name: 'X', kind: 'static', status: 'draft', lang: 'fr', item_count: 0, type_breakdown: [] });
    expect(c.accent).toBe('teal');
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

  it('passes the public contacts (phone/web) through to the POI', () => {
    const items = parseListDetail(rawDetail).items;
    const pois = itemsToOtiPois(items, 'fr');
    expect(pois[0].phone).toBe('+262 262 56 30 30');
    expect(pois[0].web).toBe('http://lemanapany.re/');
  });
});

describe('webHref / webLabel', () => {
  it('keeps full http(s) URLs and prefixes bare domains', () => {
    expect(webHref('http://www.bellile.re/')).toBe('http://www.bellile.re/');
    expect(webHref('https://exemple.re')).toBe('https://exemple.re');
    expect(webHref('exemple-sud.re')).toBe('https://exemple-sud.re');
  });

  it('renders a short label without protocol nor trailing slash', () => {
    expect(webLabel('http://www.bellile.re/')).toBe('www.bellile.re');
    expect(webLabel('exemple-sud.re')).toBe('exemple-sud.re');
  });

  it('trims path, query and hash — the label is the domain only (fbclid & co)', () => {
    expect(
      webLabel('www.lejardindesbestioles.com/?fbclid=IwAR04jmA78U645PZ3zrIYXkoAKno2zD-017iGwEpd7hm2RlJisdlyT7P5Cs4'),
    ).toBe('www.lejardindesbestioles.com');
    expect(webLabel('https://exemple.re/fr/hebergements?utm_source=nl#haut')).toBe('exemple.re');
    expect(webLabel('http://lemanapany.re/')).toBe('lemanapany.re');
  });
});

describe('moveListItem', () => {
  it('moves an item forward and backward without mutating the source', () => {
    const src = ['a', 'b', 'c', 'd'];
    expect(moveListItem(src, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveListItem(src, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(src).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is a no-op on same-index or out-of-bounds moves', () => {
    const src = ['a', 'b'];
    expect(moveListItem(src, 1, 1)).toEqual(src);
    expect(moveListItem(src, -1, 0)).toEqual(src);
    expect(moveListItem(src, 0, 5)).toEqual(src);
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
