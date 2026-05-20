import { create } from 'zustand';

/** Legacy dirty-state map — kept for TopBar until editor-only dirty tracking replaces it. */
interface ObjectDrawerState {
  dirtyObjects: Record<string, boolean>;
  setObjectDirty: (objectId: string, dirty: boolean) => void;
  clearObjectState: (objectId: string) => void;
  resetSection: () => void;
}

export const useObjectDrawerStore = create<ObjectDrawerState>((set) => ({
  dirtyObjects: {},
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
  resetSection: () => undefined,
}));
