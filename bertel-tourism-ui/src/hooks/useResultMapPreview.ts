import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react';
import type { ObjectCard } from '../types/domain';
import { useExplorerMapPreviewStore } from '../store/explorer-map-preview-store';
import { useExplorerStore } from '../store/explorer-store';

const RESULT_PREVIEW_DELAY_MS = 1000;

/** Only sustained interest in a stationary result list opens the map preview. */
export function useResultMapPreview(
  scrollRef: RefObject<HTMLDivElement | null>,
  cards: ObjectCard[],
) {
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef<ObjectCard | null>(null);
  const focusedRef = useRef<ObjectCard | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedulePreview = useCallback(() => {
    cancelTimer();
    if (!hoveredRef.current && !focusedRef.current && !pointerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const root = scrollRef.current;
      if (!root) return;
      let card = hoveredRef.current ?? focusedRef.current;
      const pointer = pointerRef.current;
      // Scrolling can replace the card under an unmoving pointer without a mouse event.
      if (pointer && document.elementFromPoint) {
        const target = document.elementFromPoint(pointer.x, pointer.y);
        const element = target?.closest<HTMLElement>('[data-result-card-id]');
        if (!element || !root.contains(element)) return;
        card = cardsRef.current.find((item) => item.id === element.dataset.resultCardId) ?? null;
        hoveredRef.current = card;
        useExplorerStore.getState().setHoveredCard(card?.id ?? null);
      }
      if (!card) return;
      const rendered = Array.from(root.querySelectorAll<HTMLElement>('[data-result-card-id]'))
        .some((element) => element.dataset.resultCardId === card.id);
      if (rendered) useExplorerMapPreviewStore.getState().showPreview(card, 'hover');
    }, RESULT_PREVIEW_DELAY_MS);
  }, [cancelTimer, scrollRef]);

  const onHoverChange = useCallback((card: ObjectCard, hovered: boolean) => {
    if (hovered) {
      hoveredRef.current = card;
    } else if (hoveredRef.current?.id === card.id) {
      hoveredRef.current = null;
      if (focusedRef.current?.id !== card.id) {
        useExplorerMapPreviewStore.getState().clearHoverPreview(card.id);
      }
    }
    schedulePreview();
  }, [schedulePreview]);

  const onFocusChange = useCallback((card: ObjectCard, focused: boolean) => {
    focusedRef.current = focused ? card : null;
    if (!focused && hoveredRef.current?.id !== card.id) {
      useExplorerMapPreviewStore.getState().clearHoverPreview(card.id);
    }
    schedulePreview();
  }, [schedulePreview]);

  const trackPointer = useCallback((event: MouseEvent<HTMLDivElement>) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const leaveList = useCallback(() => {
    pointerRef.current = null;
    hoveredRef.current = null;
    if (!focusedRef.current) useExplorerMapPreviewStore.getState().clearHoverPreview();
    schedulePreview();
  }, [schedulePreview]);

  const showSelectionPreview = useCallback((card: ObjectCard) => {
    cancelTimer();
    useExplorerMapPreviewStore.getState().showPreview(card, 'selection');
  }, [cancelTimer]);

  // Filtering or collapsing a group can remove a result without sending mouseleave.
  useEffect(() => {
    const preview = useExplorerMapPreviewStore.getState().preview;
    if (preview?.source !== 'hover') return;
    const rendered = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-result-card-id]') ?? [])
      .some((element) => element.dataset.resultCardId === preview.card.id);
    if (!rendered) useExplorerMapPreviewStore.getState().clearHoverPreview(preview.card.id);
  });

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const handleScroll = () => {
      useExplorerMapPreviewStore.getState().clearHoverPreview();
      schedulePreview();
    };
    root.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', handleScroll);
      cancelTimer();
      useExplorerMapPreviewStore.getState().clearHoverPreview();
    };
  }, [cancelTimer, schedulePreview, scrollRef]);

  return { onHoverChange, onFocusChange, trackPointer, leaveList, showSelectionPreview };
}
