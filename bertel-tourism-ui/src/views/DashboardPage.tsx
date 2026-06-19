"use client";

import { useQuery } from '@tanstack/react-query';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import {
  getDashboardScorecards,
  getDashboardTypeBreakdown,
  getDashboardCityDistribution,
  getDashboardActualisation,
  getDashboardCompleteness,
  getDashboardDistinctionOverview,
  getDashboardFilterOptions,
} from '../services/dashboard-rpc';
import { getDashboardAdvancedFilterOptions } from '../services/dashboard-reference';
import { useDashboardQuery, DASHBOARD_STALE_TIME_MS } from '../hooks/useDashboardQuery';
import { ScorecardStrip } from '../components/dashboard/ScorecardStrip';
import { TypeBreakdown } from '../components/dashboard/TypeBreakdown';
import { CommuneDistribution } from '../components/dashboard/CommuneDistribution';
import { ActualisationTable } from '../components/dashboard/ActualisationTable';
import { CompletenessTable } from '../components/dashboard/CompletenessTable';
import { DistinctionOverview } from '../components/dashboard/DistinctionOverview';
import { DashboardFiltersPanel } from '../components/dashboard/DashboardFiltersPanel';
import { ActiveFilterStrip } from '../components/dashboard/ActiveFilterStrip';
import { DashboardTabs } from '../components/dashboard/DashboardTabs';
import { WidgetFrame } from '../components/dashboard/WidgetFrame';

export default function DashboardPage() {
  const filters = useDashboardFilterStore((s) => s.filters);
  const activeTab = useDashboardFilterStore((s) => s.activeTab);

  // Options de filtre corpus-wide — indépendantes des filtres actifs.
  const filterOptions = useQuery({
    queryKey: ['dashboard', 'filter-options'],
    queryFn: getDashboardFilterOptions,
    staleTime: DASHBOARD_STALE_TIME_MS,
  });
  const filterOptionsError = filterOptions.error
    ? 'Impossible de charger les options de filtre'
    : null;

  const advancedOptions = useQuery({
    queryKey: ['dashboard', 'advanced-filter-options'],
    queryFn: getDashboardAdvancedFilterOptions,
    staleTime: DASHBOARD_STALE_TIME_MS,
  });

  // Héro permanent ; les widgets d'onglet ne fetchent que quand leur onglet est visible.
  const scorecards = useDashboardQuery('scorecards', filters, getDashboardScorecards);
  const typeBreakdown = useDashboardQuery('type-breakdown', filters, getDashboardTypeBreakdown, activeTab === 'quality');
  const actualisation = useDashboardQuery('actualisation', filters, getDashboardActualisation, activeTab === 'quality');
  const completeness = useDashboardQuery('completeness', filters, getDashboardCompleteness, activeTab === 'quality');
  const cityDistribution = useDashboardQuery('city-distribution', filters, getDashboardCityDistribution, activeTab === 'offer');
  const distinctions = useDashboardQuery('distinctions', filters, getDashboardDistinctionOverview, activeTab === 'offer');

  return (
    <div className="min-h-0 p-4">
      <div className="dashboard-layout">
        <DashboardFiltersPanel
          availableCities={filterOptions.data?.cities ?? []}
          cityLoadError={filterOptionsError}
          availableLieuDits={filterOptions.data?.lieuDits ?? []}
          lieuDitLoadError={filterOptionsError}
          advancedOptions={advancedOptions.data}
          advancedLoadError={advancedOptions.error ? 'Impossible de charger les filtres avancés' : null}
        />

        <main className="dashboard-main">
          <ActiveFilterStrip />

          <WidgetFrame isPending={scorecards.isPending} error={scorecards.error} onRetry={() => scorecards.refetch()}>
            {scorecards.data && <ScorecardStrip data={scorecards.data} />}
          </WidgetFrame>

          <DashboardTabs />

          {activeTab === 'quality' && (
            <section role="tabpanel" id="dashboard-panel-quality" aria-labelledby="dashboard-tab-quality">
              <div className="dashboard-kpi__row">
                <WidgetFrame
                  isPending={typeBreakdown.isPending}
                  error={typeBreakdown.error}
                  isEmpty={typeBreakdown.data?.rows.length === 0}
                  onRetry={() => typeBreakdown.refetch()}
                >
                  {typeBreakdown.data && <TypeBreakdown data={typeBreakdown.data} />}
                </WidgetFrame>
              </div>
              <WidgetFrame
                isPending={actualisation.isPending}
                error={actualisation.error}
                isEmpty={actualisation.data?.rows.length === 0}
                onRetry={() => actualisation.refetch()}
              >
                {actualisation.data && <ActualisationTable data={actualisation.data} />}
              </WidgetFrame>
              <WidgetFrame
                isPending={completeness.isPending}
                error={completeness.error}
                isEmpty={completeness.data?.rows.length === 0}
                onRetry={() => completeness.refetch()}
              >
                {completeness.data && <CompletenessTable data={completeness.data} />}
              </WidgetFrame>
            </section>
          )}

          {activeTab === 'offer' && (
            <section role="tabpanel" id="dashboard-panel-offer" aria-labelledby="dashboard-tab-offer">
            <div className="dashboard-kpi__row">
              <WidgetFrame
                isPending={cityDistribution.isPending}
                error={cityDistribution.error}
                isEmpty={cityDistribution.data?.rows.length === 0}
                onRetry={() => cityDistribution.refetch()}
              >
                {cityDistribution.data && <CommuneDistribution data={cityDistribution.data} />}
              </WidgetFrame>
              <WidgetFrame
                isPending={distinctions.isPending}
                error={distinctions.error}
                onRetry={() => distinctions.refetch()}
              >
                {distinctions.data && <DistinctionOverview data={distinctions.data} />}
              </WidgetFrame>
            </div>
            </section>
          )}

          {activeTab === 'activity' && (
            <section role="tabpanel" id="dashboard-panel-activity" aria-labelledby="dashboard-tab-activity">
            <article className="kpi-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Activité équipe</span>
                  <h2>À venir</h2>
                </div>
              </div>
              <p className="dashboard-widget-state">
                Vélocité, contributeurs et modération arrivent dans un prochain lot (lot 4).
              </p>
            </article>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export { DashboardPage };
