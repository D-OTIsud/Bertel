'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { resolveActiveSectionNum } from './editor-scroll-spy';

const SCROLL_LOCK_MS = 900;

interface UseEditorScrollSpyResult {
  mainRef: RefObject<HTMLElement | null>;
  activeNum: string;
  scrollToSection: (num: string) => void;
}

/**
 * Tracks the active editor section from `.edit-main` scroll position.
 * Locks the nav highlight while a programmatic smooth scroll is in progress.
 */
export function useEditorScrollSpy(sectionNums: readonly string[]): UseEditorScrollSpyResult {
  const mainRef = useRef<HTMLElement | null>(null);
  const [activeNum, setActiveNum] = useState(sectionNums[0] ?? '01');
  const scrollLockRef = useRef<{ num: string; until: number } | null>(null);

  const scrollToSection = useCallback((num: string) => {
    setActiveNum(num);
    scrollLockRef.current = { num, until: Date.now() + SCROLL_LOCK_MS };
    document.getElementById(`section-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const root = mainRef.current;
    if (!root || sectionNums.length === 0) {
      return undefined;
    }

    const nodes = sectionNums
      .map((num) => document.getElementById(`section-${num}`))
      .filter((node): node is HTMLElement => Boolean(node));

    if (nodes.length === 0) {
      return undefined;
    }

    const updateActive = () => {
      const lock = scrollLockRef.current;
      if (lock && Date.now() < lock.until) {
        setActiveNum(lock.num);
        return;
      }
      if (lock) {
        scrollLockRef.current = null;
      }

      const next = resolveActiveSectionNum(nodes, root.getBoundingClientRect().top);
      if (next) {
        setActiveNum(next);
      }
    };

    root.addEventListener('scroll', updateActive, { passive: true });
    updateActive();

    return () => root.removeEventListener('scroll', updateActive);
  }, [sectionNums]);

  return { mainRef, activeNum, scrollToSection };
}
