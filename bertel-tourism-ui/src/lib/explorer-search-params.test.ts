import { buildSearchParams, parseSearchParams } from './explorer-search-params';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';

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
