'use client';

import type { ExplorerBucketKey, ExplorerFilters, ExplorerStatusFilter } from '../../types/domain';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';
import { useExplorerStore } from '../../store/explorer-store';
import { buildExplorerActiveChips, type ActiveChip } from './explorer-active-chips';

/**
 * Barre de filtres actifs de l'Explorateur (impl. 3.2) : une pastille retirable
 * par condition active (terme de recherche compris) + « Tout effacer ». Dérivée
 * du store ; chaque pastille ne retire que SON filtre via le setter approprié.
 */
export function ExplorerActiveFilters() {
  const common = useExplorerStore((s) => s.common);
  const selectedBuckets = useExplorerStore((s) => s.selectedBuckets);
  const setSearch = useExplorerStore((s) => s.setSearch);
  const toggleBucket = useExplorerStore((s) => s.toggleBucket);
  const setCities = useExplorerStore((s) => s.setCities);
  const setLieuDit = useExplorerStore((s) => s.setLieuDit);
  const setPmr = useExplorerStore((s) => s.setPmr);
  const setPetsAccepted = useExplorerStore((s) => s.setPetsAccepted);
  const setOpenNow = useExplorerStore((s) => s.setOpenNow);
  const setSustainable = useExplorerStore((s) => s.setSustainable);
  const toggleLabel = useExplorerStore((s) => s.toggleLabel);
  const toggleTag = useExplorerStore((s) => s.toggleTag);
  const toggleStatus = useExplorerStore((s) => s.toggleStatus);
  const setRankedLabelScheme = useExplorerStore((s) => s.setRankedLabelScheme);
  const resetAll = useExplorerStore((s) => s.resetAll);

  const filters: ExplorerFilters = { ...DEFAULT_EXPLORER_FILTERS, common, selectedBuckets };
  const chips = buildExplorerActiveChips(filters);

  if (chips.length === 0) {
    return null;
  }

  const remove = (chip: ActiveChip) => {
    switch (chip.group) {
      case 'search':
        setSearch('');
        break;
      case 'bucket':
        toggleBucket(chip.value as ExplorerBucketKey);
        break;
      case 'city':
        setCities((common.cities ?? []).filter((city) => city !== chip.value));
        break;
      case 'lieuDit':
        setLieuDit('');
        break;
      case 'pmr':
        setPmr(false);
        break;
      case 'pets':
        setPetsAccepted(false);
        break;
      case 'openNow':
        setOpenNow(false);
        break;
      case 'sustainable':
        setSustainable(false);
        break;
      case 'label':
        toggleLabel(chip.value);
        break;
      case 'tag':
        toggleTag({ slug: chip.value, name: chip.value });
        break;
      case 'status':
        toggleStatus(chip.value as ExplorerStatusFilter);
        break;
      case 'rankedLabel':
        setRankedLabelScheme(null);
        break;
    }
  };

  return (
    <div className="active-filter-strip explorer-active-filters" role="region" aria-label="Filtres actifs">
      <span className="explorer-active-filters__label">Filtres actifs</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="active-filter-chip"
          onClick={() => remove(chip)}
          aria-label={`Retirer le filtre : ${chip.label}`}
        >
          {chip.label} ✕
        </button>
      ))}
      {chips.length > 1 ? (
        <button type="button" className="ghost-button active-filter-strip__reset" onClick={resetAll}>
          Tout effacer
        </button>
      ) : null}
    </div>
  );
}
