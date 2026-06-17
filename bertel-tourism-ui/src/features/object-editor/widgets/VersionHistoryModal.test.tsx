import { render, screen, fireEvent } from '@testing-library/react';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { ObjectVersionRow } from '../../../services/object-versions';

jest.mock('../../../services/object-versions', () => {
  const actual = jest.requireActual('../../../services/object-versions');
  return { ...actual, getObjectVersionSnapshot: jest.fn() };
});
import { getObjectVersionSnapshot } from '../../../services/object-versions';
const mockSnapshot = getObjectVersionSnapshot as jest.Mock;

const VERSIONS: ObjectVersionRow[] = [
  { versionNumber: 3, createdAt: '2026-06-17T10:00:00Z', createdByName: 'Alice', changeType: 'update', changeReason: '', changedFields: ['name'] },
  { versionNumber: 2, createdAt: '2026-06-16T09:00:00Z', createdByName: '', changeType: 'update', changeReason: '', changedFields: ['region_code'] },
  { versionNumber: 1, createdAt: '2026-06-15T08:00:00Z', createdByName: 'Bob', changeType: 'insert', changeReason: '', changedFields: [] },
];

function setup(overrides: Partial<React.ComponentProps<typeof VersionHistoryModal>> = {}) {
  const onClose = jest.fn();
  const onRestore = jest.fn();
  render(
    <VersionHistoryModal
      open
      onClose={onClose}
      objectId="PCURUN0000000001"
      versions={VERSIONS}
      isLoading={false}
      canRestore
      restoringVersion={null}
      onRestore={onRestore}
      {...overrides}
    />,
  );
  return { onClose, onRestore };
}

describe('VersionHistoryModal', () => {
  beforeEach(() => mockSnapshot.mockReset());

  it('renders a timeline row per version with number, author, and change type', () => {
    setup();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getAllByText('Modification').length).toBeGreaterThan(0);
    expect(screen.getByText('Création')).toBeInTheDocument();
  });

  it('fetches both snapshots and renders the canonical diff when a version is expanded', async () => {
    mockSnapshot.mockImplementation((_id: string, n: number) =>
      Promise.resolve(n === 3 ? { name: 'New', region_code: 'RUN' } : { name: 'Old', region_code: 'RUN' }),
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Voir les changements de la version 3/i }));
    expect(await screen.findByText('name')).toBeInTheDocument();
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(mockSnapshot).toHaveBeenCalledWith('PCURUN0000000001', 3);
    expect(mockSnapshot).toHaveBeenCalledWith('PCURUN0000000001', 2);
  });

  it('shows the canonical-only restore warning and fires onRestore', () => {
    const { onRestore } = setup();
    expect(screen.getByText(/champs principaux uniquement/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Restaurer la version 1/i }));
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('disables restore with the supplied reason when canRestore is false', () => {
    setup({ canRestore: false, restoreDisabledReason: 'Lecture seule.' });
    const btn = screen.getByRole('button', { name: /Restaurer la version 1/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Lecture seule.');
  });

  it('renders an empty state when there are no versions', () => {
    setup({ versions: [] });
    expect(screen.getByText(/Aucun historique/i)).toBeInTheDocument();
  });
});
