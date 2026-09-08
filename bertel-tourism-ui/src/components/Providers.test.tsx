import { act, render, screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/app/query-client';
import { useSessionStore } from '@/store/session-store';
import { Providers } from './Providers';

jest.mock('@/components/common/AppBootstrap', () => ({ AppBootstrap: () => null }));
jest.mock('@/components/common/ThemeBootstrap', () => ({ ThemeBootstrap: () => null }));
jest.mock('@/components/common/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('sonner', () => ({ Toaster: () => null }));

afterEach(() => queryClient.clear());

it('removes mounted test actor results while the new production directory loads', async () => {
  useSessionStore.setState({
    status: 'ready', userId: 'test-user', orgId: 'ORG-TEST', isTestRealm: true, role: 'tourism_agent',
  });
  queryClient.setQueryData(['crm-directory'], ['Test actor']);
  let resolveProduction!: (actors: string[]) => void;
  const loadDirectory = jest.fn(() => new Promise<string[]>((resolve) => { resolveProduction = resolve; }));

  function Directory() {
    const { data } = useQuery({ queryKey: ['crm-directory'], queryFn: loadDirectory });
    return <div>{data?.join(', ') ?? 'Loading directory'}</div>;
  }

  render(<Providers><Directory /></Providers>);
  expect(screen.getByText('Test actor')).toBeInTheDocument();

  act(() => {
    useSessionStore.setState({ userId: 'production-user', orgId: 'ORG-PRODUCTION', isTestRealm: false });
  });

  expect(screen.queryByText('Test actor')).not.toBeInTheDocument();
  expect(screen.getByText('Loading directory')).toBeInTheDocument();
  await waitFor(() => expect(loadDirectory).toHaveBeenCalled());
  await act(async () => { resolveProduction(['Real actor']); });
  await screen.findByText('Real actor');
});
