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

/**
 * Le payload « deep » (`api.get_object_with_deep_data`) est une ENVELOPPE :
 * `{object, actors, organizations, parent_objects}` — la clé `object` y est
 * toujours présente. Le payload PLAT (`api.get_object_resource` /
 * `get_object_resources_batch`) est la fiche elle-même, et il porte `actors`
 * au PREMIER niveau, sans enveloppe.
 *
 * La détection doit donc porter sur l'ENVELOPPE, jamais sur ses satellites :
 * reconnaître un payload plat à sa clé `actors` faisait lire
 * `readRecord(payload.object)` = `{}` et **jetait les 29 autres clés en
 * silence** (id, name, location, contacts, opening_times…). Effet mesuré sur
 * l'export Excel : dès qu'une colonne acteur est cochée — ou sur le préréglage
 * « Complet » d'un superuser — la projection inclut `actors`, la clé apparaît,
 * et le classeur sort avec des lignes vides sans la moindre erreur. Et comme
 * `omit_empty` retire la clé sur une fiche sans lien acteur, c'était PAR LIGNE :
 * ~764 fiches sur 846 portent un lien acteur.
 */
function isDeepPayload(value: unknown): value is DeepObjectPayload {
  if (!isRecord(value)) {
    return false;
  }

  return 'object' in value;
}

export function normalizeObjectDetailPayload(payload: unknown, fallbackObjectId: string): ObjectDetail {
  if (isDeepPayload(payload)) {
    const objectPayload = readRecord(payload.object);
    const mergedRaw: ObjectRecord = {
      ...objectPayload,
      // §213 — le leg GARDÉ (celui de `get_object_resource`, sous `object`) prime
      // TOUJOURS. La clé `actors` de l'enveloppe était un duplicata non gardé, et
      // cette ligne la préférait : elle ÉCRASAIT le caviardage §208 (prénom, nom,
      // genre, note) et perdait `contacts_restricted`, donc l'éditeur laissait le
      // champ note actif pour un appelant restreint. Le duplicata est supprimé
      // côté SQL ; cet ordre de préférence est la ceinture qui empêche une base
      // pas encore à jour de rouvrir la fuite.
      actors: readArray(objectPayload.actors).length > 0 ? objectPayload.actors : payload.actors,
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
