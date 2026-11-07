import { findPendingFieldChange } from './pending-field-change';
import type { ObjectWorkspaceModerationItem } from '../../../services/object-workspace-parser';

const item = (partial: Partial<ObjectWorkspaceModerationItem>): ObjectWorkspaceModerationItem => ({
  id: '1',
  targetTable: 'object_location',
  action: 'update',
  status: 'pending',
  submittedAt: '',
  reviewedAt: '',
  appliedAt: '',
  reviewNote: '',
  summary: '',
  field: '',
  beforeValue: '',
  afterValue: '',
  submittedByLabel: '',
  ...partial,
});

describe('findPendingFieldChange', () => {
  it('matches lieu_dit aliases', () => {
    const found = findPendingFieldChange(
      [item({ field: 'lieu_dit', beforeValue: 'Bras-Long', afterValue: 'Bras Long' })],
      'lieuDit',
    );
    expect(found?.afterValue).toBe('Bras Long');
  });

  it('ignores non-pending rows', () => {
    const found = findPendingFieldChange([item({ field: 'lieu_dit', status: 'approved' })], 'lieuDit');
    expect(found).toBeUndefined();
  });
});
