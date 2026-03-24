"use client";

import { useEffect, useState } from 'react';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import {
  getDashboardScorecards,
  getDashboardTypeBreakdown,
  getDashboardCityDistribution,
  getDashboardActualisation,
  getDashboardDistinctionOverview,
  getDashboardCityOptions,
} from '../services/dashboard-rpc';
import { ScorecardStrip } from '../components/dashboard/ScorecardStrip';
import { TypeBreakdown } from '../components/dashboard/TypeBreakdown';
import { CommuneDistribution } from '../components/dashboard/CommuneDistribution';
import { ActualisationTable } from '../components/dashboard/ActualisationTable';
import { DistinctionOverview } from '../components/dashboard/DistinctionOverview';
import { DashboardFiltersPanel } from '../components/dashboard/DashboardFiltersPanel';
import { ActiveFilterStrip } from '../components/dashboard/ActiveFilterStrip';
import type {
  DashboardScorecards,
  DashboardTypeBreakdown,
  DashboardCityDistribution,
  DashboardActualisation,
  DashboardDistinctionOverview,
} from '../types/dashboard';

export default function DashboardPage() {
  const filters = useDashboardFilterStore((state) => state.filters);

  const [scorecards, setScorecards] = useState<DashboardScorecards | null>(null);
  const [typeBreakdown, setTypeBreakdown] = useState<DashboardTypeBreakdown | null>(null);
  const [cityDistribution, setCityDistribution] = useState<DashboardCityDistribution | null>(null);
  const [actualisation, setActualisation] = useState<DashboardActualisation | null>(null);
  const [distinctionOverview, setDistinctionOverview] = useState<DashboardDistinctionOverview | null>(null);
  // Corpus-wide city list — fetched once on mount, independent of active filters.
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  useEffect(() => {
    getDashboardCityOptions().then(setCityOptions).catch(console.error);
  }, []);

  useEffect(() => {
    getDashboardScorecards(filters).then(setScorecards).catch(console.error);
    getDashboardTypeBreakdown(filters).then(setTypeBreakdown).catch(console.error);
    getDashboardCityDistribution(filters).then(setCityDistribution).catch(console.error);
    getDashboardActualisation(filters).then(setActualisation).catch(console.error);
    getDashboardDistinctionOverview(filters).then(setDistinctionOverview).catch(console.error);
  }, [filters]);

  return (
    <div className="dashboard-layout">
      <DashboardFiltersPanel availableCities={cityOptions} />

      <main className="dashboard-main">
        <ActiveFilterStrip />

        {scorecards && <ScorecardStrip data={scorecards} />}

        <div className="dashboard-kpi__row">
          {typeBreakdown && <TypeBreakdown data={typeBreakdown} />}
          {cityDistribution && <CommuneDistribution data={cityDistribution} />}
        </div>

        <div className="dashboard-kpi__row">
          {distinctionOverview && <DistinctionOverview data={distinctionOverview} />}
        </div>

        {actualisation && <ActualisationTable data={actualisation} />}
      </main>
    </div>
  );
}

export { DashboardPage };
