import { act, renderHook, waitFor } from '@testing-library/react';
import { portalWelcomeKey, usePortalWelcome } from './usePortalWelcome';

beforeEach(() => window.localStorage.clear());
test('le premier passage s’efface après validation et reste propre à chaque compte', async () => {
  const view = renderHook(({ userId }) => usePortalWelcome(userId), { initialProps: { userId: 'actor-a' } });
  await waitFor(() => expect(view.result.current.show).toBe(true));
  act(() => view.result.current.dismiss());
  expect(window.localStorage.getItem(portalWelcomeKey('actor-a'))).toBe('1');
  expect(view.result.current.show).toBe(false);
  view.rerender({ userId: 'actor-b' });
  await waitFor(() => expect(view.result.current.show).toBe(true));
  view.rerender({ userId: 'actor-a' });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  expect(view.result.current.show).toBe(false);
});

test('un stockage indisponible n’empêche pas de rejoindre la fiche', async () => {
  const failure = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  try {
    const view = renderHook(() => usePortalWelcome('actor'));
    await waitFor(() => expect(view.result.current.show).toBe(true));
    act(() => view.result.current.dismiss());
    expect(view.result.current.show).toBe(false);
  } finally { failure.mockRestore(); }
});
