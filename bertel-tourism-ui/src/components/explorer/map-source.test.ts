import { describe, expect, it } from 'vitest';
import type { MapObject } from '../../types/domain';
import { buildObjectFeatureCollection } from './map-source';

describe('buildObjectFeatureCollection', () => {
  it('keeps only objects with valid coordinates and maps popup properties', () => {
    const objects: MapObject[] = [
      {
        id: 'obj-1',
        name: 'Hotel Basalte',
        type: 'HOT',
        rating: 4.6,
        location: {
          lat: -21.1,
          lon: 55.4,
          address: 'Front de mer',
          city: 'Saint-Pierre',
        },
        price: {
          formatted: '149 EUR / nuit',
        },
      },
      {
        id: 'obj-2',
        name: 'Sans coordonnees',
        type: 'RES',
        location: {},
      },
    ];

    const collection = buildObjectFeatureCollection(objects);

    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toMatchObject({
      geometry: {
        type: 'Point',
        coordinates: [55.4, -21.1],
      },
      properties: {
        id: 'obj-1',
        name: 'Hotel Basalte',
        type: 'HOT',
        address: 'Front de mer',
        city: 'Saint-Pierre',
        price: '149 EUR / nuit',
        rating: '4.6',
      },
    });
  });
});
