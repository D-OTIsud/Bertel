import { computePlacesReconcile } from './object-workspace';
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
