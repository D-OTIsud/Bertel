import { objectTypeOptions } from '../../config/map-markers';
import { useExplorerStore } from '../../store/explorer-store';
import { getVisibleFacets } from '../../utils/facets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const labelOptions = ['famille', 'ecolabel', 'prestige'];
const amenityOptions = ['wifi', 'spa', 'parking', 'pmr'];

interface FiltersPanelProps {
  compact?: boolean;
}

export function FiltersPanel({ compact = false }: FiltersPanelProps) {
  const selectedTypes = useExplorerStore((state) => state.selectedTypes);
  const search = useExplorerStore((state) => state.search);
  const labels = useExplorerStore((state) => state.labels);
  const amenities = useExplorerStore((state) => state.amenities);
  const openNow = useExplorerStore((state) => state.openNow);
  const capacityMin = useExplorerStore((state) => state.capacityMin);
  const itineraryDifficultyMin = useExplorerStore((state) => state.itineraryDifficultyMin);
  const elevationGainMin = useExplorerStore((state) => state.elevationGainMin);
  const toggleType = useExplorerStore((state) => state.toggleType);
  const setSearch = useExplorerStore((state) => state.setSearch);
  const toggleLabel = useExplorerStore((state) => state.toggleLabel);
  const toggleAmenity = useExplorerStore((state) => state.toggleAmenity);
  const setOpenNow = useExplorerStore((state) => state.setOpenNow);
  const setCapacityRange = useExplorerStore((state) => state.setCapacityRange);
  const setItineraryDifficulty = useExplorerStore((state) => state.setItineraryDifficulty);
  const setElevationGainMin = useExplorerStore((state) => state.setElevationGainMin);
  const resetAll = useExplorerStore((state) => state.resetAll);

  const visibleFacets = getVisibleFacets(selectedTypes);

  return (
    <div className={compact ? 'filters-panel filters-panel--compact' : 'filters-panel'}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Panneau 1</span>
          <h2>Filtres intelligents</h2>
        </div>
        <Button type="button" variant="ghost" onClick={resetAll}>
          Reinitialiser
        </Button>
      </div>

      <label className="field-block">
        <span>Recherche</span>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom, ville, fiche..."
        />
      </label>

      <section className="facet-group">
        <span className="facet-title">Typologies</span>
        <div className="chip-grid">
          {objectTypeOptions.map((option) => (
            <button
              key={option.code}
              type="button"
              className={selectedTypes.includes(option.code) ? 'chip chip--active' : 'chip'}
              onClick={() => toggleType(option.code)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {visibleFacets.includes('labels') && (
        <section className="facet-group">
          <span className="facet-title">Labels</span>
          <div className="chip-grid">
            {labelOptions.map((label) => (
              <button
                key={label}
                type="button"
                className={labels.includes(label) ? 'chip chip--active' : 'chip'}
                onClick={() => toggleLabel(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {visibleFacets.includes('amenities') && (
        <section className="facet-group">
          <span className="facet-title">Equipements</span>
          <div className="chip-grid">
            {amenityOptions.map((amenity) => (
              <button
                key={amenity}
                type="button"
                className={amenities.includes(amenity) ? 'chip chip--active' : 'chip'}
                onClick={() => toggleAmenity(amenity)}
              >
                {amenity}
              </button>
            ))}
          </div>
        </section>
      )}

      {visibleFacets.includes('openNow') && (
        <label className="switch-row">
          <span>Ouvert en ce moment</span>
          <input type="checkbox" checked={openNow} onChange={(event) => setOpenNow(event.target.checked)} />
        </label>
      )}

      {visibleFacets.includes('capacity') && (
        <label className="field-block">
          <span>Capacite minimale</span>
          <input
            type="number"
            min={0}
            value={capacityMin ?? ''}
            onChange={(event) =>
              setCapacityRange(event.target.value ? Number(event.target.value) : undefined, undefined)
            }
            placeholder="ex: 12 lits"
          />
        </label>
      )}

      {visibleFacets.includes('itineraryDifficulty') && (
        <label className="field-block">
          <span>Difficulte minimale</span>
          <input
            type="range"
            min={1}
            max={5}
            value={itineraryDifficultyMin ?? 2}
            onChange={(event) => setItineraryDifficulty(Number(event.target.value), undefined)}
          />
        </label>
      )}

      {visibleFacets.includes('elevationGain') && (
        <label className="field-block">
          <span>Denivele min.</span>
          <input
            type="number"
            min={0}
            value={elevationGainMin ?? ''}
            onChange={(event) => setElevationGainMin(event.target.value ? Number(event.target.value) : undefined)}
            placeholder="ex: 450 m"
          />
        </label>
      )}
    </div>
  );
}
