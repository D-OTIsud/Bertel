import { buildItineraryStages } from './itinerary-stages';

describe('buildItineraryStages', () => {
  it('renvoie vide sans étape', () => {
    expect(buildItineraryStages({})).toEqual([]);
    expect(buildItineraryStages({ stages: [] })).toEqual([]);
  });

  it('lit les étapes RÉELLES (nom, type, description) — pas d’interpolation', () => {
    const rows = buildItineraryStages({
      stages: [
        { id: 's1', name: 'Départ du Bloc', description: 'Parking', extra: { kind: 'start_point' } },
        { id: 's2', name: 'Sommet du Piton', extra: { kind: 'viewpoint' } },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Départ du Bloc');
    expect(rows[0].description).toBe('Parking');
    expect(rows[0].kindLabel).toBe('Start point');
    expect(rows[1].name).toBe('Sommet du Piton');
  });

  it('nomme positionnellement une étape sans nom (réelle, non fabriquée)', () => {
    const rows = buildItineraryStages({ stages: [{ description: 'x' }] });
    expect(rows[0].name).toBe('Étape 1');
    expect(rows[0].key).toBe('stage-0');
  });
});
