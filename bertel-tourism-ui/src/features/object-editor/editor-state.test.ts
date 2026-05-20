import { cloneModules, isModuleDirty, getDirtySections } from './editor-state';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

function fixtureModules(): ObjectWorkspaceModules {
  // Minimal: only the fields the helpers read. Cast through unknown — the helpers
  // serialize generically and never inspect module shape.
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    taxonomy: { assignments: [] },
    contacts: { objectItems: [] },
  } as unknown as ObjectWorkspaceModules;
}

describe('editor-state helpers', () => {
  it('cloneModules produces a deep, independent copy', () => {
    const base = fixtureModules();
    const copy = cloneModules(base);
    expect(copy).toEqual(base);
    expect(copy).not.toBe(base);
    expect(copy.contacts).not.toBe(base.contacts);
  });

  it('isModuleDirty is false for equal modules, true after a change', () => {
    const baseline = fixtureModules();
    const draft = cloneModules(baseline);
    const snapshot = { objectId: 'o1', baseline, draft };
    expect(isModuleDirty(snapshot, 'contacts')).toBe(false);
    (draft.contacts as { objectItems: unknown[] }).objectItems.push({});
    expect(isModuleDirty(snapshot, 'contacts')).toBe(true);
  });

  it('getDirtySections flags exactly the changed modules', () => {
    const baseline = fixtureModules();
    const draft = cloneModules(baseline);
    (draft.contacts as { objectItems: unknown[] }).objectItems.push({});
    const dirty = getDirtySections({ objectId: 'o1', baseline, draft });
    expect(dirty.contacts).toBe(true);
    expect(dirty.location).toBe(false);
  });
});
