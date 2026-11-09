import { activeCommonGroups, emptyFilters, newBranch, newSelectionDraft, openSelectionDraft, selectionInput } from './editor-model';
import type { PartnerSelectionAdmin } from '../../services/partner-selection-admin';

const record = (buckets: PartnerSelectionAdmin['buckets'], extra: Partial<PartnerSelectionAdmin> = {}): PartnerSelectionAdmin => ({
  id: '1001', name: 'À pied', orgObjectId: 'org-1', buckets, explorerState: null, communeInsee: ['97403'], state: 'active',
  revision: 1, createdAt: '', updatedAt: '', ...extra,
});

describe('partner-selection editor model', () => {
  it('keeps original criteria, advanced fallback and INSEE byte-for-byte on rename', () => {
    const selection = record([{ types: ['ITI'], filters: { taxonomy_any: [{ domain: 'taxonomy_iti', code: 'hiking' }] }, only_without_practices: true }]);
    const draft = openSelectionDraft(selection); draft.name = 'Balades';
    expect(draft.lockedReason).toBeUndefined();
    expect(selectionInput(draft, 'org-1')).toEqual({ name: 'Balades', orgObjectId: 'org-1', buckets: selection.buckets, explorerState: null, communeInsee: ['97403'] });
    draft.filtersChanged = true; draft.branches[0].filters.iti.distanceMaxKm = 8;
    expect(selectionInput(draft, 'org-1').buckets[0]).toMatchObject({ only_without_practices: true, filters: { itinerary: { distance_max_km: 8 } } });
  });
  it('never rebuilds unknown criteria, even if known fields coexist', () => {
    const selection = record([{ types: ['RES'], filters: { pet_accepted: true, future_filter: ['x'] } }]);
    const draft = openSelectionDraft(selection); expect(draft.lockedReason).toMatch(/avancés/);
    draft.name = 'Renommée'; expect(selectionInput(draft, 'org-1').buckets).toEqual(selection.buckets);
    draft.filtersChanged = true; expect(() => selectionInput(draft, 'org-1')).toThrow(/avancés/);
  });
  it('splits mixed technical buckets without changing the type union', () => {
    const draft = openSelectionDraft(record([{ types: ['ACT', 'ASC', 'LOI'] }]));
    expect(draft.lockedReason).toBeUndefined(); expect(draft.branches.map((branch) => branch.bucket)).toEqual(['ACT', 'VIS']);
    draft.filtersChanged = true;
    expect(selectionInput(draft, 'org-1').buckets.flatMap((bucket) => bucket.types)).toEqual(['ACT', 'ASC', 'LOI']);
  });
  it('ANDs common groups onto every OR branch without widening their taxonomies', () => {
    const draft = newSelectionDraft(); draft.name = 'Terroir'; draft.branches = [newBranch('VIS', 'a'), newBranch('SRV', 'b')];
    draft.branches[0].filters.vis.subtypes = ['PRD'];
    draft.branches[1].filters.srv.subtypes = ['COM'];
    draft.branches[1].filters.common.taxonomyAny = [{ domain: 'taxonomy_com', code: 'local_crafts' }];
    draft.common.common.petsAccepted = true; draft.common.common.cities = ['Saint-Joseph'];
    expect(activeCommonGroups(draft.common)).toEqual(['city', 'pets']);
    const input = selectionInput(draft, 'org-1');
    expect(input.buckets).toEqual([
      { types: ['PRD'], filters: { pet_accepted: true, city_any: ['Saint-Joseph'] } },
      { types: ['COM'], filters: { pet_accepted: true, city_any: ['Saint-Joseph'], taxonomy_any: [{ domain: 'taxonomy_com', code: 'local_crafts' }] } },
    ]);
  });
  it('keeps independent states and replaces a complete common group, including its false defaults', () => {
    const a = newBranch('RES', 'a'), b = newBranch('RES', 'b'); a.filters.common.cities.push('Cilaos');
    expect(b.filters.common.cities).toEqual([]);
    const draft = { ...newSelectionDraft(), branches: [a, b], common: emptyFilters() };
    a.filters.common.openNow = true; draft.common.common.openAt = '2026-11-12T18:00';
    expect(selectionInput(draft, 'org-1').buckets[0].filters).toMatchObject({ open_at: '2026-11-12T18:00:00+04:00' });
    expect(selectionInput(draft, 'org-1').buckets[0].filters).not.toHaveProperty('open_now');
  });
  it('reopens its saved state only if it still matches the authoritative payload', () => {
    const draft = { ...newSelectionDraft(), name: 'Restaurants', branches: [newBranch('RES', 'a')] };
    draft.branches[0].filters.res.capacityFilters = [{ code: 'seats', min: 12 }];
    const input = selectionInput(draft, 'org-1');
    const saved = record([...input.buckets], { explorerState: input.explorerState!, communeInsee: null });
    expect(openSelectionDraft(saved).lockedReason).toBeUndefined();
    saved.buckets[0].filters = { capacity_filters: [{ code: 'seats', min: 20 }] };
    expect(openSelectionDraft(saved).lockedReason).toBeDefined();
  });
  it('preserves HEB axes, RES cuisines and ITI/date ranges through the actual serializer', () => {
    for (const bucket of [
      { types: ['HOT'], filters: { accommodation_positionings_any: ['boutique'], accommodation_unit_types_any: ['lodge'], capacity_filters: [{ code: 'beds', min: 4, max: 20 }], meeting_room: { min_count: 1, min_area_m2: 30 } } },
      { types: ['RES'], filters: { cuisine_types_any: ['creole'], capacity_filters: [{ code: 'seats', min: 10 }] } },
      { types: ['ITI'], filters: { itinerary: { practices_any: ['velo_vtt'], is_loop: true, distance_min_km: 5, duration_max_h: 4, difficulty_max: 3 } } },
      { types: ['FMA'], filters: { event: { from: '2026-11-09', to: '2026-11-12' } } },
    ]) expect(openSelectionDraft(record([bucket])).lockedReason).toBeUndefined();
  });
  it('rejects an empty selection or branch rather than widening to all types', () => {
    const draft = newSelectionDraft(); expect(() => selectionInput(draft, 'org-1')).toThrow(/bloc/);
    draft.branches = [newBranch('ACT', 'a')]; draft.branches[0].types = [];
    expect(() => selectionInput(draft, 'org-1')).toThrow(/type/);
  });
});
