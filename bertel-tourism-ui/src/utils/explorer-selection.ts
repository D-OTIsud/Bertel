import type { ObjectCard } from '../types/domain';

export type LngLatPoint = [number, number];

const EPSILON = 1e-9;

function normalizeObjectIds(objectIds: string[]): string[] {
  return objectIds.map((id) => String(id).trim()).filter(Boolean);
}

function isPointOnSegment(point: LngLatPoint, start: LngLatPoint, end: LngLatPoint): boolean {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);

  if (Math.abs(cross) > EPSILON) {
    return false;
  }

  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= EPSILON;
}

export function mergeSelectedObjectIds(existingIds: string[], incomingIds: string[]): string[] {
  const merged = normalizeObjectIds(existingIds);
  const seen = new Set(merged);

  for (const id of normalizeObjectIds(incomingIds)) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    merged.push(id);
  }

  return merged;
}

export function isPointInPolygon(point: LngLatPoint, polygon: LngLatPoint[]): boolean {
  if (polygon.length < 3) {
    return false;
  }

  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const start = polygon[j];
    const end = polygon[i];

    if (isPointOnSegment(point, start, end)) {
      return true;
    }

    const [x1, y1] = start;
    const [x2, y2] = end;
    const intersects = (y1 > py) !== (y2 > py) && px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function getObjectIdsInsidePolygon(objects: ObjectCard[], polygon: LngLatPoint[]): string[] {
  if (polygon.length < 3) {
    return [];
  }

  return objects.flatMap((object) => {
    const lat = object.location?.lat;
    const lon = object.location?.lon;

    if (lat == null || lon == null) {
      return [];
    }

    return isPointInPolygon([lon, lat], polygon) ? [object.id] : [];
  });
}
