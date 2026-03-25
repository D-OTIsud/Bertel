"use client";

import { Button } from '@/components/ui/button';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import type { BackendObjectTypeCode } from '../../types/domain';
import type { DashboardFilters } from '../../types/dashboard';
import { FilterDropdown } from './FilterDropdown';

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

// ── Sous-composants — calqués sur FiltersSection / FiltersSubsection d'Explorer ──

// Correspond exactement à FiltersSection dans Explorer :
// eyebrow (catégorie de section) + h3 (titre), même structure DOM.
function FiltersSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="filters-panel__section">
      <div className="filters-panel__section-header">
        <span className="eyebrow">{eyebrow}</span>
        <div className="filters-panel__section-heading">
          <h3>{title}</h3>
        </div>
      </div>
      <div className="filters-panel__section-body">{children}</div>
    </section>
  );
}

// Correspond exactement à FiltersSubsection dans Explorer :
// utilise <section> (et non <div>) pour activer la règle CSS
// `.filters-panel__subsection + .filters-panel__subsection` (border-top separator).
function FiltersSubsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="filters-panel__subsection">
      <div className="filters-panel__subsection-header">
        <span className="facet-title">{title}</span>
      </div>
      {children}
    </section>
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

      <div className="filters-panel__content">

        {/* Périmètre — types et statuts via FilterDropdown */}
        <FiltersSection eyebrow="Périmètre" title="Types et statuts">
          <FiltersSubsection title="Type d'objet">
            <FilterDropdown<BackendObjectTypeCode>
              mode="multi"
              placeholder="Tous les types"
              options={OBJECT_TYPE_OPTIONS}
              selected={filters.types ?? []}
              onChange={(types) => setFilters({ types: types.length > 0 ? types : undefined })}
            />
          </FiltersSubsection>

          <FiltersSubsection title="Statut">
            <FilterDropdown<NonNullable<DashboardFilters['status']>[number]>
              mode="single"
              placeholder="Publié"
              options={STATUS_OPTIONS}
              selected={filters.status ?? []}
              onChange={(codes) => setFilters({ status: codes.length > 0 ? codes : undefined })}
            />
          </FiltersSubsection>
        </FiltersSection>

        {/* Localisation — commune et lieu-dit via FilterDropdown */}
        <FiltersSection eyebrow="Localisation" title="Commune et lieu-dit">
          <FiltersSubsection title="Localisation">
            <FilterDropdown<string>
              mode="multi"
              placeholder="Toutes les communes"
              allLabel="Toutes les communes"
              options={availableCities.map((c) => ({ code: c, label: c }))}
              selected={filters.cities ?? []}
              onChange={(cities) => setFilters({ cities: cities.length > 0 ? cities : undefined })}
              loadError={cityLoadError}
            />
            <FilterDropdown<string>
              mode="single"
              placeholder="Tous les lieux-dits"
              options={availableLieuDits.map((v) => ({ code: v, label: v }))}
              selected={filters.lieuDits ?? []}
              onChange={(vals) => setFilters({ lieuDits: vals.length > 0 ? vals : undefined })}
              loadError={lieuDitLoadError}
            />
          </FiltersSubsection>
        </FiltersSection>

        {/* Période de modification */}
        <FiltersSection eyebrow="Période" title="Dernière modification">
          <FiltersSubsection title="Préréglages">
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
          </FiltersSubsection>

          <FiltersSubsection title="Plage personnalisée">
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
          </FiltersSubsection>
        </FiltersSection>

        {/* Accessibilité — switch-row identique à Explorer */}
        <FiltersSection eyebrow="Accessibilité" title="Services et accès">
          <FiltersSubsection title="Accessibilité et services">
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
          </FiltersSubsection>
        </FiltersSection>

      </div>
    </aside>
  );
}
