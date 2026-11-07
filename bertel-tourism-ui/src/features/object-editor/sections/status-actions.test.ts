import { computeStatusActions, STATUS_ACTION_CONFIRM, type StatusActionKind } from './status-actions';

it('offers Publier + Archiver from draft', () => {
  expect(computeStatusActions('draft', null)).toEqual([
    { label: 'Publier', target: 'published', kind: 'publish' },
    { label: 'Archiver', target: 'archived', kind: 'archive' },
  ]);
});
it('offers Publier + Archiver from hidden', () => {
  expect(computeStatusActions('hidden', '2026-01-01')).toEqual([
    { label: 'Publier', target: 'published', kind: 'publish' },
    { label: 'Archiver', target: 'archived', kind: 'archive' },
  ]);
});
it('offers Dépublier + Archiver from published', () => {
  expect(computeStatusActions('published', '2026-01-01')).toEqual([
    { label: 'Dépublier', target: 'hidden', kind: 'unpublish' },
    { label: 'Archiver', target: 'archived', kind: 'archive' },
  ]);
});
it('restores an ever-published archived object to hidden', () => {
  expect(computeStatusActions('archived', '2026-01-01')).toEqual([
    { label: 'Restaurer', target: 'hidden', kind: 'restore' },
  ]);
});
it('restores a never-published archived object to draft', () => {
  expect(computeStatusActions('archived', null)).toEqual([
    { label: 'Restaurer', target: 'draft', kind: 'restore' },
  ]);
});

describe('STATUS_ACTION_CONFIRM', () => {
  const KINDS: StatusActionKind[] = ['publish', 'unpublish', 'archive', 'restore'];

  it('carries non-empty confirmation copy for every action kind', () => {
    for (const kind of KINDS) {
      const copy = STATUS_ACTION_CONFIRM[kind];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
      expect(copy.confirmLabel.length).toBeGreaterThan(0);
    }
  });

  it('tints the public-removal actions (unpublish/archive) as danger, the rest default', () => {
    expect(STATUS_ACTION_CONFIRM.unpublish.tone).toBe('danger');
    expect(STATUS_ACTION_CONFIRM.archive.tone).toBe('danger');
    expect(STATUS_ACTION_CONFIRM.publish.tone).toBe('default');
    expect(STATUS_ACTION_CONFIRM.restore.tone).toBe('default');
  });
});
