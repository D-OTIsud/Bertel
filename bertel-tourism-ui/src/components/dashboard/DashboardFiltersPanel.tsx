"use client";

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import type { BackendObjectTypeCode } from '../../types/domain';
import type { DashboardFilters } from '../../types/dashboard';
import { FilterDropdown } from './FilterDropdown';
import { FilterColumnGroup } from '../common/FilterColumnGroup';

// ── Constantes ────────────────────────────────────────────────────────────────

const OBJECT_TYPE_OPTIONS: { code: BackendObjectTypeCode; label: string }[] = [
  { code: 'HOT',  label: 'Hôtels' },
  { code: 'HPA',  label: 'Plein air' },
  { code: 'HLO',  label: 'Lois. hbg.' },
  { code: 'CAMP', label: 'Campings' },
  { code: 'RVA',  label: 'Rés. vac.' },
  { code: 'RES',  label: 'Restaurants' },
  { code: 'ITI',  label: 'Itinéraires' },
  { code: 'FMA',  label: 'Événements' },
  { code: 'LOI',  label: 'Loisirs' },
  { code: 'PCU',  label: 'Culture' },
  { code: 'PNA',  label: 'Nature' },
  { code: 'VIL',  label: 'Villages' },
  { code: 'COM',  label: 'Commerces' },
  { code: 'PSV',  label: 'Services' },
  { code: 'ASC',  label: 'Ascenseurs' },
];

const STATUS_OPTIONS: { code: NonNullable<DashboardFilters['status']>[number]; label: string }[] = [
  { code: 'published', label: 'Publié' },
  { code: 'draft',     label: 'Brouillon' },
  { code: 'archived',  label: 'Archivé' },
  { code: 'hidden',    label: 'Masqué' },
];

const DATE_PRESETS: { label: string; days: number }[] = [
  { label: '7 j',    days: 7 },
  { label: '30 j',   days: 30 },
  { label: '3 mois', days: 90 },
  { label: '1 an',   days: 365 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Sous-composant — sous-label de champ dans un FilterColumnGroup ────────────
// Remplace l'ancien FiltersSubsection (carte). Calqué sur la variante colonne
// d'Explorer : un libellé de champ discret au-dessus du contrôle.
function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-2">{label}</span>
      {children}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface DashboardFiltersPanelProps {
  /** Sorted, deduplicated city list from the corpus (api.get_dashboard_city_options). */
  availableCities: string[];
  /** Non-null when the city options RPC failed — shown inline below the dropdown. */
  cityLoadError?: string | null;
  /** Sorted, deduplicated lieu-dit list from the corpus (api.get_dashboard_lieu_dit_options). */
  availableLieuDits: string[];
  /** Non-null when the lieu-dit options RPC failed — shown inline below the dropdown. */
  lieuDitLoadError?: string | null;
}

export function DashboardFiltersPanel({
  availableCities,
  cityLoadError,
  availableLieuDits,
  lieuDitLoadError,
}: DashboardFiltersPanelProps) {
  const { filters, setFilters, resetFilters, sidebarCollapsed, toggleSidebar } =
    useDashboardFilterStore();

  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    (filters.cities && filters.cities.length > 0) ||
    (filters.lieuDits && filters.lieuDits.length > 0) ||
    filters.updatedAtFrom ||
    filters.updatedAtTo ||
    filters.pmr ||
    filters.petsAccepted ||
    JSON.stringify(filters.status) !== JSON.stringify(['published']);

  function applyDatePreset(days: number) {
    setFilters({ updatedAtFrom: isoNDaysAgo(days), updatedAtTo: isoToday() });
  }

  function clearDatePreset() {
    setFilters({ updatedAtFrom: undefined, updatedAtTo: undefined });
  }

  // ── Rail collapsed ────────────────────────────────────────────────────────

  if (sidebarCollapsed) {
    return (
      <aside className="dashboard-filters-sidebar dashboard-filters-sidebar--collapsed">
        <button
          type="button"
          className="dashboard-filters-sidebar__toggle"
          onClick={toggleSidebar}
          title="Afficher les filtres"
        >
          <span className="dashboard-filters-sidebar__toggle-icon">⊞</span>
          {hasActiveFilters && <span className="dashboard-filters-sidebar__badge" />}
        </button>
      </aside>
    );
  }

  // ── Sidebar développée ────────────────────────────────────────────────────

  return (
    <aside className="dashboard-filters-sidebar">
      <div className="dashboard-filters-sidebar__header">
        <span className="eyebrow">Filtres</span>
        <button
          type="button"
          className="dashboard-filters-sidebar__toggle"
          onClick={toggleSidebar}
          title="Réduire"
        >
          ◀
        </button>
      </div>

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          className="filters-panel__reset"
          onClick={resetFilters}
        >
          Réinitialiser
        </Button>
      )}

      {/* Flat hairline-divided groups — matches the Explorer filters column. */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-1">

        <FilterColumnGroup label="Périmètre">
          <div className="space-y-3">
            <FilterField label="Type d'objet">
              <FilterDropdown<BackendObjectTypeCode>
                mode="multi"
                placeholder="Tous les types"
                options={OBJECT_TYPE_OPTIONS}
                selected={filters.types ?? []}
                onChange={(types) => setFilters({ types: types.length > 0 ? types : undefined })}
              />
            </FilterField>
            <FilterField label="Statut">
              <FilterDropdown<NonNullable<DashboardFilters['status']>[number]>
                mode="single"
                placeholder="Publié"
                options={STATUS_OPTIONS}
                selected={filters.status ?? []}
                onChange={(codes) => setFilters({ status: codes.length > 0 ? codes : undefined })}
              />
            </FilterField>
          </div>
        </FilterColumnGroup>

        <FilterColumnGroup label="Localisation">
          <div className="space-y-3">
            <FilterField label="Commune">
              <FilterDropdown<string>
                mode="multi"
                placeholder="Toutes les communes"
                allLabel="Toutes les communes"
                options={availableCities.map((c) => ({ code: c, label: c }))}
                selected={filters.cities ?? []}
                onChange={(cities) => setFilters({ cities: cities.length > 0 ? cities : undefined })}
                loadError={cityLoadError}
              />
            </FilterField>
            <FilterField label="Lieu-dit">
              <FilterDropdown<string>
                mode="single"
                placeholder="Tous les lieux-dits"
                options={availableLieuDits.map((v) => ({ code: v, label: v }))}
                selected={filters.lieuDits ?? []}
                onChange={(vals) => setFilters({ lieuDits: vals.length > 0 ? vals : undefined })}
                loadError={lieuDitLoadError}
              />
            </FilterField>
          </div>
        </FilterColumnGroup>

        <FilterColumnGroup label="Période">
          <div className="space-y-3">
            <FilterField label="Préréglages">
              <div className="chip-grid">
                {DATE_PRESETS.map(({ label, days }) => {
                  const from = isoNDaysAgo(days);
                  const active = filters.updatedAtFrom === from && filters.updatedAtTo === isoToday();
                  return (
                    <button
                      key={label}
                      type="button"
                      className={active ? 'chip chip--active' : 'chip'}
                      onClick={() => (active ? clearDatePreset() : applyDatePreset(days))}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </FilterField>
            <FilterField label="Plage personnalisée">
              <div className="dashboard-filter-date-grid">
                <div>
                  <span className="facet-title">Du</span>
                  <input
                    type="date"
                    className="dashboard-filter-input"
                    value={filters.updatedAtFrom ?? ''}
                    onChange={(e) => setFilters({ updatedAtFrom: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <span className="facet-title">Au</span>
                  <input
                    type="date"
                    className="dashboard-filter-input"
                    value={filters.updatedAtTo ?? ''}
                    onChange={(e) => setFilters({ updatedAtTo: e.target.value || undefined })}
                  />
                </div>
              </div>
            </FilterField>
          </div>
        </FilterColumnGroup>

        <FilterColumnGroup label="Accessibilité">
          <div className="filters-panel__toggle-group">
            <label className="switch-row">
              <span>PMR</span>
              <input
                type="checkbox"
                checked={!!filters.pmr}
                onChange={(e) => setFilters({ pmr: e.target.checked ? true : undefined })}
              />
            </label>
            <label className="switch-row">
              <span>Animaux acceptés</span>
              <input
                type="checkbox"
                checked={!!filters.petsAccepted}
                onChange={(e) => setFilters({ petsAccepted: e.target.checked ? true : undefined })}
              />
            </label>
          </div>
        </FilterColumnGroup>

      </div>
    </aside>
  );
}
