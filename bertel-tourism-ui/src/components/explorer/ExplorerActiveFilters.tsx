'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AccessibilityDisabilityTypeCode,
  ExplorerBucketKey,
  ExplorerFilters,
  ExplorerStatusFilter,
} from '../../types/domain';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';
import { useExplorerStore } from '../../store/explorer-store';
import { buildSearchParams } from '../../lib/explorer-search-params';
import { buildDynamicListFilters, createDynamicList } from '../../services/lists';
import { buildExplorerActiveChips, type ActiveChip } from './explorer-active-chips';

/**
 * Barre de filtres actifs de l'Explorateur (impl. 3.2) : une pastille retirable
 * par condition active (terme de recherche compris) + « Tout effacer ». Dérivée
 * du store ; chaque pastille ne retire que SON filtre via le setter approprié.
 */
export function ExplorerActiveFilters() {
  const common = useExplorerStore((s) => s.common);
  const selectedBuckets = useExplorerStore((s) => s.selectedBuckets);
  // D23 : les facettes par bucket alimentent désormais aussi la barre de chips.
  const hot = useExplorerStore((s) => s.hot);
  const res = useExplorerStore((s) => s.res);
  const iti = useExplorerStore((s) => s.iti);
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
  const router = useRouter();
  const [savingDynamic, setSavingDynamic] = useState(false);

  const filters: ExplorerFilters = { ...DEFAULT_EXPLORER_FILTERS, common, selectedBuckets, hot, res, iti };
  const chips = buildExplorerActiveChips(filters);

  if (chips.length === 0) {
    return null;
  }

  // « Liste dynamique » : les filtres actifs deviennent une liste re-résolue à chaque accès.
  // On snapshot l'état COMPLET du store (facettes par bucket incluses, absentes de `filters` ci-dessus)
  // pour bâtir le payload de résolution, dans la même forme que le moteur DB.
  const saveDynamic = async () => {
    if (savingDynamic) return;
    const snapshot = useExplorerStore.getState() as unknown as ExplorerFilters;
    const payload = buildDynamicListFilters(snapshot);
    if (payload.buckets.length === 0) return;
    setSavingDynamic(true);
    try {
      const url = `/explorer?${buildSearchParams(snapshot).toString()}`;
      const name = `Liste dynamique · ${chips.length} filtre${chips.length > 1 ? 's' : ''}`;
      const id = await createDynamicList(name, payload, url);
      router.push(`/listes/${id}`);
    } finally {
      setSavingDynamic(false);
    }
  };

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
      // D23 — retraits des filtres jusqu'ici invisibles. Les chips « compteur »
      // (valeur '*') retirent l'ensemble de leur groupe via les toggles unitaires.
      case 'zone':
        useExplorerStore.getState().resetSpatialFilter();
        break;
      case 'environment':
        useExplorerStore.getState().setEnvironmentTags([]);
        break;
      case 'accessDisability':
        useExplorerStore.getState().toggleAccessibilityDisabilityType(chip.value as AccessibilityDisabilityTypeCode);
        break;
      case 'accessAmenities':
        for (const code of useExplorerStore.getState().common.accessibilityAmenityCodesAny ?? []) {
          useExplorerStore.getState().toggleAccessibilityAmenity(code);
        }
        break;
      case 'sustCategories':
        for (const code of useExplorerStore.getState().common.sustainabilityCategoryCodesAny ?? []) {
          useExplorerStore.getState().toggleSustainabilityCategory(code);
        }
        break;
      case 'sustActions':
        for (const code of useExplorerStore.getState().common.sustainabilityActionCodesAny ?? []) {
          useExplorerStore.getState().toggleSustainabilityAction(code);
        }
        break;
      case 'hotTaxonomy':
        for (const item of useExplorerStore.getState().hot.taxonomy ?? []) {
          useExplorerStore.getState().toggleHotTaxonomy(item.domain, item.code);
        }
        break;
      case 'hotCapacity':
        useExplorerStore.getState().setHotCapacityFilter(chip.value, undefined, undefined);
        break;
      case 'resCapacity':
        useExplorerStore.getState().setResCapacityFilter(chip.value, undefined, undefined);
        break;
      case 'itiLoop':
        useExplorerStore.getState().setItiIsLoop(null);
        break;
      case 'itiDifficulty':
        useExplorerStore.getState().setItiDifficulty(undefined, undefined);
        break;
      case 'itiDistance':
        useExplorerStore.getState().setItiDistance(undefined, undefined);
        break;
      case 'itiDuration':
        useExplorerStore.getState().setItiDuration(undefined, undefined);
        break;
      case 'itiPractices':
        for (const code of useExplorerStore.getState().iti.practicesAny ?? []) {
          useExplorerStore.getState().toggleItiPractice(code);
        }
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
      <button
        type="button"
        className="ghost-button active-filter-strip__reset"
        disabled={savingDynamic}
        title="Transformer ces filtres en liste dynamique (mise à jour automatique)"
        onClick={() => void saveDynamic()}
      >
        {savingDynamic ? 'Création…' : '★ Liste dynamique'}
      </button>
      {chips.length > 1 ? (
        <button type="button" className="ghost-button active-filter-strip__reset" onClick={resetAll}>
          Tout effacer
        </button>
      ) : null}
    </div>
  );
}
