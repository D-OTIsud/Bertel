"use client";

import { useMemo } from 'react';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import { useDashboardExplorerStore } from '../store/explorer-store';
import { useExplorerReferencesQuery } from '../hooks/useExplorerQueries';
import { dashboardStatsParams } from '../lib/dashboard-stats-params';
import {
  getDashboardScorecards,
  getDashboardTypeBreakdown,
  getDashboardCityDistribution,
  getDashboardActualisation,
  getDashboardCompleteness,
  getDashboardDistinctionOverview,
} from '../services/dashboard-rpc';
import { useDashboardQuery } from '../hooks/useDashboardQuery';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ExplorerActiveFilters } from '../components/explorer/ExplorerActiveFilters';
import { DashboardPeriodSection } from '../components/dashboard/DashboardPeriodSection';
import { ScorecardStrip } from '../components/dashboard/ScorecardStrip';
import { TypeBreakdown } from '../components/dashboard/TypeBreakdown';
import { CommuneDistribution } from '../components/dashboard/CommuneDistribution';
import { ActualisationTable } from '../components/dashboard/ActualisationTable';
import { CompletenessTable } from '../components/dashboard/CompletenessTable';
import { DistinctionOverview } from '../components/dashboard/DistinctionOverview';
import { DashboardTabs } from '../components/dashboard/DashboardTabs';
import { WidgetFrame } from '../components/dashboard/WidgetFrame';

export default function DashboardPage() {
  const activeTab = useDashboardFilterStore((s) => s.activeTab);
  const updatedAtFrom = useDashboardFilterStore((s) => s.updatedAtFrom);
  const updatedAtTo = useDashboardFilterStore((s) => s.updatedAtTo);

  // État de filtre riche = instance Explorer indépendante du Dashboard.
  const selectedBuckets = useDashboardExplorerStore((s) => s.selectedBuckets);
  const common = useDashboardExplorerStore((s) => s.common);
  const hot = useDashboardExplorerStore((s) => s.hot);
  const iti = useDashboardExplorerStore((s) => s.iti);
  const res = useDashboardExplorerStore((s) => s.res);
  const evt = useDashboardExplorerStore((s) => s.evt);
  const vis = useDashboardExplorerStore((s) => s.vis);
  const srv = useDashboardExplorerStore((s) => s.srv);

  const references = useExplorerReferencesQuery();

  const params = useMemo(
    () => dashboardStatsParams(
      { selectedBuckets, common, hot, iti, res, evt, vis, srv },
      { updatedAtFrom: updatedAtFrom ?? undefined, updatedAtTo: updatedAtTo ?? undefined },
    ),
    [selectedBuckets, common, hot, iti, res, evt, vis, srv, updatedAtFrom, updatedAtTo],
  );

  // Héro permanent ; les widgets d'onglet ne fetchent que quand leur onglet est visible.
  const scorecards = useDashboardQuery('scorecards', params, getDashboardScorecards);
  const typeBreakdown = useDashboardQuery('type-breakdown', params, getDashboardTypeBreakdown, activeTab === 'quality');
  const actualisation = useDashboardQuery('actualisation', params, getDashboardActualisation, activeTab === 'quality');
  const completeness = useDashboardQuery('completeness', params, getDashboardCompleteness, activeTab === 'quality');
  const cityDistribution = useDashboardQuery('city-distribution', params, getDashboardCityDistribution, activeTab === 'offer');
  const distinctions = useDashboardQuery('distinctions', params, getDashboardDistinctionOverview, activeTab === 'offer');

  return (
    <div className="min-h-0 p-4">
      <div className="dashboard-layout">
        <aside className="dashboard-filters-sidebar">
          <DashboardPeriodSection />
          <FiltersPanel
            references={references.data}
            useStore={useDashboardExplorerStore}
            typeSpecificFacets={selectedBuckets.length === 1}
          />
        </aside>

        <main className="dashboard-main">
          <ExplorerActiveFilters useStore={useDashboardExplorerStore} />

          <WidgetFrame isPending={scorecards.isPending} error={scorecards.error} onRetry={() => scorecards.refetch()}>
            {scorecards.data && <ScorecardStrip data={scorecards.data} />}
          </WidgetFrame>

          <DashboardTabs />

          {activeTab === 'quality' && (
            <section className="dashboard-panel" role="tabpanel" id="dashboard-panel-quality" aria-labelledby="dashboard-tab-quality">
              {/* Ordre maquette 5.1 : corpus par type → complétude par type → actualisation. */}
              <WidgetFrame
                isPending={typeBreakdown.isPending}
                error={typeBreakdown.error}
                isEmpty={typeBreakdown.data?.rows.length === 0}
                onRetry={() => typeBreakdown.refetch()}
              >
                {typeBreakdown.data && <TypeBreakdown data={typeBreakdown.data} />}
              </WidgetFrame>
              <WidgetFrame
                isPending={completeness.isPending}
                error={completeness.error}
                isEmpty={completeness.data?.rows.length === 0}
                onRetry={() => completeness.refetch()}
              >
                {completeness.data && <CompletenessTable data={completeness.data} />}
              </WidgetFrame>
              <WidgetFrame
                isPending={actualisation.isPending}
                error={actualisation.error}
                isEmpty={actualisation.data?.rows.length === 0}
                onRetry={() => actualisation.refetch()}
              >
                {actualisation.data && <ActualisationTable data={actualisation.data} />}
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
