import type { ObjectCard } from '../types/domain';
import { getObjectIdsInsidePolygon, isPointInPolygon, mergeSelectedObjectIds } from './explorer-selection';

describe('mergeSelectedObjectIds', () => {
  it('appends only new trimmed ids and preserves order', () => {
    expect(mergeSelectedObjectIds(['obj-1', 'obj-2'], [' obj-2 ', '', 'obj-3', 'obj-4', 'obj-3'])).toEqual([
      'obj-1',
      'obj-2',
      'obj-3',
      'obj-4',
    ]);
  });
});

describe('isPointInPolygon', () => {
  it('treats inside and boundary points as selected', () => {
    const polygon: [number, number][] = [
      [55.4, -21.2],
      [55.7, -21.2],
      [55.7, -21.0],
      [55.4, -21.0],
    ];

    expect(isPointInPolygon([55.5, -21.1], polygon)).toBe(true);
    expect(isPointInPolygon([55.4, -21.1], polygon)).toBe(true);
    expect(isPointInPolygon([55.9, -21.1], polygon)).toBe(false);
  });
});

describe('getObjectIdsInsidePolygon', () => {
  it('keeps only markers whose coordinates fall inside the drawn zone', () => {
    const objects: ObjectCard[] = [
      {
        id: 'obj-1',
        name: 'Hotel Basalte',
        type: 'HOT',
        location: {
          lon: 55.5,
          lat: -21.1,
        },
      },
      {
        id: 'obj-2',
        name: 'Restaurant Horizon',
        type: 'RES',
        location: {
          lon: 55.8,
          lat: -21.1,
        },
      },
      {
        id: 'obj-3',
        name: 'Sans coordonnees',
        type: 'ITI',
      },
    ];

    expect(
      getObjectIdsInsidePolygon(objects, [
        [55.4, -21.2],
        [55.7, -21.2],
        [55.7, -21.0],
        [55.4, -21.0],
      ]),
    ).toEqual(['obj-1']);
  });
});
