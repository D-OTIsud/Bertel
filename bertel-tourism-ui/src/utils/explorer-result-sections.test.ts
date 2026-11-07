import type { ObjectCard } from '../types/domain';
import { buildResultSections, buildGradeSections } from './explorer-result-sections';

function card(id: string, rank?: 0 | 1, source?: string): ObjectCard {
  return {
    id, type: 'HOT', name: id,
    ...(rank == null ? {} : { label_match: { scheme_code: 'LBL_CLEF_VERTE', rank, source: source ?? 'certified_label', evidence_count: 1 } }),
  } as ObjectCard;
}

describe('buildResultSections', () => {
  it('returns flat when no card carries a label_match', () => {
    const r = buildResultSections([card('a'), card('b')]);
    expect(r).toEqual({ grouped: false, cards: [card('a'), card('b')] });
  });

  it('returns flat when only rank-0 cards are present', () => {
    expect(buildResultSections([card('a', 0), card('b', 0)]).grouped).toBe(false);
  });

  it('returns flat when only rank-1 cards are present', () => {
    expect(buildResultSections([card('a', 1, 'sustainability_action')]).grouped).toBe(false);
  });

  it('groups labelled first then equivalent when both present', () => {
    const r = buildResultSections([card('a', 1, 'sustainability_action'), card('b', 0), card('c', 1, 'sustainability_action')]);
    expect(r.grouped).toBe(true);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups.map((g) => g.group)).toEqual(['labelled', 'equivalent']);
    expect(r.groups[0].cards.map((c) => c.id)).toEqual(['b']);
    expect(r.groups[1].cards.map((c) => c.id)).toEqual(['a', 'c']);
    expect(r.groups[0].label).toBe('Établissements labellisés');
    expect(r.groups[1].label).toBe('Aussi pertinents — actions compatibles');
  });

  it('uses "équipements compatibles" when the equivalent source is accessibility', () => {
    const r = buildResultSections([card('a', 0), card('b', 1, 'accessibility_amenity')]);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups[1].label).toBe('Aussi pertinents — équipements compatibles');
  });

  it('uses corpus counts for headers, falling back to loaded length', () => {
    const cards = [card('a', 0), card('b', 1, 'sustainability_action')];
    const withCounts = buildResultSections(cards, { labelled: 15, equivalent: 8 });
    if (!withCounts.grouped) throw new Error('expected grouped');
    expect(withCounts.groups.map((g) => g.count)).toEqual([15, 8]);

    const fallback = buildResultSections(cards, null);
    if (!fallback.grouped) throw new Error('expected grouped');
    expect(fallback.groups.map((g) => g.count)).toEqual([1, 1]);
  });
});

function gcard(id: string, schemeValue?: string): ObjectCard {
  return { id, type: 'HOT', name: id, ...(schemeValue ? { badges: [{ kind: 'official_classification', code: schemeValue, label: id }] } : {}) } as ObjectCard;
}
const VALUES = [
  { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
  { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
];

describe('buildGradeSections', () => {
  it('groups cards by grade, highest first, using the badge scheme:value code', () => {
    const cards = [gcard('a', 'meuble_stars:3'), gcard('b', 'meuble_stars:5'), gcard('c', 'meuble_stars:3')];
    const r = buildGradeSections(cards, 'meuble_stars', VALUES);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups.map((g) => g.label)).toEqual(['5 étoiles', '3 étoiles']);
    expect(r.groups[0].cards.map((c) => c.id)).toEqual(['b']);
    expect(r.groups[1].cards.map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('puts cards without a badge for the scheme in a "Non classé" section last', () => {
    const r = buildGradeSections([gcard('a', 'meuble_stars:5'), gcard('b')], 'meuble_stars', VALUES);
    if (!r.grouped) throw new Error('expected grouped');
    expect(r.groups[r.groups.length - 1].label).toBe('Non classé');
  });
  it('returns flat when no card carries the scheme (defensive)', () => {
    expect(buildGradeSections([gcard('a'), gcard('b')], 'meuble_stars', VALUES).grouped).toBe(false);
  });
});
