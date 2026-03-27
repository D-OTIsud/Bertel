import { create } from 'zustand';

export type ObjectDrawerSection =
  | 'overview'
  | 'location'
  | 'contacts'
  | 'media'
  | 'distinctions'
  | 'offer'
  | 'type-details'
  | 'crm'
  | 'legal-sync';

export type DrawerMode = 'view' | 'edit';

interface ObjectDraftState {
  name: string;
  description: string;
  fields: Record<string, string>;
  dirtyFields: string[];
  dirty: boolean;
}

interface ObjectDrawerState {
  activeSection: ObjectDrawerSection;
  mode: DrawerMode;
  draftsByObject: Record<string, ObjectDraftState>;
  setActiveSection: (section: ObjectDrawerSection) => void;
  setMode: (mode: DrawerMode) => void;
  resetSection: () => void;
  initializeDraft: (objectId: string, draft: { name: string; description: string; fields?: Record<string, string> }) => void;
  updateDraft: (objectId: string, field: 'name' | 'description', value: string) => void;
  updateDraftField: (objectId: string, field: string, value: string) => void;
  commitDraft: (objectId: string) => void;
  clearDraft: (objectId: string) => void;
}

export const useObjectDrawerStore = create<ObjectDrawerState>((set) => ({
  activeSection: 'overview',
  mode: 'view',
  draftsByObject: {},
  setActiveSection: (section) => set({ activeSection: section }),
  setMode: (mode) => set({ mode }),
  // Reset to view mode on every new object open
  resetSection: () => set({ activeSection: 'overview', mode: 'view' }),
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
            fields: draft.fields ?? {},
            dirtyFields: [],
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
          fields: state.draftsByObject[objectId]?.fields ?? {},
          dirtyFields: Array.from(new Set([...(state.draftsByObject[objectId]?.dirtyFields ?? []), field])),
          dirty: true,
          [field]: value,
        },
      },
    })),
  updateDraftField: (objectId, field, value) =>
    set((state) => ({
      draftsByObject: {
        ...state.draftsByObject,
        [objectId]: {
          name: state.draftsByObject[objectId]?.name ?? '',
          description: state.draftsByObject[objectId]?.description ?? '',
          fields: {
            ...(state.draftsByObject[objectId]?.fields ?? {}),
            [field]: value,
          },
          dirtyFields: Array.from(new Set([...(state.draftsByObject[objectId]?.dirtyFields ?? []), field])),
          dirty: true,
        },
      },
    })),
  commitDraft: (objectId) =>
    set((state) => {
      const current = state.draftsByObject[objectId];
      if (!current) {
        return state;
      }

      return {
        draftsByObject: {
          ...state.draftsByObject,
          [objectId]: {
            ...current,
            dirty: false,
            dirtyFields: [],
          },
        },
      };
    }),
  clearDraft: (objectId) =>
    set((state) => {
      const nextDrafts = { ...state.draftsByObject };
      delete nextDrafts[objectId];
      return {
        draftsByObject: nextDrafts,
      };
    }),
}));
