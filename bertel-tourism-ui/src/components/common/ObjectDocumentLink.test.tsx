import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ObjectDocumentLink } from './ObjectDocumentLink';
import { getObjectDocumentUrl } from '../../services/object-documents';
import { useSessionStore } from '../../store/session-store';

jest.mock('../../services/object-documents', () => ({ getObjectDocumentUrl: jest.fn() }));
const HREF = 'https://storage.example.invalid/storage/v1/object/public/old_legal_media/synthetic.pdf';
const SIGNED = 'https://storage.example.invalid/object/sign/private?token=synthetic';

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function tab() {
  return { opener: {} as unknown, closed: false, close: jest.fn(), location: { replace: jest.fn() } };
}
const link = (objectId = 'object-a', documentId = 'document-a', href = HREF) =>
  <ObjectDocumentLink objectId={objectId} documentId={documentId} href={href}>Voir le justificatif</ObjectDocumentLink>;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ userId: 'synthetic-a', orgId: 'ORG-a', status: 'ready', role: 'tourism_agent', canEditObjects: true });
});
afterEach(() => jest.restoreAllMocks());

it('keeps ordinary public links unchanged and does not request a private URL', () => {
  render(link('object-a', 'document-a', 'https://example.invalid/public.pdf'));
  expect(screen.getByRole('link', { name: 'Voir le justificatif' })).toHaveAttribute('href', 'https://example.invalid/public.pdf');
  expect(getObjectDocumentUrl).not.toHaveBeenCalled();
});

it('opens the blank tab synchronously, detaches its opener, then navigates only after authorization', async () => {
  const target = tab();
  jest.spyOn(window, 'open').mockReturnValue(target as never);
  const response = deferred();
  jest.mocked(getObjectDocumentUrl).mockReturnValue(response.promise);
  render(link());
  fireEvent.click(screen.getByRole('button', { name: 'Voir le justificatif' }));
  expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
  expect(target.opener).toBeNull();
  expect(screen.getByRole('button', { name: 'Ouverture…' })).toBeDisabled();
  expect(target.location.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ouverture…' }));
  expect(getObjectDocumentUrl).toHaveBeenCalledTimes(1);
  await act(async () => { response.resolve(SIGNED); });
  expect(target.location.replace).toHaveBeenCalledWith(SIGNED);
  expect(screen.getByRole('button', { name: 'Voir le justificatif' })).toBeEnabled();
});

it('closes a failed blank tab, leaves an inline retry, and gets a fresh URL on retry', async () => {
  const first = tab(); const second = tab();
  jest.spyOn(window, 'open').mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);
  jest.mocked(getObjectDocumentUrl).mockRejectedValueOnce(new Error('Synthetic denied')).mockResolvedValueOnce(SIGNED);
  render(link());
  fireEvent.click(screen.getByRole('button', { name: 'Voir le justificatif' }));
  await screen.findByRole('alert');
  expect(first.close).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(second.location.replace).toHaveBeenCalledWith(SIGNED));
  expect(getObjectDocumentUrl).toHaveBeenCalledTimes(2);
});

it.each(['account', 'org', 'role', 'object', 'document', 'unmount'])('never navigates a late private result after %s changes', async (transition) => {
  const target = tab();
  jest.spyOn(window, 'open').mockReturnValue(target as never);
  const response = deferred();
  jest.mocked(getObjectDocumentUrl).mockReturnValue(response.promise);
  const view = render(link());
  fireEvent.click(screen.getByRole('button', { name: 'Voir le justificatif' }));
  const signal = jest.mocked(getObjectDocumentUrl).mock.calls[0][2]!;
  if (transition === 'account') act(() => useSessionStore.setState({ userId: 'synthetic-b' }));
  else if (transition === 'org') act(() => useSessionStore.setState({ orgId: 'ORG-b' }));
  else if (transition === 'role') act(() => useSessionStore.setState({ role: 'actor' }));
  else if (transition === 'object') view.rerender(link('object-b'));
  else if (transition === 'document') view.rerender(link('object-a', 'document-b'));
  else view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { response.resolve(SIGNED); });
  expect(target.location.replace).not.toHaveBeenCalled();
  expect(target.close).toHaveBeenCalled();
});

it('does not issue a URL when the browser blocks the new tab', () => {
  jest.spyOn(window, 'open').mockReturnValue(null);
  render(link());
  fireEvent.click(screen.getByRole('button', { name: 'Voir le justificatif' }));
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(getObjectDocumentUrl).not.toHaveBeenCalled();
});

it('requests the legal context only when that existing entry point explicitly selects it', async () => {
  const target = tab();
  jest.spyOn(window, 'open').mockReturnValue(target as never);
  jest.mocked(getObjectDocumentUrl).mockResolvedValueOnce(SIGNED);
  render(<ObjectDocumentLink objectId="object-a" documentId="document-a" href={HREF} accessContext="legal">Voir le justificatif</ObjectDocumentLink>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Voir le justificatif' })); });
  expect(getObjectDocumentUrl).toHaveBeenCalledWith('object-a', 'document-a', expect.any(AbortSignal), 'legal');
  expect(target.location.replace).toHaveBeenCalledWith(SIGNED);
});

it.each(['account', 'org', 'role'])('an A→B→A %s transition batched into one render cannot revive a pending URL', async (transition) => {
  const target = tab();
  jest.spyOn(window, 'open').mockReturnValue(target as never);
  const response = deferred();
  jest.mocked(getObjectDocumentUrl).mockReturnValue(response.promise);
  render(link());
  fireEvent.click(screen.getByRole('button', { name: 'Voir le justificatif' }));
  const signal = jest.mocked(getObjectDocumentUrl).mock.calls[0][2]!;
  act(() => {
    if (transition === 'account') {
      useSessionStore.setState({ userId: 'synthetic-b' }); useSessionStore.setState({ userId: 'synthetic-a' });
    } else if (transition === 'org') {
      useSessionStore.setState({ orgId: 'ORG-b' }); useSessionStore.setState({ orgId: 'ORG-a' });
    } else {
      useSessionStore.setState({ role: 'actor' }); useSessionStore.setState({ role: 'tourism_agent' });
    }
  });
  expect(signal.aborted).toBe(true);
  await act(async () => { response.resolve(SIGNED); });
  expect(target.location.replace).not.toHaveBeenCalled();
  expect(target.close).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Voir le justificatif' })).toBeEnabled();
});
