import { act } from '@testing-library/react';
import { clearCardCache, loadCardCache, saveCardCache } from '@/lib/card-cache-storage';
import { useCardCacheStore } from '@/store/card-cache-store';

jest.mock('@/lib/card-cache-storage', () => ({
  loadCardCache: jest.fn(),
  saveCardCache: jest.fn(),
  clearCardCache: jest.fn(),
}));

const loadCardCacheMock = loadCardCache as jest.MockedFunction<typeof loadCardCache>;
const saveCardCacheMock = saveCardCache as jest.MockedFunction<typeof saveCardCache>;
const clearCardCacheMock = clearCardCache as jest.MockedFunction<typeof clearCardCache>;

describe('card-cache-store', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    loadCardCacheMock.mockResolvedValue({ cards: [], savedAt: null });
    saveCardCacheMock.mockResolvedValue(undefined);
    clearCardCacheMock.mockResolvedValue(undefined);
    act(() => {
      void useCardCacheStore.getState().clear();
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mergeCards adds cards by id', async () => {
    await act(async () => {
      await useCardCacheStore.getState().hydrate('buster-1');
    });
    act(() => {
      useCardCacheStore.getState().mergeCards([{ id: 'a', type: 'HOT', name: 'One' }]);
    });
    expect(useCardCacheStore.getState().cards.get('a')?.name).toBe('One');
  });

  it('mergeCards updates an existing id', async () => {
    await act(async () => {
      await useCardCacheStore.getState().hydrate('buster-1');
    });
    act(() => {
      useCardCacheStore.getState().mergeCards([{ id: 'a', type: 'HOT', name: 'One' }]);
      useCardCacheStore.getState().mergeCards([{ id: 'a', type: 'HOT', name: 'Two' }]);
    });
    expect(useCardCacheStore.getState().cards.get('a')?.name).toBe('Two');
  });

  it('clear empties the map', async () => {
    await act(async () => {
      await useCardCacheStore.getState().hydrate('buster-1');
    });
    act(() => {
      useCardCacheStore.getState().mergeCards([{ id: 'a', type: 'HOT', name: 'One' }]);
    });
    await act(async () => {
      await useCardCacheStore.getState().clear();
    });
    expect(useCardCacheStore.getState().cards.size).toBe(0);
    expect(clearCardCacheMock).toHaveBeenCalled();
  });

  it('debounces saveCardCache after mergeCards', async () => {
    await act(async () => {
      await useCardCacheStore.getState().hydrate('buster-1');
    });
    act(() => {
      useCardCacheStore.getState().mergeCards([{ id: 'a', type: 'HOT', name: 'One' }]);
    });
    expect(saveCardCacheMock).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(saveCardCacheMock).toHaveBeenCalledWith(
      'buster-1',
      expect.arrayContaining([expect.objectContaining({ id: 'a' })]),
    );
  });
});
