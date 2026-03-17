import { normalizeObjectDetailPayload } from './object-detail';

describe('normalizeObjectDetailPayload', () => {
  it('merges deep-data RPC blocks into a single object detail record', () => {
    const detail = normalizeObjectDetailPayload(
      {
        object: {
          id: 'HOT123',
          name: 'Hotel Example',
          type: 'HOT',
          contacts: [{ id: 'c1', label: 'Reception', value: '+262', kind: 'phone' }],
        },
        actors: [{ id: 'a1', display_name: 'Jean Dupont' }],
        organizations: [{ id: 'o1', name: 'Agence Example' }],
        parent_objects: [{ id: 'p1', name: 'Organisation Parent' }],
      },
      'fallback-id',
    );

    expect(detail.id).toBe('HOT123');
    expect(detail.name).toBe('Hotel Example');
    expect(detail.type).toBe('HOT');
    expect(detail.raw.deep_data).toBe(true);
    expect(Array.isArray(detail.raw.actors)).toBe(true);
    expect(Array.isArray(detail.raw.organizations)).toBe(true);
    expect(Array.isArray(detail.raw.parent_objects)).toBe(true);
  });

  it('keeps standard get_object_resource payloads unchanged', () => {
    const detail = normalizeObjectDetailPayload(
      {
        id: 'RES123',
        name: 'Restaurant Example',
        type: 'RES',
        legal_records: [],
      },
      'fallback-id',
    );

    expect(detail.id).toBe('RES123');
    expect(detail.name).toBe('Restaurant Example');
    expect(detail.type).toBe('RES');
    expect(detail.raw.legal_records).toEqual([]);
  });
});
