import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import { useDebouncedValue } from './useDebouncedValue';
import { listExplorerReferences } from '../services/explorer-reference';
import { listLocationReferenceOptions } from '../services/location-reference';
import {
  canWriteObjectPrivateNote,
  createObjectPrivateNote,
  deleteObjectPrivateNote,
  explorerCardsHasNextPage,
  fetchExplorerCardsPage,
  getObjectResource,
  listObjectMarkers,
  updateObjectPrivateNote,
  type ExplorerBucketCursorMap,
} from '../services/rpc';
import {
  saveObjectWorkspaceCharacteristics,
  saveObjectWorkspaceCapacityPolicies,
  saveObjectWorkspaceDistinctions,
  getObjectWorkspaceResource,
  type ObjectWorkspaceResource,
  publishObjectWorkspace,
  setObjectStatus,
  type ObjectLifecycleStatus,
  saveObjectWorkspaceActivity,
  saveObjectWorkspaceContacts,
  saveObjectWorkspaceDescriptions,
  saveObjectWorkspaceEvent,
  saveObjectWorkspaceGeneralInfo,
  saveObjectWorkspaceItinerary,
  saveObjectWorkspaceLocation,
  saveObjectWorkspaceLegal,
  saveObjectWorkspaceMeetingRooms,
  saveObjectWorkspaceMemberships,
  saveObjectWorkspaceMedia,
  saveObjectWorkspaceMenus,
  saveObjectWorkspaceCuisine,
  saveObjectWorkspaceOpenings,
  saveObjectWorkspacePlaces,
  saveObjectWorkspacePricing,
  saveObjectWorkspaceRelationships,
  saveObjectWorkspaceRooms,
  saveObjectWorkspaceSustainability,
  saveObjectWorkspaceTags,
  saveObjectWorkspaceTaxonomy,
  upsertObjectExternalId,
  deleteObjectExternalId,
} from '../services/object-workspace';
import { getObjectVersions, restoreObjectVersion } from '../services/object-versions';
import { ensureReferenceCatalogs } from './useReferenceCatalogsQuery';
import { dedupeExplorerCards, refineCardsByPolygon, resolveExplorerStatuses, sortExplorerCards } from '../utils/facets';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceContactsModule,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspaceEventModule,
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceItineraryModule,
  ObjectWorkspaceMeetingRoomsModule,
  ObjectWorkspaceMembershipModule,
  ObjectWorkspaceLocationModule,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceMediaModule,
  ObjectWorkspaceMenusModule,
  ObjectWorkspaceCuisineModule,
  ObjectWorkspacePlacesModule,
  ObjectWorkspaceOpeningsModule,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceRelationshipsModule,
  ObjectWorkspaceRoomsModule,
  ObjectWorkspaceSustainabilityModule,
  ObjectWorkspaceTagsModule,
  ObjectWorkspaceTaxonomyModule,
} from '../services/object-workspace-parser';

export type SaveWorkspaceModuleInput =
  | { moduleId: 'general-info'; value?: ObjectWorkspaceGeneralInfo; taxonomyValue?: ObjectWorkspaceTaxonomyModule }
  | { moduleId: 'taxonomy'; value: ObjectWorkspaceTaxonomyModule }
  | { moduleId: 'distinctions'; value: ObjectWorkspaceDistinctionsModule }
  | { moduleId: 'location'; value: ObjectWorkspaceLocationModule }
  | { moduleId: 'places'; value: ObjectWorkspacePlacesModule }
  | { moduleId: 'descriptions'; value: ObjectWorkspaceDescriptionsModule; canEditCanonical: boolean; canEditOrgEnrichment: boolean }
  | { moduleId: 'media'; value: ObjectWorkspaceMediaModule; canEditPlaceMedia: boolean }
  | { moduleId: 'contacts'; value: ObjectWorkspaceContactsModule }
  | { moduleId: 'characteristics'; value: ObjectWorkspaceCharacteristicsModule }
  | { moduleId: 'capacity-policies'; value: ObjectWorkspaceCapacityPoliciesModule }
  | { moduleId: 'pricing'; value: ObjectWorkspacePricingModule }
  | { moduleId: 'rooms'; value: ObjectWorkspaceRoomsModule }
  | { moduleId: 'meeting-rooms'; value: ObjectWorkspaceMeetingRoomsModule }
  | { moduleId: 'menus'; value: ObjectWorkspaceMenusModule }
  | { moduleId: 'cuisine'; value: ObjectWorkspaceCuisineModule }
  | { moduleId: 'activity'; value: ObjectWorkspaceActivityModule }
  | { moduleId: 'event'; value: ObjectWorkspaceEventModule }
  | { moduleId: 'itinerary'; value: ObjectWorkspaceItineraryModule }
  | { moduleId: 'openings'; value: ObjectWorkspaceOpeningsModule }
  | { moduleId: 'memberships'; value: ObjectWorkspaceMembershipModule }
  | { moduleId: 'legal'; value: ObjectWorkspaceLegalModule }
  | { moduleId: 'sustainability'; value: ObjectWorkspaceSustainabilityModule }
  | { moduleId: 'tags'; value: ObjectWorkspaceTagsModule }
  | { moduleId: 'relationships'; value: ObjectWorkspaceRelationshipsModule };

function useExplorerFilters() {
  const selectedBuckets = useExplorerStore((state) => state.selectedBuckets);
  const common = useExplorerStore((state) => state.common);
  const hot = useExplorerStore((state) => state.hot);
  const res = useExplorerStore((state) => state.res);
  const iti = useExplorerStore((state) => state.iti);
  const evt = useExplorerStore((state) => state.evt);
  const vis = useExplorerStore((state) => state.vis);
  const srv = useExplorerStore((state) => state.srv);

  return useMemo(
    () => ({
      selectedBuckets,
      common,
      hot,
      res,
      iti,
      evt,
      vis,
      srv,
    }),
    [common, evt, hot, iti, res, selectedBuckets, srv, vis],
  );
}

/**
 * Pause avant d'interroger le serveur sur la recherche. Même valeur que l'annuaire CRM
 * (`CrmAnnuaire.SEARCH_DEBOUNCE_MS`) : une seule doctrine de frappe dans l'application.
 */
const SEARCH_DEBOUNCE_MS = 250;

// Shared, role-gated filter snapshot used by BOTH the lazy card list and the
// map markers query, so the two surfaces always show the same set. Embedding the
// resolved statuses in the object means the React-Query cache key reflects the
// real query (a tourism_agent and an org_admin must NOT share a cache entry).
// §155-bis : le zérotage des sous-types HOT hors démo (vestige d'une époque où
// les types HLO/HPA/CAMP/RVA n'existaient pas en live) est SUPPRIMÉ — les
// toggles « Type d'hébergement » du panneau §155 seraient des contrôles morts
// en production (write-trap de lecture). HOT narrowe désormais comme VIS/SRV.
function useExplorerQueryFilters() {
  const filters = useExplorerFilters();
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  // Incident 2026-08-07 — la recherche est le SEUL filtre qui change caractère par
  // caractère, et elle est la plus chère : un préfixe intermédiaire (« in », « ini »…)
  // ne trouve rien en plein texte, ce qui arme le repli flou (§197/§199). Comme chaque
  // requête émet une RPC PAR BUCKET (7 quand aucun n'est sélectionné), taper un mot de
  // dix lettres lançait ~140 requêtes en deux secondes et affamait l'instance : toutes
  // les RPC — y compris celles sans rapport avec la recherche — tombaient alors en
  // `statement timeout` (8 s, rôle authenticated), soit 500 côté PostgREST.
  // On temporise ICI, au point de convergence des deux requêtes, et pas dans le champ :
  // le store reste l'unique source du texte affiché, et aucune surface d'appel ne peut
  // contourner la garde. Les autres filtres (clic sur une puce) restent instantanés.
  const debouncedSearch = useDebouncedValue(filters.common.search, SEARCH_DEBOUNCE_MS);

  return useMemo(() => {
    const effectiveStatuses = resolveExplorerStatuses(filters.common.statuses, canEditObjects);
    return {
      ...filters,
      common: {
        ...filters.common,
        search: debouncedSearch,
        statuses: effectiveStatuses,
        // §204 — le remplissage est réservé aux éditeurs. Masquer le groupe ne
        // suffit pas : l'état survivrait à une URL partagée ou à un changement
        // de rôle en cours de session. On neutralise ici, à la source du
        // payload. Le serveur ferme la porte de son côté (les clés d'un
        // non-éditeur sont ignorées par le RPC) — les deux gardes sont
        // indépendantes, aucune ne suffit seule.
        missingEssentialsBuckets: canEditObjects ? filters.common.missingEssentialsBuckets : [],
        missingEssentialsAny: canEditObjects ? filters.common.missingEssentialsAny : [],
      },
    };
  }, [canEditObjects, debouncedSearch, filters]);
}

// §125 — lazy, server-paginated card list. Replaces the eager all-pages fetch +
// client-preview cache. Each selected bucket carries its own cursor (composite
// pageParam) so per-bucket filters stay scoped; pages accumulate and load on scroll.
// All filters run server-side except the polygon refinement (no server equivalent).
export function useExplorerCardsQuery() {
  const queryFilters = useExplorerQueryFilters();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  const query = useInfiniteQuery({
    queryKey: ['explorer-cards', queryFilters, langPrefs],
    // Le `signal` va jusqu'à supabase-js : une requête rendue obsolète par un
    // changement de filtre est ABANDONNÉE au lieu d'aller au bout. Sans lui, chaque
    // requête dépassée continue de consommer du CPU serveur pour un résultat que
    // personne n'affichera — c'est ce qui transforme une rafale de filtres en famine.
    queryFn: ({ pageParam, signal }) => fetchExplorerCardsPage(queryFilters, langPrefs, pageParam, signal),
    initialPageParam: {} as ExplorerBucketCursorMap,
    getNextPageParam: (lastPage) =>
      explorerCardsHasNextPage(queryFilters, lastPage.cursors) ? lastPage.cursors : undefined,
    placeholderData: keepPreviousData,
  });

  const data = useMemo(() => {
    const all = (query.data?.pages ?? []).flatMap((page) => page.cards);
    return refineCardsByPolygon(sortExplorerCards(dedupeExplorerCards(all)), queryFilters);
  }, [query.data, queryFilters]);

  // "Refreshing" = a filter change is swapping the result set in (keepPreviousData
  // keeps showing the old cards). NOT a scroll-driven next-page fetch.
  const isRefreshing = query.isFetching && !query.isFetchingNextPage && query.isPlaceholderData;

  // §NN — corpus-wide label rank counts come from PAGE 0 only: it queries ALL active
  // buckets, whereas later scroll pages drop exhausted buckets and would undercount.
  const labelRankCounts = useMemo(
    () => query.data?.pages?.[0]?.labelRankCounts ?? { labelled: 0, equivalent: 0 },
    [query.data],
  );

  // Real corpus size (COUNT(*) filtré serveur), read from PAGE 0 for the same reason as
  // labelRankCounts. Drives « N fiches » in the results header so it shows the true total —
  // not just the lazily-loaded cards — and stays aligned with the map's full matching set.
  const totalCount = useMemo(() => query.data?.pages?.[0]?.totalCount ?? 0, [query.data]);

  return {
    ...query,
    data,
    isRefreshing,
    labelRankCounts,
    totalCount,
  };
}

// §125 — the MAP's data source: ALL matching geolocated markers in one cheap call
// per bucket (api.list_object_markers), decoupled from the card pagination above.
export function useExplorerMarkersQuery() {
  const queryFilters = useExplorerQueryFilters();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    // langPrefs kept in the key for cache correctness even though markers are lang-agnostic today.
    queryKey: ['explorer-markers', queryFilters, langPrefs],
    queryFn: ({ signal }) => listObjectMarkers(queryFilters, signal),
    placeholderData: keepPreviousData,
  });
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

/**
 * Fraicheur de la fiche, PARTAGEE entre le prechargement au survol et la lecture
 * du tiroir. Elle doit etre explicite et unique : si le prechargement et
 * `useObjectDetailQuery` divergent, l'ouverture refait la requete que le survol
 * vient de payer.
 */
export const OBJECT_DETAIL_STALE_TIME_MS = 5 * 60 * 1000;

/** Delai d'intention avant prechargement, en millisecondes. */
const PREFETCH_INTENT_DELAY_MS = 200;

export function useObjectDetailQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useQuery({
    queryKey: ['object-detail', objectId, langPrefs],
    queryFn: () => getObjectResource(objectId ?? '', langPrefs),
    enabled: Boolean(objectId),
    staleTime: OBJECT_DETAIL_STALE_TIME_MS,
  });
}

/**
 * Precharge la fiche survolee sous la cle exacte que lit le tiroir
 * (`['object-detail', id, langPrefs]`). Le survol precede le clic de plusieurs
 * centaines de millisecondes, soit a peu pres le cout d'un aller-retour vers
 * Supabase depuis La Reunion (220-310 ms mesures) : la fiche est donc deja en
 * cache au moment du clic.
 *
 * ATTENTION — chaque carte a sa PROPRE cle de cache : sans garde, balayer une
 * liste a la souris declencherait une requete par carte traversee. D'ou le delai
 * d'intention, que l'appelant annule via la fonction rendue quand le pointeur
 * quitte la carte. Seule une carte reellement regardee est prechargee.
 *
 * Les erreurs sont volontairement avalees : un prechargement qui echoue ne doit
 * jamais remonter a l'utilisateur, le vrai chargement au clic rejouera et
 * affichera l'erreur normalement.
 *
 * @returns une fonction d'annulation, a appeler au `mouseleave`.
 */
export function usePrefetchObjectDetail(): (objectId: string) => () => void {
  const queryClient = useQueryClient();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useMemo(
    () => (objectId: string) => {
      if (!objectId) {
        return () => undefined;
      }
      const timer = setTimeout(() => {
        void queryClient
          .prefetchQuery({
            queryKey: ['object-detail', objectId, langPrefs],
            queryFn: () => getObjectResource(objectId, langPrefs),
            staleTime: OBJECT_DETAIL_STALE_TIME_MS,
          })
          .catch(() => undefined);
      }, PREFETCH_INTENT_DELAY_MS);

      return () => clearTimeout(timer);
    },
    [langPrefs, queryClient],
  );
}

/**
 * Fraicheur de l'espace de travail. Doit etre la MEME au prechargement et a la
 * lecture, sinon l'ouverture de l'editeur refait le chargement que le
 * prechargement vient de payer. 5 min, comme la fiche.
 */
export const OBJECT_WORKSPACE_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Point d'entree UNIQUE du chargeur d'espace de travail.
 *
 * Resout la fiche et les catalogues EN PARALLELE, puis passe les deux au
 * chargeur. La fiche passe par `fetchQuery` sur la cle exacte du tiroir
 * (`['object-detail', id, langPrefs]`), ce qui :
 *  - reutilise le resultat si le tiroir vient de le charger,
 *  - se GREFFE sur la requete si elle est encore en vol (React Query deduplique
 *    les fetch concurrents d'une meme cle),
 *  - ne declenche un appel reseau que si personne ne l'a demandee.
 *
 * Avant ce point d'entree, le chargeur rappelait `getObjectResource` lui-meme :
 * ouvrir une fiche puis cliquer « Modifier » executait deux fois le RPC lourd
 * (469 ms de moyenne en production).
 */
export async function loadObjectWorkspace(
  queryClient: QueryClient,
  objectId: string,
  langPrefs: string[],
): Promise<ObjectWorkspaceResource> {
  const [detail, catalogs] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: ['object-detail', objectId, langPrefs],
      queryFn: () => getObjectResource(objectId, langPrefs),
      staleTime: OBJECT_DETAIL_STALE_TIME_MS,
    }),
    ensureReferenceCatalogs(queryClient),
  ]);

  return getObjectWorkspaceResource(objectId, langPrefs, catalogs, detail);
}

/**
 * Precharge les donnees LOURDES de l'editeur (le chargeur d'espace de travail)
 * au survol du bouton « Modifier ». Depuis que le tiroir ne charge plus que la
 * fiche seule, ce prechauffage-la doit etre explicite ; on le declenche sur le
 * signal d'intention le plus fiable, pour ne PAS payer les ~85 requetes sur les
 * fiches simplement consultees.
 */
export function usePrefetchObjectWorkspace(): (objectId: string) => void {
  const queryClient = useQueryClient();
  const langPrefs = useSessionStore((state) => state.langPrefs);

  return useMemo(
    () => (objectId: string) => {
      if (!objectId) {
        return;
      }
      void queryClient
        .prefetchQuery({
          queryKey: ['object-workspace', objectId, langPrefs],
          queryFn: () => loadObjectWorkspace(queryClient, objectId, langPrefs),
          staleTime: OBJECT_WORKSPACE_STALE_TIME_MS,
        })
        .catch(() => undefined);
    },
    [langPrefs, queryClient],
  );
}

export function useObjectWorkspaceQuery(objectId: string | null) {
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['object-workspace', objectId, langPrefs],
    queryFn: () => loadObjectWorkspace(queryClient, objectId ?? '', langPrefs),
    enabled: Boolean(objectId),
    staleTime: OBJECT_WORKSPACE_STALE_TIME_MS,
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

/**
 * Dispatches one workspace module save to its service writer. Plain function (no react-query
 * mutation): the editor saves several dirty modules per batch and refreshes the caches ONCE at
 * the end via `invalidateObjectWorkspaceCaches` — the previous per-module mutation awaited a
 * full workspace refetch after EVERY module, which was the bulk of the save latency.
 */
export async function saveWorkspaceModule(objectId: string, input: SaveWorkspaceModuleInput): Promise<void> {
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

  if (input.moduleId === 'places') {
    return saveObjectWorkspacePlaces(objectId, input.value);
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

  if (input.moduleId === 'rooms') {
    return saveObjectWorkspaceRooms(objectId, input.value);
  }

  if (input.moduleId === 'meeting-rooms') {
    return saveObjectWorkspaceMeetingRooms(objectId, input.value);
  }

  if (input.moduleId === 'menus') {
    return saveObjectWorkspaceMenus(objectId, input.value);
  }

  if (input.moduleId === 'cuisine') {
    return saveObjectWorkspaceCuisine(objectId, input.value);
  }

  if (input.moduleId === 'activity') {
    return saveObjectWorkspaceActivity(objectId, input.value);
  }

  if (input.moduleId === 'event') {
    return saveObjectWorkspaceEvent(objectId, input.value);
  }

  if (input.moduleId === 'itinerary') {
    return saveObjectWorkspaceItinerary(objectId, input.value);
  }

  if (input.moduleId === 'openings') {
    return saveObjectWorkspaceOpenings(objectId, input.value);
  }

  if (input.moduleId === 'memberships') {
    return saveObjectWorkspaceMemberships(objectId, input.value);
  }

  if (input.moduleId === 'relationships') {
    return saveObjectWorkspaceRelationships(objectId, input.value);
  }

  if (input.moduleId === 'legal') {
    return saveObjectWorkspaceLegal(objectId, input.value);
  }

  if (input.moduleId === 'sustainability') {
    return saveObjectWorkspaceSustainability(objectId, input.value);
  }

  if (input.moduleId === 'tags') {
    return saveObjectWorkspaceTags(objectId, input.value);
  }

  return saveObjectWorkspaceDescriptions(objectId, input.value, {
    canEditCanonical: input.canEditCanonical,
    canEditOrgEnrichment: input.canEditOrgEnrichment,
  });
}

/**
 * One post-save cache refresh for a whole save batch, fire-and-forget: the editor snapshot is
 * init-once (it never consumes the refetch), so nothing should wait on the heavy workspace
 * reload — it only re-warms the caches for the preview drawer and the next mount.
 *
 * Depuis que le tiroir observe `object-detail` (il ne consomme plus le chargeur
 * d'espace de travail), cette invalidation-la declenche un VRAI rechargement quand le
 * tiroir est ouvert, et non plus un simple marquage. C'est voulu : une note d'equipe
 * ajoutee depuis le tiroir doit reapparaitre. Cout : 1 requete, pas 85.
 */
export function invalidateObjectWorkspaceCaches(queryClient: QueryClient, objectId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] });
  void queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] });
  void queryClient.invalidateQueries({ queryKey: ['location-reference-options'] });
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
    onSuccess: () => {
      if (!objectId) {
        return;
      }

      // Fire-and-forget: the editor updates its own status via setSavedStatus — don't hold
      // the publish spinner on the heavy workspace refetch.
      void queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] });
      void queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] });
    },
  });
}

export function useSetObjectStatusMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: ObjectLifecycleStatus) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour gerer le statut.");
      }

      return setObjectStatus(objectId, status);
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

export function useUpsertExternalIdMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { sourceSystem: string; externalId: string; lastSyncedAt: string | null }) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour enregistrer l'identifiant externe.");
      }

      return upsertObjectExternalId({ objectId, ...input });
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

export function useDeleteExternalIdMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour supprimer l'identifiant externe.");
      }

      return deleteObjectExternalId(id);
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

export function useObjectVersionsQuery(objectId: string | null) {
  return useQuery({
    queryKey: ['object-versions', objectId],
    queryFn: () => getObjectVersions(objectId ?? ''),
    enabled: Boolean(objectId),
    staleTime: 30 * 1000,
  });
}

export function useRestoreObjectVersionMutation(objectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionNumber: number) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour restaurer une version.");
      }
      return restoreObjectVersion(objectId, versionNumber);
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-versions', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
      ]);
    },
  });
}
