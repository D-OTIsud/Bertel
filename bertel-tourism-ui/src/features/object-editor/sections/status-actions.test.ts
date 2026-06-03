import { computeStatusActions } from './status-actions';

it('offers Publier + Archiver from draft', () => {
  expect(computeStatusActions('draft', null)).toEqual([
    { label: 'Publier', target: 'published' },
    { label: 'Archiver', target: 'archived' },
  ]);
});
it('offers Dépublier + Archiver from published', () => {
  expect(computeStatusActions('published', '2026-01-01')).toEqual([
    { label: 'Dépublier', target: 'hidden' },
    { label: 'Archiver', target: 'archived' },
  ]);
});
it('restores an ever-published archived object to hidden', () => {
  expect(computeStatusActions('archived', '2026-01-01')).toEqual([{ label: 'Restaurer', target: 'hidden' }]);
});
it('restores a never-published archived object to draft', () => {
  expect(computeStatusActions('archived', null)).toEqual([{ label: 'Restaurer', target: 'draft' }]);
});
