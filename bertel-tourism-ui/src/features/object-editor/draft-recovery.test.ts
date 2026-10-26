import { mergeDraftAgainstServer } from './draft-recovery';

describe('mergeDraftAgainstServer', () => {
  it('keeps local edits and concurrent server additions by stable row identity', () => {
    const merged = mergeDraftAgainstServer(
      { rows: [{ recordId: 'a', name: 'old' }] },
      { rows: [{ recordId: 'a', name: 'local' }] },
      { rows: [{ recordId: 'a', name: 'old' }, { recordId: 'b', name: 'new elsewhere' }] },
    );
    expect(merged.value.rows).toEqual([{ recordId: 'a', name: 'local' }, { recordId: 'b', name: 'new elsewhere' }]);
    expect(merged.conflicts).toEqual([]);
  });

  it('preserves conflicting local intent and reports its path', () => {
    const merged = mergeDraftAgainstServer(
      { title: 'old', rows: [{ uid: 'x', label: 'old' }] },
      { title: 'mine', rows: [] },
      { title: 'theirs', rows: [{ uid: 'x', label: 'changed elsewhere' }] },
    );
    expect(merged.value).toEqual({ title: 'mine', rows: [] });
    expect(merged.conflicts).toEqual(['title', 'rows[x]']);
  });

  it('does not resurrect a server-deleted row the local draft never edited', () => {
    const merged = mergeDraftAgainstServer(
      { rows: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }] },
      { rows: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }] },
      { rows: [{ uid: 'b', name: 'B revised elsewhere' }] },
    );
    expect(merged.value.rows).toEqual([{ uid: 'b', name: 'B revised elsewhere' }]);
    expect(merged.conflicts).toEqual([]);
  });

  it('preserves a local reorder and treats duplicate row identities as ambiguous', () => {
    const reordered = mergeDraftAgainstServer(
      { rows: [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }] },
      { rows: [{ uid: 'b', name: 'B local' }, { uid: 'a', name: 'A' }] },
      { rows: [{ uid: 'a', name: 'A revised elsewhere' }, { uid: 'b', name: 'B' }] },
    );
    expect(reordered.value.rows.map((row) => row.uid)).toEqual(['b', 'a']);
    expect(reordered.conflicts).toEqual([]);

    const duplicate = [{ uid: 'a', name: 'first' }, { uid: 'a', name: 'second' }];
    const ambiguous = mergeDraftAgainstServer({ rows: [] }, { rows: duplicate }, { rows: [] });
    expect(ambiguous.value.rows).toEqual(duplicate);
    expect(ambiguous.conflicts).toEqual(['rows']);
  });
});
