import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObjectEditPage } from './ObjectEditPage';
import type { ObjectEditorState } from './useObjectEditorState';
import type { ObjectWorkspaceResource } from '../../services/object-workspace';

const mockRefetch = jest.fn();
let mockQuery: { data?: ObjectWorkspaceResource; isError: boolean; error?: Error; refetch: typeof mockRefetch; isFetching: boolean };

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectWorkspaceQuery: () => mockQuery,
  usePublishObjectWorkspaceMutation: () => ({}),
  useSetObjectStatusMutation: () => ({}),
  useObjectVersionsQuery: () => ({ data: [] }),
  useRestoreObjectVersionMutation: () => ({}),
}));
jest.mock('../../store/ui-store', () => ({ useUiStore: () => jest.fn() }));
jest.mock('../../store/session-store', () => ({ useSessionStore: () => ['fr'] }));
jest.mock('../../hooks/useToast', () => ({ useToast: () => jest.fn() }));
jest.mock('./useUnsavedDraftGuard', () => ({ useUnsavedDraftGuard: () => ({ confirmLeave: jest.fn() }) }));
jest.mock('./useEditorSave', () => ({ useEditorSave: () => ({ save: jest.fn(), saving: false }) }));
jest.mock('./presence/useEditorPresence', () => ({
  useEditorPresence: () => ({ roster: [], peersBySection: {} }),
}));
jest.mock('./editor-completion', () => ({
  computeSectionCompletions: () => [],
  computeOverallCompletion: () => ({}),
}));
jest.mock('./editor-validation', () => ({ validateForPublication: () => ({ blockers: [], warnings: [] }) }));
jest.mock('./section-config', () => ({ makeSections: () => [] }));
jest.mock('./sections/section-registry', () => ({
  MODE_ESSENTIAL: new Set(),
  getRegisteredSections: () => [{
    num: '01',
    Component: ({ editor }: { editor: ObjectEditorState }) => (
      <input
        aria-label="Nom commercial"
        value={editor.draft.generalInfo.name}
        onChange={(event) => editor.patchModule('generalInfo', { name: event.target.value })}
      />
    ),
  }],
}));
jest.mock('./shell/EditorTopbar', () => ({ EditorTopbar: () => null }));
jest.mock('./shell/EditorNav', () => ({ EditorNav: () => null }));
jest.mock('./shell/EditorRail', () => ({ EditorRail: () => null }));
jest.mock('./widgets/BlockersModal', () => ({ BlockersModal: () => null }));
jest.mock('./widgets/VersionHistoryModal', () => ({ VersionHistoryModal: () => null }));
jest.mock('./widgets/ImportExportModal', () => ({ ImportExportModal: () => null }));
jest.mock('./widgets/PeerSavedBanner', () => ({ PeerSavedBanner: () => null }));

const resource = {
  id: 'HOTRUN1',
  name: 'Nom enregistré',
  type: 'HOT',
  permissions: { generalInfo: { canDirectWrite: true }, publication: { canDirectWrite: true } },
  modules: {
    generalInfo: { name: 'Nom enregistré', status: 'draft', commercialVisibility: 'full' },
    publication: { status: 'draft' },
    syncIdentifiers: { origins: [] },
    providerFollowUp: { notes: [] },
  },
} as unknown as ObjectWorkspaceResource;

beforeEach(() => {
  mockRefetch.mockReset();
  mockQuery = { data: resource, isError: false, refetch: mockRefetch, isFetching: false };
});

it('preserves the unsaved draft while a failed permissions refresh pauses editor interaction', () => {
  const client = new QueryClient();
  const page = () => <QueryClientProvider client={client}><ObjectEditPage objectId="HOTRUN1" /></QueryClientProvider>;
  const { rerender } = render(page());
  fireEvent.change(screen.getByLabelText('Nom commercial'), { target: { value: 'Modification non enregistrée' } });

  mockQuery = { ...mockQuery, isError: true, error: new Error('Vos droits n’ont pas pu être vérifiés.') };
  rerender(page());

  expect(screen.getByRole('alert')).toHaveTextContent('Vos droits n’ont pas pu être vérifiés.');
  const draftInput = screen.getByLabelText('Nom commercial');
  expect(draftInput).toHaveValue('Modification non enregistrée');
  expect(draftInput.closest('[inert]')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);

  mockQuery = { ...mockQuery, isError: false, error: undefined };
  rerender(page());

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nom commercial')).toHaveValue('Modification non enregistrée');
  expect(screen.getByLabelText('Nom commercial').closest('[inert]')).toBeNull();
});

it('blocks initial editor loading when permissions have never been verified', () => {
  mockQuery = { ...mockQuery, data: undefined, isError: true, error: new Error('Vos droits n’ont pas pu être vérifiés.') };
  render(<ObjectEditPage objectId="HOTRUN1" />);

  expect(screen.getByRole('alert')).toHaveTextContent('Vos droits n’ont pas pu être vérifiés.');
  expect(screen.queryByLabelText('Nom commercial')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
