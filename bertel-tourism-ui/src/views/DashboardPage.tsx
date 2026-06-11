"use client";

import { useQuery } from '@tanstack/react-query';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import {
  getDashboardScorecards,
  getDashboardTypeBreakdown,
  getDashboardCityDistribution,
  getDashboardActualisation,
  getDashboardDistinctionOverview,
  getDashboardFilterOptions,
} from '../services/dashboard-rpc';
import { useDashboardQuery } from '../hooks/useDashboardQuery';
import { ScorecardStrip } from '../components/dashboard/ScorecardStrip';
import { TypeBreakdown } from '../components/dashboard/TypeBreakdown';
import { CommuneDistribution } from '../components/dashboard/CommuneDistribution';
import { ActualisationTable } from '../components/dashboard/ActualisationTable';
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
  });
  const filterOptionsError = filterOptions.error
    ? 'Impossible de charger les options de filtre'
    : null;

  // Héro permanent ; les widgets d'onglet ne fetchent que quand leur onglet est visible.
  const scorecards = useDashboardQuery('scorecards', filters, getDashboardScorecards);
  const typeBreakdown = useDashboardQuery('type-breakdown', filters, getDashboardTypeBreakdown, activeTab === 'quality');
  const actualisation = useDashboardQuery('actualisation', filters, getDashboardActualisation, activeTab === 'quality');
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
        />

        <main className="dashboard-main">
          <ActiveFilterStrip />

          <WidgetFrame isPending={scorecards.isPending} error={scorecards.error} onRetry={() => scorecards.refetch()}>
            {scorecards.data && <ScorecardStrip data={scorecards.data} />}
          </WidgetFrame>

          <DashboardTabs />

          {activeTab === 'quality' && (
            <>
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
            </>
          )}

          {activeTab === 'offer' && (
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
          )}

          {activeTab === 'activity' && (
            <article className="kpi-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Activité équipe</span>
                  <h2>À venir</h2>
                </div>
              </div>
              <p className="dashboard-widget-state">
                Vélocité, contributeurs et modération arrivent au lot 4
                (spec 2026-06-11-dashboard-statistics-design).
              </p>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}

export { DashboardPage };
