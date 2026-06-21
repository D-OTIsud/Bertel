/**
 * Pure helpers for the object-creation dialog (B1, decision log §105).
 *
 * The type picker is derived ENTIRELY from `TYPE_ARCHETYPES` (the single source of
 * truth for object_type → archetype, = the DB enum minus ORG). A future enum value
 * added there automatically appears in the picker — no hardcoded type list here.
 */
import { TYPE_ARCHETYPES, TYPE_LABEL, ARCHETYPE_META, type ArchetypeCode } from '../archetypes';

export const MAX_OBJECT_NAME_LENGTH = 200;

export interface CreateTypeOption {
  code: string;
  label: string;
}

export interface CreateTypeGroup {
  archetype: ArchetypeCode;
  codeName: string;
  family: string;
  types: CreateTypeOption[];
}

/** Grouped, stably-sorted creatable types for the picker (enum minus ORG). */
export function buildCreateTypeOptions(): CreateTypeGroup[] {
  const byArchetype = new Map<ArchetypeCode, CreateTypeOption[]>();
  for (const [code, meta] of Object.entries(TYPE_ARCHETYPES)) {
    const list = byArchetype.get(meta.archetype) ?? [];
    list.push({ code, label: TYPE_LABEL[code] ?? code });
    byArchetype.set(meta.archetype, list);
  }
  return [...byArchetype.entries()]
    .map(([archetype, types]) => ({
      archetype,
      codeName: ARCHETYPE_META[archetype].codeName,
      family: ARCHETYPE_META[archetype].family,
      types: [...types].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    }))
    .sort((a, b) => a.codeName.localeCompare(b.codeName, 'fr'));
}

/** Client-side validation for the create form (server RPC re-validates as the real gate). */
export function validateCreateObjectInput(input: { type: string; name: string }): {
  ok: boolean;
  errors: { type?: string; name?: string };
} {
  const errors: { type?: string; name?: string } = {};
  if (!input.type || !(input.type in TYPE_ARCHETYPES)) {
    errors.type = 'Choisissez un type de fiche.';
  }
  const name = input.name.trim();
  if (!name) {
    errors.name = 'Le nom est obligatoire.';
  } else if (name.length > MAX_OBJECT_NAME_LENGTH) {
    errors.name = `Le nom ne peut pas dépasser ${MAX_OBJECT_NAME_LENGTH} caractères.`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
