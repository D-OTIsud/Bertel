import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { listExplorerCards } from '../../services/rpc';
import { buildObjectSearchFilters, normalizeObjectSearchResults, useObjectSearch } from './useObjectSearch';

jest.mock('../../services/rpc', () => ({
  listExplorerCards: jest.fn(),
}));

jest.mock('../../store/session-store', () => ({
  useSessionStore: (selector: (state: { langPrefs: string[] }) => unknown) => selector({ langPrefs: ['fr'] }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useObjectSearch', () => {
  beforeEach(() => {
    jest.mocked(listExplorerCards).mockResolvedValue([
      { id: 'o1', name: 'Grand Air', type: 'HOT', status: 'published', location: { city: 'Saint-Pierre' } },
      { id: 'self', name: 'Self', type: 'HOT', status: 'draft', location: { city: 'Saint-Pierre' } },
    ]);
  });

  it('builds filters for the explorer list RPC', () => {
    expect(buildObjectSearchFilters(' grand ', ['HOT']).common.search).toBe('grand');
    expect(buildObjectSearchFilters('grand', ['HOT']).selectedBuckets).toEqual(['HOT']);
  });

  it('normalizes cards and removes the current object', () => {
    const results = normalizeObjectSearchResults([
      { id: 'self', name: 'Self', type: 'HOT' },
      { id: 'o1', name: 'Grand Air', type: 'HOT', location: { city: 'Saint-Pierre' } },
    ], 'self');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'o1', name: 'Grand Air', type: 'HOT', status: '', city: 'Saint-Pierre', code: 'o1' });
  });

  it('carries the full explorer card so consumers can enrich without refetching', () => {
    const card = {
      id: 'o1',
      name: 'Grand Air',
      type: 'HOT',
      image: 'https://img/grand-air.jpg',
      description: 'Vue mer',
      location: { city: 'Saint-Pierre', lat: -21.3, lon: 55.5 },
    };
    const results = normalizeObjectSearchResults([card]);

    expect(results[0].card).toBe(card);
  });

  it('returns debounced search results', async () => {
    const { result } = renderHook(() => useObjectSearch('grand', { debounceMs: 0, currentObjectId: 'self' }), { wrapper });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].name).toBe('Grand Air');
  });
});
