"use client";

import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

const STATUS_LABELS: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  archived: 'Archivé',
  hidden: 'Masqué',
};

export function ActiveFilterStrip() {
  const { filters, setFilters, resetFilters } = useDashboardFilterStore();

  const chips: { label: string; onRemove: () => void }[] = [];

  (filters.types ?? []).forEach((t) =>
    chips.push({ label: `Type : ${t}`, onRemove: () =>
      setFilters({ types: filters.types?.filter((v) => v !== t) || undefined }) }),
  );

  (filters.cities ?? []).forEach((c) =>
    chips.push({ label: c, onRemove: () =>
      setFilters({ cities: filters.cities?.filter((v) => v !== c) || undefined }) }),
  );

  (filters.status ?? [])
    .filter((s) => s !== 'published')
    .forEach((s) =>
      chips.push({ label: STATUS_LABELS[s] ?? s, onRemove: () =>
        setFilters({ status: filters.status?.filter((v) => v !== s) || ['published'] }) }),
    );

  if (filters.updatedAtFrom || filters.updatedAtTo) {
    const label = [filters.updatedAtFrom, filters.updatedAtTo].filter(Boolean).join(' → ');
    chips.push({ label: `Période : ${label}`, onRemove: () =>
      setFilters({ updatedAtFrom: undefined, updatedAtTo: undefined }) });
  }

  if (filters.pmr)
    chips.push({ label: 'PMR', onRemove: () => setFilters({ pmr: undefined }) });

  if (filters.petsAccepted)
    chips.push({ label: 'Animaux', onRemove: () => setFilters({ petsAccepted: undefined }) });

  if (chips.length === 0) return null;

  return (
    <div className="active-filter-strip">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          className="active-filter-chip"
          onClick={chip.onRemove}
        >
          {chip.label} ✕
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" className="ghost-button active-filter-strip__reset" onClick={resetFilters}>
          Tout effacer
        </button>
      )}
    </div>
  );
}
