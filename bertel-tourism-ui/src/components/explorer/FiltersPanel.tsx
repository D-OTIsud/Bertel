import type { ReactNode } from 'react';
import { useExplorerStore } from '../../store/explorer-store';
import type { BackendObjectTypeCode, ExplorerBucketKey, ExplorerReferences } from '../../types/domain';
import { EXPLORER_BUCKET_OPTIONS, HOT_BUCKET_TYPES } from '../../utils/facets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterDropdown } from '../dashboard/FilterDropdown';

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

export function FiltersPanel({ compact = false, headerActions, references }: FiltersPanelProps) {
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
  const showHot = isBucketSelected(selectedBuckets, 'HOT');
  const showRes = isBucketSelected(selectedBuckets, 'RES');
  const showIti = isBucketSelected(selectedBuckets, 'ITI');

  return (
    <div className={compact ? 'filters-panel filters-panel--compact' : 'filters-panel'}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Filtres</span>
        </div>
        {headerActions ? <div className="inline-actions">{headerActions}</div> : null}
      </div>

      <Button type="button" variant="ghost" className="filters-panel__reset" onClick={resetAll}>
        Reinitialiser
      </Button>

      <div className="filters-panel__content">
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
