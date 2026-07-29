import { resolveExplorerEmptyState } from './explorer-empty-state';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';
import type { ExplorerFilters, TaxonomyRef } from '../../types/domain';

function filters(overrides: Partial<ExplorerFilters['common']> & { taxonomyAny?: TaxonomyRef[] } = {}): ExplorerFilters {
  return {
    ...DEFAULT_EXPLORER_FILTERS,
    common: { ...DEFAULT_EXPLORER_FILTERS.common, ...overrides },
  };
}

describe('resolveExplorerEmptyState', () => {
  it('explique qu\'une nature d\'hébergement n\'a pas encore de fiche', () => {
    const copy = resolveExplorerEmptyState(
      filters({ taxonomyAny: [{ domain: 'taxonomy_hpa', code: 'bivouac_area' }] }),
    );

    expect(copy.title).toBe("Aucune fiche n'utilise encore cette nature d'hébergement");
    expect(copy.description).toMatch(/peut être choisie à la création/);
  });

  it('reste générique quand un autre critère peut expliquer le vide', () => {
    // Une recherche textuelle suffit à rendre le diagnostic incertain : affirmer
    // « personne ne l'utilise » serait un mensonge de plus, pas une amélioration.
    const copy = resolveExplorerEmptyState(
      filters({ taxonomyAny: [{ domain: 'taxonomy_hpa', code: 'bivouac_area' }], search: 'saint-pierre' }),
    );

    expect(copy.title).toBe('Aucun résultat pour ces filtres');
  });

  it('reste générique quand deux natures sont sélectionnées', () => {
    const copy = resolveExplorerEmptyState(filters({
      taxonomyAny: [
        { domain: 'taxonomy_hpa', code: 'bivouac_area' },
        { domain: 'taxonomy_hpa', code: 'motorhome_night_stop' },
      ],
    }));

    expect(copy.title).toBe('Aucun résultat pour ces filtres');
  });

  it('reste générique pour une taxonomie non hébergement', () => {
    const copy = resolveExplorerEmptyState(
      filters({ taxonomyAny: [{ domain: 'taxonomy_act', code: 'guided_tour' }] }),
    );

    expect(copy.title).toBe('Aucun résultat pour ces filtres');
  });

  it('reste générique sans aucun filtre de taxonomie', () => {
    expect(resolveExplorerEmptyState(filters()).title).toBe('Aucun résultat pour ces filtres');
  });
});
