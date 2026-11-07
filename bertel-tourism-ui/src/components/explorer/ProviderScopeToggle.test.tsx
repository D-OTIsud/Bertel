import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';
import { useDashboardExplorerStore, useExplorerStore } from '../../store/explorer-store';
import { useProviderScopeStore } from '../../store/provider-scope-store';
import { saveProviderPreference } from '../../services/provider-preference';

jest.mock('../../services/provider-preference', () => ({ saveProviderPreference: jest.fn() }));

beforeEach(() => {
  useProviderScopeStore.getState().clear();
  useExplorerStore.getState().resetAll();
  useDashboardExplorerStore.getState().resetAll();
  useProviderScopeStore.getState().initialize('user', false);
  jest.mocked(saveProviderPreference).mockReset().mockResolvedValue(undefined);
});

it.each([['explorateur', useExplorerStore], ['dashboard', useDashboardExplorerStore]] as const)('place le toggle sous les choix dans le même bloc Catégorie — %s', async (_, useStore) => {
  render(<FiltersPanel useStore={useStore} />);
  const toggle = screen.getByRole('switch', { name: 'Avec prestataire uniquement' });
  const section = toggle.closest('section')!;
  expect(within(section).getByText('Catégorie')).toBeInTheDocument();
  const services = within(section).getByRole('button', { name: 'Services' });
  expect(services.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  await waitFor(() => expect(saveProviderPreference).toHaveBeenCalledWith(true));
  await waitFor(() => expect(toggle).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
  expect(toggle).toHaveAttribute('aria-checked', 'true');
});

it('rend l’état d’enregistrement puis l’échec sans promettre un choix enregistré', async () => {
  let reject!: (reason: Error) => void;
  jest.mocked(saveProviderPreference).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  render(<FiltersPanel />);
  const toggle = screen.getByRole('switch', { name: 'Avec prestataire uniquement' });
  fireEvent.click(toggle);
  expect(toggle).toBeDisabled();
  expect(screen.getByText('Enregistrement…')).toBeInTheDocument();
  await act(async () => reject(new Error('offline')));
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('alert')).toHaveTextContent('Réessayez');
});
