import type { ObjectDetail } from '../types/domain';

interface ObjectRecord {
  [key: string]: unknown;
}

interface DeepObjectPayload {
  object?: unknown;
  actors?: unknown;
  organizations?: unknown;
  parent_objects?: unknown;
}

function isRecord(value: unknown): value is ObjectRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): ObjectRecord {
  return isRecord(value) ? value : {};
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isDeepPayload(value: unknown): value is DeepObjectPayload {
  if (!isRecord(value)) {
    return false;
  }

  return 'object' in value || 'actors' in value || 'organizations' in value || 'parent_objects' in value;
}

export function normalizeObjectDetailPayload(payload: unknown, fallbackObjectId: string): ObjectDetail {
  if (isDeepPayload(payload)) {
    const objectPayload = readRecord(payload.object);
    const mergedRaw: ObjectRecord = {
      ...objectPayload,
      actors: readArray(payload.actors).length > 0 ? payload.actors : objectPayload.actors,
      organizations: readArray(payload.organizations).length > 0 ? payload.organizations : objectPayload.organizations,
      parent_objects: readArray(payload.parent_objects),
      deep_data: true,
    };

    return {
      id: readString(objectPayload.id, fallbackObjectId),
      name: readString(objectPayload.name, 'Sans titre'),
      type: readString(objectPayload.type) || undefined,
      raw: mergedRaw,
    };
  }

  const objectPayload = readRecord(payload);
  return {
    id: readString(objectPayload.id, fallbackObjectId),
    name: readString(objectPayload.name, 'Sans titre'),
    type: readString(objectPayload.type) || undefined,
    raw: objectPayload,
  };
}
