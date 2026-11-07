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

  // GARDE §213 — le leg GARDÉ prime sur le duplicata d'enveloppe. Si l'ordre de
  // préférence repasse au duplicata, le caviardage §208 est écrasé et
  // `contacts_restricted` disparaît : l'éditeur rouvre son piège d'écriture sur
  // la note. Rien ne lèverait d'erreur — d'où cette assertion.
  it('préfère le leg acteur GARDÉ de `object` au duplicata d’enveloppe', () => {
    const detail = normalizeObjectDetailPayload(
      {
        object: {
          id: 'ACT1',
          name: 'Fiche',
          // Leg garde : PII caviardee, drapeau present.
          actors: [{ id: 'a1', display_name: 'Jean D.', first_name: null, note: null, contacts_restricted: true }],
        },
        // Duplicata NON garde : PII en clair, aucun drapeau.
        actors: [{ id: 'a1', display_name: 'Jean D.', first_name: 'Jean', note: 'Propriétaire' }],
        organizations: [],
        parent_objects: [],
      },
      'fallback-id',
    );

    const actors = detail.raw.actors as Array<Record<string, unknown>>;
    expect(actors[0].first_name).toBeNull();
    expect(actors[0].note).toBeNull();
    expect(actors[0].contacts_restricted).toBe(true);
  });

  // GARDE NON VACANTE — la fixture ci-dessous porte `actors` au PREMIER niveau,
  // exactement comme le payload réel de `api.get_object_resources_batch` (32 clés,
  // aucune enveloppe `object`, vérifié en production). Le test « payload standard »
  // qui suit ne portait PAS `actors` : il court-circuitait le normaliseur et
  // laissait passer la régression qui vidait l'export Excel de ses 29 autres clés.
  it("ne prend PAS un payload plat portant `actors` pour une enveloppe deep", () => {
    const detail = normalizeObjectDetailPayload(
      {
        id: 'ACT123',
        name: 'Canyoning Example',
        type: 'ACT',
        location: { city: 'Cilaos' },
        contacts: [{ id: 'c1', kind: 'email', value: 'a@x.test' }],
        opening_times: [{ id: 'o1' }],
        actors: [{ id: 'a1', display_name: 'Jean Dupont' }],
      },
      'fallback-id',
    );

    expect(detail.id).toBe('ACT123');
    expect(detail.name).toBe('Canyoning Example');
    expect(detail.raw.deep_data).toBeUndefined();
    // Les clés hors du trio deep DOIVENT survivre — c'est tout le contenu de l'export.
    expect(detail.raw.location).toEqual({ city: 'Cilaos' });
    expect(detail.raw.contacts).toHaveLength(1);
    expect(detail.raw.opening_times).toHaveLength(1);
    expect(detail.raw.actors).toHaveLength(1);
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
