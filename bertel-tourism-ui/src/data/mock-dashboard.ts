import type {
  DashboardActualisation,
  DashboardCityDistribution,
  DashboardScorecards,
  DashboardTypeBreakdown,
} from '../types/dashboard';

const scorecards: DashboardScorecards = {
  total: 1_248,
  published: 1_091,
  published_pct: 87.4,
  avg_completeness: null,
  pending_changes: 14,
  delta_30d: 38,
  delta_pct: 12.5,
};

const typeBreakdown: DashboardTypeBreakdown = {
  total: 1_248,
  rows: [
    { type: 'HOT', count: 312, published: 289, draft: 18, archived: 5, pct_of_total: 25.0 },
    { type: 'RES', count: 278, published: 251, draft: 22, archived: 5, pct_of_total: 22.3 },
    { type: 'CAMP', count: 194, published: 176, draft: 14, archived: 4, pct_of_total: 15.5 },
    { type: 'LOI', count: 163, published: 141, draft: 19, archived: 3, pct_of_total: 13.1 },
    { type: 'FMA', count: 121, published: 103, draft: 15, archived: 3, pct_of_total: 9.7 },
    { type: 'ITI', count: 98,  published: 82,  draft: 13, archived: 3, pct_of_total: 7.9 },
    { type: 'HLO', count: 52,  published: 31,  draft: 18, archived: 3, pct_of_total: 4.2 },
    { type: 'HPA', count: 30,  published: 18,  draft: 10, archived: 2, pct_of_total: 2.4 },
  ],
};

const cityDistribution: DashboardCityDistribution = {
  rows: [
    { city: 'Bordeaux',       count: 148, delta_30d: 5 },
    { city: 'Arcachon',       count: 112, delta_30d: 3 },
    { city: 'Biarritz',       count: 98,  delta_30d: 4 },
    { city: 'Bayonne',        count: 87,  delta_30d: 2 },
    { city: 'Périgueux',      count: 76,  delta_30d: 1 },
    { city: 'Bergerac',       count: 64,  delta_30d: 2 },
    { city: 'Pau',            count: 58,  delta_30d: 0 },
    { city: 'Mont-de-Marsan', count: 44,  delta_30d: 1 },
    { city: 'Agen',           count: 39,  delta_30d: 0 },
    { city: 'Dax',            count: 33,  delta_30d: 2 },
  ],
};

const actualisation: DashboardActualisation = {
  threshold_days: 90,
  rows: [
    { type: 'HOT',  total: 312, up_to_date: 271, to_review: 29, stale: 12, rate: 86.9, weekly_rates: null },
    { type: 'RES',  total: 278, up_to_date: 231, to_review: 31, stale: 16, rate: 83.1, weekly_rates: null },
    { type: 'CAMP', total: 194, up_to_date: 158, to_review: 24, stale: 12, rate: 81.4, weekly_rates: null },
    { type: 'LOI',  total: 163, up_to_date: 122, to_review: 27, stale: 14, rate: 74.8, weekly_rates: null },
    { type: 'FMA',  total: 121, up_to_date: 101, to_review: 14, stale:  6, rate: 83.5, weekly_rates: null },
    { type: 'ITI',  total: 98,  up_to_date: 71,  to_review: 18, stale:  9, rate: 72.4, weekly_rates: null },
    { type: 'HLO',  total: 52,  up_to_date: 38,  to_review:  9, stale:  5, rate: 73.1, weekly_rates: null },
    { type: 'HPA',  total: 30,  up_to_date: 22,  to_review:  5, stale:  3, rate: 73.3, weekly_rates: null },
  ],
};

export const mockDashboardData = {
  scorecards,
  typeBreakdown,
  cityDistribution,
  actualisation,
  // provisional stubs — referenced by service stubs
  completeness: null,
  capacity: null,
  velocity: null,
  contributors: null,
  seasonality: null,
  distinctions: null,
};
