import { create } from 'zustand';
import type { ObjectCard } from '../types/domain';

type MapPreviewSource = 'hover' | 'selection';

interface ExplorerMapPreviewState {
  preview: { card: ObjectCard; source: MapPreviewSource } | null;
  showPreview: (card: ObjectCard, source: MapPreviewSource) => void;
  clearHoverPreview: (cardId?: string) => void;
  clearPreview: () => void;
}

// Transient map feedback is independent of the selection basket and mobile detail sheet.
export const useExplorerMapPreviewStore = create<ExplorerMapPreviewState>((set, get) => ({
  preview: null,
  // A fresh request also reopens a preview explicitly dismissed for the same card.
  showPreview: (card, source) => set({ preview: { card, source } }),
  clearHoverPreview: (cardId) => {
    const preview = get().preview;
    if (preview?.source === 'hover' && (!cardId || preview.card.id === cardId)) {
      set({ preview: null });
    }
  },
  clearPreview: () => set({ preview: null }),
}));
