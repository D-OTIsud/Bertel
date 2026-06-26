jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));

import type { ExplorerFilters } from '../types/domain';
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { DEFAULT_EXPLORER_FILTERS, EXPLORER_BUCKET_TYPE_MAP } from '../utils/facets';
import {
  EXPLORER_BUCKET_CURSOR_DONE,
  explorerCardsHasNextPage,
  fetchExplorerCardsPage,
  listObjectMarkers,
} from './rpc';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

function buildFilters(overrides: Partial<ExplorerFilters> = {}): ExplorerFilters {
  return {
    ...DEFAULT_EXPLORER_FILTERS,
    ...overrides,
    common: { ...DEFAULT_EXPLORER_FILTERS.common, ...overrides.common },
    selectedBuckets: overrides.selectedBuckets ?? ['RES'],
  };
}

describe('listObjectMarkers (§125 — map data source)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('calls list_object_markers per selected bucket with the bucket types and returns normalized cards', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'RESRUN1', type: 'RES', name: 'Resto', image: 'u', open_now: true, location: { lat: -21.1, lon: 55.5, city: 'Saint-Denis' } },
      ],
      error: null,
    });

    const cards = await listObjectMarkers(buildFilters({ selectedBuckets: ['RES'] }));

    expect(rpc).toHaveBeenCalledWith(
      'list_object_markers',
      expect.objectContaining({ p_types: EXPLORER_BUCKET_TYPE_MAP.RES }),
    );
    expect(cards).toEqual([
      {
        id: 'RESRUN1',
        type: 'RES',
        name: 'Resto',
        image: 'u',
        open_now: true,
        location: { lat: -21.1, lon: 55.5, city: 'Saint-Denis' },
      },
    ]);
  });

  it('dedupes markers returned for overlapping buckets', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'DUP', type: 'RES', name: 'A', location: { lat: 1, lon: 2, city: 'X' } }],
      error: null,
    });
    const cards = await listObjectMarkers(buildFilters({ selectedBuckets: ['RES', 'HOT'] }));
    expect(cards.filter((c) => c.id === 'DUP')).toHaveLength(1);
  });

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listObjectMarkers(buildFilters())).rejects.toBeDefined();
  });
});

describe('fetchExplorerCardsPage + explorerCardsHasNextPage (§125 — composite cursor)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('advances the per-bucket cursor and carries it forward', async () => {
    rpc.mockResolvedValue({
      data: { meta: { next_cursor: 'cursor-2' }, data: [{ id: 'RESRUN1', type: 'RES', name: 'A' }] },
      error: null,
    });

    const filters = buildFilters({ selectedBuckets: ['RES'] });
    const page = await fetchExplorerCardsPage(filters, ['fr'], {});

    expect(page.cards.map((c) => c.id)).toEqual(['RESRUN1']);
    expect(page.cursors.RES).toBe('cursor-2');
    expect(explorerCardsHasNextPage(filters, page.cursors)).toBe(true);
  });

  it('marks a bucket DONE when the server returns no next cursor and stops pagination', async () => {
    rpc.mockResolvedValue({
      data: { meta: { next_cursor: null }, data: [{ id: 'RESRUN1', type: 'RES', name: 'A' }] },
      error: null,
    });

    const filters = buildFilters({ selectedBuckets: ['RES'] });
    const page = await fetchExplorerCardsPage(filters, ['fr'], {});

    expect(page.cursors.RES).toBe(EXPLORER_BUCKET_CURSOR_DONE);
    expect(explorerCardsHasNextPage(filters, page.cursors)).toBe(false);
  });
});
