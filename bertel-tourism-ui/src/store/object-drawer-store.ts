import { create } from 'zustand';

export type ObjectDrawerSection = 'general-info' | 'taxonomy' | 'publication' | 'location' | 'descriptions' | 'media' | 'contacts' | 'characteristics' | 'distinctions' | 'capacity-policies' | 'pricing' | 'openings' | 'provider-follow-up' | 'relationships' | 'memberships' | 'legal';
export type DrawerMode = 'view' | 'edit';

interface ObjectDrawerState {
  activeSection: ObjectDrawerSection;
  mode: DrawerMode;
  dirtyObjects: Record<string, boolean>;
  setActiveSection: (section: ObjectDrawerSection) => void;
  setMode: (mode: DrawerMode) => void;
  resetSection: () => void;
  setObjectDirty: (objectId: string, dirty: boolean) => void;
  clearObjectState: (objectId: string) => void;
}

export const useObjectDrawerStore = create<ObjectDrawerState>((set) => ({
  activeSection: 'general-info',
  mode: 'view',
  dirtyObjects: {},
  setActiveSection: (section) => set({ activeSection: section }),
  setMode: (mode) => set({ mode }),
  resetSection: () => set({ activeSection: 'general-info', mode: 'view' }),
  setObjectDirty: (objectId, dirty) =>
    set((state) => ({
      dirtyObjects: {
        ...state.dirtyObjects,
        [objectId]: dirty,
      },
    })),
  clearObjectState: (objectId) =>
    set((state) => {
      const nextDirtyObjects = { ...state.dirtyObjects };
      delete nextDirtyObjects[objectId];
      return {
        dirtyObjects: nextDirtyObjects,
      };
    }),
}));
