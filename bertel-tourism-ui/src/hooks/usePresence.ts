'use client';

import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

export type PresencePhase = 'entering' | 'open' | 'exiting';

export interface PresenceState {
  shouldRender: boolean;
  phase: PresencePhase;
}

/**
 * Keeps a surface mounted through its exit animation instead of unmounting on
 * the same render `visible` flips false. `entering` -> `open` happens on the
 * next animation frame (so the initial CSS state actually paints before the
 * transition kicks in); `exiting` holds for `exitDurationMs` then unmounts.
 * Reduced motion skips both delays — mount/unmount track `visible` directly.
 */
export function usePresence(visible: boolean, exitDurationMs: number): PresenceState {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [shouldRender, setShouldRender] = useState(visible);
  const [phase, setPhase] = useState<PresencePhase>(visible ? 'open' : 'exiting');

  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearPending() {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    clearPending();

    if (visible) {
      setShouldRender(true);
      if (prefersReducedMotion) {
        setPhase('open');
        return clearPending;
      }
      setPhase('entering');
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setPhase('open');
      });
    } else {
      if (!shouldRender) {
        return clearPending;
      }
      if (prefersReducedMotion) {
        setShouldRender(false);
        setPhase('exiting');
        return clearPending;
      }
      setPhase('exiting');
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setShouldRender(false);
      }, exitDurationMs);
    }

    return clearPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldRender is read, not a driver; including it would re-run the exit timer on its own update.
  }, [visible, exitDurationMs, prefersReducedMotion]);

  return { shouldRender, phase };
}
