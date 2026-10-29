import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmActorDocuments } from './CrmActorDocuments';
import { CrmModal } from './CrmModal';
import { Sheet, SheetContent, SheetTitle } from '../../components/ui/sheet';
import { deleteActorDocument } from '../../services/actor-documents';
import { listActorSupport, type ActorSupportDocument } from '../../services/crm';

jest.mock('../../services/crm', () => ({
  listActorSupport: jest.fn(),
  listObjectDocumentTypes: jest.fn().mockResolvedValue([{ code: 'devis', name: 'Devis' }]),
}));
jest.mock('../../services/actor-documents', () => ({
  deleteActorDocument: jest.fn().mockResolvedValue(undefined),
  getActorDocumentUrl: jest.fn().mockResolvedValue('https://signed.example/doc'),
  promoteActorDocument: jest.fn().mockResolvedValue(undefined),
  uploadActorDocument: jest.fn().mockResolvedValue(undefined),
}));
const mockAccessToken = jest.fn((): string | null => 'token-test');
jest.mock('../../hooks/useSupabaseAccessToken', () => ({ useSupabaseAccessToken: () => mockAccessToken() }));

const firstDocument: ActorSupportDocument = {
  documentId: 'doc-1', title: 'Devis.pdf', status: 'active', notes: null,
  validFrom: null, validTo: null, intendedRoleCode: null, intendedRoleName: null,
  mimeType: 'application/pdf', sizeBytes: 1234, promotedToObjectId: null,
  promotedDocumentId: null, promotedAt: null, createdAt: null,
};
const secondDocument = { ...firstDocument, documentId: 'doc-2', title: 'Plan.pdf' };
const snapshot = (documents = [firstDocument, secondDocument]) => ({ defaultRole: null, documents });

function renderDocuments({ nested = false, canWrite = true } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['crm-actor-support', 'actor-1'], snapshot());
  const onClose = jest.fn();
  const onDrawerClose = jest.fn();
  const content = (actorId = 'actor-1', writable = canWrite) => {
    const documents = <CrmActorDocuments actorId={actorId} canWrite={writable} objects={[]} />;
    return <QueryClientProvider client={client}>
      {nested ? <Sheet open onOpenChange={onDrawerClose}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Suivi CRM</SheetTitle>
          <div className="crm-app"><CrmModal title="Fiche acteur" onClose={onClose}>
            <input aria-label="Brouillon acteur" defaultValue="Marie" />
            {documents}
          </CrmModal></div>
        </SheetContent>
      </Sheet> : documents}
    </QueryClientProvider>;
  };
  const result = render(content());
  return { client, onClose, onDrawerClose, rerenderDocuments: (actorId = 'actor-1', writable = canWrite) => result.rerender(content(actorId, writable)) };
}

beforeEach(() => {
  jest.mocked(deleteActorDocument).mockReset().mockResolvedValue(undefined);
  jest.mocked(listActorSupport).mockReset().mockResolvedValue(snapshot());
  mockAccessToken.mockReturnValue('token-test');
});

async function requestDeletion(title = 'Devis.pdf') {
  const opener = screen.getByRole('button', { name: `Supprimer ${title}` });
  await userEvent.click(opener);
  const confirmation = screen.getByRole('dialog', { name: 'Supprimer le document' });
  return { opener, confirmation, confirm: within(confirmation).getByRole('button', { name: 'Supprimer' }) };
}

it('rend la confirmation partagée avec le nom, la conséquence et Annuler initialement ciblé', async () => {
  renderDocuments();
  const { confirmation, opener } = await requestDeletion();
  expect(confirmation).toHaveClass('app-modal');
  expect(confirmation).toHaveTextContent('Supprimer « Devis.pdf » ? Le fichier sera définitivement effacé.');
  expect(within(confirmation).getByRole('button', { name: 'Annuler' })).toHaveFocus();
  expect(within(confirmation).getByRole('button', { name: 'Supprimer' })).toHaveClass('primary-button--danger');
  expect(deleteActorDocument).not.toHaveBeenCalled();
  await userEvent.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer le document' })).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  expect(deleteActorDocument).not.toHaveBeenCalled();
});

it.each([false, true])('Escape conserve le parent et le brouillon (Sheet=%s)', async (nested) => {
  const { onClose, onDrawerClose } = renderDocuments({ nested });
  if (nested) await userEvent.type(screen.getByLabelText('Brouillon acteur'), ' modifiée');
  const { opener, confirmation } = await requestDeletion();
  expect(within(confirmation).getByRole('button', { name: 'Annuler' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer le document' })).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
  expect(onDrawerClose).not.toHaveBeenCalled();
  if (nested) expect(screen.getByLabelText('Brouillon acteur')).toHaveValue('Marie modifiée');
  expect(deleteActorDocument).not.toHaveBeenCalled();
});

it('un clic hors de la confirmation maison ferme seulement cette confirmation', async () => {
  renderDocuments();
  const { confirmation } = await requestDeletion();
  fireEvent.mouseDown(confirmation.parentElement!);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer le document' })).not.toBeInTheDocument());
  expect(deleteActorDocument).not.toHaveBeenCalled();
});

it('un clic sur le fond Radix conserve le Sheet, sa fiche et son brouillon', async () => {
  const { onClose, onDrawerClose } = renderDocuments({ nested: true });
  await userEvent.type(screen.getByLabelText('Brouillon acteur'), ' modifiée');
  const { confirmation, opener } = await requestDeletion();
  await userEvent.click(confirmation.previousElementSibling!);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer le document' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('Brouillon acteur')).toHaveValue('Marie modifiée');
  expect(opener).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
  expect(onDrawerClose).not.toHaveBeenCalled();
  expect(deleteActorDocument).not.toHaveBeenCalled();
});

it('supprime la bonne cible et invalide uniquement la bibliothèque de son propriétaire', async () => {
  const { client } = renderDocuments();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { confirm } = await requestDeletion('Plan.pdf');
  await userEvent.click(confirm);
  await waitFor(() => expect(deleteActorDocument).toHaveBeenCalledWith({ actorId: 'actor-1', documentId: 'doc-2', accessToken: 'token-test' }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['crm-actor-support', 'actor-1'] });
});

it.each(['permission', 'token', 'owner', 'missing', 'promoted'] as const)('refuse la suppression après changement de %s', async (change) => {
  const { client, rerenderDocuments } = renderDocuments();
  const { confirmation, confirm } = await requestDeletion();
  if (change === 'token') mockAccessToken.mockReturnValue(null);
  if (change === 'owner') client.setQueryData(['crm-actor-support', 'actor-2'], snapshot());
  if (change === 'missing' || change === 'promoted') {
    act(() => client.setQueryData(['crm-actor-support', 'actor-1'], snapshot(change === 'missing' ? [] : [{ ...firstDocument, status: 'promoted' }])));
  }
  rerenderDocuments(change === 'owner' ? 'actor-2' : 'actor-1', change !== 'permission');
  await userEvent.click(confirm);
  expect(within(confirmation).getByRole('alert')).toBeInTheDocument();
  expect(deleteActorDocument).not.toHaveBeenCalled();
});

it('ne propose pas la suppression aux lecteurs ni pour un document transféré', async () => {
  const { client } = renderDocuments({ canWrite: false });
  expect(screen.getByRole('button', { name: 'Supprimer Devis.pdf' })).toBeDisabled();
  act(() => client.setQueryData(['crm-actor-support', 'actor-1'], snapshot([{ ...firstDocument, status: 'promoted' }])));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Supprimer Devis.pdf' })).not.toBeInTheDocument());
});

it('conserve une erreur récupérable et bloque les doubles activations avant le rendu busy', async () => {
  let resolveDelete!: () => void;
  jest.mocked(deleteActorDocument).mockRejectedValueOnce(new Error('Stockage indisponible'))
    .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDelete = resolve; }));
  const { client } = renderDocuments();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { confirmation, confirm } = await requestDeletion();
  await userEvent.click(confirm);
  expect(await within(confirmation).findByRole('alert')).toHaveTextContent('Stockage indisponible');
  expect(invalidate).not.toHaveBeenCalled();
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
  await waitFor(() => expect(deleteActorDocument).toHaveBeenCalledTimes(2));
  expect(confirm).toHaveAttribute('aria-disabled', 'true');
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => resolveDelete());
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
});

it.each([false, true])('après rafraîchissement tardif, déplace le focus vers le document voisin (Sheet=%s)', async (nested) => {
  const { client, onClose, onDrawerClose } = renderDocuments({ nested });
  const { confirm } = await requestDeletion();
  await userEvent.click(confirm);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer le document' })).not.toBeInTheDocument());
  act(() => client.setQueryData(['crm-actor-support', 'actor-1'], snapshot([secondDocument])));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus());
  expect(onClose).not.toHaveBeenCalled();
  expect(onDrawerClose).not.toHaveBeenCalled();
});
