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
import { cn } from '@/lib/utils';

/**
 * Barre de filtres actifs de l'Explorateur (impl. 3.2) : une pastille retirable
 * par condition active (terme de recherche compris) + « Tout effacer ». Dérivée
 * du store ; chaque pastille ne retire que SON filtre via le setter approprié.
 */
interface ExplorerActiveFiltersProps {
  /** Hook de store à piloter — défaut = singleton Explorer (Explorer & tests inchangés). */
  useStore?: typeof useExplorerStore;
}

export function ExplorerActiveFilters({ useStore = useExplorerStore }: ExplorerActiveFiltersProps = {}) {
  const common = useStore((s) => s.common);
  const selectedBuckets = useStore((s) => s.selectedBuckets);
  // D23 : les facettes par bucket alimentent désormais aussi la barre de chips.
  const hot = useStore((s) => s.hot);
  const res = useStore((s) => s.res);
  const iti = useStore((s) => s.iti);
  const setSearch = useStore((s) => s.setSearch);
  const toggleBucket = useStore((s) => s.toggleBucket);
  const setCities = useStore((s) => s.setCities);
  const setLieuDit = useStore((s) => s.setLieuDit);
  const setPmr = useStore((s) => s.setPmr);
  const setPetsAccepted = useStore((s) => s.setPetsAccepted);
  const setOpenNow = useStore((s) => s.setOpenNow);
  const setSustainable = useStore((s) => s.setSustainable);
  const toggleLabel = useStore((s) => s.toggleLabel);
  const toggleTag = useStore((s) => s.toggleTag);
  const toggleStatus = useStore((s) => s.toggleStatus);
  const setRankedLabelScheme = useStore((s) => s.setRankedLabelScheme);
  const setRankedLabelIncludeEquivalents = useStore((s) => s.setRankedLabelIncludeEquivalents);
  const setRankedLabelValueCodes = useStore((s) => s.setRankedLabelValueCodes);
  const resetAll = useStore((s) => s.resetAll);
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
    const snapshot = useStore.getState() as unknown as ExplorerFilters;
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
      case 'rankedLabelExact':
        setRankedLabelIncludeEquivalents(true);
        break;
      case 'rankedLabelValues':
        setRankedLabelValueCodes([]);
        break;
      // D23 — retraits des filtres jusqu'ici invisibles. Les chips « compteur »
      // (valeur '*') retirent l'ensemble de leur groupe via les toggles unitaires.
      case 'zone':
        useStore.getState().resetSpatialFilter();
        break;
      case 'environment':
        useStore.getState().setEnvironmentTags([]);
        break;
      case 'openAt':
        useStore.getState().setOpenAt(null);
        break;
      case 'amenityFamilies':
        useStore.getState().setAmenityFamilies([]);
        break;
      case 'evtDates':
        useStore.getState().setEvtEventRange(null, null);
        break;
      case 'accessDisability':
        useStore.getState().toggleAccessibilityDisabilityType(chip.value as AccessibilityDisabilityTypeCode);
        break;
      case 'accessAmenities':
        for (const code of useStore.getState().common.accessibilityAmenityCodesAny ?? []) {
          useStore.getState().toggleAccessibilityAmenity(code);
        }
        break;
      case 'sustCategories':
        for (const code of useStore.getState().common.sustainabilityCategoryCodesAny ?? []) {
          useStore.getState().toggleSustainabilityCategory(code);
        }
        break;
      case 'sustActions':
        for (const code of useStore.getState().common.sustainabilityActionCodesAny ?? []) {
          useStore.getState().toggleSustainabilityAction(code);
        }
        break;
      case 'taxonomy':
        for (const item of useStore.getState().common.taxonomyAny ?? []) {
          useStore.getState().toggleTaxonomy(item.domain, item.code);
        }
        break;
      case 'hotCapacity':
        useStore.getState().setHotCapacityFilter(chip.value, undefined, undefined);
        break;
      case 'resCapacity':
        useStore.getState().setResCapacityFilter(chip.value, undefined, undefined);
        break;
      case 'itiLoop':
        useStore.getState().setItiIsLoop(null);
        break;
      case 'itiDifficulty':
        useStore.getState().setItiDifficulty(undefined, undefined);
        break;
      case 'itiDistance':
        useStore.getState().setItiDistance(undefined, undefined);
        break;
      case 'itiDuration':
        useStore.getState().setItiDuration(undefined, undefined);
        break;
      case 'itiPractices':
        for (const code of useStore.getState().iti.practicesAny ?? []) {
          useStore.getState().toggleItiPractice(code);
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
          className={cn('active-filter-chip', 'motion-pop')}
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
