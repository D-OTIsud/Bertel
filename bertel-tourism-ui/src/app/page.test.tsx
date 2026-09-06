import { render, waitFor } from '@testing-library/react';
import HomePage from './page';
const mockReplace = jest.fn();
let mockStatus = 'guest';
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/store/session-store', () => ({ useSessionStore: (selector: (state: unknown) => unknown) => selector({ status: mockStatus, role: 'owner' }) }));
jest.mock('@/components/auth/SessionScreen', () => ({ SessionScreen: () => null }));
beforeEach(() => { mockReplace.mockClear(); window.history.replaceState({}, '', '/'); });
it.each(['guest', 'ready', 'booting'])('?test=true opens discovery even when session is %s', async (status) => {
  mockStatus = status;
  window.history.replaceState({}, '', '/?test=true');
  render(<HomePage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/test'));
  expect(mockReplace).not.toHaveBeenCalledWith('/login');
  expect(mockReplace).not.toHaveBeenCalledWith('/dashboard');
});
it('does not treat ?test=false as discovery', async () => {
  mockStatus = 'guest';
  window.history.replaceState({}, '', '/?test=false');
  render(<HomePage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
});
