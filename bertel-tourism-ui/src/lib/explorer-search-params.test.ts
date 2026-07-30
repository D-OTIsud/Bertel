import { buildSearchParams, parseSearchParams } from './explorer-search-params';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';
import type { ExplorerStatusFilter } from '../types/domain';

describe('explorer-search-params — rankedLabelExact', () => {
  it('writes rankedLabelExact=true only when a scheme is set and equivalents excluded', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        rankedLabelSchemeCode: 'LBL_CLEF_VERTE',
        rankedLabelIncludeEquivalents: false,
      },
    };
    const p = buildSearchParams(filters);
    expect(p.get('rankedLabelExact')).toBe('true');
  });

  it('omits rankedLabelExact by default (equivalents included)', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'LBL_CLEF_VERTE' },
    };
    expect(buildSearchParams(filters).get('rankedLabelExact')).toBeNull();
  });

  it('omits rankedLabelExact when no scheme is selected, even if equivalents is false', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelIncludeEquivalents: false },
    };
    expect(buildSearchParams(filters).get('rankedLabelExact')).toBeNull();
  });

  it('parses rankedLabelExact=true into rankedLabelIncludeEquivalents=false', () => {
    const parsed = parseSearchParams(new URLSearchParams('rankedLabel=LBL_CLEF_VERTE&rankedLabelExact=true'));
    expect(parsed.common?.rankedLabelIncludeEquivalents).toBe(false);
  });

  it('defaults rankedLabelIncludeEquivalents to true when the param is absent', () => {
    const parsed = parseSearchParams(new URLSearchParams('rankedLabel=LBL_CLEF_VERTE'));
    expect(parsed.common?.rankedLabelIncludeEquivalents).toBe(true);
  });
});

describe('explorer-search-params — rankedLabelValues', () => {
  it('writes rankedLabelValues CSV only when a scheme + levels are set', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelSchemeCode: 'meuble_stars', rankedLabelValueCodes: ['3', '5'] },
    };
    expect(buildSearchParams(filters).get('rankedLabelValues')).toBe('3,5');
  });

  it('omits rankedLabelValues when no scheme', () => {
    const filters = { ...DEFAULT_EXPLORER_FILTERS, common: { ...DEFAULT_EXPLORER_FILTERS.common, rankedLabelValueCodes: ['3'] } };
    expect(buildSearchParams(filters).get('rankedLabelValues')).toBeNull();
  });

  it('parses rankedLabelValues CSV into an array', () => {
    const parsed = parseSearchParams(new URLSearchParams('rankedLabel=meuble_stars&rankedLabelValues=3,5'));
    expect(parsed.common?.rankedLabelValueCodes).toEqual(['3', '5']);
  });
});

describe('§204 — remplissage dans l’URL', () => {
  it('écrit les deux critères, comme tous les autres filtres', () => {
    const params = buildSearchParams({
      ...DEFAULT_EXPLORER_FILTERS,
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        missingEssentialsBuckets: ['many', 'few'],
        missingEssentialsAny: ['photos', 'contact'],
      },
    });
    expect(params.get('remplissage')).toBe('many,few');
    expect(params.get('manque')).toBe('photos,contact');
  });

  it('relit ce qu’il a écrit (aller-retour)', () => {
    const parsed = parseSearchParams(
      new URLSearchParams('remplissage=many,few&manque=photos,contact'),
    );
    expect(parsed.common?.missingEssentialsBuckets).toEqual(['many', 'few']);
    expect(parsed.common?.missingEssentialsAny).toEqual(['photos', 'contact']);
  });

  it('écarte les codes inconnus d’une URL trafiquée — une puce active qui ne filtre rien serait pire', () => {
    const parsed = parseSearchParams(
      new URLSearchParams('remplissage=many,PLEIN&manque=photos,couleur'),
    );
    expect(parsed.common?.missingEssentialsBuckets).toEqual(['many']);
    expect(parsed.common?.missingEssentialsAny).toEqual(['photos']);
  });

  it('n’écrit rien quand aucun critère n’est actif', () => {
    const params = buildSearchParams(DEFAULT_EXPLORER_FILTERS);
    expect(params.get('remplissage')).toBeNull();
    expect(params.get('manque')).toBeNull();
  });
});

// §205 — le statut « archived » circule dans l'URL comme sélection explicite
// d'éditeur ; tout statut hors vocabulaire (hidden…) est écarté au parse.
describe('explorer-search-params — statuses (§205)', () => {
  it('sérialise une sélection explicite, y compris archived', () => {
    const filters = {
      ...DEFAULT_EXPLORER_FILTERS,
      common: { ...DEFAULT_EXPLORER_FILTERS.common, statuses: ['published', 'archived'] as ExplorerStatusFilter[] },
    };
    expect(buildSearchParams(filters).get('status')).toBe('published,archived');
  });

  it('parse status=archived ; hidden (hors vocabulaire) est écarté', () => {
    const parsed = parseSearchParams(new URLSearchParams('status=archived,hidden'));
    expect(parsed.common?.statuses).toEqual(['archived']);
  });
});
