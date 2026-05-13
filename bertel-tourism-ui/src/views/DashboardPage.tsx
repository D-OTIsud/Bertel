"use client";

import { useEffect, useState } from 'react';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import {
  getDashboardScorecards,
  getDashboardTypeBreakdown,
  getDashboardCityDistribution,
  getDashboardActualisation,
  getDashboardDistinctionOverview,
  getDashboardFilterOptions,
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
  // Corpus-wide filter options (cities + lieux-dits) — fetched once on mount
  // via a single RPC; both datasets are always needed together.
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [lieuDitOptions, setLieuDitOptions] = useState<string[]>([]);
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardFilterOptions()
      .then(({ cities, lieuDits }) => {
        setCityOptions(cities);
        setLieuDitOptions(lieuDits);
        setFilterOptionsError(null);
      })
      .catch((err: unknown) => {
        console.error('getDashboardFilterOptions failed:', err);
        setFilterOptionsError(
          err instanceof Error ? err.message : 'Impossible de charger les options de filtre',
        );
      });
  }, []);

  useEffect(() => {
    getDashboardScorecards(filters).then(setScorecards).catch(console.error);
    getDashboardTypeBreakdown(filters).then(setTypeBreakdown).catch(console.error);
    getDashboardCityDistribution(filters).then(setCityDistribution).catch(console.error);
    getDashboardActualisation(filters).then(setActualisation).catch(console.error);
    getDashboardDistinctionOverview(filters).then(setDistinctionOverview).catch(console.error);
  }, [filters]);

  return (
    <div className="min-h-0 p-4">
      <div className="dashboard-layout">
      <DashboardFiltersPanel
        availableCities={cityOptions}
        cityLoadError={filterOptionsError}
        availableLieuDits={lieuDitOptions}
        lieuDitLoadError={filterOptionsError}
      />

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
    </div>
  );
}

export { DashboardPage };
