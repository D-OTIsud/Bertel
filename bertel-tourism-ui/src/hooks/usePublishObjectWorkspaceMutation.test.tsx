import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../services/object-workspace', () => ({ publishObjectWorkspace: jest.fn() }));

import { publishObjectWorkspace } from '../services/object-workspace';
import { usePublishObjectWorkspaceMutation } from './useExplorerQueries';
import { useSessionStore } from '../store/session-store';

const publish = publishObjectWorkspace as jest.Mock;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('usePublishObjectWorkspaceMutation', () => {
  const originalFetch = global.fetch;
  const originalDemoMode = useSessionStore.getState().demoMode;

  beforeEach(() => {
    useSessionStore.setState({ demoMode: false });
    publish.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    useSessionStore.setState({ demoMode: originalDemoMode });
  });

  it('does not publish if the app-version endpoint is missing or incompatible', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ minimumClientVersion: 1, writeContractVersion: 0 }),
    } as unknown as Response);
    const { result } = renderHook(() => usePublishObjectWorkspaceMutation('obj-1'), { wrapper });

    await expect(act(() => result.current.mutateAsync(true))).rejects.toThrow(/version|compatibilité/i);
    expect(publish).not.toHaveBeenCalled();
  });
});
