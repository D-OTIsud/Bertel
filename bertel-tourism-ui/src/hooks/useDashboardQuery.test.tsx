import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDashboardQuery } from './useDashboardQuery';
import type { DashboardStatsParams } from '../lib/dashboard-stats-params';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useDashboardQuery', () => {
  const params: DashboardStatsParams = {
    p_types: ['HOT'],
    p_status: ['published'],
    p_filters: {},
    p_updated_at_from: null,
    p_updated_at_to: null,
  };

  it('retourne les données du fetcher', async () => {
    const fetcher = jest.fn().mockResolvedValue({ total: 42 });
    const { result } = renderHook(
      () => useDashboardQuery('scorecards', params, fetcher),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.data).toEqual({ total: 42 }));
    expect(fetcher).toHaveBeenCalledWith(params);
  });

  it('expose error quand le fetcher rejette', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () => useDashboardQuery('scorecards', params, fetcher),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });

  it('ne fetch pas quand enabled=false', () => {
    const fetcher = jest.fn().mockResolvedValue({});
    const { result } = renderHook(
      () => useDashboardQuery('scorecards', params, fetcher, false),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
