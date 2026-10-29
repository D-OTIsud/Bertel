'use client';

import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type {
  AccessibilityDisabilityTypeCode,
  ExplorerBucketKey,
  ExplorerFilters,
  ExplorerStatusFilter,
} from '../../types/domain';
import { DEFAULT_EXPLORER_FILTERS, EXPLORER_STATUS_OPTIONS } from '../../utils/facets';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { canCreateLists } from '../../store/session-selectors';
import { buildSearchParams } from '../../lib/explorer-search-params';
import { deriveExplorerFilterContext } from '../../lib/explorer-filter-context';
import type { DashboardPeriod } from '../../lib/dashboard-stats-params';
import { buildDynamicListFilters, createDynamicList, listsQueryKeys } from '../../services/lists';
import { buildExplorerActiveChips, type ActiveChip } from './explorer-active-chips';
import { cn } from '@/lib/utils';
import { queryClient } from '@/app/query-client';
import { ExplorerBridgeButton } from '../dashboard/ExplorerBridgeButton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ExplorerFilterPopover } from './ExplorerFilterPopover';
import './explorer-active-filters.css';
import { strictErrorMessage } from '../../lib/strict-error-message';

/**
 * Barre de filtres actifs de l'Explorateur (impl. 3.2) : une pastille retirable
 * par condition active (terme de recherche compris) + « Réinitialiser ». Dérivée
 * du store ; chaque pastille ne retire que SON filtre via le setter approprié.
 */
interface ExplorerActiveFiltersProps {
  /** Hook de store à piloter — défaut = singleton Explorer (Explorer & tests inchangés). */
  useStore?: typeof useExplorerStore;
  /**
   * Dashboard uniquement : garde la barre montée même sans puce active, pour que
   * le pont vers l'Explorateur reste toujours atteignable (arbitrage PO 2026-08-30).
   * L'Explorateur, lui, continue de masquer la barre vide.
   */
  showExplorerBridge?: boolean;
  contextPage?: 'explorer' | 'dashboard';
  period?: DashboardPeriod;
  onClearPeriod?: () => void;
  onReset?: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

export function ExplorerActiveFilters({
  useStore = useExplorerStore,
  showExplorerBridge = false,
  contextPage = showExplorerBridge ? 'dashboard' : 'explorer',
  period,
  onClearPeriod,
  onReset,
  returnFocusRef,
}: ExplorerActiveFiltersProps = {}) {
  const common = useStore((s) => s.common);
  const selectedBuckets = useStore((s) => s.selectedBuckets);
  // D23 : les facettes par bucket alimentent désormais aussi la barre de chips.
  const hot = useStore((s) => s.hot);
  const res = useStore((s) => s.res);
  const iti = useStore((s) => s.iti);
  // Sans ces deux-là, `filters` retombait sur les défauts et les sous-types VIS/SRV
  // rétrécis restaient invisibles dans la barre.
  const vis = useStore((s) => s.vis);
  const srv = useStore((s) => s.srv);
  const evt = useStore((s) => s.evt);
  const setSearch = useStore((s) => s.setSearch);
  const toggleBucket = useStore((s) => s.toggleBucket);
  const setCities = useStore((s) => s.setCities);
  const setLieuDit = useStore((s) => s.setLieuDit);
  const setPmr = useStore((s) => s.setPmr);
  const setPetsAccepted = useStore((s) => s.setPetsAccepted);
  const setOpenNow = useStore((s) => s.setOpenNow);
  const setSustainable = useStore((s) => s.setSustainable);
  const toggleTag = useStore((s) => s.toggleTag);
  const toggleStatus = useStore((s) => s.toggleStatus);
  const setRankedLabelScheme = useStore((s) => s.setRankedLabelScheme);
  const setRankedLabelIncludeEquivalents = useStore((s) => s.setRankedLabelIncludeEquivalents);
  const setRankedLabelValueCodes = useStore((s) => s.setRankedLabelValueCodes);
  const resetAll = useStore((s) => s.resetAll);
  const router = useRouter();
  const [savingDynamic, setSavingDynamic] = useState(false);
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  // Listes 2026-09-07 règle 1 — ouvert à tout membre connecté d'une organisation ; sans
  // organisation active, l'action est indisponible plutôt que d'échouer après coup.
  const canCreateDynamicList = useSessionStore(canCreateLists);
  const canEditObjects = useSessionStore((s) => s.canEditObjects);
  const scopeId = useId();
  const compactActions = useMediaQuery('(max-width: 767px)');
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const stripRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);

  const filters: ExplorerFilters = { ...DEFAULT_EXPLORER_FILTERS, common, selectedBuckets, hot, res, iti, vis, srv, evt };
  const chips = buildExplorerActiveChips(filters);
  const context = deriveExplorerFilterContext(filters, { page: contextPage, canEditObjects }, chips);
  const periodActive = Boolean(period?.updatedAtFrom || period?.updatedAtTo);
  const displayedChips = [...context.applied, ...context.memorized];
  useLayoutEffect(() => {
    if (pendingFocus.current == null) return;
    const next = displayedChips[Math.min(pendingFocus.current, displayedChips.length - 1)];
    pendingFocus.current = null;
    (next ? chipRefs.current.get(next.key) : returnFocusRef?.current ?? stripRef.current)?.focus();
  });

  if (chips.length === 0 && !periodActive && !showExplorerBridge) {
    return null;
  }

  // Le même instantané fournit le payload supporté et l'URL de contexte.
  const saveDynamic = async () => {
    if (savingDynamic || !canCreateDynamicList) return;
    const snapshot = useStore.getState() as unknown as ExplorerFilters;
    const effective = deriveExplorerFilterContext(snapshot, { page: contextPage, canEditObjects }, buildExplorerActiveChips(snapshot)).transferableFilters;
    const payload = buildDynamicListFilters(effective);
    if (payload.buckets.length === 0) return;
    setSavingDynamic(true);
    try {
      const url = `/explorer?${buildSearchParams(effective).toString()}`;
      const name = 'Liste dynamique · critères supportés';
      const id = await createDynamicList(name, payload, url);
      void queryClient.invalidateQueries({ queryKey: listsQueryKeys.myLists(orgId, userId) });
      router.push(`/listes/${id}`);
    } catch (e) {
      toast.error(strictErrorMessage(e, 'Création de la liste dynamique impossible.'));
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
      case 'tag':
        toggleTag({ slug: chip.value, name: chip.value });
        break;
      case 'status':
        toggleStatus(chip.value as ExplorerStatusFilter);
        break;
      // §204 — retrait UNITAIRE : on enlève la seule valeur cliquée, pas tout
      // le groupe. Une puce qui viderait ses voisines serait un piège.
      case 'missingEssentialsBuckets': {
        const state = useStore.getState();
        state.setMissingEssentialsBuckets(
          state.common.missingEssentialsBuckets.filter((code) => code !== chip.value),
        );
        break;
      }
      case 'missingEssentialsAny': {
        const state = useStore.getState();
        state.setMissingEssentialsAny(
          state.common.missingEssentialsAny.filter((code) => code !== chip.value),
        );
        break;
      }
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
      case 'accommodationUnitTypes':
        useStore.getState().setAccommodationUnitTypes([]);
        break;
      case 'accommodationPositionings':
        useStore.getState().setAccommodationPositionings([]);
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
      // Un set vide remet le bucket sur « tous ses types » (cf. setXxxSubtypes).
      case 'hotSubtypes':
        useStore.getState().setHotSubtypes([]);
        break;
      case 'visSubtypes':
        useStore.getState().setVisSubtypes([]);
        break;
      case 'srvSubtypes':
        useStore.getState().setSrvSubtypes([]);
        break;
      case 'meetingRoom':
        useStore.getState().setHotMeetingRoom({
          minCount: undefined,
          minAreaM2: undefined,
          minCapTheatre: undefined,
          minCapClassroom: undefined,
        });
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

  const renderChip = (chip: (typeof displayedChips)[number]) => {
    const partialNote = chip.application === 'partial'
      ? `partiellement appliqué · valeurs : ${chip.appliedValues.length} appliquée${chip.appliedValues.length > 1 ? 's' : ''}, ${chip.memorizedValues.length} mémorisée${chip.memorizedValues.length > 1 ? 's' : ''}`
      : '';
    const scopeNote = chip.application === 'memorized'
      ? ' — valeur mémorisée, non appliquée à cette vue'
      : partialNote ? ` — ${partialNote}` : '';
    return (
      <button
        key={chip.key}
        ref={(node) => {
          if (node) chipRefs.current.set(chip.key, node);
          else chipRefs.current.delete(chip.key);
        }}
        type="button"
        className={cn('active-filter-chip', 'motion-pop',
          chip.application === 'memorized' && 'active-filter-chip--memorized',
          chip.application === 'partial' && 'active-filter-chip--partial')}
        onClick={() => {
          pendingFocus.current = displayedChips.findIndex((entry) => entry.key === chip.key);
          remove(chip);
        }}
        title={chip.reason}
        aria-label={`Retirer le filtre : ${chip.label}${scopeNote}${chip.removalScope === 'group' ? ' — retire tout le groupe' : ''}`}
      >
        {chip.label}{partialNote ? ` · ${partialNote}` : ''} ✕
      </button>
    );
  };

  const dynamicScope = 'Liste dynamique : critères appliqués supportés ; période et statut de publication non transmis.';
  const bridgeScope = 'Vers Explorer : critères appliqués supportés et statut effectif ; période et valeurs mémorisées non transmises.';
  const hasDynamicAction = chips.length > 0 && canCreateDynamicList;
  const hasResetAction = chips.length > 0 || periodActive;
  const actionScope = <>
    {hasDynamicAction && <p>{dynamicScope}</p>}
    {showExplorerBridge && <p>{bridgeScope}</p>}
  </>;
  const scopeInfo = (hasDynamicAction || showExplorerBridge) && (
    <ExplorerFilterPopover label="Informations sur les actions des critères">
      {actionScope}
    </ExplorerFilterPopover>
  );
  const actionButtons = (
    <>
      {hasDynamicAction && (
        <button
          type="button"
          className="ghost-button active-filter-strip__reset"
          disabled={savingDynamic}
          title="Créer une liste à partir des critères appliqués supportés"
          aria-describedby={scopeId}
          onClick={() => void saveDynamic()}
        >
          {savingDynamic ? 'Création…' : '★ Liste dynamique'}
        </button>
      )}
      {!compactActions && scopeInfo}
      {hasResetAction && (
        <button type="button" className="ghost-button active-filter-strip__reset" onClick={() => { pendingFocus.current = 0; (onReset ?? resetAll)(); }}>
          Réinitialiser
        </button>
      )}
      {showExplorerBridge && <ExplorerBridgeButton />}
      {compactActions && (hasDynamicAction || showExplorerBridge) && (
        <div className="explorer-filter-popover__scope">{actionScope}</div>
      )}
    </>
  );

  return (
    <div ref={stripRef} tabIndex={-1} className="active-filter-strip explorer-active-filters" role="region" aria-label="Filtres actifs">
      <div className="explorer-active-filters__scroll">
        <div className="explorer-active-filters__applied">
          <span className="explorer-active-filters__label">
            Critères<span className="sr-only"> appliqués</span> · {context.applied.length + (periodActive ? 1 : 0)}
          </span>
          {context.applied.map(renderChip)}
          {contextPage === 'dashboard' && !context.applied.some((chip) => chip.group === 'status') && (
            <span className="active-filter-strip__empty">
              Statut appliqué : {context.effectiveStatuses.map((code) => EXPLORER_STATUS_OPTIONS.find((option) => option.code === code)?.label ?? code).join(', ')}
            </span>
          )}
          {periodActive && <button type="button" className="active-filter-chip" onClick={() => { pendingFocus.current = 0; onClearPeriod?.(); }} aria-label="Retirer le filtre : Fiches mises à jour">
            Fiches mises à jour · {period?.updatedAtFrom ?? 'début'} → {period?.updatedAtTo ?? 'aujourd’hui'} ✕
          </button>}
        </div>
        {context.memorized.length > 0 && <div className="explorer-active-filters__memorized">
          <span className="explorer-active-filters__label" title="Valeurs mémorisées — non appliquées à cette vue">Mémorisés · {context.memorized.length}</span>
          {context.memorized.map(renderChip)}
        </div>}
      </div>
      {hasDynamicAction && <span id={scopeId} className="sr-only">{dynamicScope}</span>}
      <div className="explorer-active-filters__actions">
        {compactActions
          ? <ExplorerFilterPopover label="Actions sur les critères" actions>{actionButtons}</ExplorerFilterPopover>
          : actionButtons}
      </div>
    </div>
  );
}
