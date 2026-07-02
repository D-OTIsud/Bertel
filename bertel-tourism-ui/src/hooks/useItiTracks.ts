import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchItiTrack, type ItiTrack } from '../services/iti-tracks';
import { useSessionStore } from '../store/session-store';

/**
 * D18 — tracés des ITI visibles sur la carte : une requête cachée PAR itinéraire
 * (clé stable par id ⇒ un tracé déjà chargé ne se recharge pas quand les filtres
 * changent), gcTime long — la géométrie est import-owned et ne bouge presque jamais.
 * ponytail: plafonné à MAX_TRACKS itinéraires (corpus réel ≈ dizaines) ; au-delà,
 * bascule vers un RPC batch côté API (cf. services/iti-tracks).
 */
const MAX_TRACKS = 50;
const TRACK_STALE_TIME_MS = 10 * 60 * 1000;
const TRACK_GC_TIME_MS = 60 * 60 * 1000;

export interface ItiTracksResult {
  tracks: ItiTrack[];
  isLoading: boolean;
}

export function useItiTracks(itiObjectIds: string[]): ItiTracksResult {
  const langPrefs = useSessionStore((state) => state.langPrefs);
  // Ordre stable (tri) pour des clés de cache et un rendu déterministes.
  const ids = useMemo(
    () => [...new Set(itiObjectIds.map((id) => String(id).trim()).filter(Boolean))].sort().slice(0, MAX_TRACKS),
    [itiObjectIds],
  );

  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['iti-track', id, langPrefs],
      queryFn: () => fetchItiTrack(id, langPrefs),
      staleTime: TRACK_STALE_TIME_MS,
      gcTime: TRACK_GC_TIME_MS,
      retry: 1,
    })),
    // `combine` est structurellement partagé par React-Query v5 : référence stable
    // tant que le contenu ne change pas (pas de re-rendu carte à chaque tick).
    combine: (results): ItiTracksResult => ({
      tracks: results
        .map((result) => result.data)
        .filter((track): track is ItiTrack => Boolean(track && track.lines.length > 0)),
      isLoading: results.some((result) => result.isLoading),
    }),
  });
}
