import { act, renderHook } from '@testing-library/react';
import { usePresence } from './usePresence';

jest.mock('./useMediaQuery', () => ({ useMediaQuery: jest.fn(() => false) }));
import { useMediaQuery } from './useMediaQuery';

beforeEach(() => {
  jest.useFakeTimers();
  (useMediaQuery as jest.Mock).mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('usePresence', () => {
  it('mounts immediately as "entering" then moves to "open" on the next frame', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: false },
    });
    expect(result.current.shouldRender).toBe(false);

    rerender({ visible: true });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe('entering');

    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.phase).toBe('open');
  });

  it('stays mounted as "exiting" for exitDurationMs then unmounts', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: true },
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.phase).toBe('open');

    rerender({ visible: false });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe('exiting');

    act(() => {
      jest.advanceTimersByTime(179);
    });
    expect(result.current.shouldRender).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.shouldRender).toBe(false);
  });

  it('cancels a stale exit timer on rapid close/reopen', () => {
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: true },
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });

    rerender({ visible: false }); // start exiting
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ visible: true }); // reopen before the exit timer fires
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.phase).toBe('entering');

    act(() => {
      jest.advanceTimersByTime(180); // the stale exit timer's original deadline
    });
    expect(result.current.shouldRender).toBe(true); // must NOT have unmounted
  });

  it('unmounts on the next tick without delay under reduced motion', () => {
    (useMediaQuery as jest.Mock).mockReturnValue(true);
    const { result, rerender } = renderHook(({ visible }) => usePresence(visible, 180), {
      initialProps: { visible: true },
    });
    act(() => {
      jest.advanceTimersByTime(20);
    });

    rerender({ visible: false });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current.shouldRender).toBe(false);
  });
});
