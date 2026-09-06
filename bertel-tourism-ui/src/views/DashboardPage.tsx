"use client";

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  getDashboardCrmActivity,
  getDashboardCrmOpen,
  getDashboardTeamActivity,
} from '../services/dashboard-rpc';
import { useDashboardQuery, DASHBOARD_STALE_TIME_MS } from '../hooks/useDashboardQuery';
import { FiltersPanel } from '../components/explorer/FiltersPanel';
import { ExplorerActiveFilters } from '../components/explorer/ExplorerActiveFilters';
import { DashboardPeriodSection } from '../components/dashboard/DashboardPeriodSection';
import { ScorecardStrip } from '../components/dashboard/ScorecardStrip';
import { TypeBreakdown } from '../components/dashboard/TypeBreakdown';
import { CommuneDistribution } from '../components/dashboard/CommuneDistribution';
import { ActivityRhythmChart } from '../components/dashboard/ActivityRhythmChart';
import { ContributorsTable } from '../components/dashboard/ContributorsTable';
import { CrmBacklogWidget } from '../components/dashboard/CrmBacklogWidget';
import { CrmFlowWidget } from '../components/dashboard/CrmFlowWidget';
import { NetTimeWidget } from '../components/dashboard/NetTimeWidget';
import { ActualisationTable } from '../components/dashboard/ActualisationTable';
import { CompletenessTable } from '../components/dashboard/CompletenessTable';
import { DistinctionOverview } from '../components/dashboard/DistinctionOverview';
import { DashboardTabs } from '../components/dashboard/DashboardTabs';
import { TimeseriesWidget } from '../components/dashboard/TimeseriesWidget';
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
  // Compteur CRM global : la carte n'obéit pas au panneau de filtres (« Tout le
  // périmètre »), et le fetcher ne prend aucun paramètre. Faire entrer `params`
  // dans la queryKey relancerait un appel réseau à chaque changement de filtre
  // pour un résultat strictement identique — d'où une clé dédiée, sans filtres.
  const crmOpen = useQuery({
    queryKey: ['dashboard', 'crm-open'],
    queryFn: getDashboardCrmOpen,
    staleTime: DASHBOARD_STALE_TIME_MS,
  });
  const typeBreakdown = useDashboardQuery('type-breakdown', params, getDashboardTypeBreakdown, activeTab === 'quality');
  const actualisation = useDashboardQuery('actualisation', params, getDashboardActualisation, activeTab === 'quality');
  const completeness = useDashboardQuery('completeness', params, getDashboardCompleteness, activeTab === 'quality');
  // Deux séries GLOBALES de plus, même raisonnement que crm-open ci-dessus : elles ne
  // répondent pas à « quels objets » mais à « comment l'équipe a travaillé », une question
  // qui n'a pas de sens restreinte à une sélection. Leur clé ne porte donc pas `params`.
  // `enabled` garde le FETCH : les hooks vivent au niveau page et sont évalués sur tous les
  // onglets, alors que les widgets ne sont montés que sur celui-ci.
  const teamActivity = useQuery({
    queryKey: ['dashboard', 'team-activity'],
    queryFn: getDashboardTeamActivity,
    staleTime: DASHBOARD_STALE_TIME_MS,
    enabled: activeTab === 'activity',
  });
  const crmActivity = useQuery({
    queryKey: ['dashboard', 'crm-activity'],
    queryFn: getDashboardCrmActivity,
    staleTime: DASHBOARD_STALE_TIME_MS,
    enabled: activeTab === 'activity',
  });
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
            // §205 — pas d'« Archivé » ici : buildDashboardStatsParams restreint
            // p_status à published/draft, la chip serait un contrôle mort.
            includeArchivedStatus={false}
          />
        </aside>

        <main className="dashboard-main">
          <ExplorerActiveFilters useStore={useDashboardExplorerStore} showExplorerBridge />

          <WidgetFrame isPending={scorecards.isPending} error={scorecards.error} onRetry={() => scorecards.refetch()}>
            {scorecards.data && <ScorecardStrip data={scorecards.data} crmOpen={crmOpen.data} />}
          </WidgetFrame>

          <DashboardTabs />

          {activeTab === 'quality' && (
            <section className="dashboard-panel" role="tabpanel" id="dashboard-panel-quality" aria-labelledby="dashboard-tab-quality">
              <TimeseriesWidget
                eyebrow="Qualité"
                title="Remplissage dans le temps"
                subtitle="Relevé quotidien figé depuis le 19 juin 2026 — la seule façon de comparer une date à l’autre."
                scope="global"
                enabled={activeTab === 'quality'}
                metrics={[
                  { key: 'completeness_avg', label: 'Remplissage', unit: ' %', decimals: 1 },
                  { key: 'classified_count', label: 'Classés' },
                ]}
              />
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
            <div className="dashboard-panel">
              <TimeseriesWidget
                eyebrow="Offre"
                title="Corpus dans le temps"
                subtitle="Croissance nette du corpus, tous statuts, relevée chaque nuit."
                scope="global"
                enabled={activeTab === 'offer'}
                metrics={[{ key: 'corpus_count', label: 'Corpus', color: 'var(--acc-asc)' }]}
              />
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
            </div>
            </section>
          )}

          {activeTab === 'activity' && (
            <section role="tabpanel" id="dashboard-panel-activity" aria-labelledby="dashboard-tab-activity">
            <div className="dashboard-panel">
              <TimeseriesWidget
                eyebrow="Activité"
                title="Demandes ouvertes dans le temps"
                subtitle="Le gros de ce qui reste à traiter, relevé chaque nuit."
                scope="global"
                enabled={activeTab === 'activity'}
                metrics={[{ key: 'crm_backlog', label: 'À traiter', color: 'var(--warn)' }]}
              />
              <WidgetFrame
                isPending={teamActivity.isPending && activeTab === 'activity'}
                error={teamActivity.error}
                isEmpty={teamActivity.data?.weeks.length === 0}
                emptyLabel="Aucune saisie relevée sur les douze dernières semaines."
                onRetry={() => teamActivity.refetch()}
              >
                {teamActivity.data && <ActivityRhythmChart data={teamActivity.data} />}
              </WidgetFrame>
              <WidgetFrame
                isPending={teamActivity.isPending && activeTab === 'activity'}
                error={teamActivity.error}
                isEmpty={teamActivity.data?.contributors.length === 0}
                emptyLabel="Aucun contributeur sur les douze dernières semaines."
                onRetry={() => teamActivity.refetch()}
              >
                {teamActivity.data && <ContributorsTable data={teamActivity.data} />}
              </WidgetFrame>
              <div className="dashboard-kpi__row">
                <WidgetFrame
                  isPending={crmActivity.isPending && activeTab === 'activity'}
                  error={crmActivity.error}
                  isEmpty={crmActivity.data?.open_by_age.every((b) => b.count === 0)}
                  emptyLabel="Aucune demande ouverte : rien n’attend de traitement."
                  onRetry={() => crmActivity.refetch()}
                >
                  {crmActivity.data && <CrmBacklogWidget data={crmActivity.data} />}
                </WidgetFrame>
                <WidgetFrame
                  isPending={crmActivity.isPending && activeTab === 'activity'}
                  error={crmActivity.error}
                  emptyLabel="Aucun mouvement de demandes sur douze mois."
                  onRetry={() => crmActivity.refetch()}
                >
                  {crmActivity.data && <CrmFlowWidget data={crmActivity.data} />}
                </WidgetFrame>
              </div>
              <WidgetFrame
                isPending={crmActivity.isPending && activeTab === 'activity'}
                error={crmActivity.error}
                emptyLabel="Temps de traitement non calculable."
                onRetry={() => crmActivity.refetch()}
              >
                {crmActivity.data && <NetTimeWidget data={crmActivity.data} />}
              </WidgetFrame>
            </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export { DashboardPage };
