"use client";

import { useRouter } from 'next/navigation';
import { mapDashboardFiltersToExplorerUrl } from '../../lib/dashboard-to-explorer';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

const STATUS_LABELS: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  archived: 'Archivé',
  hidden: 'Masqué',
};

/**
 * Retire les éléments pour lesquels `predicate` renvoie true.
 * Renvoie `undefined` quand la liste résultante est vide (pas de clé fantôme dans les filtres).
 */
function without<T>(list: T[] | undefined, predicate: (v: T) => boolean): T[] | undefined {
  const next = (list ?? []).filter((v) => !predicate(v));
  return next.length > 0 ? next : undefined;
}

export function ActiveFilterStrip() {
  const { filters, setFilters, resetFilters } = useDashboardFilterStore();
  const router = useRouter();
  const bridge = mapDashboardFiltersToExplorerUrl(filters);

  // Les closures onRemove lisent le snapshot `filters` du rendu courant : deux retraits
  // dans le même batch React peuvent en perdre un. Connu/accepté (interaction improbable) ;
  // le correctif propre est la forme fonctionnelle de setFilters — différé (cf. plan lots 0+1, T12).
  const chips: { label: string; key?: string; onRemove: () => void }[] = [];

  // ── Types ────────────────────────────────────────────────────────────────
  (filters.types ?? []).forEach((t) =>
    chips.push({
      label: `Type : ${t}`,
      onRemove: () => setFilters({ types: without(filters.types, (v) => v === t) }),
    }),
  );

  // ── Communes / villes ────────────────────────────────────────────────────
  (filters.cities ?? []).forEach((c) =>
    chips.push({
      label: c,
      onRemove: () => setFilters({ cities: without(filters.cities, (v) => v === c) }),
    }),
  );

  // ── Statuts (garde la sémantique spéciale : jamais vide, fallback 'published') ──
  (filters.status ?? [])
    .filter((s) => s !== 'published')
    .forEach((s) =>
      chips.push({
        label: STATUS_LABELS[s] ?? s,
        onRemove: () =>
          setFilters({ status: filters.status?.filter((v) => v !== s) || ['published'] }),
      }),
    );

  // ── Période de mise à jour ────────────────────────────────────────────────
  if (filters.updatedAtFrom || filters.updatedAtTo) {
    const label = [filters.updatedAtFrom, filters.updatedAtTo].filter(Boolean).join(' → ');
    chips.push({
      label: `Période : ${label}`,
      onRemove: () => setFilters({ updatedAtFrom: undefined, updatedAtTo: undefined }),
    });
  }

  // ── PMR / Animaux ─────────────────────────────────────────────────────────
  if (filters.pmr)
    chips.push({ label: 'PMR', onRemove: () => setFilters({ pmr: undefined }) });

  if (filters.petsAccepted)
    chips.push({ label: 'Animaux', onRemove: () => setFilters({ petsAccepted: undefined }) });

  // ── Lieux-dits ────────────────────────────────────────────────────────────
  (filters.lieuDits ?? []).forEach((l) =>
    chips.push({
      label: `Lieu-dit : ${l}`,
      onRemove: () => setFilters({ lieuDits: without(filters.lieuDits, (v) => v === l) }),
    }),
  );

  // ── Taxonomie ─────────────────────────────────────────────────────────────
  (filters.taxonomyAny ?? []).forEach((t) =>
    chips.push({
      label: `Catégorie : ${t.code}`,
      key: `tax:${t.domain}:${t.code}`,
      onRemove: () =>
        setFilters({
          taxonomyAny: without(
            filters.taxonomyAny,
            (v) => v.domain === t.domain && v.code === t.code,
          ),
        }),
    }),
  );

  // ── Classifications / distinctions ────────────────────────────────────────
  (filters.classificationsAny ?? []).forEach((c) =>
    chips.push({
      label: `Distinction : ${c.schemeCode} ${c.valueCode}`,
      onRemove: () =>
        setFilters({
          classificationsAny: without(
            filters.classificationsAny,
            (v) => v.schemeCode === c.schemeCode && v.valueCode === c.valueCode,
          ),
        }),
    }),
  );

  // ── Langues ───────────────────────────────────────────────────────────────
  (filters.languagesAny ?? []).forEach((l) =>
    chips.push({
      label: `Langue : ${l}`,
      onRemove: () =>
        setFilters({ languagesAny: without(filters.languagesAny, (v) => v === l) }),
    }),
  );

  // ── Familles d'équipements ────────────────────────────────────────────────
  (filters.amenityFamiliesAny ?? []).forEach((f) =>
    chips.push({
      label: `Famille : ${f}`,
      onRemove: () =>
        setFilters({
          amenityFamiliesAny: without(filters.amenityFamiliesAny, (v) => v === f),
        }),
    }),
  );

  // ── Labels / tags ─────────────────────────────────────────────────────────
  (filters.labelsAny ?? []).forEach((t) =>
    chips.push({
      label: `Tag : ${t}`,
      onRemove: () =>
        setFilters({ labelsAny: without(filters.labelsAny, (v) => v === t) }),
    }),
  );

  if (chips.length === 0) return null;

  return (
    <div className="active-filter-strip">
      {chips.map((chip) => (
        <button
          key={chip.key ?? chip.label}
          type="button"
          className="active-filter-chip"
          onClick={chip.onRemove}
        >
          {chip.label} ✕
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="ghost-button active-filter-strip__reset"
          onClick={resetFilters}
        >
          Tout effacer
        </button>
      )}
      <button
        type="button"
        className="ghost-button active-filter-strip__explorer"
        title={
          bridge.dropped.length > 0
            ? `Non transposés : ${bridge.dropped.join(', ')}`
            : undefined
        }
        onClick={() => router.push(bridge.url)}
      >
        Ouvrir dans l'Explorer
      </button>
    </div>
  );
}
