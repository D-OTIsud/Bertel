jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getSupabaseClient } from '../lib/supabase';
import { buildPlacesRpcPayload, computePlacesReconcile, getObjectWorkspacePlacesModule } from './object-workspace';
import { createEmptyPlaceItem, parseObjectWorkspace } from './object-workspace-parser';
import type { ObjectWorkspaceDescriptionScope } from './object-workspace-parser';

function tf(value = '') {
  return { baseValue: value, values: {} };
}

function placeScope(placeId: string | null, label = 'Sous-lieu'): ObjectWorkspaceDescriptionScope {
  return {
    recordId: null,
    scope: 'place',
    placeId,
    label,
    visibility: 'public',
    description: tf(),
    chapo: tf(),
    adaptedDescription: tf(),
    mobileDescription: tf(),
    editorialDescription: tf(),
  };
}

/**
 * T1b sub-places — the pure reconcile that turns the draft place list + the existing
 * object_place id set into an insert/update/delete plan. The thin async executor in
 * saveObjectWorkspaceDescriptions applies it via PostgREST (non-destructive: only places
 * the user removed are deleted — no save_object_places blanket replace).
 */
describe('computePlacesReconcile', () => {
  it('routes a new place (null placeId) to toInsert', () => {
    const plan = computePlacesReconcile([], [placeScope(null, 'Nouveau')]);
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
  });

  it('routes an existing place to toUpdate (idempotent label/description write)', () => {
    const plan = computePlacesReconcile(['p1'], [placeScope('p1', 'Renommé')]);
    expect(plan.toUpdate.map((p) => p.placeId)).toEqual(['p1']);
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
  });

  it('marks a loaded-then-removed place for deletion', () => {
    const plan = computePlacesReconcile(['p1', 'p2'], [placeScope('p1')]);
    expect(plan.toDelete).toEqual(['p2']);
    expect(plan.toUpdate.map((p) => p.placeId)).toEqual(['p1']);
    expect(plan.toInsert).toHaveLength(0);
  });

  it('handles a mixed insert + update + delete batch', () => {
    const plan = computePlacesReconcile(['p1', 'p2'], [placeScope('p1'), placeScope(null, 'Nouveau')]);
    expect(plan.toUpdate.map((p) => p.placeId)).toEqual(['p1']);
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toDelete).toEqual(['p2']);
  });

  it('does not delete anything when every existing place is still present', () => {
    const plan = computePlacesReconcile(['p1'], [placeScope('p1')]);
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
  });
});

describe('buildPlacesRpcPayload', () => {
  it('keeps the raw nullable or sparse site position when editing its content', () => {
    const item = createEmptyPlaceItem(3);
    for (const position of [null, 24]) {
      item.rawPlace = { id: item.recordId, position };
      item.label = 'Site renommé';
      const payload = buildPlacesRpcPayload({ items: [item], unavailableReason: null }) as { places: Array<{ position: number | null }> };
      expect(payload.places[0].position).toBe(position);
    }
  });

  it('captures new site, address, and description IDs once across save/retry, then deletes only after a canonical commit', () => {
    const item = createEmptyPlaceItem();
    item.label = 'Nouveau site';
    const module = { items: [item], knownPlaceIds: [], unavailableReason: null };
    const first = buildPlacesRpcPayload(module) as { write_contract: string; deleted_ids: string[]; places: Array<{ id: string; locations: Array<{ id: string }>; descriptions: Array<{ id: string }> }> };
    const retry = buildPlacesRpcPayload(module) as typeof first;
    expect(first.write_contract).toBe('places-reconcile-v1');
    const ids = [first.places[0].id, first.places[0].locations[0].id, first.places[0].descriptions[0].id];
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(item.isNew).toBe(true);
    expect(retry).toEqual(first);
    expect(buildPlacesRpcPayload({ ...module, items: [] }).deleted_ids).toEqual([]);
    expect(buildPlacesRpcPayload({ items: [], unavailableReason: null }).deleted_ids).toEqual([]);
    const committed = { ...module, knownPlaceIds: [item.recordId!], items: [{ ...item, isNew: false }] };
    expect(buildPlacesRpcPayload(committed).deleted_ids).toEqual([]);
    expect(buildPlacesRpcPayload({ ...committed, items: [] }).deleted_ids).toEqual([item.recordId]);
  });

  it('fails before writing if an old draft lacks a stable parent or child ID', () => {
    const item = createEmptyPlaceItem();
    expect(() => buildPlacesRpcPayload({ items: [{ ...item, recordId: null }], unavailableReason: null })).toThrow(/identifiant stable/);
    expect(() => buildPlacesRpcPayload({ items: [{ ...item, location: { ...item.location, recordId: null } }], unavailableReason: null })).toThrow(/identifiant stable/);
    expect(() => buildPlacesRpcPayload({ items: [{ ...item, descriptionRecordId: null }], unavailableReason: null })).toThrow(/identifiant stable/);
  });

  it('keeps an existing NULL label without persisting its display fallback', () => {
    const item = { ...createEmptyPlaceItem(), isNew: false, rawName: null };
    const payload = buildPlacesRpcPayload({ items: [item], unavailableReason: null }) as { places: Array<{ label: string | null }> };
    expect(payload.places[0].label).toBeNull();
  });

  it('round-trips place metadata, altitude, and secondary description/location rows', () => {
    const place = {
      recordId: '11111111-1111-4111-8111-111111111111',
      rawName: 'Ancien nom',
      label: 'Site modifié',
      rawPlace: { slug: 'site-original', effective_from: '2020-01-01', extra: { source: 'legacy' } },
      rawLocations: [
        { id: '22222222-2222-4222-8222-222222222222', address1: 'Ancienne adresse', altitude_m: 87, is_main_location: true, position: 0 },
        { id: '33333333-3333-4333-8333-333333333333', address1: 'Adresse annexe', altitude_m: 12, is_main_location: false, position: 1 },
      ],
      rawDescriptions: [
        { id: '44444444-4444-4444-8444-444444444444', description: 'Ancien texte', visibility: 'partners', extra: { source: 'old' }, position: 0 },
        { id: '55555555-5555-4555-8555-555555555555', description: 'Texte annexe', visibility: 'private', position: 1 },
      ],
      position: 0,
      descriptionRecordId: '44444444-4444-4444-8444-444444444444',
      description: { baseValue: 'Texte modifié', values: { en: 'Updated text' } },
      visibility: 'public',
      location: {
        recordId: '22222222-2222-4222-8222-222222222222', altitude: '87', address1: 'Nouvelle adresse',
        address1Suite: '', address2: '', address3: '', postcode: '', city: '', codeInsee: '', lieuDit: '',
        direction: '', latitude: '', longitude: '', zoneTouristique: '',
      },
    };
    const payload = buildPlacesRpcPayload({ items: [place], unavailableReason: null } as unknown as import('./object-workspace-parser').ObjectWorkspacePlacesModule) as {
      places: Array<Record<string, unknown>>;
    };
    const row = payload.places[0];
    expect(row).toMatchObject({ slug: 'site-original', extra: { source: 'legacy' }, label: 'Site modifié' });
    expect((row.locations as Record<string, unknown>[])[0]).toMatchObject({ address1: 'Nouvelle adresse', altitude_m: 87 });
    expect((row.locations as Record<string, unknown>[])[1]).toMatchObject({ address1: 'Adresse annexe', altitude_m: 12 });
    expect((row.descriptions as Record<string, unknown>[])[0]).toMatchObject({ description: 'Texte modifié', description_i18n: { en: 'Updated text' }, extra: { source: 'old' } });
    expect((row.descriptions as Record<string, unknown>[])[1]).toMatchObject({ description: 'Texte annexe', visibility: 'private' });
  });
});

describe('canonical site read before a save', () => {
  const placeId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const descriptionId = '44444444-4444-4444-8444-444444444444';
  // Actual get_object_resource projection: one partial location, no location ID or
  // locations array; descriptions expose stripped prose plus its raw sibling.
  const projected = () => parseObjectWorkspace({ id: 'o1', name: 'Test', raw: { places: [{
    id: placeId, label: 'Site', slug: 'original', extra: { source: 'old' }, position: 0,
    location: { latitude: -21, longitude: 55, altitude_m: 87, address1: 'Rue A', postcode: '97400', city: 'Saint-Denis', direction: 'Depuis la route', direction_md: '**Depuis** la route' },
    descriptions: [{ id: descriptionId, description: 'Texte', description_raw: '**Texte**', visibility: 'public' }],
  }] } }, ['fr']).places;
  type Response = { data: unknown; error: unknown; count?: number | null };
  type ReadChain = {
    select: jest.Mock; eq: jest.Mock; order: jest.Mock;
    then: (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
  };
  function setup(overrides: Record<string, Response | Error> = {}) {
    const rows: Record<string, Response | Error> = {
      object_place: { data: [{ id: placeId, object_id: 'o1', label: 'Site', slug: 'original', effective_from: '2020-01-01', extra: { source: 'old' }, position: 0 }], count: 1, error: null },
      object_location: { data: [
        { id: locationId, place_id: placeId, object_id: null, address1: 'Rue A', address1_suite: 'Bâtiment B', address2: 'Étage 2', address3: 'Porte 4', postcode: '97400', city: 'Saint-Denis', code_insee: '97411', lieu_dit: 'La Montagne', direction: '    **Depuis** la route\n', latitude: -21, longitude: 55, altitude_m: 87, is_main_location: true, position: 0 },
        { id: '33333333-3333-4333-8333-333333333333', place_id: placeId, address1: 'Annexe', altitude_m: 12, is_main_location: false, position: 1 },
      ], count: 2, error: null },
      object_place_description: { data: [
        { id: descriptionId, place_id: placeId, description: '    **Texte**\n', description_i18n: { en: '**Text**' }, description_chapo: 'Chapo conservé', visibility: 'public', extra: { legacy: true }, position: 0 },
        { id: '55555555-5555-4555-8555-555555555555', place_id: placeId, description: 'Texte annexe', description_i18n: { en: 'Other text' }, visibility: 'private', position: 1 },
      ], count: 2, error: null },
      ...overrides,
    };
    const from = jest.fn((table: string) => {
      const chain: ReadChain = {
        select: jest.fn(() => chain), eq: jest.fn(() => chain), order: jest.fn(() => chain),
        then(resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) {
          const response = rows[table];
          return (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)).then(resolve, reject);
        },
      };
      return chain;
    });
    (getSupabaseClient as jest.Mock).mockReturnValue({ from });
    return from;
  }

  it('reconstructs the complete editable site from SQL rows instead of the partner projection', async () => {
    const from = setup();
    const baseline = projected();
    expect(baseline.items[0].location.recordId).toBeNull();
    expect(baseline.items[0].location.address1Suite).toBe('');
    const loaded = await getObjectWorkspacePlacesModule('o1', baseline);
    expect(loaded.unavailableReason).toBeNull();
    loaded.items[0].label = 'Site renommé';
    const payload = buildPlacesRpcPayload(loaded) as { places: Array<Record<string, unknown>> };
    expect(loaded.knownPlaceIds).toEqual([placeId]);
    expect(payload).toMatchObject({ write_contract: 'places-reconcile-v1', deleted_ids: [] });
    expect(payload.places[0]).toMatchObject({ label: 'Site renommé', slug: 'original', effective_from: '2020-01-01', extra: { source: 'old' } });
    expect(payload.places[0].locations).toEqual([
      expect.objectContaining({ id: locationId, address1_suite: 'Bâtiment B', address2: 'Étage 2', address3: 'Porte 4', code_insee: '97411', lieu_dit: 'La Montagne', direction: '    **Depuis** la route\n', altitude_m: 87 }),
      expect.objectContaining({ address1: 'Annexe', altitude_m: 12, is_main_location: false }),
    ]);
    expect(payload.places[0].descriptions).toEqual([
      expect.objectContaining({ id: descriptionId, description: '    **Texte**\n', description_i18n: { en: '**Text**' }, description_chapo: 'Chapo conservé', extra: { legacy: true } }),
      expect.objectContaining({ description: 'Texte annexe', description_i18n: { en: 'Other text' }, visibility: 'private' }),
    ]);
    for (const result of from.mock.results) expect(result.value.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
  });

  it.each(['object_place', 'object_location', 'object_place_description'])('blocks saving if %s fails or is truncated', async (table) => {
    for (const response of [new Error('network'), { data: [], error: { message: 'denied' }, count: 0 }, { data: [], error: null, count: 2 }, { data: [], error: null, count: null }]) {
      setup({ [table]: response });
      const loaded = await getObjectWorkspacePlacesModule('o1', projected());
      expect(loaded.unavailableReason).toBeTruthy();
    }
  });

  it('rejects an empty parent read or a known description disappearing despite successful counts', async () => {
    for (const table of ['object_place', 'object_place_description']) {
      setup({ [table]: { data: [], count: 0, error: null } });
      expect((await getObjectWorkspacePlacesModule('o1', projected())).unavailableReason).toBeTruthy();
    }
  });

  it('rejects a lost known location and child rows attached to an unknown site', async () => {
    setup();
    const baseline = projected();
    baseline.items[0].location.recordId = 'unknown-location';
    expect((await getObjectWorkspacePlacesModule('o1', baseline)).unavailableReason).toBeTruthy();
    setup({ object_location: { data: [{ id: locationId, place_id: 'unknown-place' }], count: 1, error: null } });
    expect((await getObjectWorkspacePlacesModule('o1', projected())).unavailableReason).toBeTruthy();
  });

  it('captures stable child IDs for an existing site whose first address and description do not exist yet', async () => {
    setup({ object_location: { data: [], count: 0, error: null }, object_place_description: { data: [], count: 0, error: null } });
    const baseline = parseObjectWorkspace({ id: 'o1', name: 'Test', raw: { places: [{ id: placeId, label: 'Sans détail' }] } }, ['fr']).places;
    const loaded = await getObjectWorkspacePlacesModule('o1', baseline);
    expect(loaded.unavailableReason).toBeNull();
    const first = buildPlacesRpcPayload(loaded);
    expect(buildPlacesRpcPayload(loaded)).toEqual(first);
    expect(first.places).toEqual([expect.objectContaining({ id: placeId, locations: [expect.objectContaining({ id: loaded.items[0].location.recordId })], descriptions: [expect.objectContaining({ id: loaded.items[0].descriptionRecordId })] })]);
    expect(loaded.items[0].location.recordId).toMatch(/^[0-9a-f-]{36}$/);
    expect(loaded.items[0].descriptionRecordId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([null, 'private', 'public'] as const)('preserves NULL description visibility until an explicit choice %p', async (choice) => {
    setup({ object_place_description: { data: [{ id: descriptionId, place_id: placeId, description: 'Texte', visibility: null }], count: 1, error: null } });
    const loaded = await getObjectWorkspacePlacesModule('o1', projected());
    expect(loaded.items[0].rawVisibility).toBeNull();
    if (choice) { loaded.items[0].visibility = choice; loaded.items[0].visibilityEdited = true; }
    const payload = buildPlacesRpcPayload(loaded) as { places: Array<{ descriptions: Array<{ visibility: string | null }> }> };
    expect(payload.places[0].descriptions[0].visibility).toBe(choice);
  });

  it.each([false, null])('does not promote an existing address with main flag %p merely by editing its site', async (isMain) => {
    setup({ object_location: { data: [{ id: locationId, place_id: placeId, is_main_location: isMain }], count: 1, error: null } });
    const loaded = await getObjectWorkspacePlacesModule('o1', projected());
    const payload = buildPlacesRpcPayload(loaded) as { places: Array<{ locations: Array<{ is_main_location: boolean | null }> }> };
    expect(payload.places[0].locations[0].is_main_location).toBe(isMain);
  });
});
