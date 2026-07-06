import { dashboardStatsParams } from './dashboard-stats-params';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';

const base = DEFAULT_EXPLORER_FILTERS;

it('aucun bucket, aucune facette, aucune période → params vides/défaut', () => {
  const p = dashboardStatsParams({ ...base, selectedBuckets: [] }, {});
  expect(p.p_types).toBeNull();
  expect(p.p_status).toEqual(['published']);
  expect(p.p_filters).toEqual({});
  expect(p.p_updated_at_from).toBeNull();
  expect(p.p_updated_at_to).toBeNull();
});

it('mono-bucket ITI → p_filters porte la facette spécifique itinerary', () => {
  const filters = { ...base, selectedBuckets: ['ITI'], iti: { ...base.iti, difficultyMax: 2 } };
  const p = dashboardStatsParams(filters as any, {});
  expect(p.p_types).toContain('ITI');
  expect(p.p_filters).toHaveProperty('itinerary');
});

it('multi-bucket → facettes spécifiques exclues (transverse only), taxonomie ré-agrégée', () => {
  const filters = {
    ...base,
    selectedBuckets: ['HOT', 'ITI'],
    iti: { ...base.iti, difficultyMax: 2 },              // spécifique — doit disparaître
    common: { ...base.common, cities: ['Le Tampon'] },   // transverse — doit rester
  };
  const p = dashboardStatsParams(filters as any, {});
  expect(p.p_filters).not.toHaveProperty('itinerary');
  expect(p.p_filters).not.toHaveProperty('capacity_filters');
  expect(p.p_filters).toHaveProperty('city_any', ['Le Tampon']); // cleanString ne lowercase pas ; unaccent/lowercase côté RPC
});

it('période → p_updated_at_from/to', () => {
  const p = dashboardStatsParams({ ...base, selectedBuckets: [] }, { updatedAtFrom: '2026-01-01', updatedAtTo: '2026-02-01' });
  expect(p.p_updated_at_from).toBe('2026-01-01');
  expect(p.p_updated_at_to).toBe('2026-02-01');
});

it('statuts restreints à published/draft (défaut published si vide)', () => {
  const withDraft = { ...base, selectedBuckets: [], common: { ...base.common, statuses: ['published', 'draft'] } };
  expect(dashboardStatsParams(withDraft as any, {}).p_status).toEqual(['published', 'draft']);
});
