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
    expect(rows[0].positionLabel).toBe('Étape 1');
    expect(rows[1].name).toBe('Sommet du Piton');
    expect(rows[1].positionLabel).toBe('Étape 2');
  });

  it('ne fabrique PAS de nom pour une étape sans nom (name reste vide)', () => {
    const rows = buildItineraryStages({ stages: [{ description: 'Passage technique' }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('');
    expect(rows[0].positionLabel).toBe('Étape 1');
    expect(rows[0].description).toBe('Passage technique');
  });

  it('écarte une étape totalement vide', () => {
    const rows = buildItineraryStages({ stages: [{ id: 'empty' }, { name: 'Vrai' }] });
    expect(rows.map((r) => r.name)).toEqual(['Vrai']);
    expect(rows[0].positionLabel).toBe('Étape 1');
  });

  it('conserve une étape n’ayant que des coordonnées', () => {
    const rows = buildItineraryStages({ stages: [{ id: 'p', lng: 55.5, lat: -21.1 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('');
  });

  it('conserve une étape n’ayant que des médias', () => {
    const rows = buildItineraryStages({ stages: [{ id: 'm', media: [{ id: 'x', url: 'u' }] }] });
    expect(rows).toHaveLength(1);
  });

  it('préserve l’ordre serveur et numérote les étapes conservées de façon contiguë', () => {
    const rows = buildItineraryStages({
      stages: [
        { name: 'A' },
        { id: 'empty' },
        { name: 'B' },
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(['A', 'B']);
    expect(rows.map((r) => r.positionLabel)).toEqual(['Étape 1', 'Étape 2']);
  });
});
