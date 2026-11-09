'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Layers, Pause, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FiltersPanel } from '../../components/explorer/FiltersPanel';
import { buildExplorerActiveChips } from '../../components/explorer/explorer-active-chips';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { createExplorerStore, type ExplorerState } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { isPlatformSuperuser } from '../../store/session-selectors';
import { listOrgs } from '../../services/orgs';
import { listExplorerReferences } from '../../services/explorer-reference';
import { ensureReferenceCatalogs } from '../../hooks/useReferenceCatalogsQuery';
import { createPartnerSelection, getPartnerSelectionAdmin, listPartnerSelections, previewPartnerSelection, setPartnerSelectionState, updatePartnerSelection,
  type PartnerSelectionAdmin, type PartnerSelectionPreview } from '../../services/partner-selection-admin';
import type { ExplorerFilters, ExplorerReferences } from '../../types/domain';
import { EXPLORER_BUCKET_OPTIONS, EXPLORER_BUCKET_TYPE_MAP, normalizeExplorerFilters } from '../../utils/facets';
import { resolveSchemeLabel, resolveTypeLabel } from '../../utils/labels';
import { buildBucketRpcFilters } from '../../utils/facets';
import { activeCommonGroups, copy, effectiveBranchTypes, emptyFilters, newBranch, newSelectionDraft, openSelectionDraft, sameDefinition, selectionInput,
  type CommonGroup, type SelectionBranch, type SelectionDraft } from './editor-model';

const GROUP_NAMES: Record<CommonGroup, string> = { search: 'Recherche', city: 'Communes', lieuDit: 'Lieu-dit', label: 'Label ou classement',
  accessibility: 'Accessibilité', sustainability: 'Démarche durable', pets: 'Animaux', opening: 'Ouverture', environment: 'Cadre', amenities: 'Équipements', tags: 'Tags' };
const snapshot = (state: ExplorerState): ExplorerFilters => normalizeExplorerFilters({ selectedBuckets: state.selectedBuckets,
  common: copy(state.common), hot: copy(state.hot), res: copy(state.res), iti: copy(state.iti), evt: copy(state.evt), vis: copy(state.vis), srv: copy(state.srv) });
const message = (error: unknown) => error instanceof Error ? error.message : 'Une erreur est survenue. Réessayez.';
const branchName = (branch: SelectionBranch) => EXPLORER_BUCKET_OPTIONS.find((option) => option.code === branch.bucket)?.label ?? branch.bucket;

/** This hook creates a private store; it never reads/writes the Explorer singleton. */
function LocalFilters({ initial, references, scope, locked = [], onChange }: {
  initial: ExplorerFilters; references: ExplorerReferences; scope: 'common' | 'branch'; locked?: CommonGroup[];
  onChange: (filters: ExplorerFilters) => void;
}) {
  const [useStore] = useState(() => { const store = createExplorerStore(); store.getState().replaceFiltersFromUrl(copy(initial)); return store; });
  const [visibleGroups, setVisibleGroups] = useState<string[]>(() => {
    const common = activeCommonGroups(initial);
    const payload = buildBucketRpcFilters(initial, initial.selectedBuckets[0] ?? 'RES');
    const specific = ['taxonomy_any', 'capacity_filters', 'meeting_room', 'itinerary', 'event', 'cuisine_types_any', 'accommodation_unit_types_any', 'accommodation_positionings_any'].some((key) => key in payload)
      || ['HOT', 'VIS', 'SRV'].some((bucket) => initial.selectedBuckets.includes(bucket as SelectionBranch['bucket']) && effectiveBranchTypes({ bucket: bucket as SelectionBranch['bucket'], filters: initial, types: [], id: '' }).length < EXPLORER_BUCKET_TYPE_MAP[bucket as SelectionBranch['bucket']].length);
    return [...common, ...(scope === 'branch' && specific ? ['specific'] : [])];
  });
  const callback = useRef(onChange); callback.current = onChange;
  useEffect(() => useStore.subscribe((state, previous) => {
    const next = snapshot(state);
    if (!sameDefinition(next, snapshot(previous))) callback.current(next);
  }), [useStore]);
  const search = useStore((state) => state.common.search);
  const state = useStore((state) => state);
  const current = snapshot(state);
  const chipGroups: Record<string, CommonGroup> = { city: 'city', lieuDit: 'lieuDit', search: 'search', rankedLabel: 'label', rankedLabelExact: 'label', rankedLabelValues: 'label', pmr: 'accessibility', accessDisability: 'accessibility', accessAmenities: 'accessibility', sustainable: 'sustainability', sustCategories: 'sustainability', sustActions: 'sustainability', pets: 'pets', openNow: 'opening', openAt: 'opening', environment: 'environment', amenityFamilies: 'amenities', tag: 'tags' };
  const chips = buildExplorerActiveChips(current).filter((chip) => !['bucket', 'status', 'providerOnly'].includes(chip.group) && !locked.includes(chipGroups[chip.group]));
  const chipLabel = (chip: typeof chips[number]) => {
    if (chip.group === 'taxonomy') return current.common.taxonomyAny.map((term) => references.taxonomies?.find((domain) => domain.domain === term.domain)?.nodes.find((node) => node.code === term.code)?.name ?? 'Sous-catégorie sélectionnée').join(', ');
    if (chip.group.endsWith('Subtypes')) return effectiveBranchTypes({ id: '', bucket: initial.selectedBuckets[0], filters: current, types: [], }).map(resolveTypeLabel).join(', ');
    return chip.label;
  };
  const reset = () => {
    const next = emptyFilters(initial.selectedBuckets);
    if (scope === 'branch') {
      next.hot.subtypes = [...initial.hot.subtypes]; next.vis.subtypes = [...initial.vis.subtypes]; next.srv.subtypes = [...initial.srv.subtypes];
    }
    useStore.getState().replaceFiltersFromUrl(next);
    setVisibleGroups([]);
  };
  const choices = [...Object.entries(GROUP_NAMES), ...(scope === 'branch' ? [['specific', 'Nature et caractéristiques du type de fiche']] : [])]
    .filter(([key]) => !visibleGroups.includes(key) && !locked.includes(key as CommonGroup));
  return <div className="partner-selections__filters">
    {chips.length > 0 && <ul className="partner-selections__criteria-summary" aria-label="Critères actifs">{chips.map((chip) => <li key={chip.key}>{chipLabel(chip)}</li>)}</ul>}
    <details className="partner-selections__criteria-editor"><summary><Plus size={14} aria-hidden />Ajouter ou modifier des critères</summary>
    {visibleGroups.includes('search') && !locked.includes('search') && <label className="partner-selections__search-field"><Search size={16} aria-hidden />
      <span className="sr-only">Recherche dans les fiches {scope === 'common' ? 'commune à tous les blocs' : 'de ce bloc'}</span>
      <input type="search" value={search} placeholder="Rechercher dans les fiches" onChange={(event) => useStore.getState().setSearch(event.target.value)} />
    </label>}
    {visibleGroups.some((group) => group !== 'search' && !locked.includes(group as CommonGroup)) && <FiltersPanel references={references} useStore={useStore} selectionScope={scope} lockedCommonGroups={locked} visibleSelectionGroups={visibleGroups}
      typeSpecificFacets={scope === 'branch' && visibleGroups.includes('specific')} includeArchivedStatus={false} onReset={reset} />}
    {choices.length > 0 && <label className="partner-selections__add-criterion"><Plus size={14} aria-hidden /><span className="sr-only">Ajouter un critère {scope === 'common' ? 'commun' : 'dans ce bloc'}</span><select value="" onChange={(event) => { const group = event.target.value; if (group) setVisibleGroups((groups) => [...groups, group]); }}><option value="">Ajouter un critère</option>{choices.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
    </details>
  </div>;
}

let activeCountReads = 0;
const countQueue: Array<() => void> = [];
async function limitedCountRead<T,>(work: () => Promise<T>): Promise<T> {
  if (activeCountReads >= 3) await new Promise<void>((resolve) => countQueue.push(resolve));
  else activeCountReads += 1;
  try { return await work(); } finally { const next = countQueue.shift(); if (next) next(); else activeCountReads -= 1; }
}
function SelectionVolume({ selection, identity }: { selection: PartnerSelectionAdmin; identity: string }) {
  const count = useQuery({ queryKey: ['partner-selection-volume', identity, selection.orgObjectId, selection.id, selection.revision],
    queryFn: ({ signal }) => limitedCountRead(async () => {
      if (signal.aborted) throw new Error('Lecture annulée.');
      return (await previewPartnerSelection({ name: selection.name, orgObjectId: selection.orgObjectId, buckets: selection.buckets, communeInsee: selection.communeInsee }, { pageSize: 1, signal })).meta.total;
    }), staleTime: 30_000, retry: false, meta: { persist: false } });
  return <div className="partner-selections__volume" aria-label={`Volume de ${selection.name}`}>
    {count.isPending ? <span role="status">Calcul…</span> : count.isError ? <button type="button" title="Volume indisponible : réessayer" onClick={() => void count.refetch()}>Indisponible</button> : <><strong>{count.data.toLocaleString('fr-FR')}</strong><span>fiche{count.data > 1 ? 's' : ''}</span></>}
  </div>;
}
function selectionSummary(selection: PartnerSelectionAdmin, references?: ExplorerReferences): string {
  const types = [...new Set(selection.buckets.flatMap((bucket) => bucket.types))].map(resolveTypeLabel);
  const details: string[] = [];
  if (selection.communeInsee !== null) details.push(`${selection.communeInsee.length} commune${selection.communeInsee.length > 1 ? 's' : ''}`);
  for (const bucket of selection.buckets) {
    const f = bucket.filters ?? {};
    if (f.pet_accepted) details.push('Animaux acceptés');
    if (Array.isArray(f.city_any)) details.push(...f.city_any.map(String));
    if (typeof f.label_scheme_ranked === 'string') details.push(resolveSchemeLabel(f.label_scheme_ranked));
    if (Array.isArray(f.taxonomy_any)) for (const term of f.taxonomy_any as Array<{ domain: string; code: string }>) {
      const label = references?.taxonomies?.find((item) => item.domain === term.domain)?.nodes.find((node) => node.code === term.code)?.name;
      if (label) details.push(label);
    }
    if (f.itinerary) details.push('Pratiques ou parcours ciblés');
    if (f.event) details.push('Période choisie');
    if (f.capacity_filters) details.push('Capacité ciblée');
    if (f.cuisine_types_any) details.push('Types de cuisine choisis');
  }
  return [...types, ...new Set(details)].join(' · ');
}

function StatePill({ state }: { state: PartnerSelectionAdmin['state'] }) {
  return <span className={`partner-selections__pill ${state === 'active' ? 'is-active' : 'is-suspended'}`}>
    {state === 'active' ? <Check size={12} aria-hidden /> : <Pause size={12} aria-hidden />}{state === 'active' ? 'Active' : 'Suspendue'}
  </span>;
}
async function copyIdentifier(id: string) {
  try { await navigator.clipboard.writeText(id); toast.success('Identifiant copié.'); }
  catch { toast.error('Copie impossible. Sélectionnez l’identifiant pour le copier.'); }
}

export function PartnerSelectionsSettings({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const role = useSessionStore((state) => state.role);
  const adminRank = useSessionStore((state) => state.adminRank);
  const orgId = useSessionStore((state) => state.orgId);
  const userId = useSessionStore((state) => state.userId);
  const demoMode = useSessionStore((state) => state.demoMode);
  const platform = isPlatformSuperuser({ role });
  if (!platform && (!(adminRank != null && adminRank >= 30) || !orgId)) return <section className="settings-pane partner-selections"><h2>Réservé aux administrateurs</h2><p>Les sélections partenaires sont gérées par les administrateurs de votre organisation.</p></section>;
  if (demoMode) return <section className="settings-pane partner-selections"><h2>Sélections partenaires</h2><p>Connectez-vous à Bertel pour gérer les sélections réelles de votre organisation.</p></section>;
  return <SelectionWorkspace key={`${userId}:${role}:${adminRank}:${orgId}`} platform={platform} currentOrgId={orgId} onDirtyChange={onDirtyChange} />;
}

function SelectionWorkspace({ platform, currentOrgId, onDirtyChange }: {
  platform: boolean; currentOrgId: string | null; onDirtyChange?: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const isTestRealm = useSessionStore((state) => state.isTestRealm);
  const [orgId, setOrgId] = useState(currentOrgId ?? '');
  const orgName = useSessionStore((state) => state.orgName);
  const [items, setItems] = useState<PartnerSelectionAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [preview, setPreview] = useState<PartnerSelectionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [mobileTab, setMobileTab] = useState<'criteria' | 'preview'>('criteria');
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const previewSequence = useRef(0);
  const actionLock = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const listHeading = useRef<HTMLHeadingElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const dirty = !!draft && (draft.filtersChanged || draft.name !== draft.original?.name);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const orgs = useQuery({ queryKey: ['partner-selection-orgs'], queryFn: listOrgs, enabled: platform, staleTime: 60_000, meta: { persist: false } });
  const catalogs = useQuery({ queryKey: ['partner-selection-editor-catalogs', userId, orgId, isTestRealm], enabled: !!orgId,
    queryFn: async () => {
      const [references, catalogs] = await Promise.all([listExplorerReferences(), ensureReferenceCatalogs(queryClient)]);
      return { references, communes: (catalogs.tables.ref_commune ?? []).map((row) => ({ code: String(row.insee_code), name: String(row.name) })) };
    }, staleTime: 60_000, meta: { persist: false } });
  const allTypes = draft?.branches.flatMap(effectiveBranchTypes) ?? [];
  const commonReferences = catalogs.data ? { ...catalogs.data.references,
    rankedLabelSchemes: catalogs.data.references.rankedLabelSchemes.filter((option) => !option.objectTypes?.length || allTypes.every((type) => option.objectTypes!.includes(type))) } : undefined;
  const labelIncompatible = !!draft?.common.common.rankedLabelSchemeCode && !!catalogs.data && !commonReferences?.rankedLabelSchemes.some((option) => option.code === draft.common.common.rankedLabelSchemeCode);
  const load = useCallback(async () => {
    if (!orgId) { setItems([]); return; }
    const sequence = ++loadSequence.current; setLoading(true); setError(null);
    try { const rows = await listPartnerSelections(orgId); if (mounted.current && sequence === loadSequence.current) setItems(rows); }
    catch (error) { if (mounted.current && sequence === loadSequence.current) setError(message(error)); }
    finally { if (mounted.current && sequence === loadSequence.current) setLoading(false); }
  }, [orgId]);
  useEffect(() => { setItems([]); setDraft(null); setQuery(''); void load(); return () => { loadSequence.current += 1; }; }, [load]);
  useEffect(() => { if (draft) nameRef.current?.focus(); }, [editorKey, !!draft]);
  const previewInput = useMemo(() => {
    if (!draft || !orgId || labelIncompatible) return null;
    try { return selectionInput(draft, orgId); } catch { return null; }
  }, [draft, orgId, labelIncompatible]);
  const previewSignature = JSON.stringify(previewInput ? { buckets: previewInput.buckets, communeInsee: previewInput.communeInsee, orgId } : null);
  useEffect(() => {
    const sequence = ++previewSequence.current; const controller = new AbortController();
    setPreview(null); setPreviewError(null); setPreviewQuery('');
    if (!previewInput) { setPreviewLoading(false); return; }
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void previewPartnerSelection(previewInput, { signal: controller.signal }).then((result) => {
        if (mounted.current && sequence === previewSequence.current) setPreview(result);
      }).catch((error: unknown) => { if (!controller.signal.aborted && mounted.current && sequence === previewSequence.current) setPreviewError(message(error)); })
        .finally(() => { if (mounted.current && sequence === previewSequence.current) setPreviewLoading(false); });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // Names do not change membership. The stable signature owns cancellation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSignature, previewRetry]);
  const closeEditor = () => { setDraft(null); setSaveError(null); setConflict(false); setConfirmReload(false); setReloadError(null); setDiscard(false); window.setTimeout(() => { if (opener.current?.isConnected) opener.current.focus(); else listHeading.current?.focus(); }, 0); };
  const startEditor = (selection?: PartnerSelectionAdmin, button?: HTMLButtonElement) => {
    opener.current = button ?? null; setDraft(selection ? openSelectionDraft(selection) : newSelectionDraft());
    setSaveError(null); setConflict(false); setConfirmReload(false); setReloadError(null); setEditorKey((key) => key + 1); setMobileTab('criteria');
  };
  const changeDraft = (next: SelectionDraft) => { setDraft(next); setSaveError(null); };
  const changeCommon = (filters: ExplorerFilters) => {
    if (!draft) return;
    const geographyChanged = !sameDefinition(filters.common.cities, draft.common.common.cities);
    changeDraft({ ...draft, common: filters, filtersChanged: true, ...(geographyChanged ? { communeInsee: null } : {}) });
  };
  const changeBranch = (id: string, filters: ExplorerFilters) => {
    if (!draft) return;
    const previous = draft.branches.find((branch) => branch.id === id);
    const geographyChanged = !sameDefinition(previous?.filters.common.cities, filters.common.cities);
    changeDraft({ ...draft, filtersChanged: true, ...(geographyChanged ? { communeInsee: null } : {}),
      branches: draft.branches.map((branch) => branch.id === id ? { ...branch, filters } : branch) });
  };
  const save = async () => {
    if (!draft || actionLock.current) return;
    if (labelIncompatible) { setSaveError('Le label commun doit s’appliquer à tous les types de fiches.'); return; }
    if (!draft.name.trim()) { setSaveError('Donnez un nom à cette sélection.'); nameRef.current?.focus(); return; }
    actionLock.current = true; setBusy(true); setSaveError(null);
    try {
      const input = selectionInput(draft, orgId);
      const saved = draft.original ? await updatePartnerSelection(draft.original.id, draft.original.revision, input) : await createPartnerSelection(input);
      if (!mounted.current) return;
      setItems((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      setDraft(openSelectionDraft(saved)); setConflict(false); setEditorKey((key) => key + 1); toast.success('Sélection enregistrée.');
    } catch (error) { if (mounted.current) { setSaveError(message(error)); if (message(error).includes('La sélection a changé.')) setConflict(true); } }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  };
  const toggleState = async (selection: PartnerSelectionAdmin) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setSaveError(null);
    try {
      const saved = await setPartnerSelectionState(selection.id, selection.revision, selection.state === 'active' ? 'suspended' : 'active');
      if (!mounted.current) return;
      setItems((rows) => rows.map((row) => row.id === saved.id ? saved : row));
      setDraft((current) => current?.original?.id === saved.id ? { ...current, original: saved } : current);
      toast.success(saved.state === 'active' ? 'Sélection réactivée.' : 'Sélection suspendue.');
    } catch (error) { if (mounted.current) { setSaveError(message(error)); if (message(error).includes('La sélection a changé.')) setConflict(true); toast.error(message(error)); } }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  };
  const reloadVersion = async () => {
    if (!draft?.original || actionLock.current) return;
    actionLock.current = true; setBusy(true); setReloadError(null);
    try {
      const latest = await getPartnerSelectionAdmin(draft.original.id);
      if (!mounted.current) return;
      setItems((rows) => rows.map((row) => row.id === latest.id ? latest : row));
      setDraft(openSelectionDraft(latest)); setEditorKey((key) => key + 1);
      setConflict(false); setSaveError(null); setConfirmReload(false); toast.success('Version enregistrée rechargée.');
    } catch (error) { if (mounted.current) setReloadError(message(error)); }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  };
  const morePreview = async () => {
    if (!previewInput || !preview?.meta.next_cursor || previewLoading) return;
    const sequence = previewSequence.current; setPreviewLoading(true); setPreviewError(null);
    try {
      const page = await previewPartnerSelection(previewInput, { cursor: preview.meta.next_cursor });
      if (mounted.current && sequence === previewSequence.current) setPreview((current) => current ? { meta: page.meta, data: [...current.data, ...page.data] } : page);
    } catch (error) { if (mounted.current && sequence === previewSequence.current) setPreviewError(message(error)); }
    finally { if (mounted.current && sequence === previewSequence.current) setPreviewLoading(false); }
  };
  const commonGroups: CommonGroup[] = draft ? [...new Set([...activeCommonGroups(draft.common), ...(draft.communeInsee !== null ? ['city' as const] : [])])] : [];
  const shown = items.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const targetName = orgs.data?.find((org) => org.id === orgId)?.name ?? orgName ?? 'votre organisation';
  const loadedTypes = [...(preview?.data ?? []).reduce((counts, card) => {
    const type = typeof card.type === 'string' ? card.type : '';
    counts.set(type, (counts.get(type) ?? 0) + 1); return counts;
  }, new Map<string, number>())];
  return <section className="settings-pane partner-selections" aria-labelledby="partner-selections-heading">
    {!draft ? <>
      <header className="partner-selections__head"><span className="partner-selections__head-icon"><Layers size={23} aria-hidden /></span><div>
        <p className="partner-selections__eyebrow">Mon organisation{!platform ? ` · ${targetName}` : ''}</p><h2 id="partner-selections-heading" ref={listHeading} tabIndex={-1}>Sélections partenaires</h2>
        <p>Des ensembles de fiches qui se mettent à jour selon vos critères, à transmettre aux partenaires par leur identifiant.</p></div>
        <div className="partner-selections__actions">{platform && <label>Organisation<select aria-label="Organisation des sélections" value={orgId} onChange={(event) => setOrgId(event.target.value)} disabled={orgs.isPending}>
          <option value="">Choisir une organisation</option>{orgs.data?.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select></label>}<button className="primary-button" type="button" disabled={!orgId || busy} onClick={(event) => startEditor(undefined, event.currentTarget)}><Plus size={16} aria-hidden />Nouvelle sélection</button></div>
      </header>
      {orgs.isError && <p role="alert" className="inline-alert inline-alert--danger">Organisations indisponibles. <button type="button" onClick={() => void orgs.refetch()}>Réessayer</button></p>}
      {!orgId ? <div className="partner-selections__empty"><Layers size={28} aria-hidden /><h3>Choisissez une organisation</h3><p>Ses sélections et leur état apparaîtront ici.</p></div>
        : loading ? <div className="partner-selections__empty" role="status">Chargement des sélections…</div>
        : error ? <div className="partner-selections__empty" role="alert"><h3>Impossible de charger les sélections</h3><p>{error}</p><button type="button" className="ghost-button" onClick={() => void load()}><RefreshCw size={15} aria-hidden />Réessayer</button></div>
        : <><div className="partner-selections__toolbar"><label className="partner-selections__search-field"><Search size={16} aria-hidden /><span className="sr-only">Rechercher une sélection par nom ou identifiant</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une sélection" /></label><span>{shown.length} sélection{shown.length > 1 ? 's' : ''}</span></div>
          {!shown.length ? <div className="partner-selections__empty"><Layers size={28} aria-hidden /><h3>{items.length ? 'Aucun résultat' : 'Aucune sélection pour cette organisation'}</h3><p>{items.length ? 'Essayez un autre nom ou identifiant.' : 'Créez une première sélection en choisissant des types de fiches et des critères.'}</p></div>
            : <ul className="partner-selections__rows">{shown.map((item) => <li key={item.id} className="partner-selections__row"><div><button type="button" className="partner-selections__row-name" onClick={(event) => startEditor(item, event.currentTarget)}>{item.name}</button><p>{selectionSummary(item, catalogs.data?.references)}</p></div><SelectionVolume selection={item} identity={`${userId}:${orgId}:${isTestRealm}`} />
              <div className="partner-selections__id"><code>{item.id}</code><button type="button" className="partner-selections__icon" onClick={() => void copyIdentifier(item.id)} aria-label={`Copier l’identifiant ${item.id}`}><Copy size={15} aria-hidden /></button></div><StatePill state={item.state} />
              <div className="partner-selections__row-actions"><button type="button" className="ghost-button" onClick={(event) => startEditor(item, event.currentTarget)} aria-label={`Modifier ${item.name}`}>Modifier</button><button type="button" className="ghost-button" disabled={busy} onClick={() => void toggleState(item)} aria-label={`${item.state === 'active' ? 'Suspendre' : 'Réactiver'} ${item.name}`}>{item.state === 'active' ? 'Suspendre' : 'Réactiver'}</button></div></li>)}</ul>}
        </>}
    </> : <div className="partner-selections__editor" data-mobile-tab={mobileTab}><h2 id="partner-selections-heading" className="sr-only">Éditer une sélection partenaire</h2>
      <div className="partner-selections__editor-top"><button type="button" className="partner-selections__back" disabled={busy} onClick={() => dirty ? setDiscard(true) : closeEditor()}><ArrowLeft size={15} aria-hidden />Sélections partenaires</button>
        <div className="partner-selections__editor-title"><label><span className="sr-only">Nom de la sélection</span><input ref={nameRef} value={draft.name} maxLength={160} placeholder="Nom de la sélection" disabled={busy} onChange={(event) => changeDraft({ ...draft, name: event.target.value })} aria-invalid={!!saveError && !draft.name.trim()} /></label>
          {draft.original && <><StatePill state={draft.original.state} /><button className="ghost-button" type="button" disabled={busy} onClick={() => void toggleState(draft.original!)}>{draft.original.state === 'active' ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}{draft.original.state === 'active' ? 'Suspendre' : 'Réactiver'}</button></>}</div>
        <div className="partner-selections__id">{draft.original ? <>Identifiant <code>{draft.original.id}</code><button type="button" className="partner-selections__icon" onClick={() => void copyIdentifier(draft.original!.id)} aria-label={`Copier l’identifiant ${draft.original.id}`}><Copy size={14} aria-hidden /></button><span>reste identique après modification</span></> : <span>L’identifiant sera attribué à l’enregistrement.</span>}</div>
      </div>
      <div className="partner-selections__tabs"><button type="button" aria-pressed={mobileTab === 'criteria'} onClick={() => setMobileTab('criteria')}>Critères</button><button type="button" aria-pressed={mobileTab === 'preview'} onClick={() => setMobileTab('preview')}>Aperçu{preview ? ` · ${preview.meta.total}` : ''}</button></div>
      <div className="partner-selections__editor-grid"><fieldset className="partner-selections__composition" disabled={busy} key={editorKey}><legend className="sr-only">Composition de la sélection</legend><h3>Fiches à inclure</h3>
        {draft.lockedReason ? <div className="inline-alert" role="status"><p>{draft.lockedReason}</p><p>{draft.original ? selectionSummary(draft.original, catalogs.data?.references) : ''}</p><p>Les conditions avancées restent enregistrées avec cette sélection.</p></div>
          : <>
            {draft.branches.map((branch, index) => <div key={branch.id}>{index > 0 && <div className="partner-selections__joint"><span>ou</span></div>}<section className="partner-selections__block" aria-label={`Bloc ${index + 1} ${branchName(branch)}`}><header><span className="partner-selections__type-icon"><Layers size={16} aria-hidden /></span><h4>{branchName(branch)}</h4><button type="button" className="partner-selections__icon" aria-label={`Retirer le bloc ${index + 1} ${branchName(branch)}`} onClick={() => changeDraft({ ...draft, branches: draft.branches.filter((item) => item.id !== branch.id), filtersChanged: true })}><Trash2 size={15} aria-hidden /></button></header>
              {branch.onlyWithoutPractices && <p className="partner-selections__note">Repli : inclut uniquement les itinéraires sans pratique renseignée.</p>}
              {commonGroups.length > 0 && <p className="partner-selections__note">Géré dans les critères communs : {commonGroups.map((group) => GROUP_NAMES[group]).join(', ')}.</p>}
              {catalogs.data ? <LocalFilters initial={branch.filters} references={catalogs.data.references} scope="branch" locked={commonGroups} onChange={(filters) => changeBranch(branch.id, filters)} /> : null}
              {branch.bucket === 'ACT' && <div className="partner-selections__technical-types"><span>Types de fiches</span>{EXPLORER_BUCKET_TYPE_MAP.ACT.map((type) => <label key={type}><input type="checkbox" checked={branch.types.includes(type)} onChange={(event) => changeDraft({ ...draft, filtersChanged: true, branches: draft.branches.map((item) => item.id === branch.id ? { ...item, types: event.target.checked ? [...item.types, type] : item.types.filter((value) => value !== type) } : item) })} />{resolveTypeLabel(type)}</label>)}</div>}
            </section></div>)}
            <div className="partner-selections__type-picker"><p>{draft.branches.length ? 'Ajouter un autre bloc de fiches' : 'Quels types de fiches souhaitez-vous inclure ?'}</p><div>{EXPLORER_BUCKET_OPTIONS.map((option) => <button key={option.code} className="ghost-button" type="button" onClick={() => changeDraft({ ...draft, branches: [...draft.branches, newBranch(option.code)], filtersChanged: true })}><Plus size={14} aria-hidden />{option.label}</button>)}</div></div>
            <div className="partner-selections__joint partner-selections__joint--and"><span>et, pour toutes ces fiches</span></div><section className="partner-selections__block partner-selections__block--common" aria-label="Critères communs"><header><h4>Critères communs</h4></header><p className="partner-selections__note">Ces critères s’appliquent à chaque bloc. Un critère commun se modifie uniquement ici.</p>
              {draft.communeInsee !== null && <div className="partner-selections__scope"><strong>Communes du périmètre enregistré</strong><div>{draft.communeInsee.map((code) => <span key={code}>{catalogs.data?.communes.find((item) => item.code === code)?.name ?? code} <code>{code}</code></span>)}</div><p>Changer les villes dans les filtres remplace ce périmètre INSEE.</p><button type="button" className="ghost-button" onClick={() => changeDraft({ ...draft, communeInsee: null, filtersChanged: true })}>Retirer ce périmètre</button></div>}
              {commonReferences && draft.branches.length > 0 ? <LocalFilters initial={{ ...draft.common, selectedBuckets: draft.branches.map((branch) => branch.bucket) }} references={commonReferences} scope="common" onChange={changeCommon} /> : <p className="partner-selections__note">Ajoutez un bloc pour choisir les critères communs.</p>}
            </section>
          </>}
        {catalogs.isPending && <p role="status">Chargement des catalogues de filtres…</p>}{catalogs.isError && <p role="alert">Catalogues indisponibles. <button type="button" onClick={() => void catalogs.refetch()}>Réessayer</button></p>}
        {labelIncompatible && <p role="alert" className="inline-alert inline-alert--danger">Le label commun ne s’applique pas à tous les types de fiches. Retirez-le des critères communs et choisissez-le dans les blocs concernés.</p>}
      </fieldset><aside className="partner-selections__preview" aria-label="Aperçu des fiches"><div className="partner-selections__preview-head"><p>Aperçu</p>{preview && <h3>{preview.meta.total.toLocaleString('fr-FR')} fiche{preview.meta.total > 1 ? 's' : ''}</h3>}<span>Fiches publiées, hors données de test.</span></div>
        {loadedTypes.length > 0 && <div className="partner-selections__mix"><p>Répartition des fiches chargées</p><div className="partner-selections__mix-bar" aria-hidden>{loadedTypes.map(([type, count], index) => <span key={type} style={{ flex: count, opacity: 1 - (index % 5) * .12 }} />)}</div><ul>{loadedTypes.map(([type, count]) => <li key={type}><span>{resolveTypeLabel(type) || 'Autre type'}</span><strong>{count}</strong></li>)}</ul></div>}
        {preview && <label className="partner-selections__search-field"><Search size={15} aria-hidden /><span className="sr-only">Chercher dans les fiches chargées de l’aperçu</span><input type="search" placeholder="Chercher dans les fiches chargées" value={previewQuery} onChange={(event) => setPreviewQuery(event.target.value)} /></label>}
        {previewLoading && !preview && <p role="status" className="partner-selections__preview-state">Mise à jour de l’aperçu…</p>}
        {previewError && <div role="alert" className="partner-selections__preview-state"><h4>Aperçu indisponible</h4><p>{previewError}</p><button type="button" className="ghost-button" onClick={() => setPreviewRetry((value) => value + 1)}><RefreshCw size={14} aria-hidden />Réessayer</button></div>}
        {!previewInput && <p className="partner-selections__preview-state">{labelIncompatible ? 'Choisissez un label commun compatible avec tous les blocs pour afficher l’aperçu.' : 'Ajoutez un bloc de fiches pour afficher un aperçu.'}</p>}
        {preview && <><ul className="partner-selections__preview-list">{preview.data.filter((card) => JSON.stringify(card).toLocaleLowerCase('fr').includes(previewQuery.toLocaleLowerCase('fr'))).map((card, index) => {
          const location = card.location as Record<string, unknown> | undefined;
          return <li key={String(card.id ?? index)}><span className="partner-selections__type-icon"><Layers size={16} aria-hidden /></span><div><strong>{String(card.name ?? card.id ?? 'Fiche')}</strong><span>{typeof card.type === 'string' ? resolveTypeLabel(card.type) : ''}{location?.city ? ` · ${location.city}` : ''}</span></div></li>;
        })}</ul>{preview.meta.total === 0 && <div className="partner-selections__preview-state"><h4>Aucune fiche ne correspond</h4><p>Vous pouvez alléger un critère ou enregistrer cette sélection. Elle se remplira lorsque des fiches correspondront.</p></div>}
          {preview.meta.next_cursor && <button className="ghost-button" type="button" disabled={previewLoading} onClick={() => void morePreview()}>{previewLoading ? 'Chargement…' : 'Charger plus de fiches'}</button>}<p className="partner-selections__preview-foot">{preview.data.length} fiche{preview.data.length > 1 ? 's' : ''} chargée{preview.data.length > 1 ? 's' : ''} sur {preview.meta.total}. L’aperçu évolue avec les fiches Bertel.</p></>}
      </aside></div>
      <footer className="partner-selections__savebar"><div>{saveError ? <p role="alert" className="text-red-600">{saveError}</p> : <p>{dirty ? 'Modifications non enregistrées' : 'Toutes les modifications sont enregistrées.'}</p>}<span>L’identifiant reste stable. Les partenaires utilisent les derniers critères enregistrés.</span></div>{conflict && <button type="button" className="ghost-button" disabled={busy} onClick={() => { setReloadError(null); setConfirmReload(true); }}>Recharger la version enregistrée</button>}<button type="button" className="ghost-button" disabled={busy} onClick={() => dirty ? setDiscard(true) : closeEditor()}>Fermer</button><button type="button" className="primary-button" disabled={busy || !dirty || labelIncompatible || conflict} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer la sélection'}</button></footer>
    </div>}
    <ConfirmDialog open={discard} title="Quitter sans enregistrer ?" message="Les modifications de cette sélection seront abandonnées. La version enregistrée reste disponible pour les partenaires." confirmLabel="Quitter sans enregistrer" onCancel={() => setDiscard(false)} onConfirm={closeEditor} />
    <ConfirmDialog open={confirmReload} title="Recharger la version enregistrée ?" message={<><p>Recharger la dernière version de « {draft?.original?.name} » abandonnera vos modifications locales. L’identifiant reste identique.</p>{reloadError && <p role="alert">{reloadError} Votre saisie est conservée.</p>}</>} confirmLabel="Recharger" busy={busy} onCancel={() => { if (!busy) setConfirmReload(false); }} onConfirm={() => void reloadVersion()} />
  </section>;
}
