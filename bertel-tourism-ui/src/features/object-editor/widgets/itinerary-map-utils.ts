import type { ObjectWorkspaceItineraryStageSummary } from '../../../services/object-workspace-parser';

export function itineraryStagePoint(stage: Pick<ObjectWorkspaceItineraryStageSummary, 'lng' | 'lat'>): [number, number] | null {
  if (!stage.lng.trim() || !stage.lat.trim()) return null;
  const lng = Number(stage.lng), lat = Number(stage.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}

export function itineraryMapBounds(coordinates: number[][]): [number, number, number, number] | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lng, lat] of coordinates) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;
    west = Math.min(west, lng); south = Math.min(south, lat);
    east = Math.max(east, lng); north = Math.max(north, lat);
  }
  return west === Infinity ? null : [west, south, east, north];
}
