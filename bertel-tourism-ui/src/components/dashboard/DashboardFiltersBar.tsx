"use client";

import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import type { BackendObjectTypeCode } from '../../types/domain';
import type { DashboardFilters } from '../../types/dashboard';

// ── Labels ────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { code: BackendObjectTypeCode; label: string }[] = [
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

const STATUS_OPTIONS: { code: DashboardFilters['status'] extends (infer S)[] | undefined ? S : never; label: string }[] = [
  { code: 'published', label: 'Publié' },
  { code: 'draft',     label: 'Brouillon' },
  { code: 'archived',  label: 'Archivé' },
  { code: 'hidden',    label: 'Masqué' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggleArrayItem<T>(arr: T[] | undefined, item: T): T[] | undefined {
  if (!arr || arr.length === 0) return [item];
  const next = arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
  return next.length > 0 ? next : undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardFiltersBar() {
  const { filters, setFilters, resetFilters } = useDashboardFilterStore();

  function toggleType(code: BackendObjectTypeCode) {
    setFilters({ types: toggleArrayItem(filters.types, code) });
  }

  function toggleStatus(code: typeof STATUS_OPTIONS[number]['code']) {
    setFilters({ status: toggleArrayItem(filters.status, code) });
  }

  function handleCity(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.trim();
    setFilters({ cities: val ? [val] : undefined });
  }

  function handleDate(field: 'updatedAtFrom' | 'updatedAtTo') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilters({ [field]: e.target.value || undefined });
    };
  }

  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    (filters.cities && filters.cities.length > 0) ||
    filters.updatedAtFrom ||
    filters.updatedAtTo ||
    filters.pmr ||
    filters.petsAccepted ||
    JSON.stringify(filters.status) !== JSON.stringify(['published']);

  return (
    <article className="kpi-panel dashboard-filters-bar">
      <div className="dashboard-filters-bar__header">
        <span className="eyebrow">Filtres</span>
        {hasActiveFilters && (
          <button type="button" className="ghost-button" onClick={resetFilters}>
            Réinitialiser
          </button>
        )}
      </div>

      {/* Types */}
      <div className="dashboard-filters-bar__group">
        <span className="dashboard-filters-bar__label">Type</span>
        <div className="chip-grid">
          {TYPE_OPTIONS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              className={filters.types?.includes(code) ? 'chip chip--active' : 'chip'}
              onClick={() => toggleType(code)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary row: status + city + dates + boolean toggles */}
      <div className="dashboard-filters-bar__row">
        <span className="dashboard-filters-bar__label">Statut</span>
        {STATUS_OPTIONS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className={filters.status?.includes(code) ? 'chip chip--active' : 'chip'}
            onClick={() => toggleStatus(code)}
          >
            {label}
          </button>
        ))}

        <div className="dashboard-filters-bar__sep" aria-hidden="true" />

        <span className="dashboard-filters-bar__label">Ville</span>
        <input
          type="text"
          className="dashboard-filters-bar__input"
          placeholder="ex. Bordeaux"
          value={filters.cities?.[0] ?? ''}
          onChange={handleCity}
        />

        <div className="dashboard-filters-bar__sep" aria-hidden="true" />

        <span className="dashboard-filters-bar__label">Modifié du</span>
        <input
          type="date"
          className="dashboard-filters-bar__input"
          value={filters.updatedAtFrom ?? ''}
          onChange={handleDate('updatedAtFrom')}
        />
        <span className="dashboard-filters-bar__label">au</span>
        <input
          type="date"
          className="dashboard-filters-bar__input"
          value={filters.updatedAtTo ?? ''}
          onChange={handleDate('updatedAtTo')}
        />

        <div className="dashboard-filters-bar__sep" aria-hidden="true" />

        <button
          type="button"
          className={filters.pmr ? 'chip chip--active' : 'chip'}
          onClick={() => setFilters({ pmr: !filters.pmr || undefined })}
        >
          PMR
        </button>
        <button
          type="button"
          className={filters.petsAccepted ? 'chip chip--active' : 'chip'}
          onClick={() => setFilters({ petsAccepted: !filters.petsAccepted || undefined })}
        >
          Animaux
        </button>
      </div>
    </article>
  );
}
