import type { ReactNode } from 'react';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import type {
  BackendObjectTypeCode,
  ExplorerBucketKey,
  ExplorerReferences,
  ExplorerStatusFilter,
} from '../../types/domain';
import { EXPLORER_BUCKET_OPTIONS, DEFAULT_HOT_SUBTYPES, HOT_BUCKET_TYPES, resolveExplorerStatuses } from '../../utils/facets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterDropdown } from '../dashboard/FilterDropdown';

const STATUS_OPTIONS: Array<{ code: ExplorerStatusFilter; label: string }> = [
  { code: 'published', label: 'Publie' },
  { code: 'draft', label: 'Brouillon' },
];

const hotSubtypeLabels: Record<BackendObjectTypeCode, string> = {
  HOT: 'Hotels',
  HPA: 'Hotellerie plein air',
  HLO: 'Loisirs heberges',
  CAMP: 'Campings',
  RVA: 'Residences vacances',
  RES: 'Restaurants',
  ITI: 'Itineraires',
  FMA: 'Evenements',
  ACT: 'Activites',
  LOI: 'Loisirs',
  PCU: 'Culture',
  PNA: 'Nature',
  VIL: 'Villages',
  COM: 'Commerces',
  PSV: 'Services',
  ASC: 'Ascenseurs',
};

interface FiltersPanelProps {
  compact?: boolean;
  headerActions?: ReactNode;
  references?: ExplorerReferences;
  /** Desktop Explorer: flat column with 56px header */
  variant?: 'panel' | 'column';
}

interface FiltersSectionProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
}

interface FiltersSubsectionProps {
  title: string;
  children: ReactNode;
}

function readCapacityValue(filters: Array<{ code: string; min?: number; max?: number }>, code: string, key: 'min' | 'max'): number | undefined {
  return filters.find((filter) => filter.code === code)?.[key];
}

function renderNumber(value?: number): string {
  return value == null ? '' : String(value);
}

function isBucketSelected(selectedBuckets: ExplorerBucketKey[], bucket: ExplorerBucketKey): boolean {
  return selectedBuckets.includes(bucket);
}

function FiltersSection({ eyebrow, title, children }: FiltersSectionProps) {
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

function FiltersSubsection({ title, children }: FiltersSubsectionProps) {
  return (
    <section className="filters-panel__subsection">
      <div className="filters-panel__subsection-header">
        <span className="facet-title">{title}</span>
      </div>
      {children}
    </section>
  );
}

export function FiltersPanel({ compact = false, headerActions, references, variant = 'panel' }: FiltersPanelProps) {
  const selectedBuckets = useExplorerStore((state) => state.selectedBuckets);
  const common = useExplorerStore((state) => state.common);
  const hot = useExplorerStore((state) => state.hot);
  const res = useExplorerStore((state) => state.res);
  const iti = useExplorerStore((state) => state.iti);
  const toggleBucket = useExplorerStore((state) => state.toggleBucket);
  const setCities = useExplorerStore((state) => state.setCities);
  const setLieuDit = useExplorerStore((state) => state.setLieuDit);
  const setPmr = useExplorerStore((state) => state.setPmr);
  const setPetsAccepted = useExplorerStore((state) => state.setPetsAccepted);
  const setOpenNow = useExplorerStore((state) => state.setOpenNow);
  const toggleLabel = useExplorerStore((state) => state.toggleLabel);
  const clearLabels = useExplorerStore((state) => state.clearLabels);
  const toggleHotSubtype = useExplorerStore((state) => state.toggleHotSubtype);
  const toggleHotTaxonomy = useExplorerStore((state) => state.toggleHotTaxonomy);
  const setHotCapacityFilter = useExplorerStore((state) => state.setHotCapacityFilter);
  const setResCapacityFilter = useExplorerStore((state) => state.setResCapacityFilter);
  const setHotMeetingRoom = useExplorerStore((state) => state.setHotMeetingRoom);
  const setItiIsLoop = useExplorerStore((state) => state.setItiIsLoop);
  const setItiDifficulty = useExplorerStore((state) => state.setItiDifficulty);
  const setItiDistance = useExplorerStore((state) => state.setItiDistance);
  const setItiDuration = useExplorerStore((state) => state.setItiDuration);
  const toggleItiPractice = useExplorerStore((state) => state.toggleItiPractice);
  const resetAll = useExplorerStore((state) => state.resetAll);
  const setStatuses = useExplorerStore((state) => state.setStatuses);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const showHot = isBucketSelected(selectedBuckets, 'HOT');
  const showRes = isBucketSelected(selectedBuckets, 'RES');
  const showIti = isBucketSelected(selectedBuckets, 'ITI');
  // Effective set displayed in the UI: when nothing is configured, the
  // resolver returns the editor default ['published','draft']. The toggle
  // writes to common.statuses; an explicit empty pick is intentionally not
  // distinguished from the default — both surface as "everything I'm allowed
  // to see".
  const effectiveStatuses = resolveExplorerStatuses(common.statuses, canEditObjects);

  const activeFilterCount = useExplorerStore((s) => {
    let n = 0;
    if (s.selectedBuckets.length) n += 1;
    if (s.common.search.trim()) n += 1;
    if (s.common.cities.length) n += 1;
    if (s.common.lieuDit.trim()) n += 1;
    if (s.common.pmr) n += 1;
    if (s.common.petsAccepted) n += 1;
    if (s.common.openNow) n += 1;
    if (s.common.labelsAny.length) n += 1;
    if (s.common.statuses.length > 0) n += 1;
    if (s.common.polygon) n += 1;
    if (s.common.bbox) n += 1;
    const subDefault =
      s.hot.subtypes.length === DEFAULT_HOT_SUBTYPES.length && DEFAULT_HOT_SUBTYPES.every((t) => s.hot.subtypes.includes(t));
    if (!subDefault) n += 1;
    if (s.hot.taxonomy.length) n += 1;
    if (s.hot.capacityFilters.length) n += 1;
    if (Object.keys(s.hot.meetingRoom).length) n += 1;
    if (s.res.capacityFilters.length) n += 1;
    if (s.iti.isLoop !== null || s.iti.practicesAny.length || s.iti.difficultyMin != null || s.iti.difficultyMax != null) n += 1;
    if (s.iti.distanceMinKm != null || s.iti.distanceMaxKm != null) n += 1;
    if (s.iti.durationMinH != null || s.iti.durationMaxH != null) n += 1;
    if (s.act.environmentTagsAny.length) n += 1;
    return n;
  });

  const isColumn = variant === 'column';

  return (
    <div
      className={
        isColumn
          ? 'flex min-h-0 min-w-0 flex-col border-r border-line bg-[rgba(255,253,248,0.35)]'
          : compact
            ? 'filters-panel filters-panel--compact'
            : 'filters-panel'
      }
    >
      {isColumn ? (
        <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-line bg-[rgba(255,253,248,0.5)] px-4">
          <div className="flex items-baseline gap-2 font-display text-[13px] font-bold tracking-tight text-ink">
            Filtres
            <span className="font-sans text-xs font-medium text-ink-3">
              {activeFilterCount} actifs
            </span>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="text-[12px] font-semibold text-orange-2 hover:text-orange"
          >
            Reinitialiser
          </button>
        </div>
      ) : (
        <>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Filtres</span>
            </div>
            {headerActions ? <div className="inline-actions">{headerActions}</div> : null}
          </div>

          <Button type="button" variant="ghost" className="filters-panel__reset" onClick={resetAll}>
            Reinitialiser
          </Button>
        </>
      )}

      <div className={isColumn ? 'flex-1 overflow-y-auto px-4 pb-6 pt-1' : 'filters-panel__content'}>
        <FiltersSection eyebrow="Base" title="Filtres generaux">
          <FiltersSubsection title="Categories">
            <div className="chip-grid">
              {EXPLORER_BUCKET_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className={selectedBuckets.includes(option.code) ? 'chip chip--active' : 'chip'}
                  onClick={() => toggleBucket(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FiltersSubsection>

          <FiltersSubsection title="Localisation">
            <div className="filters-panel__subsection">
              <span className="facet-title">Ville</span>
              <FilterDropdown<string>
                mode="multi"
                placeholder="Toutes les communes"
                allLabel="Toutes les communes"
                options={(references?.cities ?? []).map((c) => ({ code: c, label: c }))}
                selected={common.cities}
                onChange={(vals) => setCities(vals)}
              />
            </div>
            <div className="filters-panel__subsection">
              <span className="facet-title">Lieu-dit</span>
              <FilterDropdown<string>
                mode="single"
                placeholder="Tous les lieux-dits"
                options={(references?.lieuDits ?? []).map((v) => ({ code: v, label: v }))}
                selected={common.lieuDit ? [common.lieuDit] : []}
                onChange={(vals) => setLieuDit(vals[0] ?? '')}
              />
            </div>
          </FiltersSubsection>

          <FiltersSubsection title="Accessibilite et services">
            <div className="filters-panel__toggle-group">
              <label className="switch-row">
                <span>PMR</span>
                <input type="checkbox" checked={common.pmr} onChange={(event) => setPmr(event.target.checked)} />
              </label>

              <label className="switch-row">
                <span>Animaux acceptes</span>
                <input type="checkbox" checked={common.petsAccepted} onChange={(event) => setPetsAccepted(event.target.checked)} />
              </label>

              <label className="switch-row">
                <span>Ouvert en ce moment</span>
                <input type="checkbox" checked={common.openNow} onChange={(event) => setOpenNow(event.target.checked)} />
              </label>
            </div>
          </FiltersSubsection>

          {canEditObjects ? (
            <FiltersSubsection title="Statut">
              <div className="chip-grid">
                {STATUS_OPTIONS.map((option) => {
                  const active = effectiveStatuses.includes(option.code);
                  return (
                    <button
                      key={option.code}
                      type="button"
                      className={active ? 'chip chip--active' : 'chip'}
                      onClick={() => {
                        const nextEffective: ExplorerStatusFilter[] = active
                          ? effectiveStatuses.filter((entry) => entry !== option.code)
                          : [...effectiveStatuses, option.code];
                        // Keep at least one status active to avoid an
                        // empty-grid dead end. Empty selection collapses to
                        // ['published'] for safety.
                        const sanitized: ExplorerStatusFilter[] =
                          nextEffective.length > 0 ? nextEffective : ['published'];
                        // When the set matches the editor default we collapse
                        // back to [] so the URL stays clean and the resolver
                        // can recompute on session changes.
                        const isEditorDefault =
                          sanitized.length === STATUS_OPTIONS.length &&
                          STATUS_OPTIONS.every((opt) => sanitized.includes(opt.code));
                        setStatuses(isEditorDefault ? [] : sanitized);
                      }}
                      aria-pressed={active}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </FiltersSubsection>
          ) : null}

          {common.labelsAny.length > 0 ? (
            <FiltersSubsection title="Labels">
              <div className="chip-grid">
                {common.labelsAny.map((label) => (
                  <button key={label} type="button" className="chip chip--active" onClick={() => toggleLabel(label)}>
                    {label}
                  </button>
                ))}
                <button type="button" className="chip" onClick={clearLabels}>
                  Effacer
                </button>
              </div>
            </FiltersSubsection>
          ) : null}
        </FiltersSection>

        {showHot ? (
          <FiltersSection eyebrow="Categorie active" title="Hebergements">
            <FiltersSubsection title="Sous-types hebergement">
              <div className="chip-grid">
                {HOT_BUCKET_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={hot.subtypes.includes(type) ? 'chip chip--active' : 'chip'}
                    onClick={() => toggleHotSubtype(type)}
                  >
                    {hotSubtypeLabels[type]}
                  </button>
                ))}
              </div>
            </FiltersSubsection>

            {references?.hotTaxonomy.map((domain) => (
              <FiltersSubsection key={domain.domain} title={domain.name}>
                <div className="chip-grid">
                  {domain.nodes.map((node) => {
                    const active = hot.taxonomy.some((item) => item.domain === domain.domain && item.code === node.code);
                    return (
                      <button
                        key={`${domain.domain}:${node.code}`}
                        type="button"
                        className={active ? 'chip chip--active' : 'chip'}
                        onClick={() => toggleHotTaxonomy(domain.domain, node.code)}
                        style={{ marginLeft: `${Math.max(0, node.depth) * 0.5}rem` }}
                      >
                        {node.name}
                      </button>
                    );
                  })}
                </div>
              </FiltersSubsection>
            ))}

            {references?.hotCapacityMetrics.length ? (
              <FiltersSubsection title="Capacites hebergement">
                <div className="filters-panel__metric-stack">
                  {references.hotCapacityMetrics.map((metric) => (
                    <div key={metric.code} className="filters-panel__metric-row">
                      <strong>{metric.name}</strong>
                      <div className="filters-panel__range-grid">
                        <Input
                          type="number"
                          min={0}
                          value={renderNumber(readCapacityValue(hot.capacityFilters, metric.code, 'min'))}
                          onChange={(event) => setHotCapacityFilter(metric.code, event.target.value ? Number(event.target.value) : undefined, readCapacityValue(hot.capacityFilters, metric.code, 'max'))}
                          placeholder="Min"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={renderNumber(readCapacityValue(hot.capacityFilters, metric.code, 'max'))}
                          onChange={(event) => setHotCapacityFilter(metric.code, readCapacityValue(hot.capacityFilters, metric.code, 'min'), event.target.value ? Number(event.target.value) : undefined)}
                          placeholder="Max"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </FiltersSubsection>
            ) : null}

            <FiltersSubsection title="Salles de reunion">
              <div className="filters-panel__range-grid">
                <Input
                  type="number"
                  min={0}
                  value={renderNumber(hot.meetingRoom.minCount)}
                  onChange={(event) => setHotMeetingRoom({ minCount: event.target.value ? Number(event.target.value) : undefined })}
                  placeholder="Nb. salles min"
                />
                <Input
                  type="number"
                  min={0}
                  value={renderNumber(hot.meetingRoom.minAreaM2)}
                  onChange={(event) => setHotMeetingRoom({ minAreaM2: event.target.value ? Number(event.target.value) : undefined })}
                  placeholder="Surface min m2"
                />
                <Input
                  type="number"
                  min={0}
                  value={renderNumber(hot.meetingRoom.minCapTheatre)}
                  onChange={(event) => setHotMeetingRoom({ minCapTheatre: event.target.value ? Number(event.target.value) : undefined })}
                  placeholder="Cap. theatre min"
                />
                <Input
                  type="number"
                  min={0}
                  value={renderNumber(hot.meetingRoom.minCapClassroom)}
                  onChange={(event) => setHotMeetingRoom({ minCapClassroom: event.target.value ? Number(event.target.value) : undefined })}
                  placeholder="Cap. classe min"
                />
              </div>
            </FiltersSubsection>
          </FiltersSection>
        ) : null}

        {showRes && references?.resCapacityMetrics.length ? (
          <FiltersSection eyebrow="Categorie active" title="Restaurants">
            <FiltersSubsection title="Capacites restaurant">
              <div className="filters-panel__metric-stack">
                {references.resCapacityMetrics.map((metric) => (
                  <div key={metric.code} className="filters-panel__metric-row">
                    <strong>{metric.name}</strong>
                    <div className="filters-panel__range-grid">
                      <Input
                        type="number"
                        min={0}
                        value={renderNumber(readCapacityValue(res.capacityFilters, metric.code, 'min'))}
                        onChange={(event) => setResCapacityFilter(metric.code, event.target.value ? Number(event.target.value) : undefined, readCapacityValue(res.capacityFilters, metric.code, 'max'))}
                        placeholder="Min"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={renderNumber(readCapacityValue(res.capacityFilters, metric.code, 'max'))}
                        onChange={(event) => setResCapacityFilter(metric.code, readCapacityValue(res.capacityFilters, metric.code, 'min'), event.target.value ? Number(event.target.value) : undefined)}
                        placeholder="Max"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </FiltersSubsection>
          </FiltersSection>
        ) : null}

        {showIti ? (
          <FiltersSection eyebrow="Categorie active" title="Itineraires">
            <FiltersSubsection title="Type de parcours">
              <div className="chip-grid">
                {[
                  { label: 'Tous', value: null },
                  { label: 'Boucle', value: true },
                  { label: 'Aller-retour', value: false },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    className={iti.isLoop === option.value ? 'chip chip--active' : 'chip'}
                    onClick={() => setItiIsLoop(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </FiltersSubsection>

            <FiltersSubsection title="Effort et distance">
              <div className="facet-group">
                <span className="facet-title">Difficulte</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={renderNumber(iti.difficultyMin)}
                    onChange={(event) => setItiDifficulty(event.target.value ? Number(event.target.value) : undefined, iti.difficultyMax)}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={renderNumber(iti.difficultyMax)}
                    onChange={(event) => setItiDifficulty(iti.difficultyMin, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="facet-group">
                <span className="facet-title">Distance (km)</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(iti.distanceMinKm)}
                    onChange={(event) => setItiDistance(event.target.value ? Number(event.target.value) : undefined, iti.distanceMaxKm)}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={renderNumber(iti.distanceMaxKm)}
                    onChange={(event) => setItiDistance(iti.distanceMinKm, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="facet-group">
                <span className="facet-title">Duree (h)</span>
                <div className="filters-panel__range-grid">
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={renderNumber(iti.durationMinH)}
                    onChange={(event) => setItiDuration(event.target.value ? Number(event.target.value) : undefined, iti.durationMaxH)}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={renderNumber(iti.durationMaxH)}
                    onChange={(event) => setItiDuration(iti.durationMinH, event.target.value ? Number(event.target.value) : undefined)}
                    placeholder="Max"
                  />
                </div>
              </div>
            </FiltersSubsection>

            {references?.itiPractices.length ? (
              <FiltersSubsection title="Pratiques">
                <div className="chip-grid">
                  {references.itiPractices.map((practice) => (
                    <button
                      key={practice.code}
                      type="button"
                      className={iti.practicesAny.includes(practice.code) ? 'chip chip--active' : 'chip'}
                      onClick={() => toggleItiPractice(practice.code)}
                    >
                      {practice.name}
                    </button>
                  ))}
                </div>
              </FiltersSubsection>
            ) : null}
          </FiltersSection>
        ) : null}
      </div>
    </div>
  );
}
