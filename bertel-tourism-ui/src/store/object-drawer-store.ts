import { create } from 'zustand';

export type ObjectDrawerSection =
  | 'general'
  | 'contacts'
  | 'media'
  | 'legal'
  | 'pricing'
  | 'openings'
  | 'rooms'
  | 'mice'
  | 'memberships'
  | 'external-sync';

interface ObjectDraftState {
  name: string;
  description: string;
  dirty: boolean;
}

interface ObjectDrawerState {
  activeSection: ObjectDrawerSection;
  draftsByObject: Record<string, ObjectDraftState>;
  setActiveSection: (section: ObjectDrawerSection) => void;
  resetSection: () => void;
  initializeDraft: (objectId: string, draft: { name: string; description: string }) => void;
  updateDraft: (objectId: string, field: 'name' | 'description', value: string) => void;
  clearDraft: (objectId: string) => void;
}

export const useObjectDrawerStore = create<ObjectDrawerState>((set) => ({
  activeSection: 'general',
  draftsByObject: {},
  setActiveSection: (section) => set({ activeSection: section }),
  resetSection: () => set({ activeSection: 'general' }),
  initializeDraft: (objectId, draft) =>
    set((state) => {
      const existing = state.draftsByObject[objectId];
      if (existing?.dirty) {
        return state;
      }

      return {
        draftsByObject: {
          ...state.draftsByObject,
          [objectId]: {
            name: draft.name,
            description: draft.description,
            dirty: false,
          },
        },
      };
    }),
  updateDraft: (objectId, field, value) =>
    set((state) => ({
      draftsByObject: {
        ...state.draftsByObject,
        [objectId]: {
          name: state.draftsByObject[objectId]?.name ?? '',
          description: state.draftsByObject[objectId]?.description ?? '',
          dirty: true,
          [field]: value,
        },
      },
    })),
  clearDraft: (objectId) =>
    set((state) => {
      const nextDrafts = { ...state.draftsByObject };
      delete nextDrafts[objectId];
      return {
        draftsByObject: nextDrafts,
      };
    }),
}));
