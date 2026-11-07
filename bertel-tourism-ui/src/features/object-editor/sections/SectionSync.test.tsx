import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SectionSync } from './SectionSync';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceModuleAccess,
  ObjectWorkspacePermissions,
} from '../../../services/object-workspace';
import type { ObjectWorkspaceSyncIdentifiersModule } from '../../../services/object-workspace-parser';

const mockUpsert = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../../hooks/useExplorerQueries', () => ({
  useUpsertExternalIdMutation: () => ({ mutateAsync: mockUpsert, isPending: false }),
  useDeleteExternalIdMutation: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

function makeAccess(over: Partial<ObjectWorkspaceModuleAccess> = {}): ObjectWorkspaceModuleAccess {
  return { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null, ...over };
}

function makeSync(rows: ObjectWorkspaceSyncIdentifiersModule['externalIdentifiers']): ObjectWorkspaceSyncIdentifiersModule {
  return {
    objectCreatedAt: '',
    objectUpdatedAt: '',
    objectUpdatedAtSource: '',
    externalIdentifiers: rows,
    origins: [],
    externalIdentifiersVisibilityNote: null,
    originsVisibilityNote: null,
  };
}

function row(over: Partial<ObjectWorkspaceSyncIdentifiersModule['externalIdentifiers'][number]>) {
  return {
    id: 'r1',
    organizationObjectId: 'ORG1',
    sourceSystem: 'AT',
    externalId: 'recABC',
    lastSyncedAt: '',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function renderSection(opts: { admin: boolean; rows: ObjectWorkspaceSyncIdentifiersModule['externalIdentifiers'] }) {
  const sync = makeSync(opts.rows);
  const replaceModule = jest.fn();
  const editor = {
    draft: { syncIdentifiers: sync },
    replaceModule,
  } as unknown as SectionProps['editor'];
  const permissions = {
    syncIdentifiers: makeAccess({
      canDirectWrite: opts.admin,
      disabledReason: opts.admin ? null : "Réservé aux administrateurs d'organisation.",
    }),
  } as unknown as ObjectWorkspacePermissions;

  render(
    <QueryClientProvider client={new QueryClient()}>
      <SectionSync editor={editor} permissions={permissions} objectId="HOT1" />
    </QueryClientProvider>,
  );
  return { replaceModule };
}

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue('r-new');
  mockDelete.mockReset().mockResolvedValue(undefined);
});

describe('SectionSync §22', () => {
  it('keeps the CTA disabled with the permission reason for a non-admin', () => {
    renderSection({ admin: false, rows: [] });
    const cta = screen.getByRole('button', { name: /Lier un nouvel identifiant externe/i });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('title', "Réservé aux administrateurs d'organisation.");
  });

  it('enables the CTA for an admin and opens the add modal', () => {
    renderSection({ admin: true, rows: [] });
    const cta = screen.getByRole('button', { name: /Lier un nouvel identifiant externe/i });
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(screen.getByText('Lier un nouvel identifiant externe', { selector: 'h2, [role="heading"]' })).toBeInTheDocument();
  });

  it('disables the per-row edit action on a canonical row even for an admin', () => {
    renderSection({ admin: true, rows: [row({ id: 'oti', sourceSystem: 'OTI', externalId: 'oti-1' })] });
    expect(screen.getByRole('button', { name: 'Modifier cet identifiant' })).toBeDisabled();
  });

  it('calls the upsert mutation when an admin saves a new identifier', async () => {
    renderSection({ admin: true, rows: [] });
    fireEvent.click(screen.getByRole('button', { name: /Lier un nouvel identifiant externe/i }));
    fireEvent.change(screen.getByLabelText('Identifiant externe'), { target: { value: 'recNEW1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Identifiant externe enregistr/i)).toBeInTheDocument();
    expect(mockUpsert).toHaveBeenCalledWith({ sourceSystem: 'AT', externalId: 'recNEW1', lastSyncedAt: null });
  });

  it('calls the delete mutation after confirming on a non-canonical row', async () => {
    renderSection({ admin: true, rows: [row({ id: 'r9', sourceSystem: 'AP', externalId: '12345' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer cet identifiant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText(/Identifiant externe supprim/i)).toBeInTheDocument();
    expect(mockDelete).toHaveBeenCalledWith('r9');
  });
});
