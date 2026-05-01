import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import { listExplorerReferences } from '../services/explorer-reference';
import { listLocationReferenceOptions } from '../services/location-reference';
import {
  canWriteObjectPrivateNote,
  createObjectPrivateNote,
  deleteObjectPrivateNote,
  getObjectResource,
  listExplorerCards,
  updateObjectPrivateNote,
} from '../services/rpc';
import {
  saveObjectWorkspaceCharacteristics,
  saveObjectWorkspaceCapacityPolicies,
  saveObjectWorkspaceDistinctions,
  getObjectWorkspaceResource,
  publishObjectWorkspace,
  saveObjectWorkspaceContacts,
  saveObjectWorkspaceDescriptions,
  saveObjectWorkspaceGeneralInfo,
  saveObjectWorkspaceLocation,
  saveObjectWorkspaceLegal,
  saveObjectWorkspaceMemberships,
  saveObjectWorkspaceMedia,
  saveObjectWorkspacePricing,
  saveObjectWorkspaceTaxonomy,
} from '../services/object-workspace';
import { applyClientPreviewFilters, applyFrontendOnlyExplorerFilters, resolveExplorerStatuses } from '../utils/facets';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceContactsModule,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceMembershipModule,
  ObjectWorkspaceLocationModule,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceMediaModule,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceTaxonomyModule,
} from '../services/object-workspace-parser';

type SaveWorkspaceModuleInput =
  | { moduleId: 'general-info'; value?: ObjectWorkspaceGeneralInfo; taxonomyValue?: ObjectWorkspaceTaxonomyModule }
  | { moduleId: 'taxonomy'; value: ObjectWorkspaceTaxonomyModule }
  | { moduleId: 'distinctions'; value: ObjectWorkspaceDistinctionsModule }
  | { moduleId: 'location'; value: ObjectWorkspaceLocationModule }
  | { moduleId: 'descriptions'; value: ObjectWorkspaceDescriptionsModule; canEditPlaceDescriptions: boolean }
  | { moduleId: 'media'; value: ObjectWorkspaceMediaModule; canEditPlaceMedia: boolean }
  | { moduleId: 'contacts'; value: ObjectWorkspaceContactsModule }
  | { moduleId: 'characteristics'; value: ObjectWorkspaceCharacteristicsModule }
  | { moduleId: 'capacity-policies'; value: ObjectWorkspaceCapacityPoliciesModule }
  | { moduleId: 'pricing'; value: ObjectWorkspacePricingModule }
  | { moduleId: 'memberships'; value: ObjectWorkspaceMembershipModule }
  | { moduleId: 'legal'; value: ObjectWorkspaceLegalModule };

function useExplorerFilters() {
  const selectedBuckets = useExplorerStore((state) => state.selectedBuckets);
  const common = useExplorerStore((state) => state.common);
  const hot = useExplorerStore((state) => state.hot);
  const res = useExplorerStore((state) => state.res);
  const iti = useExplorerStore((state) => state.iti);
  const act = useExplorerStore((state) => state.act);
  const vis = useExplorerStore((state) => state.vis);
  const srv = useExplorerStore((state) => state.srv);

  return useMemo(
    () => ({
      selectedBuckets,
      common,
      hot,
      res,
      iti,
      act,
      vis,
      srv,
    }),
    [act, common, hot, iti, res, selectedBuckets, srv, vis],
  );
}

export function useExplorerCardsQuery() {
  const filters = useExplorerFilters();
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const demoMode = useSessionStore((state) => state.demoMode);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);

  // Resolve the effective status set sent to the RPC. We embed it in
  // `queryFilters.common.statuses` so the React-Query cache key reflects the
  // real query (a tourism_agent and an org_admin must NOT share cache entries).
  const queryFilters = useMemo(() => {
    const effectiveStatuses = resolveExplorerStatuses(filters.common.statuses, canEditObjects);
    return {
      ...filters,
      common: {
        ...filters.common,
        statuses: effectiveStatuses,
      },
      hot: {
        ...filters.hot,
        subtypes: demoMode ? filters.hot.subtypes : [],
      },
    };
  }, [canEditObjects, demoMode, filters]);

  const query = useQuery({
    queryKey: ['explorer-cards', queryFilters, langPrefs],
    queryFn: () => listExplorerCards(queryFilters, langPrefs),
    placeholderData: keepPreviousData,
  });

  const data = useMemo(() => {
    const raw = query.data ?? [];
    if (query.isPlaceholderData) {
      return applyClientPreviewFilters(raw, queryFilters);
    }
    return applyFrontendOnlyExplorerFilters(raw, queryFilters);
  }, [query.data, query.isPlaceholderData, queryFilters]);

  return {
    ...query,
    data,
  };
}

export function useExplorerReferencesQuery() {
  return useQuery({
    queryKey: ['explorer-references'],
    queryFn: listExplorerReferences,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    meta: { persist: true },
  });
}

export function useObjectDetailQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    queryKey: ['object-detail', objectId, langPrefs],
    queryFn: () => getObjectResource(objectId ?? '', langPrefs),
    enabled: Boolean(objectId),
  });
}

export function useObjectWorkspaceQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    queryKey: ['object-workspace', objectId, langPrefs],
    queryFn: () => getObjectWorkspaceResource(objectId ?? '', langPrefs),
    enabled: Boolean(objectId),
  });
}

export function useLocationReferenceOptionsQuery() {
  return useQuery({
    queryKey: ['location-reference-options'],
    queryFn: listLocationReferenceOptions,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    meta: { persist: true },
  });
}

export function useSaveObjectWorkspaceModuleMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveWorkspaceModuleInput) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour enregistrer ce module.");
      }

      if (input.moduleId === 'general-info') {
        if (input.value) {
          await saveObjectWorkspaceGeneralInfo(objectId, input.value);
        }
        if (input.taxonomyValue) {
          await saveObjectWorkspaceTaxonomy(objectId, input.taxonomyValue);
        }
        return;
      }

      if (input.moduleId === 'taxonomy') {
        return saveObjectWorkspaceTaxonomy(objectId, input.value);
      }

      if (input.moduleId === 'distinctions') {
        return saveObjectWorkspaceDistinctions(objectId, input.value);
      }

      if (input.moduleId === 'location') {
        return saveObjectWorkspaceLocation(objectId, input.value);
      }

      if (input.moduleId === 'media') {
        return saveObjectWorkspaceMedia(objectId, input.value, {
          canEditPlaceMedia: input.canEditPlaceMedia,
        });
      }

      if (input.moduleId === 'contacts') {
        return saveObjectWorkspaceContacts(objectId, input.value);
      }

      if (input.moduleId === 'characteristics') {
        return saveObjectWorkspaceCharacteristics(objectId, input.value);
      }

      if (input.moduleId === 'capacity-policies') {
        return saveObjectWorkspaceCapacityPolicies(objectId, input.value);
      }

      if (input.moduleId === 'pricing') {
        return saveObjectWorkspacePricing(objectId, input.value);
      }

      if (input.moduleId === 'memberships') {
        return saveObjectWorkspaceMemberships(objectId, input.value);
      }

      if (input.moduleId === 'legal') {
        return saveObjectWorkspaceLegal(objectId, input.value);
      }

      return saveObjectWorkspaceDescriptions(objectId, input.value, {
        canEditPlaceDescriptions: input.canEditPlaceDescriptions,
      });
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['location-reference-options'] }),
      ]);
    },
  });
}

export function usePublishObjectWorkspaceMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (publish: boolean) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour gerer la publication.");
      }

      return publishObjectWorkspace(objectId, publish);
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
      ]);
    },
  });
}

export function useAddObjectPrivateNoteMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      body: string;
      category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
      isPinned: boolean;
    }) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour ajouter une note d'equipe.");
      }

      return createObjectPrivateNote({ objectId, ...input });
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
      ]);
    },
  });
}

export function useObjectPrivateNoteWriteAccessQuery(objectId: string | null) {
  const demoMode = useSessionStore((state) => state.demoMode);

  return useQuery({
    queryKey: ['object-private-note-write-access', objectId],
    queryFn: async () => canWriteObjectPrivateNote(objectId ?? ''),
    enabled: Boolean(objectId),
    staleTime: 60 * 1000,
    initialData: demoMode ? true : undefined,
  });
}

export function useUpdateObjectPrivateNoteMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      noteId: string;
      body: string;
      category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
      isPinned: boolean;
      isArchived: boolean;
    }) => updateObjectPrivateNote(input),
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
      ]);
    },
  });
}

export function useDeleteObjectPrivateNoteMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => deleteObjectPrivateNote(noteId),
    onSuccess: async () => {
      if (!objectId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
      ]);
    },
  });
}
